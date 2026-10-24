import { writeFileSync } from "node:fs";

writeFileSync(process.env.DOCK_STARTUP_PID_FILE as string, String(process.pid));
process.stderr.write("startup fixture diagnostic\n");
const mode = process.env.DOCK_STARTUP_MODE;
// The eof mode completes naturally without ready, closing its real stdout pipe.
// Bun on Windows does not deliver live EOF for stdout.end()/closeSync(1).
// No forced process.exit: the driver must still close and await its pipes.
if (mode === "early-exit") {
	process.exitCode = 23;
} else if (mode !== "eof") {
	const keepAlive = setInterval(() => {}, 1_000);
	if (mode === "ready") {
		process.stdout.write(`${JSON.stringify({ type: "ready" })}\n`);
		process.stdin.resume();
		process.stdin.on("end", () => clearInterval(keepAlive));
	}
}
