/**
 * The dock's own name for the evidence prefix the pi session-facts fixture writes.
 *
 * It lives on its own so that the fixture entrypoint and the smoke that drives it state the same
 * prefix without importing each other: the entrypoint is evaluated as an extension inside the run it
 * belongs to, while the driver needs the prefix before any process starts.
 */

/** The prefix every session-facts evidence line carries, so the driver reads its own fixture's lines. */
export const PI_SESSION_FACTS_PREFIX = "pi-session-facts";
