import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ompAdapter, type OmpExtensionApi, type OmpSessionContext } from "../../../adapters/omp";
import { defineImplementation } from "../../../framework/interface";
import { WorkflowRequests } from "../common/requests";
import { NODE_CHAT } from "../node-definition";

interface ReportResult {
	readonly content: { readonly type: "text"; readonly text: string }[];
	readonly details: { readonly httpStatus?: number; readonly body: unknown };
	readonly isError: boolean;
}

/** Only the native tool surface used here; the loader supplies its own schema builder. */
interface NodeToolApi extends OmpExtensionApi {
	readonly typebox: { readonly Type: {
		String(): unknown;
		Object(properties: Readonly<Record<string, unknown>>, options: { additionalProperties: boolean }): unknown;
	} };
	registerTool(tool: {
		name: string; label: string; description: string; parameters: unknown; loadMode: "essential";
		execute(callId: string, params: unknown, signal: AbortSignal | undefined, onUpdate: unknown, ctx: OmpSessionContext): Promise<ReportResult>;
	}): void;
}

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export default function nodeChatOmp(api: OmpExtensionApi) {
	let requests: WorkflowRequests | undefined;
	const binding = ompAdapter(NODE_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: defineImplementation({
			create: context => (requests = new WorkflowRequests(context)),
			subscriptions: [{ scope: "session", events: {
				session_start: (state, delivery) => state.start(delivery.session.sessionId),
				session_end: (state, delivery) => state.end(delivery.session.sessionId),
			} }],
			cleanup: state => state.close(),
		}),
	})(api);
	if (!binding.bound) return binding;
	const native = api as NodeToolApi;
	native.registerTool({
		name: "report", label: "Report", loadMode: "essential",
		description: "提交节点可交接结果正文；分别返回保存、辅助通知和诊断结果。报告不等于节点完成。",
		parameters: native.typebox.Type.Object({ body: native.typebox.Type.String() }, { additionalProperties: false }),
		async execute(_callId, params, signal, _onUpdate, ctx) {
			if (!params || typeof params !== "object" || !("body" in params) || typeof params.body !== "string" || Object.keys(params).some(key => key !== "body")) {
				return { content: [{ type: "text", text: "report 只接受字符串 body，不接受身份或归属字段。" }], details: { body: null }, isError: true };
			}
			if (!requests) throw new Error("node-chat 未初始化");
			const result = await requests.post(ctx.sessionManager.getSessionId(), "/api/workflow/node/report", { body: params.body }, signal);
			const savedFailed = typeof result.body === "object" && result.body !== null && "saved" in result.body && result.body.saved === false;
			return { content: [{ type: "text", text: JSON.stringify(result.body) }], details: { httpStatus: result.httpStatus, body: result.body }, isError: result.isError || savedFailed };
		},
	});
	return binding;
}
