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
 * harness's next task, where the session must report quiescence: idle, nothing queued, no
 * asynchronous job still running. The round stays open through everything that continues the work
 * inside it, whether that is an automatic continuation, a drained queued message or a job that has
 * not drained yet.
 *
 * The abrupt ends are the interesting case. A run that fails closed and a run a user interrupted
 * end through the same native settle an ordinary answer ends through, with no continuation flag
 * and no outcome the framework would have to interpret, so they end the round too: a panel that
 * kept showing "working" after an error would be describing a run that will never resume.
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
} from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";
import type { CommandDelivery } from "../../framework/core/protocol";
import {
	type CommandImplementations,
	type ExtensionDefinition,
	type RoundDelivery,
	type RoundEvent,
	defineExtension,
} from "../../framework/public";

/** The definition under test: one directed command, so the arm path can be driven too. */
const PROBE: ExtensionDefinition = defineExtension({
	id: "round-probe",
	displayName: "roundProbe",
	commands: [{ type: "directed", name: "round-probe", state: "enabled" }],
});

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
	/** A run failing: the native settle an errored run reaches the adapter through. */
	fail(facts: SessionFacts): void;
	/** A run the user interrupted: the native settle an aborted run reaches the adapter through. */
	abort(facts: SessionFacts): void;
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
			}
		},
	};

	// The assembly's own subscription: what the framework hands a shared-logic round handler,
	// recorded as the fact under test.
	const record = (delivery: RoundDelivery): void => {
		observed.push(delivery.event);
		owners.push(delivery.owner.kind === "unresolved" ? "<unresolved>" : delivery.owner.key);
		hasUI.push(delivery.hasUI);
	};
	const events = {
		round_start: record,
		round_end: record,
	};

	// The arm path: it only asks the delivery's idle query, which is what an extension does with
	// it when it settles the state it reports at arm.
	const commands: CommandImplementations = {
		"round-probe": {
			run: (_directive, delivery: CommandDelivery) => {
				answers.push(delivery.canAcceptInput());
			},
		},
	};

	const factory = frameworkOmp.ompAdapter(PROBE, {
		factory: () => ({ subscriptions: [{ scope: "owner", events }], commands }),
	});
	if (!factory(api).bound) throw new Error("the round probe definition did not bind");

	const deliverRound = (event: OmpAgentStartEvent | OmpAgentEndEvent, facts: SessionFacts): void => {
		for (const handler of roundHandlers[event.type]) handler(event, contextOf(facts));
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
		// The error path and the abort path reach the adapter as the same native settle an ordinary
		// answer reaches it through, which is exactly why neither needs a shape of its own here.
		fail: facts => deliverRound({ type: "agent_end" }, facts),
		abort: facts => deliverRound({ type: "agent_end" }, facts),
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
		expect(surface.observed).toEqual([{ kind: "round_start" }, { kind: "round_end" }]);

		// Already idle: there is no open round left to close, so no second edge is produced.
		surface.settle(QUIESCENT);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, { kind: "round_end" }]);
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
		expect(surface.observed).toEqual([{ kind: "round_start" }, { kind: "round_end" }]);
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
		expect(surface.observed).toEqual([{ kind: "round_start" }, { kind: "round_end" }]);
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
		expect(surface.observed).toEqual([{ kind: "round_start" }, { kind: "round_end" }]);
	});

	test("a running asynchronous job keeps the round open until it drains", () => {
		const surface = boundSurface();
		surface.start(QUIESCENT);

		surface.settle({ ...QUIESCENT, runningJobs: 1 });
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }]);

		surface.settle(QUIESCENT);
		surface.nextTask();
		expect(surface.observed).toEqual([{ kind: "round_start" }, { kind: "round_end" }]);
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
		expect(surface.observed).toEqual([{ kind: "round_start" }, { kind: "round_start" }, { kind: "round_end" }]);
		expect(surface.owners).toEqual(["main:session-parent", "main:session-child", "main:session-child"]);

		// The parent's own settle, confirmed on the host's next task, is what ends the parent's Round.
		surface.settle(parent);
		surface.nextTask();
		expect(surface.observed).toEqual([
			{ kind: "round_start" },
			{ kind: "round_start" },
			{ kind: "round_end" },
			{ kind: "round_end" },
		]);
		expect(surface.owners).toEqual([
			"main:session-parent",
			"main:session-child",
			"main:session-child",
			"main:session-parent",
		]);
	});
});

describe("an abrupt terminal state closes the round too (F6, P8)", () => {
	test("a failed run and an interrupted run end the round as an ordinary answer does", () => {
		const surface = boundSurface();

		// The error path and the abort path both reach the adapter as the same native settle an
		// ordinary answer reaches it through, with no continuation scheduled.
		surface.start(QUIESCENT);
		surface.fail(QUIESCENT);
		surface.nextTask();
		surface.start(QUIESCENT);
		surface.abort(QUIESCENT);
		surface.nextTask();

		expect(surface.observed).toEqual([
			{ kind: "round_start" },
			{ kind: "round_end" },
			{ kind: "round_start" },
			{ kind: "round_end" },
		]);
	});

	test("an abrupt end still carries no outcome: the round edge is the edge alone", () => {
		const surface = boundSurface();
		surface.start(QUIESCENT);

		surface.fail(QUIESCENT);
		surface.nextTask();

		// How the round ended is the harness's vocabulary, not the framework's: a subscriber that
		// needs the agent's state asks the idle query rather than reading it off this edge.
		expect(surface.observed).toEqual([{ kind: "round_start" }, { kind: "round_end" }]);
		expect(Object.keys(surface.observed[1] ?? {})).toEqual(["kind"]);
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
