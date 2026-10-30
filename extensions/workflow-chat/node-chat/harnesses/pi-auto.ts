import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { piAdapter, type PiExtensionApi } from "../../../../adapters/pi";
import { NODE_CHAT } from "../definition";
import { NODE_IMPLEMENTATION } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function nodeChatPi(api: PiExtensionApi) {
	return piAdapter(NODE_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: NODE_IMPLEMENTATION,
	})(api);
}
