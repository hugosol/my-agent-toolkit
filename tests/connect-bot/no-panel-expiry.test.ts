/**
 * The panel's expiry belongs to the panel: this extension implements no 30s logic (P30, story 70).
 *
 * A session's 在线/离线 is judged where the sessions live — the panel expires a session it has not
 * heard from for three beats — and what the extension owes that judgement is the beats themselves,
 * not a second copy of the threshold. The extension's whole contribution is therefore one heartbeat
 * period; a duration it never reads cannot disagree with the panel's, and nothing here can start
 * expiring a session behind the panel's back.
 *
 * The evidence is the extension's own code, so this suite reads it instead of running it: comments
 * may name the panel's window, and the code may not carry it. Like the framework's import
 * boundary, the scan is a mechanical alarm over a rule that is the principle — a 30s constant that
 * a later edit writes into this extension is exactly what it is here to catch.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { REPO_ROOT } from "../harness-dock/baseline";

/** The extension whose source the panel's half must never appear in. */
const EXTENSION_ROOT = "extensions/connect-bot";

/** A duration of 30s, however a later edit might spell it. */
const THIRTY_SECONDS = [/\b30_?000\b/, /\b30\s*\*\s*1_?000\b/];

/** The panel's own freshness field: an extension-side expiry would have to keep one. */
const FRESHNESS_FIELD = /last[_]?seen/i;

function sourceFilesUnder(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(path.join(REPO_ROOT, directory), { withFileTypes: true })) {
		const absolute = path.join(REPO_ROOT, directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFilesUnder(path.relative(REPO_ROOT, absolute)));
		else if (entry.name.endsWith(".ts")) files.push(path.relative(REPO_ROOT, absolute).split(path.sep).join("/"));
	}
	return files;
}

/** The code of one file, with its comments removed: what the extension does, not what it says. */
function codeOf(file: string): string {
	return readFileSync(path.join(REPO_ROOT, file), "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/^\s*\/\/.*$/gm, "");
}

const sourceFiles = sourceFilesUnder(EXTENSION_ROOT);

describe("the extension carries no panel-side expiry (P30)", () => {
	test("the extension has source to check", () => {
		// The scan is only meaningful while it has subjects: the extension's own modules are here.
		expect(sourceFiles).toContain(`${EXTENSION_ROOT}/shared-logic/panel/heartbeat.ts`);
		expect(sourceFiles.length).toBeGreaterThan(5);
	});

	test("no module implements a 30s window or keeps a freshness field", () => {
		const offenders: string[] = [];
		for (const file of sourceFiles) {
			const code = codeOf(file);
			for (const pattern of THIRTY_SECONDS) {
				if (pattern.test(code)) offenders.push(`${file} carries a 30s duration (${String(pattern)})`);
			}
			if (FRESHNESS_FIELD.test(code)) offenders.push(`${file} keeps a freshness field of its own`);
		}
		expect(offenders).toEqual([]);
	});
});
