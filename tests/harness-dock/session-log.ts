/**
 * Read-back of the session JSONL the harness persists under `--session-dir`.
 * This is the persistence surface a later suite asserts against, so it stays a thin
 * reader: locate the session file, parse each entry, keep unparsable lines visible
 * instead of hiding them.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";

export interface SessionEntry {
	readonly type?: string;
	readonly customType?: string;
	readonly [key: string]: unknown;
}

export interface SessionLog {
	/** Absolute path of the session file that was read. */
	readonly file: string;
	readonly entries: readonly SessionEntry[];
	/** Lines that were not valid JSON (kept so malformed persistence is diagnosable). */
	readonly unparsed: readonly string[];
}

export function listSessionFiles(sessionDir: string): string[] {
	if (!existsSync(sessionDir)) return [];
	return readdirSync(sessionDir)
		.filter(name => name.endsWith(".jsonl"))
		.map(name => path.join(sessionDir, name))
		.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

/**
 * The session files the harness persisted for the sessions one session spawned.
 *
 * A spawned session is stored beside its spawner rather than at the session root: the
 * harness nests `<agentId>.jsonl` under a directory named after the spawning session's
 * file, level by level, so a nested subagent appears under its own spawner. The result
 * is direct children first, each level in creation order; the given session's own file is
 * not part of it.
 */
export function spawnedSessionFiles(sessionFile: string): string[] {
	const root = sessionFile.endsWith(".jsonl") ? sessionFile.slice(0, -".jsonl".length) : sessionFile;
	if (!existsSync(root)) return [];
	const found: Array<{ file: string; depth: number }> = [];
	const walk = (dir: string, depth: number): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full, depth + 1);
			else if (entry.name.endsWith(".jsonl")) found.push({ file: full, depth });
		}
	};
	walk(root, 1);
	return found
		.sort((a, b) => a.depth - b.depth || statSync(a.file).mtimeMs - statSync(b.file).mtimeMs)
		.map(entry => entry.file);
}

/**
 * The spawned session file whose journal carries `marker`.
 *
 * Depth is a reliable identity — a grandchild sits one level below its spawner — but the
 * order of two siblings at the same level is not: the harness may flush a turn's spawned
 * sessions together, so their modification times can be a millisecond apart or equal. A
 * suite that drives more than one subagent at one level therefore picks each by a fact
 * that subagent's own session recorded (the turn text it ran) rather than by position.
 * Returns `undefined` when no spawned session carries the marker.
 */
export function spawnedSessionFileCarrying(sessionFile: string, marker: string): string | undefined {
	return spawnedSessionFiles(sessionFile).find(file => readFileSync(file, "utf8").includes(marker));
}

export function readSessionLog(sessionDir: string, file?: string): SessionLog {
	const files = listSessionFiles(sessionDir);
	const target = file ?? files[files.length - 1];
	if (target === undefined) {
		throw new Error(`no session JSONL found under ${sessionDir}`);
	}
	const raw = readFileSync(target, "utf8");
	const entries: SessionEntry[] = [];
	const unparsed: string[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			entries.push(JSON.parse(trimmed) as SessionEntry);
		} catch {
			unparsed.push(trimmed);
		}
	}
	return { file: target, entries, unparsed };
}

/**
 * Persisted non-LLM custom entries of one `customType` (what `appendEntry` writes).
 */
export function customEntries(entries: readonly SessionEntry[], customType: string): Array<Record<string, unknown>> {
	return entries.filter(
		(entry): entry is SessionEntry & Record<string, unknown> =>
			entry.type === "custom" && entry.customType === customType,
	);
}

/**
 * Persisted custom messages of one `customType`: the hidden contributions the agent
 * harness records as conversation entries (`type: "custom_message"`, carrying
 * `content`, `display` and `attribution`).
 */
export function customMessages(
	entries: readonly SessionEntry[],
	customType: string,
): Array<Record<string, unknown>> {
	return entries.filter(
		(entry): entry is SessionEntry & Record<string, unknown> =>
			entry.type === "custom_message" && entry.customType === customType,
	);
}
