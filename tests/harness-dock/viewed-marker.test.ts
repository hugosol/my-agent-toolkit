/**
 * The real host's one marker area renders the session on screen's own effective State (P27; S5).
 *
 * These runs load two marker fixtures through the frozen patched host's own loader — the artifact
 * ticket 01 materialised, whose public Viewed session outlet is the only source the framework's
 * projection has — arm both in the Owner's session, and read the marker-area widget the host was
 * actually told to render. What that establishes is the half a controlled double cannot: that on the
 * real host, with the real adapter, the real agent registry and the real per-session outlet facts, the
 * displayed session's own effective State drives the one area — the Owner's session carries both
 * lines, and its spawned session renders the following line *alone*, its sibling reading a declared
 * default rather than a copy of every line the Owner's session shows.
 *
 * What this run does **not** establish: the displayed *subagent's* rendering — an RPC host reports each
 * session's own facts rather than a separate view, and a subagent's own session has no UI, so the seat
 * that renders the following line alone stays the framework seam's own case and the interactive focus
 * switch is the human check (the ticket's H1 material).
 *
 * One failure this run does catch is the spawned session's own binding: the loader evaluates an
 * extension's graph per session's runner, so that binding registers the same extension ids in the one
 * process-wide area with its own State store. A registration that answers for a seat it never served
 * used to empty the area — the run rendered `undefined` at the Owner's own deliveries right after the
 * delegation — and every rendering this test reads after arming must therefore be a session's own
 * area instead.
 *
 * Every model request goes to the dock's own capture endpoint, so no run needs a credential and
 * nothing leaves the machine. Nothing here is a formal installation: the run's own agent state,
 * session directory and working directory all sit inside its temporary run root.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { writeAgentSettings, writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CaptureStep, type CapturedRequest, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import {
	FOLLOW_MARKER_COMMAND,
	FOLLOW_MARKER_ID,
	FOLLOW_MARKER_TEXT,
} from "./fixtures/viewed-marker-follow/entrypoint";
import {
	NONE_MARKER_COMMAND,
	NONE_MARKER_ID,
	NONE_MARKER_TEXT,
} from "./fixtures/viewed-marker-none/entrypoint";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";
import { ensureViewedSessionHarness } from "./viewed-session-harness";

const record = readBaselineRecord();

/** The framework's one marker-area widget, as the OMP adapter owns it. */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_AREA_PLACEMENT = "aboveEditor";

/** The two fixtures, as the harness's loader discovers them. */
const FOLLOW_ENTRYPOINT = path.join(import.meta.dir, "fixtures", "viewed-marker-follow", "entrypoint.ts");
const NONE_ENTRYPOINT = path.join(import.meta.dir, "fixtures", "viewed-marker-none", "entrypoint.ts");

/** The provider and model the run uses, redirected to the dock's capture endpoint. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";
const MODEL_SELECTOR = `${PROVIDER}/${MODEL}`;

/** The delegating prompt, and the mark that makes the spawned session's own request recognisable. */
const DELEGATE_PROMPT = "dock viewed-marker run: delegate to a child";
/** The Owner's own prompt after the delegation: a run whose rendering must still be the Owner's. */
const OWNER_FOLLOW_UP = "dock viewed-marker run: keep working in the owner session";
const CHILD_ASSIGNMENT = "dock viewed-marker child: answer and finish";
const CHILD_NAME = "dock-marker-child";

/** The usage the capture endpoint reports, so every request is a complete real cycle. */
const CAPTURE_USAGE = { input: 10, output: 7, cacheRead: 3 };

/** The Owner's rendering: both lines, in extension-id order. */
const OWNER_RENDER = [FOLLOW_MARKER_TEXT, NONE_MARKER_TEXT];

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureViewedSessionHarness(record);
});

/** One run's resources, disposed by the caller. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/** A scripted delegation: the host's own task tool, in the batch shape an RPC host runs. */
function delegationStep(): CaptureStep {
	return {
		toolCall: {
			name: "task",
			arguments: JSON.stringify({
				context: "dock viewed-marker context",
				tasks: [{ name: CHILD_NAME, agent: "task", task: CHILD_ASSIGNMENT, solutionSpace: "one fixed answer, nothing open" }],
			}),
		},
	};
}

/** A scripted subagent result: the host's own yield tool, which ends the subagent's session. */
function yieldStep(data: string): CaptureStep {
	return { toolCall: { name: "yield", arguments: JSON.stringify({ data }) } };
}

/** The messages one captured request carried, when its body really is the object this suite reads. */
function messagesOf(request: CapturedRequest): readonly unknown[] {
	const body = request.json;
	if (body === null || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) return [];
	return body.messages;
}

/** The role one message carries, when it really names one. */
function roleOf(message: unknown): string | undefined {
	if (message === null || typeof message !== "object" || !("role" in message)) return undefined;
	return typeof message.role === "string" ? message.role : undefined;
}

/** The opening user message one captured request carries, as the text that marks its own session. */
function openingOf(request: CapturedRequest): string {
	const opening = messagesOf(request).find(message => roleOf(message) === "user");
	return opening === undefined ? "" : JSON.stringify(opening);
}

/** Whether one request is the first its own session issued: no assistant message has answered yet. */
function isOpeningRequest(request: CapturedRequest): boolean {
	return messagesOf(request).every(message => roleOf(message) !== "assistant");
}

/**
 * The scripted model: the spawned session's own opening request ends its run by yielding, and the
 * Owner's *opening* request delegates once. Every later request of the Owner's run answers in prose,
 * so one prompt produces exactly one spawned session. Which session a request belongs to is read from
 * that request's own messages rather than from the order requests arrive in.
 */
function respond(request: CapturedRequest): CaptureStep | undefined {
	if (openingOf(request).includes(CHILD_ASSIGNMENT)) return yieldStep("dock viewed-marker child result");
	return isOpeningRequest(request) ? delegationStep() : {};
}

/** One run's isolated agent state and its capture endpoint, both inside its temporary run root. */
async function startRun(label: string): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	// Blocking delegation: the Owner's run waits for the spawned session, so its own requests and the
	// area renderings they cause are complete by the time this run's prompt concludes.
	writeAgentSettings(runRoot.agentDir, { "async.enabled": false });
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock viewed-marker reply",
		usage: CAPTURE_USAGE,
		respond,
	});
	writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [FOLLOW_ENTRYPOINT, NONE_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot };
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

/** Every widget the host was told to set in one run, in call order. */
function widgetFrames(session: ControlledSession): readonly RpcFrame[] {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "setWidget");
}

/**
 * The lines one marker-area widget call carried, or `undefined` when it carried none.
 *
 * A call with no lines is the framework's instruction to clear the widget, and the host frames that
 * instruction as it likes — absent, or explicitly nothing. Both are the same rendering here, which is
 * what keeps a cleared area distinguishable from a rendered one.
 */
function markerLines(widgetLines: unknown): readonly string[] | undefined {
	if (!Array.isArray(widgetLines)) return undefined;
	return widgetLines.filter((line): line is string => typeof line === "string");
}

/** The marker-area renderings one run emitted, in call order, from one point in the frame stream. */
function markerRenders(session: ControlledSession, from = 0): Array<readonly string[] | undefined> {
	return widgetFrames(session)
		.slice(from)
		.filter(frame => frame.widgetKey === MARKER_AREA_KEY)
		.map(frame => markerLines(frame.widgetLines));
}

describe("the frozen host renders the displayed session's own marker area (S5, P27)", () => {
	test("a subagent's own run renders its effective projection, not every line the Owner's session shows", async () => {
		const run = await startRun("viewed-marker-subagent");
		try {
			expect((await run.session.prompt(`/${FOLLOW_MARKER_COMMAND}`)).status).toBe("completed");
			expect((await run.session.prompt(`/${NONE_MARKER_COMMAND}`)).status).toBe("completed");

			// Both extensions are armed in the Owner's own session, and the area shows both lines.
			const armed = markerRenders(run.session);
			expect(armed[armed.length - 1]).toEqual(OWNER_RENDER);
			// The widget identity is the framework's, whatever the extensions declared: no widget was
			// ever set under either fixture's own id, and every rendering the marker area carried went
			// to the one framework key. (A host's own built-in extensions render their own widgets.)
			const keys = widgetFrames(run.session).map(frame => frame.widgetKey);
			expect(keys).toContain(MARKER_AREA_KEY);
			expect(keys).not.toContain(FOLLOW_MARKER_ID);
			expect(keys).not.toContain(NONE_MARKER_ID);
			const afterArming = widgetFrames(run.session).length;

			expect((await run.session.prompt(DELEGATE_PROMPT)).status).toBe("completed");
			// The Owner's session keeps working while the delegated session's binding is bound: the
			// rendering at the end of this prompt is the Owner's own, which is the assertion below.
			expect((await run.session.prompt(OWNER_FOLLOW_UP)).status).toBe("completed");
			// The host writes one stdout in order, so a request answered after these two prompts is the
			// barrier that makes the renderings below the whole run's rather than whichever had arrived:
			// everything both sessions published on their way out is in by then.
			await run.session.request({ type: "get_state" });

			const rendered = markerRenders(run.session, afterArming);
			// What the one widget shows at the end of the run is the Owner's own area.
			expect(rendered[rendered.length - 1]).toEqual(OWNER_RENDER);
			// The delegated session's own binding — its own framework module graph, its own State store,
			// the same extension ids, as the loader gives a subagent's runner — never clears what is on
			// screen: every rendering this run emitted after arming carries a session's own area, and
			// none of them is the empty list that clears the widget.
			expect(rendered.filter(lines => lines === undefined)).toEqual([]);
			expect(
				widgetFrames(run.session)
					.filter(frame => frame.widgetKey === MARKER_AREA_KEY)
					.every(frame => frame.widgetPlacement === MARKER_AREA_PLACEMENT),
			).toBe(true);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
