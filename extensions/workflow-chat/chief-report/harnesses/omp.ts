import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ompAdapter, type OmpExtensionApi } from "../../../../adapters/omp";
import { CHIEF_REPORT } from "../definition";
import { CHIEF_REPORT_IMPLEMENTATION } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function chiefReportOmp(api: OmpExtensionApi) {
	return ompAdapter(CHIEF_REPORT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: CHIEF_REPORT_IMPLEMENTATION,
	})(api);
}
