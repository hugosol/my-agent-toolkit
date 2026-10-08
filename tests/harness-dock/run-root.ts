/**
 * Per-run isolated directories. Every controlled session runs against a fresh
 * agent state directory, session directory, working directory and capture
 * directory under the OS temp root, so no run can write into the default agent
 * environment or into the repository.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

export interface RunRoot {
	readonly path: string;
	/** Temporary agent state (`PI_CODING_AGENT_DIR`). */
	readonly agentDir: string;
	/** `--session-dir`: where the harness persists session JSONL. */
	readonly sessionDir: string;
	/** `--cwd`: the session working directory. */
	readonly workDir: string;
	/** Where the capture endpoint writes raw outbound request bodies. */
	readonly captureDir: string;
	dispose(): void;
}

const RUN_ROOT_PREFIX = "omp-dock-";

export function createRunRoot(label: string): RunRoot {
	const safeLabel = label.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
	const root = mkdtempSync(path.join(tmpdir(), `${RUN_ROOT_PREFIX}${safeLabel}-`));
	const dirs = {
		agentDir: path.join(root, "agent-state"),
		sessionDir: path.join(root, "sessions"),
		workDir: path.join(root, "work"),
		captureDir: path.join(root, "captures"),
	};
	for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
	return {
		path: root,
		...dirs,
		dispose() {
			rmSync(root, { recursive: true, force: true });
		},
	};
}

/** Files under a run root, relative and sorted, for isolation diagnostics. */
export function listRunArtifacts(root: RunRoot): string[] {
	const found: string[] = [];
	const walk = (dir: string): void => {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else found.push(path.relative(root.path, full).replace(/\\/g, "/"));
		}
	};
	walk(root.path);
	return found.sort();
}
