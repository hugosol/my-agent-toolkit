import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { piAdapter, type PiExtensionApi } from "../../../../adapters/pi";
import { MANAGER_CHAT } from "../definition";
import { MANAGER_IMPLEMENTATION } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function managerChatPi(api: PiExtensionApi) {
	return piAdapter(MANAGER_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: MANAGER_IMPLEMENTATION,
	})(api);
}
