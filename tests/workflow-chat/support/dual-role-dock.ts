import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { join } from "node:path";
import { REPO_ROOT } from "../../harness-dock/baseline";
import { PiSession, type PiSessionOptions, resolvePiCli, startPiRun } from "../../harness-dock/pi-session";
import { promptDock } from "./prompt-dock";

/** Approved native dock seam: normal auto entries, real adapters/HTTP, scripted provider.
 * By default the HTTP peer supplies controlled outcomes; an explicit endpoint uses
 * the paired backend's actual authorization and workflow state transitions.
 */
export async function dualRoleDock(host: "omp" | "pi", endpoint?: string) {
	const calls: { path: string; body: Record<string, unknown> }[] = [];
	let answer: unknown = { ok: true };
	let status = 200;
	let gate: { started: { promise: Promise<void>; resolve(): void }; closed: { promise: Promise<void>; resolve(): void } } | undefined;
	const sockets = new Set<Socket>();
	const backend = createServer(async (request, response) => {
		if (request.url === "/api/workflow/node/context") {
			request.resume(); response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ reportPolicy: "auto" })); return;
		}
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(Buffer.from(chunk));
		calls.push({ path: request.url!, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
		const encoded = Buffer.from(JSON.stringify(answer));
		response.writeHead(status, { "content-type": "application/json", "content-length": encoded.length });
		const held = gate;
		gate = undefined;
		if (held) {
			request.socket.once("close", held.closed.resolve);
			response.write(encoded.subarray(0, 1), held.started.resolve);
		} else response.end(encoded);
	});
	backend.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const listening = Promise.withResolvers<void>();
	backend.listen(0, "127.0.0.1", listening.resolve);
	await listening.promise;
	const address = backend.address();
	if (!address || typeof address === "string") throw new Error("Missing dual-role fixture port");
	const config = `endpoint: ${endpoint ?? `http://127.0.0.1:${address.port}`}\nrequestTimeoutMs: 3000\nreportConfirmationTimeoutMs: 20000\ncollectTimeoutMs: 30000\n`;
	async function closeBackend() {
		for (const socket of sockets) socket.destroy();
		const closed = Promise.withResolvers<void>();
		backend.close(error => error ? closed.reject(error) : closed.resolve());
		await closed.promise;
	}
	let closeHost: (() => Promise<void>) | undefined;
	try {
		const omp = host === "omp" ? await promptDock("dual", { config }) : undefined;
		const piRun = host === "pi" ? startPiRun(resolvePiCli(), "dual-role-pi", {
			provider: "dual-role", model: "fixture", endpoint: { respond() {
				const selected = next; next = undefined;
				return selected ? { toolCall: selected } : { replyText: "Controlled completion." };
			} },
		}) : undefined;
		let next: { name: string; arguments: string } | undefined;
		let pi: PiSession | undefined;
		let piOptions: PiSessionOptions | undefined;
		const previousHosts: { frames: readonly unknown[]; stderr: string }[] = [];
		if (omp) closeHost = () => omp.close();
		if (piRun) {
			closeHost = async () => { try { await pi?.stop(); } finally { piRun.capture.stop(); piRun.root.dispose(); } };
			const deployment = join(piRun.root.path, "deployment");
			for (const tree of ["framework", "adapters", "extensions/workflow-chat", "entrypoints"]) {
				cpSync(join(REPO_ROOT, tree), join(deployment, tree), { recursive: true,
					filter: candidate => candidate !== join(REPO_ROOT, "framework/.runtime") });
			}
			cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true, dereference: true });
			writeFileSync(join(deployment, "extensions/workflow-chat/config.yaml"), config);
			piOptions = { cli: piRun.cli, runRoot: piRun.root, selector: piRun.selector,
				entrypoint: ["manager", "node"].map(role => join(deployment, `entrypoints/pi-auto/${role}-chat.ts`)) };
			pi = await PiSession.start(piOptions);
		}
		let session = omp?.session ?? pi!;
		const root = omp?.root ?? piRun!.root;
		const capture = omp?.capture ?? piRun!.capture;
		async function sessionFile() {
			return omp ? omp.session.sessionLog().file : pi!.sessionFile();
		}
		return { get session() { return session; }, root, capture, calls, sessionFile,
			async reopen(sessionPath: string) {
				previousHosts.push({ frames: [...session.frames()], stderr: session.stderr() });
				if (omp) { await omp.reopen(sessionPath); session = omp.session; }
				else {
					pi = await PiSession.start({ ...piOptions!, extraArgs: ["--session", sessionPath] });
					session = pi;
				}
			},
			answer(body: unknown, code = 200) { answer = body; status = code; },
			hold() { const held = { started: Promise.withResolvers<void>(), closed: Promise.withResolvers<void>() }; gate = held; return held; },
			async call(name: string, params: unknown) {
				const call = { name, arguments: JSON.stringify(params) };
				if (omp) omp.select(name, params); else next = call;
				const mark = session.frames().length;
				if (omp) {
					const outcome = await omp.session.prompt("Execute the selected role tool once; no retries.");
					if (outcome.status !== "completed" && outcome.status !== "aborted") throw new Error(`OMP dual-role prompt ${outcome.status}`);
				} else await pi!.run("Execute the selected role tool once; no retries.");
				const frame = session.frames().slice(mark).reverse().find(frame => frame.type === "tool_execution_end");
				if (!frame) throw new Error(`No ${host} native tool result`);
				const result = frame.result as { content: { text: string }[]; isError?: boolean; details?: { httpStatus?: number; body: unknown } };
				return { ...result, isError: frame.isError === true || result.isError === true, body: result.details ? result.details.body : result.content[0]!.text };
			},
			async beginShutdownCollect() {
				if (omp) {
					omp.select("collect", {});
					return { outcome: omp.session.prompt("Wait in collect until native shutdown.").then(value => ({ value }), error => ({ error })) };
				}
				next = { name: "collect", arguments: "{}" };
				await pi!.request({ type: "prompt", message: "Wait in collect until native shutdown." });
				// EOF need not publish agent_settled; only own the accepted native request.
				return { outcome: Promise.resolve(undefined) };
			},
			async history() { return readFileSync(await sessionFile(), "utf8"); },
			async close() {
				try {
					const outcome = await session.stop();
					if (outcome.timedOut || outcome.exitCode !== 0) throw new Error(`Dual-role ${host} shutdown failed: ${JSON.stringify(outcome)}`);
				} finally {
					try {
						const evidence = process.env.WORKFLOW_DUAL_EVIDENCE_DIR;
						if (evidence) {
							const destination = join(evidence, `${host}-${root.path.split(/[\\/]/).pop()}`);
							mkdirSync(destination, { recursive: true });
							cpSync(root.captureDir, join(destination, "captures"), { recursive: true });
							cpSync(root.sessionDir, join(destination, "sessions"), { recursive: true });
							writeFileSync(join(destination, "host.json"), JSON.stringify({ host, previousHosts, frames: session.frames(), stderr: session.stderr(), calls }, null, 2));
						}
					} finally { try { await closeHost!(); } finally { await closeBackend(); } }
				}
			},
		};
	} catch (error) {
		try { await closeHost?.(); } finally { await closeBackend(); }
		throw error;
	}
}
