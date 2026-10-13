/**
 * Dock fixture: the harness's own run boundary and its idle facts, observed directly rather than
 * through the framework.
 *
 * The framework's round axis ends a round only once the session really reports quiescence, and a
 * harness reports a run as over *before* its own work has unwound. This fixture subscribes those
 * native facts itself and samples the context at the settle and again on its next task, so one
 * run's stderr shows what the session actually reported at each moment: the round end the framework
 * dispatches can then be placed after the settle, rather than being taken on faith. It is evidence
 * about the host, not a second round axis: it publishes nothing to the framework and changes
 * nothing.
 */
export const NATIVE_RUN_OBSERVER_ID = "round-facts-native";

/** The native run-lifecycle events this fixture reads, and the facts their context reports. */
interface NativeRunEvent {
	readonly type: "agent_start" | "agent_end";
	/** Present on a settle: whether the session already scheduled its next piece of work. */
	readonly willContinue?: boolean;
}

interface NativeRunContext {
	isIdle?(): boolean;
	hasPendingMessages?(): boolean;
}

interface NativeRunApi {
	on(event: "agent_start" | "agent_end", handler: (event: NativeRunEvent, ctx: NativeRunContext) => void): void;
}

/** One observation, on the channel the dock captures: a kind, then `key=value` facts. */
function evidence(kind: string, ...facts: readonly string[]): void {
	process.stderr.write(`[${NATIVE_RUN_OBSERVER_ID}] ${kind}${facts.length === 0 ? "" : ` ${facts.join(" ")}`}\n`);
}

/** The context's own facts, as strings, with an unreported one named rather than guessed. */
function factsOf(ctx: NativeRunContext): readonly string[] {
	const idle = typeof ctx.isIdle === "function" ? String(ctx.isIdle()) : "unreported";
	const pending = typeof ctx.hasPendingMessages === "function" ? String(ctx.hasPendingMessages()) : "unreported";
	return [`idle=${idle}`, `pending=${pending}`];
}

export default function nativeRunObserver(pi: NativeRunApi): void {
	pi.on("agent_start", (_event, ctx) => {
		evidence("agent_start", ...factsOf(ctx));
	});
	pi.on("agent_end", (event, ctx) => {
		evidence("agent_end", `willContinue=${String(event.willContinue)}`, ...factsOf(ctx));
		// The probe's own next task, exactly as the timing investigation sampled it: a task boundary
		// after this callback returned, which is when the session's own work may have unwound. This is
		// a fixture's sampling position, never a production scheduling rule.
		setTimeout(() => {
			evidence("next_task", ...factsOf(ctx));
		}, 0);
	});
}
