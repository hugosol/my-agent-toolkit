import type { ToolParameterSchema } from "../../../../../framework/interface/tool";
import type { BoundTool } from "../../../../../framework/runtime/port";
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import type { PiExtensionApi } from "./types";

/** Pi coerces typed scalar/array values. Leave those raw for the shared business guards. */
export function piToolParameters(schema: ToolParameterSchema): unknown {
	const description = schema.description === undefined ? {} : { description: schema.description };
	if ("anyOf" in schema) return { ...description, anyOf: schema.anyOf.map(piToolParameters) };
	if (schema.type === "object") return {
		...description, type: "object",
		properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, piToolParameters(value)])),
		...(schema.required === undefined ? {} : { required: [...schema.required] }),
		additionalProperties: true,
	};
	// Enum checks do not coerce without a type. Other values must reach business validation unchanged.
	return { ...description, ...(schema.type === "string" && schema.enum !== undefined ? { enum: [...schema.enum] } : {}) };
}

export function registerPiTool(pi: PiExtensionApi): (tool: BoundTool) => void {
	const register = pi.registerTool;
	return tool => register.call(pi, {
		name: tool.name, label: tool.label, description: tool.description,
		parameters: piToolParameters(tool.parameters),
		async execute(callId, params, signal, _onUpdate, ctx) {
			const result = await tool.execute(params, defineAdapterDelivery("tool", { callId, sessionId: ctx.sessionManager.getSessionId(), ...(signal === undefined ? {} : { signal }) }));
			return result;
		},
	});
}
