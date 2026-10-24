/**
 * The managed timer stays in the assembly (E18; P39).
 *
 * The heartbeat is scheduled on a timer the harness owns, and reaching that timer is native
 * access: only the extension's OMP assembly may touch it, and what shared logic receives is the
 * capability the assembly injects. Shared logic that named a timer itself would be scheduling on a
 * surface no other harness promises — and would do it invisibly, because a global timer needs no
 * import for the framework's import boundary to see.
 *
 * The evidence is the extension's own module graph plus the code in it, so this suite reads the
 * source instead of running it: comments may describe native timers, and code outside `harnesses/`
 * may not name one. Like the framework's import boundary, the scan is a mechanical alarm over a
 * rule that is the principle.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import ts from "typescript-compiler";
import { REPO_ROOT } from "../harness-dock/baseline";

/** The extension whose shared source must name no timer. */
const EXTENSION_ROOT = "extensions/connect-bot";

/** The escape hatch: the one directory of this extension that may touch the native surface. */
const HARNESS_DIRECTORY = `${EXTENSION_ROOT}/harnesses/`;

/** Both global timer names and the context-managed cancellation member are native access. */
const NATIVE_TIMERS: Readonly<Record<string, true>> = {
	setInterval: true,
	clearInterval: true,
	setTimeout: true,
	clearTimeout: true,
	clearTimer: true,
};

function timerNames(source: string, callsOnly = false): string[] {
	const file = ts.createSourceFile("boundary.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const found = new Set<string>();
	function visit(node: ts.Node): void {
		if (callsOnly) {
			if (ts.isCallExpression(node)) {
				const target = node.expression;
				const name = ts.isPropertyAccessExpression(target) ? target.name.text
					: ts.isElementAccessExpression(target) && ts.isStringLiteralLike(target.argumentExpression)
						? target.argumentExpression.text : ts.isIdentifier(target) ? target.text : undefined;
				if (name !== undefined && NATIVE_TIMERS[name] === true) found.add(name);
			}
		} else if (ts.isIdentifier(node) && NATIVE_TIMERS[node.text] === true) {
			found.add(node.text);
		} else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)
			&& NATIVE_TIMERS[node.argumentExpression.text] === true) {
			found.add(node.argumentExpression.text);
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return [...found].sort();
}

function sourceFilesUnder(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(path.join(REPO_ROOT, directory), { withFileTypes: true })) {
		const absolute = path.join(REPO_ROOT, directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFilesUnder(path.relative(REPO_ROOT, absolute)));
		else if (entry.name.endsWith(".ts")) files.push(path.relative(REPO_ROOT, absolute).split(path.sep).join("/"));
	}
	return files;
}

const sourceFiles = sourceFilesUnder(EXTENSION_ROOT);
const sharedFiles = sourceFiles.filter(file => !file.startsWith(HARNESS_DIRECTORY));

describe("only the OMP assembly reaches the native timer (P39)", () => {
	test("the extension has both a shared source and an assembly to tell apart", () => {
		expect(sharedFiles).toContain(`${EXTENSION_ROOT}/shared-logic/panel/heartbeat.ts`);
		expect(sourceFiles).toContain(`${EXTENSION_ROOT}/harnesses/omp-assembly.ts`);
	});

	test("no shared module names a native timer", () => {
		const offenders = sharedFiles.filter(file => timerNames(readFileSync(path.join(REPO_ROOT, file), "utf8")).length > 0);
		expect(offenders).toEqual([]);
	});

	test("the assembly is where the native timer really is reached, so the scan has a subject", () => {
		const assembly = readFileSync(path.join(REPO_ROOT, EXTENSION_ROOT, "harnesses/omp-assembly.ts"), "utf8");
		expect(timerNames(assembly, true)).toEqual(["clearTimer", "setInterval"]);
	});

	test("member-call detection survives receiver renaming and computed member spelling", () => {
		for (const receiver of ["ctx", "context", "nativeSession"]) {
			expect(timerNames(`${receiver}.setInterval(beat, 1000); ${receiver}.clearTimer(handle);`, true))
				.toEqual(["clearTimer", "setInterval"]);
			expect(timerNames(`${receiver}["setInterval"](beat, 1000); ${receiver}["clearTimer"](handle);`, true))
				.toEqual(["clearTimer", "setInterval"]);
		}
	});

	test("the shared scan detects global and member access but ignores comments and string prose", () => {
		expect(timerNames("setTimeout(beat, 1000); globalThis.clearInterval(handle); native.clearTimer(handle);"))
			.toEqual(["clearInterval", "clearTimer", "setTimeout"]);
		expect(timerNames('native["setInterval"](beat, 1000);')).toEqual(["setInterval"]);
		expect(timerNames('// context.setInterval()\n/* clearTimeout() */\nconst prose = "clearTimer setInterval";'))
			.toEqual([]);
		expect(timerNames("interface Context { setInterval(): void; clearTimer(): void }", true)).toEqual([]);
	});
});
