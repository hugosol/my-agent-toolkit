import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ompAdapter, type OmpExtensionApi } from "../../../../adapters/omp";
import { MANAGER_CHAT } from "../definition";
import { MANAGER_IMPLEMENTATION } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function managerChatOmp(api: OmpExtensionApi) {
	return ompAdapter(MANAGER_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: MANAGER_IMPLEMENTATION,
	})(api);
}
