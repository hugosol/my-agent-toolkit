/**
 * Probe 03-C: drive a REAL OMP 18.5.0 session in RPC mode.
 *
 * Runs /codebase-tools (extension command), two real turns, then dumps state and
 * session entries. Uses the isolated host + local capture provider; no user config.
 *
 * Env: OMP_HOST, PROVIDER_EXT, EXTENSION, STATE_DIR, SESSION_DIR, WORK_DIR.
 * Optional: RESUME_ID (pass -r <id>), CONTINUE ("1" -> -c).
 */
const HOST = process.env.OMP_HOST;
const PROVIDER_EXT = process.env.PROVIDER_EXT;
const EXTENSION = process.env.EXTENSION;
const STATE_DIR = process.env.STATE_DIR;
const SESSION_DIR = process.env.SESSION_DIR;
const WORK_DIR = process.env.WORK_DIR;
if (!HOST || !PROVIDER_EXT || !EXTENSION || !STATE_DIR || !SESSION_DIR || !WORK_DIR) {
	throw new Error("OMP_HOST, PROVIDER_EXT, EXTENSION, STATE_DIR, SESSION_DIR, WORK_DIR are required");
}

const args: string[] = [
	"bun",
	`${HOST}/src/cli.ts`,
	"--mode",
	"rpc",
	"--no-extensions",
	"-e",
	PROVIDER_EXT,
	"-e",
	EXTENSION,
	"--model",
	"probe-gateway/probe-model",
	"--session-dir",
	SESSION_DIR,
	"--cwd",
	WORK_DIR,
];
if (process.env.EXTENSION2) args.push("-e", process.env.EXTENSION2);
if (process.env.TOOLS) args.push("--tools", process.env.TOOLS);
if (process.env.CONFIG_OVERLAY) args.push("--config", process.env.CONFIG_OVERLAY);
if (process.env.CONTINUE === "1") args.push("--continue");
if (process.env.RESUME_ID) args.push("--resume", process.env.RESUME_ID);

const child = Bun.spawn(args, {
	cwd: WORK_DIR,
	env: { ...process.env, PI_CODING_AGENT_DIR: STATE_DIR },
	stdin: "pipe",
	stdout: "pipe",
	stderr: "pipe",
});

type Frame = Record<string, unknown>;
interface Waiter {
	predicate: (frame: Frame) => boolean;
	settle: (frame: Frame) => void;
	label: string;
}

const decoder = new TextDecoder();
let buffer = "";
const waiters: Waiter[] = [];

function send(obj: Frame): void {
	child.stdin.write(JSON.stringify(obj) + "\n");
	child.stdin.flush();
}

function waitFor(predicate: (frame: Frame) => boolean, label: string, timeoutMs = 60000): Promise<Frame> {
	const { promise, resolve, reject } = Promise.withResolvers<Frame>();
	const waiter: Waiter = { predicate, label, settle: resolve };
	waiters.push(waiter);
	const timer = setTimeout(() => {
		const i = waiters.indexOf(waiter);
		if (i >= 0) waiters.splice(i, 1);
		reject(new Error(`timeout waiting for ${label}`));
	}, timeoutMs);
	void promise.finally(() => clearTimeout(timer));
	return promise;
}

void (async () => {
	const reader = child.stdout.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let nl: number;
		while ((nl = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (!line) continue;
			let frame: Frame;
			try {
				frame = JSON.parse(line) as Frame;
			} catch {
				frame = { raw: line };
			}
			console.log("FRAME " + line.slice(0, 2000));
			for (const w of [...waiters]) {
				if (w.predicate(frame)) {
					waiters.splice(waiters.indexOf(w), 1);
					w.settle(frame);
				}
			}
		}
	}
})();

async function prompt(id: string, message: string): Promise<Frame> {
	send({ id, type: "prompt", message });
	return await waitFor(f => f.type === "prompt_result" && f.id === id, `${id} prompt_result`, 120000);
}

try {
	await waitFor(f => f.type === "ready", "ready", 90000);
	console.log("=== READY ===");

	if (process.env.WITH_COMMAND === "1") {
		console.log("=== COMMAND RESULT " + JSON.stringify(await prompt("c1", "/codebase-tools")));
	}

	const mode = process.env.MODE ?? "full";
	if (mode === "command") {
		console.log("=== COMMAND RESULT " + JSON.stringify(await prompt("c1", "/codebase-tools")));
	} else if (mode === "turn") {
		console.log("=== TURN RESULT " + JSON.stringify(await prompt("p1", process.env.TURN_TEXT ?? "probe turn")));
	} else if (mode === "abort") {
		send({ id: "p1", type: "prompt", message: "slow probe turn" });
		await Bun.sleep(Number(process.env.ABORT_AFTER_MS ?? "800"));
		send({ id: "a1", type: "abort" });
		const aborted = await waitFor(
			f => f.type === "prompt_result" && f.id === "p1",
			"aborted prompt_result",
			90000,
		);
		console.log("=== ABORT RESULT " + JSON.stringify(aborted));
	} else if (mode === "fail") {
		console.log("=== FAIL RESULT " + JSON.stringify(await prompt("p1", "failing probe turn")));
	} else if (mode === "turn-then-command") {
		console.log("=== TURN RESULT " + JSON.stringify(await prompt("p1", "off turn before toggle")));
		console.log("=== COMMAND RESULT " + JSON.stringify(await prompt("c1", "/codebase-tools")));
	} else if (mode === "new") {
		send({ id: "n1", type: "new_session" });
		const newSession = await waitFor(f => f.type === "response" && f.id === "n1", "new_session response");
		console.log("=== NEW SESSION " + JSON.stringify(newSession));
		console.log("=== TURN RESULT " + JSON.stringify(await prompt("p1", "turn after new_session")));
	} else {
		console.log("=== COMMAND RESULT " + JSON.stringify(await prompt("c1", "/codebase-tools")));
		console.log("=== TURN1 RESULT " + JSON.stringify(await prompt("p1", "first probe turn")));
		console.log("=== TURN2 RESULT " + JSON.stringify(await prompt("p2", "second probe turn")));
	}

	send({ id: "s1", type: "get_state" });
	const s1 = await waitFor(f => f.type === "response" && f.id === "s1", "get_state response");
	console.log("=== STATE " + JSON.stringify(s1));

	send({ id: "e1", type: "get_entries" });
	const e1 = await waitFor(f => f.type === "response" && f.id === "e1", "get_entries response");
	console.log("=== ENTRIES " + JSON.stringify(e1));
} catch (error) {
	console.log("=== DRIVER ERROR " + (error instanceof Error ? error.message : String(error)));
	const stderr = await new Response(child.stderr).text();
	if (stderr.trim()) console.log("=== CHILD STDERR ===\n" + stderr.slice(0, 4000));
} finally {
	try {
		child.kill();
	} catch {
		// ignore
	}
	await Bun.sleep(300);
	process.exit(0);
}

export {};
