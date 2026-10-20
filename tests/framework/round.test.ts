/**
 * The round axis's native synthesis at the public adapter seam (S2; F6; contract P8, P9).
 *
 * A round is the whole active period — from the agent taking up input until quiescence — and it
 * may contain several model-response turns and several low-level runs. The harness's
 * vocabulary is about those runs: `agent_start` fires when an agent loop starts, once per user
 * prompt, and `agent_end` when one ends, carrying whether the session has already scheduled its
 * next piece of work. Neither is a round edge on its own, so what this suite observes is the
 * synthesis the framework performs over them: the round opens at the first start, and it closes
 * only once a settle that scheduled nothing has been *confirmed* — the settle itself is an end
 * candidate, held while the native callback returns so the host can settle, and re-checked on the
 * harness's next task, where the session must report that its own work has come to rest — idle,
 * with nothing queued — and, unless the activity ended cancelled or failed, that nothing beyond
 * the run still holds it. The round stays open through everything that continues the work
 * inside it, whether that is an automatic continuation, a drained queued message or a job that has
 * not drained yet.
 *
 * The abrupt ends are the interesting case. A run that fails closed and a run a user interrupted
 * end through the same native settle an ordinary answer ends through, with no continuation flag,
 * so they end the round too: a panel that kept showing "working" after an error would be
 * describing a run that will never resume. What the settle *does* carry is the outcome the
 * harness stated for the cycle — the finalized message's own stop reason, in the same
 * three-valued vocabulary this adapter's Turn mapping already reads — and a cancelled or failed
 * activity ends its round on the session's own rest alone: nothing beyond it will resume it, so a
 * job still running elsewhere cannot be what its round waits for. An ordinary answer keeps
 * waiting, exactly as before, and a cycle the harness retries is not an end candidate at all.
 *
 * The idle query the arm path asks is one of the same synthesis's inputs, and it is observed here
 * the same way: the adapter answers the session's own fact, and answers nothing at all for a
 * harness whose context reports none.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import type {
	OmpAgentEndEvent,
	OmpAgentStartEvent,
	OmpCommandContext,
	OmpExtensionApi,
	OmpSessionContext,
} from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import type { CommandDelivery } from "../../framework/interface/command";
import type { RoundDelivery, RoundEvent } from "../../framework/interface/session";
import {
	type ExtensionDefinition,
	type ImplementationEventHandlers,
	defineExtension,
	defineImplementation,
} from "../../framework/interface";

/** The definition under test: one directed command, so the arm path can be driven too. */
const PROBE: ExtensionDefinition = defineExtension({
	id: "round-probe",
	displayName: "roundProbe",
	commands: [{ type: "directed", name: "round-probe", state: "enabled" }],
});

/**
 * The end this adapter's rounds really reach: a settle the framework re-checked on the host's next task
 * and confirmed against the session's own facts, so how that end was established is stated as such.
 */
const END: RoundEvent = { kind: "round_end", ending: "confirmed" };

// The adapter's one scheduling act is the end candidate's re-check on the host's next task; the
// suite runs that task on a deterministic clock rather than waiting for wall time to pass.
beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

/** Runs a synchronous scenario while capturing the adapter's non-model reporting channel. */
function withCapturedStderr<T>(run: () => T): { readonly diagnostics: string[]; readonly value: T } {
	const chunks: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	}) as typeof process.stderr.write;
	try {
		return { diagnostics: chunks, value: run() };
	} finally {
		process.stderr.write = original;
	}
}

/** One session as the harness holds it, and the idle facts its context reports. */
interface SessionFacts {
	readonly sessionId: string;
	readonly hasUI?: boolean;
	/**
	 * Whether the context reports the agent as idle. Absent models a harness whose context
	 * reports no idle fact at all — a surface the adapter must not answer for.
	 */
	readonly idle?: boolean;
	/** Whether messages are queued and waiting for the current run. */
	readonly queued?: boolean;
	/** How many asynchronous jobs this session still has running. */
	readonly runningJobs?: number;
}

/** One native round lifecycle handler as the loader registers it. */
type RoundHandler = (event: OmpAgentStartEvent | OmpAgentEndEvent, ctx: OmpSessionContext) => void;

/** The native surface a loader hands the factory, recording what the adapter registered. */
interface NativeSurface {
	readonly api: OmpExtensionApi;
	/** The semantic round edges the framework dispatched, in call order. */
	readonly observed: RoundEvent[];
	/** The owner key each edge named, in call order. */
	readonly owners: string[];
	/** The `hasUI` fact each edge carried, in call order. */
	readonly hasUI: boolean[];
	/** What the injected arm-path implementation read from its delivery's idle query, in call order. */
	readonly answers: Array<boolean | undefined>;
	/** A run starting: the native `agent_start`. */
	start(facts: SessionFacts): void;
	/** A run settling: the native `agent_end`, with the continuation flag it carries. */
	settle(facts: SessionFacts, options?: { readonly willContinue?: boolean }): void;
	/**
	 * One finalized assistant response: the native `message_end`, which is what states how a cycle
	 * ended (`stopReason`), exactly as the Turn axis reads it.
	 */
	messageEnds(facts: SessionFacts, options?: { readonly stopReason?: string }): void;
	/** A run failing: the native settle an errored run reaches the adapter through. */
	fail(facts: SessionFacts): void;
	/** A run the user interrupted: the native settle an aborted run reaches the adapter through. */
	abort(facts: SessionFacts): void;
	/** How many times this surface was asked to register or publish anything. */
	nativeCalls(): number;
	/** The host's next task: the moment the framework's own re-check of an end candidate runs. */
	nextTask(): void;
	/** A command context as the runner builds it for one session. */
	commandContext(facts: SessionFacts): OmpCommandContext;
	/** Runs the definition's own command in that context, as a user would. */
	runCommand(ctx: OmpCommandContext): void;
}

/**
 * Records every registration and effect, and delivers the native run-lifecycle events like the
 * runner. One definition is bound to it, exactly as the loader binds one extension per session,
 * and the assembly's own round subscription records what the framework dispatched.
 */
function boundSurface(): NativeSurface {
	const roundHandlers: Record<"agent_start" | "agent_end", RoundHandler[]> = {
		agent_start: [],
		agent_end: [],
	};
	/** The native subscriptions this adapter registers that are not round-cycle ones (the message fact). */
	const otherHandlers = new Map<string, Array<(event: unknown, ctx: OmpSessionContext) => void>>();
	const registrations = new Map<
		string,
		{ readonly handler: (args: string, ctx: OmpCommandContext) => void | Promise<void> }
	>();
	const observed: RoundEvent[] = [];
	const owners: string[] = [];
	const hasUI: boolean[] = [];
	const answers: Array<boolean | undefined> = [];

	const contextOf = (facts: SessionFacts): OmpSessionContext => ({
		agent: { kind: "main", id: "Main" },
		sessionManager: { getSessionId: () => facts.sessionId, getBranch: () => [] },
		hasUI: facts.hasUI ?? true,
		ui: { notify: () => {}, setWidget: () => {} },
		// The native facts behind the quiescence gate, present exactly when this session's
		// surface reports them.
		...(facts.idle === undefined ? {} : { isIdle: () => facts.idle as boolean }),
		...(facts.queued === undefined ? {} : { hasPendingMessages: () => facts.queued as boolean }),
		...(facts.runningJobs === undefined
			? {}
			: { getAsyncJobSnapshot: () => ({ running: Array.from({ length: facts.runningJobs ?? 0 }, () => ({})) }) }),
	});

	const api: OmpExtensionApi = {
		// The suite observes the round axis, not labels or entries.
		setLabel(): void {},
		registerCommand(name, registration): void {
			registrations.set(name, registration);
		},
		appendEntry(): void {},
		on(event: string, handler: never): void {
			if (event === "agent_start" || event === "agent_end") {
				roundHandlers[event].push(handler as RoundHandler);
				return;
			}
			const listeners = otherHandlers.get(event) ?? [];
			listeners.push(handler as (event: unknown, ctx: OmpSessionContext) => void);
			otherHandlers.set(event, listeners);
		},
	};

	// The assembly's own subscription: what the framework hands a shared-logic round handler,
	// recorded as the fact under test.
	const record = (delivery: RoundDelivery): void => {
		observed.push(delivery.event);
		owners.push(delivery.owner.kind === "unresolved" ? "<unresolved>" : delivery.owner.key);
		hasUI.push(delivery.hasUI);
	};
	const events: ImplementationEventHandlers<{}> = {
		round_start: (_state, delivery) => record(delivery),
		round_end: (_state, delivery) => record(delivery),
	};

	// The arm path: it only asks the delivery's idle query, which is what an extension does with
	// it when it settles the state it reports at arm.
	const factory = frameworkOmp.ompAdapter(PROBE, {
		implementation: defineImplementation({
			create: () => ({}),
			subscriptions: [{ scope: "owner", events }],
			commands: {
				"round-probe": {
					run: (_state, _directive, delivery: CommandDelivery) => {
						answers.push(delivery.canAcceptInput());
					},
				},
			},
		}),
	});
	if (!factory(api).bound) throw new Error("the round probe definition did not bind");

	const deliverRound = (event: OmpAgentStartEvent | OmpAgentEndEvent, facts: SessionFacts): void => {
		for (const handler of roundHandlers[event.type]) handler(event, contextOf(facts));
	};

	/** One native fact outside the run-cycle pair, delivered the way the harness delivers it. */
	const deliverOther = (event: string, payload: unknown, facts: SessionFacts): void => {
		for (const listener of [...(otherHandlers.get(event) ?? [])]) listener(payload, contextOf(facts));
	};

	/** Everything this adapter has asked the host to register or publish so far. */
	const nativeCalls = (): number => {
		let total = registrations.size + roundHandlers.agent_start.length + roundHandlers.agent_end.length;
		for (const listeners of otherHandlers.values()) total += listeners.length;
		return total;
	};

	return {
		api,
		observed,
		owners,
		hasUI,
		answers,
		start: facts => deliverRound({ type: "agent_start" }, facts),
		settle: (facts, options = {}) =>
			deliverRound({ type: "agent_end", willContinue: options.willContinue }, facts),
		messageEnds: (facts, options = {}) =>
			deliverOther("message_end", { type: "message_end", message: { role: "assistant", stopReason: options.stopReason } }, facts),
		// The error path and the abort path reach the adapter as an ordinary settle, preceded by the
		// finalized message whose own stop reason says how that cycle ended — the same material the
		// Turn axis reads its outcome from, and what tells a terminal cancellation from an answer.
		fail: facts => {
			deliverOther("message_end", { type: "message_end", message: { role: "assistant", stopReason: "error" } }, facts);
			deliverRound({ type: "agent_end" }, facts);
		},
		abort: facts => {
			deliverOther("message_end", { type: "message_end", message: { role: "assistant", stopReason: "aborted" } }, facts);
			deliverRound({ type: "agent_end" }, facts);
		},
		nativeCalls,
		// The adapter arranges the re-check with the host's own task primitive; on the suite's
		// deterministic clock, arriving at that task is running the callback the adapter arranged.
		nextTask: () => {
			vi.runAllTimers();
		},
		commandContext: contextOf,
		runCommand(ctx: OmpCommandContext): void {
			const registration = registrations.get("round-probe");
			if (registration === undefined) throw new Error('command "round-probe" was not registered');
			registration.handler("", ctx);
		},
	};
}

/** A session at quiescence, as a session sitting at the prompt reports itself. */
const QUIESCENT: SessionFacts = { sessionId: "session-1", idle: true, queued: false, runningJobs: 0 };

describe("the round opens and closes on real transitions (F6, P8)", () => {
	test("the first run start opens the round, and a further start inside it opens no other", () => {
		const surface = boundSurface();

		surface.start(QUIESCENT);
		// A start that happens while the round is already open is not a transition: the agent is
		// already working, and a second "working" edge would report nothing new.
		surface.start(QUIESCENT);

		expect(surface.observed).toEqual([{ kind: "round_start" }]);
	});

	test("a settle is an end candidate, and the round ends at the host's next task instead", () => {
		const surface = boundSurface();
		surface.start(QUIESCENT);

		surface.settle(QUIESCENT);
		// The native callback returned with nothing dispatched: the harness reports the run as over
		// before its own work has unwound, so an end confirmed right here would close a round the
		// session may still be working in.
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		surface.nextTask();
		// On the next task the session reports quiescence, and that is what ends the round.
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);

		// Already idle: there is no open round left to close, so no second edge is produced.
		surface.settle(QUIESCENT);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("a session still at work does not end, and a later settle that finds it idle does", () => {
		const surface = boundSurface();
		surface.start(QUIESCENT);

		// The work has not unwound yet — the prompt is still in flight — so the candidate is kept
		// rather than confirmed.
		surface.settle({ ...QUIESCENT, idle: false });
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		// The session's own facts re-verify it when the next settle arrives, and that one is
		// confirmed: no polling, no duration guessed, just the next fact that could decide it.
		surface.settle(QUIESCENT);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("a settle that already scheduled its continuation is a pause inside the round", () => {
		const surface = boundSurface();
		surface.start(QUIESCENT);

		// An automatic retry, an empty-stop recovery, a compaction continuation or a stop-hook
		// turn arrives as a settle with its continuation already scheduled.
		surface.settle(QUIESCENT, { willContinue: true });
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		// The real settle, once nothing is left to continue, is the round's end.
		surface.settle(QUIESCENT);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("a drained queued message stays inside the round, and supersedes its candidate", () => {
		const surface = boundSurface();
		surface.start(QUIESCENT);

		// A message is queued, so this settle is the current run pausing rather than the agent
		// running out of work: the next task finds the session with work left and closes nothing.
		surface.settle({ ...QUIESCENT, queued: true });
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		// The queued message drains into its own run — still the same round, so its start opens
		// no second round, and the re-check the settle arranged confirms nothing when it runs.
		surface.start(QUIESCENT);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		surface.settle(QUIESCENT);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("a running asynchronous job keeps the round open until it drains", () => {
		const surface = boundSurface();
		surface.start(QUIESCENT);

		surface.settle({ ...QUIESCENT, runningJobs: 1 });
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		surface.settle(QUIESCENT);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("one session's settle never closes another session's round, and a child's end is its own", () => {
		const surface = boundSurface();
		const parent: SessionFacts = { sessionId: "session-parent", idle: true, queued: false, runningJobs: 0 };
		const child: SessionFacts = { sessionId: "session-child", idle: true, queued: false, runningJobs: 0 };

		surface.start(parent);
		surface.start(child);
		// The child — a subagent the parent is waiting on — settles and is confirmed ended. The
		// parent's Round is its own and nothing about the child's end touches it.
		surface.settle(child);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, { kind: "round_start" }, END]);
		expect(surface.owners).toEqual(["main:session-parent", "main:session-child", "main:session-child"]);

		// The parent's own settle, confirmed on the host's next task, is what ends the parent's Round.
		surface.settle(parent);
		surface.nextTask();
		expect(surface.observed).toEqual([
			{ kind: "round_start" },
			{ kind: "round_start" },
			END,
			END,
		]);
		expect(surface.owners).toEqual([
			"main:session-parent",
			"main:session-child",
			"main:session-child",
			"main:session-parent",
		]);
	});
});

describe("an abrupt terminal state closes the round too (F6, P8, P21)", () => {
	test("a failed run and an interrupted run end the round as an ordinary answer does", () => {
		const surface = boundSurface();

		// The error path and the abort path both reach the adapter as the same native settle an
		// ordinary answer reaches it through, with no continuation scheduled, and the message that
		// preceded each states how the cycle ended.
		surface.start(QUIESCENT);
		surface.fail(QUIESCENT);
		surface.nextTask();
		surface.start(QUIESCENT);
		surface.abort(QUIESCENT);
		surface.nextTask();

		expect(surface.observed).toEqual([
			{ kind: "round_start" },
			END,
			{ kind: "round_start" },
			END,
		]);
	});

	test("an abrupt end carries no outcome: the round edge states the transition alone", () => {
		const surface = boundSurface();
		surface.start(QUIESCENT);

		surface.fail(QUIESCENT);
		surface.nextTask();

		// How the activity came out is the harness's vocabulary, not the framework's: a subscriber that
		// needs the agent's state asks the idle query rather than reading it off this edge, and what the
		// activity's own outcome is used for is the framework's rest rule, never a payload. What the end
		// does state is how the end itself was established.
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
		expect(Object.keys(surface.observed[1] ?? {})).toEqual(["kind", "ending"]);
	});

	test("a cancelled run's round ends although this session still owns a running job", () => {
		const surface = boundSurface();
		// The work whose result would resume an ordinary session: a job this session owns, still
		// running when its run was interrupted.
		const interrupted: SessionFacts = { sessionId: "session-cancelled", idle: true, queued: false, runningJobs: 1 };

		surface.start(interrupted);
		surface.abort(interrupted);
		surface.nextTask();

		// Nothing will resume this activity — it was cancelled — so a round held open on the job would
		// be one nothing could ever close.
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("a terminally failed run's round ends the same way", () => {
		const surface = boundSurface();
		const failed: SessionFacts = { sessionId: "session-failed", idle: true, queued: false, runningJobs: 2 };

		surface.start(failed);
		surface.fail(failed);
		surface.nextTask();

		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("the same running job keeps an ordinary answer's round open until the session is at rest", () => {
		const surface = boundSurface();
		const waiting: SessionFacts = { sessionId: "session-waiting", idle: true, queued: false, runningJobs: 1 };

		surface.start(waiting);
		surface.messageEnds(waiting, { stopReason: "stop" });
		surface.settle(waiting);
		surface.nextTask();
		// The activity answered: the job it launched is what will resume it, so its round stays open.
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		surface.settle({ ...waiting, runningJobs: 0 });
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("an errored cycle the harness retries is not a terminal failure", () => {
		const surface = boundSurface();
		const retrying: SessionFacts = { sessionId: "session-retrying", idle: true, queued: false, runningJobs: 1 };

		surface.start(retrying);
		// The cycle errored, and the harness scheduled its own retry: the settle says so, so it is a
		// pause inside the round rather than an end candidate at all.
		surface.messageEnds(retrying, { stopReason: "error" });
		surface.settle(retrying, { willContinue: true });
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		// The retry ran and answered, and the job is still running: the round waits on it, so the
		// error the *earlier* cycle stated did not become this activity's end.
		surface.messageEnds(retrying, { stopReason: "stop" });
		surface.settle(retrying);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		surface.settle({ ...retrying, runningJobs: 0 });
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("ending a cancelled round registers nothing with the host and stops nothing it owns", () => {
		const surface = boundSurface();
		const interrupted: SessionFacts = { sessionId: "session-untouched", idle: true, queued: false, runningJobs: 1 };

		surface.start(interrupted);
		const before = surface.nativeCalls();
		surface.abort(interrupted);
		surface.nextTask();

		// Closing the round is the framework's bookkeeping: no second registration, no subscription
		// added, no job cancelled and no queue cleared on this session's behalf.
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
		expect(surface.nativeCalls()).toBe(before);
	});
});

describe("an ended round is not reopened, and only a real execution opens a new one (P22)", () => {
	test("a cancelled round stays closed, and work arriving after it opens no round of its own", () => {
		const surface = boundSurface();
		const session: SessionFacts = { sessionId: "session-late", idle: true, queued: false, runningJobs: 1 };

		surface.start(session);
		surface.abort(session);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);

		// What arrives after the cancellation is a finalized message and a settle for a round that is
		// no longer open: appending a result is not an execution, so nothing is opened and nothing is
		// closed — no completion is fabricated for the round that already ended.
		surface.messageEnds(session, { stopReason: "stop" });
		surface.settle(session);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END]);
	});

	test("an execution that really starts after the cancellation opens a new round of its own", () => {
		const surface = boundSurface();
		const session: SessionFacts = { sessionId: "session-resumed", idle: true, queued: false, runningJobs: 1 };

		surface.start(session);
		surface.abort(session);
		surface.nextTask();

		// The wake that really runs: the harness states an activity beginning, which is the fact that
		// opens a round. The cancelled activity's outcome belongs to the round that ended with it, so
		// this new activity waits on the work it can still be resumed by.
		surface.start(session);
		surface.messageEnds(session, { stopReason: "stop" });
		surface.settle(session);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, END, { kind: "round_start" }]);

		surface.settle({ ...session, runningJobs: 0 });
		surface.nextTask();
		expect(surface.observed).toEqual([
			{ kind: "round_start" },
			END,
			{ kind: "round_start" },
			END,
		]);
	});

	test("a restored session's settle closes nothing", () => {
		const surface = boundSurface();
		const restored: SessionFacts = { sessionId: "session-restored", idle: true, queued: false, runningJobs: 0 };

		// A process that starts with no open round and is handed a settle has no round whose end this
		// could be: the boundary a previous process was in the middle of is not fabricated here.
		surface.fail(restored);
		surface.nextTask();

		expect(surface.observed).toEqual([]);
	});
});

describe("the round edge's facts come from its own session (F6, P8)", () => {
	test("the owner and the hasUI fact are the ones the edge's session reports", () => {
		const surface = boundSurface();

		surface.start({ ...QUIESCENT, sessionId: "session-7", hasUI: false });
		surface.settle({ ...QUIESCENT, sessionId: "session-7", hasUI: false });
		surface.nextTask();

		expect(surface.owners).toEqual(["main:session-7", "main:session-7"]);
		expect(surface.hasUI).toEqual([false, false]);
	});

	test("a surface that reports no quiescence fact closes no round, and says so once", () => {
		const surface = boundSurface();
		// This session's context reports no idle fact, no queue fact and no job fact.
		const bare: SessionFacts = { sessionId: "session-1" };

		const { diagnostics } = withCapturedStderr(() => {
			surface.start(bare);
			surface.settle(bare);
			surface.nextTask();
			surface.settle(bare);
			surface.nextTask();
		});

		// Quiescence cannot be established, and an unestablished quiescence is not one: the round
		// stays open rather than being closed on a guess about a harness that said nothing.
		expect(surface.observed).toEqual([{ kind: "round_start" }]);
		// Reported, not silent — and once per binding, not once per settle.
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toContain("round-probe");
	});
});

describe("the idle query at the native seam (F6, P9)", () => {
	test("the query answers the session's own idle fact", () => {
		const surface = boundSurface();

		surface.runCommand(surface.commandContext({ ...QUIESCENT, idle: true }));
		surface.runCommand(surface.commandContext({ ...QUIESCENT, idle: false }));

		expect(surface.answers).toEqual([true, false]);
	});

	test("the query re-reads the session's fact instead of delivering a snapshot", () => {
		const surface = boundSurface();
		// One context whose own fact moves: the adapter's query closes over the live native read,
		// so asking again answers what the session reports now, not what it reported at binding or
		// at the previous invocation.
		const facts = { sessionId: "session-live", idle: true as boolean | undefined, queued: false, runningJobs: 0 };
		const context = surface.commandContext(facts);

		surface.runCommand(context);
		facts.idle = false;
		surface.runCommand(context);
		facts.idle = undefined;
		surface.runCommand(context);

		expect(surface.answers).toEqual([true, false, undefined]);
	});

	test("a context that reports no idle fact answers nothing, and says so once", () => {
		const surface = boundSurface();
		const bare: SessionFacts = { sessionId: "session-1" };

		const { diagnostics } = withCapturedStderr(() => {
			surface.runCommand(surface.commandContext(bare));
			surface.runCommand(surface.commandContext(bare));
		});

		// The adapter does not answer for a harness that reported nothing, and the operator is
		// told that once rather than on every arm.
		expect(surface.answers).toEqual([undefined, undefined]);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toContain("round-probe");
	});
});
