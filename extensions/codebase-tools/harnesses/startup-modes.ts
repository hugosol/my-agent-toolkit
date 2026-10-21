/**
 * The two startup modes' deployment facts, as this extension's assemblies name them.
 *
 * A mode is selected by which entrypoint the host loads, and that entrypoint re-exports a
 * harness assembly; the assembly states the mode by naming two facts, both of which belong to
 * this repository's layout rather than to the extension's behavior:
 *
 * - the startup policy document the mode selected, which the framework reads at binding and
 *   applies at the process's first owner session start;
 * - on pi, the entry a subagent provider loads into the sessions it spawns, which is the mode's
 *   own entrypoint so a spawned session is assembled exactly as its parent's process was.
 *
 * Both are absolute, derived from this module's own location: the loader discovers an extension
 * by absolute path while the process runs in an arbitrary project directory, so a path relative
 * to the working directory would select the wrong document. This is the only module that knows
 * where the two documents live; the definitions, shared logic and adapters name neither.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The repository this extension belongs to: `harnesses/startup-modes.ts` -> `harnesses` ->
 * the extension -> `extensions` -> the repository root.
 */
const EXTENSION_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The manual mode's policy document, selected by every manual entrypoint. */
export const MANUAL_STARTUP_POLICY = join(EXTENSION_REPOSITORY_ROOT, "entrypoints", "startup", "manual.yaml");

/** The automatic startup mode's policy document, selected by every automatic entrypoint. */
export const AUTOMATIC_STARTUP_POLICY = join(EXTENSION_REPOSITORY_ROOT, "entrypoints", "startup", "auto.yaml");

/** The pi entrypoint a subagent provider loads for a session spawned from manual mode. */
export const MANUAL_PI_CHILD_ENTRY = join(EXTENSION_REPOSITORY_ROOT, "entrypoints", "pi", "codebase-tools.ts");

/** The pi entrypoint a subagent provider loads for a session spawned from automatic mode. */
export const AUTOMATIC_PI_CHILD_ENTRY = join(
	EXTENSION_REPOSITORY_ROOT,
	"entrypoints",
	"pi-auto",
	"codebase-tools.ts",
);
