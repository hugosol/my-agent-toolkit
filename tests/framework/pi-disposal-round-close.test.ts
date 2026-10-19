/**
 * pi's session disposal closes the round it leaves behind (S3; contract P27, P29; ticket 10).
 *
 * pi states an actual session's own end at a position it awaits: `session_shutdown` reaches an
 * extension's handlers one at a time and each handler's promise is waited for before pi's teardown
 * continues. That is the position the framework's close-out is reported from, and what this suite
 * drives is the pi half of it — which native fact is a disposal at all, which session it names, and
 * the order the host really observes: the round's end delivered, the handlers waited for, and only
 * then the binding's own release.
 *
 * The framework's disposition of a disposal it was handed, and the exactly-once rules around it, are
 * observed at the harness-neutral seam in `round-disposal.test.ts`. Here the facts are pi's own.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import type { RoundDelivery } from "../../framework/interface/session";
import type { PiSurface, PiSurfaceSession } from "./support/pi-surface-double";
import { boundPiSurface } from "./support/pi-surface-double";

// The adapter's one scheduling act is the end candidate's re-check on the host's next task; the suite
// keeps that task on a deterministic clock so a candidate is confirmed where the disposal is reported
// rather than by a task the test happened to let run.
beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

/** The session this binding serves: a top-level session with no lineage of its own. */
const MAIN: PiSurfaceSession = {
	sessionId: "pi-disposal-main",
	name: "pi disposal main",
	model: { id: "deepseek-flash", provider: "deepseek" },
	idle: false,
	pending: false,
};

/** One session pi spawned: its own identity, with pi's lineage link naming the file it came from. */
const CHILD: PiSurfaceSession = {
	sessionId: "pi-disposal-child",
	name: "pi disposal child",
	model: { id: "deepseek-flash", provider: "deepseek" },
	header: { type: "session", id: "pi-disposal-child", parentSession: "C:/sessions/pi-disposal-main.jsonl" },
	idle: false,
	pending: false,
};

/** Whether the session axis's own end was delivered for one session, in call order. */
function endsOf(surface: PiSurface, sessionId: string): string[] {
	return surface.sessions
		.filter(entry => entry.event.kind === "session_end" && entry.session.sessionId === sessionId)
		.map(entry => (entry.event.kind === "session_end" ? entry.event.reason : ""));
}

describe("pi's own session end closes that session's round (P27, P28)", () => {
	test("a settle still awaiting its re-check is confirmed where the host reports the end", async () => {
		const surface = boundPiSurface();
		surface.runStarts(MAIN);
		surface.runSettles(MAIN);
		// The settle was reported and the re-check is still arranged on the host's next task, which this
		// case never reaches: exactly the short-lived session whose end pi publishes before that task.
		expect(surface.edges).toEqual(["round_start"]);

		await surface.sessionShutsDown(MAIN, "quit");

		expect(surface.edges).toEqual(["round_start", "round_end"]);
		expect(surface.rounds[1].event).toEqual({ kind: "round_end", ending: "confirmed" });
		expect(surface.rounds[1].session.sessionId).toBe(MAIN.sessionId);
	});

	test("a round left open with no end of its own is truncated", async () => {
		const surface = boundPiSurface();
		surface.runStarts(MAIN);

		await surface.sessionShutsDown(MAIN, "quit");

		expect(surface.edges).toEqual(["round_start", "round_end"]);
		expect(surface.rounds[1].event).toEqual({ kind: "round_end", ending: "truncated" });
	});

	test("the end that is closed is the one session the host reported, not the session being served", async () => {
		const surface = boundPiSurface();
		surface.sessionStarts(MAIN, "startup");
		surface.sessionStarts(CHILD, "startup");
		surface.runStarts(MAIN);
		surface.runStarts(CHILD);

		await surface.sessionShutsDown(CHILD, "quit");

		// The child's own round is closed under the child's identity, and the session this binding
		// serves is left where it was.
		expect(surface.rounds.map(round => [round.session.sessionId, round.event.kind])).toEqual([
			[MAIN.sessionId, "round_start"],
			[CHILD.sessionId, "round_start"],
			[CHILD.sessionId, "round_end"],
		]);
		expect(surface.rounds[2].event).toEqual({ kind: "round_end", ending: "truncated" });
	});

	test("leaving one session for another is no disposal: the round it leaves stays open", async () => {
		const surface = boundPiSurface();
		surface.sessionStarts(MAIN, "startup");
		surface.runStarts(MAIN);

		// A switch, a resume and a fork are transfers: pi ends the session it is leaving, and that is
		// not this session going away.
		await surface.sessionShutsDown(MAIN, "new");
		expect(surface.edges).toEqual(["round_start"]);
		expect(endsOf(surface, MAIN.sessionId)).toEqual(["transferred"]);

		// The round the session really left open is still the framework's, and its own settle still
		// ends it: a transfer neither truncated it nor fabricated an end.
		surface.runSettles({ ...MAIN, idle: true });
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
		expect(surface.rounds[1].event).toEqual({ kind: "round_end", ending: "confirmed" });
	});
});

describe("the host's awaited end position is where the close-out is finished (P29)", () => {
	test("the binding is not released while the round's own handler is still working", async () => {
		const released = Promise.withResolvers<void>();
		const surface = boundPiSurface({
			onRoundEnd: async () => {
				await released.promise;
			},
		});
		surface.sessionStarts(MAIN, "startup");
		surface.runStarts(MAIN);
		surface.runSettles(MAIN);

		let answered = false;
		const shutdown = surface.sessionShutsDown(MAIN, "quit").then(() => {
			answered = true;
		});
		await Promise.resolve();
		await Promise.resolve();

		// The round's end was delivered, and nothing of the binding has been released yet: the session
		// axis's own end — which is what withdraws the observation seat, gives up the view subscription
		// and runs the extension's one cleanup — has not been delivered.
		expect({ answered, edges: surface.edges, ends: endsOf(surface, MAIN.sessionId) }).toEqual({
			answered: false,
			edges: ["round_start", "round_end"],
			ends: [],
		});

		released.resolve();
		await shutdown;

		expect({ answered, ends: endsOf(surface, MAIN.sessionId) }).toEqual({ answered: true, ends: ["disposed"] });
	});

	test("a repeated end report and a settle after it close nothing a second time", async () => {
		const surface = boundPiSurface();
		surface.sessionStarts(MAIN, "startup");
		surface.runStarts(MAIN);
		surface.runSettles(MAIN);

		await surface.sessionShutsDown(MAIN, "quit");
		// The same session reported again, and a settle that arrives after its round is closed: neither
		// is an edge, so nothing is delivered, saved or announced twice.
		await surface.sessionShutsDown(MAIN, "quit");
		surface.runSettles(MAIN);

		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});

	test("the close-out is reported before the session axis's own end, so an edge still reaches a subscriber", async () => {
		const order: string[] = [];
		const surface = boundPiSurface({
			onRoundEnd: (delivery: RoundDelivery) => {
				order.push(`round_end:${delivery.session.sessionId}`);
			},
		});
		surface.sessionStarts(MAIN, "startup");
		surface.runStarts(MAIN);

		await surface.sessionShutsDown(MAIN, "quit");
		order.push("session_end:" + endsOf(surface, MAIN.sessionId).join(","));

		expect(order).toEqual([`round_end:${MAIN.sessionId}`, "session_end:disposed"]);
	});
});
