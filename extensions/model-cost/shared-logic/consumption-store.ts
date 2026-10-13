/**
 * The consumption store: the extension's active consumption document, its baseline, and the one
 * coordinated save an ordinary round's session snapshot makes.
 *
 * This module owns the business half of storage — the schema (through
 * `consumption-document.ts`), which file the document lives in, what the disk currently says,
 * the accounting period this instance is in, and what an unusable document means for the running
 * instance. It owns no coordination of its own: every write goes through the framework's one
 * safe-file entry (`updateFile`), which serializes same-document writes in this process and takes
 * the cross-process lock, re-reads the document inside that scope and publishes the returned
 * document atomically. There is no second write path, no synchronous twin, and no
 * consumption-specific lock, timeout or per-file path configuration.
 *
 * The instance's state is the baseline it last loaded and the records it last committed, which is
 * what its read-only answers are served from; the file stays the authority rather than a cache in
 * front of it. A session snapshot is committed by {@link ConsumptionStore.commit}, which decides
 * inside the coordinated scope against the document really on disk:
 *
 * - The snapshot's accounting period is the instance's own. A file whose `periodId` is another
 *   generation is a refusal (`stale-period`): an old instance cannot revive consumption into a
 *   period a reset already replaced, and the file is left exactly as it was.
 * - Inside that period the snapshot's `saveVersion` is compared per harness and session id: older
 *   is refused (`stale-version`); the same version is idempotent when it carries the same business
 *   content and a conflict when it does not, with the disk's record surviving either way; and a
 *   greater version replaces that one record while every other record is preserved. Versions are
 *   business values, so JSON formatting and key order decide nothing, and no refusal is resolved
 *   by adding, by taking a maximum, or by letting the last writer win.
 *
 * An unusable baseline is the third outcome, and it is deliberately not a fresh start: a document
 * that is not JSON, is not this extension's format, or cannot be read leaves the instance with no
 * valid baseline, so {@link ConsumptionStore.load} answers `unusable` with the reason, the
 * instance pauses consumption accounting and saving, and every later
 * {@link ConsumptionStore.commit} answers `paused` without touching the file. Nothing guesses a
 * zero, nothing writes over what it could not read, and nothing probes or repairs the file in the
 * background: the next normal initialization is what reads it again, and an initialization that
 * finds a usable (or still absent) document clears the pause. The pause is this store's own state
 * and only this store's accounting and saving consult it — a provider measurement elsewhere in the
 * extension is not a consumption statistic and is never disabled by it.
 *
 * A snapshot the document refuses — another writer's record of the same version, an older version,
 * or a period a reset replaced — is answered with that refusal, and the document the coordinated
 * scope just read becomes this instance's baseline: the refusal was decided against the content the
 * file really holds, so that content is what this instance's next snapshot is compared to. A commit
 * that failed for a reason which does not make the baseline unusable — a wait budget that ran out, a
 * cancelled wait, an I/O failure of that one publication — is reported as that failure (`failed`)
 * and leaves the last baseline this instance read in place; what the caller then does with its own
 * unsaved consumption is not this module's decision.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FeedbackLevel } from "../../../framework/core/protocol";
import { SafeFileUpdateError, type SafeFileUpdateFailureKind, updateFile } from "../../../framework/modules/files";
import { ArchiveFailure, publishArchive } from "./consumption-archive";
import {
	CONSUMPTION_SCHEMA_VERSION,
	type ConsumptionDocument,
	type SessionRecord,
	mergeSession,
	readConsumptionDocument,
} from "./consumption-document";

/** The document's fixed file name inside the configured storage root. */
const CONSUMPTION_FILE_NAME = "consumption.json";

/** The accounting period one instance is in: the generation its snapshots belong to. */
export interface ConsumptionPeriod {
	/** The generation an accounting reset produces; an ordinary save never changes it. */
	readonly periodId: string;
	/** When this period began, as an ISO instant. */
	readonly start: string;
	/** The period's DeepSeek boundary balance, absent when no reliable reading produced one. */
	readonly startBal?: number;
	readonly holiday: boolean;
}

/** What one baseline load answered. */
export type BaselineLoad =
	| { readonly kind: "loaded" }
	| { readonly kind: "fresh" }
	| { readonly kind: "unusable"; readonly reason: string };

/** What one session snapshot's commit answered. */
export type SessionCommit =
	| { readonly kind: "saved" }
	| { readonly kind: "unchanged" }
	| { readonly kind: "conflict" }
	| { readonly kind: "stale-period" }
	| { readonly kind: "stale-version" }
	| { readonly kind: "paused" }
	| { readonly kind: "unusable"; readonly reason: string }
	| { readonly kind: "failed"; readonly failure: SafeFileUpdateFailureKind };

/** One notice this store publishes to the operator. */
export interface StoreNotice {
	readonly level: FeedbackLevel;
	readonly message: string;
}

/**
 * What one period reset answered.
 *
 * `reset` is the whole operation landing: the archive was written *and* the new activity document
 * was really published, which is the only answer that is a switch. The other answers say how far
 * the operation got and leave the file alone where it did not: `archive-failed` wrote no archive
 * (so nothing was reset), `archive-written` produced the archive but could not publish the new
 * activity, and `failed` committed nothing at all. `unusable` is the store having no valid baseline
 * to close, which is the same pause a normal save is refused under.
 */
export type PeriodReset =
	| { readonly kind: "reset"; readonly archive: string }
	| { readonly kind: "unusable"; readonly reason: string }
	| { readonly kind: "archive-failed"; readonly detail: string }
	| { readonly kind: "archive-written"; readonly archive: string; readonly failure: SafeFileUpdateFailureKind }
	| { readonly kind: "failed"; readonly failure: SafeFileUpdateFailureKind };

/**
 * What the operator is told about a baseline this instance cannot use, at the severity of an effect
 * that did not happen.
 *
 * The notice names the file and the pause, because both are what the operator has to act on: the
 * file is left for inspection rather than overwritten, and the instance stays paused until a normal
 * initialization can read a usable baseline again.
 */
export function unusableBaselineNotice(file: string, reason: string): StoreNotice {
	return {
		level: "error",
		message: `消费数据「${file}」不能作为基线读取（${reason}）；已暂停本实例的消费统计与保存，不会覆盖该文件，下次正常初始化会重新加载。`,
	};
}

/** The decisions that refuse a snapshot: what the coordinated update throws back out. */
type CommitRefusalDecision =
	| { readonly kind: "conflict" }
	| { readonly kind: "stale-period" }
	| { readonly kind: "stale-version" }
	| { readonly kind: "unusable"; readonly reason: string };

/** What one coordinated update decided, before it becomes a caller-visible outcome. */
type CommitDecision =
	| { readonly kind: "saved"; readonly document: ConsumptionDocument }
	| { readonly kind: "unchanged"; readonly document: ConsumptionDocument }
	| CommitRefusalDecision;

/** The refusal one coordinated update carries out of the framework's update function. */
class CommitRefusal extends Error {
	readonly decision: CommitRefusalDecision;

	constructor(decision: CommitRefusalDecision) {
		super(`model-cost: the snapshot was refused as ${decision.kind}`);
		this.name = "CommitRefusal";
		this.decision = decision;
	}
}

/** Whether one filesystem error is the absence of a file rather than a failure to read one. */
function isMissingFile(error: unknown): boolean {
	return (error as { readonly code?: unknown } | null)?.code === "ENOENT";
}

/**
 * One activity document holding no session at all.
 *
 * It is the shape a period's first write and a period reset both publish, and the shape a root
 * holding no document is read as: a period's own generation and start, its boundary balance when
 * one was read, its holiday fact, and no harness bucket yet.
 */
function emptyActivity(period: ConsumptionPeriod): ConsumptionDocument {
	return {
		schemaVersion: CONSUMPTION_SCHEMA_VERSION,
		periodId: period.periodId,
		start: period.start,
		...(period.startBal === undefined ? {} : { start_bal: period.startBal }),
		holiday: period.holiday,
		harnesses: {},
	};
}

/**
 * The extension's active consumption document, as one instance of the extension sees it.
 *
 * Construction takes the already-resolved absolute storage root: resolving the declared
 * `storageDir` is the configuration entry's business (`storage-root.ts`), and this class never
 * sees a relative path, a `~` or a working directory. It creates no file and writes nothing until a
 * session's snapshot is committed.
 */
export class ConsumptionStore {
	/** The absolute root every file of this extension's data lives under. */
	readonly storageDirectory: string;
	/** The absolute path of the active consumption document inside that root. */
	readonly consumptionFile: string;

	#period: ConsumptionPeriod | undefined;
	#records = new Map<string, Map<string, SessionRecord>>();
	#pauseReason: string | undefined;

	constructor(storageDirectory: string) {
		this.storageDirectory = storageDirectory;
		this.consumptionFile = join(storageDirectory, CONSUMPTION_FILE_NAME);
	}

	/** The accounting period this instance is in, or `undefined` while it has no valid baseline. */
	period(): ConsumptionPeriod | undefined {
		return this.#period;
	}

	/** Why this instance paused consumption accounting and saving, or `undefined` when it did not. */
	pauseReason(): string | undefined {
		return this.#pauseReason;
	}

	/** One harness's session records, as this instance last loaded or committed them. */
	sessions(harness: string): readonly SessionRecord[] {
		return [...(this.#records.get(harness)?.values() ?? [])];
	}

	/** One session's record, or `undefined` when this instance holds none for that identity. */
	session(harness: string, id: string): SessionRecord | undefined {
		return this.#records.get(harness)?.get(id);
	}

	/**
	 * Load the baseline a normal initialization runs with: the document the file holds now, or a
	 * fresh period when the root holds no document yet.
	 *
	 * The root directory is created when it does not exist, because the framework's file module
	 * publishes into an existing directory and never creates one — a first save must have a place to
	 * land. A document that exists but cannot be read, cannot be parsed, or is not this extension's
	 * schema pauses the instance and is answered with the reason; nothing is written to it, and the
	 * in-memory baseline is left empty rather than guessed.
	 */
	async load(): Promise<BaselineLoad> {
		let text: string;
		try {
			await mkdir(this.storageDirectory, { recursive: true });
			text = await readFile(this.consumptionFile, "utf8");
		} catch (error) {
			if (isMissingFile(error)) {
				this.#adoptFresh();
				return { kind: "fresh" };
			}
			return this.#pause(`无法读取（${error instanceof Error ? error.message : String(error)}）`);
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (error) {
			return this.#pause(`不是 JSON 文档（${error instanceof Error ? error.message : String(error)}）`);
		}
		const read = readConsumptionDocument(parsed);
		if (read.kind === "unusable") return this.#pause(read.reason);
		this.#adopt(read.document);
		return { kind: "loaded" };
	}

	/**
	 * Commit one session's snapshot of its own consumption, through the framework's coordinated
	 * read-modify-publish.
	 *
	 * The decision is made against the document the file really holds at that moment, inside the
	 * coordination scope, so a record another process committed in between is preserved and no
	 * update is ever built on a stale read. While the instance is paused the snapshot is not written
	 * at all, and the file is not even opened.
	 *
	 * A refusal leaves the file exactly as it was, and the document that refusal was decided against
	 * becomes this instance's baseline: a record another writer holds, an older version and a period
	 * a reset replaced are each a fact about the file, so the instance goes on from the file's own
	 * snapshot rather than from the one it held when it built the refused snapshot.
	 */
	async commit(harness: string, record: SessionRecord): Promise<SessionCommit> {
		if (this.#pauseReason !== undefined) return { kind: "paused" };
		const period = this.#period;
		if (period === undefined) {
			throw new Error("model-cost: a session snapshot was committed before the store loaded a baseline");
		}

		let unchanged = false;
		/** The document the coordinated scope read, which a refusal makes this instance's baseline. */
		let current: unknown;
		try {
			const document = await updateFile<ConsumptionDocument>(this.consumptionFile, read => {
				current = read;
				const decision = this.#decide(read, period, harness, record);
				if (
					decision.kind === "conflict" ||
					decision.kind === "stale-period" ||
					decision.kind === "stale-version" ||
					decision.kind === "unusable"
				) {
					throw new CommitRefusal(decision);
				}
				unchanged = decision.kind === "unchanged";
				return decision.document;
			});
			this.#adopt(document);
			return unchanged ? { kind: "unchanged" } : { kind: "saved" };
		} catch (error) {
			if (error instanceof CommitRefusal) {
				const decision = error.decision;
				if (decision.kind === "unusable") return this.#pause(decision.reason);
				this.#rebase(current);
				return { kind: decision.kind };
			}
			if (error instanceof SafeFileUpdateError) {
				// A document that is not JSON is no more usable than one that is not this schema: the
				// baseline is gone, so the instance pauses instead of publishing over it.
				if (error.kind === "corrupt") return this.#pause("不是 JSON 文档");
				return { kind: "failed", failure: error.kind };
			}
			throw error;
		}
	}

	/**
	 * Close this period and open the next one: archive the activity document the file holds, then
	 * publish a fresh one in its place.
	 *
	 * The whole operation happens inside one coordinated scope of the activity document, which is
	 * what makes the archive the document that was *really* replaced rather than a read taken beside
	 * the replacement: the document is read, the archive is written from that very read, and only
	 * then is the new activity published. The archive therefore precedes the reset — a reset that
	 * could not archive one is not performed at all — and a reset whose publish failed leaves the
	 * archive behind as the record of the period it closed.
	 *
	 * What is archived is only what the file holds: nothing this instance accumulated and has not
	 * saved is collected, no session is forced to save first, and no round is closed on the way. A
	 * root holding no document at all holds a fresh period rather than an unusable one, so it is
	 * closed as the empty activity it is.
	 *
	 * The new document carries a new generation, the same instant as the archive's `end`, the one
	 * boundary balance reading (when the caller's query produced one) as its `start_bal`, the
	 * holiday fact the caller asked for and no session at all; this instance adopts it, so its own
	 * period is the one it just published and every later snapshot belongs to that generation.
	 */
	async reset(inputs: {
		/** Whether the period this reset opens is a holiday period. */
		readonly holiday: boolean;
		/** The boundary balance reading, used for the closed period's `end_bal` and the new `start_bal`. */
		readonly endBal?: number;
		/** When this period ended, on the process's own clock (epoch milliseconds). */
		readonly at: number;
	}): Promise<PeriodReset> {
		if (this.#pauseReason !== undefined) return { kind: "unusable", reason: this.#pauseReason };
		const period = this.#period;
		if (period === undefined) {
			throw new Error("model-cost: a period reset was requested before the store loaded a baseline");
		}
		const end = new Date(inputs.at).toISOString();
		/** The archive this coordinated scope has written, which a failed publish leaves in place. */
		let archive: string | undefined;
		try {
			const document = await updateFile<ConsumptionDocument>(this.consumptionFile, async current => {
				const read = readConsumptionDocument(current);
				// A document this instance cannot read is not a period to close: the scope refuses
				// instead of archiving a guess or publishing over text it does not understand. A root
				// holding no document holds this instance's own fresh period, which is closed as it is.
				const closed = read.kind === "document" ? read.document : current === undefined ? emptyActivity(period) : undefined;
				if (closed === undefined) {
					throw new CommitRefusal({
						kind: "unusable",
						reason: read.kind === "unusable" ? read.reason : "不是本扩展的活动文档",
					});
				}
				archive = await publishArchive(this.storageDirectory, {
					...closed,
					end,
					...(inputs.endBal === undefined ? {} : { end_bal: inputs.endBal }),
				});
				return emptyActivity({
					periodId: randomUUID(),
					start: end,
					...(inputs.endBal === undefined ? {} : { startBal: inputs.endBal }),
					holiday: inputs.holiday,
				});
			});
			this.#adopt(document);
			if (archive === undefined) {
				// Unreachable: the coordinated scope publishes the new document only after it wrote the
				// archive, so an update that resolved carries one.
				throw new Error("model-cost: a period reset resolved without an archive");
			}
			return { kind: "reset", archive };
		} catch (error) {
			if (error instanceof CommitRefusal) {
				const decision = error.decision;
				if (decision.kind === "unusable") return this.#pause(decision.reason);
				throw error;
			}
			if (error instanceof ArchiveFailure) return { kind: "archive-failed", detail: error.message };
			if (error instanceof SafeFileUpdateError) {
				// The archive is the record of the period this attempt closed: it is kept, and the
				// answer says the new activity never landed rather than reporting a reset.
				if (archive !== undefined) return { kind: "archive-written", archive, failure: error.kind };
				if (error.kind === "corrupt") return this.#pause("不是 JSON 文档");
				return { kind: "failed", failure: error.kind };
			}
			throw error;
		}
	}

	/** What one snapshot does to the document the coordinated scope just read. */
	#decide(current: unknown, period: ConsumptionPeriod, harness: string, record: SessionRecord): CommitDecision {
		if (current === undefined) {
			// The root held no document when this commit began: this period's first save is what
			// creates it, carrying the record that is being committed.
			return {
				kind: "saved",
				document: {
					schemaVersion: CONSUMPTION_SCHEMA_VERSION,
					periodId: period.periodId,
					start: period.start,
					...(period.startBal === undefined ? {} : { start_bal: period.startBal }),
					holiday: period.holiday,
					harnesses: { [harness]: { sessions: [record] } },
				},
			};
		}
		const read = readConsumptionDocument(current);
		if (read.kind === "unusable") return { kind: "unusable", reason: read.reason };
		if (read.document.periodId !== period.periodId) return { kind: "stale-period" };
		const merge = mergeSession(read.document, harness, record);
		switch (merge.kind) {
			case "stale-version":
				return { kind: "stale-version" };
			case "conflict":
				return { kind: "conflict" };
			case "unchanged":
				return { kind: "unchanged", document: merge.document };
			case "updated":
				return { kind: "saved", document: merge.document };
		}
	}

	/** This instance's state made from one document: its period, its records, and no pause. */
	#adopt(document: ConsumptionDocument): void {
		this.#period = {
			periodId: document.periodId,
			start: document.start,
			...(document.start_bal === undefined ? {} : { startBal: document.start_bal }),
			holiday: document.holiday,
		};
		const records = new Map<string, Map<string, SessionRecord>>();
		for (const [harness, bucket] of Object.entries(document.harnesses)) {
			records.set(harness, new Map(bucket.sessions.map(session => [session.id, session])));
		}
		this.#records = records;
		this.#pauseReason = undefined;
	}

	/** A period that begins now, with no session in it: what a root holding no document means. */
	#adoptFresh(): void {
		this.#period = { periodId: randomUUID(), start: new Date().toISOString(), holiday: false };
		this.#records = new Map();
		this.#pauseReason = undefined;
	}

	/**
	 * This instance's baseline made from the document a refusal was decided against, which is the
	 * file's current valid snapshot. A value that is not this schema is left alone: a refusal that
	 * could not read the document is answered by the pause instead, and nothing is guessed here.
	 */
	#rebase(current: unknown): void {
		const read = readConsumptionDocument(current);
		if (read.kind === "document") this.#adopt(read.document);
	}

	/**
	 * The instance paused on an unusable baseline: no period, no records, and the reason kept for
	 * the operator and for every later commit that is refused because of it.
	 */
	#pause(reason: string): { readonly kind: "unusable"; readonly reason: string } {
		this.#period = undefined;
		this.#records = new Map();
		this.#pauseReason = reason;
		return { kind: "unusable", reason };
	}
}
