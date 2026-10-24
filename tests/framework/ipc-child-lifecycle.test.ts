import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ipcChild } from "./support/ipc-child";

// These are standalone child protocol fixtures, not mutations of the product or its IPC.
for (const mode of ["early-exit", "EOF", "live-no-ready", "live-no-report", "report-EOF", "report-exit", "normal"] as const) {
	test(`the IPC runner owns ${mode} through process exit`, async () => {
		const root = mkdtempSync(join(tmpdir(), "framework-ipc-lifecycle-"));
		const entry = join(root, "child.ts");
		const result = join(root, "result.json");
		const pidPath = join(root, "pid");
		writeFileSync(entry, `
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
const mode = ${JSON.stringify(mode)};
if (mode === "early-exit") throw new Error("fixture early exit");
// Clean natural termination closes stdout; live stdout.end() is not reliable on Windows/Bun.
if (mode !== "EOF") {
if (mode === "live-no-ready") {
  setInterval(() => {}, 1000);
  await Promise.withResolvers().promise;
}
console.log(JSON.stringify({ t: "ready" }));
for await (const line of console) {
  const command = JSON.parse(line);
  if (command.t === "report" && mode === "normal") console.log(JSON.stringify({ answer: 42 }));
  if (command.t === "report" && mode === "live-no-report") console.error("fixture awaiting report forever");
  if (command.t === "report" && mode === "report-EOF") break;
  if (command.t === "report" && mode === "report-exit") throw new Error("fixture report exit");
  if (command.t === "quit") {
    writeFileSync(${JSON.stringify(result)}, JSON.stringify({ finished: true }));
    break;
  }
}
process.stdin.destroy();
}
`);
		const channel = ipcChild<{ answer: number }>(entry, join(root, "unused-plan.json"), root, 1000);
		try {
			if (mode === "normal") {
				await channel.ready();
				expect(await channel.ask({ t: "report" })).toEqual({ answer: 42 });
				expect((await channel.finish(result)).value).toEqual({ finished: true });
			} else if (mode === "live-no-report" || mode === "report-EOF" || mode === "report-exit") {
				await channel.ready();
				await expect(channel.ask({ t: "report" })).rejects.toThrow(
					mode === "live-no-report" ? /report exceeded[\s\S]*fixture awaiting report forever/ : mode === "report-EOF" ? /stdout EOF|exited 0/ : /fixture report exit/,
				);
			} else {
				await expect(channel.ready()).rejects.toThrow(mode === "live-no-ready" ? /ready exceeded/ : mode === "EOF" ? /stdout EOF|exited 0/ : /fixture early exit/);
			}
			// A rejected ready/report is not merely a parent-side timeout: its child was reaped.
			const pid = Number(readFileSync(pidPath, "utf8"));
			expect(() => process.kill(pid, 0)).toThrow();
		} finally {
			try { await channel.stop(); } finally { rmSync(root, { recursive: true, force: true }); }
		}
	});
}
