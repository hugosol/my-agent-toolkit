// Initialize Node text imports before loading the unchanged shared definition.
import "../../../framework/adapters/pi-text-imports";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { piAdapter } from "../../../framework/adapters/pi";
import type { PiExtensionApi } from "../../../framework/adapters/pi";
import { CODEBASE_TOOLS } from "../definition";

/**
 * The extension repository this module belongs to, from its own location: `harnesses/pi.ts` -> the
 * extension -> `extensions` -> the repository root. The framework resolves an assembly's child entry
 * by absolute path because the loader discovers an extension by one while the process runs in an
 * arbitrary project directory, and this module is the only place that knows the repository.
 */
const EXTENSION_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * This extension on pi.
 *
 * `childEntry` is stated because this extension's field declares `follow`: a session a subagent
 * provider spawns out of process loads this entry to hold its own observations, and stating it is
 * what makes the framework offer the owning session's declared value in this process and read it in
 * that one. An assembly that states no entry declares a host whose sessions are all bindings in one
 * process, and a subagent then reads the declared default.
 */
const bindCodebaseTools = piAdapter(CODEBASE_TOOLS, {
	childEntry: join(EXTENSION_REPOSITORY_ROOT, "entrypoints", "pi", "codebase-tools.ts"),
});

export default function codebaseTools(pi: PiExtensionApi): void {
	bindCodebaseTools(pi);
}
