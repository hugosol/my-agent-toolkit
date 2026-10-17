/**
 * The framework's general local-access module: the one way a process offers the declared values of
 * an owner it serves to a session the harness runs in another process.
 *
 * It is harness-independent and business-free. An extension never touches it: an adapter that maps
 * a harness whose sessions may run in a separate process owns the serving half, and the framework's
 * State module asks it to offer the owners it serves; the reading half is what a session in that
 * other process uses to read them. What makes it more than a socket wrapper is what it owns: the
 * explicit runtime directory its location records live in, one endpoint per serving process, the
 * record that says where one seat's access is, the verification both ends compare before anything
 * crosses, the bounded waits, and the release of every one of those with the access's own life.
 *
 * The shape is deliberately small and the meaning fixed:
 *
 * - One *seat* is one extension's access to one owner: `{ extension, owner }`. A serving process
 *   offers a seat's current declared values and observes that seat's changes; a reading process
 *   asks for a seat's values. The same seat carries one more, opposite direction, and it is the
 *   only other thing that crosses: a session the harness ran in the reading process delivers the
 *   *observation* of itself — its own facts, the owner it follows and the readings known for it —
 *   to the process that serves the seat, which hands it to whoever receives that seat's
 *   observations. Nothing else crosses. There is no write frame, no method name, no argument list
 *   and no business data: this is not an RPC surface, a session cannot reach any value or any
 *   other session through it, and a frame that is not the declared `hello`, `read` or `observed` is
 *   refused rather than interpreted.
 * - The carrier is a local stream the platform already provides: a Windows named pipe
 *   (`\\.\pipe\my-agent-toolkit-access-<id>`, a kernel-namespace name that is not a disk directory)
 *   or a POSIX socket file governed by the runtime directory. The endpoint's id is random per
 *   serving process and is published in the seat's location record, so it is never guessed and
 *   never reused by a later process.
 * - The *location* is separate from the messages: one JSON record per seat under the runtime
 *   directory, named from the seat itself, holding the seat, the endpoint, this access's own
 *   verification and the publishing process's id. It holds no value, no State and no business
 *   data, and it is the only thing a reading process needs to reach the access. Process id and
 *   endpoint are recorded as information: neither is read as proof that an owner lives, and a
 *   closed connection is not read as an owner having ended.
 * - The *target* both ends check before anything crosses: the reading process states the seat it
 *   wants together with the verification it read, and the serving process answers only when that
 *   seat is one it serves right now and the verification is the one it published. The reading
 *   process checks the seat the answer names in turn. A refusal closes the connection with no
 *   values, so a stale record, an old endpoint or another owner's seat never receives another
 *   seat's values.
 * - Values are the extension's declared State fields — booleans — and nothing else is carried.
 *   Unknown fields are answered as absent rather than invented.
 * - The runtime directory is explicit: it comes from the framework's shared `framework/config.yaml`
 *   under `runtimeDir`, and a relative value is resolved against that file's own directory so two
 *   processes that read the same file agree on it whatever their working directories are. A
 *   process whose configuration names no usable directory fails with that stated
 *   ({@link LocalAccessConfigurationError}); no temporary directory, working directory or
 *   extension storage root is used in its place, and the failure is not a shape a later retry
 *   repairs.
 * - Reads in the process that serves the seat never open a connection: the offered seat is
 *   registered in this process, and a caller here reads the same source directly. That is what
 *   keeps a harness whose sessions are all bindings in one process free of any endpoint.
 * - Both halves release with the access's life. Withdrawing a seat removes its location record and
 *   stops its observations; the endpoint is closed once no seat is left, and `dispose` withdraws
 *   every seat, closes the endpoint, removes a POSIX socket file and refuses every later
 *   connection. A reader that outlived its access is released rather than left listening for a
 *   value that will not come.
 *
 * What this module does not claim: the endpoint is reachable by any process of this machine that
 * can name it, and on Windows there is no authorization knob to change that (the platform exposes
 * none to `node:net`). The verification separates *which* access a caller reached, and it is not an
 * operating-system access control, a cross-user boundary or POSIX authentication. On POSIX the
 * location record is written `0o600` and the runtime directory is created `0o700`, which is the
 * only isolation either platform's file system is asked for here.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { connect, createServer, type Server, type Socket } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ConfigLoadError,
	describeValue,
	isScheduledWait,
	readConfigDocument,
	SCHEDULED_WAIT_TEXT,
	type ConfigParser,
	type ConfigReader,
} from "../core/config";
import type {
	AgentActivity,
	ObservationSource,
	ObservedSession,
	OwnerReference,
	SessionContextReading,
	SessionFacts,
	SessionObservationSink,
	SessionStartup,
} from "../core/protocol";

/** The declared values of one owner, by field name: the whole payload this access carries. */
export type OwnerAccessValues = Readonly<Record<string, boolean>>;

/**
 * One seat: the extension whose declared values an access carries, and the owner they belong to.
 *
 * The pair is what a lookup is keyed by and what both ends check, because an owner key alone is
 * not unique across extensions: two extensions of one process serve the same session's owner.
 */
export interface AccessTarget {
	readonly extension: string;
	readonly owner: string;
}

/**
 * Where one seat's access is, as the process serving it published it.
 *
 * This is the whole of what a location record holds. It records the seat, the endpoint, this
 * access's verification and the publishing process's id, and nothing about what the access
 * carries: a value, a State or business data never reaches a location record.
 */
export interface AccessLocation {
	readonly extension: string;
	readonly owner: string;
	/** The endpoint to connect to: a Windows pipe name, or a socket file beside the runtime directory. */
	readonly endpoint: string;
	/** What this access is checked by; compared by both ends before anything crosses. */
	readonly verification: string;
	/** The process that published this record, as information — never as a liveness decision. */
	readonly pid: number;
}

/**
 * One failure of the runtime directory's own configuration: the framework's shared file cannot be
 * read, or it names no usable `runtimeDir`.
 *
 * It is deliberately not an unavailable access: nothing was attempted, no other directory was
 * tried in its place, and it is not repaired by a later attempt. Its `detail` is the deterministic
 * text of the failure and names the file resolution actually reached.
 */
export class LocalAccessConfigurationError extends Error {
	readonly detail: string;

	constructor(detail: string) {
		super(detail);
		this.name = "LocalAccessConfigurationError";
		this.detail = detail;
	}
}

/**
 * Why one access could not be reached: `no-location` (the seat publishes no record), `endpoint-absent`
 * (a record names an endpoint this machine does not answer for), `refused` (an endpoint refused
 * this seat or this verification) or `closed` (the access this caller reached has been released).
 *
 * These are the transport's own outcomes, and none of them is another: a seat whose owner is not
 * being served is not a seat whose owner is gone, and none of them states anything about an
 * owner's life.
 */
export type LocalAccessUnavailable = "no-location" | "endpoint-absent" | "refused" | "closed";

/** One access this process could not reach, and why. Its `detail` never carries a verification. */
export class LocalAccessUnavailableError extends Error {
	readonly reason: LocalAccessUnavailable;
	readonly detail: string;

	constructor(reason: LocalAccessUnavailable, detail: string) {
		super(detail);
		this.name = "LocalAccessUnavailableError";
		this.reason = reason;
		this.detail = detail;
	}
}

/** Where a runtime directory and its configuration are read from. */
export interface LocalAccessSource {
	/** The framework's shared configuration file; `framework/config.yaml` beside this module by default. */
	readonly configPath?: string;
	/** How the file's text is obtained and parsed; this process's own means by default. */
	readonly reader?: ConfigReader;
	readonly parser?: ConfigParser;
}

/** One seat's declared values, and the changes of them, as the serving process offers them. */
export interface OwnerAccessSource {
	/** The seat's current declared values. */
	values(): OwnerAccessValues;
	/** Observations of the seat's declared values changing; the return stops them. */
	observe(listener: (field: string, value: boolean) => void): () => void;
}

/** What a publisher is built with: its configuration seam, its report channel and its verification. */
export interface OwnerAccessPublisherSeam extends LocalAccessSource {
	/**
	 * Where one configuration failure is reported — once per publisher, in the text the framework
	 * reports its own failures with. The access is simply not offered; nothing is written anywhere
	 * else and no directory is substituted.
	 */
	readonly report?: (message: string) => void;
	/**
	 * How one access's verification is made. It is random by default, and it is stated here rather
	 * than derived because it separates this access from a stale record or another seat's: a value
	 * two different accesses of one seat could share would say nothing.
	 */
	readonly verification?: () => string;
}

/**
 * The serving half: the process offers seats, and every offer is withdrawn with the access's life.
 */
export interface OwnerAccessPublisher {
	/** Offers one seat's declared values; the returned function withdraws exactly that offer. */
	offer(target: AccessTarget, source: OwnerAccessSource): () => void;
	/**
	 * Receives one seat's observations: every word a session in another process delivers for the
	 * sessions that follow that seat's owner is handed to `sink` with the source it arrived over, and
	 * the returned function withdraws exactly that reception.
	 *
	 * A source is one connection this process admitted, numbered in the order it accepted them, and its
	 * end is stated to the same sink: an access that ends — the process that delivered released it, its
	 * connection failed, or this process closed it — is `lost` to the sink, which is what makes the
	 * readings it carried no longer available rather than silently last-known. The recognition is this
	 * side's own: a process that is about to end owes nothing, and a connection that merely stops
	 * delivering is not a loss until it really ends.
	 *
	 * The two halves of one seat are offered separately and live separately — an owner whose values
	 * this process serves and one whose sessions another process only reports are the same seat with
	 * one half each — and the seat, its location record and its endpoint are released when the last
	 * of its halves is withdrawn. A half offered again over a seat that is still there keeps that
	 * seat's verification, so a reader that already read the record is not locked out by it.
	 */
	receive(target: AccessTarget, sink: SessionObservationSink): () => void;
	/** Withdraws every offer, closes the endpoint and refuses every later connection. */
	dispose(): void;
}

/** The reading half: one seat's values, as the caller last heard them. */
export interface OwnerAccessCaller {
	/** The values this caller last heard; empty before the access has answered. */
	values(): OwnerAccessValues;
	/** Asks the access for one field's current value, `undefined` when it states none. */
	request(field: string, waitMs?: number): Promise<boolean | undefined>;
	/** Observations of the seat's values changing, as the access pushed them; the return stops them. */
	observe(listener: (field: string, value: boolean) => void): () => void;
	/**
	 * Delivers one reading of one session this process runs to the process that serves this seat.
	 *
	 * It is the other direction of the same access and it carries the session's own observation —
	 * its facts, the owner it follows and the readings known for it — and nothing else. Nothing is
	 * answered and nothing is expected back: a reading states what a session was observed to be, so
	 * there is no acknowledgement to wait for, no value to read and no write of anything anywhere.
	 * A reading this access does not receive — this caller has ended, or the seat serves values alone
	 * — is dropped rather than carried.
	 */
	deliver(reading: ObservedSession): void;
	/**
	 * Whether this caller's access has ended: the seat was withdrawn, the caller was released, or
	 * the connection closed. It is what tells a reader to stop expecting values, and it is reported
	 * as soon as the access is withdrawn rather than at the next request.
	 */
	ended(): boolean;
	/** Releases this caller's connection; every later request fails as `closed`. */
	dispose(): void;
}

/** What opening one seat's access is asked for. */
export interface OwnerAccessCallerOptions extends LocalAccessSource {
	readonly target: AccessTarget;
	/** The whole budget this open may spend, in milliseconds. */
	readonly waitMs?: number;
	/** Releases the open's own waits; an open that is released fails as `closed`. */
	readonly signal?: AbortSignal;
}

/** The framework's shared configuration file: `framework/config.yaml`, beside this module's own directory. */
const SHARED_CONFIGURATION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "config.yaml");

/** How long an open waits for a location record and then for the endpoint, when none is declared. */
const DEFAULT_WAIT_MS = 5000;

/** How often a waiting open looks again for a location record. */
const WAIT_POLL_MS = 25;

/** How long a connection that has not stated its hello is held before it is refused. */
const HANDSHAKE_BUDGET_MS = 2000;

/** The prefix of every Windows pipe name this module binds; the rest is the access's random id. */
const PIPE_PREFIX = "my-agent-toolkit-access-";

/** The prefix of every location record; the rest is the seat's own digest. */
const LOCATION_PREFIX = "owner-access-";

/** The bytes of one access's verification. */
const VERIFICATION_BYTES = 32;

/**
 * One seat as this process is offering it, as a caller in this process reads it: the declared values
 * another process reads, and where the observations a session in this process delivers are handed.
 *
 * It is the same seat a caller in another process reaches, and a caller here uses it directly rather
 * than opening a connection to itself: the values it reads are the source's own current ones, and a
 * reading it delivers lands on the sink without a frame.
 */
interface ProcessSeat {
	readonly values?: OwnerAccessSource;
	readonly readings?: SessionObservationSink;
}

/**
 * The seats this process is serving right now, so a caller in this process reads the same source
 * directly rather than opening a connection to itself.
 *
 * It is keyed on `globalThis` for the same reason the marker area and pi's text imports are: one
 * process may hold several module graphs of this framework, and they must agree about what this
 * process is serving.
 */
const PROCESS_SEATS_KEY: unique symbol = Symbol.for("my-agent-toolkit.semantic-extensions.owner-access");

/**
 * The next source number this process hands out, wherever in it the module graph asking stands.
 *
 * A source has to be ordered against every other source whose readings reach the same seat, and the
 * seat itself is process-wide (see {@link PROCESS_SEATS_KEY}): an in-process caller of one module
 * graph delivers into the sink a host of another graph offered, so the numbering cannot be each
 * graph's own. It is parked on `globalThis` for that reason, and it only ever grows — a number is
 * never reused, so an ended source can never be confused with the next one.
 */
const SOURCE_COUNTER_KEY: unique symbol = Symbol.for("my-agent-toolkit.semantic-extensions.observation-source");

/** The one name a seat is keyed by, in the process registry and in its location record's file name. */
function seatKey(target: AccessTarget): string {
	return `${target.extension}\u0000${target.owner}`;
}

/** The next source number this process hands out, so sources are ordered by when this process took them up. */
function nextSource(): ObservationSource {
	const registry = globalThis as unknown as Record<symbol, { value: number } | undefined>;
	const counter = registry[SOURCE_COUNTER_KEY] ?? { value: 0 };
	registry[SOURCE_COUNTER_KEY] = counter;
	counter.value += 1;
	return counter.value;
}

/** How one seat is named in failure text: both halves, never the verification. */
function describeTarget(target: AccessTarget): string {
	return `"${target.extension}" in owner "${target.owner}"`;
}

/** The location record of one seat: a digest of the seat itself, so both ends compute the same name. */
function locationFileOf(runtimeDirectory: string, target: AccessTarget): string {
	const digest = createHash("sha256").update(seatKey(target), "utf8").digest("hex").slice(0, 32);
	return join(runtimeDirectory, `${LOCATION_PREFIX}${digest}.json`);
}

/** One frame, as this module writes it: one JSON object per line. */
type Frame = Record<string, unknown>;

/** How one frame is written onto a connection. */
function encoded(frame: Frame): string {
	return `${JSON.stringify(frame)}\n`;
}

/** The frame one line states, or `undefined` when the line is not one object this module reads. */
function decode(line: string): Frame | undefined {
	if (line.length === 0) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
	return parsed as Frame;
}

/** The seat one frame states, or `undefined` when it states none this module reads. */
function targetOf(frame: Frame | undefined): AccessTarget | undefined {
	if (frame === undefined) return undefined;
	const { extension, owner } = frame;
	if (typeof extension !== "string" || extension.length === 0) return undefined;
	if (typeof owner !== "string" || owner.length === 0) return undefined;
	return { extension, owner };
}

/** One non-empty string a frame member states, or `undefined` when it states none this module reads. */
function textOf(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A frame member as one plain record, or `undefined` when it is not one. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/** The owner reference one frame member states, or `undefined` when it states none this module reads. */
function ownerOf(value: unknown): OwnerReference | undefined {
	const record = recordOf(value);
	if (record === undefined) return undefined;
	if (record["kind"] === "unresolved") return { kind: "unresolved" };
	if (record["kind"] !== "owner" && record["kind"] !== "inherited") return undefined;
	const key = textOf(record["key"]);
	return key === undefined ? undefined : { kind: record["kind"], key };
}

/** The startup facts one frame member states, or `undefined` when it states none this module reads. */
function startupOf(value: unknown): SessionStartup | undefined {
	const record = recordOf(value);
	if (record === undefined) return undefined;
	let model: SessionStartup["model"];
	if (record["model"] !== undefined) {
		const stated = recordOf(record["model"]);
		const provider = stated === undefined ? undefined : textOf(stated["provider"]);
		const id = stated === undefined ? undefined : textOf(stated["model"]);
		if (provider === undefined || id === undefined) return undefined;
		model = { provider, model: id };
	}
	const effort = textOf(record["effort"]);
	if (record["effort"] !== undefined && effort === undefined) return undefined;
	if (model === undefined && effort === undefined) return undefined;
	return { ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }) };
}

/** One session's facts as one frame member states them, or `undefined` when it states none this module reads. */
function factsOf(value: unknown): SessionFacts | undefined {
	const record = recordOf(value);
	if (record === undefined) return undefined;
	const sessionId = textOf(record["sessionId"]);
	const kind = record["kind"];
	const unavailable = record["unavailable"];
	if (sessionId === undefined || (kind !== "main" && kind !== "sub")) return undefined;
	if (!Array.isArray(unavailable) || !unavailable.every(one => typeof one === "string")) return undefined;
	const startup = startupOf(record["startup"]);
	if (record["startup"] !== undefined && startup === undefined) return undefined;
	// The facts a host states only sometimes: a member that is there must be a name, and a member
	// that is absent stays absent rather than being filled in with an empty one.
	const named: readonly (keyof SessionFacts)[] = ["parentSessionId", "name", "taskName", "agentName", "agentId"];
	const stated: Record<string, string> = {};
	for (const member of named) {
		const raw = record[member];
		if (raw === undefined) continue;
		const text = textOf(raw);
		if (text === undefined) return undefined;
		stated[member] = text;
	}
	return {
		sessionId,
		kind,
		...stated,
		...(startup === undefined ? {} : { startup }),
		unavailable: unavailable as readonly string[],
	};
}

/** One context reading as one frame member states it, or `undefined` when it states none this module reads. */
function contextOf(value: unknown): SessionContextReading | undefined {
	if (value === undefined) return undefined;
	const record = recordOf(value);
	if (record === undefined) return undefined;
	const tokens = record["tokens"];
	if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens < 0) return undefined;
	const provider = textOf(record["provider"]);
	const model = textOf(record["model"]);
	if (record["provider"] !== undefined && provider === undefined) return undefined;
	if (record["model"] !== undefined && model === undefined) return undefined;
	return {
		tokens,
		...(provider === undefined ? {} : { provider }),
		...(model === undefined ? {} : { model }),
	};
}

/** One session's observation as one frame member states it, or `undefined` when it states none this module reads. */
function readingOf(frame: Frame): ObservedSession | undefined {
	const session = factsOf(frame["session"]);
	const owner = ownerOf(frame["owner"]);
	if (session === undefined || owner === undefined) return undefined;
	const activity = frame["activity"];
	if (activity !== undefined && activity !== "working" && activity !== "idle") return undefined;
	const context = contextOf(frame["context"]);
	if (frame["context"] !== undefined && context === undefined) return undefined;
	return {
		session,
		owner,
		...(activity === undefined ? {} : { activity: activity as AgentActivity }),
		...(context === undefined ? {} : { context }),
	};
}

/** One session's observation as the frame this module delivers it in. */
function encodedReading(reading: ObservedSession): string {
	return encoded({
		t: "observed",
		session: reading.session,
		owner: reading.owner,
		...(reading.activity === undefined ? {} : { activity: reading.activity }),
		...(reading.context === undefined ? {} : { context: reading.context }),
	});
}

/** The wait budget one open or one request runs under. */
function resolveWait(declared: number | undefined): number {
	if (declared === undefined) return DEFAULT_WAIT_MS;
	if (!isScheduledWait(declared)) {
		throw new LocalAccessConfigurationError(
			`the access wait was declared as ${describeValue(declared)}, but a wait budget is ${SCHEDULED_WAIT_TEXT}`,
		);
	}
	return declared;
}

/** One unavailable outcome, with the seat it concerns named — never a verification. */
function unavailable(reason: LocalAccessUnavailable, detail: string): LocalAccessUnavailableError {
	return new LocalAccessUnavailableError(reason, detail);
}

/** The outcome a released signal already states, or `undefined` when the wait may still run. */
function released(signal: AbortSignal | undefined): LocalAccessUnavailableError | undefined {
	return signal !== undefined && signal.aborted
		? unavailable("closed", "the access wait was released before the access answered")
		: undefined;
}

/**
 * The directory the framework's own runtime files live in: the `runtimeDir` value of the shared
 * configuration file.
 *
 * A relative value is resolved against the configuration file's own directory, not against the
 * working directory of whatever process reads it, so two processes that read the same file agree
 * on the directory whatever their working directories are. An absolute value is used as declared.
 *
 * Every way of not having one fails here, with the file resolution actually reached named in the
 * text: no file, no `runtimeDir` in it, and a value that is not a non-empty string. Nothing is
 * substituted for a missing value — not a temporary directory, not the working directory, and not
 * an extension's storage root — because a runtime directory that a caller did not state is one
 * two processes cannot agree on.
 */
export function resolveRuntimeDirectory(source: LocalAccessSource = {}): string {
	const configPath = source.configPath ?? SHARED_CONFIGURATION_PATH;
	let document: Readonly<Record<string, unknown>> | undefined;
	try {
		document = readConfigDocument(configPath, { reader: source.reader, parser: source.parser });
	} catch (error) {
		if (error instanceof ConfigLoadError) throw new LocalAccessConfigurationError(error.detail);
		throw error;
	}

	const declared = document?.["runtimeDir"];
	if (declared === undefined) {
		throw new LocalAccessConfigurationError(
			document === undefined
				? `the framework's shared configuration file "${configPath}" does not exist, and no other directory is used in its place: this process has no runtime directory for its local access`
				: `the framework's shared configuration file "${configPath}" declares no "runtimeDir", and no other directory is used in its place: this process has no runtime directory for its local access`,
		);
	}
	if (typeof declared !== "string" || declared.trim().length === 0) {
		throw new LocalAccessConfigurationError(
			`the framework's shared configuration file "${configPath}" declares "runtimeDir" as ${describeValue(declared)}, but a runtime directory is a non-empty string`,
		);
	}
	return isAbsolute(declared) ? declared : resolve(dirname(configPath), declared);
}

/**
 * The seat this process is serving right now, as the source its caller in this process reads.
 *
 * It is the same-process half of reading: a seat offered here is answered by the source itself, so
 * a caller here pays no endpoint, no record and no configuration read.
 */
export function localOwnerAccess(target: AccessTarget): OwnerAccessSource | undefined {
	return processSeats()?.get(seatKey(target))?.values;
}

/** The seats this process is offering, as the one process-wide registry holds them. */
function processSeats(): Map<string, ProcessSeat> | undefined {
	const registry = globalThis as unknown as Record<symbol, Map<string, ProcessSeat> | undefined>;
	return registry[PROCESS_SEATS_KEY];
}

/** Records one seat's half in this process's registry, so a caller here reaches it without a frame. */
function registerProcessSeat(key: string, half: ProcessSeat): void {
	const registry = globalThis as unknown as Record<symbol, Map<string, ProcessSeat> | undefined>;
	const seats = registry[PROCESS_SEATS_KEY] ?? new Map<string, ProcessSeat>();
	registry[PROCESS_SEATS_KEY] = seats;
	Object.assign(seats.get(key) ?? {}, half);
	seats.set(key, seats.get(key) ?? half);
}

/**
 * Drops the half one withdrawal owned, and the seat itself once no half is left.
 *
 * `held` is the half the withdrawing party was handed, so a seat that was offered again since is
 * left as the newer offer left it rather than cleared by the stale withdrawal.
 */
function releaseProcessSeat(key: string, half: keyof ProcessSeat, held: unknown): void {
	const seats = processSeats();
	const seat = seats?.get(key);
	if (seats === undefined || seat === undefined || seat[half] !== held) return;
	delete seat[half];
	if (seat.values === undefined && seat.readings === undefined) seats.delete(key);
}

/**
 * A caller that reaches a seat without an endpoint: the source itself, in this process.
 *
 * Everything it answers is the source's own current value, so a caller here observes a change
 * because the value changed, not because a frame arrived, and a reading it delivers reaches this
 * process's own sink the same way. That is the whole difference between this process and another one.
 *
 * It is a source like any other — one this process took up, numbered in the same order — because a
 * reading it delivers is still one delivering party's word about one session. What it never does is
 * state that source's end: a caller released here was this process's own reading of a session this
 * process runs, and releasing the caller changes nothing about what that session was observed to be.
 */
function directCaller(seat: ProcessSeat, source: OwnerAccessSource): OwnerAccessCaller {
	const asSource = nextSource();
	let ended = false;
	return {
		values: () => source.values(),
		request: (field: string) => Promise.resolve(source.values()[field]),
		observe: listener => source.observe(listener),
		deliver: reading => {
			if (!ended) seat.readings?.adopt(asSource, reading);
		},
		ended: () => ended,
		dispose: () => {
			ended = true;
		},
	};
}

/** One half of one seat as the serving process holds it. */
interface ServedValues {
	readonly source: OwnerAccessSource;
	readonly stopObserving: () => void;
}

/** One seat as the serving process holds it: the halves offered on it, and the access they share. */
interface ServedSeat {
	readonly target: AccessTarget;
	readonly verification: string;
	values?: ServedValues;
	readings?: SessionObservationSink;
}

/** One connection the serving process has accepted, and the seat it was admitted for. */
interface AcceptedConnection {
	readonly socket: Socket;
	/**
	 * The source this connection is, numbered where this process accepted it.
	 *
	 * Every accepted connection is a source from the moment it arrives rather than from its hello: what
	 * the number is for is ordering the readings that reach one seat, and a connection that is refused
	 * or never states a hello delivers none. Its end is reported for exactly the connections that were
	 * admitted for a seat.
	 */
	readonly source: ObservationSource;
	seat: string | undefined;
}

/**
 * The serving half of one process's access: one endpoint, the seats offered on it, and the release
 * of both.
 *
 * Building it does nothing at all: no directory is created, no file is read and no endpoint is
 * bound until the first seat is offered. That is what lets an adapter construct it for every
 * process without a harness that never offers a seat paying for one.
 */
class OwnerAccessHost {
	readonly #seam: OwnerAccessPublisherSeam;
	readonly #seats = new Map<string, ServedSeat>();
	readonly #connections = new Set<AcceptedConnection>();
	/** The endpoint this host bound, or `undefined` while it has none. */
	#endpoint: string | undefined;
	/** The directory the endpoint's records live in, once a bind has landed. */
	#runtimeDirectory: string | undefined;
	#server: Server | undefined;
	#starting: Promise<void> | undefined;
	/** Which bind is current; every close makes an in-flight one stale, so it closes itself. */
	#binding = 0;
	#disposed = false;
	/** The one failure that stopped this host from serving; reported once and then remembered. */
	#unavailable: string | undefined;

	constructor(seam: OwnerAccessPublisherSeam) {
		this.#seam = seam;
	}

	offer(target: AccessTarget, source: OwnerAccessSource): () => void {
		if (this.#disposed || this.#unavailable !== undefined) return () => {};
		const key = seatKey(target);
		const seat = this.#seat(key, target);
		seat.values?.stopObserving();
		const held: ServedValues = {
			source,
			stopObserving: source.observe((field, value) => this.#publishChange(key, field, value)),
		};
		seat.values = held;
		registerProcessSeat(key, { values: source });
		// The endpoint is bound in this process's own time; the record is written as soon as it is
		// bound, and every seat offered before that is written then too.
		void this.#published();
		return () => this.#withdrawValues(key, seat, held);
	}

	receive(target: AccessTarget, sink: SessionObservationSink): () => void {
		if (this.#disposed || this.#unavailable !== undefined) return () => {};
		const key = seatKey(target);
		const seat = this.#seat(key, target);
		seat.readings = sink;
		registerProcessSeat(key, { readings: sink });
		void this.#published();
		return () => this.#withdrawReadings(key, seat, sink);
	}

	/** The seat one target is served under, as this host holds it: one that is already there is kept. */
	#seat(key: string, target: AccessTarget): ServedSeat {
		const held = this.#seats.get(key);
		if (held !== undefined) return held;
		const seat: ServedSeat = {
			target,
			// The verification separates this access from a stale record or another seat's, and it is
			// minted once per seat: a half offered over a seat that is still there keeps the one a
			// reader already read, rather than locking that reader out of an access that never moved.
			verification: (this.#seam.verification ?? (() => randomBytes(VERIFICATION_BYTES).toString("hex")))(),
		};
		this.#seats.set(key, seat);
		return seat;
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		for (const [key] of [...this.#seats]) this.#dropSeat(key);
		this.#closeEndpoint();
	}

	/** Binds the endpoint if it is not bound, then publishes every seat offered so far. */
	async #published(): Promise<void> {
		try {
			await this.#listen();
			for (const seat of this.#seats.values()) this.#writeLocation(seat);
		} catch (error) {
			if (this.#unavailable !== undefined) return;
			this.#unavailable = error instanceof Error ? error.message : String(error);
			for (const [key] of [...this.#seats]) this.#dropSeat(key);
			this.#seam.report?.(this.#unavailable);
		}
	}

	async #listen(): Promise<void> {
		if (this.#server !== undefined) return;
		if (this.#starting === undefined) this.#starting = this.#bind();
		await this.#starting;
	}

	async #bind(): Promise<void> {
		const generation = this.#binding;
		const runtimeDirectory = this.#runtimeDirectory ?? resolveRuntimeDirectory(this.#seam);
		// The configured directory is created when it is missing, because it is the path the
		// configuration stated; nothing else is ever used as this process's runtime directory.
		mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });

		const id = randomBytes(8).toString("hex");
		const endpoint = process.platform === "win32"
			? `\\\\.\\pipe\\${PIPE_PREFIX}${id}`
			: join(runtimeDirectory, `access-${id}.sock`);
		const server = createServer(socket => this.#accepted(socket));
		const bound = Promise.withResolvers<void>();
		server.once("error", bound.reject);
		server.listen(endpoint, () => {
			server.off("error", bound.reject);
			bound.resolve();
		});
		await bound.promise;

		if (generation !== this.#binding) {
			// The last seat was withdrawn while this endpoint was being bound: it is closed here
			// rather than left bound with nobody offering on it.
			server.close();
			if (process.platform !== "win32") rmSync(endpoint, { force: true });
			return;
		}
		// A serving endpoint outlives any one connection: an error on it is not a reason to stop
		// serving the seats that are still offered, and an unhandled one would end the process.
		server.on("error", () => {});
		this.#runtimeDirectory = runtimeDirectory;
		this.#server = server;
		this.#endpoint = endpoint;
	}

	/** Withdraws every half of one seat, as this host's own endpoint failing does. */
	#dropSeat(key: string): void {
		const seat = this.#seats.get(key);
		if (seat === undefined) return;
		if (seat.values !== undefined) this.#withdrawValues(key, seat, seat.values);
		if (seat.readings !== undefined) this.#withdrawReadings(key, seat, seat.readings);
	}

	/** Withdraws one seat's declared-values half: its observations, and the seat if nothing is left. */
	#withdrawValues(key: string, seat: ServedSeat, held: ServedValues): void {
		if (this.#seats.get(key) !== seat || seat.values !== held) return;
		seat.values = undefined;
		held.stopObserving();
		releaseProcessSeat(key, "values", held.source);
		this.#releaseIfEmpty(key, seat);
	}

	/** Withdraws one seat's observations half, and the seat with it if nothing is left. */
	#withdrawReadings(key: string, seat: ServedSeat, held: SessionObservationSink): void {
		if (this.#seats.get(key) !== seat || seat.readings !== held) return;
		seat.readings = undefined;
		releaseProcessSeat(key, "readings", held);
		this.#releaseIfEmpty(key, seat);
	}

	/** Releases a seat nothing is offered on any more: its record, its readers and its endpoint. */
	#releaseIfEmpty(key: string, seat: ServedSeat): void {
		if (this.#seats.get(key) !== seat || seat.values !== undefined || seat.readings !== undefined) return;
		this.#seats.delete(key);
		for (const connection of this.#connections) {
			if (connection.seat !== key) continue;
			// A reader of a seat that is gone is released rather than left listening for a value
			// that will not come. Its end states nothing to the seat: the half that would have received
			// it is the one being withdrawn here.
			connection.seat = undefined;
			connection.socket.destroy();
		}
		if (this.#runtimeDirectory !== undefined) {
			rmSync(locationFileOf(this.#runtimeDirectory, seat.target), { force: true });
		}
		if (this.#seats.size === 0) this.#closeEndpoint();
	}

	/** Closes the endpoint once nothing is offered on it: its connections, its listener and its file. */
	#closeEndpoint(): void {
		if (this.#seats.size > 0) return;
		// Every bind still in flight is now stale: whatever it lands with is closed on landing.
		this.#binding += 1;
		this.#starting = undefined;
		for (const connection of [...this.#connections]) connection.socket.destroy();
		this.#connections.clear();
		this.#closeBound();
	}

	/** Closes the endpoint this host bound, if one landed. */
	#closeBound(): void {
		const server = this.#server;
		const endpoint = this.#endpoint;
		this.#server = undefined;
		this.#endpoint = undefined;
		if (server === undefined) return;
		server.close();
		if (endpoint !== undefined && process.platform !== "win32") rmSync(endpoint, { force: true });
	}

	/** Writes one seat's location record: staged beside it, then renamed into place. */
	#writeLocation(seat: ServedSeat): void {
		const runtimeDirectory = this.#runtimeDirectory;
		const endpoint = this.#endpoint;
		if (runtimeDirectory === undefined || endpoint === undefined) return;

		const record: AccessLocation = {
			extension: seat.target.extension,
			owner: seat.target.owner,
			endpoint,
			verification: seat.verification,
			pid: process.pid,
		};
		const file = locationFileOf(runtimeDirectory, seat.target);
		const staging = `${file}.${process.pid.toString()}.${randomBytes(4).toString("hex")}.staged`;
		try {
			writeFileSync(staging, JSON.stringify(record), { encoding: "utf8", mode: 0o600 });
			renameSync(staging, file);
		} catch (error) {
			rmSync(staging, { force: true });
			throw error;
		}
	}

	/** Pushes one seat's change to every connection admitted for it. */
	#publishChange(key: string, field: string, value: boolean): void {
		const change = encoded({ t: "changed", field, value });
		for (const connection of this.#connections) {
			if (connection.seat !== key) continue;
			connection.socket.write(change);
		}
	}

	/** One accepted connection: its hello decides which seat it may read, or it is refused. */
	#accepted(socket: Socket): void {
		socket.setEncoding("utf8");
		const connection: AcceptedConnection = { socket, source: nextSource(), seat: undefined };
		this.#connections.add(connection);
		let buffer = "";
		let refused = false;

		const refuse = (detail: string): void => {
			refused = true;
			socket.end(encoded({ t: "refused", detail }));
		};
		// A connection that never states its hello holds nothing: it is released on a budget.
		const budget = setTimeout(() => socket.destroy(), HANDSHAKE_BUDGET_MS);

		socket.on("data", (chunk: string) => {
			buffer += chunk;
			let end = buffer.indexOf("\n");
			while (end >= 0 && !refused) {
				const line = buffer.slice(0, end);
				buffer = buffer.slice(end + 1);
				this.#frame(connection, line, refuse, () => clearTimeout(budget));
				end = buffer.indexOf("\n");
			}
		});
		socket.on("error", () => socket.destroy());
		socket.on("close", () => {
			clearTimeout(budget);
			this.#connections.delete(connection);
			// This side's own recognition of the source's end, and the whole of it: a process about to
			// end owes no goodbye, and a connection that failed ends exactly as one that was closed. A
			// connection that was never admitted, and a seat that is no longer offered, hold nothing to
			// state it to.
			const seat = connection.seat === undefined ? undefined : this.#seats.get(connection.seat);
			seat?.readings?.lost(connection.source);
		});
	}

	/** One frame of one connection, in the two states a connection has: before and after its hello. */
	#frame(connection: AcceptedConnection, line: string, refuse: (detail: string) => void, admitted: () => void): void {
		const frame = decode(line);
		if (connection.seat === undefined) {
			const target = targetOf(frame);
			if (target === undefined || frame === undefined) {
				refuse("this access serves one declared hello and nothing before it");
				return;
			}
			const key = seatKey(target);
			const seat = this.#seats.get(key);
			if (seat === undefined || seat.verification !== frame["verification"]) {
				refuse(`this access does not serve ${describeTarget(target)}`);
				return;
			}
			connection.seat = key;
			admitted();
			connection.socket.write(
				encoded({
					t: "welcome",
					extension: target.extension,
					owner: target.owner,
					values: seat.values?.source.values() ?? {},
				}),
			);
			return;
		}

		const seat = this.#seats.get(connection.seat);
		if (seat === undefined) {
			// The seat was withdrawn while this connection was open; `#releaseIfEmpty` releases it too.
			connection.socket.destroy();
			return;
		}
		const id = frame?.["id"];
		const field = frame?.["field"];
		if (frame?.["t"] === "observed") {
			const reading = readingOf(frame);
			if (reading === undefined || seat.readings === undefined) {
				refuse(`this access receives no observation for ${describeTarget(seat.target)}`);
				return;
			}
			// A connection enters the observation scope its seat's target allows and nothing else:
			// the session that delivered this reading has to be one that follows the owner this seat
			// is, so one seat can never carry another owner's sessions.
			if (reading.owner.kind !== "inherited" || reading.owner.key !== seat.target.owner) {
				refuse(`this access carries the sessions that follow ${describeTarget(seat.target)} and no other`);
				return;
			}
			seat.readings.adopt(connection.source, reading);
			return;
		}
		if (frame?.["t"] !== "read" || typeof id !== "number" || !Number.isInteger(id) || typeof field !== "string") {
			refuse("this access serves one declared read and nothing else");
			return;
		}
		const value = seat.values?.source.values()[field];
		connection.socket.write(encoded({ t: "value", id, field, ...(typeof value === "boolean" ? { value } : {}) }));
	}
}

/**
 * Builds the serving half of this process's access.
 *
 * Nothing happens here: the endpoint is bound and the runtime directory is created when the first
 * seat is offered, so a process that never offers one holds no endpoint, no directory and no file.
 */
export function createOwnerAccessPublisher(seam: OwnerAccessPublisherSeam = {}): OwnerAccessPublisher {
	const host = new OwnerAccessHost(seam);
	return {
		offer: (target, source) => host.offer(target, source),
		receive: (target, sink) => host.receive(target, sink),
		dispose: () => host.dispose(),
	};
}

/** The location record one seat's file states, or `undefined` when it states none this module reads. */
function readLocation(file: string, target: AccessTarget): AccessLocation | undefined {
	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
	const frame = decode(text.trim());
	if (frame === undefined) return undefined;
	const { endpoint, verification } = frame;
	if (typeof endpoint !== "string" || endpoint.length === 0) return undefined;
	if (typeof verification !== "string" || verification.length === 0) return undefined;
	const stated = targetOf(frame);
	// A record that names another seat is not this seat's: it is read as no record at all rather
	// than followed, which is what keeps one owner's access from being reached as another's.
	if (stated === undefined || seatKey(stated) !== seatKey(target)) return undefined;
	return {
		extension: stated.extension,
		owner: stated.owner,
		endpoint,
		verification,
		pid: typeof frame["pid"] === "number" ? frame["pid"] : 0,
	};
}

/** Waits until a seat's location record appears, or the budget runs out. */
async function waitForLocation(
	file: string,
	target: AccessTarget,
	deadline: number,
	signal: AbortSignal | undefined,
): Promise<AccessLocation> {
	for (;;) {
		const stop = released(signal);
		if (stop !== undefined) throw stop;
		const record = readLocation(file, target);
		if (record !== undefined) return record;
		if (Date.now() >= deadline) {
			throw unavailable(
				"no-location",
				`no process published an access for ${describeTarget(target)} under "${dirname(file)}" within the wait`,
			);
		}
		const pause = Promise.withResolvers<void>();
		setTimeout(pause.resolve, WAIT_POLL_MS);
		await pause.promise;
	}
}

/** Opens one endpoint, or answers why it could not be reached. */
async function connectWithin(
	endpoint: string,
	target: AccessTarget,
	deadline: number,
	signal: AbortSignal | undefined,
): Promise<Socket> {
	const stop = released(signal);
	if (stop !== undefined) throw stop;
	const opened = Promise.withResolvers<Socket>();
	const socket = connect(endpoint);
	const timer = setTimeout(() => {
		socket.destroy();
		opened.reject(unavailable("endpoint-absent", `the access endpoint of ${describeTarget(target)} did not answer within the wait`));
	}, Math.max(deadline - Date.now(), 1));
	const onRelease = (): void => {
		clearTimeout(timer);
		socket.destroy();
		opened.reject(unavailable("closed", "the access wait was released before the access answered"));
	};
	signal?.addEventListener("abort", onRelease, { once: true });
	socket.once("connect", () => {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onRelease);
		opened.resolve(socket);
	});
	socket.once("error", error => {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onRelease);
		const code = error instanceof Error && "code" in error ? String(error.code) : error.message;
		opened.reject(
			unavailable("endpoint-absent", `the access endpoint of ${describeTarget(target)} is not answering (${code})`),
		);
	});
	return opened.promise;
}

/** The reading half of one connected access. */
class RemoteCaller implements OwnerAccessCaller {
	readonly #socket: Socket;
	readonly #target: AccessTarget;
	#values: OwnerAccessValues;
	readonly #observers = new Set<(field: string, value: boolean) => void>();
	readonly #pending = new Map<
		number,
		{ readonly settle: (value: boolean | undefined) => void; readonly fail: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }
	>();
	#nextRequest = 1;
	#closed = false;
	#buffer = "";

	constructor(socket: Socket, target: AccessTarget, values: OwnerAccessValues, carried: string) {
		this.#socket = socket;
		this.#target = target;
		this.#values = values;
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => this.#read(this.#buffer + chunk));
		socket.on("error", () => this.#release("the access connection failed"));
		socket.on("close", () => this.#release("the access connection was closed"));
		if (carried.length > 0) this.#read(carried);
	}

	values(): OwnerAccessValues {
		return this.#values;
	}

	request(field: string, waitMs?: number): Promise<boolean | undefined> {
		if (this.#closed) {
			return Promise.reject(unavailable("closed", `the access for ${describeTarget(this.#target)} has been released`));
		}
		const budget = resolveWait(waitMs);
		const id = this.#nextRequest;
		this.#nextRequest += 1;
		const answered = Promise.withResolvers<boolean | undefined>();
		const timer = setTimeout(() => {
			this.#pending.delete(id);
			answered.reject(
				unavailable("endpoint-absent", `the access for ${describeTarget(this.#target)} did not answer within the wait`),
			);
		}, budget);
		this.#pending.set(id, { settle: answered.resolve, fail: answered.reject, timer });
		this.#socket.write(encoded({ t: "read", id, field }));
		return answered.promise;
	}

	observe(listener: (field: string, value: boolean) => void): () => void {
		this.#observers.add(listener);
		return () => {
			this.#observers.delete(listener);
		};
	}

	deliver(reading: ObservedSession): void {
		// Nothing is waited for and nothing is asked back: a reading the seat does not receive closes
		// the connection on the serving side, and this caller's own end is what reports it.
		if (this.#closed) return;
		this.#socket.write(encodedReading(reading));
	}

	ended(): boolean {
		return this.#closed;
	}

	dispose(): void {
		this.#release("the access caller was released");
	}

	/** One chunk of whatever the access pushed: whole frames, and whatever of the last one is still coming. */
	#read(chunk: string): void {
		this.#buffer = chunk;
		let end = this.#buffer.indexOf("\n");
		while (end >= 0) {
			const line = this.#buffer.slice(0, end);
			this.#buffer = this.#buffer.slice(end + 1);
			this.#frame(decode(line));
			end = this.#buffer.indexOf("\n");
		}
	}

	#frame(frame: Frame | undefined): void {
		if (frame === undefined) return;
		if (frame["t"] === "changed") {
			const field = frame["field"];
			const value = frame["value"];
			if (typeof field !== "string" || typeof value !== "boolean") return;
			this.#values = { ...this.#values, [field]: value };
			for (const listener of [...this.#observers]) listener(field, value);
			return;
		}
		if (frame["t"] !== "value") return;
		const id = frame["id"];
		if (typeof id !== "number") return;
		const pending = this.#pending.get(id);
		if (pending === undefined) return;
		this.#pending.delete(id);
		clearTimeout(pending.timer);
		const value = frame["value"];
		if (typeof value === "boolean") {
			const field = frame["field"];
			if (typeof field === "string") this.#values = { ...this.#values, [field]: value };
		}
		pending.settle(typeof value === "boolean" ? value : undefined);
	}

	/** Ends this caller: its socket, its waits, and every later request. */
	#release(detail: string): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#socket.destroy();
		for (const [id, pending] of [...this.#pending]) {
			this.#pending.delete(id);
			clearTimeout(pending.timer);
			pending.fail(unavailable("closed", `${detail}; the access for ${describeTarget(this.#target)} is closed`));
		}
		this.#observers.clear();
	}
}

/** Waits for the access's answer to one hello: the values it states and whatever arrived behind them. */
function welcomeWithin(
	socket: Socket,
	target: AccessTarget,
	deadline: number,
	signal: AbortSignal | undefined,
): Promise<{ readonly values: OwnerAccessValues; readonly carried: string }> {
	const stop = released(signal);
	if (stop !== undefined) return Promise.reject(stop);
	const answered = Promise.withResolvers<{ readonly values: OwnerAccessValues; readonly carried: string }>();
	let buffer = "";
	const finish = (): void => {
		clearTimeout(timer);
		socket.off("data", onData);
		socket.off("close", onClose);
		socket.off("error", onClose);
	};
	const onData = (chunk: string): void => {
		buffer += chunk;
		const end = buffer.indexOf("\n");
		if (end < 0) return;
		const frame = decode(buffer.slice(0, end));
		if (frame === undefined) return;
		if (frame["t"] === "welcome") {
			const stated = targetOf(frame);
			if (stated === undefined || seatKey(stated) !== seatKey(target)) {
				finish();
				socket.destroy();
				answered.reject(unavailable("refused", `the access answered for another seat than ${describeTarget(target)}`));
				return;
			}
			const statedValues = frame["values"];
			const values: Record<string, boolean> = {};
			if (typeof statedValues === "object" && statedValues !== null && !Array.isArray(statedValues)) {
				for (const [field, value] of Object.entries(statedValues)) {
					if (typeof value === "boolean") values[field] = value;
				}
			}
			finish();
			answered.resolve({ values, carried: buffer.slice(end + 1) });
			return;
		}
		if (frame["t"] === "refused") {
			finish();
			socket.destroy();
			answered.reject(unavailable("refused", `the access refused ${describeTarget(target)}`));
		}
	};
	const onClose = (): void => {
		finish();
		answered.reject(unavailable("endpoint-absent", `the access for ${describeTarget(target)} closed before it answered`));
	};
	const timer = setTimeout(onClose, Math.max(deadline - Date.now(), 1));
	socket.setEncoding("utf8");
	socket.on("data", onData);
	socket.once("close", onClose);
	socket.once("error", onClose);
	return answered.promise;
}

/**
 * Opens one seat's access and reads its declared values.
 *
 * A seat this process is serving is answered directly, with no location record, no endpoint and no
 * configuration read at all — that is the same-process call. Otherwise the runtime directory is
 * resolved from the shared configuration (a directory it cannot state is a
 * {@link LocalAccessConfigurationError}, never a substituted directory), the seat's location record
 * is awaited within the budget, the endpoint it names is opened, and this access's verification is
 * stated along with the seat.
 *
 * Every way of not reaching the access is one of {@link LocalAccessUnavailable}: no record, no
 * answer at the endpoint, a refusal, or a release. None of them is evidence about the owner's own
 * life, and nothing here writes to the serving process.
 */
export async function openOwnerAccess(options: OwnerAccessCallerOptions): Promise<OwnerAccessCaller> {
	// The budget is settled first: a wait the framework cannot schedule is refused the same way
	// whether the seat is served here or elsewhere.
	const waitMs = resolveWait(options.waitMs);
	const local = processSeats()?.get(seatKey(options.target));
	if (local?.values !== undefined) return directCaller(local, local.values);

	const deadline = Date.now() + waitMs;
	// The directory is resolved before anything is waited for: a configuration that states none is
	// its own failure, not an access that happens to be unavailable.
	const runtimeDirectory = resolveRuntimeDirectory(options);
	const location = await waitForLocation(
		locationFileOf(runtimeDirectory, options.target),
		options.target,
		deadline,
		options.signal,
	);
	const socket = await connectWithin(location.endpoint, options.target, deadline, options.signal);
	socket.write(
		encoded({
			t: "hello",
			extension: options.target.extension,
			owner: options.target.owner,
			verification: location.verification,
		}),
	);
	const welcome = await welcomeWithin(socket, options.target, deadline, options.signal);
	return new RemoteCaller(socket, options.target, welcome.values, welcome.carried);
}

/** What the delivering half of one process's access is built with. */
export interface ObservationDelivererSeam extends LocalAccessSource {
	/** The extension whose seat the readings are delivered to; the same id both ends of the access name. */
	readonly extension: string;
	/**
	 * The readings this process holds right now for the sessions that follow one owner.
	 *
	 * It is asked once per owner, when that owner's access has just been reached: what the delivering
	 * process's first word to that owner carries is this answer, so a reading collected before the
	 * access was reached — including the one that made this process look for it — is not lost, and
	 * nothing has to be collected again for it.
	 */
	readonly readings: (owner: string) => readonly ObservedSession[];
	/** The whole budget one of this half's opens may spend, in milliseconds. */
	readonly waitMs?: number;
	/**
	 * Where one configuration failure is reported — once per attempt, in the text the framework
	 * reports its own failures with. An access that cannot be *reached* is not reported: the owner may
	 * not be served yet, and the next reading makes the same attempt again.
	 */
	readonly report?: (message: string) => void;
}

/** The delivering half of one process's access: readings on their way to the processes serving their owners. */
export interface ObservationDeliverer {
	/**
	 * Delivers one reading, reaching the seat of the owner it follows first where this process has not
	 * reached it yet. A reading that arrives while that reach is still in flight is not lost: the
	 * first word that seat receives is what this process currently holds for that owner's sessions,
	 * which includes it.
	 */
	deliver(reading: ObservedSession): void;
	/** Releases every access this half reached and holds open. */
	dispose(): void;
}

/**
 * Builds the delivering half of this process's observation access: the one way a reading of a session
 * this process runs reaches the process that serves the owner it follows.
 *
 * The half is built around one fact: reaching a seat is asynchronous and may fail, while a reading
 * arrives at the moment it moved. So each owner's seat is reached once, on the first reading that has
 * nowhere to go yet, and every reading after it is written onto the access this process already
 * holds. A reach that failed is not retried by itself — this is not a poll and holds no timer — but
 * the next real reading makes the same attempt, which is what a process that starts before the owner
 * it follows needs. Nothing is reported for an access that is merely not reachable; a runtime
 * directory this process cannot state is the one failure that is, because it is a configuration
 * failure rather than an owner that has not arrived.
 */
export function createObservationDeliverer(seam: ObservationDelivererSeam): ObservationDeliverer {
	/** The access this process reached for each owner, once it answered. */
	const reached = new Map<string, OwnerAccessCaller>();
	/** The reaches in flight, so one owner is reached once however many readings arrive meanwhile. */
	const reaching = new Map<string, Promise<void>>();
	let disposed = false;

	const reach = (owner: string): void => {
		const attempt = openOwnerAccess({
			target: { extension: seam.extension, owner },
			...(seam.configPath === undefined ? {} : { configPath: seam.configPath }),
			...(seam.reader === undefined ? {} : { reader: seam.reader }),
			...(seam.parser === undefined ? {} : { parser: seam.parser }),
			...(seam.waitMs === undefined ? {} : { waitMs: seam.waitMs }),
		}).then(
			caller => {
				if (disposed) {
					caller.dispose();
					return;
				}
				reached.set(owner, caller);
				// The first word to this seat: every session this process holds for that owner, with
				// the readings it holds for each — the state the owner's process could not have had.
				for (const reading of seam.readings(owner)) caller.deliver(reading);
			},
			(error: unknown) => {
				if (error instanceof LocalAccessConfigurationError) seam.report?.(error.detail);
			},
		);
		reaching.set(owner, attempt);
		void attempt.finally(() => reaching.delete(owner));
	};

	return {
		deliver(reading) {
			if (disposed || reading.owner.kind !== "inherited") return;
			const { key } = reading.owner;
			const caller = reached.get(key);
			if (caller !== undefined) {
				if (!caller.ended()) {
					caller.deliver(reading);
					return;
				}
				// The access this process held for that owner ended — the seat was withdrawn, or the
				// connection was lost — so this reading is what makes this process reach it again,
				// with the state it holds now rather than with what it was left holding.
				reached.delete(key);
			}
			if (!reaching.has(key)) reach(key);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			for (const caller of reached.values()) caller.dispose();
			reached.clear();
			reaching.clear();
		},
	};
}
