import { defineImplementation } from "../../../../framework/interface";
import { WorkflowRequests } from "../../common/requests";
import { isChiefReport } from "../../common/chief-report";
import { CHIEF_TOOLS } from "./tools";

interface ChiefState { readonly requests: WorkflowRequests; }

/** One binding owns its live Session resources; no startup scan or replay queue. */
export function createChiefImplementation() {
	let requests: WorkflowRequests | undefined;
	return {
		implementation: defineImplementation<ChiefState>({
			create: context => {
				requests = new WorkflowRequests(context);
				return { requests };
			},
			subscriptions: [{ scope: "owner", events: {
				session_start: (state, delivery) => state.requests.start(delivery.session.sessionId),
				session_end: (state, delivery) => state.requests.end(delivery.session.sessionId),
			} }],
			tools: CHIEF_TOOLS,
			cleanup: state => state.requests.close(),
		}),
		/** Native admission awaits this before any model request. Backend content is
		 * authoritative; notification text never grants receipt or process rights. */
		async receive(sessionId: string, text: string) {
			const match = /^Chief report\r?\nReport: ([^\r\n]+)\r?\n/.exec(text);
			if (!match) return undefined;
			const id = match[1]!;
			const refused = (message: string) => ({ process: false as const, text: message });
			if (!requests) return refused("chief 报告接收不可用；未处理，不自动重试。请在当前 chief 明确要求查看原报告。");
			// Installed OMP has a 30s input-handler budget (Pi awaits directly). End
			// shared admission within 20s (or the smaller configured HTTP budget), so a
			// timeout cannot fall through to unacknowledged model processing.
			const result = await requests.post(sessionId, `/api/chief/reports/${encodeURIComponent(id)}/receive`, {}, AbortSignal.timeout(20_000));
			if (result.isError) return refused(`chief 报告未取得可靠接收授权，不处理、不自动重试；外部已提交效果不因此撤销。${JSON.stringify(result.body)}`);
			const body = result.body;
			if (!body || typeof body !== "object" || !("received" in body) || body.received !== true
				|| !("process" in body) || typeof body.process !== "boolean"
				|| !("receipt" in body) || !body.receipt || typeof body.receipt !== "object"
				|| !("reportId" in body.receipt) || body.receipt.reportId !== id
				|| !("sessionId" in body.receipt) || typeof body.receipt.sessionId !== "string" || !body.receipt.sessionId.trim()
				|| !("claimId" in body.receipt) || typeof body.receipt.claimId !== "string" || !body.receipt.claimId.trim()
				|| !("at" in body.receipt) || typeof body.receipt.at !== "number" || !Number.isFinite(body.receipt.at)
				|| (body.process && body.receipt.sessionId !== sessionId)
				|| !("report" in body) || !isChiefReport(body.report) || body.report.id !== id) {
				return refused("chief 报告接收响应无有效持久确认；结果不确定，不处理、不重试。用户可在当前 chief 明确要求查看原报告。");
			}
			if (!body.process) return refused(`报告 ${id} 已可靠接收；未再次触发模型处理。不表示已呈现、用户已读或验收。呈现中断时，请在当前 chief 明确要求查看原报告。`);
			return { process: true as const, text: `Chief report（后端已持久接收，仅授权本次处理；不是已呈现、已读或验收）\nReport: ${id}\n\n${JSON.stringify(body.report, null, 2)}` };
		},
	};
}
