/**
 * The frozen representative efficiency baseline of the model-cost common path.
 *
 * This entry runs the migration's representative event sequences — a main request, several Turns in
 * one Round, a main session beside concurrent subagents, an ordinary save onto a shared document, a
 * read-only refresh, a healthy idle window and a disposal — over whichever production common path runs
 * it, and records what each sequence cost. The frozen pre-migration run of it is
 * `evidence/01-efficiency-baseline.json`; those records are the evidence a later comparison reads, and
 * `P51` re-runs this same entry after the shared path changes, which is why the sequences, the sampling
 * method and the artifact are fixed here rather than reconstructed afterwards.
 *
 * **The path under measurement is production.** The extension's real definition
 * (`extensions/model-cost/definition.ts`), the runtime `createModelCostRuntime` builds, the
 * framework's own public binding (the port double, `tests/framework/support/harness-port-double.ts`)
 * and the extension's own frontend (`attachModelCostWidget`) composed into the binding's cleanup the
 * way `extensions/model-cost/harnesses/omp.ts` composes it. Nothing of the repository is modified to
 * sample it: the file operations come from the instrument imported first below, which wraps this
 * runtime's own `fs`/`fs/promises` exports, and the provider requests are real HTTP calls the
 * extension's own provider access points at a loopback endpoint.
 *
 * Five costs are recorded per sequence, each with the method that produced it:
 *
 * - **reads** — the coordinated update reading a document (`readFile` of `consumption.json` /
 *   `codex-usage-estimate.json`), counted apart from the metadata calls the same update makes
 *   (`realpath`, `stat`, `readdir`). A read of a document that is not there yet — the first load's, and
 *   the ordinary read a first save makes inside its lock — is a read the path really paid for and is
 *   counted here; it settles as a failure and appears in the `fail` column too.
 * - **locks** — every file operation naming a cross-process lock path (the `<document>.lock` name an
 *   install takes, the staging directory an install prepares beside it, and the entries inside either).
 * - **publishes** — the atomic replacement of a document (`rename` onto it), the one step that makes a
 *   save visible to another process. Only a rename that really replaced the name counts: this platform
 *   refuses that step while a reader holds the name open, the coordinating module retries it, and an
 *   attempt that settled as a failure is counted in the `fail` column instead — so `locks` and `fail`
 *   together state the contention a window really paid for.
 * - **requests** — provider HTTP requests, counted at the loopback endpoint over the extension's own
 *   access facts, which never see the counter.
 * - **failures** — the calls of a window that settled as failures, by operation: a read of a document
 *   that does not exist yet, a removal of a name an earlier step already removed, and a publication
 *   rename this platform refused while a reader held the name open. They are cost, not damage: the
 *   same count is what a retried publication paid, and no count here is a failure of the extension's
 *   own business (every sequence states its own expectations beside them).
 * - **events** — the semantic deliveries the driver made into the framework for that sequence (one
 *   per user input, Turn edge, Round edge, session fact and command invocation), together with the
 *   widget drawings and provider queries the sequence's own work caused.
 *
 * Each sequence's file cost is attributed by path: every recorded operation whose path lies under
 * that sequence's isolated storage root belongs to it, and the path decides the bucket. The sampler's
 * own operations are never charged to a window — its read-back of a document, its polling for a quiet
 * root, and the document a sequence is seeded with — and neither is anything outside a storage root:
 * the artifact write and the run directories.
 *
 * **One request count follows the entry's own timeline.** The concurrent sequence states the instant a
 * subagent's Round ended as a move of the extension's clock (by `CHILD_ACTIVITY_MS`), because the
 * deadline a subagent's own activity contributes is the interval between its Round's two edges rather
 * than a duration declared beside it. That instant is past the declared success TTL of the process's
 * provider reading, so the first priced Turn settling after it begins one balance refresh — the shared
 * settled-request rule of `provider-balance.ts`, which is not a schedule and is not repeated while a
 * reading is fresh. The sequence's count is therefore two requests (one startup prefetch, one refresh)
 * rather than the one a timeline that never moved the clock produces; re-running the entry with that
 * move removed, or with a TTL above it, sees one.
 *
 * **The sampling method verifies itself.** The instrument is checked against the production file
 * module before any sequence runs: one ordinary coordinated update is performed over a throwaway
 * document, and the entry fails unless the instrument recorded that update's read, its lock and its
 * publish. A run whose instrument recorded nothing is refused rather than reported as a cheap
 * baseline. The probe's own figures are part of the artifact.
 *
 * **What is not measured.** The OMP adapter's native fact mapping, the host's own file traffic
 * (session JSONL, logs), the real terminal's drawing and the native subagent lifecycle belong to the
 * real host rather than to the common path; this entry drives the semantic deliveries those would map
 * into (the contract's S1). The artifact states, per sequence and as a list, which scenarios a later
 * comparison must not read off this baseline — a sequence whose native half this driver cannot
 * produce is marked `not comparable` rather than estimated, and no pi figure is invented: none exists
 * yet.
 *
 * Run it with `bun run baseline:efficiency`, which is the preload plus this entry:
 * `bun --preload ./scripts/support/efficiency-baseline-fs-instrument.ts ./scripts/efficiency-baseline.ts`.
 * The preload is what makes the instrument effective: a module's view of `node:fs/promises` is fixed
 * when the module graph is linked, so an instrument evaluated alongside this entry — however early in
 * its own import list — would already be too late for the repository's modules. Running the entry
 * without the preload is refused by the probe below rather than reported as a cheap baseline.
 */
import { type FsOperation, recordedFsOperations } from "./support/efficiency-baseline-fs-instrument";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { portDouble, type PortDouble, type RoundBoundary } from "../tests/framework/support/harness-port-double";
import { controlApi } from "../tests/model-cost/support/control-api";
import { uiBoundaryTimerOf } from "../tests/model-cost/support/ui-timer";
import { MODEL_COST } from "../extensions/model-cost/definition";
import { releasingFrontendOnCleanup } from "../extensions/model-cost/harnesses/omp";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../extensions/model-cost/harnesses/omp/widget";
import { updateFile } from "../framework/modules/files";
import { createModelCostRuntime, type ModelCostRuntime } from "../extensions/model-cost/shared-logic/runtime";
import type { OmpSessionContext } from "../adapters/omp";
import type { ConsumptionDocument, SessionRecord, TokenBuckets } from "../extensions/model-cost/shared-logic/foundation/session/consumption-document"
import type { ModelPricingData } from "../extensions/model-cost/shared-logic/business/pricing/model-data";
import type { OwnerReference } from "../framework/interface/state";
import type { SessionFacts, TurnOutcome, TurnUsage } from "../framework/interface/session";
import type { TurnSignal } from "../framework/core/protocol";

/** This repository's root: `scripts/` -> the checkout the run is attributable to. */
const REPO_ROOT = resolve(import.meta.dir, "..");

/**
 * The self-made pricing data every sequence runs on: one monetary tier, one token-only channel and
 * one allowance provider, so every amount this file states is arithmetic written here rather than a
 * price read from the repository's maintained data or from anything under measurement.
 */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { standard: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: ["openai-codex"],
	models: {
		deepseek: { "deepseek-chat": { mode: "monetary", tier: "standard" } },
		"openai-codex": { "gpt-5-codex": { mode: "token-only" } },
	},
};

/** The harness identity these records are filed under, as an assembly states its own. */
const HARNESS = "baseline-probe";

/** The two documents this extension keeps in its storage root, as its own modules name them. */
const CONSUMPTION_FILE = "consumption.json";
const CODEX_ESTIMATE_FILE = "codex-usage-estimate.json";

/** The provider this baseline authenticates, and the one it holds no access to at all. */
const PRICED_PROVIDER = "deepseek";
const UNREACHABLE_PROVIDER = "openai-codex";
const PRICED_MODEL = "deepseek-chat";
const UNREACHABLE_MODEL = "gpt-5-codex";

/** The declared TTLs the extension is configured with here, in milliseconds. */
const BALANCE_TTL_MS = 30_000;
const CODEX_QUOTA_TTL_MS = 15_000;

/**
 * The instant every sequence's clock starts at: 13:00 in the data's own +08:00 zone on an ordinary
 * workday, an hour outside the single peak window, so the tier's off-peak price is what every
 * hand-computed amount below uses.
 */
const T0 = Date.parse("2026-10-14T05:00:00.000Z");

/**
 * The usage every main-session request reports, and what one such request costs at the data's
 * off-peak tier `{2, 0.5, 8}`: `1000·2 + 8000·0.5 + 3000·8` of a million is 0.03 XTS. A session that
 * issued that request five times holds five times that figure, with five times the tokens.
 */
const MAIN_USAGE: TurnUsage = { input: 1_000, cacheRead: 8_000, cacheWrite: 0, output: 3_000, totalTokens: 12_000 };
const ONE_REQUEST_AMOUNT = 0.03;
const FIVE_REQUEST_AMOUNT = 0.15;
/** The token-only channel's own usage, which produces no monetary amount at all. */
const TOKEN_ONLY_USAGE: TurnUsage = { input: 100, cacheRead: 0, cacheWrite: 0, output: 50, totalTokens: 150 };
/**
 * The span this entry's timeline gives one subagent's own Round: the interval between that session's
 * Round opening and its ending, which is the whole of what its runtime is made of.
 */
const CHILD_ACTIVITY_MS = 360_000;
/** The tolerance every hand-computed amount is compared with: sums of doubles, stated once here. */
const AMOUNT_TOLERANCE = 1e-9;

/** The main session, and the three descendant sessions the concurrent sequence spawns. */
const MAIN: SessionFacts = { sessionId: "baseline-main", kind: "main", name: "基线主会话", unavailable: [] };
const CHILD_A: SessionFacts = {
	sessionId: "baseline-child-a",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	agentName: "task",
	agentId: "基线检索",
	taskName: "基线检索",
	name: "基线检索",
	unavailable: [],
};
const CHILD_B: SessionFacts = {
	sessionId: "baseline-child-b",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	agentName: "scout",
	agentId: "基线核查",
	taskName: "基线核查",
	name: "基线核查",
	unavailable: [],
};
const GRAND: SessionFacts = {
	sessionId: "baseline-grand",
	kind: "sub",
	parentSessionId: CHILD_A.sessionId,
	agentName: "task",
	agentId: "基线复核",
	taskName: "基线复核",
	name: "基线复核",
	unavailable: [],
};

/** The startup facts each session's own start announces, as an adapter resolves them. */
const STARTUP_MAIN: StartupFacts = { model: { provider: PRICED_PROVIDER, model: PRICED_MODEL }, effort: "high" };
const STARTUP_CHILD_A: StartupFacts = { model: { provider: PRICED_PROVIDER, model: PRICED_MODEL }, effort: "medium" };
const STARTUP_CHILD_B: StartupFacts = { model: { provider: UNREACHABLE_PROVIDER, model: UNREACHABLE_MODEL }, effort: "low" };
const STARTUP_GRAND: StartupFacts = { model: { provider: PRICED_PROVIDER, model: PRICED_MODEL }, effort: "medium" };

/** The owner every delivery of this baseline acts on: one process, one owner, one session tree. */
const OWNER: OwnerReference = { kind: "owner", key: "baseline:main" };

/** The period of the document the save sequence starts from, written here so nothing mints it. */
const SEEDED_PERIOD_ID = "period-baseline-seeded";

/** The facts a session's own start announces, as an adapter resolves them at the session's beginning. */
interface StartupFacts {
	readonly model: { readonly provider: string; readonly model: string };
	readonly effort?: string;
}

/** The extension's own clock, driven by this entry: every instant a sequence states is written here. */
let clock = T0;

/** Every temporary directory this run created, reported with the artifact and removed at the end. */
const runRoots: string[] = [];

/** One staging name the file module's own coordinator writes: a document or lock name, this process' id, a counter and a clock reading. */
const STAGING_NAME = /\.\d+-\d+-[0-9a-z]+\.(?:tmp|lock)$/;

/** The temporary document one publish writes before it replaces the target with it. */
const PUBLISH_STAGING_NAME = /\.\d+-\d+-[0-9a-z]+\.tmp$/;

/** The operation names that only read, only replace a document, only ask about one, or only touch a directory. */
const READ_OPERATIONS: Readonly<Record<string, true>> = { readFile: true, readFileSync: true };
const REPLACING_OPERATIONS: Readonly<Record<string, true>> = { rename: true, renameSync: true };
const METADATA_OPERATIONS: Readonly<Record<string, true>> = {
	realpath: true,
	realpathSync: true,
	stat: true,
	statSync: true,
	lstat: true,
	lstatSync: true,
	access: true,
	accessSync: true,
	readdir: true,
	readdirSync: true,
	existsSync: true,
};
const DIRECTORY_OPERATIONS: Readonly<Record<string, true>> = {
	mkdir: true,
	mkdirSync: true,
	rmdir: true,
	rmdirSync: true,
	rm: true,
	rmSync: true,
};

/** Which step of a coordinated document update one recorded file operation belongs to. */
type OperationBucket = "document-read" | "document-publish" | "lock" | "staging" | "metadata" | "directory" | "other";

/** What one measured window of file operations cost, by the step each operation belongs to. */
interface FileCost {
	readonly total: number;
	readonly documentReads: number;
	readonly documentPublishes: number;
	readonly lockOperations: number;
	readonly stagingOperations: number;
	readonly metadataOperations: number;
	readonly directoryOperations: number;
	readonly otherOperations: number;
	/** The calls of this window that settled as failures: a retried publication shows up here. */
	readonly failedOperations: number;
	/** Those failures by the operation that settled as one. */
	readonly failedByOperation: Readonly<Record<string, number>>;
	/** What each document of the measured scope cost, keyed by its own file name. */
	readonly documents: Readonly<Record<string, { readonly reads: number; readonly publishes: number }>>;
	readonly byOperation: Readonly<Record<string, number>>;
	/** The raw operations behind this figure, in call order: the evidence for every count above. */
	readonly operations: readonly FsOperation[];
}

/** The paths one measured window is restricted to: a storage root and the documents inside it. */
interface MeasuredScope {
	readonly root: string;
	readonly documents: readonly string[];
}

/** One measured window: what it cost, and the raw operations behind that figure. */
interface Measurement {
	readonly cost: FileCost;
	readonly operations: readonly FsOperation[];
}

/**
 * The indices of the records this entry itself made: its own read-back of a document, and the
 * document it seeds for a sequence. Both are the sampler's own work rather than the measured path's,
 * so neither is ever charged to a window.
 */
const samplerOperations = new Set<number>();

/**
 * Run one file operation of this entry's own — a read-back, or writing the document a sequence starts
 * from — and leave every record it made out of the measured windows.
 */
function asSampler<T>(operation: () => T): T {
	const before = recordedCount();
	try {
		return operation();
	} finally {
		for (let index = before; index < recordedCount(); index += 1) samplerOperations.add(index);
	}
}

/** One path under this platform's own case rules, as the file module's coordination keys fold them. */
function comparablePath(target: string): string {
	return process.platform === "win32" ? target.toLowerCase() : target;
}

/** Whether one path is the root itself or lies under it. */
function underRoot(candidate: string, root: string): boolean {
	const folded = comparablePath(candidate);
	const foldedRoot = comparablePath(root);
	return folded === foldedRoot || folded.startsWith(foldedRoot.endsWith(sep) ? foldedRoot : `${foldedRoot}${sep}`);
}

/** Whether one path is the lock name of one document, the staging directory an install prepares, or anything inside either. */
function insideLockName(candidate: string, document: string): boolean {
	const folded = comparablePath(candidate);
	const lock = comparablePath(`${document}.lock`);
	// The installed lock name, anything inside it, and the staging directory this module prepares
	// beside it (which it renames into place) with the entry it holds.
	return folded === lock || folded.startsWith(`${lock}${sep}`) || folded.startsWith(`${lock}.`);
}

/** Whether one path is the temporary document one publish writes before replacing the target. */
function isPublishStaging(candidate: string, document: string): boolean {
	if (!PUBLISH_STAGING_NAME.test(basename(candidate))) return false;
	return comparablePath(candidate).startsWith(`${comparablePath(document)}.`);
}

/**
 * Which step one recorded operation belongs to, or `undefined` when it lies outside the measured root.
 *
 * A lock operation is any operation naming the document's lock — the staging directory an install
 * prepares, the installed name, or an entry inside either — and it is tested first, because an
 * install's own rename aims at the lock name and its source is a staging directory. A publish is the
 * one operation whose destination is the document itself; a read is the one operation whose path is
 * the document itself; a staging operation is the temporary document a publish writes and removes.
 */
function bucketOf(operation: FsOperation, scope: MeasuredScope): OperationBucket | undefined {
	const target = operation.target;
	const inside = underRoot(operation.path, scope.root) || (target !== undefined && underRoot(target, scope.root));
	if (!inside) return undefined;
	for (const document of scope.documents) {
		if (insideLockName(operation.path, document)) return "lock";
		if (target !== undefined && insideLockName(target, document)) return "lock";
		if (REPLACING_OPERATIONS[operation.op] === true && target !== undefined && comparablePath(target) === comparablePath(document)) {
			return "document-publish";
		}
		if (READ_OPERATIONS[operation.op] === true && comparablePath(operation.path) === comparablePath(document)) {
			return "document-read";
		}
		if (isPublishStaging(operation.path, document)) return "staging";
		if (isPublishStaging(target ?? "", document)) return "staging";
	}
	if (STAGING_NAME.test(basename(operation.path))) return "staging";
	if (target !== undefined && STAGING_NAME.test(basename(target))) return "staging";
	if (METADATA_OPERATIONS[operation.op] === true) return "metadata";
	if (DIRECTORY_OPERATIONS[operation.op] === true) return "directory";
	return "other";
}

/**
 * The instrument's records, or a refusal when no instrument ran in this process.
 *
 * The probe below already checked that the instrument really records a coordinated update; this is
 * the same refusal for the case where the module was never installed at all, so no figure is ever
 * reported from a process nothing was recording.
 */
function instrumentRecords(): readonly FsOperation[] {
	const recorded = recordedFsOperations();
	if (recorded === undefined) {
		throw new Error(
			"efficiency-baseline: the file-system instrument is not installed in this process; run the entry as `bun run baseline:efficiency`.",
		);
	}
	return recorded;
}

/** The operations recorded so far, as this entry reads them. */
function recordedCount(): number {
	return instrumentRecords().length;
}

/**
 * The file cost of the operations recorded since `start`, restricted to one measured scope and with
 * this entry's own read-back left out. The records are the instrument's own, read in call order.
 */
function measureSince(start: number, scope: MeasuredScope): Measurement {
	const recorded = instrumentRecords();
	const operations: FsOperation[] = [];
	const byOperation: Record<string, number> = {};
	const documents: Record<string, { reads: number; publishes: number }> = {};
	for (const document of scope.documents) documents[basename(document)] = { reads: 0, publishes: 0 };
	let documentReads = 0;
	let documentPublishes = 0;
	let lockOperations = 0;
	let stagingOperations = 0;
	let metadataOperations = 0;
	let directoryOperations = 0;
	let otherOperations = 0;
	let failedOperations = 0;
	const failedByOperation: Record<string, number> = {};
	for (let index = start; index < recorded.length; index += 1) {
		if (samplerOperations.has(index)) continue;
		const operation = recorded[index]!;
		const bucket = bucketOf(operation, scope);
		if (bucket === undefined) continue;
		operations.push(operation);
		byOperation[operation.op] = (byOperation[operation.op] ?? 0) + 1;
		if (operation.outcome === "failed") {
			failedOperations += 1;
			failedByOperation[operation.op] = (failedByOperation[operation.op] ?? 0) + 1;
		}
		const named = scope.documents.find(
			candidate =>
				comparablePath(candidate) === comparablePath(operation.path) ||
				(operation.target !== undefined && comparablePath(candidate) === comparablePath(operation.target)),
		);
		const bucket0 = named === undefined ? undefined : documents[basename(named)];
		switch (bucket) {
			case "document-read":
				documentReads += 1;
				if (bucket0 !== undefined) bucket0.reads += 1;
				break;
			case "document-publish":
				// Only a rename that really replaced the name is a publication; an attempt this platform
				// refused is a recorded call and a failure, never a save.
				if (operation.outcome === "failed") break;
				documentPublishes += 1;
				if (bucket0 !== undefined) bucket0.publishes += 1;
				break;
			case "lock":
				lockOperations += 1;
				break;
			case "staging":
				stagingOperations += 1;
				break;
			case "metadata":
				metadataOperations += 1;
				break;
			case "directory":
				directoryOperations += 1;
				break;
			case "other":
				otherOperations += 1;
				break;
		}
	}
	return {
		cost: {
			total: operations.length,
			documentReads,
			documentPublishes,
			lockOperations,
			stagingOperations,
			metadataOperations,
			directoryOperations,
			otherOperations,
			failedOperations,
			failedByOperation,
			documents,
			byOperation,
			operations,
		},
		operations,
	};
}

/** One invariant a sequence's own run either satisfied or did not, stated with its evidence. */
interface Invariant {
	readonly name: string;
	readonly ok: boolean;
	readonly detail: string;
}

/** How one sequence of this baseline is comparable with a later run of the same entry. */
interface Comparability {
	readonly comparable: boolean;
	readonly note: string;
}

/** Everything one representative sequence recorded. */
interface SequenceObservation {
	readonly name: string;
	readonly title: string;
	/** The events the driver delivered, one line each, in the order it delivered them. */
	readonly sequence: readonly string[];
	readonly deliveries: Readonly<Record<string, number>>;
	/** The whole sequence's file cost: every window below, as one number. */
	readonly fileCost: FileCost;
	/** The sub-windows a sequence separates: the accumulation phase and the commit phase, say. */
	readonly windows: Readonly<Record<string, FileCost>>;
	readonly providerRequests: number;
	readonly providerRequestPaths: Readonly<Record<string, number>>;
	readonly widget: {
		readonly draws: number;
		readonly timersArmed: number;
		readonly lastLineCount: number;
	};
	readonly document: {
		readonly exists: boolean;
		readonly consumption?: ConsumptionDocument;
		readonly estimateExists: boolean;
	};
	readonly wallClockMs: number;
	readonly invariants: readonly Invariant[];
	/** Figures a sequence observed without asserting anything about them, stated for the comparison. */
	readonly evidence: Readonly<Record<string, string>>;
	readonly comparability: Comparability;
}

/** One controlled host session: the native context a frontend attaches through, and what it drew. */
interface ControlledHost {
	readonly ctx: OmpSessionContext;
	/** How many times the host was handed this extension's widget. */
	draws(): number;
	/** The lines of the last widget the host was handed, or nothing when it was cleared. */
	lastLines(): readonly string[] | undefined;
	/** How many managed timers the extension has armed and not cleared. */
	armedTimers(): number;
}

/** One scheduled timeout, as this runtime hands it back, with the way to cancel it. */
interface ScheduledTimeout {
	readonly cancel: () => void;
}

/**
 * One controlled host in this session's own terms: the timer surface is real (an armed timeout is
 * really scheduled and a cleared one really cancelled), so a disposal that leaves a wait behind is
 * observable rather than assumed, and the widget surface counts what the extension handed over.
 */
function controlledHost(session: SessionFacts, provider: string, model: string): ControlledHost {
	const timers = new Map<unknown, ScheduledTimeout>();
	let draws = 0;
	let shown: readonly string[] | undefined;
	const ctx = {
		agent: { kind: session.kind, id: session.sessionId },
		hasUI: true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: readonly string[] | undefined): void => {
				if (key !== MODEL_COST_WIDGET_KEY) return;
				draws += 1;
				shown = content;
			},
		},
		sessionManager: { getSessionId: () => session.sessionId, getBranch: () => [] },
		model: { provider, id: model },
		getViewedSession: () => ({
			sessionId: session.sessionId,
			provider,
			model,
			context: { tokens: 40_000, contextWindow: 128_000 },
		}),
		subscribeViewedSessionChanged: () => () => {},
		setTimeout: (callback: () => void, ms: number): unknown => {
			const handle: unknown = setTimeout(callback, ms);
			timers.set(handle, { cancel: () => clearTimeout(handle as NodeJS.Timeout) });
			return handle;
		},
		clearTimer: (handle: unknown): void => {
			const scheduled = timers.get(handle);
			if (scheduled === undefined) return;
			scheduled.cancel();
			timers.delete(handle);
		},
	} as unknown as OmpSessionContext;
	return {
		ctx,
		draws: () => draws,
		lastLines: () => shown,
		armedTimers: () => timers.size,
	};
}

/** One request the loopback endpoint received. */
interface CapturedRequest {
	readonly method: string;
	readonly url: string;
	readonly at: number;
}

/** One loopback endpoint answering the balance query, with every request it received. */
interface CaptureEndpoint {
	readonly baseUrl: string;
	readonly requests: readonly CapturedRequest[];
	close(): Promise<void>;
}

/** The balance document the endpoint answers with, as the provider's own protocol states it. */
const BALANCE_BODY = JSON.stringify({
	is_available: true,
	balance_infos: [{ currency: "CNY", total_balance: "42.50", granted_balance: "0.00", topped_up_balance: "42.50" }],
});

/** One loopback endpoint, answering the balance query and recording every request it received. */
async function startCaptureEndpoint(): Promise<CaptureEndpoint> {
	const requests: CapturedRequest[] = [];
	const server: Server = createServer((request, response) => {
		requests.push({ method: request.method ?? "", url: request.url ?? "", at: Date.now() });
		response.writeHead(200, { "content-type": "application/json" });
		response.end(BALANCE_BODY);
	});
	const listening = Promise.withResolvers<void>();
	server.listen(0, "127.0.0.1", () => listening.resolve());
	await listening.promise;
	const address = server.address();
	const port = typeof address === "object" && address !== null ? address.port : 0;
	return {
		baseUrl: `http://127.0.0.1:${port}`,
		requests,
		close: () => {
			const closed = Promise.withResolvers<void>();
			server.close(error => (error ? closed.reject(error) : closed.resolve()));
			return closed.promise;
		},
	};
}

/** One bound process over one isolated storage root: the production path, its driver and its host. */
interface BoundProcess {
	readonly label: string;
	readonly runRoot: string;
	readonly storageRoot: string;
	readonly consumptionFile: string;
	readonly estimateFile: string;
	readonly scope: MeasuredScope;
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly host: ControlledHost;
	readonly fire: (event: string, ctx: OmpSessionContext) => void;
	readonly deliveries: Record<string, number>;
	readonly sequence: string[];
}

/** One delivery the driver made, counted by kind and stated in the sequence's own order. */
function countDelivery(bound: BoundProcess, kind: string, note: string): void {
	bound.deliveries[kind] = (bound.deliveries[kind] ?? 0) + 1;
	bound.sequence.push(note);
}

/**
 * Bind the production common path over one isolated root and attach the production frontend to a
 * controlled host, exactly as the OMP assembly composes them: the binding's factory builds the
 * runtime, the cleanup releases the frontend, and the widget is attached once the binding was
 * admitted and the runtime exists.
 */
async function bindProcess(options: {
	readonly label: string;
	readonly endpoint: CaptureEndpoint;
	readonly session: SessionFacts;
	readonly provider: string;
	readonly model: string;
	readonly seed?: ConsumptionDocument;
}): Promise<BoundProcess> {
	const runRoot = mkdtempSync(join(tmpdir(), `model-cost-baseline-${options.label}-`));
	runRoots.push(runRoot);
	const storageRoot = join(runRoot, "storage");
	const consumptionFile = join(storageRoot, CONSUMPTION_FILE);
	const estimateFile = join(storageRoot, CODEX_ESTIMATE_FILE);
	if (options.seed !== undefined) {
		asSampler(() => {
			mkdirSync(storageRoot, { recursive: true });
			writeFileSync(consumptionFile, JSON.stringify(options.seed), "utf8");
		});
	}
	const double = portDouble();
	let runtime: ModelCostRuntime | undefined;
	let releaseFrontend: (() => void) | undefined;
	double.bind(MODEL_COST, {
		config: {
			reader: () => `storageDir: ${storageRoot}\nbalanceTtlMs: ${BALANCE_TTL_MS}\ncodexQuotaTtlMs: ${CODEX_QUOTA_TTL_MS}\n`,
		},
		factory: context => {
			runtime = createModelCostRuntime({
				session: context.session,
				config: { storageDir: storageRoot, balanceTtlMs: BALANCE_TTL_MS, codexQuotaTtlMs: CODEX_QUOTA_TTL_MS },
				configDirectory: runRoot,
				userHomeDirectory: runRoot,
				harness: HARNESS,
				data: DATA,
				now: () => clock,
				providerAccess: {
					resolve: provider =>
						Promise.resolve(
							provider === PRICED_PROVIDER
								? { baseUrl: options.endpoint.baseUrl, credential: "baseline-probe-credential" }
								: undefined,
						),
				},
			});
			return releasingFrontendOnCleanup(runtime.implementation, () => {
				releaseFrontend?.();
				releaseFrontend = undefined;
			});
		},
	});
	double.deliverSession(OWNER, { session: options.session, hasUI: true });
	// The framework's own awaitable position before a model request: the initialization — and the
	// baseline read it performs — has settled when this returns.
	await double.initiateRun(OWNER);
	const built = runtime as ModelCostRuntime;
	const host = controlledHost(options.session, options.provider, options.model);
	const { api, fire } = controlApi();
	releaseFrontend = attachModelCostWidget(api, built, uiBoundaryTimerOf(built), "lines");
	fire("session_start", host.ctx);
	return {
		label: options.label,
		runRoot,
		storageRoot,
		consumptionFile,
		estimateFile,
		scope: { root: storageRoot, documents: [consumptionFile, estimateFile] },
		runtime: built,
		double,
		host,
		fire,
		deliveries: {},
		sequence: [],
	};
}

/** One session's own start, as its binding announces it, followed by that session's Round opening. */
function startSession(bound: BoundProcess, session: SessionFacts, startup: StartupFacts): void {
	bound.double.deliverSession(OWNER, {
		event: { kind: "session_start", reason: "initial" },
		session: { ...session, startup, unavailable: [] },
		hasUI: true,
	});
	countDelivery(bound, "session_start", `session_start ${session.sessionId} (${session.kind})`);
	startRound(bound, session);
}

/** One Round opening for one actual session. */
function startRound(bound: BoundProcess, session: SessionFacts): void {
	bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session, hasUI: true });
	countDelivery(bound, "round_start", `round_start ${session.sessionId}`);
}

/** One Round ending for one actual session: the boundary whose end commits that session's snapshot. */
function endRound(bound: BoundProcess, session: SessionFacts): RoundBoundary {
	const boundary = bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session, hasUI: true });
	countDelivery(bound, "round_end", `round_end ${session.sessionId}`);
	return boundary;
}

/** One input the harness itself attributed to the user. */
function submitInput(bound: BoundProcess, session: SessionFacts): void {
	bound.double.deliverUserInput(OWNER, { session, hasUI: true });
	countDelivery(bound, "user_input", `user_input ${session.sessionId}`);
}

/** One request of one session: its start at `at`, and its settled response one minute later. */
function requestPair(
	bound: BoundProcess,
	session: SessionFacts,
	at: number,
	provider: string,
	model: string,
	usage: TurnUsage,
	outcome: TurnOutcome = "completed",
): void {
	const started: TurnSignal = { kind: "request_started", session, at, provider, model };
	const settled: TurnSignal = { kind: "response_settled", session, at: at + 60_000, outcome, readings: [usage] };
	bound.double.deliverTurn(started, { owner: OWNER, hasUI: true });
	bound.double.deliverTurn(settled, { owner: OWNER, hasUI: true });
	countDelivery(bound, "turn_start", `turn_start ${session.sessionId} ${provider}/${model}`);
	countDelivery(bound, "turn_end", `turn_end ${session.sessionId} ${outcome}`);
}

/** One document read by this entry for its own evidence, left out of every measured window. */
function readDocumentEvidence(file: string): ConsumptionDocument | undefined {
	return asSampler(() => {
		if (!existsSync(file)) return undefined;
		return JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
	});
}

/**
 * Wait until the document holds what a sequence expects of it *and* the coordination that wrote it is
 * over, and answer with what the document holds.
 *
 * A Round's own end is dispatched the way the framework dispatches a semantic handler — without
 * waiting for the promise it returns — so the save it drives lands a few event-loop turns later. The
 * content becoming visible is not yet the end of the update: the coordinating call still removes its
 * temporary file and releases its lock after that. A window that opened there would charge the next
 * sequence for the previous commit's tail, so the wait is on both facts: the expected content, and a
 * storage root with no lock name and no staging name left in it. The wait is on those facts rather
 * than on a duration, and the deadline only keeps a save that never happened from hanging the run.
 */
async function waitForCommit(bound: BoundProcess, accept: (document: ConsumptionDocument) => boolean): Promise<ConsumptionDocument> {
	const deadline = Date.now() + 5_000;
	for (;;) {
		const document = readDocumentEvidence(bound.consumptionFile);
		if (document !== undefined && accept(document) && coordinationIsIdle(bound)) return document;
		if (Date.now() > deadline) {
			throw new Error(`no committed consumption document the sequence expects was published at ${bound.consumptionFile}`);
		}
		const turn = Promise.withResolvers<void>();
		setImmediate(() => turn.resolve());
		await turn.promise;
	}
}

/**
 * Wait until the loopback endpoint has received `count` requests in this sequence, and answer whether
 * it did.
 *
 * A refresh a settled request begins is background work — the caller that triggered it is not made to
 * wait for it — so the request is on its way when the sequence's own deliveries are over but may not
 * have arrived yet. A count read at once would then be a race rather than a measurement; this waits on
 * the arrival itself, and the deadline only keeps a query that never left from hanging the run.
 */
async function waitForRequestArrival(endpoint: CaptureEndpoint, count: number): Promise<boolean> {
	const deadline = Date.now() + 2_000;
	while (endpoint.requests.length < count) {
		if (Date.now() > deadline) return false;
		const turn = Promise.withResolvers<void>();
		setImmediate(() => turn.resolve());
		await turn.promise;
	}
	return true;
}

/**
 * Whether one storage root currently holds no coordination state at all: no lock name (an installed
 * lock or a staging directory prepared for one) and no staging name of a document.
 */
function coordinationIsIdle(bound: BoundProcess): boolean {
	return asSampler(() => {
		const entries = readdirSync(bound.storageRoot);
		return entries.every(entry => !entry.endsWith(".lock") && !STAGING_NAME.test(entry));
	});
}

/** One real wait, so a healthy idle window is measured against the wall clock rather than asserted. */
function sleepReal(ms: number): Promise<void> {
	const waited = Promise.withResolvers<void>();
	setTimeout(() => waited.resolve(), ms);
	return waited.promise;
}

/** One session's recorded row in one document, as the document itself carries it. */
function recordOf(document: ConsumptionDocument | undefined, session: SessionFacts): SessionRecord | undefined {
	return document?.harnesses[HARNESS]?.sessions.find(record => record.id === session.sessionId);
}

/** The amount one session's record carries for one provider and model, as the document states it. */
function amountOf(record: SessionRecord | undefined, provider: string, model: string): number | undefined {
	return record?.own[provider]?.[model]?.costCny;
}

/** The token buckets one session's record carries for one provider and model. */
function tokensOf(record: SessionRecord | undefined, provider: string, model: string): TokenBuckets | undefined {
	return record?.own[provider]?.[model]?.tokens;
}

/** Whether one hand-computed amount is what a record holds, within the stated floating-point tolerance. */
function amountIs(actual: number | undefined, expected: number): boolean {
	return actual !== undefined && Math.abs(actual - expected) <= AMOUNT_TOLERANCE;
}

/** One invariant, stated with the evidence that decided it. */
function check(name: string, ok: boolean, detail: string): Invariant {
	return { name, ok, detail };
}

/** The comparability note of a sequence whose numbers a later run of this same entry compares directly. */
const COMPARABLE_COMMON_PATH: Comparability = {
	comparable: true,
	note: "the common path (framework binding + model-cost shared logic + the production frontend composition): re-run this entry on the unified implementation and compare the same windows.",
};

/**
 * The same note for a sequence whose real-host form also carries a native half — a subagent's own
 * binding, a session's native disposal — which this driver delivers as semantic facts instead. The
 * common path's numbers stay comparable; that native half is the dock's to compare, not this entry's.
 */
const COMPARABLE_COMMON_PATH_WITH_NATIVE_HALF: Comparability = {
	comparable: true,
	note: "the common path (framework binding + model-cost shared logic + the production frontend composition): re-run this entry on the unified implementation and compare the same windows. Its native half in a real host — the spawned session's own binding, the native disposal — is driven here as semantic facts, and a comparison of that half belongs to the real-host dock runs ticket 22 owns.",
};


/** Everything one sequence reads out of a finished run, gathered in one place. */
function sequenceObservation(options: {
	readonly name: string;
	readonly title: string;
	readonly bound: BoundProcess;
	readonly startedAt: number;
	readonly moduleCost: Measurement;
	readonly windows: Readonly<Record<string, Measurement>>;
	readonly endpoint: CaptureEndpoint;
	readonly requestsBefore: number;
	readonly invariants: readonly Invariant[];
	readonly evidence?: Readonly<Record<string, string>>;
	readonly comparability: Comparability;
}): SequenceObservation {
	const requests = options.endpoint.requests.slice(options.requestsBefore);
	const paths: Record<string, number> = {};
	for (const request of requests) paths[request.url] = (paths[request.url] ?? 0) + 1;
	const windows: Record<string, FileCost> = {};
	for (const [name, measurement] of Object.entries(options.windows)) windows[name] = measurement.cost;
	const document = readDocumentEvidence(options.bound.consumptionFile);
	const lastLines = options.bound.host.lastLines();
	return {
		name: options.name,
		title: options.title,
		sequence: options.bound.sequence,
		deliveries: options.bound.deliveries,
		fileCost: options.moduleCost.cost,
		windows,
		providerRequests: requests.length,
		providerRequestPaths: paths,
		widget: {
			draws: options.bound.host.draws(),
			timersArmed: options.bound.host.armedTimers(),
			lastLineCount: lastLines?.length ?? 0,
		},
		document: {
			exists: document !== undefined,
			...(document === undefined ? {} : { consumption: document }),
			estimateExists: existsSync(options.bound.estimateFile),
		},
		wallClockMs: Date.now() - options.startedAt,
		invariants: options.invariants,
		evidence: options.evidence ?? {},
		comparability: options.comparability,
	};
}

/**
 * The first sequence: one main session's initialization, one request, its Round's end — the ordinary
 * path every other sequence is a variation of. The initialization window and the request window are
 * measured apart, so the one-time root work (the baseline read, the estimate read and the provider
 * prefetch) is never mixed with the per-request cost.
 */
async function sequenceMainRequest(endpoint: CaptureEndpoint): Promise<SequenceObservation> {
	const startedAt = Date.now();
	clock = T0;
	const requestsBefore = endpoint.requests.length;
	const start = recordedCount();
	const bound = await bindProcess({
		label: "main-request",
		endpoint,
		session: MAIN,
		provider: PRICED_PROVIDER,
		model: PRICED_MODEL,
	});
	const afterInitialization = recordedCount();
	const requestsAfterInitialization = endpoint.requests.length;
	const initialization = measureSince(start, bound.scope);

	startSession(bound, MAIN, STARTUP_MAIN);
	submitInput(bound, MAIN);
	requestPair(bound, MAIN, T0 + 60_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	endRound(bound, MAIN);
	const document = await waitForCommit(bound, candidate => recordOf(candidate, MAIN) !== undefined);
	const requestsAfterCommit = endpoint.requests.length;
	const request = measureSince(afterInitialization, bound.scope);
	const record = recordOf(document, MAIN);
	const invariants = [
		check(
			"the initialization read the baseline and the estimate, and published nothing",
			initialization.cost.documentReads === 2 &&
				initialization.cost.documentPublishes === 0 &&
				initialization.cost.documents[CODEX_ESTIMATE_FILE]?.reads === 1,
			`reads=${initialization.cost.documentReads} (consumption ${initialization.cost.documents[CONSUMPTION_FILE]?.reads}, estimate ${initialization.cost.documents[CODEX_ESTIMATE_FILE]?.reads}), publishes=${initialization.cost.documentPublishes}`,
		),
		check(
			"the initialization asked the provider once and the second source not at all",
			requestsAfterInitialization - requestsBefore === 1,
			`requests=${requestsAfterInitialization - requestsBefore} on ${endpoint.requests
				.slice(requestsBefore, requestsAfterInitialization)
				.map(captured => captured.url)
				.join(",")}`,
		),
		check(
			"the request itself asked no provider: the reading was inside its success TTL",
			requestsAfterCommit - requestsAfterInitialization === 0,
			`requests=${requestsAfterCommit - requestsAfterInitialization}`,
		),
		check(
			"the Round's end committed through one read, one lock and one publish",
			request.cost.documentReads === 1 &&
				request.cost.documentPublishes === 1 &&
				request.cost.documents[CONSUMPTION_FILE]?.publishes === 1 &&
				request.cost.lockOperations > 0,
			`reads=${request.cost.documentReads} publishes=${request.cost.documentPublishes} lockOperations=${request.cost.lockOperations} staging=${request.cost.stagingOperations}`,
		),
		check(
			"the request was priced at its own start, by this file's arithmetic",
			amountIs(amountOf(record, PRICED_PROVIDER, PRICED_MODEL), ONE_REQUEST_AMOUNT),
			`costCny=${amountOf(record, PRICED_PROVIDER, PRICED_MODEL)} expected=${ONE_REQUEST_AMOUNT}`,
		),
		check(
			"the session's startup snapshot is the model and level it began with",
			record?.startup?.model?.model === PRICED_MODEL && record?.startup?.model?.provider === PRICED_PROVIDER && record?.startup?.effort === STARTUP_MAIN.effort,
			`startup=${JSON.stringify(record?.startup)}`,
		),
	];
	return sequenceObservation({
		name: "main-request",
		title: "主请求：初始化 + 一次主会话请求 + 轮结束保存",
		bound,
		startedAt,
		moduleCost: measureSince(start, bound.scope),
		windows: { initialization, request },
		endpoint,
		requestsBefore,
		invariants,
		comparability: COMPARABLE_COMMON_PATH,
	});
}

/**
 * The second sequence: five requests inside one Round. Nothing about a request's own delivery may
 * touch the storage root — the save belongs to the Round's end — which is why the accumulation window
 * and the commit window are measured apart.
 */
async function sequenceMultiTurn(endpoint: CaptureEndpoint): Promise<SequenceObservation> {
	const startedAt = Date.now();
	clock = T0;
	const requestsBefore = endpoint.requests.length;
	const start = recordedCount();
	const bound = await bindProcess({ label: "multi-turn", endpoint, session: MAIN, provider: PRICED_PROVIDER, model: PRICED_MODEL });
	startSession(bound, MAIN, STARTUP_MAIN);
	submitInput(bound, MAIN);
	const turnsStart = recordedCount();
	const requestsBeforeTurns = endpoint.requests.length;
	for (let index = 0; index < 5; index += 1) {
		requestPair(bound, MAIN, T0 + 60_000 + index * 60_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	}
	const turns = measureSince(turnsStart, bound.scope);
	const requestsAfterTurns = endpoint.requests.length;
	const commitStart = recordedCount();
	endRound(bound, MAIN);
	const document = await waitForCommit(bound, candidate =>
		amountIs(amountOf(recordOf(candidate, MAIN), PRICED_PROVIDER, PRICED_MODEL), FIVE_REQUEST_AMOUNT),
	);
	const commit = measureSince(commitStart, bound.scope);
	const record = recordOf(document, MAIN);
	const tokens = tokensOf(record, PRICED_PROVIDER, PRICED_MODEL);
	const invariants = [
		check(
			"five Turns cost the storage root nothing at all",
			turns.cost.total === 0,
			`fileOperations=${turns.cost.total} (reads=${turns.cost.documentReads}, metadata=${turns.cost.metadataOperations})`,
		),
		check(
			"five Turns asked the provider nothing",
			requestsAfterTurns - requestsBeforeTurns === 0,
			`requests=${requestsAfterTurns - requestsBeforeTurns}`,
		),
		check(
			"the whole Round committed through exactly one publish",
			commit.cost.documents[CONSUMPTION_FILE]?.publishes === 1 && commit.cost.documents[CONSUMPTION_FILE]?.reads === 1,
			`publishes=${commit.cost.documents[CONSUMPTION_FILE]?.publishes} reads=${commit.cost.documents[CONSUMPTION_FILE]?.reads} lockOperations=${commit.cost.lockOperations}`,
		),
		check(
			"the five requests were accumulated once each, at this file's arithmetic",
			amountIs(amountOf(record, PRICED_PROVIDER, PRICED_MODEL), FIVE_REQUEST_AMOUNT) &&
				tokens?.input === 5_000 &&
				tokens?.output === 15_000 &&
				tokens?.cacheRead === 40_000,
			`costCny=${amountOf(record, PRICED_PROVIDER, PRICED_MODEL)} expected=${FIVE_REQUEST_AMOUNT} tokens=${JSON.stringify(tokens)}`,
		),
	];
	return sequenceObservation({
		name: "multi-turn",
		title: "多 Turn：一轮内五次请求，轮结束才保存",
		bound,
		startedAt,
		moduleCost: measureSince(start, bound.scope),
		windows: { turns, commit },
		endpoint,
		requestsBefore,
		invariants,
		comparability: COMPARABLE_COMMON_PATH,
	});
}

/**
 * The third sequence: one main session beside two subagents and a grandchild, interleaved the way a
 * concurrent delegation reports. Each session ends its own Round and owns its own record; the process
 * keeps one runtime, one provider prefetch and one frontend.
 */
async function sequenceConcurrentTree(endpoint: CaptureEndpoint): Promise<SequenceObservation> {
	const startedAt = Date.now();
	clock = T0;
	const requestsBefore = endpoint.requests.length;
	const start = recordedCount();
	const bound = await bindProcess({ label: "concurrent-tree", endpoint, session: MAIN, provider: PRICED_PROVIDER, model: PRICED_MODEL });
	startSession(bound, MAIN, STARTUP_MAIN);
	submitInput(bound, MAIN);
	startSession(bound, CHILD_A, STARTUP_CHILD_A);
	startSession(bound, CHILD_B, STARTUP_CHILD_B);
	requestPair(bound, MAIN, T0 + 60_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	requestPair(bound, CHILD_A, T0 + 100_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	startSession(bound, GRAND, STARTUP_GRAND);
	requestPair(bound, CHILD_B, T0 + 200_000, UNREACHABLE_PROVIDER, UNREACHABLE_MODEL, TOKEN_ONLY_USAGE);
	requestPair(bound, GRAND, T0 + 300_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	// The child's own activity runs to the instant this entry's timeline states for its end: the
	// interval between the two edges of its Round is the whole of the runtime it accumulates, so the
	// clock is moved before that Round ends rather than a duration being declared beside it.
	clock = T0 + CHILD_ACTIVITY_MS;
	endRound(bound, CHILD_A);
	endRound(bound, CHILD_B);
	endRound(bound, GRAND);
	requestPair(bound, MAIN, T0 + 540_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	endRound(bound, MAIN);
	const document = await waitForCommit(bound, candidate =>
		[MAIN, CHILD_A, CHILD_B, GRAND].every(session => recordOf(candidate, session) !== undefined),
	);
	// This sequence states the instant a subagent's Round ended as a move of the extension's own
	// clock, and that instant is past the declared success TTL of the process's provider reading. A
	// priced Turn settling after it therefore begins one balance refresh — the shared settled-request
	// rule, not a schedule — which is the sequence's second and last request. The wait is on that
	// arrival rather than on a duration, the same way the commit wait is.
	const refreshArrived = await waitForRequestArrival(endpoint, requestsBefore + 2);
	const request = measureSince(start, bound.scope);
	const mainRecord = recordOf(document, MAIN);
	const childA = recordOf(document, CHILD_A);
	const childB = recordOf(document, CHILD_B);
	const grand = recordOf(document, GRAND);
	const invariants = [
		check(
			"the process asked the provider once at startup and once more when its stated clock passed the reading's success TTL",
			refreshArrived &&
				endpoint.requests.length - requestsBefore === 2 &&
				endpoint.requests.slice(requestsBefore).every(request => request.url === "/user/balance"),
			`requests=${endpoint.requests.length - requestsBefore} (one startup prefetch, one settled-request refresh due ${CHILD_ACTIVITY_MS}ms after the reading) paths=${endpoint.requests
				.slice(requestsBefore)
				.map(request => request.url)
				.join(",")}`,
		),
		check(
			"each session's own Round end published one record",
			request.cost.documents[CONSUMPTION_FILE]?.publishes === 4 && request.cost.documents[CONSUMPTION_FILE]?.reads === 5,
			`publishes=${request.cost.documents[CONSUMPTION_FILE]?.publishes} reads=${request.cost.documents[CONSUMPTION_FILE]?.reads} (one initialization load plus one inside each of the four commits) lockOperations=${request.cost.lockOperations}`,
		),
		check(
			"a subagent's consumption is its own, and the parent's own record excludes it",
			amountIs(amountOf(mainRecord, PRICED_PROVIDER, PRICED_MODEL), 2 * ONE_REQUEST_AMOUNT) &&
				amountIs(amountOf(childA, PRICED_PROVIDER, PRICED_MODEL), ONE_REQUEST_AMOUNT) &&
				amountIs(amountOf(grand, PRICED_PROVIDER, PRICED_MODEL), ONE_REQUEST_AMOUNT),
			`main=${amountOf(mainRecord, PRICED_PROVIDER, PRICED_MODEL)} (two requests of its own) childA=${amountOf(childA, PRICED_PROVIDER, PRICED_MODEL)} grand=${amountOf(grand, PRICED_PROVIDER, PRICED_MODEL)}`,
		),
		check(
			"the token-only channel's request carries tokens and no monetary amount",
			amountOf(childB, UNREACHABLE_PROVIDER, UNREACHABLE_MODEL) === undefined &&
				tokensOf(childB, UNREACHABLE_PROVIDER, UNREACHABLE_MODEL)?.input === TOKEN_ONLY_USAGE.input,
			`costCny=${amountOf(childB, UNREACHABLE_PROVIDER, UNREACHABLE_MODEL)} tokens=${JSON.stringify(tokensOf(childB, UNREACHABLE_PROVIDER, UNREACHABLE_MODEL))}`,
		),
		check(
			"the direct parent chains are what the host reported, not by name or depth",
			childA?.parent === MAIN.sessionId && grand?.parent === CHILD_A.sessionId && childB?.parent === MAIN.sessionId,
			`childA.parent=${childA?.parent} grand.parent=${grand?.parent} childB.parent=${childB?.parent}`,
		),
		check(
			"the child's own Round's interval was recorded on its session",
			childA?.runtimeMs === CHILD_ACTIVITY_MS,
			`childA.runtimeMs=${childA?.runtimeMs} expected=${CHILD_ACTIVITY_MS}`,
		),
	];
	return sequenceObservation({
		name: "main-child-concurrency",
		title: "主子并发：主会话 + 两个子代理 + 一个孙会话，各轮独立保存",
		bound,
		startedAt,
		moduleCost: request,
		windows: { whole: request },
		endpoint,
		requestsBefore,
		invariants,
		comparability: COMPARABLE_COMMON_PATH_WITH_NATIVE_HALF,
	});
}

/**
 * The fourth sequence: an ordinary save onto a document another harness already wrote. The round end's
 * coordinated update must read the document as it is on disk, merge one record and publish it without
 * disturbing the other harness's records — the cost of a save is therefore the cost of that update.
 */
async function sequenceSaveOntoSharedDocument(endpoint: CaptureEndpoint): Promise<SequenceObservation> {
	const startedAt = Date.now();
	clock = T0;
	const requestsBefore = endpoint.requests.length;
	const start = recordedCount();
	const bound = await bindProcess({
		label: "save-shared",
		endpoint,
		session: MAIN,
		provider: PRICED_PROVIDER,
		model: PRICED_MODEL,
		seed: seededDocument(),
	});
	const adoptedPeriod = bound.runtime.storage.period()?.periodId;
	startSession(bound, MAIN, STARTUP_MAIN);
	submitInput(bound, MAIN);
	requestPair(bound, MAIN, T0 + 60_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	endRound(bound, MAIN);
	const document = await waitForCommit(bound, candidate => recordOf(candidate, MAIN) !== undefined);
	const whole = measureSince(start, bound.scope);
	const otherRecord = document.harnesses["other-harness"]?.sessions.find(record => record.id === "other-1");
	const invariants = [
		check(
			"the document another harness wrote was adopted as the baseline, not replaced",
			adoptedPeriod === SEEDED_PERIOD_ID,
			`periodId=${adoptedPeriod} expected=${SEEDED_PERIOD_ID}`,
		),
		check(
			"the save cost one coordinated read-modify-publish after the initialization's own load",
			whole.cost.documents[CONSUMPTION_FILE]?.reads === 2 &&
				whole.cost.documents[CONSUMPTION_FILE]?.publishes === 1 &&
				whole.cost.lockOperations > 0,
			`reads=${whole.cost.documents[CONSUMPTION_FILE]?.reads} (one initialization load, one inside the update) publishes=${whole.cost.documents[CONSUMPTION_FILE]?.publishes} lockOperations=${whole.cost.lockOperations}`,
		),
		check(
			"the other harness's record survived the save unchanged",
			otherRecord !== undefined &&
				otherRecord.saveVersion === 4 &&
				amountIs(otherRecord.own[PRICED_PROVIDER]?.[PRICED_MODEL]?.costCny, 0.0005),
			`other-1=${JSON.stringify(otherRecord?.own)} saveVersion=${otherRecord?.saveVersion}`,
		),
		check(
			"the save added this harness's record only",
			document.harnesses[HARNESS]?.sessions.length === 1 && document.harnesses[HARNESS]?.sessions[0]?.id === MAIN.sessionId,
			`harnesses=${Object.keys(document.harnesses).join(",")} own=${document.harnesses[HARNESS]?.sessions.length}`,
		),
	];
	return sequenceObservation({
		name: "save-onto-shared-document",
		title: "保存：在另一个 harness 的文档上做一次普通合并提交",
		bound,
		startedAt,
		moduleCost: whole,
		windows: { whole },
		endpoint,
		requestsBefore,
		invariants,
		comparability: COMPARABLE_COMMON_PATH,
	});
}

/** The document the save sequence starts from: another harness's own record, written by this file. */
function seededDocument(): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: SEEDED_PERIOD_ID,
		start: "2026-10-13T16:00:00.000Z",
		holiday: false,
		harnesses: {
			"other-harness": {
				sessions: [
					{
						id: "other-1",
						name: "另一个 harness 的会话",
						parent: null,
						saveVersion: 4,
						own: {
							[PRICED_PROVIDER]: {
								[PRICED_MODEL]: {
									tokens: { input: 10, cacheRead: 0, cacheWrite: 0, output: 20 },
									costCny: 0.0005,
								},
							},
						},
					},
				],
			},
		},
	};
}

/**
 * The fifth sequence: a read-only refresh with uncommitted consumption in memory. Every projection the
 * operator can ask for — the display result, the balance and allowance readings, the accrued line, the
 * frontend's redraw, the entry's own `/budget detail` and a rename fact — must leave the storage root
 * alone and must not force the pending snapshot out to disk.
 *
 * The external half of a read refresh (adopting another writer's committed document) has no
 * implementation on either harness at this baseline, so this sequence records the half that exists:
 * the read-only work's own cost, which is the part a later change could make expensive.
 */
async function sequenceReadOnlyRefresh(endpoint: CaptureEndpoint): Promise<SequenceObservation> {
	const startedAt = Date.now();
	clock = T0;
	const requestsBefore = endpoint.requests.length;
	const start = recordedCount();
	const bound = await bindProcess({ label: "read-only-refresh", endpoint, session: MAIN, provider: PRICED_PROVIDER, model: PRICED_MODEL });
	startSession(bound, MAIN, STARTUP_MAIN);
	submitInput(bound, MAIN);
	requestPair(bound, MAIN, T0 + 60_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	const refreshStart = recordedCount();
	const requestsBeforeRefresh = endpoint.requests.length;
	const drawsBefore = bound.host.draws();
	bound.runtime.presentation.of({ sessionId: MAIN.sessionId, provider: PRICED_PROVIDER, model: PRICED_MODEL });
	bound.runtime.presentation.of({ sessionId: CHILD_A.sessionId, provider: PRICED_PROVIDER, model: PRICED_MODEL });
	bound.runtime.presentation.period();
	bound.runtime.presentation.accrued();
	bound.runtime.presentation.balance();
	bound.runtime.presentation.quota();
	bound.runtime.presentation.quotaLines(80);
	bound.runtime.view.own(MAIN.sessionId);
	bound.fire("message_end", bound.host.ctx);
	const detail = await bound.double.runToCompletion("budget", { args: "detail", hasUI: true });
	bound.double.deliverSession(OWNER, {
		event: { kind: "session_facts" },
		session: { ...MAIN, name: "基线主会话（改名）" },
		hasUI: true,
	});
	countDelivery(bound, "session_facts", "session_facts baseline-main rename");
	bound.fire("agent_end", bound.host.ctx);
	const refresh = measureSince(refreshStart, bound.scope);
	const requestsAfterRefresh = endpoint.requests.length;
	const document = readDocumentEvidence(bound.consumptionFile);
	const invariants = [
		check(
			"the whole read-only refresh cost the storage root nothing",
			refresh.cost.total === 0,
			`fileOperations=${refresh.cost.total} (reads=${refresh.cost.documentReads}, metadata=${refresh.cost.metadataOperations}, locks=${refresh.cost.lockOperations})`,
		),
		check(
			"the whole read-only refresh asked the provider nothing",
			requestsAfterRefresh - requestsBeforeRefresh === 0,
			`requests=${requestsAfterRefresh - requestsBeforeRefresh}`,
		),
		check(
			"the refresh did not commit the request that was still uncommitted",
			document === undefined,
			`consumption.json exists=${document !== undefined} (the Round is still open, so nothing may write it)`,
		),
		check(
			"the entry's own detail action was reached and answered",
			detail.feedback.length > 0,
			`feedback=${detail.feedback.map(notice => `${notice.level}:${notice.message}`).join(" | ")}`,
		),
		check(
			"the rename fact did not create a second identity",
			bound.deliveries.session_facts === 1 && bound.deliveries.session_start === 1,
			`session_facts=${bound.deliveries.session_facts} session_start=${bound.deliveries.session_start}`,
		),
	];
	return sequenceObservation({
		name: "read-only-refresh",
		title: "只读刷新：展示/读数/命令/改名，均不落盘、不请求",
		bound,
		startedAt,
		moduleCost: refresh,
		windows: { refresh },
		endpoint,
		requestsBefore,
		invariants,
		comparability: COMPARABLE_COMMON_PATH,
	});
}

/**
 * The sixth sequence: a healthy idle window after the work settled. Nothing may happen on its own —
 * no file operation, no provider query, no redraw and no re-armed wait — which is the measurement a
 * later fixed poll would show up in.
 */
async function sequenceHealthyIdle(endpoint: CaptureEndpoint): Promise<SequenceObservation> {
	const startedAt = Date.now();
	clock = T0;
	const requestsBefore = endpoint.requests.length;
	const start = recordedCount();
	const bound = await bindProcess({ label: "healthy-idle", endpoint, session: MAIN, provider: PRICED_PROVIDER, model: PRICED_MODEL });
	startSession(bound, MAIN, STARTUP_MAIN);
	submitInput(bound, MAIN);
	requestPair(bound, MAIN, T0 + 60_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	endRound(bound, MAIN);
	await waitForCommit(bound, candidate => recordOf(candidate, MAIN) !== undefined);
	const idleStart = recordedCount();
	const requestsBeforeIdle = endpoint.requests.length;
	const drawsBeforeIdle = bound.host.draws();
	const timersBeforeIdle = bound.host.armedTimers();
	const idleStartedAt = Date.now();
	await sleepReal(3_000);
	const idle = measureSince(idleStart, bound.scope);
	const requestsAfterIdle = endpoint.requests.length;
	const idleMs = Date.now() - idleStartedAt;
	const invariants = [
		check("an idle window opened no file at all", idle.cost.total === 0, `fileOperations=${idle.cost.total} over ${idleMs}ms`),
		check(
			"an idle window asked the provider nothing",
			requestsAfterIdle - requestsBeforeIdle === 0,
			`requests=${requestsAfterIdle - requestsBeforeIdle} over ${idleMs}ms`,
		),
		check(
			"an idle window redrew nothing",
			bound.host.draws() === drawsBeforeIdle,
			`draws=${bound.host.draws()} before=${drawsBeforeIdle} over ${idleMs}ms`,
		),
		check(
			"the UI's one boundary wait stayed armed and was not rebuilt",
			timersBeforeIdle === 1 && bound.host.armedTimers() === timersBeforeIdle,
			`armedBefore=${timersBeforeIdle} armedAfter=${bound.host.armedTimers()}`,
		),
	];
	return sequenceObservation({
		name: "healthy-idle",
		title: "健康空闲：3 秒窗口内无文件、无请求、无重绘、无重建等待",
		bound,
		startedAt,
		moduleCost: measureSince(start, bound.scope),
		windows: { idle },
		endpoint,
		requestsBefore,
		invariants,
		comparability: COMPARABLE_COMMON_PATH,
	});
}

/**
 * The seventh sequence: the disposal of a session that initialized the instance. It must release the
 * frontend's wait and then have no effect at all — including for work that arrives afterwards with an
 * expired success TTL, where a still-live source would have asked the provider again. The measurement
 * states the effect, not which guard produced it: the framework stops delivering to a disposed
 * binding's handlers, and this sequence writes down that nothing was observed after the disposal.
 */
async function sequenceDisposal(endpoint: CaptureEndpoint): Promise<SequenceObservation> {
	const startedAt = Date.now();
	clock = T0;
	const requestsBefore = endpoint.requests.length;
	const start = recordedCount();
	const bound = await bindProcess({ label: "disposal", endpoint, session: MAIN, provider: PRICED_PROVIDER, model: PRICED_MODEL });
	startSession(bound, MAIN, STARTUP_MAIN);
	submitInput(bound, MAIN);
	requestPair(bound, MAIN, T0 + 60_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	endRound(bound, MAIN);
	await waitForCommit(bound, candidate => recordOf(candidate, MAIN) !== undefined);
	const documentBefore = readDocumentEvidence(bound.consumptionFile);
	const disposalStart = recordedCount();
	const requestsBeforeDisposal = endpoint.requests.length;
	bound.double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" }, session: MAIN, hasUI: true });
	countDelivery(bound, "session_end", "session_end baseline-main disposed");
	const disposal = measureSince(disposalStart, bound.scope);
	const timersAfterDisposal = bound.host.armedTimers();
	const requestsAfterDisposal = endpoint.requests.length;
	const lateStart = recordedCount();
	const lateRequestsBefore = endpoint.requests.length;
	const drawsBeforeLate = bound.host.draws();
	// Work that arrives after the disposal, at an instant well past the success TTL: a live source
	// would query again here, so the absence of a request is the disposal's own effect.
	clock = T0 + 6_000_000;
	requestPair(bound, MAIN, T0 + 6_000_000, PRICED_PROVIDER, PRICED_MODEL, MAIN_USAGE);
	endRound(bound, MAIN);
	const lateCommand = await bound.double
		.runToCompletion("budget", { args: "detail", hasUI: true })
		.then(() => "answered", (error: unknown) => `refused: ${error instanceof Error ? error.message : String(error)}`);
	await sleepReal(500);
	const late = measureSince(lateStart, bound.scope);
	const requestsAfterLate = endpoint.requests.length;
	const documentAfter = readDocumentEvidence(bound.consumptionFile);
	const invariants = [
		check(
			"the disposal released the frontend's own wait",
			timersAfterDisposal === 0,
			`armedTimers=${timersAfterDisposal} (one armed wait at the start, none left after the cleanup)`,
		),
		check(
			"the disposal itself wrote nothing and asked nothing",
			disposal.cost.total === 0 && requestsAfterDisposal - requestsBeforeDisposal === 0,
			`fileOperations=${disposal.cost.total} requests=${requestsAfterDisposal - requestsBeforeDisposal}`,
		),
		check(
			"work arriving after the disposal had no effect at all",
			late.cost.total === 0 && requestsAfterLate - lateRequestsBefore === 0 && bound.host.draws() === drawsBeforeLate,
			`fileOperations=${late.cost.total} requests=${requestsAfterLate - lateRequestsBefore} draws=${bound.host.draws() - drawsBeforeLate}`,
		),
		check(
			"the document the session had committed was left exactly as it was",
			documentBefore !== undefined &&
				documentAfter !== undefined &&
				JSON.stringify(documentBefore.harnesses[HARNESS]?.sessions) === JSON.stringify(documentAfter.harnesses[HARNESS]?.sessions),
			`before=${JSON.stringify(documentBefore?.harnesses[HARNESS]?.sessions.map(record => record.saveVersion))} after=${JSON.stringify(documentAfter?.harnesses[HARNESS]?.sessions.map(record => record.saveVersion))}`,
		),
	];
	return sequenceObservation({
		name: "disposal",
		title: "处置：会话结束释放等待，之后不再有文件、请求或重绘效果",
		bound,
		startedAt,
		moduleCost: measureSince(start, bound.scope),
		windows: { disposal, afterDisposal: late },
		endpoint,
		requestsBefore,
		invariants,
		// What the late command did is a fact this sequence states rather than asserts: the framework may
		// answer a disposed binding's command or refuse it, and either answer is recorded beside the
		// measured absence of effects.
		evidence: { lateCommandOutcome: lateCommand, widgetLinesAfterDisposal: String(bound.host.lastLines()?.length ?? 0) },
		comparability: COMPARABLE_COMMON_PATH_WITH_NATIVE_HALF,
	});
}

/** The sequences this baseline freezes, in the order it runs them. */
const SEQUENCES: readonly ((endpoint: CaptureEndpoint) => Promise<SequenceObservation>)[] = [
	sequenceMainRequest,
	sequenceMultiTurn,
	sequenceConcurrentTree,
	sequenceSaveOntoSharedDocument,
	sequenceReadOnlyRefresh,
	sequenceHealthyIdle,
	sequenceDisposal,
];

/**
 * The scenarios a later comparison must not read off this baseline, stated once with their reasons.
 * None of them is estimated here and none carries a pi figure: the baseline simply states that it is
 * not evidence about them.
 */
const NOT_COMPARABLE_SCENARIOS: readonly { readonly name: string; readonly reason: string }[] = [
	{
		name: "native-adapter-fact-mapping",
		reason: "the OMP adapter's own native reads (Turn, Round, rename, startup model, context, provider access) are host code this in-process driver replaces with semantic deliveries; their cost is the host's, and the real-host numbers belong to the dock runs ticket 22 owns.",
	},
	{
		name: "omp-viewed-session-display",
		reason: "the OMP viewed-session path is an OMP-only display fact (pi keeps its own session's display), so a comparison has no shared behaviour to compare.",
	},
	{
		name: "real-terminal-drawing",
		reason: "the widget's real drawing, its widths and its layout are the human acceptance check (P52); this entry measures drawings, not terminal rendering.",
	},
	{
		name: "native-session-storage",
		reason: "the host's own session JSONL and logs are outside the storage root this baseline attributes costs to.",
	},
	{
		name: "codex-account-query",
		reason: "the account query's own endpoint needs a real credential and its proxy entry; this baseline holds no access to that provider, so its request count is an absence, not a cost.",
	},
	{
		name: "external-document-adoption-refresh",
		reason: "adopting another writer's committed document on a read refresh has no implementation on either harness at this baseline; only the read-only work's own cost is recorded.",
	},
];

/** The probe's own figures: the instrument checked against the production file module. */
interface InstrumentProbe {
	readonly operations: number;
	readonly documentReads: number;
	readonly documentPublishes: number;
	readonly lockOperations: number;
	readonly stagingOperations: number;
	readonly syncOperations: number;
}

/**
 * Check the instrument against the production file module before any sequence runs: one ordinary
 * coordinated update over a throwaway document must be recorded as a read, a lock cycle and a
 * publish. A run whose instrument recorded nothing is refused here rather than reported as cheap.
 */
async function verifyInstrument(): Promise<InstrumentProbe> {
	const probeRoot = mkdtempSync(join(tmpdir(), "model-cost-baseline-probe-"));
	runRoots.push(probeRoot);
	const target = join(probeRoot, "probe.json");
	const start = recordedCount();
	await updateFile(target, () => ({ probe: true }));
	readFileSync(target, "utf8");
	const measurement = measureSince(start, { root: probeRoot, documents: [target] });
	const probe: InstrumentProbe = {
		operations: measurement.cost.total,
		documentReads: measurement.cost.documentReads,
		documentPublishes: measurement.cost.documentPublishes,
		lockOperations: measurement.cost.lockOperations,
		stagingOperations: measurement.cost.stagingOperations,
		syncOperations: measurement.operations.filter(operation => operation.phase === "sync").length,
	};
	if (probe.documentReads === 0 || probe.documentPublishes === 0 || probe.lockOperations === 0) {
		throw new Error(
			`efficiency-baseline: the file-system instrument recorded no complete coordinated update (reads=${probe.documentReads} publishes=${probe.documentPublishes} lockOperations=${probe.lockOperations}); the baseline would be meaningless, so the run is refused. Run the entry as \`bun run baseline:efficiency\` — the preload is what makes the instrument effective (see this file's header).`,
		);
	}
	return probe;
}

/** The module families whose size this baseline reports for the migration's own complexity question. */
const COMPLEXITY_ROOTS: readonly string[] = [
	"extensions/model-cost/shared-logic",
	"extensions/model-cost/harnesses",
	"entrypoints/omp/model-cost.ts",
	"adapters/omp",
	"adapters/pi",
	"framework/behaviors/assembly.ts",
	"framework/modules/files.ts",
	"framework/modules/http.ts",
];

/** One file's size, as this baseline counts it: its lines, read from the checkout itself. */
interface ModuleSize {
	readonly path: string;
	readonly lines: number;
}

/** Every TypeScript file under one root of the checkout, with its line count. */
function moduleSizes(root: string): ModuleSize[] {
	const found: ModuleSize[] = [];
	const walk = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const full = join(directory, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.name.endsWith(".ts")) continue;
			found.push({ path: relative(REPO_ROOT, full).split("\\").join("/"), lines: readFileSync(full, "utf8").trimEnd().split("\n").length });
		}
	};
	const full = join(REPO_ROOT, root);
	if (statSync(full).isDirectory()) walk(full);
	else found.push({ path: root, lines: readFileSync(full, "utf8").trimEnd().split("\n").length });
	return found;
}

/** The whole complexity inventory this baseline hands to the comparison. */
function complexityInventory(): { readonly modules: readonly ModuleSize[]; readonly totals: Readonly<Record<string, number>> } {
	const modules = COMPLEXITY_ROOTS.flatMap(moduleSizes).sort((left, right) => left.path.localeCompare(right.path)).map(entry => ({ ...entry }));
	const totals: Record<string, number> = {};
	for (const root of COMPLEXITY_ROOTS) {
		const prefix = root.split("\\").join("/");
		totals[prefix] = modules
			.filter(module => module.path === prefix || module.path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`))
			.reduce((sum, module) => sum + module.lines, 0);
	}
	totals["total"] = modules.reduce((sum, module) => sum + module.lines, 0);
	return { modules, totals };
}

/** The name of one argument's value, as this entry was invoked with it. */
function argumentOf(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	const value = index === -1 ? undefined : process.argv[index + 1];
	return value === undefined || value.startsWith("--") ? undefined : value;
}

/** One command's own output, as this entry reads the checkout's state through it. */
function gitLine(args: readonly string[]): string | undefined {
	const result = Bun.spawnSync(["git", ...args], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) return undefined;
	return result.stdout.toString().trim() || undefined;
}

/** The artifact one run writes: the environment, the instrument's own check, and every sequence. */
interface BaselineArtifact {
	readonly record: string;
	readonly run: Readonly<Record<string, unknown>>;
	readonly source: Readonly<Record<string, unknown>>;
	readonly configuration: Readonly<Record<string, unknown>>;
	readonly instrumentProbe: InstrumentProbe;
	readonly sequences: readonly SequenceObservation[];
	readonly notComparableScenarios: readonly { readonly name: string; readonly reason: string }[];
	readonly complexity: ReturnType<typeof complexityInventory>;
}

/** One line of the run's own report, so a reader sees the figures without opening the artifact. */
function reportLine(observation: SequenceObservation): string {
	const cost = observation.fileCost;
	const failed = observation.invariants.filter(invariant => !invariant.ok).length;
	const columns = [
		observation.name.padEnd(26),
		String(Object.values(observation.deliveries).reduce((sum, count) => sum + count, 0)).padStart(6),
		String(cost.documentReads).padStart(5),
		String(cost.documentPublishes).padStart(5),
		String(cost.lockOperations).padStart(5),
		String(cost.stagingOperations).padStart(6),
		String(cost.metadataOperations).padStart(6),
		String(cost.directoryOperations).padStart(5),
		String(cost.otherOperations).padStart(5),
		String(cost.failedOperations).padStart(5),
		String(observation.providerRequests).padStart(6),
		String(observation.widget.draws).padStart(5),
		String(observation.wallClockMs).padStart(6),
		failed === 0 ? "ok" : `${failed} FAILED`,
	];
	return columns.join(" ");
}

/** Run every sequence, write the artifact, report the table, and answer whether every invariant held. */
async function main(): Promise<number> {
	const out = resolve(REPO_ROOT, argumentOf("--out") ?? join(".cache", "efficiency-baseline", "efficiency-baseline.json"));
	const probe = await verifyInstrument();
	const endpoint = await startCaptureEndpoint();
	const sequences: SequenceObservation[] = [];
	for (const sequence of SEQUENCES) sequences.push(await sequence(endpoint));
	const label = argumentOf("--label") ?? "unlabelled";
	const artifact: BaselineArtifact = {
		record: `model-cost-pi-migration / the representative efficiency sequences of the model-cost common path, sampled by scripts/efficiency-baseline.ts under the label ${label}`,
		run: {
			at: new Date().toISOString(),
			label,
			command: process.argv.join(" "),
			platform: process.platform,
			arch: process.arch,
			bun: Bun.version,
			node: process.versions.node,
			cwd: process.cwd(),
			clock: `fixed instants, T0 = ${new Date(T0).toISOString()}`,
			temporaryRoots: [...runRoots],
			temporaryRootsNote: "created for this run and removed when it ended; every storage root was isolated under them",
		},
		source: {
			head: gitLine(["rev-parse", "HEAD"]),
			branch: gitLine(["rev-parse", "--abbrev-ref", "HEAD"]),
			// The paths this run's checkout carried uncommitted, so a reader can see that the baseline's
			// own new files are what the recording source state differs by, and no measured path is one.
			changedPaths: (gitLine(["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).slice(0, 50),
		},
		configuration: {
			harness: HARNESS,
			storageDocument: CONSUMPTION_FILE,
			estimateDocument: CODEX_ESTIMATE_FILE,
			providerAccess: { [PRICED_PROVIDER]: "loopback capture endpoint", [UNREACHABLE_PROVIDER]: "no access (the host resolves none)" },
			balanceTtlMs: BALANCE_TTL_MS,
			codexQuotaTtlMs: CODEX_QUOTA_TTL_MS,
			drawing: "lines",
			prices: "self-made data stated in scripts/efficiency-baseline.ts",
		},
		instrumentProbe: probe,
		sequences,
		notComparableScenarios: NOT_COMPARABLE_SCENARIOS,
		complexity: complexityInventory(),
	};
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
	await endpoint.close();
	for (const root of runRoots.splice(0)) rmSync(root, { recursive: true, force: true });

	console.log("sequence                   events reads pubs locks stage  meta  dirs other  fail   req draws     ms  invariants");
	for (const observation of sequences) console.log(reportLine(observation));
	const failed = sequences.flatMap(observation => observation.invariants.filter(invariant => !invariant.ok));
	for (const observation of sequences) {
		for (const invariant of observation.invariants.filter(candidate => !candidate.ok)) {
			console.log(`FAILED ${observation.name}: ${invariant.name} — ${invariant.detail}`);
		}
	}
	console.log(`\ninstrument probe: ${JSON.stringify(probe)}`);
	console.log(`artifact: ${out}`);
	console.log(failed.length === 0 ? "every invariant held." : `${failed.length} invariant(s) failed.`);
	return failed.length === 0 ? 0 : 1;
}

process.exit(await main());
