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
	confirmation(): Promise<Readonly<Record<string, unknown>>>;
	answerConfirmation(id: string, confirmed?: boolean): void;
	cancel(): Promise<void>;
	endSession(): Promise<void>;
	lastResult(): unknown;
	state(): Promise<Readonly<Record<string, unknown>>>;
	report(params: unknown): Promise<void>;
	close(): Promise<void>;
}

/** S1 only: real host/tool validation and HTTP persistence; scripted model, not role obedience. */
export async function roleContractDock(host: "omp" | "pi", endpoint: string, confirmationTimeoutMs = 20000): Promise<RoleContractDock> {
	if (host === "omp") {
		const dock = await promptDock("node", { isolatedHome: true, config: `endpoint: ${endpoint}\nrequestTimeoutMs: 30000\nreportConfirmationTimeoutMs: ${confirmationTimeoutMs}\ncollectTimeoutMs: 5460000\n` });
		let mark = 0;
		return {
			root: dock.root, capture: dock.capture,
			confirmation: () => dock.session.awaitFrame(frame => dock.session.frames().indexOf(frame) >= mark && frame.type === "extension_ui_request" && frame.method === "confirm", "native report confirmation", 10000),
			answerConfirmation: (id, confirmed) => dock.session.respondToUI(id, confirmed),
			async cancel() { await dock.session.request({ type: "abort" }); },
			async endSession() { await dock.session.request({ type: "new_session" }); },
			lastResult: () => dock.session.frames().filter(frame => frame.type === "tool_execution_end").slice(-1)[0]?.result,
			state: () => dock.session.request({ type: "get_state" }),
			async report(params: unknown) { mark = dock.session.frames().length; dock.select("report", params); await dock.session.prompt("Call the selected report once."); },
			async close() {
				try {
					const exit = await dock.session.stop();
					console.log(JSON.stringify({ host, nativeExit: exit }));
					if (exit.exitCode !== 0 || exit.timedOut) throw new Error(`OMP report dock cleanup failed: ${JSON.stringify(exit)}`);
				} finally { await dock.close(); }
			},
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
		cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true, dereference: true });
		writeFileSync(join(deployment, "extensions/workflow-chat/config.yaml"),
			`endpoint: ${endpoint}\nrequestTimeoutMs: 30000\nreportConfirmationTimeoutMs: ${confirmationTimeoutMs}\ncollectTimeoutMs: 5460000\n`);
		session = await PiSession.start({ cli: run.cli, runRoot: run.root,
			entrypoint: join(deployment, "entrypoints/pi-auto/node-chat.ts"), selector: run.selector,
			env: { HOME: run.root.path, USERPROFILE: run.root.path, APPDATA: run.root.path, LOCALAPPDATA: run.root.path,
				XDG_CONFIG_HOME: run.root.path, XDG_DATA_HOME: run.root.path, XDG_STATE_HOME: run.root.path, XDG_CACHE_HOME: run.root.path } });
		let mark = 0;
		return {
			root: run.root, capture: run.capture,
			async confirmation() {
				const frame = await session!.frameSince(mark, frame => frame.type === "extension_ui_request" && frame.method === "confirm", "native report confirmation", 10000);
				if (!frame) throw new Error(`Pi did not open confirmation: ${session!.diagnostics()}`);
				return frame;
			},
			answerConfirmation: (id, confirmed) => session!.respondToUI(id, confirmed),
			async cancel() { await session!.request({ type: "abort" }); },
			async endSession() { await session!.request({ type: "new_session" }); },
			lastResult: () => session!.frames().filter(frame => frame.type === "tool_execution_end").slice(-1)[0]?.result,
			state: () => session!.request({ type: "get_state" }),
			async report(params: unknown) { mark = session!.frames().length; next = params; selected = true; await session!.run("Call the selected report once."); },
			async close() {
				try {
					const exit = await session!.stop();
					console.log(JSON.stringify({ host, nativeExit: exit }));
					if (exit.exitCode !== 0 || exit.timedOut) throw new Error(`Pi report dock cleanup failed: ${JSON.stringify(exit)}`);
				} finally { run.capture.stop(); run.root.dispose(); }
			},
		};
	} catch (error) {
		try { await session?.stop(); } finally { run.capture.stop(); run.root.dispose(); }
		throw error;
	}
}
