/**
 * Non-model diagnostics for extension-owned background failures.
 * Writes a line to stderr, never to a conversation or tool result. Callers must omit
 * credentials and other sensitive values from the message.
 */
export * from "../../core/diagnostics";
