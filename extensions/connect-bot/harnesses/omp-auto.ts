/**
 * connect-bot's automatic startup mode OMP assembly.
 *
 * The mode is this module's only content: it builds the shared OMP assembly against the
 * automatic mode's policy document, and the thin entrypoint
 * `entrypoints/omp-auto/connect-bot.ts` re-exports this default. Loading the entrypoint is
 * therefore what selects automatic mode — no host profile parameter and no environment override
 * participates — and the definition, adapter assembly and every behavior are the manual mode's.
 */
import { connectBotOmp } from "./omp-assembly";
import { AUTOMATIC_STARTUP_POLICY } from "./startup-modes";

export default connectBotOmp(AUTOMATIC_STARTUP_POLICY);
