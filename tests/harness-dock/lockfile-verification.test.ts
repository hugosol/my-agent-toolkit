import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { sha256File, verifyLockfile } from "./baseline";

const content = '{\n  "dependencies": {"example": "1.0.0"}\n}\n';
const record = { path: "bun.lock", sha256: createHash("sha256").update(content).digest("hex") };
const roots: string[] = [];

function fixture(contents?: string): string {
	const root = mkdtempSync(path.join(tmpdir(), "lockfile-verification-"));
	roots.push(root);
	if (contents !== undefined) writeFileSync(path.join(root, record.path), contents);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("lockfile verification", () => {
	for (const [name, contents] of [
		["LF", content],
		["CRLF", content.replace(/\n/g, "\r\n")],
		["mixed LF and CRLF", content.replace("\n", "\r\n")],
	] as const) {
		test(`accepts ${name} with the same LF-normalized digest`, () => {
			expect(verifyLockfile(record, fixture(contents))).toEqual({
				path: record.path,
				recordedSha256: record.sha256,
				actualSha256: record.sha256,
				matches: true,
			});
		});
	}

	test("rejects dependency changes even with CRLF", () => {
		const root = fixture(content.replace("1.0.0", "2.0.0").replace(/\n/g, "\r\n"));
		expect(verifyLockfile(record, root).matches).toBe(false);
	});

	test("does not ignore other whitespace or lone carriage returns", () => {
		for (const changed of [content.replace("  ", " "), content.trimEnd(), content.replace("\n", "\r")]) {
			expect(verifyLockfile(record, fixture(changed)).matches).toBe(false);
		}
	});

	test("reports a missing lockfile as a mismatch", () => {
		expect(verifyLockfile(record, fixture())).toEqual({
			path: record.path,
			recordedSha256: record.sha256,
			actualSha256: null,
			matches: false,
		});
	});

	test("leaves raw file hashing byte-sensitive for artifact verification", () => {
		const file = path.join(fixture(content.replace(/\n/g, "\r\n")), record.path);
		expect(sha256File(file)).not.toBe(record.sha256);
	});
});
