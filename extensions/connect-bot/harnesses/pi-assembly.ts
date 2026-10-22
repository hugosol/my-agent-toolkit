import { setInterval, clearInterval } from "node:timers";
import { piAdapter, type PiExtensionApi, type PiExtensionContext } from "../../../adapters/pi";
import { defineImplementation, type StartupDelivery } from "../../../framework/interface";
import type { DirectedCommandImplementation } from "../../../framework/interface/command";
import { CONNECT_BOT } from "../definition";
import { createConnectBotCommand } from "../shared-logic/command/command";
import type { ManagedTimers } from "../shared-logic/managed-timer";
import { PanelRegistrations } from "../shared-logic/panel/registration";
import type { SessionFacts } from "../shared-logic/session/session";
import { applyRoundEdge } from "../shared-logic/session/state-machine";
import { EXTENSION_REPOSITORY_ROOT } from "./startup-modes";

/** Pi's native context also publishes the working directory and model display name. */
type ConnectBotPiContext = PiExtensionContext & {
	readonly cwd: string;
	readonly model?: { readonly name?: string };
};

function sessionFactsOf(ctx: ConnectBotPiContext): SessionFacts {
	return {
		sessionId: ctx.sessionManager.getSessionId(),
		cwd: ctx.cwd,
		model: ctx.model?.name,
		sessionName: ctx.sessionManager.getSessionName(),
	};
}

/** Remember native facts only while the framework is delivering the corresponding call. */
function observeSessionContext(pi: PiExtensionApi) {
	let current: ConnectBotPiContext | undefined;
	const api = Object.create(pi) as PiExtensionApi;
	function deliver<T>(ctx: PiExtensionContext, run: () => T): T {
		const previous = current;
		current = ctx as ConnectBotPiContext;
		try {
			return run();
		} finally {
			current = previous;
		}
	}
	api.registerCommand = (name, options) => pi.registerCommand(name, {
		...options,
		handler: (args, ctx) => deliver(ctx, () => options.handler(args, ctx)),
	});
	type Subscribe = (event: string, handler: (event: unknown, ctx: PiExtensionContext) => unknown) => () => void;
	const subscribe = pi.on.bind(pi) as Subscribe;
	api.on = ((event: string, handler: (event: unknown, ctx: PiExtensionContext) => unknown) =>
		subscribe(event, (nativeEvent, ctx) => deliver(ctx, () => handler(nativeEvent, ctx)))) as PiExtensionApi["on"];
	return {
		api,
		current: () => {
			if (current === undefined) throw new Error("connect-bot: the session context is read outside a delivery");
			return current;
		},
	};
}

/** Both discovery modes share this assembly; only their startup policy differs. */
export function connectBotPi(startupPolicy: string): (pi: PiExtensionApi) => void {
	return pi => {
		const observed = observeSessionContext(pi);
		// Pi has no context-owned timer API. This binding owns unref'd Node timers, with
		// ordinary owner-end/off cancellation supplied by the shared registration lifecycle.
		const timers = new Set<NodeJS.Timeout>();
		const managedTimers: ManagedTimers = {
			every: (intervalMs, callback) => {
				const timer = setInterval(callback, intervalMs);
				timer.unref();
				timers.add(timer);
				return () => {
					clearInterval(timer);
					timers.delete(timer);
				};
			},
		};
		const implementation = defineImplementation<{
			readonly registrations: PanelRegistrations;
			readonly command: DirectedCommandImplementation;
			readonly enable: (delivery: StartupDelivery) => void;
		}>({
			create: () => {
				const registrations = new PanelRegistrations();
				const command = createConnectBotCommand({
					sessionFacts: () => sessionFactsOf(observed.current()),
					managedTimers: () => managedTimers,
				}, registrations);
				return {
					registrations,
					command: command.command,
					enable: delivery => {
						const ctx = observed.current();
						command.enable(delivery, {
							sessionFacts: sessionFactsOf(ctx),
							managedTimers,
							canAcceptInput: () => ctx.isIdle() && !ctx.hasPendingMessages(),
						});
					},
				};
			},
			subscriptions: [{
				scope: "owner",
				events: {
					session_end: (state, delivery) => state.registrations.ownerEnded(delivery),
					round_start: (_state, delivery) => applyRoundEdge(delivery.owner, "round_start"),
					round_end: (_state, delivery) => applyRoundEdge(delivery.owner, "round_end"),
				},
			}],
			commands: {
				"connect-bot": {
					run: (state, directive, delivery) => state.command.run(directive, delivery),
					unrecognized: (state, argument, delivery) => state.command.unrecognized?.(argument, delivery),
				},
			},
			startup: (state, delivery) => state.enable(delivery),
			cleanup: () => {
				for (const timer of timers) clearInterval(timer);
				timers.clear();
			},
		});
		// connect-bot observes and controls only its owner; it declares no child integration.
		piAdapter(CONNECT_BOT, {
			configBaseDir: EXTENSION_REPOSITORY_ROOT,
			startupPolicy,
			implementation,
		})(observed.api);
	};
}
