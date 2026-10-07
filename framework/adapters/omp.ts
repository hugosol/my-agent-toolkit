/**
 * The OMP adapter: the only framework module that touches the agent runtime's native
 * surface, and therefore the only place a native escape hatch (`pi.*`) may appear.
 *
 * It translates the native API into the framework's port before any behavior runs and
 * translates framework outcomes back into native effects. It carries no extension
 * semantics: what to register comes from the definition, whether it may be registered
 * is decided by the agent-runtime-independent behavior, and what a command does is the
 * framework's control behavior — this file only resolves the native facts that
 * behavior needs.
 */
import { bindExtension } from "../behaviors/binding";
import { AdmissionNotices, type RequiredSemantic } from "../core/admission";
import type { ExtensionDefinition } from "../core/definition";
import type {
	AgentRuntimePort,
	BindingResult,
	MarkerTransport,
	NoticeTransport,
	OwnerReference,
	SessionChangeReason,
	SessionPosition,
} from "../core/protocol";
import { StateStore } from "../core/state";

/** Re-exported because it is what {@link OmpExtensionFactory} returns. */
export type { BindingResult } from "../core/protocol";

/**
 * The one native widget key the framework owns for its unified marker area.
 *
 * It is deliberately not derived from any definition: extensions render lines inside this
 * area, they never name the widget. The value is the area's consumer-visible identity, so
 * changing it changes where every extension's marker appears.
 */
const MARKER_AREA_KEY = "semantic-extensions";

/** The placement the framework fixes for the unified marker area. */
const MARKER_AREA_PLACEMENT = "aboveEditor";

/**
 * One session entry as the native session manager holds it.
 *
 * Only the persisted shapes the adapter recognizes are named: the State payload
 * (`type: "custom"`) and the injected-prompt contribution (`type: "custom_message"`).
 * Whether a payload declares a usable value is the framework's validation rule, so the
 * adapter hands payloads over unread.
 */
export interface OmpSessionEntry {
	readonly type?: string;
	readonly customType?: string;
	/** The State record's payload (`type: "custom"`). */
	readonly data?: unknown;
	/** A persisted contribution's text and framework-owned presentation. */
	readonly content?: string;
	readonly display?: boolean;
	readonly attribution?: "user" | "agent";
}

/**
 * The native UI surface an extension context exposes. Only the used members are named;
 * they are no-ops when the session runs without a UI.
 */
export interface OmpUiContext {
	/** Shows a notification to the user. */
	notify(message: string, type?: "info" | "warning" | "error"): void;
	/** Sets one widget in the editor area, or clears it when `content` is undefined. */
	setWidget(
		key: string,
		content: readonly string[] | undefined,
		options?: { readonly placement?: "aboveEditor" | "belowEditor" },
	): void;
}

/**
 * The native session facts the adapter reads: which session is current, what its branch
 * holds, and which UI channel its feedback has.
 */
export interface OmpSessionContext {
	/** Identity of the session the handler runs for. */
	readonly agent: {
		readonly kind: "main" | "sub";
		readonly id: string;
		readonly parentId?: string;
	};
	/** The session manager, read for the session identity and the branch entries. */
	readonly sessionManager: {
		getSessionId(): string;
		/** The entries on the current branch, root to leaf. */
		getBranch(): readonly OmpSessionEntry[];
	};
	/** Whether a UI is available; feedback falls back to stderr when it is not. */
	readonly hasUI: boolean;
	/** The session's UI channel, the surface both feedback and the marker area use. */
	readonly ui: OmpUiContext;
}

/** The native session lifecycle events this adapter maps to framework session positions. */
export type OmpSessionEventType = "session_start" | "session_switch" | "session_branch" | "session_tree";

/** Why the agent runtime changed sessions, as its event carries it. */
export type OmpSessionReason = "new" | "resume" | "fork" | "branch" | "btw";

/** A native session lifecycle event, as the runner delivers it. */
export interface OmpSessionEvent {
	readonly type: OmpSessionEventType;
	/** The transition's reason: a switch carries `new`/`resume`/`fork`, a branch its own reason. */
	readonly reason?: OmpSessionReason;
}

/**
 * The native command context the adapter reads, as the OMP runner builds it.
 *
 * Only the used members are named; the runner passes the full command context, and its
 * session facts and UI channel are exactly the ones a session hook also sees.
 */
export type OmpCommandContext = OmpSessionContext;

/**
 * The native surface this adapter uses, as the OMP loader hands it to an extension
 * factory. Only the used members are named; the loader passes the full API.
 */
export interface OmpExtensionApi {
	/** Sets the display label for this extension. */
	setLabel(label: string): void;
	/** Registers a custom command the user can run as `/<name>`. */
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler: (args: string, ctx: OmpCommandContext) => void | Promise<void>;
		},
	): void;
	/** Appends a custom entry to this session for State persistence (not sent to the model). */
	appendEntry(customType: string, data?: unknown): void;
	/** Subscribes to one session lifecycle event. */
	on(event: OmpSessionEventType, handler: (event: OmpSessionEvent, ctx: OmpSessionContext) => void): void;
	/** Subscribes to the run-initiation event, the native `before_agent_start`. */
	on(event: "before_agent_start", handler: OmpRunInitiationHandler): void;
	/**
	 * The injected SDK surface (`pi.pi`).
	 *
	 * Optional because only owner resolution needs it: a top-level main session is its own
	 * owner, so an extension loaded by a runtime that injects no SDK surface still runs for
	 * main sessions. Without it, no subagent's owner resolves, and a subagent therefore
	 * follows no activation instead of guessing one.
	 */
	readonly pi?: OmpSdkSurface;
}

/** The native contribution payload a run-initiation handler may return. */
export interface OmpInjectedPromptMessage {
	readonly customType: string;
	readonly content: string;
	readonly display: boolean;
	readonly details?: unknown;
	readonly attribution?: "user" | "agent";
}

/** What a run-initiation handler returns: the message to append, or nothing. */
export interface OmpRunInitiationResult {
	readonly message: OmpInjectedPromptMessage;
}

/** A native run-initiation (`before_agent_start`) handler, as the loader calls it. */
export type OmpRunInitiationHandler = (
	event: unknown,
	ctx: OmpSessionContext,
) => OmpRunInitiationResult | undefined | void;

/** Assembly options fixed by the public interface. */
export interface OmpAdapterOptions {
	/**
	 * The exact agent-runtime versions this extension is supported on.
	 *
	 * Version admission (an unlisted runtime notifies once per main session and then
	 * keeps running, per the admission behavior) reads this set; the type keeps the
	 * declaration non-empty so an extension cannot claim support for nothing.
	 */
	readonly supportedVersions: readonly [string, ...string[]];
}

/** The OMP extension factory an entrypoint re-exports; the loader calls it per binding. */
export type OmpExtensionFactory = (pi: OmpExtensionApi) => BindingResult;

/**
 * One agent as the runtime's official registry holds it: the identity and the parent link
 * the registry itself publishes, plus the live session a resolvable owner is read from.
 */
export interface OmpAgentRef {
	readonly id: string;
	/** `"main"` for a top-level session, `"sub"` for a spawned one, `"advisor"` for an advisor. */
	readonly kind?: string;
	/** Registry id of the spawning agent; absent for a top-level session. */
	readonly parentId?: string;
	/** The live session, or null once the agent is parked and only its history remains. */
	readonly session?: {
		readonly sessionManager?: { getSessionId(): string };
	} | null;
}

/** The runtime's process-wide agent registry: the official graph of who spawned whom. */
export interface OmpAgentRegistry {
	get(id: string): OmpAgentRef | undefined;
}

/**
 * The injected SDK surface the loader attaches to the extension API (`pi.pi`).
 *
 * This is the adapter's escape hatch, and the only one it uses: resolving an owner needs
 * the runtime's own agent graph rather than a framework-side copy of it. Nothing outside
 * `framework/adapters/` may name this surface.
 */
export interface OmpSdkSurface {
	readonly AgentRegistry?: { global(): OmpAgentRegistry };
	/**
	 * The version the agent runtime reports through its own SDK namespace.
	 *
	 * This is the only version surface the extension interface exposes, so it is what
	 * version admission compares against the declared support set. A surface without it
	 * reports no version, and admission then has nothing to compare.
	 */
	readonly VERSION?: string;
}

/**
 * The State cell key of a session that owns its own State.
 *
 * The key is the session's own identity, never a process-level label such as the
 * `"Main"` registry id: two sessions in one process share the label but not the key. The
 * kind prefix keeps the key namespace explicit; a main session is the only kind that ever
 * holds State, so it is the only kind this key form is produced for.
 */
function mainOwnerKey(sessionId: string): string {
	return `main:${sessionId}`;
}

/**
 * The version the agent runtime reports, when its extension surface reports one.
 *
 * The injected SDK namespace carries the runtime's own version constant; a surface that
 * carries none reports no version, and admission then has nothing to compare against the
 * declared support set.
 */
function reportedVersion(pi: OmpExtensionApi): string | undefined {
	const version = pi.pi?.VERSION;
	return typeof version === "string" && version.trim().length > 0 ? version : undefined;
}

/**
 * The required semantics this runtime cannot honor, as this adapter can observe them.
 *
 * History preservation — the framework's one required semantic — rests on the two native
 * paths this adapter uses: a contribution is committed by returning it from the
 * run-initiation hook for the runtime to append to the conversation, and State is written
 * only by appending a session entry. A surface missing either path cannot carry that
 * append-only contract, so the adapter reports the semantic as missing and binding refuses
 * instead of degrading the contract.
 */
function missingRequiredSemantics(pi: OmpExtensionApi): readonly RequiredSemantic[] {
	const missing: RequiredSemantic[] = [];
	if (typeof pi.appendEntry !== "function" || typeof pi.on !== "function") missing.push("history-preservation");
	return missing;
}

/**
 * The owner a session's State belongs to: the nearest ancestor session that is itself a
 * top-level main session (a main session is its own owner).
 *
 * The walk uses the runtime's own facts — `ctx.agent.parentId` and the official agent
 * registry the runtime injects — and never a nesting depth or a process-level label, so a
 * nested subagent resolves level by level to the same root owner and a background fork
 * that carries a parent link follows the same rule. A chain that leaves the process (an
 * ancestor the registry does not hold, a link that loops, an owner whose session is gone)
 * resolves to nothing rather than to a guessed owner.
 */
function ownerReferenceOf(pi: OmpExtensionApi, ctx: OmpSessionContext): OwnerReference {
	if (ctx.agent.kind === "main") {
		const sessionId = ctx.sessionManager.getSessionId();
		return sessionId.length > 0 ? { kind: "owner", key: mainOwnerKey(sessionId) } : { kind: "unresolved" };
	}

	const registry = pi.pi?.AgentRegistry?.global();
	if (registry === undefined) return { kind: "unresolved" };

	const visited = new Set<string>();
	let cursor = ctx.agent.parentId;
	while (cursor !== undefined && !visited.has(cursor)) {
		visited.add(cursor);
		const ref = registry.get(cursor);
		if (ref === undefined) break;
		if (ref.kind === "main") {
			const sessionId = ref.session?.sessionManager?.getSessionId() ?? "";
			return sessionId.length > 0 ? { kind: "inherited", key: mainOwnerKey(sessionId) } : { kind: "unresolved" };
		}
		cursor = ref.parentId;
	}
	return { kind: "unresolved" };
}

/**
 * The persisted State payloads on one session's branch, oldest first.
 *
 * The adapter resolves *which* entries carry this extension's State; whether a payload
 * declares a usable value is the framework's rule, so payloads cross the seam unread, in
 * branch order, with the session's current record last.
 */
function statePayloadsOf(ctx: OmpSessionContext, stateEntryType: string): readonly unknown[] {
	return ctx.sessionManager
		.getBranch()
		.filter(entry => entry.type === "custom" && entry.customType === stateEntryType)
		.map(entry => entry.data);
}

/**
 * The injected-prompt identities one session's branch already persists, oldest first.
 *
 * A persisted contribution is a `custom_message` entry whose custom type is the slot's
 * framework identity. The adapter resolves which identities are present; whether that
 * satisfies a slot is the framework's rule, so identities cross the seam as facts.
 */
function contributionIdentitiesOf(ctx: OmpSessionContext): readonly string[] {
	return ctx.sessionManager
		.getBranch()
		.filter(entry => entry.type === "custom_message" && typeof entry.customType === "string")
		.map(entry => entry.customType as string);
}

/**
 * The framework's port onto OMP, bound to one session and the extension's State key.
 */
function ompPort(pi: OmpExtensionApi, definition: ExtensionDefinition): AgentRuntimePort {
	const stateEntryType = `${definition.id}:state`;
	// The owner key this binding currently serves when it is itself the owner. A boundary
	// that changes it lets the framework retire the cell of the session it moved away
	// from, so no session can read a value another one left behind.
	let activeOwnerKey: string | undefined;
	// At most one ownerless diagnostic per binding: the first delivery that resolves no
	// owner reports it, and every later one stays quiet.
	let reportedOwnerless = false;

	// Startup happens before any UI exists, so the diagnostic goes to stderr: it is
	// user-visible and can never reach model context.
	const reportDiagnostic = (message: string): void => {
		process.stderr.write(`${message}\n`);
	};

	/**
	 * The marker area's transport for one delivery: the framework-owned widget of this
	 * session, where an empty line list clears the area.
	 *
	 * A session without a UI renders no area at all. The marker is a UI-only surface with
	 * no textual equivalent, so its whole path is a no-op there rather than a diagnostic.
	 */
	const markerTransport = (ctx: OmpSessionContext): MarkerTransport => ({
		publishMarkers: lines => {
			if (!ctx.hasUI) return;
			ctx.ui.setWidget(MARKER_AREA_KEY, lines.length > 0 ? [...lines] : undefined, {
				placement: MARKER_AREA_PLACEMENT,
			});
		},
	});

	/**
	 * The notice channel for one session: a warning-level UI notification when the session
	 * has a UI, and one stderr line when it does not. Neither is model context — a notice
	 * is feedback for the operator, never an injected prompt or a conversation entry.
	 */
	const noticeTransport = (ctx: OmpSessionContext): NoticeTransport => ({
		warn: message => {
			if (ctx.hasUI) ctx.ui.notify(message, "warning");
			else process.stderr.write(`${message}\n`);
		},
	});

	const ownerOf = (ctx: OmpSessionContext): OwnerReference => {
		const owner = ownerReferenceOf(pi, ctx);
		if (owner.kind === "unresolved" && !reportedOwnerless) {
			reportedOwnerless = true;
			// Best-effort and user-visible only: this is not the version-admission or
			// required-semantics refusal channel, and the extension stays bound.
			reportDiagnostic(
				`${definition.id}: no owning main session resolved for this session; the extension stays off`,
			);
		}
		return owner;
	};

	return {
		setLabel: label => pi.setLabel(label),
		reportDiagnostic,
		onSession: handler => {
			const deliver = (
				position: SessionPosition,
				reason: SessionChangeReason | undefined,
				ctx: OmpSessionContext,
			): void => {
				const owner = ownerOf(ctx);
				// Only a delivery of a session that is itself the owner can replace an owner
				// cell: a follower never held one, and an unresolved binding is no owner.
				const previousOwnerKey = owner.kind === "owner" ? activeOwnerKey : undefined;
				activeOwnerKey = owner.kind === "owner" ? owner.key : undefined;
				handler({
					position,
					reason,
					owner,
					previousOwnerKey,
					statePayloads: statePayloadsOf(ctx, stateEntryType),
					notices: noticeTransport(ctx),
				});
			};

			// One native session event per framework position, and no other native event
			// reaches this hook: a per-turn run initiation is a separate semantic hook, so a
			// run can never arrive here and reseed the session's State.
			pi.on("session_start", (_event, ctx) => {
				deliver("start", undefined, ctx);
			});
			pi.on("session_switch", (event, ctx) => {
				deliver("switch", event.reason, ctx);
			});
			pi.on("session_branch", (event, ctx) => {
				deliver("branch", event.reason, ctx);
			});
			pi.on("session_tree", (_event, ctx) => {
				deliver("tree", undefined, ctx);
			});
		},
		onRunInitiation: handler => {
			pi.on("before_agent_start", (_event, ctx) => {
				const contribution = handler({
					owner: ownerOf(ctx),
					contributionIdentities: contributionIdentitiesOf(ctx),
					markers: markerTransport(ctx),
				});
				if (contribution === undefined) return undefined;
				// The framework fixed the contribution's visibility, position and attribution;
				// this adapter only writes them into the native payload the loader commits.
				return {
					message: {
						customType: contribution.identity,
						content: contribution.content,
						display: contribution.display,
						attribution: contribution.attribution,
					},
				};
			});
		},
		registerCommand: command => {
			pi.registerCommand(command.name, {
				description: command.description,
				handler: (_args, ctx) => {
					command.run({
						owner: ownerOf(ctx),
						// Only the owner's own session reaches the write path, so persisting
						// through this binding's API always records the owner's session.
						persist: values => {
							pi.appendEntry(stateEntryType, values);
						},
						// Feedback is user-visible only: on the UI when there is one, and on
						// stderr when the session runs without one.
						notify: message => {
							if (ctx.hasUI) ctx.ui.notify(message, "info");
							else process.stderr.write(`${message}\n`);
						},
						markers: markerTransport(ctx),
					});
				},
			});
		},
	};
}

/**
 * Assembles a definition for OMP.
 *
 * The returned factory binds the definition to whichever session calls it; a refused
 * definition reports its conflicts and contributes nothing, and the agent runtime
 * continues. The State store is created once here — at module load, so once per
 * extension per process — and shared by every session binding, which is what lets
 * bindings agree on one current value per owner.
 */
export function ompAdapter(definition: ExtensionDefinition, options: OmpAdapterOptions): OmpExtensionFactory {
	const state = new StateStore();
	// One notice ledger per assembly, as the State store is: every binding this factory
	// makes in one process shares it, so a main session is told about an unlisted version
	// exactly once however often the loader re-binds the session.
	const notices = new AdmissionNotices();
	return (pi: OmpExtensionApi): BindingResult =>
		bindExtension(definition, ompPort(pi, definition), state, {
			supportedVersions: options.supportedVersions,
			facts: {
				version: reportedVersion(pi),
				missingRequiredSemantics: missingRequiredSemantics(pi),
				// Recorded, never judged: the verified environment is a fact of the support
				// record, and admission consults no field of it.
				environment: { platform: `${process.platform}-${process.arch}`, runtime: "omp" },
			},
			notices,
		});
}
