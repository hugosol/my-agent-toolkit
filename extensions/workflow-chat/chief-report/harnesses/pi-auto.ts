import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { piAdapter, type PiExtensionApi } from "../../../../adapters/pi";
import { CHIEF_REPORT } from "../definition";
import { CHIEF_REPORT_IMPLEMENTATION } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function chiefReportPi(api: PiExtensionApi) {
	return piAdapter(CHIEF_REPORT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: CHIEF_REPORT_IMPLEMENTATION,
	})(api);
}
