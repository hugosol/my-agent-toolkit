/**
 * Thin pi entrypoint for codebase-tools in manual mode.
 *
 * This is the only codebase-tools file pi's extension loader discovers for this mode: it
 * re-exports the extension's manual-mode pi assembly and holds nothing else, so the loaded
 * entrypoint — not a host parameter — is what states the mode. The assembly owns the native
 * mapping, the declared configuration and the child entry a subagent provider loads. Each
 * extension gets its own entrypoint file in this directory — there is deliberately no aggregating
 * `index.ts`, so the loader never sees a single factory that builds several extensions.
 *
 * The automatic startup mode's entrypoint is `entrypoints/pi-auto/codebase-tools.ts`; load one
 * of the two for this extension, never both (the loader adds sources rather than merging them).
 */
export { default } from "../../extensions/codebase-tools/harnesses/pi";
