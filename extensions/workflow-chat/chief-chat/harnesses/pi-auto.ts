import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { piAdapter, type PiExtensionApi, type PiExtensionContext } from "../../../../adapters/pi";
import { CHIEF_CHAT } from "../definition";
import { createChiefImplementation } from "../shared-logic/implementation";

interface ChiefInputApi {
	on(event: "input", handler: (event: { readonly text: string }, ctx: PiExtensionContext) => Promise<{ action: "handled" } | { action: "transform"; text: string } | undefined>): () => void;
}

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function chiefChatPi(api: PiExtensionApi & ChiefInputApi) {
	const chief = createChiefImplementation();
	const binding = piAdapter(CHIEF_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: chief.implementation,
	})(api);
	if (binding.bound) api.on("input", async (event: { readonly text: string }, ctx: PiExtensionContext) => {
		const result = await chief.receive(ctx.sessionManager.getSessionId(), event.text);
		if (!result) return undefined;
		if (result.process) return { action: "transform" as const, text: result.text };
		try { ctx.ui.notify(result.text, "warning"); } catch { /* Feedback failure cannot admit duplicate model processing. */ }
		return { action: "handled" as const };
	});
	return binding;
}
