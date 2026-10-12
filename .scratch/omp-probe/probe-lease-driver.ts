/**
 * Driver for the cross-process session-lease probe: starts a holder process,
 * then an intruder process that opens the same session file, and reports
 * whether the second writer was moved off the owned file.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const ROLE_SCRIPT = "E:/Developer/myhub/my-agent-toolkit/.scratch/omp-probe/probe-lease.ts";
const root = path.join(os.tmpdir(), `omp-lease-probe-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const agentDir = path.join(root, "agent");
const ownersDir = path.join(root, "owners");
const projDir = path.join(root, "proj");
for (const dir of [agentDir, ownersDir, projDir]) await fs.mkdir(dir, { recursive: true });

const env = {
	...process.env,
	PI_CODING_AGENT_DIR: agentDir,
	PI_TEST_SESSION_OWNERS_DIR: ownersDir,
	PI_NO_TITLE: "1",
};

async function firstJsonLine(stream: ReadableStream<Uint8Array>): Promise<Record<string, unknown>> {
	const dec = new TextDecoder();
	let text = "";
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		text += dec.decode(value, { stream: true });
		const newline = text.indexOf("\n");
		if (newline >= 0) {
			reader.cancel().catch(() => {});
			return JSON.parse(text.slice(0, newline)) as Record<string, unknown>;
		}
	}
	throw new Error(`process produced no JSON line; last text: ${text.slice(0, 400)}`);
}

const summary: Record<string, unknown> = { root, agentDir, ownersDir, projDir };
const holder = Bun.spawn([process.execPath, ROLE_SCRIPT, "holder"], {
	cwd: projDir,
	env,
	stdout: "pipe",
	stderr: "pipe",
});
let intruder: Bun.Subprocess<"pipe", "pipe", "pipe"> | undefined;
try {
	const holderInfo = await firstJsonLine(holder.stdout);
	summary.holder = holderInfo;
	summary.ownerLeaseFiles = await fs.readdir(ownersDir).catch(() => []);

	intruder = Bun.spawn([process.execPath, ROLE_SCRIPT, "intruder", String(holderInfo.file)], {
		cwd: projDir,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const intruderInfo = await firstJsonLine(intruder.stdout);
	summary.intruder = intruderInfo;
	summary.intruderOwnLeaseFiles = await fs.readdir(ownersDir).catch(() => []);

	const holderStat = await fs.stat(String(holderInfo.file)).catch(() => null);
	summary.holderFileAfterIntruder = {
		size: holderStat?.size ?? null,
		unchanged:
			holderStat !== null &&
			holderInfo.size !== undefined &&
			holderStat.size === (holderInfo.size as number),
	};
	summary.verdict = {
		intruderMovedToDifferentFile: intruderInfo.file !== holderInfo.file,
		holderFileUntouched: (summary.holderFileAfterIntruder as { unchanged: boolean }).unchanged,
		distinctProcesses: holderInfo.pid !== intruderInfo.pid,
	};
} catch (error) {
	summary.error = String(error);
	const stderr = await new Response(holder.stderr).text();
	summary.holderStderr = stderr.slice(-800);
	if (intruder) {
		summary.intruderStderr = (await new Response(intruder.stderr).text()).slice(-800);
	}
} finally {
	holder.kill();
	intruder?.kill();
	await Promise.race([holder.exited, Bun.sleep(5_000)]);
	await Promise.race([intruder?.exited ?? Promise.resolve(), Bun.sleep(5_000)]);
}

console.log(JSON.stringify(summary, null, 2));
