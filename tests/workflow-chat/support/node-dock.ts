import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, ensureIsolatedHarness } from "../../harness-dock/baseline";
import { type CaptureServer, startCaptureServer } from "../../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../../harness-dock/run-root";
import { ControlledSession, type PromptOutcome } from "../../harness-dock/session";

export interface NodeDock {
	readonly root: RunRoot;
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	beginReport(body: string): Promise<PromptOutcome>;
	close(): Promise<void>;
}

/** S1: the delivered auto entrypoint in the real, isolated OMP loader, not a registration double. */
export async function nodeDock(endpoint: string, body: string): Promise<NodeDock> {
	const root = createRunRoot("node-report");
	const deployment = join(root.path, "deployment");
	for (const tree of ["framework", "adapters", "extensions/workflow-chat", "entrypoints"]) {
		cpSync(join(REPO_ROOT, tree), join(deployment, tree), {
			recursive: true,
			// Live owner-access records (and their atomic staging files) are not deployment inputs.
			filter: candidate => candidate !== join(REPO_ROOT, "framework", ".runtime"),
		});
	}
	// The copied source resolves its actual dependencies without depending on the node cwd.
	cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true });
	writeFileSync(join(deployment, "extensions/workflow-chat/config.yaml"),
		`endpoint: ${JSON.stringify(endpoint)}\nrequestTimeoutMs: 2000\ncollectTimeoutMs: 5460000\n`);
	mkdirSync(join(root.workDir, "extensions/workflow-chat"), { recursive: true });
	writeFileSync(join(root.workDir, "extensions/workflow-chat/config.yaml"), "endpoint: http://127.0.0.1:1\nrequestTimeoutMs: 1\n");
	let nextBody: string | undefined = body;
	const capture = startCaptureServer({ dir: root.captureDir, respond() {
		if (nextBody === undefined) return undefined;
		const selected = nextBody; nextBody = undefined;
		return { toolCall: { name: "report", arguments: JSON.stringify({ body: selected }) } };
	} });
	let session: ControlledSession | undefined;
	try {
		const harness = await ensureIsolatedHarness();
		session = await ControlledSession.start({
			harness, runRoot: root,
			extensions: [join(REPO_ROOT, "tests/harness-dock/fixtures/extension-root/provider.ts"), join(deployment, "entrypoints/omp-auto/node-chat.ts")],
			model: DOCK_MODEL_SELECTOR, env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
		});
		return {
			root, session, capture,
			beginReport(body) { nextBody = body; return session!.prompt("显式提交本次交接一次，不自主重报。"); },
			async close() {
				try { await session!.stop(); } finally { capture.stop(); root.dispose(); }
			},
		};
	} catch (error) {
		await session?.stop();
		capture.stop();
		root.dispose();
		throw error;
	}
}

export function toolText(dock: NodeDock): string {
	const requests = dock.capture.requests();
	const last = requests[requests.length - 1]?.json as { messages?: { role: string; content: unknown }[] } | undefined;
	const tools = last?.messages?.filter(message => message.role === "tool") ?? [];
	const content = tools[tools.length - 1]?.content;
	return typeof content === "string" ? content : content === undefined ? "" : JSON.stringify(content);
}
