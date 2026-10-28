import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, ensureIsolatedHarness } from "../../harness-dock/baseline";
import { type CaptureServer, startCaptureServer } from "../../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../../harness-dock/run-root";
import { ControlledSession } from "../../harness-dock/session";

export interface ManagerDock {
	readonly root: RunRoot;
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	nativeId(): Promise<string>;
	call(params: unknown, raw?: boolean, tool?: "run" | "collect"): Promise<any>;
	collect(params?: unknown): Promise<any>;
	close(): Promise<void>;
}

/** Approved S1: actual automatic manager entry, actual OMP Session, controlled model only. */
export async function managerDock(endpoint: string, budgets: { requestTimeoutMs?: number; collectTimeoutMs?: number } = {}): Promise<ManagerDock> {
	const root = createRunRoot("manager-state");
	const deployment = join(root.path, "deployment");
	for (const tree of ["framework", "adapters", "extensions/workflow-chat", "entrypoints"]) {
		cpSync(join(REPO_ROOT, tree), join(deployment, tree), { recursive: true });
	}
	cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true });
	writeFileSync(join(deployment, "extensions/workflow-chat/config.yaml"),
		`endpoint: ${JSON.stringify(endpoint)}\nrequestTimeoutMs: ${budgets.requestTimeoutMs ?? 2000}\ncollectTimeoutMs: ${budgets.collectTimeoutMs ?? 5460000}\n`);
	let next: { name: "run" | "collect"; params: unknown } | undefined;
	const capture = startCaptureServer({ dir: root.captureDir, respond() {
		if (next === undefined) return undefined;
		const selected = next; next = undefined;
		return { toolCall: { name: selected.name, arguments: JSON.stringify(selected.params) } };
	} });
	let session: ControlledSession | undefined;
	try {
		const harness = await ensureIsolatedHarness();
		session = await ControlledSession.start({ harness, runRoot: root,
			extensions: [join(REPO_ROOT, "tests/harness-dock/fixtures/extension-root/provider.ts"), join(deployment, "entrypoints/omp-auto/manager-chat.ts")],
			model: DOCK_MODEL_SELECTOR, env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
		});
		return { root, session, capture,
			async nativeId() {
				const state = await session!.request({ type: "get_state" });
				if (!state.data || typeof state.data !== "object" || !("sessionId" in state.data) || typeof state.data.sessionId !== "string") throw new Error("No native manager Session identity");
				return state.data.sessionId;
			},
			async collect(this: ManagerDock, params: unknown = {}) { return this.call(params, false, "collect"); },
			async call(params: unknown, raw = false, tool = "run") {
				next = { name: tool, params };
				const turn = await session!.prompt(`执行一次显式管理动作 ${JSON.stringify(params)}；不要自主重试或推进。`);
				if (turn.status !== "completed") throw new Error(`Manager turn did not complete: ${turn.status}`);
				const requests = capture.requests();
				const last = requests[requests.length - 1]?.json as { messages?: { role: string; content: unknown }[] } | undefined;
				const tools = last?.messages?.filter(message => message.role === "tool") ?? [];
				const content = tools[tools.length - 1]?.content;
				if (typeof content !== "string") throw new Error(`No tool text: ${JSON.stringify(content)}`);
				return raw ? content : JSON.parse(content);
			},
			async close() { try { await session!.stop(); } finally { capture.stop(); root.dispose(); } },
		};
	} catch (error) { await session?.stop(); capture.stop(); root.dispose(); throw error; }
}
