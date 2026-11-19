import type { ToolExecutionResult, ToolParameterSchema } from "../../../../../framework/interface/tool";
import type { BoundTool } from "../../../../../framework/runtime/port";
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import { toolConfirmation } from "../../../../../framework/runtime/tool-confirmation";
import { clipToolOutput } from "../../../../tool-output";
import type { OmpExtensionApi } from "./types";

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const spinnerMs = 120;

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
			renderResult(result, options) {
				const rows = display(result.details);
				return {
					render(width) {
						if (width < 1) return [];
						const status = options.isPartial
							? `${spinnerFrames[Math.floor(Date.now() / spinnerMs) % spinnerFrames.length]} Running…`
							: result.isError ? "✗ Error" : "✓ Finished";
						const output = [clipToolOutput(status, width)];
						if (rows) for (const row of rows) output.push(clipToolOutput(row, width));
						return output;
					},
					invalidate() {},
				};
			},
			describeResult(result) {
				const rows = display(result.details);
				// TSP owns the status; even an empty display must not fall back to model content.
				return { preview: "children", body: rows?.length ? [
					{ k: "code", key: "output", p: { text: rows.map(line => clipToolOutput(line, 120)).join("\n"), numbers: false, wrap: false } },
				] : [] };
			},
		} : {};
		register.call(api, {
			name: tool.name, label: tool.label, description: tool.description, loadMode: "essential",
			parameters: ompToolParameters(tool.parameters),
			...presentation,
			async execute(callId, params, signal, onUpdate, ctx) {
				let partial: ToolExecutionResult | undefined;
				let timer: NodeJS.Timeout | undefined;
				const stop = () => {
					clearInterval(timer);
					signal?.removeEventListener("abort", stop);
				};
				// ANSI custom results bypass OMP's spinner. Repaint the same UI-only snapshot
				// on a presentation clock even if the script never writes or preview stops.
				if (display && ctx.hasUI && onUpdate && !signal?.aborted) {
					timer = setInterval(() => {
						try { onUpdate(partial ??= { content: [] }); }
						catch { stop(); } // A closed presentation transport must not affect execution.
					}, spinnerMs);
					signal?.addEventListener("abort", stop, { once: true });
				}
				try {
					return await tool.execute(params, defineAdapterDelivery("tool", {
						callId, sessionId: ctx.sessionManager.getSessionId(), ...(signal === undefined ? {} : { signal }),
						...(onUpdate === undefined ? {} : { onUpdate: (details: unknown) => onUpdate(partial = { content: [], details }) }),
						confirm: toolConfirmation(
							ctx.hasUI && typeof ctx.ui.confirm === "function" ? ctx.ui.confirm.bind(ctx.ui) : undefined,
							signal,
							(active, label) => api.events?.emit?.("herdr:blocked", { active, label }),
						),
					}));
				} finally { stop(); }
			},
		});
	};
}
