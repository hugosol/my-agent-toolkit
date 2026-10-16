/**
 * The pi adapter's background-delegation Round mapping at the public adapter seam (S1; contract P19;
 * ticket 09).
 *
 * A session that has settled is not necessarily a session with nothing left to do: a background
 * delegation the harness is waiting on keeps the parent's own Round open, and the completion wake
 * that delegation sends continues that same Round rather than opening another. The provider states
 * that waiting in its own published terms — one versioned session-liveness registration per session,
 * whose `isActive()` it answers — and this suite drives exactly that surface, so what a case reads is
 * the protocol the pinned provider really speaks.
 *
 * Two distinctions the contract asks for are pinned in every case here: the provider's own statement
 * of "nothing is running" is the only answer that lets a Round close, and an answer this entry cannot
 * obtain — no registration, a registration naming another session, a failed integration, a registry
 * this entry does not hold — is not that statement. Nothing in this mapping keeps a Round open by
 * itself: no registration of its own, no timer, no second lifecycle.
 */
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { withCapturedStderr } from "./support/captured-stderr";
import {
	PROVIDER_READY_CHANNEL,
	SESSION_LIVENESS_REGISTRY_KEY,
	SESSION_LIVENESS_VERSION,
	type PiSurface,
	type PiSurfaceSession,
	boundPiSurface,
	forgetSessionLivenessRegistry,
	registerProviderLiveness,
} from "./support/pi-surface-double";

/** The repository root: this suite lives in `tests/framework/`. */
const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");

/**
 * The child entry the probe assembly declares, as a production assembly declares one: this is what
 * makes the process carry a subagent integration at all, and so what makes the provider's own
 * session-liveness registration readable here.
 */
const CHILD_ENTRY = path.join(REPO_ROOT, "entrypoints", "pi", "model-cost.ts");

// The adapter's one scheduling act is the end candidate's re-check on the host's next task, so the
// suite runs that task on a deterministic clock rather than waiting for wall time to pass.
beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	// The liveness slot is a fact of the process, so a case that installed one leaves none behind for
	// the next: every case below starts from the registry state a real process starts from.
	forgetSessionLivenessRegistry();
});

/** One session's id, unique to this suite: the provider's own registries are facts of the process. */
function sessionIdOf(label: string): string {
	return `pi-bg-${label}`;
}

/** One session as pi reports it, settled: the session's own work has unwound. */
function settledSession(sessionId: string): PiSurfaceSession {
	return {
		sessionId,
		name: `pi ${sessionId}`,
		model: { id: "deepseek-flash", provider: "deepseek" },
		idle: true,
		pending: false,
	};
}

/** The provider's own announcement that it is serving one session, as its `ready` payload states it. */
function announce(surface: PiSurface, sessionId: string): void {
	surface.bus.publish(PROVIDER_READY_CHANNEL, {
		version: 1,
		methods: ["ping"],
		session: { cwd: process.cwd(), sessionId, sessionFile: null },
	});
}

/**
 * A bound surface whose process really runs the provider: the provider announced itself, the session
 * started, and the integration has settled — which is the state an extension's own initialization is
 * handed before any Round of that session can be observed.
 */
async function surfaceServedByProvider(label: string): Promise<{ readonly surface: PiSurface; readonly session: PiSurfaceSession }> {
	const session = settledSession(sessionIdOf(label));
	const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
	announce(surface, session.sessionId);
	surface.sessionStarts(session, "startup");
	await surface.initialized();
	return { surface, session };
}

describe("a provider's own statement about background work decides the rest condition (P19)", () => {
	test("the provider holding work keeps the parent's round open; its own statement of none ends it", async () => {
		const { surface, session } = await surfaceServedByProvider("live-then-quiet");
		let held = true;
		const registration = registerProviderLiveness({ sessionId: session.sessionId, isActive: () => held });
		expect(registration.registered).toBe(true);

		surface.runStarts(session);
		surface.runSettles(session);
		surface.nextTask();

		// The provider states the session is still waiting on its delegation: pi's own facts are
		// settled, but the Round is not over, and nothing here closes it on a duration either.
		expect(surface.edges).toEqual(["round_start"]);

		// The provider's own answer moves to "nothing is running", and the next end candidate finds the
		// session at rest. Nothing was dispatched in between.
		held = false;
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});

	test("the wake a finished delegation sends continues the parent's round instead of opening another", async () => {
		const { surface, session } = await surfaceServedByProvider("wake-continues");
		let held = true;
		registerProviderLiveness({ sessionId: session.sessionId, isActive: () => held });

		// The prompt's own run, and the delegation it launched, which is still running elsewhere.
		surface.runStarts(session);
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start"]);

		// The delegation finished: the provider hands the parent its notice and the wake that notice
		// carries, and pi starts that run. It is work inside the Round the session is already in.
		surface.runStarts(session);
		expect(surface.edges).toEqual(["round_start"]);

		// The wake's own run settles, and the provider now states it holds nothing: that is the end.
		held = false;
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});
});

describe("a statement this entry could not read is not the provider's own all-clear (P19)", () => {
	test("a provider that runs without leaving a registration for the session states nothing about it", async () => {
		const { surface, session } = await surfaceServedByProvider("unregistered");

		const { stderr } = withCapturedStderr(() => {
			surface.runStarts(session);
			surface.runSettles(session);
			surface.nextTask();
			// Re-checked as often as the session settles: the report is one, not one per re-check.
			surface.runSettles(session);
			surface.nextTask();
		});

		// The provider is running here — it announced itself — and holds no registration for this
		// session, so nothing was read and nothing is closed: the round stays the session's.
		expect(surface.edges).toEqual(["round_start"]);
		expect(stderr).toContain("this session's background work cannot be read");
		expect(stderr).toContain("left no session-liveness registration");
		expect(stderr.split("this session's background work cannot be read").length - 1).toBe(1);
	});

	test("a registration naming another session is that session's statement, not this one's", async () => {
		const { surface, session } = await surfaceServedByProvider("other-session");
		registerProviderLiveness({ sessionId: sessionIdOf("elsewhere"), isActive: () => false });

		const { stderr } = withCapturedStderr(() => {
			surface.runStarts(session);
			surface.runSettles(session);
			surface.nextTask();
		});

		expect(surface.edges).toEqual(["round_start"]);
		expect(stderr).toContain("registered for another session");
	});

	test("a registry this entry did not publish is another host's protocol, and is read as nothing", async () => {
		// A compatible host's own registry, published before this entry bound: what it holds is that
		// host's to read, and displacing it would break the host the protocol belongs to.
		(globalThis as Record<PropertyKey, unknown>)[Symbol.for(SESSION_LIVENESS_REGISTRY_KEY)] = {
			version: SESSION_LIVENESS_VERSION,
			register: () => () => {},
		};
		const { surface, session } = await surfaceServedByProvider("foreign-registry");

		const { stderr } = withCapturedStderr(() => {
			surface.runStarts(session);
			surface.runSettles(session);
			surface.nextTask();
		});

		expect(surface.edges).toEqual(["round_start"]);
		expect(stderr).toContain("session-liveness registry this entry did not publish");
	});

	test("an answer that cannot be taken leaves the question open rather than answering it", async () => {
		const { surface, session } = await surfaceServedByProvider("failing-answer");
		registerProviderLiveness({
			sessionId: session.sessionId,
			isActive: () => {
				throw new Error("synthetic liveness read failure");
			},
		});

		const { stderr } = withCapturedStderr(() => {
			surface.runStarts(session);
			surface.runSettles(session);
			surface.nextTask();
		});

		expect(surface.edges).toEqual(["round_start"]);
		expect(stderr).toContain("synthetic liveness read failure");
	});

	test("an integration this entry's own requirement failed does not turn the provider's answer into silence", async () => {
		// A child entry the provider will not accept: this entry's own requirement is refused, so its
		// settled answer is the failure. That is a statement about the requirement, not about what the
		// provider holds, and the provider's own registration is still read on its own account.
		const session = settledSession(sessionIdOf("failed-requirement"));
		const surface = boundPiSurface({ childEntry: path.join(tmpdir(), "pi-background-rounds-absent-entry.ts") });
		announce(surface, session.sessionId);
		registerProviderLiveness({ sessionId: session.sessionId, isActive: () => false });
		surface.sessionStarts(session, "startup");
		const settled = await surface.initialized();
		expect(settled.subagents.mode).toBe("failed");

		surface.runStarts(session);
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});
});

describe("nothing of this entry's own keeps a round open (P20)", () => {
	test("a registration whose own work is a future task, a kept history or an open subscription holds nothing back", async () => {
		const { surface, session } = await surfaceServedByProvider("future-task");
		// The provider's published standard is the source of this answer: work that has not been
		// launched, a run it keeps for its history, and a wait subscription are none of them work the
		// session is waiting on, so the provider reports no live background work while they exist.
		registerProviderLiveness({ sessionId: session.sessionId, isActive: () => false });

		surface.runStarts(session);
		surface.runSettles(session);
		surface.nextTask();

		// The registration does not hold the round open, and this entry added no keep-alive of its own
		// beside it: the only message on the provider's own channels is the announcement this case
		// published, so this entry neither queried the provider nor registered anything with it.
		expect(surface.edges).toEqual(["round_start", "round_end"]);
		expect(surface.bus.emissions.map(emission => emission.channel)).toEqual([PROVIDER_READY_CHANNEL]);

		// An execution an already-registered future task really starts is that execution's own session,
		// and it opens and closes its own round like any other session's.
		const fired = settledSession(sessionIdOf("fired-execution"));
		registerProviderLiveness({ sessionId: fired.sessionId, isActive: () => false });
		surface.runStarts(fired);
		surface.runSettles(fired);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end", "round_start", "round_end"]);
		expect(surface.rounds[3].session.sessionId).toBe(fired.sessionId);
	});

	test("no deadline of this entry's own ends a round while the provider holds work", async () => {
		const { surface, session } = await surfaceServedByProvider("no-deadline");
		let held = true;
		registerProviderLiveness({ sessionId: session.sessionId, isActive: () => held });

		surface.runStarts(session);
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start"]);

		// The provider's own wake reservation expires on its own schedule — the deadline it already
		// keeps, which is the provider's fact and not a timer of this entry's. Time passing here is
		// nothing this mapping acts on: no later end candidate of this entry's own finds the session at
		// rest on account of it, and only the provider's own later answer can end the round.
		vi.advanceTimersByTime(600_000);
		expect(surface.edges).toEqual(["round_start"]);

		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start"]);

		// The provider's own answer is what ends it, whenever that answer arrives.
		held = false;
		surface.runSettles(session);
		surface.nextTask();
		expect(surface.edges).toEqual(["round_start", "round_end"]);
	});
});

describe("a parent's round and its children's rounds are their own (P19)", () => {
	test("a child's terminal state ends the child's round and leaves the parent's waiting", async () => {
		const parent = settledSession(sessionIdOf("parent"));
		const child = settledSession(sessionIdOf("child"));
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		announce(surface, parent.sessionId);
		surface.sessionStarts(parent, "startup");
		await surface.initialized();

		let parentHolds = true;
		registerProviderLiveness({ sessionId: parent.sessionId, isActive: () => parentHolds });
		registerProviderLiveness({ sessionId: child.sessionId, isActive: () => false });

		surface.runStarts(parent);
		surface.runSettles(parent);
		surface.nextTask();

		// The delegation runs in its own session, with its own round: opening and closing it is that
		// session's business, and the parent keeps waiting on the result it has not received.
		surface.runStarts(child);
		surface.runSettles(child);
		surface.nextTask();

		const kindsOf = (sessionId: string): string[] =>
			surface.rounds.filter(round => round.session.sessionId === sessionId).map(round => round.event.kind);
		expect(kindsOf(parent.sessionId)).toEqual(["round_start"]);
		expect(kindsOf(child.sessionId)).toEqual(["round_start", "round_end"]);

		// The result reached the parent, whose own run settles with nothing left to wait for.
		parentHolds = false;
		surface.runSettles(parent);
		surface.nextTask();
		expect(kindsOf(parent.sessionId)).toEqual(["round_start", "round_end"]);
	});
});
