import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../../harness-dock/baseline";
import { PiSession, resolvePiCli, startPiRun } from "../../harness-dock/pi-session";
import type { CaptureServer } from "../../harness-dock/capture-server";
import type { RunRoot } from "../../harness-dock/run-root";
import { promptDock } from "./prompt-dock";

export interface RoleContractDock {
	readonly root: RunRoot;
	readonly capture: CaptureServer;
	state(): Promise<Readonly<Record<string, unknown>>>;
	report(params: unknown): Promise<void>;
	close(): Promise<void>;
}

/** S1 only: real host/tool validation and HTTP persistence; scripted model, not role obedience. */
export async function roleContractDock(host: "omp" | "pi", endpoint: string): Promise<RoleContractDock> {
	if (host === "omp") {
		const dock = await promptDock("node", { config: `endpoint: ${endpoint}\nrequestTimeoutMs: 30000\ncollectTimeoutMs: 5460000\n` });
		return {
			root: dock.root, capture: dock.capture,
			state: () => dock.session.request({ type: "get_state" }),
			async report(params: unknown) { dock.select("report", params); await dock.session.prompt("Call the selected report once."); },
			close: () => dock.close(),
		};
	}
	let next: unknown;
	let selected = false;
	const run = startPiRun(resolvePiCli(), "pi-report-contract", {
		provider: "workflow-contract", model: "contract-model",
		endpoint: { respond() {
			if (!selected) return undefined;
			selected = false;
			return { toolCall: { name: "report", arguments: JSON.stringify(next) } };
		} },
	});
	let session: PiSession | undefined;
	try {
		const deployment = join(run.root.path, "deployment");
		for (const tree of ["framework", "adapters", "extensions/workflow-chat", "entrypoints"]) {
			cpSync(join(REPO_ROOT, tree), join(deployment, tree), { recursive: true,
				filter: candidate => candidate !== join(REPO_ROOT, "framework/.runtime") });
		}
		cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true });
		writeFileSync(join(deployment, "extensions/workflow-chat/config.yaml"),
			`endpoint: ${endpoint}\nrequestTimeoutMs: 30000\ncollectTimeoutMs: 5460000\n`);
		session = await PiSession.start({ cli: run.cli, runRoot: run.root,
			entrypoint: join(deployment, "entrypoints/pi-auto/node-chat.ts"), selector: run.selector });
		return {
			root: run.root, capture: run.capture,
			state: () => session!.request({ type: "get_state" }),
			async report(params: unknown) { next = params; selected = true; await session!.run("Call the selected report once."); },
			async close() { try { await session!.stop(); } finally { run.capture.stop(); run.root.dispose(); } },
		};
	} catch (error) {
		try { await session?.stop(); } finally { run.capture.stop(); run.root.dispose(); }
		throw error;
	}
}
