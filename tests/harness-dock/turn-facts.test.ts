/**
 * The Turn axis in a running harness (S5; contract P57; ticket 05).
 *
 * Three real runs: the recorded isolated install's own loader loads the fixture extension, a real
 * RPC session issues real model requests against the dock's local capture endpoint, and the
 * extension's stderr records what the framework delivered. Nothing here is a double: the request
 * starts, the response boundaries and the reported usage are the harness's own, and the capture
 * endpoint answers with a non-zero terminal usage chunk, so the usage facts asserted below cannot
 * be an all-zero default the harness invented.
 *
 * What these runs establish is the production path end to end: one real request's start facts and
 * the same Turn's end with its reliable usage and HTTP boundary; a delegating run in which the main
 * session spawns a real subagent that spawns a real grandchild, so every actual session's own
 * identity, direct parent and Turn are delivered while the owner-scoped group is driven by the main
 * session alone; and a run in which a real tool executes, so the harness's own `turn_end` — the one
 * that carries that tool's result — can be seen falling between two Turns rather than ending one.
 *
 * What these runs do not establish is any real provider, credential or visual behaviour: the
 * endpoint is a local fixture and the ids and usage it reports are facts of that fixture rather
 * than of a provider. The subagents are the host's own, spawned through its own task tool, but they
 * run on the same local fixture model.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { writeAgentSettings } from "./agent-config";
import { type IsolatedHarness, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CapturedRequest, type CaptureStep, type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import { TURN_FACTS_ID, TURN_FACTS_PRICE } from "./fixtures/turn-facts/entrypoint";
import { NATIVE_TURN_OBSERVER_ID } from "./fixtures/turn-facts/native-observer";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession } from "./session";

const record = readBaselineRecord();
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");
const TURN_FACTS_FIXTURE = path.join(import.meta.dir, "fixtures", "turn-facts", "entrypoint.ts");
const NATIVE_OBSERVER_FIXTURE = path.join(import.meta.dir, "fixtures", "turn-facts", "native-observer.ts");

/**
 * The usage the capture endpoint reports for every completion in this suite, as the wire numbers
 * it sends: 10 prompt tokens, 3 of which were served from the prompt cache, and 7 completion
 * tokens. The expected buckets below are hand-derived from that OpenAI-compatible payload — the
 * non-cached input is the rest of the prompt, and the reported total is prompt plus completion —
 * not recomputed from what the framework produces.
 */
const WIRE_PROMPT_TOKENS = 10;
const WIRE_CACHED_TOKENS = 3;
const WIRE_COMPLETION_TOKENS = 7;

const CAPTURE_USAGE = { input: WIRE_PROMPT_TOKENS, output: WIRE_COMPLETION_TOKENS, cacheRead: WIRE_CACHED_TOKENS };

/** The usage every completion above must be delivered as, hand-derived from those wire numbers. */
const EXPECTED_USAGE = {
	input: WIRE_PROMPT_TOKENS - WIRE_CACHED_TOKENS,
	output: WIRE_COMPLETION_TOKENS,
	cacheRead: WIRE_CACHED_TOKENS,
	cacheWrite: 0,
	totalTokens: WIRE_PROMPT_TOKENS + WIRE_COMPLETION_TOKENS,
};

/**
 * The main session's name, which this suite sets through the host's own command before prompting:
 * the host is the only source of the fact, so the name the deliveries carry can only come from it.
 */
const MAIN_SESSION_NAME = "dock-turn-facts-main";

/** The delegation this suite's scripted model asks for, and the mark each session's own opening carries. */
const DELEGATE_PROMPT = "dock run: delegate to a child";
const CHILD_ASSIGNMENT = "dock child: take over and finish";
const GRANDCHILD_ASSIGNMENT = "dock grandchild: finish now";
const CHILD_NAME = "dock-child";
const GRANDCHILD_NAME = "dock-grandchild";

/** The one tool call the tool run scripts, and the argument string it carries. */
const TOOL_CALL_TEXT = "dock-tool-ran";
const TOOL_PROMPT = "dock run: use one tool and finish";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

/** One observation line of a run, from whichever evidence source wrote it. */
interface ObservedLine {
	/** Whether the framework's fixture or the native observer wrote it. */
	readonly source: "framework" | "native";
	/** The observation scope, on a framework line that has one. */
	readonly scope?: string;
	/** The event kind: `turn_start`, `session_start`, `message_end`, `turn_end` … */
	readonly kind: string;
	readonly facts: Record<string, unknown>;
}

/** Every evidence line one run's stderr carried, in the order the run wrote it. */
function observedLines(session: ControlledSession): ObservedLine[] {
	const frameworkPrefix = `[${TURN_FACTS_ID}] `;
	const nativePrefix = `[${NATIVE_TURN_OBSERVER_ID}] `;
	const lines: ObservedLine[] = [];
	for (const raw of session.stderr().split("\n")) {
		if (raw.startsWith(frameworkPrefix)) {
			// `<scope> <kind> <json>`: the JSON payload itself contains spaces, so the two leading
			// fields are split off by position rather than by re-splitting the whole line.
			const rest = raw.slice(frameworkPrefix.length);
			const firstSpace = rest.indexOf(" ");
			const secondSpace = rest.indexOf(" ", firstSpace + 1);
			if (firstSpace < 0 || secondSpace < 0) continue;
			lines.push({
				source: "framework",
				scope: rest.slice(0, firstSpace),
				kind: rest.slice(firstSpace + 1, secondSpace),
				facts: JSON.parse(rest.slice(secondSpace + 1)) as Record<string, unknown>,
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

/** The mark one request carries in its own session: the opening user message that session was started with. */
function openingOf(request: CapturedRequest): string {
	const body = request.json;
	if (body === null || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) return "";
	return body.messages.length < 2 ? "" : JSON.stringify(body.messages[1]);
}

/** How many messages one request carried: a session's own first request carries only its opening. */
function messageCountOf(request: CapturedRequest): number {
	const body = request.json;
	if (body === null || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) return 0;
	return body.messages.length;
}

/** A scripted delegation: the host's own task tool, in the batch shape an RPC host runs. */
function delegationStep(name: string, assignment: string): CaptureStep {
	return {
		toolCall: {
			name: "task",
			arguments: JSON.stringify({
				context: "dock delegation context",
				tasks: [{ name, agent: "task", task: assignment, solutionSpace: "one fixed answer, nothing open" }],
			}),
		},
	};
}

/** A scripted subagent result: the host's own yield tool, which ends the subagent's session. */
function yieldStep(data: string): CaptureStep {
	return { toolCall: { name: "yield", arguments: JSON.stringify({ data }) } };
}

/**
 * The scripted model of the delegating run: it reads which session's request this is from that
 * session's own opening message, not from the order requests arrive in, and answers that session.
 * The main session delegates to a child, the child delegates to a grandchild, each subagent yields
 * its result, and the main session answers in prose.
 */
function delegatingStep(request: CapturedRequest): CaptureStep | undefined {
	const opening = openingOf(request);
	const firstRequest = messageCountOf(request) === 2;
	if (opening.includes(GRANDCHILD_ASSIGNMENT)) return yieldStep("grandchild result");
	if (opening.includes(CHILD_ASSIGNMENT)) {
		return firstRequest ? delegationStep(GRANDCHILD_NAME, GRANDCHILD_ASSIGNMENT) : yieldStep("child result");
	}
	if (opening.includes(DELEGATE_PROMPT) && firstRequest) return delegationStep(CHILD_NAME, CHILD_ASSIGNMENT);
	return {};
}

/** The scripted model of the tool run: the first request asks for one tool, the follow-up answers in prose. */
function toolStep(request: CapturedRequest): CaptureStep | undefined {
	if (messageCountOf(request) !== 2) return {};
	return { toolCall: { name: "bash", arguments: JSON.stringify({ command: `echo ${TOOL_CALL_TEXT}` }) } };
}

/** One run root with its provider fixture, capture endpoint and session, disposed by the caller. */
interface DockRun {
	readonly runRoot: RunRoot;
	readonly capture: CaptureServer;
	readonly session: ControlledSession;
}

/**
 * One run: the recorded 18.5.0 install's own loader, the Turn-facts fixture, and the fixture that
 * reports the harness's own turn boundary, driven through a real RPC session over the local capture
 * endpoint. The same three extensions load for every case, so what differs between cases is only
 * what the scripted model answers.
 */
async function startDockRun(label: string, respond: (request: CapturedRequest) => CaptureStep | undefined): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	// A delegating run needs the host's blocking delegation: an RPC host otherwise runs each spawn as
	// a background job, which this dock has no second prompt to observe.
	writeAgentSettings(runRoot.agentDir, { "async.enabled": false });
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock turn facts reply",
		usage: CAPTURE_USAGE,
		respond,
	});
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, TURN_FACTS_FIXTURE, NATIVE_OBSERVER_FIXTURE],
			model: DOCK_MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
			promptTimeoutMs: 120_000,
		});
		return { runRoot, capture, session };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeDockRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the rest of the run still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

describe("a real session's request delivers Turn facts to both scopes (P57)", () => {
	test("the request's start facts, the same Turn's end with reliable usage, and the HTTP boundary", async () => {
		const run = await startDockRun("turn-facts", () => undefined);
		try {
			const outcome = await run.session.prompt("one ordinary request");
			expect(outcome.status).toBe("completed");
			// One real outbound request, captured: the cycle the Turn facts below describe happened.
			expect(run.capture.requests()).toHaveLength(1);

			const lines = observedLines(run.session);
			const sessionStart = lines.find(line => line.scope === "session" && line.kind === "session_start");
			expect(sessionStart?.facts.kind).toBe("main");
			const sessionId = sessionStart?.facts.sessionId;
			expect(typeof sessionId).toBe("string");
			expect(String(sessionId).length).toBeGreaterThan(0);

			const ownerStart = lines.find(line => line.scope === "owner" && line.kind === "turn_start");
			const sessionScopeStart = lines.find(line => line.scope === "session" && line.kind === "turn_start");
			const ownerEnd = lines.find(line => line.scope === "owner" && line.kind === "turn_end");
			const sessionScopeEnd = lines.find(line => line.scope === "session" && line.kind === "turn_end");
			expect(ownerStart).toBeDefined();
			expect(sessionScopeStart).toBeDefined();
			expect(ownerEnd).toBeDefined();
			expect(sessionScopeEnd).toBeDefined();

			// The request's own facts, fixed when the request began: the session the harness reports,
			// the model the request ran on, the round the framework had open and the catalog price the
			// extension's own catalog states for that model.
			expect(ownerStart?.facts.sessionId).toBe(sessionId);
			expect(ownerStart?.facts.provider).toBe("dock-gateway");
			expect(ownerStart?.facts.model).toBe("dock-model");
			expect(typeof ownerStart?.facts.roundId).toBe("string");
			expect(ownerStart?.facts.price).toEqual(TURN_FACTS_PRICE);
			expect(typeof ownerStart?.facts.startedAt).toBe("number");

			// One Turn identity on both edges and on both scopes: the declaration drives the two
			// groups through the one mechanism, and the identity is the framework's own.
			const turnId = ownerStart?.facts.turnId;
			expect(typeof turnId).toBe("string");
			expect(sessionScopeStart?.facts.turnId).toBe(turnId);
			expect(ownerEnd?.facts.turnId).toBe(turnId);
			expect(sessionScopeEnd?.facts.turnId).toBe(turnId);
			expect(ownerEnd?.facts.roundId).toBe(ownerStart?.facts.roundId);

			// The response's own facts: the terminal usage chunk the capture endpoint sent (so this is
			// a reported usage, not a default), the HTTP status and headers of the real response, and
			// the two external reference ids the fixture itself set — the transport's request id and
			// the stream's response id, which are not assumed equal.
			expect(ownerEnd?.facts.outcome).toBe("completed");
			expect(ownerEnd?.facts.usage).toEqual(EXPECTED_USAGE);
			expect(ownerEnd?.facts.status).toBe(200);
			expect(ownerEnd?.facts.hasHeaders).toBe(true);
			expect(ownerEnd?.facts.providerRequestId).toBe("capture-1");
			expect(ownerEnd?.facts.providerResponseId).toBe("chatcmpl-dock");
			expect(ownerEnd?.facts.unavailable).toEqual([]);

			// The run exits cleanly with no framework diagnostic of its own: nothing was dropped and
			// nothing was reported as unreliable.
			const exit = await run.session.stop({ timeoutMs: 10_000 });
			expect(exit.exitCode).toBe(0);
			expect(run.session.stderr()).not.toContain("no Turn in flight");
		} finally {
			await disposeDockRun(run);
		}
	}, 180_000);

	test("a delegating run delivers each actual session's own identity, parent and Turn, and never drives the owner group from a subagent", async () => {
		const run = await startDockRun("turn-facts-delegation", delegatingStep);
		try {
			await run.session.request({ type: "set_session_name", name: MAIN_SESSION_NAME });
			const outcome = await run.session.prompt(DELEGATE_PROMPT);
			expect(outcome.status).toBe("completed");
			const exit = await run.session.stop({ timeoutMs: 15_000 });
			expect(exit.exitCode).toBe(0);

			const lines = observedLines(run.session);
			const boundaries = lines.filter(line => line.scope === "session" && line.kind === "session_start");
			// The host really spawned two nested sessions: the main session, its child, and the child's
			// grandchild — the three actual sessions the contract's identity facts are about.
			expect(boundaries.map(boundary => boundary.facts.kind)).toEqual(["main", "sub", "sub"]);
			const mainId = String(boundaries[0]?.facts.sessionId);
			const childId = String(boundaries[1]?.facts.sessionId);
			const grandchildId = String(boundaries[2]?.facts.sessionId);
			expect(new Set([mainId, childId, grandchildId]).size).toBe(3);
			// Every boundary names its own actual session and its direct parent only: the grandchild's
			// parent is the child session, never the top-level main session.
			expect(boundaries[1]?.facts.parentSessionId).toBe(mainId);
			expect(boundaries[2]?.facts.parentSessionId).toBe(childId);
			// A subagent's delivery resolves to the owner it inherits, while the main session owns itself.
			expect(boundaries.map(boundary => boundary.facts.ownerKind)).toEqual(["owner", "inherited", "inherited"]);

			const starts = lines.filter(line => line.scope === "session" && line.kind === "turn_start");
			const ends = lines.filter(line => line.scope === "session" && line.kind === "turn_end");
			// One Turn per model request across all three sessions, and nothing else: the tool calls
			// that delegated the work are not Turns, and neither session's cycle is attributed to
			// another's.
			expect(starts).toHaveLength(run.capture.requests().length);
			expect(ends).toHaveLength(starts.length);
			expect(starts.map(start => String(start.facts.sessionId)).sort()).toEqual(
				[mainId, childId, grandchildId, childId, mainId].sort(),
			);
			// Every end repeats an identity the same actual session started: association is per actual
			// session, not by arrival order.
			for (const end of ends) {
				const matches = starts.filter(start => start.facts.turnId === end.facts.turnId);
				expect(matches).toHaveLength(1);
				expect(matches[0]?.facts.sessionId).toBe(end.facts.sessionId);
			}
			// The identities are the framework's own and per binding: no two of them collide.
			expect(new Set(starts.map(start => String(start.facts.turnId))).size).toBe(starts.length);
			// The round a Turn names is the one open for its own actual session, so the three sessions
			// never share one round identity.
			const roundOf = (sessionId: string): string =>
				String(starts.find(start => start.facts.sessionId === sessionId)?.facts.roundId);
			expect(new Set([roundOf(mainId), roundOf(childId), roundOf(grandchildId)]).size).toBe(3);

			// The name is the host's own fact, read live: the session was renamed through the host's
			// command after it started, so the boundary that saw it start had no name while the Turns
			// that follow carry the name the host reports now — and name it as obtained, not unavailable.
			expect(boundaries[0]?.facts.name).toBeNull();
			expect(starts.some(start => start.facts.sessionId === mainId && start.facts.name === MAIN_SESSION_NAME)).toBe(
				true,
			);
			expect(
				starts
					.filter(start => start.facts.sessionId === mainId)
					.every(start => JSON.stringify(start.facts.sessionUnavailable) === "[]"),
			).toBe(true);
			// No subagent was started with a name this host reports, so their deliveries name the missing
			// fact explicitly rather than borrowing the owner's name or inventing one.
			expect(starts.filter(start => start.facts.sessionId !== mainId).every(start => start.facts.name === null)).toBe(
				true,
			);
			expect(
				starts
					.filter(start => start.facts.sessionId !== mainId)
					.every(start => JSON.stringify(start.facts.sessionUnavailable) === JSON.stringify(["session name"])),
			).toBe(true);

			// The subagents' responses carried the same reported usage the endpoint sent, on both edges'
			// identity: reliable per Turn, not an all-zero default.
			expect(ends.every(end => JSON.stringify(end.facts.usage) === JSON.stringify(EXPECTED_USAGE))).toBe(true);
			expect(ends.every(end => end.facts.unavailable && JSON.stringify(end.facts.unavailable) === "[]")).toBe(true);
			// Every Turn's HTTP boundary is the real response's, and the two external ids are carried
			// apart rather than assumed equal or used as the Turn's identity.
			expect(ends.map(end => String(end.facts.providerRequestId)).sort()).toEqual(
				run.capture.requests().map(request => `capture-${request.index}`).sort(),
			);
			expect(ends.every(end => end.facts.providerResponseId === "chatcmpl-dock")).toBe(true);
			expect(ends.every(end => end.facts.providerRequestId !== end.facts.turnId)).toBe(true);

			// The owner-scoped group is driven by the owner session's own Turns alone: no subagent's
			// Turn reached it, even though the session-scoped group in the same binding saw all three.
			const ownerLines = lines.filter(line => line.scope === "owner");
			expect(ownerLines.length).toBeGreaterThan(0);
			expect(ownerLines.every(line => line.facts.sessionId === mainId)).toBe(true);

			// Nothing was dropped or reported as unreliable: every fact the three sessions produced was
			// associable with the framework's own in-flight record.
			expect(run.session.stderr()).not.toContain("no Turn in flight");
			expect(run.session.stderr()).not.toContain("dropped");
		} finally {
			await disposeDockRun(run);
		}
	}, 180_000);

	test("a real tool runs between two Turns, and the harness's own turn_end neither ends one nor starts another", async () => {
		const run = await startDockRun("turn-facts-tool", toolStep);
		try {
			const outcome = await run.session.prompt(TOOL_PROMPT);
			expect(outcome.status).toBe("completed");
			const exit = await run.session.stop({ timeoutMs: 15_000 });
			expect(exit.exitCode).toBe(0);

			// The host made two model requests for this one prompt: the response that asked for the
			// tool, then the follow-up that answered. The tool ran in between, and its execution is not
			// a Turn.
			const requests = run.capture.requests();
			expect(requests).toHaveLength(2);
			expect(messageCountOf(requests[1] as CapturedRequest)).toBeGreaterThan(messageCountOf(requests[0] as CapturedRequest));
			expect(requests[1]?.raw).toContain(TOOL_CALL_TEXT);

			const starts = observedLines(run.session).filter(line => line.scope === "session" && line.kind === "turn_start");
			const ends = observedLines(run.session).filter(line => line.scope === "session" && line.kind === "turn_end");
			expect(starts).toHaveLength(2);
			expect(ends).toHaveLength(2);
			// The follow-up request is a new Turn: the two edges carry two distinct identities, and each
			// end repeats its own start's.
			expect(starts[0]?.facts.turnId).not.toBe(starts[1]?.facts.turnId);
			expect(ends[0]?.facts.turnId).toBe(starts[0]?.facts.turnId);
			expect(ends[1]?.facts.turnId).toBe(starts[1]?.facts.turnId);
			expect(ends.map(end => end.facts.providerRequestId)).toEqual(["capture-1", "capture-2"]);

			// Where the native boundary really falls. The harness ran the requested tool and reported it
			// in its own `turn_end`, which carries that tool's result; that event sits entirely between
			// the first Turn's end and the second Turn's start, so the framework's Turn ends at the
			// response — before the tool ran — and the tool's execution neither ended a Turn nor began one.
			const order = observedLines(run.session).map(line =>
				line.source === "native" ? `native:${line.kind} tools=${String(line.facts.tools)}` : `${String(line.scope)}:${line.kind}`,
			);
			const firstEnd = order.indexOf("session:turn_end");
			const nativeTurnEndWithTools = order.indexOf("native:turn_end tools=1");
			const secondStart = order.indexOf("session:turn_start", firstEnd + 1);
			expect(firstEnd).toBeGreaterThanOrEqual(0);
			expect(nativeTurnEndWithTools).toBeGreaterThan(firstEnd);
			expect(secondStart).toBeGreaterThan(nativeTurnEndWithTools);
			// The native observer saw both messages and both native turn ends, so the ordering above is
			// about real events rather than an observer that never ran.
			expect(order.filter(entry => entry.startsWith("native:")).length).toBeGreaterThanOrEqual(4);
		} finally {
			await disposeDockRun(run);
		}
	}, 180_000);
});
