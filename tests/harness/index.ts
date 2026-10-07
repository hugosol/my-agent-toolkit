/**
 * Verification harness for the fixed agent-runtime baseline.
 *
 * Consumers (the framework and extension suites, the upgrade script) import from this
 * entry point only: baseline record + isolated install, isolated environment, controlled
 * session driver, session JSONL read-back and outbound request capture.
 *
 * The driving techniques are the ones proven by the decision-03 probes
 * (`.scratch/codebase-tools-omp-v1/assets/03/probes/`): RPC-mode session driving, a local
 * OpenAI-compatible capture endpoint, and a provider-registration override that keeps the
 * run credential-free.
 */
export * from "./agent-config";
export * from "./baseline";
export * from "./capture-server";
export * from "./env";
export * from "./run-root";
export * from "./session";
export * from "./session-log";
