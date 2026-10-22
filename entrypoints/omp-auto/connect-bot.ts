/**
 * Thin OMP entrypoint for connect-bot in automatic startup mode.
 *
 * It differs from the manual entrypoint in one fact only — the mode's assembly it re-exports —
 * and both assemble the same definition through the same OMP adapter. Loading this module is
 * what chooses the mode: no command, profile argument or environment value is read to decide it,
 * and the host's normal `-e`/`--extension` parameter is all that loads it.
 *
 * The selected policy states an enabling initial choice. The framework hands that intent to
 * connect-bot's own activation at the process's first owner session start, so a panel register is
 * attempted without `/connect-bot`; the declared value becomes enabled only after a valid
 * register receipt, and the first model request never waits for that attempt.
 *
 * Load this entrypoint instead of `entrypoints/omp/connect-bot.ts`, never both: the loader adds
 * extension sources rather than merging them, so both modes of one extension in one process would
 * bind it twice.
 */
export { default } from "../../extensions/connect-bot/harnesses/omp-auto";
