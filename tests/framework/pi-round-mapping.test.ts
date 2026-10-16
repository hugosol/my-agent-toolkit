/**
 * The pi adapter's Round mapping at the public adapter seam (S1; contract P18; ticket 03).
 *
 * pi's own vocabulary is about runs: `agent_start` when its agent loop begins, `agent_end` when one
 * run ends — *before* its automatic retries, its compaction and any queued continuation have been
 * decided — and `agent_settled` once the run has fully settled with nothing left to continue it.
 * A Round is not a run: it is the session's whole active period, and which fact is an edge of it is
 * the framework's synthesis. What this suite drives is the pi half of that mapping: which native
 * facts the adapter reports at all, and what it answers when the framework asks — on its next task —
 * whether the session is at quiescence.
 *
 * The case that matters is the low level below settlement. An adapter that treated pi's own run end
 * as the axis's end would cut a Round at the first pause — before a tool continuation, a retry or a
 * compaction — and would save a partial Round while the session was still working. Driving
 * `agent_end` here changes nothing, and the Round closes only on the settled fact plus the late
 * quiescence read.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { withCapturedStderr } from "./support/captured-stderr";
import { type PiSurfaceSession, boundPiSurface } from "./support/pi-surface-double";

// The adapter's one scheduling act is the end candidate's re-check on the host's next task, so the
// suite runs that task on a deterministic clock rather than waiting for wall time to pass.
beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

/** One session as pi reports it while a run is in flight: working, with nothing queued. */
function workingSession(overrides: Partial<PiSurfaceSession> = {}): PiSurfaceSession {
	return {
		sessionId: "pi-sess-round",
		name: "pi round session",
		model: { id: "deepseek-flash", provider: "deepseek" },
		idle: false,
		pending: false,
		...overrides,
	};
}

/** The same session once its work has unwound: pi idle, with nothing waiting to be taken up. */
function settledSession(overrides: Partial<PiSurfaceSession> = {}): PiSurfaceSession {
	return workingSession({ idle: true, ...overrides });
}

describe("the pi adapter's run-cycle facts synthesize the Round axis (P18)", () => {
	test("a run starting opens the session's round, and a further start inside it opens no other", () => {
		const surface = boundPiSurface();
		const session = workingSession();

		surface.runStarts(session);
		surface.runStarts(session);

		expect(surface.edges).toEqual(["round_start"]);
		// The edge is that actual session's own, which is what a per-session consumer keys on.
		expect(surface.rounds[0].session.sessionId).toBe("pi-sess-round");
	});

	test("pi's own run end — the level below settlement — closes nothing here", () => {
		const surface = boundPiSurface();
		const session = settledSession();

		surface.runStarts(session);
		// The native run end: pi publishes it before an automatic retry, a compaction or a queued
		// continuation has been decided, so it is not evidence that the session will not continue.
		surface.deliver("agent_end", { type: "agent_end", messages: [] }, session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start"]);

		// The settled fact, confirmed quiescent at the host's next task, is what ends it.
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});

	test("a settle is an end candidate: nothing closes where the native callback returned", () => {
		const surface = boundPiSurface();
		const session = settledSession();

		surface.runStarts(session);
		surface.runSettles(session);
		// The host has not had its chance to unwind yet, so no end is dispatched at this instant.
		expect(surface.edges).toEqual(["round_start"]);

		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});

	test("a session still working at the re-check keeps its round, and a later settle that finds it quiescent ends it", () => {
		const surface = boundPiSurface();
		const session = workingSession();

		surface.runStarts(session);
		surface.runSettles(session);
		surface.nextTask();
		// Not quiescent: the round is still the session's, and the candidate stays pending.
		expect(surface.edges).toEqual(["round_start"]);

		// The work unwinds, and the next settle is re-checked against what the session reports now.
		session.idle = true;
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});

	test("a message still waiting to be taken up is not quiescence, and the round survives it", () => {
		const surface = boundPiSurface();
		const session = workingSession({ idle: true, pending: true });

		surface.runStarts(session);
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start"]);

		session.pending = false;
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});

	test("a surface that reports no idle fact establishes no quiescence, and says so once", () => {
		const surface = boundPiSurface();
		// This session's context reports no idle reading at all: an unestablished quiescence, which is
		// not one, so no end is confirmed and nothing is invented in its place.
		const session: PiSurfaceSession = { sessionId: "pi-sess-noidle", model: { id: "deepseek-flash", provider: "deepseek" }, pending: false };

		const { stderr } = withCapturedStderr(() => {
			surface.runStarts(session);
			surface.runSettles(session);
			surface.nextTask();
			surface.runSettles(session);
			surface.nextTask();
		});

		expect(surface.edges).toEqual(["round_start"]);
		expect(stderr).toContain("idle fact (isIdle)");
		// Reported once rather than on every re-check.
		expect(stderr.split("idle fact (isIdle)").length - 1).toBe(1);
	});

	test("a surface that reports no pending-message fact establishes no quiescence either", () => {
		const surface = boundPiSurface();
		const session: PiSurfaceSession = { sessionId: "pi-sess-nopending", model: { id: "deepseek-flash", provider: "deepseek" }, idle: true };

		const { stderr } = withCapturedStderr(() => {
			surface.runStarts(session);
			surface.runSettles(session);
			surface.nextTask();
		});

		expect(surface.edges).toEqual(["round_start"]);
		expect(stderr).toContain("pending-message fact (hasPendingMessages)");
	});

	test("a settle with no round open closes nothing: a restored session fabricates no completion", () => {
		const surface = boundPiSurface();
		const session = settledSession();

		surface.runSettles(session);
		surface.nextTask();

		expect(surface.edges).toEqual([]);
	});

	test("a run starting after the round ended opens a new round rather than reopening the old one", () => {
		const surface = boundPiSurface();
		const session = settledSession();

		surface.runStarts(session);
		surface.runSettles(session);
		surface.nextTask();
		surface.runStarts(session);

		expect(surface.edges).toEqual(["round_start", "round_end", "round_start"]);
	});

	test("an interrupted run still settles the round once the session is quiescent", () => {
		const surface = boundPiSurface();
		const session = settledSession();

		surface.runStarts(session);
		// pi reports the abort on the same settled fact; whether the round ends is the framework's
		// quiescence rule, not the abort flag — this mapping decides no transition.
		surface.runSettles(session, { aborted: true });
		surface.nextTask();

		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});
});

describe("a session's own end is not the same fact as leaving it (S1, S2; P33)", () => {
	test("switching away from a session that is still working confirms nothing of its pending settle", () => {
		const surface = boundPiSurface();
		const left = workingSession({ sessionId: "pi-sess-left", name: "pi left" });
		const entered = workingSession({ sessionId: "pi-sess-entered", name: "pi entered", idle: true });

		surface.sessionStarts(left, "startup");
		surface.runStarts(left);
		// The run settled while the session's own facts still say it is busy: an end candidate, which the
		// framework holds and re-checks rather than confirming where the native callback returned.
		surface.runSettles(left);

		// The operator leaves for another session: the session being left ends as a transfer, and the one
		// entering starts under its own identity.
		surface.sessionStarts(entered, "startup");

		// The re-check now runs against the session that was left. A transfer is *not* that session's own
		// end — the host reports its own shutdown separately — so nothing here establishes rest, the
		// candidate stays unconfirmed and no Round ends. A mapping that read the transfer as the session
		// being over would end the Round here, while the session it names is still working.
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start"]);
		expect(surface.sessions.map(entry => entry.event.kind)).toEqual(["session_start", "session_end", "session_start"]);
		expect(surface.sessions[1]?.event).toEqual({ kind: "session_end", reason: "transferred" });

		// The session's own facts coming to rest are what ends its Round: that end arrives after the
		// switch, exactly once, and the Round it closes is the one the switch never closed.
		left.idle = true;
		surface.runSettles(left);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});
});
