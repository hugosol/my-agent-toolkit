/**
 * Thin pi entrypoint for codebase-tools in automatic startup mode.
 *
 * It differs from the manual entrypoint in one fact only — the mode's assembly it re-exports —
 * and both assemble the same definition through the same pi adapter. Loading this module is what
 * chooses the mode: no command, profile argument or environment value is read to decide it, and
 * pi's normal `-e`/`--extension` parameter is all that loads it. The assembly also states the
 * child entry a subagent provider loads, so a spawned session is assembled against this same
 * mode's policy and keeps following its owner's value.
 *
 * Load this entrypoint instead of `entrypoints/pi/codebase-tools.ts`, never both: the loader
 * adds extension sources rather than merging them, so both modes of one extension in one
 * process would bind it twice.
 */
export { default } from "../../extensions/codebase-tools/harnesses/pi-auto";
