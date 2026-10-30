import type { ToolParameterSchema } from "../../../../../framework/interface/tool";
import type { BoundTool } from "../../../../../framework/runtime/port";
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import type { OmpExtensionApi } from "./types";

/** OMP repairs scalar types and closed objects. Business guards must see invalid values and extra keys. */
export function ompToolParameters(schema: ToolParameterSchema): unknown {
	const description = schema.description === undefined ? {} : { description: schema.description };
	if ("anyOf" in schema) return { ...description, anyOf: schema.anyOf.map(ompToolParameters) };
	if (schema.type === "object") return {
		...description, type: "object",
		properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, ompToolParameters(value)])),
		...(schema.required === undefined ? {} : { required: [...schema.required] }),
		additionalProperties: true,
	};
	return { ...description, ...(schema.type === "string" && schema.enum !== undefined ? { enum: [...schema.enum] } : {}) };
}

export function registerOmpTool(api: OmpExtensionApi): (tool: BoundTool) => void {
	const register = api.registerTool;
	return tool => register.call(api, {
		name: tool.name, label: tool.label, description: tool.description, loadMode: "essential",
		parameters: ompToolParameters(tool.parameters),
		async execute(callId, params, signal, _onUpdate, ctx) {
			const result = await tool.execute(params, defineAdapterDelivery("tool", { callId, sessionId: ctx.sessionManager.getSessionId(), ...(signal === undefined ? {} : { signal }) }));
			return result;
		},
	});
}
