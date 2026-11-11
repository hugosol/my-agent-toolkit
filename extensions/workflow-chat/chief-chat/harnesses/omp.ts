import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ompAdapter, type OmpExtensionApi } from "../../../../adapters/omp";
import { CHIEF_CHAT } from "../definition";
import { CHIEF_IMPLEMENTATION } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function chiefChatOmp(api: OmpExtensionApi) {
	return ompAdapter(CHIEF_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: CHIEF_IMPLEMENTATION,
	})(api);
}
