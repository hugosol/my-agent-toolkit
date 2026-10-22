/**
 * Thin OMP entrypoint for codebase-tools in automatic startup mode.
 *
 * It differs from the manual entrypoint in one fact only — the mode's assembly it re-exports —
 * and both assemble the same definition through the same OMP adapter. Loading this module is
 * what chooses the mode: no command, profile argument or environment value is read to decide it,
 * and the host's normal `-e`/`--extension` parameter is all that loads it.
 *
 * Load this entrypoint instead of `entrypoints/omp/codebase-tools.ts`, never both: the loader
 * adds extension sources rather than merging them, so both modes of one extension in one
 * process would bind it twice.
 */
export { default } from "../../extensions/codebase-tools/harnesses/omp-auto";
