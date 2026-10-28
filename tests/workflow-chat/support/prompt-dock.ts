import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, ensureIsolatedHarness } from "../../harness-dock/baseline";
import { type CapturedRequest, startCaptureServer } from "../../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../../harness-dock/fixtures/extension-root/provider";
import { createRunRoot } from "../../harness-dock/run-root";
import { ControlledSession } from "../../harness-dock/session";

/** S1: shipped automatic role entry, real OMP Prompt/history, controlled provider only. */
export async function promptDock(role: "manager" | "node") {
	const root = createRunRoot(`role-prompt-${role}`);
	const deployment = join(root.path, "deployment");
	for (const tree of ["framework", "adapters", "extensions/workflow-chat", "entrypoints"]) {
		cpSync(join(REPO_ROOT, tree), join(deployment, tree), { recursive: true });
	}
	cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true });
	let next: { name: string; arguments: string } | undefined;
	const capture = startCaptureServer({ dir: root.captureDir, respond() {
		const selected = next; next = undefined;
		return selected ? { toolCall: selected } : undefined;
	} });
	let session: ControlledSession | undefined;
	try {
		session = await ControlledSession.start({ harness: await ensureIsolatedHarness(), runRoot: root,
			extensions: [join(REPO_ROOT, "tests/harness-dock/fixtures/extension-root/provider.ts"), join(deployment, `entrypoints/omp-auto/${role}-chat.ts`)],
			model: DOCK_MODEL_SELECTOR, env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
		});
		return { root, session, capture,
			select(name: string, params: unknown) { next = { name, arguments: JSON.stringify(params) }; },
			async close() {
				try { await session!.stop(); } finally {
					// Opt-in artifacts are actual model requests and persisted sessions, never model-quality evidence.
					const evidence = process.env.WORKFLOW_PROMPT_EVIDENCE_DIR;
					if (evidence) {
						const destination = join(evidence, `${role}-${root.path.split(/[\\/]/).pop()}`);
						mkdirSync(destination, { recursive: true });
						cpSync(root.captureDir, join(destination, "captures"), { recursive: true });
						cpSync(root.sessionDir, join(destination, "sessions"), { recursive: true });
						writeFileSync(join(destination, "scope.txt"), "Real OMP; controlled provider. Not evidence of real-model task completion.\n");
					}
					capture.stop(); root.dispose();
				}
			},
		};
	} catch (error) { await session?.stop(); capture.stop(); root.dispose(); throw error; }
}

export function providerMessages(request: CapturedRequest): { role: string; content: string; parts: string[] }[] {
	const body = request.json;
	if (!body || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) throw new Error("Missing provider messages");
	return body.messages.map((message: unknown) => {
		if (!message || typeof message !== "object" || !("role" in message) || typeof message.role !== "string" || !("content" in message)) throw new Error("Invalid provider message");
		const parts = typeof message.content === "string" ? [message.content] : Array.isArray(message.content) ? message.content.map((part: unknown) => {
			if (!part || typeof part !== "object" || !("text" in part) || typeof part.text !== "string") throw new Error("Invalid provider text part");
			return part.text;
		}) : [];
		return { role: message.role, content: parts.join(""), parts };
	});
}

export function roleGuidance(request: CapturedRequest, role: "manager" | "node"): string {
	const marker = role === "manager" ? "你是 Run 管理者" : "你是节点执行者";
	const messages = providerMessages(request).filter(message => message.content.includes(marker));
	if (messages.length !== 1) throw new Error(`Expected one actual ${role} Prompt contribution, received ${messages.length}`);
	return messages[0]!.content;
}
