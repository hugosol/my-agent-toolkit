import type { ToolParameterSchema } from "../../../../../framework/interface/tool";
import type { BoundTool } from "../../../../../framework/runtime/port";
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import { toolConfirmation } from "../../../../../framework/runtime/tool-confirmation";
import { clipToolOutput, toolBusinessText, toolOutputComponent } from "../../../../tool-output";
import type { OmpExtensionApi } from "./types";

/** OMP repairs scalar types and closed objects. Business guards must see invalid values and extra keys. */
export function ompToolParameters(schema: ToolParameterSchema): unknown {
	const description = schema.description === undefined ? {} : { description: schema.description };
	if ("anyOf" in schema) return { ...description, anyOf: schema.anyOf.map(ompToolParameters) };
	// The singleton type union has the same JSON Schema meaning, but avoids OMP's
	// optional-null repair. Invalid explicit values must reach the business guard.
	if (schema.type === "object" && schema.additionalProperties === true && Object.keys(schema.properties).length === 0) return description;
	if (schema.type === "object") return {
		...description, type: ["object"],
		properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, ompToolParameters(value)])),
		...(schema.required === undefined ? {} : { required: [...schema.required] }),
		additionalProperties: true,
	};
	return { ...description, ...(schema.type === "string" && schema.enum !== undefined ? { enum: [...schema.enum] } : {}) };
}

export function registerOmpTool(api: OmpExtensionApi): (tool: BoundTool) => void {
	const register = api.registerTool;
	return tool => {
		const display = tool.displayOutput;
		const presentation: Pick<Parameters<typeof register>[0], "renderResult" | "describeResult"> = display ? {
			renderResult: (result, options) => toolOutputComponent(display(result.details), result, options),
			describeResult(result, options) {
				const rows = display(result.details);
				if (!rows?.length) return undefined;
				const business = toolBusinessText(result);
				return { preview: "children", body: [
					{ k: "code", key: "output", p: { text: rows.map(line => clipToolOutput(line, 120)).join("\n"), numbers: false, wrap: false } },
					...(business ? [{ k: "code" as const, key: "result", p: { text: business, numbers: false as const, wrap: true, ...(options.expanded ? {} : { preview: { lines: 8 } }) } }] : []),
				] };
			},
		} : {};
		register.call(api, {
			name: tool.name, label: tool.label, description: tool.description, loadMode: "essential",
			parameters: ompToolParameters(tool.parameters),
			...presentation,
			async execute(callId, params, signal, onUpdate, ctx) {
				const result = await tool.execute(params, defineAdapterDelivery("tool", {
					callId, sessionId: ctx.sessionManager.getSessionId(), ...(signal === undefined ? {} : { signal }),
					...(onUpdate === undefined ? {} : { onUpdate: (details: unknown) => onUpdate({ content: [], details }) }),
					confirm: toolConfirmation(
						ctx.hasUI && typeof ctx.ui.confirm === "function" ? ctx.ui.confirm.bind(ctx.ui) : undefined,
						signal,
						(active, label) => api.events?.emit?.("herdr:blocked", { active, label }),
					),
				}));
				return result;
			},
		});
	};
}
