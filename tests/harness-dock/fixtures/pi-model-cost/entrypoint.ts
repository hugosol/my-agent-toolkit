/**
 * Dock fixture: the production model-cost pi assembly bound to a configuration root this run names.
 *
 * It exists so a controlled run can exercise the extension's declared configuration — the field's
 * absolute, relative and `~/` values, and a configuration the definition refuses — on the real host,
 * without touching the shipped `extensions/model-cost/config.yaml`. Nothing of the extension is
 * restated here: this file binds the production assembly to the root in
 * {@link PI_MODEL_COST_CONFIG_ROOT_ENV}, and the runtime, the definition and the frontend are the
 * extension's own.
 *
 * The environment name is what makes the root the *run's*: the dock writes one throwaway repository
 * layout per case and states it here, so two runs never share a configuration by accident.
 */
import { modelCostPiHarness } from "../../../../extensions/model-cost/harnesses/pi";
import { PI_MODEL_COST_CONFIG_ROOT_ENV } from "./env";

const root = process.env[PI_MODEL_COST_CONFIG_ROOT_ENV];
if (root === undefined || root.trim().length === 0) {
	throw new Error(`${PI_MODEL_COST_CONFIG_ROOT_ENV} is required by the dock's pi model-cost fixture`);
}

export default modelCostPiHarness(root);
