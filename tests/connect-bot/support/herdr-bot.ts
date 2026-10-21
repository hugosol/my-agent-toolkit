/**
 * The actual herdr-bot panel one interop run talks to (P23).
 *
 * The extension's outbound dependency is the real panel, not a stand-in, so the interop run starts
 * the panel itself: the release build of the sibling herdr-bot checkout, on an ephemeral loopback
 * port, with a configuration file of its own under a temporary directory. Nothing of the user's
 * panel is touched — this instance is a process of its own whose session table lives and dies in
 * memory — and its `mDNS` publishing stays off so the isolated run announces nothing on the
 * network.
 *
 * What the panel is read through is its own read side: the same `GET /api/sessions/events`
 * long-lived stream the panel's page subscribes to, whose first frame is the full snapshot of the
 * session table and whose later frames are the `upsert`/`remove` changes the panel published. A
 * run therefore observes the panel's own record of what it received — the row the register built,
 * the state each report moved it to, and the removal the unregister performed — rather than a
 * client-side re-telling of it.
 *
 * The binary is resolved from `HERDR_BOT_BINARY` when the environment names one, and otherwise from
 * the sibling checkout's release build. A machine without it cannot run this panel, and the run
 * fails saying exactly which path is missing and how to build it: a stand-in panel would not be
 * the interop evidence this is here for.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { REPO_ROOT } from "../../harness-dock/baseline";

/** The environment name that overrides where the herdr-bot binary is taken from. */
const HERDR_BOT_BINARY_ENV = "HERDR_BOT_BINARY";

/** One frame the panel published on its read side. */
export interface HerdrBotFrame {
	/** The named event: `snapshot`, `upsert`, `remove` or `shutdown`. */
	readonly event: string;
	/** The frame's JSON payload, as the panel wrote it. */
	readonly data: unknown;
}

/** One session as the panel's own view renders it. */
export interface PanelSessionView {
	readonly sessionId: string;
	readonly cwd: string;
	readonly online: boolean;
	readonly state?: string;
	readonly model?: string;
	readonly sessionName?: string;
}

/** The isolated panel one interop run drives. */
export interface HerdrBotPanel {
	/** Base URL of this instance, e.g. `http://127.0.0.1:53412`. */
	readonly endpoint: string;
	/** Every frame the panel has published since this run subscribed, in order. */
	readonly frames: readonly HerdrBotFrame[];
	/** Waits for a frame matching `match`, and fails with the frames seen so far after `timeoutMs`. */
	waitFor(match: (frame: HerdrBotFrame) => boolean, label: string, timeoutMs?: number): Promise<HerdrBotFrame>;
	/**
	 * The panel's current session table, read on a connection of its own.
	 *
	 * The read side publishes no cursor and no replay, and the panel has no other session route, so a
	 * connection opened now carries the table as it stands now in its first frame — which is how a run
	 * tells "this row is gone" apart from "this row was reported gone earlier".
	 */
	snapshot(): Promise<readonly PanelSessionView[]>;
	stop(): Promise<void>;
}

/**
 * How long the panel may take to bind and print the address it listens on.
 *
 * The deadline is real wall-clock time because what it bounds is another process reaching its own
 * startup state — no clock in this suite can move that along.
 */
const START_TIMEOUT_MS = 20_000;
/** How long a single frame wait may take before the run is reported as never arriving. */
const FRAME_TIMEOUT_MS = 30_000;
/** The panel's own startup line carrying the address it bound. */
const LISTEN_LINE = /监听：http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)\//;

/** Where the panel binary is taken from: the environment's own value, or the sibling release build. */
function herdrBotBinary(): string {
	const named = process.env[HERDR_BOT_BINARY_ENV]?.trim();
	if (named !== undefined && named.length > 0) return named;
	const name = process.platform === "win32" ? "herdr-bot.exe" : "herdr-bot";
	return path.resolve(REPO_ROOT, "..", "herdr-bot", "backend", "target", "release", name);
}

/** Reads one stream line by line, handing every complete line to `onLine`. */
async function pumpLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffered = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) return;
		buffered += decoder.decode(value, { stream: true });
		for (;;) {
			const end = buffered.indexOf("\n");
			if (end < 0) break;
			onLine(buffered.slice(0, end).replace(/\r$/, ""));
			buffered = buffered.slice(end + 1);
		}
	}
}

/** Writes this run's own panel configuration into `directory`. */
function writePanelConfig(directory: string): string {
	const file = path.join(directory, "herdr-bot.toml");
	// The sessions section declares the two windows this run reads: the panel's own delivered
	// defaults are 10s online / 30s retention, and a client that beats every 10s sits exactly on
	// the default's edge — the scan would publish an offline view between two beats and the next
	// beat publish it back. The runs here are about the extension's protocol rather than about
	// those defaults, so the window is stated once, wide enough for a 10s beat to keep the row
	// online, and every case reads the same declared numbers (30s online, 30s retention).
	//
	// The operations the panel can only ever invoke on request point at this run's own directory:
	// this interop run never calls them, and they must never name a script the user cares about.
	//
	// The panel release requires an explicit Herdr workspace target even though these runs never
	// create a Bot; the name is never looked up here, but a missing `[herdr]` section fails startup.
	writeFileSync(
		file,
		[
			`listen_addr = "127.0.0.1:0"`,
			``,
			`[herdr]`,
			`workspace_name = 'unused'`,
			``,
			`[sessions]`,
			`online_timeout_seconds = 30`,
			`offline_retention_seconds = 30`,
			``,
			`[operations.start]`,
			`script = 'unused.bat'`,
			`working_directory = '.'`,
			``,
			`[operations.stop]`,
			`script = 'unused.bat'`,
			`working_directory = '.'`,
			``,
			`[mdns]`,
			`enabled = false`,
			``,
		].join("\n"),
	);
	return file;
}

/** Parses one server-sent event block into a frame; `undefined` for a keep-alive comment only. */
function frameOf(block: string): HerdrBotFrame | undefined {
	let event: string | undefined;
	let data: string | undefined;
	for (const line of block.split("\n")) {
		if (line.startsWith("event: ")) event = line.slice("event: ".length);
		else if (line.startsWith("data: ")) data = line.slice("data: ".length);
	}
	if (event === undefined || data === undefined) return undefined;
	return { event, data: JSON.parse(data) as unknown };
}

/**
 * Reads one read-side response body frame by frame, handing every complete frame to `onFrame`.
 *
 * The read side is a stream of `\n\n`-separated frames and nothing else, so both the run's own
 * long-lived subscription and the one-shot table read below decode it here. `onFrame` returning
 * `true` stops the read: that is how a reader that wanted one frame releases the rest of the
 * stream, which the caller then aborts.
 */
async function pumpFrames(
	body: ReadableStream<Uint8Array>,
	onFrame: (frame: HerdrBotFrame) => boolean | void,
): Promise<void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffered = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) return;
		buffered += decoder.decode(value, { stream: true });
		for (;;) {
			const end = buffered.indexOf("\n\n");
			if (end < 0) break;
			const frame = frameOf(buffered.slice(0, end));
			buffered = buffered.slice(end + 2);
			if (frame === undefined) continue;
			if (onFrame(frame) === true) return;
		}
	}
}

/** The session table one `snapshot` frame carries, narrowed before anything is read from it. */
function snapshotSessions(data: unknown): readonly PanelSessionView[] {
	if (data === null || typeof data !== "object" || !("sessions" in data) || !Array.isArray(data.sessions)) {
		throw new Error(`the panel's snapshot frame carries no session table: ${JSON.stringify(data)}`);
	}
	return data.sessions as readonly PanelSessionView[];
}

/** Whether a parsed frame payload is the session view an `upsert` frame carries. */
export function isUpsertData(data: unknown): data is { readonly session: PanelSessionView } {
	if (data === null || typeof data !== "object" || !("session" in data)) return false;
	const session = data.session;
	return (
		session !== null &&
		typeof session === "object" &&
		"sessionId" in session &&
		typeof session.sessionId === "string" &&
		"cwd" in session &&
		typeof session.cwd === "string" &&
		"online" in session &&
		typeof session.online === "boolean" &&
		(!("state" in session) || typeof session.state === "string")
	);
}

/** The session views the panel published, in the order it published them. */
export function publishedViews(panel: HerdrBotPanel): readonly PanelSessionView[] {
	return panel.frames
		.filter(frame => frame.event === "upsert")
		.map(frame => {
			if (!isUpsertData(frame.data)) {
				throw new Error(`the panel's upsert frame carries no session view: ${JSON.stringify(frame)}`);
			}
			return frame.data.session;
		});
}

/**
 * Starts the isolated panel and subscribes its read side.
 *
 * The subscription is opened before anything is sent, so every row the run's own events build is
 * observed as the panel published it — no frame has to be reconstructed by polling the panel
 * afterwards.
 */
export async function startHerdrBot(): Promise<HerdrBotPanel> {
	const binary = herdrBotBinary();
	if (!existsSync(binary)) {
		throw new Error(
			`the interop run needs the actual herdr-bot panel, but no binary is at ${binary}; ` +
				`build it with \`cargo build --release --manifest-path ../herdr-bot/backend/Cargo.toml\` ` +
				`or name an existing one in ${HERDR_BOT_BINARY_ENV}`,
		);
	}
	const directory = mkdtempSync(path.join(tmpdir(), "herdr-bot-interop-"));
	const child = Bun.spawn([binary, "--config", writePanelConfig(directory)], {
		cwd: directory,
		stdout: "pipe",
		stderr: "pipe",
	});

	const output: string[] = [];
	let port: number | undefined;
	const bound = Promise.withResolvers<number>();
	pumpLines(child.stdout, line => {
		output.push(line);
		const match = LISTEN_LINE.exec(line);
		if (match !== null && port === undefined) {
			port = Number(match[1]);
			bound.resolve(port);
		}
	}).catch(() => {});
	void pumpLines(child.stderr, line => output.push(line)).catch(() => {});

	const timer = setTimeout(() => bound.reject(new Error(`herdr-bot did not bind within ${START_TIMEOUT_MS}ms`)), START_TIMEOUT_MS);
	try {
		await bound.promise;
	} catch (error) {
		child.kill();
		rmSync(directory, { recursive: true, force: true });
		throw new Error(`${String(error)}; panel output:\n${output.join("\n")}`);
	} finally {
		clearTimeout(timer);
	}

	const endpoint = `http://127.0.0.1:${port!}`;
	const frames: HerdrBotFrame[] = [];
	const waiters: Array<{ readonly match: (frame: HerdrBotFrame) => boolean; readonly settle: (frame: HerdrBotFrame) => void }> = [];
	const abort = new AbortController();
	const subscription = fetch(`${endpoint}/api/sessions/events`, {
		headers: { accept: "text/event-stream" },
		signal: abort.signal,
	})
		.then(async response => {
			await pumpFrames(response.body!, frame => {
				frames.push(frame);
				for (const waiter of [...waiters]) {
					if (!waiter.match(frame)) continue;
					waiters.splice(waiters.indexOf(waiter), 1);
					waiter.settle(frame);
				}
			});
		})
		.catch(() => {});

	return {
		endpoint,
		frames,
		waitFor: async (match, label, timeoutMs = FRAME_TIMEOUT_MS) => {
			const existing = frames.find(match);
			if (existing !== undefined) return existing;
			const { promise, resolve, reject } = Promise.withResolvers<HerdrBotFrame>();
			const waiter = { match, settle: resolve };
			waiters.push(waiter);
			const timeout = setTimeout(() => {
				waiters.splice(waiters.indexOf(waiter), 1);
				reject(new Error(`the panel never published ${label}; frames seen: ${JSON.stringify(frames)}`));
			}, timeoutMs);
			return promise.finally(() => clearTimeout(timeout));
		},
		snapshot: () => {
			const { promise, resolve, reject } = Promise.withResolvers<readonly PanelSessionView[]>();
			const reading = new AbortController();
			void (async () => {
				try {
					const response = await fetch(`${endpoint}/api/sessions/events`, {
						headers: { accept: "text/event-stream" },
						signal: reading.signal,
					});
					// The first frame of a connection opened now is the table as it stands now; the
					// reader stops there and the connection is dropped, so no later change is mistaken
					// for this read's answer.
					await pumpFrames(response.body!, frame => {
						if (frame.event !== "snapshot") return false;
						resolve(snapshotSessions(frame.data));
						return true;
					});
					reject(new Error("the panel closed its read side before publishing a snapshot"));
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)));
				} finally {
					reading.abort();
				}
			})();
			return promise;
		},
		stop: async () => {
			abort.abort();
			await subscription;
			child.kill();
			await child.exited;
			rmSync(directory, { recursive: true, force: true });
		},
	};
}
