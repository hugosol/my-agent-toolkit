/**
 * The extension's Markdown prompt resources, loaded as text at module load.
 *
 * Each resource is its own file, imported independently: the routing text is a
 * compile-time constant with no runtime IO, and loading it here keeps it separate
 * from the agent runtime's own prompt/capability discovery.
 */
import init from "./prompts/init.md" with { type: "text" };
import reminder from "./prompts/reminder.md" with { type: "text" };

/** Full routing prompt, injected once per session when the extension is enabled. */
export const INIT_PROMPT = init;
/** Short pointer injected on every enabled turn after the init prompt. */
export const REMINDER_PROMPT = reminder;
