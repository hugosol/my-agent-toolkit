/**
 * Verification dock for the locally selected installed OMP host.
 *
 * Consumers share the installed CLI resolver, historical baseline evidence readers,
 * isolated environment, controlled
 * session driver, session JSONL read-back and outbound request capture.
 *
 * The dock drives sessions in RPC mode, captures outbound requests at a local
 * OpenAI-compatible endpoint, and registers a provider override so verification
 * does not require a real provider credential.
 */
export * from "./agent-config";
export * from "./baseline";
export * from "./installed-omp";
export * from "./capture-server";
export * from "./env";
export * from "./run-root";
export * from "./session";
export * from "./session-log";
