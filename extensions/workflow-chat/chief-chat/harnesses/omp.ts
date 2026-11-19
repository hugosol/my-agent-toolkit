import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ompAdapter, type OmpExtensionApi } from "../../../../adapters/omp";
import { CHIEF_CHAT } from "../definition";
import { createChiefImplementation } from "../shared-logic/implementation";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function chiefChatOmp(api: OmpExtensionApi) {
	const chief = createChiefImplementation();
	const binding = ompAdapter(CHIEF_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: chief.implementation,
	})(api);
	if (binding.bound) api.on("input", async (event, ctx) => {
		const result = await chief.receive(ctx.sessionManager.getSessionId(), event.text);
		if (!result) return undefined;
		if (result.process) return { text: result.text };
		try { ctx.ui.notify(result.text, "warning"); } catch { /* Feedback failure cannot admit duplicate model processing. */ }
		return { handled: true };
	});
	return binding;
}
