/**
 * The remaining mixed framework entry: the configuration types whose own cutover has not
 * completed yet.
 *
 * The authoring contract — `defineExtension`, its definition and implementation types — is
 * canonical in `framework/interface`. State, Session, Prompt, Marker, Feedback, Host facts,
 * Subagent and Command each own their declarations and are imported from their own entries; the
 * general HTTP and safe-file modules are published by their own interface entries too. This
 * module re-publishes only what this migration has not moved yet, so that existing consumers keep
 * exactly one temporary path. It will be reduced as the remaining General modules land and removed
 * with the final retirement; no compatibility alias or forwarding module is added.
 *
 * Nothing here names a harness, and no type here is one a harness could add to.
 */
/**
 * The configuration failures shared logic may observe, and the reader a suite drives a file
 * through.
 *
 * They are types and errors, not values this entry hands out: `getConfig`, `readConfig` and the
 * two error classes stay in `framework/core/config.ts`, which shared logic imports directly.
 */
export type { ConfigReader, ConfigSource } from "./core/config";
