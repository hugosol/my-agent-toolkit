/**
 * Thin OMP entrypoint for codebase-tools.
 *
 * This is the only codebase-tools file the OMP extension loader discovers: it
 * re-exports the extension's OMP harness assembly and contains no logic. Each
 * extension gets its own entrypoint file in this directory — there is deliberately
 * no aggregating `index.ts`, so the loader never sees a single factory that builds
 * several extensions.
 */
export { default } from "../../extensions/codebase-tools/harnesses/omp";
