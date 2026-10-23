/**
 * The two startup modes' deployment facts, as connect-bot's harness assemblies name them.
 *
 * A mode is selected by which entrypoint the host loads, and that entrypoint re-exports a harness
 * assembly; the assembly states the mode by naming the startup policy document its entrypoint
 * selected. Both facts belong to this repository's layout rather than to the extension's
 * behavior.
 *
 * The paths are absolute, derived from this module's own location: the loader discovers an
 * extension by absolute path while the process runs in an arbitrary project directory, so a path
 * relative to the working directory would select the wrong document. This is the only
 * connect-bot module that knows where the two documents live; the definition, shared logic and
 * harness assemblies name neither.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The repository this extension belongs to: `harnesses/startup-modes.ts` -> `harnesses` ->
 * the extension -> `extensions` -> the repository root.
 *
 * Each harness assembly states it as the configuration base directory too, because the framework
 * resolves `extensions/connect-bot/config.yaml` against it wherever the process was started.
 */
export const EXTENSION_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The manual mode's policy document, selected by every manual entrypoint. */
export const MANUAL_STARTUP_POLICY = join(EXTENSION_REPOSITORY_ROOT, "entrypoints", "startup", "manual.yaml");

/** The automatic startup mode's policy document, selected by every automatic entrypoint. */
export const AUTOMATIC_STARTUP_POLICY = join(EXTENSION_REPOSITORY_ROOT, "entrypoints", "startup", "auto.yaml");
