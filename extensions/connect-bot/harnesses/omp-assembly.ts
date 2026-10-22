/**
 * connect-bot's OMP assembly, shared by both startup modes.
 *
 * This is the extension's only module that touches the OMP-native surface. Each mode's assembly
 * (`./omp` and `./omp-auto`) builds this one factory against the startup policy its entrypoint
 * selected, so the native mapping, the definition, the shared business logic and every framework
 * behavior are maintained once and the modes differ only in the document they name.
 *
 * The native access the extension is allowed lives here and nowhere else — the session facts the
 * panel protocol needs (the real session id, the working directory, the model's display name and
 * the session's name, read from OMP's own extension context) and the managed timer the heartbeat
 * is scheduled on (`ctx.setInterval`, cancelled with `ctx.clearTimer`).
 *
 * The facts are why this assembly observes a registration and a session start: the framework's
 * port hands an injected command implementation harness-neutral facts only, and the owner key it
 * resolves is an opaque derivation the framework never interprets, so the real session identity
 * can only be read where OMP itself provides it. OMP provides the context to a command handler
 * and to every native session event, so this assembly hands the framework's adapter a surface
 * whose command registration and start subscriptions observe that context and then pass the call
 * through unchanged. Shared logic receives plain data and one injectable capability, and names no
 * native type.
 *
 * The same is true of the configuration the extension declares: the framework reads and validates
 * `extensions/connect-bot/config.yaml` at binding, and only this assembly can say which repository
 * that relative path belongs to — its own module location does, so the root it derives is supplied
 * to the adapter as a plain directory string.
 */
import { type OmpExtensionApi, ompAdapter } from "../../../adapters/omp";
import { type DirectedCommandImplementation } from "../../../framework/interface/command";
import { type StartupDelivery, defineImplementation } from "../../../framework/interface";
import { createConnectBotCommand } from "../shared-logic/command/command";
import { CONNECT_BOT } from "../definition";
import type { ManagedTimers } from "../shared-logic/managed-timer";
import { PanelRegistrations } from "../shared-logic/panel/registration";
import type { SessionFacts } from "../shared-logic/session/session";
import { applyRoundEdge } from "../shared-logic/session/state-machine";
import { EXTENSION_REPOSITORY_ROOT } from "./startup-modes";

/**
 * OMP's own extension context, widened to the members this assembly reads.
 *
 * The framework's port names only the members its own mapping uses; the session facts a wire
 * protocol needs are read here, where reaching the native surface is allowed.
 */
interface ConnectBotSessionContext {
	readonly sessionManager: {
		getSessionId(): string;
		getSessionName?(): string | undefined;
	};
	/** The session's working directory. */
	readonly cwd: string;
	/** The session's current model, or `undefined` when none is set. */
	readonly model?: { readonly name?: string };
	/**
	 * Whether the agent is idle — not working on a run — as the harness's own context reports it.
	 *
	 * Optional: a surface that reports no idle fact answers nothing rather than a state it never
	 * stated, and the panel state derived from it is the same fact a command invocation asks for.
	 */
	isIdle?(): boolean;
	/**
	 * The harness's managed interval: a timer the harness owns, unref'd and cleared with the
	 * session, returning the handle {@link ConnectBotSessionContext.clearTimer} takes back.
	 */
	setInterval(callback: () => void, ms: number): unknown;
	/** Cancels exactly the timer `setInterval` returned, and no other. */
	clearTimer(timer: unknown): void;
}

/**
 * The managed-timer capability of one invocation, as this extension's heartbeat uses it: the
 * harness's own interval, cancelled with the harness's own handle and with nothing else.
 *
 * Handing shared logic this surface instead of the context is what keeps the heartbeat a
 * harness-neutral effect: the cadence and the beat belong to `./heartbeat`, and the only timer the
 * extension can ever touch is the one this function handed out.
 */
function managedTimersOf(ctx: ConnectBotSessionContext): ManagedTimers {
	return {
		every: (intervalMs, callback) => {
			const timer = ctx.setInterval(callback, intervalMs);
			return () => ctx.clearTimer(timer);
		},
	};
}

/** The facts one invocation's context reports, as the plain data shared logic consumes. */
function sessionFactsOf(ctx: ConnectBotSessionContext): SessionFacts {
	return {
		sessionId: ctx.sessionManager.getSessionId(),
		cwd: ctx.cwd,
		model: ctx.model?.name,
		sessionName: ctx.sessionManager.getSessionName?.(),
	};
}

/** The native subscription signature this assembly observes, when the loader offers one. */
type SubscribeSession = (
	event: string,
	handler: (event: unknown, ctx: ConnectBotSessionContext) => void,
) => void;

/**
 * The loader's api with its command registration and start subscriptions observed.
 *
 * The observed surface delegates every other member to the loader's own api — OMP binds each of
 * its methods to the harness instance, so nothing is lost by reaching them through it — and it
 * overrides only `registerCommand` and, when the surface offers one, `on`. The native context
 * appears in both places: a command handler receives it, and every native session event receives
 * the context of the session it concerns. The context is remembered for the duration of the call
 * the framework makes (and restored afterwards, so nothing about it outlives the delivery) and
 * the call itself is passed through untouched. A surface that offers no `on` is left as it
 * stated itself: the framework's registration path is where that harness fact becomes the
 * operator's diagnostic, and this assembly adds no earlier throw.
 */
function observeSessionContext(pi: OmpExtensionApi): {
	readonly api: OmpExtensionApi;
	readonly current: () => ConnectBotSessionContext;
} {
	let current: ConnectBotSessionContext | undefined;
	const api = Object.create(pi) as OmpExtensionApi;
	api.registerCommand = (name, options) =>
		pi.registerCommand(name, {
			...options,
			handler: (args, ctx) => {
				const previous = current;
				current = ctx as unknown as ConnectBotSessionContext;
				try {
					return options.handler(args, ctx);
				} finally {
					current = previous;
				}
			},
		});
	const subscribe = typeof pi.on === "function" ? (pi.on as unknown as SubscribeSession).bind(pi) : undefined;
	if (subscribe !== undefined) {
		api.on = ((event: string, handler: (event: unknown, ctx: ConnectBotSessionContext) => void) => {
			// Every native delivery this binding observes carries the context of the session it concerns.
			// Keeping it for the duration of the framework's own handler is what lets a startup activation
			// read the facts of the start being delivered without naming a native lifecycle event here.
			subscribe(event, (nativeEvent, ctx) => {
				const previous = current;
				current = ctx;
				try {
					handler(nativeEvent, ctx);
				} finally {
					current = previous;
				}
			});
		}) as unknown as OmpExtensionApi["on"];
	}
	// A surface that offers no lifecycle subscription at all is a fact the framework reports as its
	// own registration failure. Leaving the member as the surface stated it lets that report happen
	// at the framework's failure boundary; throwing here would escape before the label and the
	// diagnostic the operator is owed.
	return {
		api,
		current: () => {
			// The only readers are the command implementation this binding registers and the
			// startup activation it declares, and both run only from the handlers above: a read
			// with no delivery in flight is a state the code cannot reach, and the guard is what
			// makes that reachable for the compiler as well.
			if (current === undefined) {
				throw new Error("connect-bot: the session context is read outside a delivery");
			}
			return current;
		},
	};
}

/**
 * Assembles connect-bot for OMP in one startup mode.
 *
 * The native surface this extension is allowed reaches shared logic as pure data and one
 * injectable capability: the session facts are read as plain fields, and the managed timer is
 * handed over as the interval capability the heartbeat schedules on. Neither a native type nor a
 * native call leaves the readers above.
 *
 * The round axis reaches shared logic as the framework's semantic edges: this assembly subscribes
 * `round_start`/`round_end` and hands each delivery's owner to the state machine (`../state-machine`),
 * so what moves the panel's state is the semantic kind alone. Which native events synthesize those
 * edges — and when a settle is quiescence — stays the adapter's business, and no native event name
 * appears here.
 *
 * The session axis reaches it the same way: `session_end` is subscribed for the connection this
 * extension drives for the session being left (`../session-end`), and nothing is subscribed for
 * `session_start`, because an automatic startup is the framework's startup activation entry, not a
 * second subscription path. The native events that boundary is synthesized from — and the fact
 * that a navigation keeping the session's identity produces no boundary at all — are the adapter's
 * business, and this assembly names none of them: there is no native shutdown hook of the
 * extension's own anywhere in its code.
 *
 * The supported harness version is not this assembly's to declare: version support belongs to
 * the framework's own Supported harness baseline, and this assembly describes only the
 * capabilities its extension needs. A binding the harness refuses has already reported why
 * on the non-model channel, and this session then simply runs without the extension.
 */
export function connectBotOmp(startupPolicy: string): (pi: OmpExtensionApi) => void {
	const bindConnectBot = (pi: OmpExtensionApi): void => {
		const observed = observeSessionContext(pi);
		const implementation = defineImplementation<{
			readonly registrations: PanelRegistrations;
			readonly command: DirectedCommandImplementation;
			readonly enable: (delivery: StartupDelivery) => void;
		}>({
			// The extension's own half: the business state is the panel registration lifecycle and the
			// command implementation built around it. One registration lifecycle per binding, so the
			// command path, the startup path and the session-end path see the same attempts — a
			// boundary cannot stop effects an in-flight register is about to create. Building either
			// has no effect of its own, so a refused binding leaves no resource of the extension's behind.
			create: () => {
				const registrations = new PanelRegistrations();
				const command = createConnectBotCommand(
					{
						sessionFacts: () => sessionFactsOf(observed.current()),
						managedTimers: () => managedTimersOf(observed.current()),
					},
					registrations,
				);
				return {
					registrations,
					command: command.command,
					// The startup delivery runs inside the native session-start handler, so the context
					// is captured here as values and as one bound idle query; the register receipt may
					// land long after that delivery ended, and it must not reach for a newer context.
					enable: delivery => {
						const ctx = observed.current();
						command.enable(delivery, {
							sessionFacts: sessionFactsOf(ctx),
							managedTimers: managedTimersOf(ctx),
							canAcceptInput: () => ctx.isIdle?.(),
						});
					},
				};
			},
			subscriptions: [
				{
					scope: "owner",
					events: {
						// The session leaving: the one boundary this extension acts on. A start needs no handler —
						// the session taking over starts unarmed, which is what "not armed" already means.
						session_end: (state, delivery) => state.registrations.ownerEnded(delivery),
						round_start: (_state, delivery) => applyRoundEdge(delivery.owner, "round_start"),
						round_end: (_state, delivery) => applyRoundEdge(delivery.owner, "round_end"),
					},
				},
			],
			commands: {
				"connect-bot": {
					run: (state, directive, delivery) => state.command.run(directive, delivery),
					unrecognized: (state, argument, delivery) => state.command.unrecognized?.(argument, delivery),
				},
			},
			// The one startup entry: the framework calls it at the process's first owner session
			// start, when this mode's policy states an enabling effective choice. It hands the
			// intent to the same activation the command runs.
			startup: (state, delivery) => state.enable(delivery),
		});
		ompAdapter(CONNECT_BOT, {
			// Where the framework resolves the definition's relative configuration path: the
			// repository this assembly's own module lives in, so the extension's declared
			// `extensions/connect-bot/config.yaml` is read wherever the process was started.
			configBaseDir: EXTENSION_REPOSITORY_ROOT,
			// The policy document this mode's entrypoint selected. The framework reads only this
			// extension's block and applies its choice at the process's first owner session start.
			startupPolicy,
			implementation,
		})(observed.api);
	};

	return bindConnectBot;
}
