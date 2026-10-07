/**
 * The protocol between the framework's agent-runtime-independent behavior and an
 * agent-runtime adapter.
 *
 * Adapters translate native capabilities into this port and translate framework
 * outcomes back into native effects; the behavior itself never sees a native API.
 * Failures travel as data, so an adapter can report them on whatever non-model
 * channel its agent runtime offers without deciding what counts as a conflict.
 */
import type { RequiredSemantic } from "./admission";
import type { ExtensionDefinition } from "./definition";
import type { ConfigurationViolation } from "./violations";

/** The State values one write path records, by field name. */
export type StateValues = Readonly<Record<string, boolean>>;

/**
 * The owner a framework effect acts on: the session whose State the effect concerns.
 *
 * `owner` — the session this delivery names is itself the owner (a top-level main
 * session). It is the only session that seeds or transitions the value. `inherited` —
 * the delivery names a subagent session, which follows its owner's current value live
 * and read-only: it reads that value and never writes it. `unresolved` — no owning main
 * session could be resolved (the parent chain leaves the process), so the value reads as
 * the declared default and no path may write it.
 *
 * The key is the adapter's opaque identity for the owning session. The framework never
 * derives or interprets it; two sessions in one process that share a registry label are
 * still different owners when their session identities differ.
 */
export type OwnerReference =
	| { readonly kind: "owner"; readonly key: string }
	| { readonly kind: "inherited"; readonly key: string }
	| { readonly kind: "unresolved" };

/**
 * Where in a session's life a semantic session hook delivery happens.
 *
 * `start`, `switch` and `branch` are boundaries: the session the delivery names is a new
 * identity whose State comes from its target branch. `tree` is not: navigation inside one
 * session changes only its leaf.
 */
export type SessionPosition = "start" | "switch" | "branch" | "tree";

/** Why a session identity changed, when the delivery carries it. */
export type SessionChangeReason = "new" | "resume" | "fork" | "branch" | "btw";

/**
 * The transport a session delivery publishes user-visible notices through.
 *
 * Implementations must use a channel outside model context — a UI notification, or a
 * stderr line when the session has no UI. A notice is feedback for the operator: never an
 * injected prompt, a conversation entry, tool output, or anything else a model could read.
 */
export interface NoticeTransport {
	/** Publishes one warning-level notice. */
	warn(message: string): void;
}

/**
 * The facts an agent-runtime adapter resolves for one session hook delivery.
 *
 * The adapter answers *which* session is current and what its branch persisted; whether
 * a persisted payload declares a usable value is the framework's own validation rule, so
 * payloads cross the seam unread.
 */
export interface SessionDelivery {
	readonly position: SessionPosition;
	/** Why the session identity changed; `switch` and `branch` deliveries carry it. */
	readonly reason?: SessionChangeReason;
	/** The owner whose State this delivery concerns, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** The owner key this delivery replaces, when this binding served another owner before. */
	readonly previousOwnerKey?: string;
	/**
	 * The State payloads persisted on the target branch, oldest first.
	 *
	 * The session's current record is the last one; an adapter never reorders or filters
	 * them, and hands over an empty list when the branch persisted no State.
	 */
	readonly statePayloads: readonly unknown[];
	/** The transport this delivery's notices are published through. */
	readonly notices: NoticeTransport;
}

/**
 * The transport the framework publishes its unified marker area through.
 *
 * The area itself — its native widget key, its placement, and what happens without a UI —
 * belongs to the adapter; the framework decides only its content. The lines handed here
 * are the area's current rendering for one owner (the active extensions' marker texts,
 * ordered by extension id), and an empty list is the framework's instruction to clear the
 * area rather than leave an empty widget behind.
 */
export interface MarkerTransport {
	publishMarkers(lines: readonly string[]): void;
}

/**
 * The facts an agent-runtime adapter resolves for one agent-run initiation.
 *
 * A run initiation is the semantic clock of injected-prompt contribution: the adapter
 * answers which owner governs the run and what the current branch already persists, and
 * the framework decides from those facts and the owner's State alone. Nothing about a
 * slot's progress is stored: whether a slot has already contributed is a fact of the
 * branch, so a re-entered delivery decides the same way.
 */
export interface RunDelivery {
	/** The owner whose State governs this run, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/**
	 * The injected-prompt identities the current branch already carries, oldest first.
	 *
	 * The adapter resolves persistence, not meaning: it reports which contributions exist,
	 * and the framework matches them against its own slot identities.
	 */
	readonly contributionIdentities: readonly string[];
	/** The transport this delivery's marker updates are published through. */
	readonly markers: MarkerTransport;
}

/**
 * The injected-prompt contribution the framework decided one run should carry.
 *
 * Visibility, delivery position and retention are framework-owned and not parameters:
 * a contribution is hidden, attributed to the agent, and appended at the end of the
 * conversation, where the agent runtime persists it with the rest of the turn.
 */
export interface PromptContribution {
	/** The slot's framework identity, also the custom type its persisted entry carries. */
	readonly identity: string;
	readonly content: string;
	readonly display: false;
	readonly attribution: "agent";
}

/**
 * The facts an agent-runtime adapter supplies for one command invocation.
 *
 * A command is registered natively at binding time, before any session fact exists;
 * the adapter resolves the owner and the two effect transports only when the agent
 * runtime runs it. Both effects belong to the adapter — the behavior decides what to
 * record and what to say, and in which order, but never how.
 */
export interface CommandInvocation {
	/** The owner whose State this command acts on, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/**
	 * Records the extension's new State values in the owner's persistence medium.
	 *
	 * Best-effort by contract: the extension side cannot observe a persistence
	 * failure, the transition is already the in-memory current value, and a throw
	 * here must not change the command's feedback.
	 */
	persist(values: StateValues): void;
	/** Publishes user-visible feedback outside model context. */
	notify(message: string): void;
	/**
	 * The transport this invocation's marker updates are published through.
	 *
	 * The framework publishes after the transition and its persistence attempt, so the
	 * area always renders a value that already holds — never one the medium might refuse.
	 */
	readonly markers: MarkerTransport;
}

/** One command the framework bound from a definition, ready for native registration. */
export interface BoundCommand {
	readonly name: string;
	readonly description?: string;
	/** Runs when the agent runtime invokes the command, supplied with its invocation facts. */
	run(invocation: CommandInvocation): void;
}

/** The registration and feedback surface an agent-runtime adapter must provide. */
export interface AgentRuntimePort {
	/** Sets the extension's display label for this binding. */
	setLabel(label: string): void;
	/**
	 * Publishes a user-visible diagnostic.
	 *
	 * Implementations must use a channel outside model context: never injected prompts,
	 * conversation entries, tool output, or any other content a model could read.
	 */
	reportDiagnostic(message: string): void;
	/**
	 * Registers the framework's semantic session hook: one delivery per session lifecycle
	 * event the adapter observes.
	 *
	 * Session positions only. A per-user-turn run initiation is a separate semantic hook
	 * and must never arrive here: a run does not change the session's identity, and a
	 * delivery would reseed the session's State from its branch once per turn.
	 */
	onSession(handler: (session: SessionDelivery) => void): void;
	/**
	 * Registers the framework's run-initiation semantic hook: one delivery per agent-run
	 * initiation, and none for a tool continuation or a further model request inside one
	 * run.
	 *
	 * The adapter commits whatever the handler returns by appending one hidden, persisted,
	 * agent-attributed contribution at the end of the conversation. The handler itself
	 * writes nothing, so a delivery that arrives again for the same run plans the same
	 * contribution instead of advancing anything.
	 */
	onRunInitiation(handler: (run: RunDelivery) => PromptContribution | undefined): void;
	/** Registers one bound command with the agent runtime's command surface. */
	registerCommand(command: BoundCommand): void;
}

/** Why an extension was not bound. */
export type BindingFailure =
	| {
			/** The definition declares competing declarations; see {@link ConfigurationViolation}. */
			readonly kind: "configuration";
			readonly violation: ConfigurationViolation;
	  }
	| {
			/** The definition cannot be initialized against this agent runtime. */
			readonly kind: "initialization";
			readonly detail: string;
	  }
	| {
			/**
			 * The agent runtime cannot honor a required framework semantic; see
			 * {@link RequiredSemantic}.
			 */
			readonly kind: "required-semantics";
			readonly missing: readonly RequiredSemantic[];
	  };

/**
 * What binding a definition to an agent runtime concluded.
 *
 * An unbound result carries the reported failures; the extension contributes nothing
 * — no commands, no injections, no marker — and the agent runtime keeps running.
 */
export type BindingResult =
	| { readonly bound: true; readonly definition: ExtensionDefinition }
	| { readonly bound: false; readonly failures: readonly BindingFailure[] };

/** The deterministic text of one binding failure, independent of where it is reported. */
export function describeBindingFailure(extensionId: string, failure: BindingFailure): string {
	const owner = extensionId.length > 0 ? extensionId : "<unnamed extension>";
	switch (failure.kind) {
		case "configuration":
			return `${owner}: configuration error (${failure.violation.kind}): ${failure.violation.detail}`;
		case "initialization":
			return `${owner}: initialization failed, extension not bound: ${failure.detail}`;
		case "required-semantics":
			return `${owner}: required semantics missing (${failure.missing.join(", ")}), extension not bound`;
	}
}
