import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { createRunRoot } from "../../run-root";
import { ControlledSession, DockSessionError } from "../../session";

const mode = process.argv[2] as string;
const pidFile = process.argv[3] as string;
const root = createRunRoot(`startup-${mode}`);
let session: ControlledSession | undefined;
let failure: unknown;
let exitCode: number | null | undefined;
let disposalFailure: unknown;
try {
	try {
		session = await ControlledSession.start({
			harness: { cliPath: path.join(import.meta.dir, "startup-child.ts") },
			runRoot: root,
			extensions: [],
			model: "fixture/model",
			env: { DOCK_STARTUP_MODE: mode, DOCK_STARTUP_PID_FILE: pidFile },
			readyTimeoutMs: 2_000,
		});
		const exit = await session.stop({ timeoutMs: 2_000 });
		exitCode = exit.exitCode;
	} catch (error) {
		failure = error;
	}
} finally {
	try {
		await session?.stop({ timeoutMs: 2_000 });
	} finally {
		try {
			root.dispose();
		} catch (error) {
			disposalFailure = error;
		}
	}
}
const pid = Number(readFileSync(pidFile, "utf8"));
let alive = true;
try {
	process.kill(pid, 0);
} catch {
	alive = false;
}
console.log(JSON.stringify({
	mode,
	pid,
	root: root.path,
	alive,
	disposalFailure: disposalFailure instanceof Error ? disposalFailure.message : null,
	exitCode,
	rootRemoved: !existsSync(root.path),
	failure: failure instanceof Error ? failure.message : null,
	diagnostic: failure instanceof DockSessionError ? failure.diagnostics : null,
}));
