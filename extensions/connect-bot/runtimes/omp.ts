/**
 * connect-bot's OMP runtime assembly.
 *
 * This is the extension's only module that touches the OMP-native surface, and the thin
 * entrypoint at `entrypoints/omp/connect-bot.ts` re-exports nothing but this file's default
 * factory. The native access the extension is allowed lives here and nowhere else — the session
 * facts the panel protocol needs (the real session id, the working directory, the model's
 * display name and the session's name, read from OMP's own extension context) and the managed
 * timer the heartbeat is scheduled on (`ctx.setInterval`, cancelled with `ctx.clearTimer`).
 *
 * The facts are why this assembly observes a registration: the framework's port hands an
 * injected command implementation runtime-neutral facts only, and the owner key it resolves is
 * an opaque derivation the framework never interprets, so the real session identity can only be
 * read where OMP itself provides it. OMP provides the context to a command handler, so this
 * assembly hands the framework's adapter a surface whose command registration observes that
 * context and then passes the call through unchanged. Shared logic receives plain data and one
 * injectable capability, and names no native type.
 *
 * The same is true of the configuration the extension declares: the framework reads and validates
 * `extensions/connect-bot/config.yaml` at binding, and only this assembly can say which repository
 * that relative path belongs to — its own module location does, so the root it derives is supplied
 * to the adapter as a plain directory string.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type OmpExtensionApi, ompAdapter } from "../../../framework/adapters/omp";
import {
	type PushFetchInit,
	type PushHttpResponse,
	type PushTransport,
	installPushTransport,
} from "../client";
import { createConnectBotCommand } from "../command";
import { CONNECT_BOT } from "../definition";
import type { ManagedTimers } from "../managed-timer";
import { endSession } from "../session-end";
import type { SessionFacts } from "../session";
import { applyRoundEdge } from "../state-machine";

/**
 * The extension repository this assembly belongs to: `runtimes/omp.ts` -> `runtimes` -> the
 * extension -> `extensions` -> the repository root, from this module's own location.
 *
 * The framework resolves the definition's relative configuration path — the convention
 * `extensions/<definition.id>/config.yaml` — against the directory an assembly supplies, because
 * the loader discovers an extension by an absolute path while the process runs in an arbitrary
 * project directory. This module is the only place that knows the repository from its own
 * location: `entrypoints/omp/connect-bot.ts` is a thin re-export, and the extension's shared
 * source is runtime-neutral and holds no path of its own.
 */
export const EXTENSION_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * The outbound transport the platform provides: bun's `fetch`, narrowed to the request surface
 * this extension uses (the toolkit's tsconfig carries no DOM fetch types). `proxy: false` is
 * part of the request the wire client builds, not of this call.
 */
const platformTransport: PushTransport = (url, init) =>
	(globalThis.fetch as unknown as (input: string, request: PushFetchInit) => Promise<PushHttpResponse>)(url, init);

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
	 * The runtime's managed interval: a timer the runtime owns, unref'd and cleared with the
	 * session, returning the handle {@link ConnectBotSessionContext.clearTimer} takes back.
	 */
	setInterval(callback: () => void, ms: number): unknown;
	/** Cancels exactly the timer `setInterval` returned, and no other. */
	clearTimer(timer: unknown): void;
}

/**
 * The managed-timer capability of one invocation, as this extension's heartbeat uses it: the
 * runtime's own interval, cancelled with the runtime's own handle and with nothing else.
 *
 * Handing shared logic this surface instead of the context is what keeps the heartbeat a
 * runtime-neutral effect: the cadence and the beat belong to `./heartbeat`, and the only timer the
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

/**
 * The loader's api with its one command registration observed.
 *
 * The observed surface delegates every other member to the loader's own api — OMP binds each of
 * its methods to the runtime instance, so nothing is lost by reaching them through it — and it
 * overrides only `registerCommand`, where the native context appears: the context is remembered
 * for the duration of the call the framework makes to it (and restored afterwards, so nothing
 * about it outlives the invocation) and the call itself is passed through untouched.
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
	return {
		api,
		current: () => {
			// The only reader is the command implementation this binding registers, and it runs
			// only from the handler above: a read with no invocation in flight is a state the code
			// cannot reach, and the guard is what makes that reachable for the compiler as well.
			if (current === undefined) {
				throw new Error("connect-bot: the session context is read outside a command invocation");
			}
			return current;
		},
	};
}

/**
 * Assembles connect-bot for OMP.
 *
 * The native surface this extension is allowed reaches shared logic as pure data and one
 * injectable capability: the session facts are read as plain fields, and the managed timer is
 * handed over as the interval capability the heartbeat schedules on. Neither a native type nor a
 * native call leaves the two readers below.
 *
 * The round axis reaches shared logic as the framework's semantic edges: this assembly subscribes
 * `round_start`/`round_end` and hands each delivery's owner to the state machine (`../state-machine`),
 * so what moves the panel's state is the semantic kind alone. Which native events synthesize those
 * edges — and when a settle is quiescence — stays the adapter's business, and no native event name
 * appears here.
 *
 * The session axis reaches it the same way: `session_end` is subscribed for the connection this
 * extension drives for the session being left (`../session-end`), and nothing is subscribed for
 * `session_start`, because a session that takes another's place is not this extension's to arm. The
 * native events that boundary is synthesized from — and the fact that a navigation keeping the
 * session's identity produces no boundary at all — are the adapter's business, and this assembly
 * names none of them: there is no native shutdown hook of the extension's own anywhere in its code.
 *
 * The supported runtime version is not this assembly's to declare: version support belongs to
 * the framework's own Supported agent-runtime baseline, and this assembly describes only the
 * capabilities its extension needs. A binding the agent runtime refuses has already reported why
 * on the non-model channel, and this session then simply runs without the extension.
 */
export default function connectBot(pi: OmpExtensionApi): void {
	installPushTransport(platformTransport);
	const observed = observeSessionContext(pi);
	ompAdapter(CONNECT_BOT, {
		// Where the framework resolves the definition's relative configuration path: the
		// repository this assembly's own module lives in, so the extension's declared
		// `extensions/connect-bot/config.yaml` is read wherever the process was started.
		configBaseDir: EXTENSION_REPOSITORY_ROOT,
		// This extension's panel state is driven by the round axis: without those edges the value
		// it reports could never move off what the arm read, so the axis is declared as a
		// dependency and a runtime that cannot deliver it refuses this binding rather than
		// leaving a session that looks connected and reports a frozen state.
		//
		// The session axis is declared for the same reason: a session this extension armed must be
		// wound down when another identity takes its place, and a runtime that delivered no boundary
		// would leave a heartbeat beating for a session that is no longer current — with no way for
		// the extension to learn that it should stop.
		requiredSemantics: ["session-lifecycle-events", "round-lifecycle-events"],
		events: {
			// The session leaving: the one boundary this extension acts on. A start needs no handler —
			// the session taking over starts unarmed, which is what "not armed" already means.
			session_end: endSession,
			round_start: delivery => applyRoundEdge(delivery.owner, "round_start"),
			round_end: delivery => applyRoundEdge(delivery.owner, "round_end"),
		},
		actions: {
			"connect-bot": createConnectBotCommand({
				sessionFacts: () => sessionFactsOf(observed.current()),
				managedTimers: () => managedTimersOf(observed.current()),
			}),
		},
	})(observed.api);
}
