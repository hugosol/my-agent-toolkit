/**
 * Thin OMP entrypoint for connect-bot in manual mode.
 *
 * This is the connect-bot file the manual discovery root (`entrypoints/omp`) contains: it
 * re-exports the extension's manual-mode OMP assembly and holds nothing else, so the loaded
 * entrypoint — not a host parameter — is what states the mode. Each extension gets its own
 * entrypoint file in this directory — there is deliberately no aggregating `index.ts`, so the
 * loader never sees a single factory that builds several extensions.
 *
 * Load this entrypoint instead of `entrypoints/omp-auto/connect-bot.ts`, never both: the loader
 * adds extension sources rather than merging them, so both modes of one extension in one process
 * would bind it twice.
 */
export { default } from "../../extensions/connect-bot/harnesses/omp";
