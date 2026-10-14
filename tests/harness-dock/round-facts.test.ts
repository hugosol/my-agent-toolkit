/**
 * A Round in a running harness (S5; contract P3, P14, P15; ticket 08).
 *
 * This is the isolated real-host observation of the round axis end to end: the dock materialises
 * the recorded baseline install, loads this repository's own model-cost entrypoint and one fixture
 * extension through the harness's real loader, and drives real RPC sessions whose model requests go
 * to the dock's local capture endpoint. Nothing here is a double: the runs, the tool execution, the
 * responses and the usage the endpoint reports are the host's own.
 *
 * Two facts are observed. The first is the round axis at the host: one prompt that asks for a tool
 * makes two model requests inside one run, and the framework dispatches exactly one Round for them —
 * one `round_start`, two Turns naming the same round identity, one `round_end` — while a second
 * prompt afterwards opens a *second* Round, because the first one was confirmed ended in between.
 * The native observer records the host's own settle and the context's idle facts, so the round end
 * can be placed after the settle that raised it rather than in it.
 *
 * The second is what that Round end does for consumption: the session's own record is saved once
 * per Round, and the request the tool continuation issued is accounted for exactly like the first —
 * the saved buckets are the two responses' usage summed, hand-derived from the wire numbers the
 * endpoint sent, so nothing here recomputes them from the extension.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CaptureServerOptions, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { ROUND_FACTS_ID } from "./fixtures/round-facts/entrypoint";
import { NATIVE_RUN_OBSERVER_ID } from "./fixtures/round-facts/native-run";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The dock's own provider fixture, so the model-cost entrypoint runs beside the round fixtures. */
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");
const ROUND_FACTS_FIXTURE = path.join(import.meta.dir, "fixtures", "round-facts", "entrypoint.ts");
const NATIVE_RUN_FIXTURE = path.join(import.meta.dir, "fixtures", "round-facts", "native-run.ts");

/** The document the extension keeps in its storage root, and the directory that root is in. */
const CONSUMPTION_FILE = "consumption.json";

/**
 * The usage the capture endpoint reports for every completion, as the wire numbers it sends: 10
 * prompt tokens, 3 of which were served from the prompt cache, and 7 completion tokens. What the
 * framework delivers for one response is hand-derived from that payload — the non-cached input is
 * the rest of the prompt, and the reported total is prompt plus completion.
 */
const WIRE_PROMPT_TOKENS = 10;
const WIRE_CACHED_TOKENS = 3;
const WIRE_COMPLETION_TOKENS = 7;
const CAPTURE_USAGE = { input: WIRE_PROMPT_TOKENS, output: WIRE_COMPLETION_TOKENS, cacheRead: WIRE_CACHED_TOKENS };

/** One response's usage as the extension accounts it: the four buckets it stores. */
const ONE_RESPONSE_TOKENS = {
	input: WIRE_PROMPT_TOKENS - WIRE_CACHED_TOKENS,
	cacheRead: WIRE_CACHED_TOKENS,
	cacheWrite: 0,
	output: WIRE_COMPLETION_TOKENS,
};

/** The provider and model the runs use: the recorded provider, redirected at the capture endpoint. */
const MODEL_PROVIDER = "deepseek";
const MODEL_ID = "deepseek-flash";
const MODEL_SELECTOR = `${MODEL_PROVIDER}/${MODEL_ID}`;

/** The one tool call the tool run scripts, and the argument string it carries. */
const TOOL_CALL_TEXT = "dock-round-tool-ran";
const TOOL_PROMPT = "dock run: use one tool and finish";
const SECOND_PROMPT = "dock run: one more exchange in this session";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

/** One run's isolated home and the storage root the extension's shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly consumptionFile: string;
	/** The environment that makes the harness resolve `~/` here, and nowhere else. */
	readonly env: Record<string, string>;
}

function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	return {
		home,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** One provisioned run: the session, its capture endpoint and the isolated root behind it. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly home: IsolatedHome;
}

/** One run: the project's own model-cost entrypoint and the two round fixtures, on the dock's model. */
async function startRun(label: string, toolCall?: CaptureServerOptions["toolCall"]): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock round reply",
		usage: CAPTURE_USAGE,
		...(toolCall === undefined ? {} : { toolCall }),
	});
	writeProviderOverride(runRoot.agentDir, MODEL_PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, MODEL_COST_ENTRYPOINT, ROUND_FACTS_FIXTURE, NATIVE_RUN_FIXTURE],
			model: MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, home };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the rest of the run still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

/** The one tool call the tool run scripts: a real bash command, answered by the follow-up request. */
const TOOL_STEP: CaptureServerOptions["toolCall"] = {
	name: "bash",
	arguments: JSON.stringify({ command: `echo ${TOOL_CALL_TEXT}` }),
	times: 1,
};

/** One evidence line of a run, from whichever fixture wrote it. */
interface ObservedLine {
	/** Which fixture wrote it: the framework's round probe, or the native run observer. */
	readonly source: "round-facts" | "native";
	readonly kind: string;
	readonly facts: Record<string, unknown>;
}

/** Every evidence line one run's stderr carried, in the order the run wrote it. */
function observedLines(session: ControlledSession): ObservedLine[] {
	const roundPrefix = `[${ROUND_FACTS_ID}] `;
	const nativePrefix = `[${NATIVE_RUN_OBSERVER_ID}] `;
	const lines: ObservedLine[] = [];
	for (const raw of session.stderr().split("\n")) {
		if (raw.startsWith(roundPrefix)) {
			// `<kind> <json>`: the JSON payload itself contains spaces, so the kind is split off by
			// position rather than by re-splitting the whole line.
			const rest = raw.slice(roundPrefix.length);
			const separator = rest.indexOf(" ");
			if (separator < 0) continue;
			lines.push({
				source: "round-facts",
				kind: rest.slice(0, separator),
				facts: JSON.parse(rest.slice(separator + 1)) as Record<string, unknown>,
			});
			continue;
		}
		if (raw.startsWith(nativePrefix)) {
			const [kind, ...pairs] = raw.slice(nativePrefix.length).split(" ");
			const facts: Record<string, unknown> = {};
			for (const pair of pairs) {
				const separator = pair.indexOf("=");
				if (separator > 0) facts[pair.slice(0, separator)] = pair.slice(separator + 1);
			}
			lines.push({ source: "native", kind, facts });
		}
	}
	return lines;
}

/**
 * Waits until a run's captured stderr holds what a case expects of it, and answers with its lines.
 *
 * A round's end is dispatched on the host's own next task rather than inside the native settle, and
 * a prompt's result can arrive before that task ran, so a case that reads the edges waits on the
 * expected content itself instead of on a duration. The deadline only keeps an observation that
 * never happened from hanging the case.
 */
async function observedEventually(
	session: ControlledSession,
	accept: (lines: ObservedLine[]) => boolean,
): Promise<ObservedLine[]> {
	const deadline = Date.now() + 20_000;
	for (;;) {
		const lines = observedLines(session);
		if (accept(lines)) return lines;
		if (Date.now() > deadline) throw new Error(`no observation the case expects appeared:\n${session.stderr()}`);
		await new Promise(resolve => setImmediate(resolve));
	}
}

/** One session's record inside the document the run's storage root holds. */
interface SavedSession {
	readonly id: string;
	readonly name: string;
	readonly parent: string | null;
	readonly saveVersion: number;
	readonly own: Record<string, Record<string, { readonly tokens: Record<string, number> }>>;
}

/**
 * Waits until the document holds what a case expects of it, and answers with that session's record.
 *
 * The Round's end is dispatched the way the framework dispatches a semantic handler — the extension
 * waits for its own save before that handler returns, while the host does not wait for the handler —
 * so the write lands a few event-loop turns later. The wait is on the expected content itself rather
 * than on a duration, and the deadline only keeps a save that never happened from hanging the case.
 */
async function savedSession(file: string, accept: (record: SavedSession) => boolean): Promise<SavedSession> {
	const deadline = Date.now() + 15_000;
	for (;;) {
		if (existsSync(file)) {
			const document = JSON.parse(readFileSync(file, "utf8")) as {
				readonly harnesses?: Record<string, { readonly sessions?: SavedSession[] }>;
			};
			for (const record of Object.values(document.harnesses ?? {}).flatMap(bucket => bucket.sessions ?? [])) {
				if (accept(record)) return record;
			}
		}
		if (Date.now() > deadline) throw new Error(`no session record the case expects was published at ${file}`);
		await new Promise(resolve => setImmediate(resolve));
	}
}

describe("one prompt's tool continuation is one Round, and the round end saves it (P3, P15)", () => {
	test("two requests, one Round, one save, and the round end after the host's own settle", async () => {
		const run = await startRun("round-facts-tool", TOOL_STEP);
		try {
			const outcome = await run.session.prompt(TOOL_PROMPT);
			expect(outcome.status).toBe("completed");

			// The host made two model requests for this one prompt: the response that asked for the
			// tool, then the follow-up that answered. The tool ran in between and is not consumption.
			expect(run.capture.requests()).toHaveLength(2);
			expect(run.capture.requests()[1]?.raw).toContain(TOOL_CALL_TEXT);

			// The round end is confirmed on the host's own next task, which this reaches when it has
			// happened: a run's edges are complete once the Round that opened has ended once.
			const lines = await observedEventually(
				run.session,
				seen => seen.filter(line => line.source === "round-facts" && line.kind === "round_end").length === 1,
			);
			const rounds = lines.filter(line => line.source === "round-facts");
			const turns = rounds.filter(line => line.kind === "turn_start");
			// One Round for the whole run: it opened once, and it was confirmed ended once.
			expect(rounds.filter(line => line.kind === "round_start")).toHaveLength(1);
			expect(rounds.filter(line => line.kind === "round_end")).toHaveLength(1);
			// Both requests belong to that same Round: the tool continuation's request is not a new one,
			// and the Round is the identity the framework told each Turn it belonged to.
			expect(turns).toHaveLength(2);
			const roundIds = turns.map(turn => String(turn.facts.roundId));
			expect(roundIds[0]).not.toBe("null");
			expect(new Set(roundIds).size).toBe(1);
			expect(turns[0]?.facts.model).toBe(MODEL_SELECTOR);

			// Where the host's own settle falls relative to the round end. The native observer recorded
			// the settle with the context's facts as they stood inside the callback, and the round end
			// the framework dispatched came after it: the end is the re-check's own moment, not the
			// settle's. What the context reported there is this host's fact for this run — the timing
			// investigation recorded a settle whose session was still in flight — and the confirmation
			// is what makes either case safe.
			const settleIndex = lines.findIndex(line => line.source === "native" && line.kind === "agent_end");
			const endIndex = lines.findIndex(line => line.source === "round-facts" && line.kind === "round_end");
			expect(settleIndex).toBeGreaterThanOrEqual(0);
			expect(typeof lines[settleIndex]?.facts.idle).toBe("string");
			expect(endIndex).toBeGreaterThan(settleIndex);

			// The round end saved the session's own consumption, with both requests accounted for: the
			// follow-up request after the tool adds its own usage, and nothing was added twice.
			const record = await savedSession(run.home.consumptionFile, candidate => candidate.saveVersion >= 1);
			expect(record.id).toBe(String(turns[0]?.facts.sessionId));
			expect(record.saveVersion).toBe(1);
			expect(record.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual({
				input: ONE_RESPONSE_TOKENS.input * 2,
				cacheRead: ONE_RESPONSE_TOKENS.cacheRead * 2,
				cacheWrite: 0,
				output: ONE_RESPONSE_TOKENS.output * 2,
			});
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});

describe("consecutive prompts are consecutive Rounds (P15)", () => {
	test("a second prompt opens a second Round, with its own round identity and its own save", async () => {
		const run = await startRun("round-facts-two-prompts");
		try {
			expect((await run.session.prompt("dock run: first exchange")).status).toBe("completed");
			expect((await run.session.prompt(SECOND_PROMPT)).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(2);

			// Both Rounds complete once each has opened and been confirmed ended.
			const lines = await observedEventually(run.session, seen => {
				const edges = seen.filter(line => line.source === "round-facts");
				return (
					edges.filter(line => line.kind === "round_start").length === 2 &&
					edges.filter(line => line.kind === "round_end").length === 2
				);
			});
			const rounds = lines.filter(line => line.source === "round-facts");
			// The first prompt's Round was confirmed ended before the second prompt's work began — had
			// the re-check never confirmed it, the second start would have been work inside that Round
			// and no second Round would have been dispatched at all.
			const turns = rounds.filter(line => line.kind === "turn_start");
			expect(turns).toHaveLength(2);
			const roundIds = turns.map(turn => String(turn.facts.roundId));
			expect(roundIds[0]).not.toBe("null");
			expect(new Set(roundIds).size).toBe(2);
			// Both Rounds are the host's own actual session: one session, its own consecutive Rounds.
			expect(new Set(turns.map(turn => String(turn.facts.sessionId))).size).toBe(1);

			// Each Round's end saved the session: the session's own accumulation spans its Rounds, so the
			// second record carries both requests while the Round boundary is what triggered the save.
			const record = await savedSession(run.home.consumptionFile, candidate => candidate.saveVersion >= 2);
			expect(record.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens.input).toBe(2 * ONE_RESPONSE_TOKENS.input);
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});
