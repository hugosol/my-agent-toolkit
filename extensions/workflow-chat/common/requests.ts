import type { ImplementationContext } from "../../../framework/interface";
import { request } from "../../../framework/interface/general/http";

export interface WorkflowResponse {
	readonly httpStatus?: number;
	readonly body: unknown;
	readonly isError: boolean;
}

/** Business-neutral request resources, held per actual Session, never per Owner or role globally. */
export class WorkflowRequests {
	readonly #context: ImplementationContext;
	readonly #sessions = new Map<string, AbortController>();

	constructor(context: ImplementationContext) { this.#context = context; }

	start(sessionId: string) {
		if (!this.#sessions.has(sessionId)) this.#sessions.set(sessionId, new AbortController());
	}

	end(sessionId: string) {
		this.#sessions.get(sessionId)?.abort(new Error("Session ended"));
		this.#sessions.delete(sessionId);
	}

	close() {
		for (const controller of this.#sessions.values()) controller.abort(new Error("Session ended"));
		this.#sessions.clear();
	}

	async post(selectedSessionId: string, route: string, params: Readonly<Record<string, unknown>>, signal?: AbortSignal, collect = false): Promise<WorkflowResponse> {
		// Native context selects an observation; the public Session reading supplies the wire identity.
		const observation = this.#context.session.observations.read(selectedSessionId);
		const lifetime = this.#sessions.get(selectedSessionId);
		if (!observation?.session?.sessionId || !lifetime) {
			return { isError: true, body: { error: { kind: "session-unavailable", message: "公共 Session 未提供活动原生身份；未发送请求。" } } };
		}
		const config = this.#context.config;
		const options = {
			method: "POST", headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...params, sessionId: observation.session.sessionId }),
			timeoutMs: Number(collect ? config.collectTimeoutMs : config.requestTimeoutMs),
			signal: signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal,
		};
		const result = await request(`${String(config.endpoint).replace(/\/$/, "")}${route}`, options);
		if (!result.ok) {
			return { isError: true, body: {
				error: { kind: result.failure.kind, message: result.failure.error.message },
				guidance: "请求未获得确定结果；后端可能已接受，不表示回滚或未生效。不要自动重试，请核实已保存事实。",
			} };
		}
		const text = await result.response.text();
		try {
			return { httpStatus: result.response.status, isError: !result.response.ok, body: JSON.parse(text) };
		} catch {
			return { httpStatus: result.response.status, isError: true, body: {
				error: { kind: "parse", message: "后端响应不是完整合法 JSON。", body: text },
				guidance: "无法确定动作结果；不表示回滚，不自动重试。",
			} };
		}
	}
}
