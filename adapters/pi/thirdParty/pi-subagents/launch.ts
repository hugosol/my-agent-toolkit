/** pi-subagents launch metadata, not a native Pi prompt contract. */
import type { PiExtensionContext } from "../../internal/native";

/**
 * The `active_agent` element pi-subagents prepends to the system prompt of a session it spawns.
 *
 * It is the provider's own launch metadata for the child it is about, written into that child's
 * prompt before the session starts, so it names the agent definition this actual session runs
 * without consulting a fleet listing, a session display name or a launch order. The element is
 * read only on a line of its own: text that merely mentions the marker inside a larger line is not
 * a launch statement.
 */
const ACTIVE_AGENT_NAME = /^[ \t]*<active_agent\s+name="([^"]*)"\s*\/>[ \t]*$/gm;

/**
 * The agent definition a spawned session's own prompt names, when the prompt carries that marker.
 *
 * A replacing launch puts the marker at the head of the prompt, where the first marker is the
 * provider's; an appending launch puts it in the appended section, after whatever the inherited
 * prompt carried, so the last marker is the provider's. Neither reading consults another session.
 */
export function activeAgentNameOf(ctx: PiExtensionContext, kind: "main" | "sub"): string | undefined {
	if (kind !== "sub") return undefined;
	const prompt = ctx.getSystemPrompt?.();
	if (typeof prompt !== "string") return undefined;
	const matches = [...prompt.matchAll(ACTIVE_AGENT_NAME)];
	if (matches.length === 0) return undefined;
	const match = matches[0].index === 0 ? matches[0] : matches[matches.length - 1];
	// The provider escapes the name for an XML attribute; the definition name is the decoded value,
	// not the serialized attribute text.
	const name = match[1]
		.replace(/&quot;/g, "\"")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.trim();
	return name.length > 0 ? name : undefined;
}

