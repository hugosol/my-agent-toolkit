/**
 * The consumption document: the physical schema of the extension's active consumption file, what
 * makes a document at that name readable at all, what two session records have to agree on to be
 * the same business content, and what one session's snapshot does to a document.
 *
 * This module owns the whole of that meaning; the framework's safe-file module owns coordination
 * alone and never looks inside a document. The schema is the approved one and nothing else:
 *
 * - The root carries `schemaVersion` (the document format gate, `1` for this extension and never
 *   stepped by an ordinary save), `periodId` (the generation an accounting reset produces),
 *   `start`, an optional `start_bal`, `holiday` and `harnesses`.
 * - `harnesses.<harness>.sessions` is a flat list of records `{id, name, parent, startup?,
 *   saveVersion, own, runtimeMs?}`, unique by `id` inside one harness. `parent` is the same
 *   harness's direct parent session id, or `null` for a session with none; a parent that has not
 *   been saved yet is ordinary data, not an error, and no placeholder parent is invented. The
 *   harness part of the identity is the harness key, so the record itself carries no harness field.
 *   `startup` is the model and effective effort the session began with, omitted when nothing proved
 *   them, and it is never rewritten: a document written before this field existed is the same
 *   approved format with the field simply absent.
 * - `own.<provider>.<model>` carries the session's own four token buckets and, when the provider's
 *   accounting produced one, `costCny` or `referenceCostUsd` — the two currencies are separate
 *   fields and neither is derived from the other. No authoritative total, account key, round or
 *   turn detail, host difference baseline or historical price has a place here, and a document (or
 *   record, or usage entry) carrying a field this schema does not name is not read as this
 *   version: an unrecognized shape is refused, never guessed at, defaulted or silently trimmed.
 *   `runtimeMs` is the one optional measurement a record may carry: a count of milliseconds,
 *   never a formatted duration, absent when the host never produced one and `0` when a reading
 *   really was zero — while a value that is not a measurement at all is dropped from the record
 *   rather than taken for damage to the consumption beside it.
 *
 * A document the file holds is read through {@link readConsumptionDocument}, which answers either
 * with the validated document or with the reason it is not one. Nothing here reads the file, and
 * nothing here decides what an unusable one means for the running instance — that is the store's
 * business (see `consumption-store.ts`).
 *
 * {@link mergeSession} is the one document change an ordinary save makes. Its rules are the
 * approved ones: a record is found by `id` and replaced there or appended, every other record
 * survives untouched, a smaller `saveVersion` is refused, an equal one is either the same business
 * content (idempotent) or a conflict (the disk's content is kept), and a greater one replaces the
 * record. Business content is compared as values — the record's own fields, every level of `own`,
 * whatever order the keys happened to be written in — never as JSON text, and a conflict is never
 * resolved by adding, taking a maximum or letting the last writer win.
 */
import { describeValue } from "../../../framework/core/config";

/** The document format this extension reads and writes; an ordinary save never steps it. */
export const CONSUMPTION_SCHEMA_VERSION = 1;

/** The four token buckets one provider's model consumption carries, as the public usage counts them. */
export interface TokenBuckets {
	/** Non-cached conversation input tokens. */
	readonly input: number;
	/** Conversation tokens read from the prompt cache. */
	readonly cacheRead: number;
	/** Conversation tokens written to the prompt cache. */
	readonly cacheWrite: number;
	/** Conversation output tokens. */
	readonly output: number;
}

/** One provider model's own consumption inside one session: its tokens and any priced amount. */
export interface ModelConsumption {
	readonly tokens: TokenBuckets;
	/** The request-priced amount in CNY, when this provider's accounting produced one. */
	readonly costCny?: number;
	/** The reference estimate in USD, when this provider's accounting produced one. */
	readonly referenceCostUsd?: number;
}

/** One session's own consumption: provider, then model, then that model's buckets and amounts. */
export type OwnConsumption = Readonly<Record<string, Readonly<Record<string, ModelConsumption>>>>;

/**
 * The model and effective effort one session began with, as its startup was observed or recorded.
 *
 * It is a *startup* fact rather than the session's current one, and it is never rewritten: the model
 * the session began on, and the level it really ran there — the level the harness resolved, never the
 * configured selector behind it. Each member is absent when nothing proved it, and a session whose
 * record carries none keeps both unknown however it runs now.
 */
export interface SessionStartup {
	/** The model the session began on, both parts as the harness reported them. */
	readonly model?: {
		/** The provider the harness serves that model under. */
		readonly provider: string;
		/** The exact model id, as the harness resolves it. */
		readonly model: string;
	};
	/** The effective thinking level the session began with. */
	readonly effort?: string;
}

/**
 * One session's main-session time facts as its record carries them: the two instants a Session span
 * is the difference of, in epoch milliseconds.
 *
 * Both are always present together. An instant is only ever written once it has really been
 * observed — the first user input, the latest Round end — so a pair here is a pair of observations
 * and never one observation with a placeholder beside it: a session whose end is still unknown keeps
 * no span at all rather than a span whose end is a guess, a zero or the last transcript time.
 */
export interface SessionSpanFact {
	/** The instant this session's first user input of the period was observed. */
	readonly start: number;
	/** The instant this session's most recent observed Round end was. */
	readonly end: number;
}

/** One session's record: its identity, display data, direct parent and snapshot version. */
export interface SessionRecord {
	/** The session's identity inside its harness; its complete identity is harness + this id. */
	readonly id: string;
	/** The session's latest display name; display data, never an identity. */
	readonly name: string;
	/** The same harness's direct parent session id, or `null` for a session with none. */
	readonly parent: string | null;
	/**
	 * The model and effective effort this session began with, omitted when nothing proved them.
	 *
	 * It is recorded once, with the session's first snapshot, and never rewritten: a later model
	 * switch, a later level change or a later execution leaves what the session started on as it was.
	 */
	readonly startup?: SessionStartup;
	/** The snapshot's version, compared inside periodId + harness + sessionId. */
	readonly saveVersion: number;
	/** This session's own consumption, excluding anything its subagents issued. */
	readonly own: OwnConsumption;
	/**
	 * The subagent runtime this session's own executions accumulated in this period, in
	 * milliseconds, or nothing when no reliable reading ever produced one.
	 *
	 * It is the harness's *own* measurement of each execution's duration, summed per execution —
	 * never a session's creation-to-last-record span, which counts the idle gaps between
	 * executions, and never a formatted string, so a later statistical tool reads a number.
	 * Absent is *unavailable* rather than zero: a session whose host reported no such reading and
	 * one whose executions really took no measurable time are different facts, and the second is
	 * stored as `0`.
	 */
	readonly runtimeMs?: number;
	/**
	 * This session's own main-session time facts within the applicable accounting period, when both
	 * of them have been observed: the instant of its first user input and the instant of its most
	 * recent observed Round end, in epoch milliseconds.
	 *
	 * Absent is the ordinary state — a session that has not taken up input yet, one whose first Round
	 * has not ended, and every record written before this field existed. An absent span is unknown
	 * rather than zero, so nothing reads it as an elapsed time of nothing, and a reliable reading of
	 * zero milliseconds is a *present* span whose two instants are equal.
	 *
	 * It is the session's own time and not its subagents': nothing here is added to it, and a
	 * descendant's own span is its own record's. Like the consumption beside it, it belongs to the
	 * period that record is in — an accounting reset clears it with everything else rather than
	 * carrying it into the new period.
	 */
	readonly span?: SessionSpanFact;
}

/** One harness's sessions, as the flat list the schema fixes. */
export interface HarnessSessions {
	readonly sessions: readonly SessionRecord[];
}

/** The whole active consumption document. */
export interface ConsumptionDocument {
	readonly schemaVersion: number;
	/** The accounting generation this document belongs to; an ordinary save never changes it. */
	readonly periodId: string;
	/** When this period began, as an ISO instant. */
	readonly start: string;
	/** The DeepSeek boundary balance at the period's start, omitted when no reliable reading existed. */
	readonly start_bal?: number;
	/** Whether this period is a holiday period. */
	readonly holiday: boolean;
	readonly harnesses: Readonly<Record<string, HarnessSessions>>;
}

/** What reading one value as a document answered. */
export type ConsumptionDocumentRead =
	| {
			readonly kind: "document";
			readonly document: ConsumptionDocument;
			/**
			 * Every invalid *optional* main-session time fact the document carried, named the way its
			 * place names it, in the order the records were read.
			 *
			 * An invalid time fact is not a reason to refuse the document: the consumption beside it is
			 * what the document is for, and a record whose time is unreadable still holds valid
			 * consumption. What the fault does is what the absence of a span does — the fact is dropped
			 * rather than guessed — and it is reported separately so the operator is told, instead of the
			 * whole document being treated as corrupt and either refused or overwritten.
			 */
			readonly faults: readonly string[];
	  }
	| { readonly kind: "unusable"; readonly reason: string };

/** One validated value, or the reason it is not one — the shape every level of the read uses. */
type Validated<T> = { readonly value: T } | { readonly reason: string };

/** What one validated session record answered. */
type SessionRecordRead =
	| { readonly record: SessionRecord; readonly timeFault?: string }
	| { readonly reason: string };

/** The keys each level of the approved schema declares, and nothing else. */
type ApprovedKeys = Readonly<Record<string, true>>;

const DOCUMENT_KEYS: ApprovedKeys = { schemaVersion: true, periodId: true, start: true, start_bal: true, holiday: true, harnesses: true };
const HARNESS_KEYS: ApprovedKeys = { sessions: true };
const SESSION_KEYS: ApprovedKeys = {
	id: true,
	name: true,
	parent: true,
	startup: true,
	saveVersion: true,
	own: true,
	runtimeMs: true,
	span: true,
};
const STARTUP_KEYS: ApprovedKeys = { model: true, effort: true };
const STARTUP_MODEL_KEYS: ApprovedKeys = { provider: true, model: true };
const SPAN_KEYS: ApprovedKeys = { start: true, end: true };
const USAGE_KEYS: ApprovedKeys = { tokens: true, costCny: true, referenceCostUsd: true };
const TOKEN_KEYS: ApprovedKeys = { input: true, cacheRead: true, cacheWrite: true, output: true };

/** The token bucket names, in one place, because both the tokens themselves and their order use them. */
const TOKEN_BUCKETS = ["input", "cacheRead", "cacheWrite", "output"] as const;

/** Whether a value is a plain mapping — the only shape any level of this schema is built from. */
function isMapping(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first key a mapping carries that the approved schema does not name, if it carries one. */
function undeclaredKey(value: Record<string, unknown>, approved: ApprovedKeys): string | undefined {
	return Object.keys(value).find(key => approved[key] !== true);
}

/** Why a value is not a count or an amount this schema accepts, or `undefined` when it is one. */
function measurementFault(value: unknown): string | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return `不是有限数字（${describeValue(value)}）`;
	if (value < 0) return "为负数";
	return undefined;
}

/** Whether one value is a measurement this schema accepts — the narrowing form of the check above. */
function isMeasurement(value: unknown): value is number {
	return measurementFault(value) === undefined;
}

/** The four token buckets of one model's usage, or the reason that entry is not one. */
function readTokenBuckets(value: unknown, path: string): Validated<TokenBuckets> {
	if (!isMapping(value)) return { reason: `${path} 不是映射（${describeValue(value)}）` };
	const undeclared = undeclaredKey(value, TOKEN_KEYS);
	if (undeclared !== undefined) return { reason: `${path}.${undeclared} 不是本格式的字段` };
	for (const key of TOKEN_BUCKETS) {
		const fault = measurementFault(value[key]);
		if (fault !== undefined) return { reason: `${path}.${key} ${fault}` };
	}
	return {
		value: {
			input: value.input as number,
			cacheRead: value.cacheRead as number,
			cacheWrite: value.cacheWrite as number,
			output: value.output as number,
		},
	};
}

/** One model's usage entry: its token buckets and, when present, the two currencies separately. */
function readModelConsumption(value: unknown, path: string): Validated<ModelConsumption> {
	if (!isMapping(value)) return { reason: `${path} 不是映射（${describeValue(value)}）` };
	const undeclared = undeclaredKey(value, USAGE_KEYS);
	if (undeclared !== undefined) return { reason: `${path}.${undeclared} 不是本格式的字段` };
	const tokens = readTokenBuckets(value.tokens, `${path}.tokens`);
	if ("reason" in tokens) return tokens;
	const consumption: { tokens: TokenBuckets; costCny?: number; referenceCostUsd?: number } = { tokens: tokens.value };
	for (const currency of ["costCny", "referenceCostUsd"] as const) {
		const amount = value[currency];
		if (amount === undefined) continue;
		const fault = measurementFault(amount);
		if (fault !== undefined) return { reason: `${path}.${currency} ${fault}` };
		consumption[currency] = amount as number;
	}
	return { value: consumption };
}

/** One session's own consumption: provider, then model, each entry validated. */
function readOwnConsumption(value: unknown, path: string): Validated<OwnConsumption> {
	if (!isMapping(value)) return { reason: `${path} 不是映射（${describeValue(value)}）` };
	const own: Record<string, Record<string, ModelConsumption>> = {};
	for (const [provider, models] of Object.entries(value)) {
		if (!isMapping(models)) return { reason: `${path}.${provider} 不是映射（${describeValue(models)}）` };
		const bucket: Record<string, ModelConsumption> = {};
		for (const [model, usage] of Object.entries(models)) {
			const read = readModelConsumption(usage, `${path}.${provider}.${model}`);
			if ("reason" in read) return read;
			bucket[model] = read.value;
		}
		own[provider] = bucket;
	}
	return { value: own };
}

/** One session's startup facts, or the reason this value is not them. */
function readStartup(value: unknown, path: string): Validated<SessionStartup> {
	if (!isMapping(value)) return { reason: `${path} 不是映射（${describeValue(value)}）` };
	const undeclared = undeclaredKey(value, STARTUP_KEYS);
	if (undeclared !== undefined) return { reason: `${path}.${undeclared} 不是本格式的字段` };
	const startup: { model?: { provider: string; model: string }; effort?: string } = {};
	if (value.model !== undefined) {
		if (!isMapping(value.model)) return { reason: `${path}.model 不是映射（${describeValue(value.model)}）` };
		const undeclaredPart = undeclaredKey(value.model, STARTUP_MODEL_KEYS);
		if (undeclaredPart !== undefined) return { reason: `${path}.model.${undeclaredPart} 不是本格式的字段` };
		for (const part of ["provider", "model"] as const) {
			const field = value.model[part];
			if (typeof field !== "string" || field.length === 0) {
				return { reason: `${path}.model.${part} 不是非空字符串（${describeValue(field)}）` };
			}
		}
		startup.model = { provider: value.model.provider as string, model: value.model.model as string };
	}
	if (value.effort !== undefined) {
		if (typeof value.effort !== "string" || value.effort.length === 0) {
			return { reason: `${path}.effort 不是非空字符串（${describeValue(value.effort)}）` };
		}
		startup.effort = value.effort;
	}
	return { value: startup };
}

/** One session record of the approved schema, or the reason this value is not one. */
function readSessionRecord(value: unknown, path: string): SessionRecordRead {
	if (!isMapping(value)) return { reason: `${path} 不是映射（${describeValue(value)}）` };
	const undeclared = undeclaredKey(value, SESSION_KEYS);
	if (undeclared !== undefined) return { reason: `${path}.${undeclared} 不是本格式的字段` };
	if (typeof value.id !== "string" || value.id.length === 0) {
		return { reason: `${path}.id 不是非空字符串（${describeValue(value.id)}）` };
	}
	if (typeof value.name !== "string") return { reason: `${path}.name 不是字符串（${describeValue(value.name)}）` };
	if (value.parent !== null && (typeof value.parent !== "string" || value.parent.length === 0)) {
		return { reason: `${path}.parent 不是 null 或非空字符串（${describeValue(value.parent)}）` };
	}
	// The startup facts are optional in both directions: a record that carries none is the shape every
	// document written before they existed has, and one that carries them states each part of them. A
	// member the record omits stays unknown; nothing is filled in from anything else.
	let startup: SessionStartup | undefined;
	if (value.startup !== undefined) {
		const read = readStartup(value.startup, `${path}.startup`);
		if ("reason" in read) return read;
		startup = read.value;
	}
	if (typeof value.saveVersion !== "number" || !Number.isInteger(value.saveVersion) || value.saveVersion < 0) {
		return { reason: `${path}.saveVersion 不是非负整数（${describeValue(value.saveVersion)}）` };
	}
	const own = readOwnConsumption(value.own, `${path}.own`);
	if ("reason" in own) return own;
	// The session's runtime rides the same record and is read leniently: a value this schema cannot
	// accept as a measurement is left out rather than refusing the whole document. The consumption
	// this record carries is valid however that one optional figure stands, so treating a bad one as
	// a damaged document would pause an accounting that is not damaged — and the record's other
	// fields must survive it. The next snapshot this session commits replaces the value.
	const declaredRuntime = value.runtimeMs;
	// The one optional fact of the record: an unreadable time never makes the record unusable, so its
	// fault is carried beside the record rather than in place of it.
	const span = readSessionSpan(value.span, `${path}.span`);
	return {
		record: {
			id: value.id,
			name: value.name,
			parent: value.parent,
			...(startup === undefined ? {} : { startup }),
			saveVersion: value.saveVersion,
			own: own.value,
			...(isMeasurement(declaredRuntime) ? { runtimeMs: declaredRuntime } : {}),
			...(span.span === undefined ? {} : { span: span.span }),
		},
		...(span.fault === undefined ? {} : { timeFault: span.fault }),
	};
}

/**
 * One record's optional main-session time facts, or the reason they are not readable.
 *
 * An absent fact is not a fault at all: a record written before this field existed, and a session
 * whose span has not been established, both carry nothing here. A value that is present must be
 * exactly this pair of instants — this schema names nothing else, and a document is never trimmed
 * into shape — and its two instants must be a readable pair, which is to say two finite,
 * non-negative instants no later than each other. Anything else is reported as a fault and the fact
 * is dropped, so an unreadable time never travels on as a guessed one.
 */
function readSessionSpan(value: unknown, path: string): { readonly span?: SessionSpanFact; readonly fault?: string } {
	if (value === undefined) return {};
	if (!isMapping(value)) return { fault: `${path} 不是映射（${describeValue(value)}）` };
	const undeclared = undeclaredKey(value, SPAN_KEYS);
	if (undeclared !== undefined) return { fault: `${path}.${undeclared} 不是本格式的字段` };
	for (const key of ["start", "end"] as const) {
		const fault = measurementFault(value[key]);
		if (fault !== undefined) return { fault: `${path}.${key} ${fault}` };
	}
	const start = value.start as number;
	const end = value.end as number;
	if (end < start) {
		return { fault: `${path}.end 早于 ${path}.start` };
	}
	return { span: { start, end } };
}

/**
 * One value read as the active consumption document, or the reason it is not one.
 *
 * The answer is either the validated document — rebuilt as the approved shape, so nothing the
 * schema does not name travels on — or a reason naming what was wrong with it. Every missing
 * field, unrecognized field, wrong type and duplicate session id is such a reason: a document that
 * is not this schema version is never interpreted as if it were, and no field is defaulted.
 */
export function readConsumptionDocument(value: unknown): ConsumptionDocumentRead {
	const unusable = (reason: string): ConsumptionDocumentRead => ({ kind: "unusable", reason });
	if (!isMapping(value)) return unusable(`顶层不是映射（${describeValue(value)}）`);
	const undeclared = undeclaredKey(value, DOCUMENT_KEYS);
	if (undeclared !== undefined) return unusable(`顶层出现本格式未定义的字段「${undeclared}」`);
	if (value.schemaVersion !== CONSUMPTION_SCHEMA_VERSION) {
		return unusable(
			`schemaVersion 为 ${describeValue(value.schemaVersion)}，本扩展只读取 ${CONSUMPTION_SCHEMA_VERSION}`,
		);
	}
	if (typeof value.periodId !== "string" || value.periodId.length === 0) {
		return unusable(`periodId 不是非空字符串（${describeValue(value.periodId)}）`);
	}
	if (typeof value.start !== "string" || Number.isNaN(Date.parse(value.start))) {
		return unusable(`start 不是可读的 ISO 时间（${describeValue(value.start)}）`);
	}
	if (value.start_bal !== undefined) {
		const fault = measurementFault(value.start_bal);
		if (fault !== undefined) return unusable(`start_bal ${fault}`);
	}
	if (typeof value.holiday !== "boolean") return unusable(`holiday 不是布尔值（${describeValue(value.holiday)}）`);
	if (!isMapping(value.harnesses)) return unusable(`harnesses 不是映射（${describeValue(value.harnesses)}）`);

	const harnesses: Record<string, HarnessSessions> = {};
	// Every unreadable optional time fact the document carries, in the order the records were read:
	// the document is still usable, and this is what the instance reports to its operator.
	const faults: string[] = [];
	for (const [harness, bucket] of Object.entries(value.harnesses)) {
		if (!isMapping(bucket)) return unusable(`harnesses.${harness} 不是映射（${describeValue(bucket)}）`);
		const bucketKey = undeclaredKey(bucket, HARNESS_KEYS);
		if (bucketKey !== undefined) return unusable(`harnesses.${harness}.${bucketKey} 不是本格式的字段`);
		if (!Array.isArray(bucket.sessions)) {
			return unusable(`harnesses.${harness}.sessions 不是数组（${describeValue(bucket.sessions)}）`);
		}
		const sessions: SessionRecord[] = [];
		const ids = new Set<string>();
		for (const [index, candidate] of bucket.sessions.entries()) {
			const read = readSessionRecord(candidate, `harnesses.${harness}.sessions[${index}]`);
			if ("reason" in read) return unusable(read.reason);
			if (ids.has(read.record.id)) {
				return unusable(`harnesses.${harness} 出现重复的 Session id「${read.record.id}」`);
			}
			ids.add(read.record.id);
			if (read.timeFault !== undefined) faults.push(`harnesses.${harness}.sessions[${index}]：${read.timeFault}`);
			sessions.push(read.record);
		}
		harnesses[harness] = { sessions };
	}

	return {
		kind: "document",
		document: {
			schemaVersion: CONSUMPTION_SCHEMA_VERSION,
			periodId: value.periodId,
			start: value.start,
			...(value.start_bal === undefined ? {} : { start_bal: value.start_bal as number }),
			holiday: value.holiday,
			harnesses,
		},
		faults,
	};
}

/** Whether two values are the same business content, whatever order their keys were written in. */
function sameBusinessValue(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((item, index) => sameBusinessValue(item, right[index]))
		);
	}
	if (!isMapping(left) || !isMapping(right)) return false;
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(key => rightKeys.includes(key) && sameBusinessValue(left[key], right[key]))
	);
}

/**
 * Whether two records say the same business thing: the same identity, display name, direct parent,
 * startup facts, snapshot version, own consumption at every level, subagent runtime, and
 * main-session time facts.
 *
 * A name is part of the record's content, so a rename at an unchanged version is other content
 * rather than a silent update — names travel with consumption, not through a write of their own —
 * and the startup facts are content in the same way: a snapshot never changes, so two records that
 * disagree about it are other content rather than one overwriting the other. The runtime is content
 * for the same reason: it rides the same commit, and an accumulation that grew is a change the file
 * has to carry rather than a snapshot to drop as idempotent. The span is content for the same
 * reason: a reading that differs from the one the disk holds is a different snapshot, and two
 * records that disagree about it are a conflict rather than something to settle by taking the later
 * instant.
 */
export function sameSessionContent(left: SessionRecord, right: SessionRecord): boolean {
	return (
		left.id === right.id &&
		left.name === right.name &&
		left.parent === right.parent &&
		sameBusinessValue(left.startup, right.startup) &&
		left.saveVersion === right.saveVersion &&
		left.runtimeMs === right.runtimeMs &&
		sameBusinessValue(left.own, right.own) &&
		sameBusinessValue(left.span, right.span)
	);
}

/** What one session's snapshot did to the document it was merged into. */
export type SessionMerge =
	| { readonly kind: "updated"; readonly document: ConsumptionDocument }
	| { readonly kind: "unchanged"; readonly document: ConsumptionDocument }
	| { readonly kind: "stale-version" }
	| { readonly kind: "conflict" };

/**
 * One session's snapshot merged into a document, by the approved rules: the record whose id it
 * carries is replaced in place or appended, and every other record — the other sessions of this
 * harness and every other harness — survives exactly as it was. No array position is an identity,
 * a parent is never required to be present, and a version that is neither newer nor the same
 * content is refused rather than resolved.
 */
export function mergeSession(
	document: ConsumptionDocument,
	harness: string,
	record: SessionRecord,
): SessionMerge {
	const sessions = document.harnesses[harness]?.sessions ?? [];
	const index = sessions.findIndex(candidate => candidate.id === record.id);
	const replace = (merged: readonly SessionRecord[]): SessionMerge => ({
		kind: "updated",
		document: {
			...document,
			harnesses: { ...document.harnesses, [harness]: { sessions: merged } },
		},
	});
	if (index < 0) return replace([...sessions, record]);
	const saved = sessions[index] as SessionRecord;
	if (record.saveVersion < saved.saveVersion) return { kind: "stale-version" };
	if (record.saveVersion === saved.saveVersion) {
		return sameSessionContent(saved, record) ? { kind: "unchanged", document } : { kind: "conflict" };
	}
	const merged = [...sessions];
	merged[index] = record;
	return replace(merged);
}
