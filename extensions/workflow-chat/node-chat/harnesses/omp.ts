import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ompAdapter, type OmpExtensionApi } from "../../../../adapters/omp";
import { NODE_CHAT } from "../definition";
import { NODE_IMPLEMENTATION } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function nodeChatOmp(api: OmpExtensionApi) {
	return ompAdapter(NODE_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: NODE_IMPLEMENTATION,
	})(api);
}
