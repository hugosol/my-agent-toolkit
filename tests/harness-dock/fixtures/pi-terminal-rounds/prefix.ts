/**
 * The dock's own name for the evidence prefix the pi terminal-Round fixture writes.
 *
 * It lives on its own so that the fixture entrypoint and the smoke that drives it state the same
 * prefix without importing each other: the entrypoint is evaluated as an extension inside the run it
 * belongs to, while the driver needs the prefix before any process starts.
 */

/** The prefix every terminal-Round evidence line carries, so the driver reads its own fixture's lines. */
export const PI_TERMINAL_ROUNDS_PREFIX = "pi-terminal-rounds";

/**
 * The environment name through which the driver states the child entry this probe's assembly requires.
 *
 * The probe exists to read the public Round edges of a session whose activity was interrupted or
 * failed, and reading a session's background work belongs to the integration scope an assembly opens
 * by requiring something in the sessions a provider spawns. The driver therefore states the child
 * entry the run's own layout carries, exactly as a production assembly states one, so the probe reads
 * the same integration a real consumer of it would.
 */
export const PI_TERMINAL_ROUNDS_CHILD_ENTRY_ENV = "PI_TERMINAL_ROUNDS_CHILD_ENTRY";
