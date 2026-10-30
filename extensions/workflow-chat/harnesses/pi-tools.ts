import type { PiExtensionApi, PiExtensionContext } from "../../../adapters/pi";
import type { WorkflowResponse } from "../common/requests";

export interface WorkflowToolResult {
	readonly content: { readonly type: "text"; readonly text: string }[];
	readonly details: { readonly httpStatus?: number; readonly body: unknown };
	readonly isError: boolean;
}

/** The loader supplies Pi's native tools; no OMP schema or load-mode API participates. */
export interface WorkflowPiApi extends PiExtensionApi {
	registerTool(tool: {
		name: string; label: string; description: string; parameters: unknown;
		execute(callId: string, params: unknown, signal: AbortSignal | undefined, onUpdate: unknown, ctx: PiExtensionContext): Promise<WorkflowToolResult>;
	}): void;
}

export function toolResult(result: WorkflowResponse & { readonly message?: string }) {
	return {
		content: [{ type: "text" as const, text: result.message ?? JSON.stringify(result.body) }],
		details: { httpStatus: result.httpStatus, body: result.body },
		isError: result.isError,
	};
}
