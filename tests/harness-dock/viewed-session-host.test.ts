/**
 * The Viewed session outlet on the real patched host (ticket 01, S5).
 *
 * These runs execute the frozen patched artifact's own CLI in RPC mode with the repository's
 * explicit-only extension set: a credential-free provider fixture pointed at the dock's local
 * capture endpoint (no real network) and a probe extension that consumes only the public outlet
 * (`getViewedSession()` / `subscribeViewedSessionChanged()`). The probe records what it was handed
 * into the run root, so every assertion below is about what a real extension in a real host
 * observed — not about a module the test itself calls.
 *
 * The same probe runs against the unpatched baseline install as the control: there it reports an
 * absent outlet, which is what makes the patched runs evidence that the patch publishes it.
 *
 * Nothing here polls or sleeps: every fact change is driven by an awaited RPC command or turn, and
 * the host raises a change synchronously with the event that causes it, so the probe's record of
 * that change is on disk before the command's own answer reaches this test.
 *
 * What these runs cannot drive is a focused view: the interactive TUI owns the view and this dock
 * only speaks RPC. The transitions that need a focus switch (focus a subagent, focused agent dies)
 * are covered deterministically against the artifact's outlet module in `viewed-session.test.ts`,
 * and the real interactive run is prepared for human acceptance in
 * `host-patches/omp-18.5.0-viewed-session/README.md`.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
	type IsolatedHarness,
	REPO_ROOT,
	type RpcFrame,
	ControlledSession,
	createRunRoot,
	ensureIsolatedVersion,
	readBaselineRecord,
	startCaptureServer,
} from "./index";
import { ensureViewedSessionHarness } from "./viewed-session-harness";

const record = readBaselineRecord();

/** The fixture provider and the probe, both loaded explicitly (`-e`). */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "viewed-session", "provider.ts");
const PROBE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "viewed-session", "probe.ts");

/** The RPC commands and probe actions these runs drive, as literals rather than imports. */
const PROBE_COMMAND = "viewed-outlet";
const EVIDENCE_ENV = "DOCK_VIEWED_EVIDENCE";
const CAPTURE_ENV = "DOCK_VIEWED_CAPTURE_BASE_URL";
const PROVIDER = "viewed-dock";
const MODEL_A = "viewed-model-a";
const MODEL_B = "viewed-model-b";
const CONTEXT_WINDOW = 64_000;

/** The snapshot fields the probe recorded; the host owns the shape, the test only reads it. */
interface Facts {
	agent: { id: string; kind: "main" | "sub"; parentId?: string };
	sessionId?: string;
	name?: string;
	provider?: string;
	model?: string;
	effort?: string;
	context?: { tokens: number; contextWindow: number };
	unavailable: readonly string[];
}

interface EvidenceEntry {
	kind: string;
	facts?: Facts | null;
	context?: { tokens: number; contextWindow: number } | null;
	read?: boolean;
	subscribe?: boolean;
	subscribed?: boolean;
	deliveries?: number;
}

/** The `get_state` fields these runs compare against. */
interface HostState {
	sessionId?: string;
	thinkingLevel?: string;
	modelId?: string;
	contextTokens?: number;
}

/** An RPC payload as an object, when it really is one. */
function payloadRecord(frame: RpcFrame): Record<string, unknown> {
	const data = frame.data;
	return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** The `get_state` answer, validated once instead of trusting a cast at every read. */
function hostState(frame: RpcFrame): HostState {
	const data = payloadRecord(frame);
	const model = data.model !== null && typeof data.model === "object" ? (data.model as Record<string, unknown>) : {};
	const usage =
		data.contextUsage !== null && typeof data.contextUsage === "object"
			? (data.contextUsage as Record<string, unknown>)
			: {};
	return {
		sessionId: typeof data.sessionId === "string" ? data.sessionId : undefined,
		thinkingLevel: typeof data.thinkingLevel === "string" ? data.thinkingLevel : undefined,
		modelId: typeof model.id === "string" ? model.id : undefined,
		contextTokens: typeof usage.tokens === "number" ? usage.tokens : undefined,
	};
}

/** The selectable effort levels the host itself listed for the running model. */
function thinkingLevels(frame: RpcFrame): string[] {
	const levels = payloadRecord(frame).levels;
	return Array.isArray(levels) ? levels.filter((level): level is string => typeof level === "string") : [];
}

function readEvidence(file: string): EvidenceEntry[] {
	if (!existsSync(file)) return [];
	return readFileSync(file, "utf8")
		.split("\n")
		.filter(line => line.trim().length > 0)
		.map(line => JSON.parse(line) as EvidenceEntry);
}

/** The facts the probe recorded for one entry kind, in the order the host delivered them. */
function recordedFacts(entries: readonly EvidenceEntry[], kind: string): Facts[] {
	return entries.filter(entry => entry.kind === kind).flatMap(entry => (entry.facts ? [entry.facts] : []));
}

/** The last recorded entry of one kind: the state the host was in at the end of a step. */
function lastEntry(entries: readonly EvidenceEntry[], kind: string): EvidenceEntry | undefined {
	const matching = entries.filter(entry => entry.kind === kind);
	return matching[matching.length - 1];
}

/** One probe invocation; the command reports usage errors like any other extension command. */
function probe(session: ControlledSession, action: string): Promise<{ status: string; agentInvoked: boolean }> {
	return session.prompt(`/${PROBE_COMMAND} ${action}`);
}

let patched: IsolatedHarness;

beforeAll(async () => {
	patched = await ensureViewedSessionHarness(record);
}, 600_000);

describe("the frozen Viewed session host publishes the outlet (S5)", () => {
	test("an extension reads the displayed session's identity, name, model, effort and context with nothing unavailable", async () => {
		const runRoot = createRunRoot("viewed-outlet-read");
		const capture = startCaptureServer({ dir: runRoot.captureDir });
		const evidence = path.join(runRoot.path, "viewed-evidence.jsonl");
		try {
			const session = await ControlledSession.start({
				harness: patched,
				runRoot,
				extensions: [PROVIDER_FIXTURE, PROBE],
				model: `${PROVIDER}/${MODEL_A}`,
				env: { [CAPTURE_ENV]: capture.baseUrl, [EVIDENCE_ENV]: evidence },
			});
			try {
				// The name is the test's own literal: the outlet has to report what the host was told.
				await session.request({ type: "set_session_name", name: "viewed-outlet-dock" });
				const state = hostState(await session.request({ type: "get_state" }));
				const present = await probe(session, "present");
				expect(present.agentInvoked).toBe(false);
				expect(present.status).toBe("completed");
				await probe(session, "read");

				const entries = readEvidence(evidence);
				expect(entries.find(entry => entry.kind === "present")).toEqual({
					kind: "present",
					read: true,
					subscribe: true,
				});
				const facts = lastEntry(entries, "read")?.facts;
				expect(facts?.agent).toEqual({ id: "Main", kind: "main" });
				expect(facts?.sessionId).toBe(state.sessionId);
				expect(facts?.name).toBe("viewed-outlet-dock");
				expect(facts?.provider).toBe(PROVIDER);
				expect(facts?.model).toBe(MODEL_A);
				expect(facts?.context?.contextWindow).toBe(CONTEXT_WINDOW);
				expect(facts?.context?.tokens).toBe(state.contextTokens);
				// The effort is the session's actual effective level, not a configured intent: the
				// outlet reports the same level the host's own state does, and names it when absent.
				expect(facts?.effort).toBe(state.thinkingLevel);
				expect(facts?.unavailable).toEqual([]);
			} finally {
				await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
			}
		} finally {
			capture.stop();
			runRoot.dispose();
		}
	}, 180_000);

	test("a subscriber is told when the displayed session's effort, model and context change, and unsubscribe stops it", async () => {
		const runRoot = createRunRoot("viewed-outlet-changes");
		const capture = startCaptureServer({ dir: runRoot.captureDir });
		const evidence = path.join(runRoot.path, "viewed-evidence.jsonl");
		try {
			const session = await ControlledSession.start({
				harness: patched,
				runRoot,
				extensions: [PROVIDER_FIXTURE, PROBE],
				model: `${PROVIDER}/${MODEL_A}`,
				env: { [CAPTURE_ENV]: capture.baseUrl, [EVIDENCE_ENV]: evidence },
			});
			try {
				const before = hostState(await session.request({ type: "get_state" }));
				const requestsBefore = capture.requests().length;
				await probe(session, "subscribe");

				// Same-target effort change: the level this test sets is the level the outlet must
				// report, and it is one the host itself lists as selectable.
				const levels = thinkingLevels(await session.request({ type: "get_available_thinking_levels" }));
				const chosen = levels.find(level => level !== before.thinkingLevel);
				const currentLevel = before.thinkingLevel;
				if (chosen === undefined || currentLevel === undefined) {
					throw new Error(`the host listed no effort level other than ${currentLevel ?? "<none>"}: ${levels.join(", ")}`);
				}
				const effortBoundary = readEvidence(evidence).length;
				await session.request({ type: "set_thinking_level", level: chosen });
				expect(
					recordedFacts(readEvidence(evidence).slice(effortBoundary), "delivery").some(facts => facts.effort === chosen),
				).toBe(true);

				// Each cause has its own delivery boundary: an earlier notification cannot prove a later one.
				const modelBoundary = readEvidence(evidence).length;
				await session.request({ type: "set_model", provider: PROVIDER, modelId: MODEL_B });
				expect(
					recordedFacts(readEvidence(evidence).slice(modelBoundary), "delivery").some(facts => facts.model === MODEL_B),
				).toBe(true);

				// Same-target context change: compare the actual host reading before and after the turn,
				// and require a fresh subscription delivery carrying that new reading.
				await probe(session, "context");
				const contextBefore = lastEntry(readEvidence(evidence), "context")?.context;
				const contextBoundary = readEvidence(evidence).length;
				const turn = await session.prompt("viewed outlet turn");
				expect(turn.agentInvoked).toBe(true);
				expect(turn.status).toBe("completed");

				const deliveries = recordedFacts(readEvidence(evidence), "delivery");
				expect(deliveries.length).toBeGreaterThanOrEqual(2);
				// Every delivery states the displayed session, and the changed facts are the ones this
				// test changed.
				expect(deliveries.every(facts => facts.agent.id === "Main" && facts.sessionId === before.sessionId)).toBe(true);
				expect(deliveries.some(facts => facts.effort === chosen)).toBe(true);
				expect(deliveries.some(facts => facts.model === MODEL_B)).toBe(true);
				await probe(session, "context");
				const contextAfter = lastEntry(readEvidence(evidence), "context")?.context;
				expect(contextBefore?.tokens).toBeNumber();
				expect(contextAfter?.tokens).toBeNumber();
				expect(contextAfter?.tokens).not.toBe(contextBefore?.tokens);
				expect(contextAfter?.contextWindow).toBe(CONTEXT_WINDOW);
				const contextDeliveries = recordedFacts(readEvidence(evidence).slice(contextBoundary), "delivery");
				expect(contextDeliveries.some(facts =>
					facts.context?.tokens === contextAfter?.tokens &&
					facts.context?.contextWindow === contextAfter?.contextWindow,
				)).toBe(true);

				await probe(session, "unsubscribe");
				// The evidence file is append-only, so everything recorded up to and including the
				// unsubscribe is the boundary: anything past it happened after the subscriber left.
				const unsubscribeMark = readEvidence(evidence);
				const unsubscribed = lastEntry(unsubscribeMark, "unsubscribed");
				expect(unsubscribed?.deliveries).toBeGreaterThan(0);

				// Changes after the unsubscribe are real fact changes the host would still deliver: none
				// may reach the subscriber that left, neither as a record nor in the host's own count.
				await session.request({ type: "set_model", provider: PROVIDER, modelId: MODEL_A });
				await session.request({ type: "set_thinking_level", level: currentLevel });
				await probe(session, "deliveries");

				const afterUnsubscribe = readEvidence(evidence);
				expect(afterUnsubscribe.slice(unsubscribeMark.length).filter(entry => entry.kind === "delivery")).toEqual([]);
				expect(lastEntry(afterUnsubscribe, "deliveries")?.deliveries).toBe(unsubscribed?.deliveries);

				// Reads stay live after unsubscribing: the snapshot follows the host, not a cache.
				await probe(session, "read");
				expect(lastEntry(readEvidence(evidence), "read")?.facts?.model).toBe(MODEL_A);

				// Reading and subscribing changed nothing the session runs: its own state is exactly
				// what this test set, its identity is the same session, and the outlet added no
				// outbound request of its own (one turn, one request).
				const after = hostState(await session.request({ type: "get_state" }));
				expect(after.sessionId).toBe(before.sessionId);
				expect(after.modelId).toBe(MODEL_A);
				expect(after.thinkingLevel).toBe(before.thinkingLevel);
				expect(capture.requests()).toHaveLength(requestsBefore + 1);
				expect((await session.stop()).exitCode).toBe(0);
			} finally {
				await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
			}
		} finally {
			capture.stop();
			runRoot.dispose();
		}
	}, 180_000);

	test("switching the session the host displays is readable as a live identity change", async () => {
		const runRoot = createRunRoot("viewed-outlet-switch");
		const capture = startCaptureServer({ dir: runRoot.captureDir });
		const evidence = path.join(runRoot.path, "viewed-evidence.jsonl");
		try {
			const session = await ControlledSession.start({
				harness: patched,
				runRoot,
				extensions: [PROVIDER_FIXTURE, PROBE],
				model: `${PROVIDER}/${MODEL_A}`,
				env: { [CAPTURE_ENV]: capture.baseUrl, [EVIDENCE_ENV]: evidence },
			});
			try {
				await probe(session, "read");
				await probe(session, "subscribe");
				const firstSessionId = lastEntry(readEvidence(evidence), "read")?.facts?.sessionId;
				expect(firstSessionId).toBeString();

				const created = await session.request({ type: "new_session" });
				expect(payloadRecord(created).cancelled).toBe(false);
				const state = hostState(await session.request({ type: "get_state" }));
				await probe(session, "read");

				// The displayed session is a different one now — the outlet reports it live rather than
				// replaying the snapshot a subscriber cached.
				const facts = lastEntry(readEvidence(evidence), "read")?.facts;
				expect(facts?.sessionId).not.toBe(firstSessionId);
				expect(facts?.sessionId).toBe(state.sessionId);
				expect(facts?.agent).toEqual({ id: "Main", kind: "main" });
			} finally {
				await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
			}
		} finally {
			capture.stop();
			runRoot.dispose();
		}
	}, 180_000);

	test("the unpatched baseline install reports no outlet to the same extension (control)", async () => {
		// The recorded supported version, explicitly: a candidate version selected in the ambient
		// environment must not stand in for the baseline this control is about.
		const baseline = await ensureIsolatedVersion(record, record.harness.supportedVersion);
		const runRoot = createRunRoot("viewed-outlet-control");
		const capture = startCaptureServer({ dir: runRoot.captureDir });
		const evidence = path.join(runRoot.path, "viewed-evidence.jsonl");
		try {
			const session = await ControlledSession.start({
				harness: baseline,
				runRoot,
				extensions: [PROVIDER_FIXTURE, PROBE],
				model: `${PROVIDER}/${MODEL_A}`,
				env: { [CAPTURE_ENV]: capture.baseUrl, [EVIDENCE_ENV]: evidence },
			});
			try {
				await probe(session, "present");
				await probe(session, "read");
				const entries = readEvidence(evidence);
				expect(entries.find(entry => entry.kind === "present")).toEqual({
					kind: "present",
					read: false,
					subscribe: false,
				});
				expect(recordedFacts(entries, "read")).toEqual([]);
			} finally {
				await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
			}
		} finally {
			capture.stop();
			runRoot.dispose();
		}
	}, 180_000);
});
