/**
 * The extension hooks no native session shutdown (E14; P35, story 78).
 *
 * The frozen behavior never hooked the agent runtime's own shutdown, and the migration keeps that:
 * the extension observes the framework's semantic session axis — one `session_end` handler, whose
 * reason says whether the session was transferred or disposed — and names no native event of its
 * own, least of all a shutdown hook that would make the extension run code while the process is
 * going away. What a process that dies is covered by is the panel's own expiry, which the extension
 * does not implement either (`./no-panel-expiry.test.ts`).
 *
 * The evidence is the extension's own source, so this suite reads it instead of running it: comments
 * may describe the native surface, and the code may not name it. The behavioral half lives beside it
 * — `./session-switch.test.ts` drives the native shutdown through the binding and observes that the
 * disposal is applied through the semantic event — and this file is the mechanical alarm over the
 * rule those cases rest on, exactly as the framework's import boundary is over its own.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { REPO_ROOT } from "../harness/baseline";

/** The extension whose source must name no native lifecycle event. */
const EXTENSION_ROOT = "extensions/connect-bot";

/** The source trees a native lifecycle subscription could legally appear in. */
const SCANNED_ROOTS = ["framework", "extensions", "entrypoints"] as const;

/** Where naming the agent runtime's own session events is the adapter's job: the native escape hatch. */
const ADAPTER_DIRECTORY = "framework/adapters/";

/**
 * The agent runtime's own lifecycle vocabulary, as its extension API spells it.
 *
 * `session_start` is deliberately absent although the runtime has such an event: the same name is
 * the framework's own semantic kind, so a source scan cannot tell the two apart. What a module
 * *subscribes* is caught by the subscription pattern below instead, and what the extension reacts to
 * is the framework's `session_end`, which no runtime spells that way.
 */
const NATIVE_LIFECYCLE =
	/\b(?:session_switch|session_branch|session_tree|session_shutdown|agent_start|agent_end|before_agent_start)\b/;

/** A subscription to the runtime's own event surface, however a module might make one. */
const NATIVE_SUBSCRIPTION = /\bpi\s*\.\s*on\s*\(/;

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

const extensionFiles = sourceFilesUnder(EXTENSION_ROOT);

describe("the extension registers no native session hook of its own (E14, P35)", () => {
	test("the extension has source to check", () => {
		// The scan is only meaningful while it has subjects: the extension's own modules are here.
		expect(extensionFiles).toContain(`${EXTENSION_ROOT}/session-end.ts`);
		expect(extensionFiles).toContain(`${EXTENSION_ROOT}/runtimes/omp.ts`);
		expect(extensionFiles.length).toBeGreaterThan(5);
	});

	test("no extension module names a native lifecycle event", () => {
		const offenders = extensionFiles.filter(file => NATIVE_LIFECYCLE.test(codeOf(file)));
		expect(offenders).toEqual([]);
	});

	test("no extension module subscribes the runtime's event surface itself", () => {
		const offenders = extensionFiles.filter(file => NATIVE_SUBSCRIPTION.test(codeOf(file)));
		expect(offenders).toEqual([]);
	});

	test("the semantic axis really is what this extension reacts to, so the scan has a subject", () => {
		const assembly = codeOf(`${EXTENSION_ROOT}/runtimes/omp.ts`);
		// The session the boundary ends, subscribed by its framework kind: the session this extension
		// armed, wound down when another identity takes its place.
		expect(assembly).toMatch(/session_end:\s*endSession\b/);
		expect(assembly).toMatch(/"session-lifecycle-events"/);
	});

	test("the runtime's own shutdown name is code only where the adapter synthesizes the disposal", () => {
		// The name exists in this repository and has exactly one home: the adapter that turns the
		// native event into the semantic one. Nothing under an extension may name it, which is what
		// makes the scan above a rule about the framework's boundary rather than a missing feature.
		const named = SCANNED_ROOTS.flatMap(root => sourceFilesUnder(root)).filter(file =>
			/\bsession_shutdown\b/.test(codeOf(file)),
		);
		expect(named.length).toBeGreaterThan(0);
		expect(named.filter(file => !file.startsWith(ADAPTER_DIRECTORY))).toEqual([]);
	});
});
