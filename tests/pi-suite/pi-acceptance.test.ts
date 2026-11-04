import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beginPiAcceptance, comparePiVersions, rejectLegacyPiVersionArgument, type PiAcceptanceOptions } from "../../scripts/support/pi-acceptance";
import type { PiCli } from "../harness-dock/pi-session";

let root: string;
let options: PiAcceptanceOptions;

async function git(...args: string[]): Promise<void> {
	const result = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
	const [code, stderr] = await Promise.all([result.exited, new Response(result.stderr).text()]);
	if (code !== 0) throw new Error(`git ${args.join(" ")}: ${stderr}`);
}

async function cli(version: string): Promise<PiCli> {
	const script = path.join(root, "ignored", `${crypto.randomUUID()}.js`);
	await mkdir(path.dirname(script), { recursive: true });
	await writeFile(script, `console.log(${JSON.stringify(version)});\n`);
	return { command: [process.execPath, script], path: script, source: "test-owned version command" };
}

async function record(): Promise<{ scopes: Record<string, { version: string; checks: string[]; source: { sha256: string }; runtime: { cli: { execPath: string; node: string } } }> }> {
	return JSON.parse(await readFile(options.recordPath!, "utf8"));
}

interface ExecutionEvidence {
	status: string;
	version: string;
	checks: string[];
	publicationError?: string;
	startedAt: string;
	finishedAt: string;
	cli: { path: string; command: string[] };
	runtime: { cli: { execPath: string; node: string }; driver: { bun: string } };
	lockfiles: { sha256: string }[];
	source: { head: string; sha256: string; status: string[]; untrackedFiles: { path: string; sha256: string }[] };
	finishedSource: { sha256: string };
}

async function evidence(): Promise<ExecutionEvidence[]> {
	return Promise.all((await readdir(options.evidenceDir!)).map(async (name) => JSON.parse(await readFile(path.join(options.evidenceDir!, name), "utf8"))));
}

beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "pi-acceptance-"));
	options = { repoRoot: root, recordPath: path.join(root, "ignored", "acceptance.json"), evidenceDir: path.join(root, "ignored", "evidence") };
	await writeFile(path.join(root, ".gitignore"), "ignored/\n");
	await writeFile(path.join(root, "source.ts"), "export const value = 1;\n");
	await writeFile(path.join(root, "bun.lock"), "test-owned lockfile\n");
	await git("init");
	await git("add", ".");
	await git("-c", "user.name=Acceptance Test", "-c", "user.email=acceptance@example.invalid", "commit", "-m", "test source");
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

test("strict SemVer precedence handles prereleases and ignores build metadata", () => {
	const ordered = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "2.0.0"];
	for (let i = 1; i < ordered.length; i++) expect(comparePiVersions(ordered[i - 1]!, ordered[i]!)).toBe(-1);
	expect(comparePiVersions("1.2.3+first", "1.2.3+second")).toBe(0);
	expect(comparePiVersions("9007199254740993.0.0", "9007199254740992.0.0")).toBe(1);
	for (const invalid of ["v1.0.0", "1.0", "01.0.0", "1.01.0", "1.0.0-01", "1.0.0-alpha.01", "1.0.0-", "1.0.0+", "1.0.0 extra", "1.0.0\n"]) {
		expect(() => comparePiVersions(invalid, "1.0.0")).toThrow("strict SemVer");
	}
});

test("legacy expected-version flag is rejected with local selection guidance", () => {
	for (const arg of ["--expect-pi-version", "--expect-pi-version=1.0.0"]) {
		expect(() => rejectLegacyPiVersionArgument([arg])).toThrow("--pi, PI_CLI, or PATH");
	}
});

test("only complete passes promote, equal versions refresh, and downgrades are scope-local", async () => {
	const initial = await beginPiAcceptance("smoke", await cli("2.0.0-rc.1"), options);
	await initial.finish({ status: "passed", complete: true, checks: ["first"] });
	for (const result of [
		{ status: "failed", complete: true },
		{ status: "blocked", complete: false },
		{ status: "passed", complete: false },
	] as const) {
		const run = await beginPiAcceptance("smoke", await cli("3.0.0"), options);
		await run.finish({ ...result, checks: ["incomplete"] });
		expect((await record()).scopes.smoke!.version).toBe("2.0.0-rc.1");
	}
	await expect(beginPiAcceptance("smoke", await cli("2.0.0-beta"), options)).rejects.toThrow("highest passed");
	const equal = await beginPiAcceptance("smoke", await cli("2.0.0-rc.1+rebuilt"), options);
	await equal.finish({ status: "passed", complete: true, checks: ["refreshed"] });
	expect((await record()).scopes.smoke!.checks).toEqual(["refreshed"]);
	expect((await record()).scopes.smoke!.version).toBe("2.0.0-rc.1+rebuilt");
	const other = await beginPiAcceptance("other", await cli("1.0.0"), options);
	await other.finish({ status: "passed", complete: true, checks: ["independent"] });
	expect((await record()).scopes.other!.version).toBe("1.0.0");
	const stable = await beginPiAcceptance("smoke", await cli("2.0.0"), options);
	await stable.finish({ status: "passed", complete: true, checks: ["stable"] });
	expect((await record()).scopes.smoke!.version).toBe("2.0.0");
	expect((await evidence()).filter((entry) => entry.status === "blocked").length).toBe(2);
});

test("concurrent scope publications merge and stale runs cannot lower a scope", async () => {
	const low = await beginPiAcceptance("shared", await cli("1.0.0"), options);
	const high = await beginPiAcceptance("shared", await cli("2.0.0"), options);
	const other = await beginPiAcceptance("other", await cli("3.0.0"), options);
	await Promise.all([
		high.finish({ status: "passed", complete: true, checks: ["high"] }),
		other.finish({ status: "passed", complete: true, checks: ["other"] }),
	]);
	await expect(low.finish({ status: "passed", complete: true, checks: ["stale"] })).rejects.toThrow("concurrently accepted");
	const saved = await record();
	expect(saved.scopes.shared!.version).toBe("2.0.0");
	expect(saved.scopes.other!.version).toBe("3.0.0");
	expect((await evidence()).find((entry) => entry.version === "1.0.0")!.status).toBe("blocked");
});

test("lock contention times out with evidence and leaves the success record untouched", async () => {
	const run = await beginPiAcceptance("locked", await cli("1.0.0"), { ...options, lockTimeoutMs: 20 });
	await mkdir(`${options.recordPath!}.lock`);
	await expect(run.finish({ status: "passed", complete: true, checks: ["pass"] })).rejects.toThrow("Timed out");
	await expect(readFile(options.recordPath!)).rejects.toThrow();
	expect((await evidence())[0]!.publicationError).toContain("Timed out");
});

test("invalid CLI versions block and retain execution provenance without a success record", async () => {
	await expect(beginPiAcceptance("invalid", await cli("v1.0.0"), options)).rejects.toThrow("strict SemVer");
	await expect(readFile(options.recordPath!)).rejects.toThrow();
	const [blocked] = await evidence();
	expect(blocked!.status).toBe("blocked");
	expect(blocked!.version).toBe("v1.0.0");
	expect(blocked!.runtime.cli.execPath).toBe(process.execPath);
	expect(blocked!.source.head).toBeTruthy();
	expect(blocked!.lockfiles[0]!.sha256).toHaveLength(64);
});

test("a hung version command is killed and recorded as blocked", async () => {
	// This integration case exercises the real subprocess kill deadline; fake timers
	// would race the real Git/runtime processes rather than observe the platform boundary.
	const hanging = await cli("1.0.0");
	await writeFile(hanging.path, "setInterval(() => {}, 1000);\n");
	await expect(beginPiAcceptance("hung", hanging, options)).rejects.toThrow("timed out after 4000ms");
	await expect(readFile(options.recordPath!)).rejects.toThrow();
	const [saved] = await evidence();
	expect(saved!.status).toBe("blocked");
	expect(saved!.cli.path).toBe(hanging.path);
}, 15_000);

test("acceptance artifacts are excluded even when not gitignored", async () => {
	const visibleOptions = { ...options, recordPath: path.join(root, "acceptance.json"), evidenceDir: path.join(root, "evidence") };
	const first = await beginPiAcceptance("one", await cli("1.0.0"), visibleOptions);
	const second = await beginPiAcceptance("two", await cli("1.0.0"), visibleOptions);
	await first.finish({ status: "passed", complete: true, checks: ["one"] });
	await second.finish({ status: "passed", complete: true, checks: ["two"] });
	const saved = JSON.parse(await readFile(visibleOptions.recordPath, "utf8"));
	expect(Object.keys(saved.scopes).sort()).toEqual(["one", "two"]);
});

test("source mutations during a run block promotion and retain execution evidence", async () => {
	const run = await beginPiAcceptance("changing", await cli("1.0.0"), options);
	await writeFile(path.join(root, "source.ts"), "export const changed = true;\n");
	await expect(run.finish({ status: "passed", complete: true, checks: ["observed"] })).rejects.toThrow("Source changed");
	await expect(readFile(options.recordPath!)).rejects.toThrow();
	const [saved] = await evidence();
	expect(saved!.status).toBe("blocked");
	expect(saved!.source.sha256).not.toBe(saved!.finishedSource.sha256);
});

test("source evidence distinguishes tracked and untracked changes at the same HEAD", async () => {
	const clean = await beginPiAcceptance("source", await cli("1.0.0"), options);
	await clean.finish({ status: "passed", complete: true, checks: ["clean"] });
	const first = (await record()).scopes.source!;
	await writeFile(path.join(root, "source.ts"), "export const value = 2;\n");
	await writeFile(path.join(root, "new.ts"), "export const fresh = true;\n");
	const dirty = await beginPiAcceptance("source", await cli("1.0.0"), options);
	await dirty.finish({ status: "passed", complete: true, checks: ["dirty"] });
	const next = (await record()).scopes.source!;
	expect(next.source.sha256).not.toBe(first.source.sha256);
	const saved = (await evidence()).find((entry) => entry.checks[0] === "dirty")!;
	expect(saved.source.untrackedFiles).toHaveLength(1);
	expect(saved.source.status.join(" ")).toContain("source.ts");
	expect(saved.runtime.driver.bun).toBe(Bun.version);
	expect(saved.runtime.cli.node).toBe(process.versions.node);
	expect(saved.cli.command).toHaveLength(2);
	expect(saved.startedAt).toBeTruthy();
	expect(saved.finishedAt).toBeTruthy();
});
