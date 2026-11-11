import type { ImplementationContext } from "../../../framework/interface";
import type { ToolExecutionDelivery } from "../../../framework/interface/tool";
import { request } from "../../../framework/interface/general/http";

export interface WorkflowResponse {
	readonly httpStatus?: number;
	readonly body: unknown;
	readonly isError: boolean;
	/** Local evidence only; never inferred from an HTTP response body. */
	readonly notSent?: true;
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

	get reportConfirmationTimeoutMs(): number { return Number(this.#context.config.reportConfirmationTimeoutMs); }

	/** Keep a pending interaction tied to the same actual Session as its HTTP request. */
	interactionSignal(sessionId: string, signal?: AbortSignal): AbortSignal {
		const lifetime = this.#sessions.get(sessionId)?.signal ?? AbortSignal.abort(new Error("Session unavailable"));
		return signal ? AbortSignal.any([signal, lifetime]) : lifetime;
	}

	/** Freeze identity and payload together; no observation or caller mutation can change an approval. */
	#prepare(sessionId: string, params: Readonly<Record<string, unknown>>, signal?: AbortSignal) {
		const observation = this.#context.session.observations.read(sessionId);
		const lifetime = this.#sessions.get(sessionId);
		if (!observation?.session?.sessionId || !lifetime) return undefined;
		return {
			body: JSON.stringify({ ...params, sessionId: observation.session.sessionId }),
			signal: signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal,
		};
	}

	/** Full wire preview and one native approval, tied to the same active Session as the send. */
	async postConfirmed(sessionId: string, route: string, params: Readonly<Record<string, unknown>>, preview: {
		readonly title: string;
		readonly message: string;
	}, signal?: AbortSignal, confirm?: ToolExecutionDelivery["confirm"]): Promise<WorkflowResponse> {
		const prepared = this.#prepare(sessionId, params, signal);
		const notSent = (reason: string): WorkflowResponse => ({ isError: false, notSent: true, body: {
			sent: false, reason,
			guidance: "请求未发送。结束本轮，等待用户重新要求执行；不要自动重试、补发、反复询问或绕过原生确认。",
		} });
		if (!prepared || prepared.signal.aborted || !confirm) return notSent("confirmation-unavailable");
		let approved = false;
		try {
			approved = await confirm({
				...preview,
				message: `${preview.message}\n\n完整 HTTP JSON 载荷：\n${JSON.stringify(JSON.parse(prepared.body), null, 2)}\n\n只有明确选择“是”才会发送。`,
				timeoutMs: this.reportConfirmationTimeoutMs,
				signal: prepared.signal,
			}) === true;
		} catch { /* Failed or unavailable native interaction never grants approval. */ }
		if (!approved || prepared.signal.aborted) return notSent("confirmation-not-approved");
		return this.#request(route, prepared, "POST");
	}

	async post(selectedSessionId: string, route: string, params: Readonly<Record<string, unknown>>, signal?: AbortSignal, collect = false): Promise<WorkflowResponse> {
		const prepared = this.#prepare(selectedSessionId, params, signal);
		if (!prepared) return { isError: true, body: { error: { kind: "session-unavailable", message: "公共 Session 未提供活动原生身份；未发送请求。" } } };
		return this.#request(route, prepared, "POST", collect);
	}

	async get(sessionId: string, route: string, signal?: AbortSignal): Promise<WorkflowResponse> {
		const prepared = this.#prepare(sessionId, {}, signal);
		if (!prepared) return { isError: true, body: { error: { kind: "session-unavailable", message: "公共 Session 未提供活动原生身份；未发送请求。" } } };
		return this.#request(route, { signal: prepared.signal }, "GET");
	}

	async #request(route: string, prepared: { readonly body?: string; readonly signal: AbortSignal }, method: "GET" | "POST", collect = false): Promise<WorkflowResponse> {
		const config = this.#context.config;
		const result = await request(`${String(config.endpoint).replace(/\/$/, "")}${route}`, {
			...prepared,
			method, headers: method === "POST" ? { "content-type": "application/json" } : undefined,
			timeoutMs: Number(collect ? config.collectTimeoutMs : config.requestTimeoutMs),
		});
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
