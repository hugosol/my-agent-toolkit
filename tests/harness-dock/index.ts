/**
 * Verification dock for the fixed harness baseline.
 *
 * Consumers (the framework and extension suites, the upgrade script) import from this
 * entry point only: baseline record + isolated install, isolated environment, controlled
 * session driver, session JSONL read-back and outbound request capture.
 *
 * The dock drives sessions in RPC mode, captures outbound requests at a local
 * OpenAI-compatible endpoint, and registers a provider override so verification
 * does not require a real provider credential.
 */
export * from "./agent-config";
export * from "./baseline";
export * from "./capture-server";
export * from "./env";
export * from "./run-root";
export * from "./session";
export * from "./session-log";
