import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { piAdapter, type PiExtensionApi } from "../../../../adapters/pi";
import { CHIEF_CHAT } from "../definition";
import { CHIEF_IMPLEMENTATION } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function chiefChatPi(api: PiExtensionApi) {
	return piAdapter(CHIEF_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: CHIEF_IMPLEMENTATION,
	})(api);
}
