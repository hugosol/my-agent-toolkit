/**
 * The dock's own name for the evidence prefix the pi background-Round fixture writes.
 *
 * It lives on its own so that the fixture entrypoint and the smoke that drives it state the same
 * prefix without importing each other: the entrypoint is evaluated as an extension inside the run it
 * belongs to, while the driver needs the prefix before any process starts.
 */

/** The prefix every background-Round evidence line carries, so the driver reads its own fixture's lines. */
export const PI_BACKGROUND_ROUNDS_PREFIX = "pi-background-rounds";

/**
 * The environment name through which the driver states the child entry this probe's assembly requires.
 *
 * The probe exists to read the public Round edges of a session that is waiting on a delegation, and
 * that reading is part of an assembly's own integration scope: an entry that requires nothing in the
 * sessions a provider spawns has no such scope, and asks its harness for none of those facts. The
 * driver therefore states the child entry the run's own layout carries, exactly as a production
 * assembly states one, so the probe reads the same integration a real consumer of it would.
 */
export const PI_BACKGROUND_ROUNDS_CHILD_ENTRY_ENV = "PI_BACKGROUND_ROUNDS_CHILD_ENTRY";
