import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ompAdapter, type OmpExtensionApi } from "../../../../adapters/omp";
import { MANAGER_CHAT } from "../definition";
import { MANAGER_IMPLEMENTATION } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

// Match the backend report header at the start of the input, not report-like prose or its body.
const reportEnvelope = /^Workflow report\nRun: [A-Za-z0-9-]+\nnode: ([^\r\n]+)\nReport: bc-[0-9a-f]{12}\n\n/;

export default function managerChatOmp(api: OmpExtensionApi) {
	const binding = ompAdapter(MANAGER_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: MANAGER_IMPLEMENTATION,
	})(api);
	if (binding.bound) api.on("input", ({ text }) => {
		if (reportEnvelope.exec(text)?.[1]?.trim()) return { text: `📋 ${text}` };
	});
	return binding;
}
