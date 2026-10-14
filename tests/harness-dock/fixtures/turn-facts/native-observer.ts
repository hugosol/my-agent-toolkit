/**
 * Dock fixture: the harness's own turn boundary, observed directly rather than through the
 * framework.
 *
 * The framework's Turn axis deliberately does not read the harness's `turn_end`, because that
 * native event fires only once the tools the response requested have finished running — tool
 * execution is outside the Turn. This fixture subscribes that native event itself, together with
 * the assistant `message_end` the framework does read, so one run's stderr shows where the native
 * boundary really falls relative to the framework's two Turn edges. It is evidence about the host,
 * not a second Turn: it publishes nothing to the framework and changes nothing.
 */
export const NATIVE_TURN_OBSERVER_ID = "turn-facts-native";

/** The native turn boundary, as the harness declares it: it carries the tools that ran. */
interface NativeTurnEndEvent {
	readonly type: "turn_end";
	readonly turnIndex: number;
	readonly toolResults?: readonly unknown[];
}

/** One native message, as far as this fixture reads it. */
interface NativeMessage {
	readonly role?: unknown;
	readonly stopReason?: unknown;
}

/** The slice of the harness's extension API this fixture uses. */
interface NativeTurnApi {
	on(event: "message_end", handler: (event: unknown) => void): void;
	on(event: "turn_end", handler: (event: NativeTurnEndEvent) => void): void;
}

function nativeMessageOf(event: unknown): NativeMessage | undefined {
	if (event === null || typeof event !== "object" || !("message" in event)) return undefined;
	const message = event.message;
	return message !== null && typeof message === "object" ? message : undefined;
}

/** One observation, on the channel the dock captures: a kind, then `key=value` facts. */
function evidence(kind: string, ...facts: readonly string[]): void {
	process.stderr.write(`[${NATIVE_TURN_OBSERVER_ID}] ${kind}${facts.length === 0 ? "" : ` ${facts.join(" ")}`}\n`);
}

export default function nativeTurnObserver(pi: NativeTurnApi): void {
	pi.on("message_end", event => {
		const message = nativeMessageOf(event);
		if (message?.role !== "assistant") return;
		evidence("message_end", "role=assistant", `stopReason=${String(message.stopReason)}`);
	});
	pi.on("turn_end", event => {
		evidence("turn_end", `index=${String(event.turnIndex)}`, `tools=${String(event.toolResults?.length ?? 0)}`);
	});
}
