/**
 * Role worker for the cross-process session-lease probe. Two OS processes:
 *  - `holder`: creates a persisted session and writes to it (claiming the lease)
 *  - `intruder`: opens the same session file and writes (must respect the lease)
 * No model requests; only local session persistence.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SESSION_MANAGER = "E:/Developer/myhub/oh-my-pi/packages/coding-agent/src/session/session-manager.ts";
const role = process.argv[2];
const { SessionManager } = await import(SESSION_MANAGER);

const message = (text: string) => ({ role: "user" as const, content: [{ type: "text" as const, text }], timestamp: Date.now() });

if (role === "holder") {
	const manager = SessionManager.create(process.cwd());
	manager.appendMessage(message("holder-line"));
	// Sessions stay lazy until a turn or an explicit force; materialize so the file exists.
	await manager.ensureOnDisk();
	manager.flushSync();
	const file = manager.getSessionFile();
	const stat = await fs.stat(file);
	console.log(
		JSON.stringify({
			role,
			pid: process.pid,
			sessionId: manager.getSessionId(),
			file,
			size: stat.size,
		}),
	);
	// Stay alive holding the lease until the driver kills this process.
	setInterval(() => {}, 1_000);
} else if (role === "intruder") {
	const target = process.argv[3];
	const manager = await SessionManager.open(target);
	const before = await fs.stat(target).catch(() => null);
	manager.appendMessage(message("intruder-line"));
	await manager.ensureOnDisk();
	manager.flushSync();
	const after = await fs.stat(target).catch(() => null);
	const dir = path.dirname(target);
	const siblings = (await fs.readdir(dir)).filter(name => name.endsWith(".jsonl"));
	console.log(
		JSON.stringify({
			role,
			pid: process.pid,
			sessionId: manager.getSessionId(),
			file: manager.getSessionFile(),
			targetSizeBefore: before?.size ?? null,
			targetSizeAfter: after?.size ?? null,
			siblings,
		}),
	);
} else {
	console.error(`unknown role: ${role}`);
	process.exit(2);
}
