import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, ensureIsolatedHarness } from "../../harness-dock/baseline";
import { type CaptureServer, startCaptureServer } from "../../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../../harness-dock/fixtures/extension-root/provider";
import { PiSession, resolvePiCli, writePiModels } from "../../harness-dock/pi-session";
import { createRunRoot } from "../../harness-dock/run-root";
import { ControlledSession } from "../../harness-dock/session";

export interface ChiefLookupResult {
	readonly content: { text: string }[];
	readonly details: { httpStatus?: number; body: unknown };
	readonly isError: boolean;
}

export interface ChiefDock {
	readonly capture: CaptureServer;
	call(params: unknown): Promise<ChiefLookupResult>;
	history(): Promise<string>;
	close(): Promise<void>;
}

/** Real native loading/tools/history; the local provider controls protocol, not model behavior. */
export async function chiefDock(host: "omp" | "pi", endpoint: string): Promise<ChiefDock> {
	const root = createRunRoot(`chief-${host}`);
	const deployment = join(root.path, "deployment");
	let session: ControlledSession | PiSession | undefined;
	let next: { name: string; arguments: string } | undefined;
	const capture = startCaptureServer({ dir: root.captureDir, respond() {
		const toolCall = next; next = undefined;
		return toolCall ? { toolCall } : { replyText: "Controlled protocol completion; not model-behavior evidence." };
	} });
	try {
		for (const tree of ["framework", "adapters", "extensions/workflow-chat", "entrypoints"]) {
			cpSync(join(REPO_ROOT, tree), join(deployment, tree), { recursive: true,
				filter: candidate => candidate !== join(REPO_ROOT, "framework", ".runtime") });
		}
		cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true, dereference: true });
		writeFileSync(join(deployment, "extensions/workflow-chat/config.yaml"), `endpoint: ${endpoint}\nrequestTimeoutMs: 3000\nreportConfirmationTimeoutMs: 20000\ncollectTimeoutMs: 6000\n`);
		// Isolate all conventional host directories as well as native session storage.
		const home = join(root.path, "home"); mkdirSync(home);
		const env = { HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
			XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, XDG_STATE_HOME: home, XDG_CACHE_HOME: home };
		if (host === "omp") {
			session = await ControlledSession.start({ harness: await ensureIsolatedHarness(), runRoot: root,
				extensions: [join(REPO_ROOT, "tests/harness-dock/fixtures/extension-root/provider.ts"), join(deployment, "entrypoints/omp-auto/chief-chat.ts")],
				model: DOCK_MODEL_SELECTOR, env: { ...env, [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl } });
		} else {
			writePiModels(root.agentDir, { "chief-fixture": { baseUrl: capture.baseUrl, api: "openai-completions", apiKey: "controlled-not-a-secret",
				models: [{ id: "fixture", name: "Controlled protocol fixture", reasoning: false, input: ["text"], contextWindow: 32000, maxTokens: 1024,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } });
			session = await PiSession.start({ cli: resolvePiCli(), runRoot: root, entrypoint: join(deployment, "entrypoints/pi-auto/chief-chat.ts"), selector: "chief-fixture/fixture", env });
		}
		const running = session;
		return { capture,
			async call(params: unknown) {
				next = { name: "chief_definitions", arguments: JSON.stringify(params) };
				const mark = running.frames().length;
				if (running instanceof PiSession) await running.run("Perform the selected definition lookup once.");
				else {
					const outcome = await running.prompt("Perform the selected definition lookup once.");
					if (outcome.status !== "completed") throw new Error(`Chief prompt failed: ${JSON.stringify(outcome)}`);
				}
				const frame = running.frames().slice(mark).reverse().find(frame => frame.type === "tool_execution_end");
				if (!frame) throw new Error(`No native chief tool result: ${running.stderr()}`);
				const result = frame.result as Omit<ChiefLookupResult, "isError">;
				return { ...result, isError: frame.isError === true };
			},
			async history() { return running instanceof PiSession ? readFileSync(await running.sessionFile(), "utf8") : readFileSync(running.sessionLog().file, "utf8"); },
			async close() {
				try {
					const outcome = await running.stop();
					if (running instanceof PiSession && outcome && (outcome.timedOut || outcome.exitCode !== 0)) throw new Error(`Chief Pi cleanup failed: ${JSON.stringify(outcome)}`);
				} finally {
					try {
						const evidence = process.env.WORKFLOW_PROMPT_EVIDENCE_DIR;
						if (evidence) {
							const destination = join(evidence, `chief-${host}-${root.path.split(/[\\/]/).pop()}`);
							mkdirSync(destination, { recursive: true });
							cpSync(root.captureDir, join(destination, "captures"), { recursive: true });
							cpSync(root.sessionDir, join(destination, "sessions"), { recursive: true });
							writeFileSync(join(destination, "stderr.txt"), running.stderr());
							writeFileSync(join(destination, "scope.txt"), `Real ${host} loader and backend; controlled protocol provider, not real-model behavior.\n`);
						}
					} finally { capture.stop(); root.dispose(); }
				}
			},
		};
	} catch (error) { try { await session?.stop(); } finally { capture.stop(); root.dispose(); } throw error; }
}
