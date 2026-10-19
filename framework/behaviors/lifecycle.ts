/**
 * The implementation lifecycle: when an extension's one-time initialization runs, when its one
 * cleanup runs, and what makes each of them happen at most once.
 *
 * The unit of the lifecycle is the *implementation*, not the binding. A definition may be bound
 * many times in one process — a session and each of its subagents — and the implementation an
 * assembly's factory built is the same object every time; the framework therefore keeps the
 * record beside that object rather than beside a binding. That is what makes an ordinary model,
 * session, tree or view change harmless: no binding creates a second business instance, and no
 * boundary runs the initialization again.
 *
 * Initialization is recorded rather than repeated. The first node that initializes an
 * implementation creates the one promise every later caller receives, and a rejection is reported
 * once rather than rethrown, because a failed prefetch must not turn into a failed model request.
 * Only a genuinely unfinished initialization is reported as pending: the run-initiation path
 * waits for one, so the promise it returns has to be cleared as soon as the initialization
 * settles, or every later run would be handed a promise for work that is already done.
 *
 * Cleanup is recorded rather than repeated for the same reason, and it has one extra rule: only a
 * session this implementation serves can end it — the session it serves *now*, which a switch has
 * already moved off the session that initialized it. A subagent binding never initializes (only a
 * session that is its own owner does) and never delivers the session end this module cleans up on,
 * so a subagent's traffic can never tear down the CLI's instance, and an ordinary switch only moves
 * the served owner rather than disposing anything. A disposed implementation is spent: the record
 * keeps saying so, so a later binding builds a new one instead of handing the spent object to an
 * extension that believes it is starting fresh.
 *
 * This module is harness-independent: it calls the implementation's own entries and the
 * reporting callback it was handed, and names no native API.
 */
import type { ExtensionImplementation, InitializationDelivery } from "../interface/details/implementation";
import type { SubagentIntegration } from "../interface/subagent";

/** The completion of an implementation that declares no initialization: settled before it starts. */
const SETTLED: Promise<void> = Promise.resolve();

/** What one implementation's lifecycle has already done, kept beside the implementation. */
interface LifecycleRecord {
	/** Whether the initialization entry has been reached. */
	started: boolean;
	/** The initialization's completion, while it is still running. */
	pending?: Promise<void>;
	/** The owner session this implementation currently serves, once one has started it. */
	servingOwnerKey?: string;
	/** Whether the implementation's cleanup entry has been called. */
	cleanedUp: boolean;
}

const lifecycleRecords = new WeakMap<ExtensionImplementation, LifecycleRecord>();

function recordFor(implementation: ExtensionImplementation): LifecycleRecord {
	const existing = lifecycleRecords.get(implementation);
	if (existing !== undefined) return existing;
	const created: LifecycleRecord = { started: false, cleanedUp: false };
	lifecycleRecords.set(implementation, created);
	return created;
}

/**
 * The owner key of the session this implementation currently serves, or `undefined` when no owner
 * session has started it.
 *
 * It is the *current* owner, not the one that first initialized the instance: an ordinary session
 * switch ends the session being left as `transferred` and starts another under its own key while
 * this implementation keeps serving, so which session's end is the instance's disposal is a
 * question about the owner being served now.
 */
export function servingOwnerKeyOf(implementation: ExtensionImplementation): string | undefined {
	return lifecycleRecords.get(implementation)?.servingOwnerKey;
}

/**
 * Whether one implementation's cleanup has already run.
 *
 * A disposed implementation is spent: its timer is stopped and its connection is closed by the
 * extension's own cleanup, so a later binding must build a new one rather than hand the disposed
 * object to an extension that believes it is starting fresh.
 */
export function isImplementationDisposed(implementation: ExtensionImplementation): boolean {
	return lifecycleRecords.get(implementation)?.cleanedUp === true;
}

/**
 * Initializes one implementation at most once, returning the promise every caller waits on.
 *
 * An implementation that declares no initialization settles immediately and records nothing
 * more, so a definition that only needs a command pays nothing for this path — and, in
 * particular, no run initiation is ever handed a promise on its behalf. The one exception is a
 * harness integration (`integration`): it is this process's own wiring — requiring the entry in
 * the sessions the harness spawns, and reading the harness's answer — so it is settled here even
 * for an implementation that declares no initialization, and a run initiation waits for it
 * exactly as it waits for an initialization.
 *
 * The integration is settled before the delivery is handed over: what the extension reads in its
 * own initialization is the one answer this process has, and an integration that never settles
 * would otherwise let a first request be issued with the wiring still open.
 */
export function initializeImplementation(
	extensionId: string,
	implementation: ExtensionImplementation,
	delivery: Omit<InitializationDelivery, "subagents">,
	reportFailure: (message: string) => void,
	integration?: () => SubagentIntegration | Promise<SubagentIntegration>,
): Promise<void> {
	const record = recordFor(implementation);
	// The owner being served, recorded before the once-only guard: a session switch starts another
	// owner session on this same implementation, and it is that session's end which disposes it.
	if (delivery.owner.kind === "owner") record.servingOwnerKey = delivery.owner.key;
	if (record.started) return record.pending ?? SETTLED;
	record.started = true;

	const initialize = implementation.initialize;
	if (initialize === undefined && integration === undefined) return SETTLED;

	// The harness's own answer is asked once here, before anything is recorded: a harness that
	// integrates subagent observations itself answers with the value and nothing has to be waited
	// for, while an answer that is a promise is the wiring this process still has to put in place —
	// the requirement a provider has to take — and a run initiation waits for it exactly as it
	// waits for an initialization.
	const answered = integration?.();
	if (initialize === undefined && !(answered instanceof Promise)) return SETTLED;

	// Started before the entry runs, so a run initiation that arrives while it is in flight waits
	// for it rather than racing it; cleared once it settled, so the runs that follow it are not
	// made to wait for work that is already done.
	const pending = Promise.resolve(answered)
		.then(async (settled: SubagentIntegration | undefined) => {
			// A harness that reports no integration at all is a harness that offers none: the
			// extension is told that, rather than the member being absent from the delivery.
			const subagents: SubagentIntegration = settled ?? { mode: "none" };
			if (initialize === undefined) return;
			// Explicitly the approved surface, not the internal facts: the delivery the extension
			// receives carries no transport beyond the feedback channel it was given.
			await initialize({
				owner: delivery.owner,
				hasUI: delivery.hasUI,
				feedback: delivery.feedback,
				subagents,
			});
		})
		.catch((error: unknown) => {
			const detail = error instanceof Error ? error.message : String(error);
			reportFailure(`${extensionId}: initialization failed: ${detail}`);
		})
		.then(() => {
			if (record.pending === pending) record.pending = undefined;
		});
	record.pending = pending;
	return pending;
}

/**
 * The initialization still in flight for one implementation, or `undefined` when none is.
 *
 * The run-initiation path uses this rather than {@link initializeImplementation}: waiting for an
 * initialization the session node started is the contract, while *starting* one there would make
 * the node's own choice of position meaningless.
 */
export function initializationPending(implementation: ExtensionImplementation): Promise<void> | undefined {
	return lifecycleRecords.get(implementation)?.pending;
}

/**
 * Runs one implementation's cleanup at most once.
 *
 * Both failures are the implementation's own and neither is rethrown: a synchronous throw and a
 * rejected promise are each reported once on the adapter's diagnostic channel, and the session
 * that was ending still ends — nothing the framework does here waits for the extension's work,
 * which is exactly what keeps an ending session from being held by a remote call.
 */
export function cleanupImplementation(
	extensionId: string,
	implementation: ExtensionImplementation,
	reportFailure: (message: string) => void,
): void {
	const record = recordFor(implementation);
	if (record.cleanedUp) return;
	record.cleanedUp = true;

	const cleanup = implementation.cleanup;
	if (cleanup === undefined) return;
	try {
		Promise.resolve(cleanup()).catch((error: unknown) => {
			const detail = error instanceof Error ? error.message : String(error);
			reportFailure(`${extensionId}: cleanup failed: ${detail}`);
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		reportFailure(`${extensionId}: cleanup failed: ${detail}`);
	}
}
