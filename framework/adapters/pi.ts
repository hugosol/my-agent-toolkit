/**
 * pi extension API → framework port. State, controls, prompt planning and marker
 * composition stay in the existing public behaviors; only native facts/effects
 * are mapped here. The observation axes not needed by this consumer are refused
 * explicitly, never accepted as silent subscriptions.
 */
import { bindExtension } from "../behaviors/binding";
import { isImplementationDisposed } from "../behaviors/lifecycle";
import type { ExtensionAssembly, ExtensionImplementation, ImplementationContext } from "../core/assembly";
import { activationField, statePersistence } from "../core/definition";
import type { ExtensionDefinition } from "../core/definition";
import type {
	BindingResult, FeedbackLevel, FeedbackTransport, HarnessPort, MarkerTransport,
	NoticeTransport, OwnerReference, SessionEndReason, SessionEvent, SessionFacts,
	SessionStartReason, SessionStartup,
} from "../core/protocol";
import { StateStore } from "../core/state";

export type { BindingResult } from "../core/protocol";
export type { ExtensionAssembly } from "../core/assembly";

// Structural native types keep the harness a loader-provided runtime dependency.
export interface PiSessionEntry {
	readonly type?: string;
	readonly customType?: string;
	readonly data?: unknown;
	readonly message?: { readonly role?: string };
}
export interface PiSessionManager {
	getSessionId(): string;
	getSessionName(): string | undefined;
	getBranch(): readonly PiSessionEntry[];
}
export interface PiModel {
	readonly id?: string;
	readonly provider?: string;
}
export interface PiWidgetOptions {
	readonly placement?: "aboveEditor" | "belowEditor";
}
export interface PiUiContext {
	notify(message: string, type?: FeedbackLevel): void;
	setWidget(key: string, content: readonly string[] | undefined, options?: PiWidgetOptions): void;
}
export interface PiExtensionContext {
	readonly sessionManager: PiSessionManager;
	readonly model?: PiModel;
	readonly thinkingLevel?: string;
	readonly hasUI: boolean;
	readonly ui: PiUiContext;
	isIdle(): boolean;
}
export type PiSessionStartReason = "startup" | "reload" | "new" | "resume" | "fork";
export interface PiSessionStartEvent {
	readonly type: "session_start";
	readonly reason: PiSessionStartReason;
}
export type PiSessionShutdownReason = "quit" | "reload" | "new" | "resume" | "fork";
export interface PiSessionShutdownEvent {
	readonly type: "session_shutdown";
	readonly reason: PiSessionShutdownReason;
}
export type PiSessionEventHandler<E> = (event: E, ctx: PiExtensionContext) => void;
export interface PiBeforeAgentStartEvent {
	readonly type: "before_agent_start";
	readonly messageType: "user" | "custom";
}
export interface PiInjectedPromptMessage {
	readonly customType: string;
	readonly content: string;
	readonly display: boolean;
}
export interface PiRunInitiationResult {
	readonly message: PiInjectedPromptMessage;
}
export type PiRunInitiationHandler = (
	event: PiBeforeAgentStartEvent,
	ctx: PiExtensionContext,
) => PiRunInitiationResult | undefined | void | Promise<PiRunInitiationResult | undefined | void>;
export interface PiCommandRegistration {
	readonly description?: string;
	readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void>;
}
export interface PiExtensionApi {
	on(event: "session_start", handler: PiSessionEventHandler<PiSessionStartEvent>): () => void;
	on(event: "session_shutdown", handler: PiSessionEventHandler<PiSessionShutdownEvent>): () => void;
	on(event: "before_agent_start", handler: PiRunInitiationHandler): () => void;
	registerCommand(name: string, options: PiCommandRegistration): void;
	appendEntry(customType: string, data?: unknown): void;
}
export type PiExtensionFactory = (pi: PiExtensionApi) => BindingResult;

const START_REASON: Record<PiSessionStartReason, SessionStartReason> = {
	startup: "initial", reload: "initial", new: "new", resume: "resume", fork: "fork",
};
const END_REASON: Record<PiSessionShutdownReason, SessionEndReason> = {
	quit: "disposed", reload: "disposed", new: "transferred", resume: "transferred", fork: "transferred",
};

function ownerOf(ctx: PiExtensionContext): OwnerReference {
	const id = ctx.sessionManager.getSessionId();
	return id.length > 0 ? { kind: "owner", key: `main:${id}` } : { kind: "unresolved" };
}

function sessionFactsOf(ctx: PiExtensionContext, reason?: SessionStartReason): SessionFacts {
	const unavailable = ["agent name", "agent id"];
	const reportedName = ctx.sessionManager.getSessionName();
	const name = reportedName?.trim() ? reportedName : undefined;
	if (name === undefined) unavailable.push("session name");
	const beginsHere = reason !== undefined && reason !== "resume" && reason !== "fork"
		&& !ctx.sessionManager.getBranch().some(entry =>
			entry.type === "message" && (entry.message?.role === "user" || entry.message?.role === "assistant"));
	let startup: SessionStartup | undefined;
	if (beginsHere) {
		const model = ctx.model?.provider && ctx.model.id
			? { provider: ctx.model.provider, model: ctx.model.id } : undefined;
		const effort = ctx.thinkingLevel || undefined;
		if (model === undefined) unavailable.push("startup model");
		if (effort === undefined) unavailable.push("startup effort");
		if (model !== undefined || effort !== undefined) {
			startup = { ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }) };
		}
	}
	return {
		sessionId: ctx.sessionManager.getSessionId(), kind: "main",
		...(name === undefined ? {} : { name }),
		...(startup === undefined ? {} : { startup }), unavailable,
	};
}

function publishNotice(ctx: PiExtensionContext, level: FeedbackLevel, message: string): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else process.stderr.write(`${message}\n`);
}

function piPort(
	pi: PiExtensionApi,
	definition: ExtensionDefinition,
	keepSubscription: (release: () => void) => void,
): HarnessPort {
	const stateEntryType = `${definition.id}:state`;
	let activeOwner: { key: string; session: SessionFacts } | undefined;
	let reportedOwnerless = false;
	let label = definition.displayName;
	const reportDiagnostic = (message: string): void => { process.stderr.write(`${label}: ${message}\n`); };
	const resolveOwner = (ctx: PiExtensionContext): OwnerReference => {
		const owner = ownerOf(ctx);
		if (owner.kind === "unresolved" && !reportedOwnerless) {
			reportedOwnerless = true;
			reportDiagnostic("this session reports no identity; the extension stays off for it");
		}
		return owner;
	};
	const markers = (ctx: PiExtensionContext): MarkerTransport => ({
		publishMarkers: lines => {
			if (ctx.hasUI) ctx.ui.setWidget("semantic-extensions", lines.length ? [...lines] : undefined, { placement: "aboveEditor" });
		},
	});
	const notices = (ctx: PiExtensionContext): NoticeTransport => ({ warn: message => publishNotice(ctx, "warning", message) });
	const feedback = (ctx: PiExtensionContext): FeedbackTransport => ({ notify: (level, message) => publishNotice(ctx, level, message) });
	const persist = (values: Parameters<PiExtensionApi["appendEntry"]>[1]): void => pi.appendEntry(stateEntryType, values);
	const unsupported = (axis: string): never => {
		throw new Error(`the pi adapter does not implement ${axis} observations`);
	};

	return {
		// pi.setLabel labels a history ENTRY, not an extension. Keep this label on
		// diagnostics instead of misusing that unrelated native operation.
		setLabel: value => { label = value; },
		reportDiagnostic,
		onSession: handler => {
			const deliver = (event: SessionEvent, owner: OwnerReference, ctx: PiExtensionContext, session: SessionFacts): void => {
				handler({
					event, session, owner,
					statePayloads: ctx.sessionManager.getBranch()
						.filter(entry => entry.type === "custom" && entry.customType === stateEntryType)
						.map(entry => entry.data),
					persist, hasUI: ctx.hasUI, feedback: feedback(ctx), notices: notices(ctx), markers: markers(ctx),
				});
			};
			keepSubscription(pi.on("session_start", (event, ctx) => {
				const owner = resolveOwner(ctx);
				if (owner.kind === "owner" && owner.key === activeOwner?.key) return;
				const reason = START_REASON[event.reason];
				const session = sessionFactsOf(ctx, reason);
				if (activeOwner !== undefined) {
					deliver({ kind: "session_end", reason: "transferred" }, { kind: "owner", key: activeOwner.key }, ctx, activeOwner.session);
				}
				activeOwner = owner.kind === "owner" ? { key: owner.key, session } : undefined;
				deliver({ kind: "session_start", reason }, owner, ctx, session);
			}));
			keepSubscription(pi.on("session_shutdown", (event, ctx) => {
				const ended = activeOwner;
				if (ended === undefined) return;
				activeOwner = undefined;
				deliver({ kind: "session_end", reason: END_REASON[event.reason] }, { kind: "owner", key: ended.key }, ctx, sessionFactsOf(ctx));
			}));
		},
		nextTask: callback => { setTimeout(callback, 0); },
		onRound: () => unsupported("round"),
		onTurn: () => unsupported("Turn"),
		onSubagentRuntime: () => unsupported("subagent-runtime"),
		onUserInput: () => unsupported("user-input"),
		onRunInitiation: handler => {
			keepSubscription(pi.on("before_agent_start", async (_event, ctx) => {
				const planned = await handler({
					owner: resolveOwner(ctx),
					contributionIdentities: ctx.sessionManager.getBranch()
						.flatMap(entry => entry.type === "custom_message" && typeof entry.customType === "string" ? [entry.customType] : []),
					markers: markers(ctx),
				});
				// pi appends and persists this message after the user's input. Its
				// custom-message path supplies the native role; no system override.
				return planned === undefined ? undefined : {
					message: { customType: planned.identity, content: planned.content, display: planned.display },
				};
			}));
		},
		registerCommand: command => {
			pi.registerCommand(command.name, {
				description: command.description,
				handler: async (args, ctx) => {
					await command.run({
						args, owner: resolveOwner(ctx), persist, hasUI: ctx.hasUI,
						canAcceptInput: () => ctx.isIdle(), provider: ctx.model?.provider,
						feedback: feedback(ctx), markers: markers(ctx),
					});
				},
			});
		},
	};
}

/** Uses the same binding and assembly contract as the OMP adapter. */
export function piAdapter(definition: ExtensionDefinition, options: ExtensionAssembly = {}): PiExtensionFactory {
	const state = new StateStore({ field: activationField(definition), persistence: statePersistence(definition) });
	let implementation: ExtensionImplementation | undefined;
	const resolveImplementation = (context: ImplementationContext): ExtensionImplementation => {
		if (implementation === undefined || isImplementationDisposed(implementation)) {
			implementation = options.factory === undefined ? {} : options.factory(context);
		}
		return implementation;
	};
	return pi => {
		const subscriptions: Array<() => void> = [];
		const result = bindExtension(definition, piPort(pi, definition, release => subscriptions.push(release)), state,
			resolveImplementation, { baseDir: options.configBaseDir });
		if (!result.bound) for (const release of subscriptions) release();
		return result;
	};
}
