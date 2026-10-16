/**
 * The dock's own name for the configuration root one pi model-cost run binds the production assembly
 * to.
 *
 * It lives on its own so that the fixture entrypoint and the smoke that drives it state the same name
 * without importing each other: the entrypoint is evaluated as the extension under test (and therefore
 * only inside the run it belongs to), while the driver needs the name before any process starts.
 */

/** The environment variable that carries the configuration root a fixture binding resolves against. */
export const PI_MODEL_COST_CONFIG_ROOT_ENV = "PI_MODEL_COST_CONFIG_ROOT";
