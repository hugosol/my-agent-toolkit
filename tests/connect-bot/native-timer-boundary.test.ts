/**
 * The managed timer stays in the assembly (E18; P39).
 *
 * The heartbeat is scheduled on a timer the agent runtime owns, and reaching that timer is native
 * access: only the extension's OMP assembly may touch it, and what shared logic receives is the
 * capability the assembly injects. Shared logic that named a timer itself would be scheduling on a
 * surface no other runtime promises — and would do it invisibly, because a global timer needs no
 * import for the framework's import boundary to see.
 *
 * The evidence is the extension's own module graph plus the code in it, so this suite reads the
 * source instead of running it: comments may describe native timers, and code outside `runtimes/`
 * may not name one. Like the framework's import boundary, the scan is a mechanical alarm over a
 * rule that is the principle.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { REPO_ROOT } from "../harness/baseline";

/** The extension whose shared source must name no timer. */
const EXTENSION_ROOT = "extensions/connect-bot";

/** The escape hatch: the one directory of this extension that may touch the native surface. */
const RUNTIME_DIRECTORY = `${EXTENSION_ROOT}/runtimes/`;

/** A native timer, however a shared module might reach one. */
const NATIVE_TIMER = /\b(?:set|clear)(?:Interval|Timeout)\b/;

function sourceFilesUnder(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(path.join(REPO_ROOT, directory), { withFileTypes: true })) {
		const absolute = path.join(REPO_ROOT, directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFilesUnder(path.relative(REPO_ROOT, absolute)));
		else if (entry.name.endsWith(".ts")) files.push(path.relative(REPO_ROOT, absolute).split(path.sep).join("/"));
	}
	return files;
}

/** The code of one file, with its comments removed: what a module does, not what it says. */
function codeOf(file: string): string {
	return readFileSync(path.join(REPO_ROOT, file), "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/^\s*\/\/.*$/gm, "");
}

const sourceFiles = sourceFilesUnder(EXTENSION_ROOT);
const sharedFiles = sourceFiles.filter(file => !file.startsWith(RUNTIME_DIRECTORY));

describe("only the OMP assembly reaches the native timer (P39)", () => {
	test("the extension has both a shared source and an assembly to tell apart", () => {
		expect(sharedFiles).toContain(`${EXTENSION_ROOT}/heartbeat.ts`);
		expect(sourceFiles).toContain(`${EXTENSION_ROOT}/runtimes/omp.ts`);
	});

	test("no shared module names a native timer", () => {
		const offenders = sharedFiles.filter(file => NATIVE_TIMER.test(codeOf(file)));
		expect(offenders).toEqual([]);
	});

	test("the assembly is where the native timer really is reached, so the scan has a subject", () => {
		const assembly = codeOf(`${EXTENSION_ROOT}/runtimes/omp.ts`);
		expect(assembly).toMatch(/ctx\.setInterval\b/);
		expect(assembly).toMatch(/ctx\.clearTimer\b/);
	});
});
