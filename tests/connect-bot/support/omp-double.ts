/**
 * The OMP double for the connect-bot extension suite.
 *
 * The extension's seam is the OMP harness it is assembled onto: the extension's own
 * assembly binds the definition through `ompAdapter` against the narrow native surface a
 * loader hands a factory, and the command it registers runs with a native context. This
 * double stands in for the loader — it records every registration and every effect, and
 * it builds the native contexts a test drives the command with, including the session
 * facts OMP reports on its context beyond the members the framework's port names.
 *
 * It is deliberately shaped like the framework suite's own loader double, so a test here
 * observes the same native surface the framework's adapter does.
 *
 * It stands in for the harness's lifecycle events too: {@link OmpDouble.startSession},
 * {@link OmpDouble.switchSession}, {@link OmpDouble.branchSession}, {@link OmpDouble.navigateTree}
 * and {@link OmpDouble.shutdown} hand a native session event and a session's context to the
 * subscriptions the binding made, exactly as {@link OmpDouble.startRun} and
 * {@link OmpDouble.settleRun} do for the run edges. A test therefore observes the semantic event
 * the adapter synthesizes — including the transition that produces none at all — rather than a
 * boundary it announced itself.
 */
import type {
	OmpAgentRef,
	OmpCommandContext,
	OmpExtensionApi,
	OmpRoundEventType,
	OmpSessionContext,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../../adapters/omp";
import type { ControlledClock } from "./controlled-clock";

/** One session lifecycle handler as the loader registers it. */
type SessionHandler = (event: OmpSessionEvent, ctx: OmpSessionContext) => void;

/** One registered command, as the loader received it from the framework's port. */
interface Registration {
	readonly description?: string;
	readonly handler: (args: string, ctx: OmpCommandContext) => void | Promise<void>;
}

/** One widget write of the framework's marker area, as the session's UI channel received it. */
export interface WidgetWrite {
	readonly key: string;
	readonly lines: string[] | undefined;
	readonly placement?: "aboveEditor" | "belowEditor";
}

/**
 * One managed timer the extension scheduled through a session's context.
 *
 * How it runs is the double's timer mode (see {@link TimerMode}): by default the double schedules
 * nothing and a test fires {@link ManagedTimer.callback} itself, while a cadence run has the mode
 * schedule the interval for real — on the harness's own clock or on a {@link ControlledClock} — so
 * the period the extension asked for is what makes a beat appear, not the test's own call.
 */
export interface ManagedTimer {
	/** The callback the extension handed the harness. */
	readonly callback: () => void;
	/** The period the extension asked for, in milliseconds. */
	readonly ms: number | undefined;
	/** Whether the extension cancelled exactly this timer through the context's `clearTimer`. */
	cancelled: boolean;
}

/**
 * How the doubled session context runs the intervals the extension schedules on it.
 *
 * - `manual` (the default): nothing is scheduled. A test drives the periodic effect itself by
 *   firing the recorded callback, which observes one beat's content without any cadence at all.
 * - `real`: the harness's own global interval, so a beat really fires once per period and a run
 *   can record the wall-clock cadence the extension asked the harness for.
 * - `controlled`: a {@link ControlledClock} the caller advances by exact virtual milliseconds, so
 *   a beat appears at its period's virtual instant without a wall wait and a cancelled interval
 *   fires nothing.
 */
export type TimerMode =
	| { readonly kind: "manual" }
	| { readonly kind: "real" }
	| { readonly kind: "controlled"; readonly clock: ControlledClock };

/** What one double was built with; the timer mode is the only choice so far. */
export interface OmpDoubleOptions {
	readonly timers?: TimerMode;
}

/** The facts one doubled session context reports; everything else is fixed by the double. */
export interface ContextOptions {
	readonly sessionId: string;
	/** The session's working directory, as OMP reports it on the extension context. */
	readonly cwd: string;
	/** The model's display name, as OMP reports it on the extension context. */
	readonly model?: string;
	/** The session's name, as OMP reports it on its (read-only) session manager. */
	readonly sessionName?: string;
	readonly hasUI?: boolean;
	readonly kind?: "main" | "sub";
	/**
	 * The registry id of the agent that spawned this session, as OMP reports it on the context.
	 * It is what the adapter walks to resolve a subagent's owner, so a test that delivers an
	 * edge from a subagent records the parent chain in {@link OmpDouble.agents} as well.
	 */
	readonly parentId?: string;
	/** Whether the harness reports this session as idle (the fact behind `canAcceptInput`). */
	readonly idle?: boolean;
}

/** The native surface one test binds against, plus everything it observed. */
export interface OmpDouble {
	readonly api: OmpExtensionApi;
	/** Labels the framework set, in call order. */
	readonly labels: string[];
	/** Registered command names, in registration order, as of the call. */
	commandNames(): string[];
	/** Session entries the extension appended (State persistence). */
	readonly appended: Array<{ readonly customType: string; readonly data: unknown }>;
	/** UI notifications, in call order. */
	readonly notifications: string[];
	/**
	 * The severity each notification carried, in the same order as {@link notifications}: the level
	 * the framework's feedback channel mapped onto the UI call (`"info"` when the call carried none).
	 */
	readonly notificationLevels: string[];
	/** Marker-area widget writes, in call order. */
	readonly widgets: WidgetWrite[];
	/** Every managed timer the extension scheduled through the session's context. */
	readonly timers: ManagedTimer[];
	/**
	 * The harness's process-wide agent registry, as the adapter walks it to resolve which session
	 * owns a delivery: a test records the parent chain of a subagent here, so an edge delivered
	 * from that session resolves the owner it follows rather than nothing at all.
	 */
	readonly agents: Map<string, OmpAgentRef>;
	/** A session context as OMP builds it, carrying the facts the adapter and the extension read. */
	context(options: ContextOptions): OmpCommandContext;
	/** Runs one registered command with the given argument text and context. */
	run(name: string, args: string, ctx: OmpCommandContext): void;
	/**
	 * Delivers the native session-start event, as the harness does when it loads a session: the
	 * session this binding first serves in this process.
	 */
	startSession(ctx: OmpCommandContext): void;
	/**
	 * Delivers the native session-switch event: the harness moved to another session identity, and
	 * the reason it names is the switch's own (`new`/`resume`/`fork`).
	 */
	switchSession(ctx: OmpCommandContext, reason: "new" | "resume" | "fork"): void;
	/** Delivers the native session-branch event: a session stood up from another one's entries. */
	branchSession(ctx: OmpCommandContext, reason: "branch" | "fork" | "btw"): void;
	/**
	 * Delivers the native session-tree event: a jump inside the current session's tree, which is the
	 * same identity with a different leaf. Whether that is a transition is the adapter's judgment,
	 * not this double's — it hands over the native event and the context.
	 */
	navigateTree(ctx: OmpCommandContext): void;
	/** Delivers the native session-shutdown event: the process this session lives in is going away. */
	shutdown(ctx: OmpCommandContext): void;
	/**
	 * Delivers the native run-start event, as the harness does when an agent loop takes up a
	 * prompt. The framework synthesizes `round_start` from it, so this is how a test opens a round.
	 */
	startRun(ctx: OmpCommandContext): void;
	/**
	 * Delivers the native run-end event, as the harness does when a run settles, and reaches the
	 * host's next task.
	 *
	 * Whether that settle closes the round is the framework's synthesis, not this double's, and it
	 * is not decided inside the native callback: a settle that scheduled nothing is an end candidate
	 * the framework confirms on the host's next task. Awaiting this is therefore what a test does to
	 * observe the edge a settle produced — the double hands over the native event and the context,
	 * then arrives at the task the framework arranged.
	 */
	settleRun(ctx: OmpCommandContext, options?: { readonly willContinue?: boolean }): Promise<void>;
	/**
	 * Resolves with the message of the next UI notification, so a test can await the effect
	 * it is about to observe instead of guessing how long an unawaited handler takes. Ask
	 * before running the command: the waiter is served in registration order.
	 */
	nextNotification(): Promise<string>;
}

export function ompDouble(options: OmpDoubleOptions = {}): OmpDouble {
	const timerMode = options.timers ?? { kind: "manual" };
	const labels: string[] = [];
	const registrations = new Map<string, Registration>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	const notifications: string[] = [];
	const notificationLevels: string[] = [];
	const widgets: WidgetWrite[] = [];
	const timers: ManagedTimer[] = [];
	/**
	 * How to stop each scheduled timer, for the modes that really schedule one: `clearTimer` marks
	 * the record cancelled and then cancels whatever the mode started, so a cancelled beat fires
	 * nothing in any mode. The map is keyed by the record a test already observes, which is why the
	 * records keep exactly the shape {@link ManagedTimer} declares.
	 */
	const timerStops = new Map<ManagedTimer, () => void>();
	const waiting: Array<(message: string) => void> = [];
	const agents = new Map<string, OmpAgentRef>();
	// The native lifecycle subscriptions this binding made. The double registers nothing
	// itself: a test hands the native event and a context to the delivery methods below, exactly
	// as the harness would, and the framework's synthesis decides whether a semantic event (or no
	// event at all) follows.
	const roundHandlers: Record<string, Array<(event: unknown, ctx: OmpSessionContext) => void>> = {
		agent_start: [],
		agent_end: [],
	};
	// A closed vocabulary like the round one: one handler list per native session event the loader
	// can deliver, so a test drives the whole session axis through the same surface the adapter
	// subscribed it on.
	const sessionHandlers: Record<string, SessionHandler[]> = {
		session_start: [],
		session_switch: [],
		session_branch: [],
		session_tree: [],
		session_shutdown: [],
	};
	/** The native message facts the axes subscribe to, recorded so this surface stays the whole of one. */
	const messageHandlers: Array<(event: unknown, ctx: OmpSessionContext) => void> = [];

	const api: OmpExtensionApi = {
	registerTool() {},
	setLabel(label: string): void {
			labels.push(label);
		},
		registerCommand(name, registration): void {
			registrations.set(name, registration);
		},
		appendEntry(customType: string, data?: unknown): void {
			appended.push({ customType, data });
		},
		// Binding subscribes the session axis, the run-initiation hook for the declared marker and the
		// round axis for the semantic events; this suite's commands are driven directly, so what the
		// subscriptions have to do is exist — and the lifecycle ones are recorded for the tests that
		// deliver them.
		on(event: string, handler: never): void {
			if (event === "agent_start" || event === "agent_end") {
				roundHandlers[event].push(handler as (event: unknown, ctx: OmpSessionContext) => void);
				return;
			}
			if (event === "before_agent_start") return;
			// The round axis reads how an activity ended from the finalized message, exactly as the Turn
			// axis does: a native fact this surface holds for the tests that drive one, and one no
			// command of this extension's depends on.
			if (event === "message_end") {
				messageHandlers.push(handler as (event: unknown, ctx: OmpSessionContext) => void);
				return;
			}
			sessionHandlers[event].push(handler as SessionHandler);
		},
		// The official agent graph the adapter walks for a session that is not its own owner: a
		// test fills it in, and without it no subagent's owner resolves.
		pi: {
			AgentRegistry: {
				global: () => ({ get: (id: string) => agents.get(id) }),
			},
		},
}

	return {
		api,
		labels,
		commandNames: () => [...registrations.keys()],
		appended,
		notifications,
		notificationLevels,
		widgets,
		timers,
		agents,
		context(options) {
			const kind = options.kind ?? "main";
			return {
				hasUI: options.hasUI ?? true,
				ui: {
					notify: (message: string, level?: "info" | "warning" | "error") => {
						notifications.push(message);
						notificationLevels.push(level ?? "info");
						waiting.shift()?.(message);
					},
					setWidget: (
						key: string,
						lines: readonly string[] | undefined,
						widgetOptions?: { readonly placement?: "aboveEditor" | "belowEditor" },
					) => {
						widgets.push({
							key,
							lines: lines === undefined ? undefined : [...lines],
							placement: widgetOptions?.placement,
						});
					},
				},
				// The registry label is identical for every main session: the framework's owner
				// key must come from the session identity, never from this label.
				agent: {
					kind,
					id: kind === "main" ? "Main" : "0-Explore",
					parentId: options.parentId,
				},
				sessionManager: {
					getSessionId: () => options.sessionId,
					getBranch: () => [],
					getSessionName: () => options.sessionName,
				},
				isIdle: () => options.idle ?? true,
				hasPendingMessages: () => false,
				getAsyncJobSnapshot: () => ({ running: [] }),
				// The native session facts OMP reports on this context and the managed timer
				// surface an effect would use; neither is a member of the framework's port.
				cwd: options.cwd,
				model: options.model === undefined ? undefined : { name: options.model },
				setInterval: (callback: () => void, ms?: number) => {
					const timer: ManagedTimer = { callback, ms, cancelled: false };
					timers.push(timer);
					// The handle the harness hands back is what cancels this timer and no other. What
					// the handle does besides that is the mode: a manual run's recorded callback is
					// fired by the test, a real run's fires on the harness's own clock, and a
					// controlled run's fires when the caller advances its virtual clock to the period.
					const period = ms ?? 0;
					if (timerMode.kind === "real") {
						const handle = setInterval(callback, period);
						timerStops.set(timer, () => clearInterval(handle));
					} else if (timerMode.kind === "controlled") {
						const interval = timerMode.clock.every(period, callback);
						timerStops.set(timer, () => interval.cancel());
					}
					return timer;
				},
				clearTimer: (timer: unknown) => {
					if (timer === null || typeof timer !== "object" || !("cancelled" in timer)) return;
					const record = timer as ManagedTimer;
					if (record.cancelled) return;
					record.cancelled = true;
					timerStops.get(record)?.();
					timerStops.delete(record);
				},
			} as unknown as OmpCommandContext;
		},
		run(name, args, ctx) {
			const registration = registrations.get(name);
			if (registration === undefined) throw new Error(`command "${name}" was not registered`);
			registration.handler(args, ctx);
		},
		startRun(ctx) {
			for (const handler of roundHandlers.agent_start) handler({ type: "agent_start" }, ctx as unknown as OmpSessionContext);
		},
		startSession(ctx) {
			for (const handler of sessionHandlers.session_start) {
				handler({ type: "session_start" }, ctx as unknown as OmpSessionContext);
			}
		},
		switchSession(ctx, reason) {
			for (const handler of sessionHandlers.session_switch) {
				handler({ type: "session_switch", reason }, ctx as unknown as OmpSessionContext);
			}
		},
		branchSession(ctx, reason) {
			for (const handler of sessionHandlers.session_branch) {
				handler({ type: "session_branch", reason }, ctx as unknown as OmpSessionContext);
			}
		},
		navigateTree(ctx) {
			for (const handler of sessionHandlers.session_tree) {
				handler({ type: "session_tree" }, ctx as unknown as OmpSessionContext);
			}
		},
		shutdown(ctx) {
			for (const handler of sessionHandlers.session_shutdown) {
				handler({ type: "session_shutdown" }, ctx as unknown as OmpSessionContext);
			}
		},
		async settleRun(ctx, options) {
			for (const handler of roundHandlers.agent_end) {
				handler({ type: "agent_end", willContinue: options?.willContinue }, ctx as unknown as OmpSessionContext);
			}
			// The host's next task: the moment the framework's own re-check of an end candidate runs.
			// A macrotask is the real thing here — the re-check is arranged on the harness's own task
			// queue — so this is the one place the suite waits on the platform's clock.
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 0);
			await promise;
		},
		nextNotification() {
			const { promise, resolve } = Promise.withResolvers<string>();
			waiting.push(resolve);
			return promise;
		},
	};
}
