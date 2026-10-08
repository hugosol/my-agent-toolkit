/**
 * Thin OMP entrypoint for connect-bot.
 *
 * This is the only connect-bot file the OMP extension loader discovers: it re-exports the
 * extension's OMP harness assembly and holds nothing else. Each extension gets its own
 * entrypoint file in this directory — there is deliberately no aggregating `index.ts`, so the
 * loader never sees a single factory that builds several extensions.
 */
export { default } from "../../extensions/connect-bot/harnesses/omp";
