import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beginHarnessAcceptance, compareHarnessVersions, rejectLegacyPiVersionArgument, type HarnessAcceptanceOptions } from "../../scripts/support/harness-acceptance";
import type { PiCli } from "../harness-dock/pi-session";
import { hasCompleteOmpReport, isCompleteOmpRun, runOmpTests } from "../../scripts/omp-dock-tests";

let root: string;
let options: HarnessAcceptanceOptions;

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
	complete: boolean;
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
	for (let i = 1; i < ordered.length; i++) expect(compareHarnessVersions(ordered[i - 1]!, ordered[i]!)).toBe(-1);
	expect(compareHarnessVersions("1.2.3+first", "1.2.3+second")).toBe(0);
	expect(compareHarnessVersions("9007199254740993.0.0", "9007199254740992.0.0")).toBe(1);
	for (const invalid of ["v1.0.0", "1.0", "01.0.0", "1.01.0", "1.0.0-01", "1.0.0-alpha.01", "1.0.0-", "1.0.0+", "1.0.0 extra", "1.0.0\n"]) {
		expect(() => compareHarnessVersions(invalid, "1.0.0")).toThrow("strict SemVer");
	}
});

test("legacy expected-version flag is rejected with local selection guidance", () => {
	for (const arg of ["--expect-pi-version", "--expect-pi-version=1.0.0"]) {
		expect(() => rejectLegacyPiVersionArgument([arg])).toThrow("--pi, PI_CLI, or PATH");
	}
});

test("only complete passes promote, equal versions refresh, and downgrades are scope-local", async () => {
	const initial = await beginHarnessAcceptance("pi", "smoke", await cli("2.0.0-rc.1"), options);
	await initial.finish({ status: "passed", complete: true, checks: ["first"] });
	for (const result of [
		{ status: "failed", complete: true },
		{ status: "blocked", complete: false },
		{ status: "passed", complete: false },
	] as const) {
		const run = await beginHarnessAcceptance("pi", "smoke", await cli("3.0.0"), options);
		await run.finish({ ...result, checks: ["incomplete"] });
		expect((await record()).scopes.smoke!.version).toBe("2.0.0-rc.1");
	}
	await expect(beginHarnessAcceptance("pi", "smoke", await cli("2.0.0-beta"), options)).rejects.toThrow("highest passed");
	const equal = await beginHarnessAcceptance("pi", "smoke", await cli("2.0.0-rc.1+rebuilt"), options);
	await equal.finish({ status: "passed", complete: true, checks: ["refreshed"] });
	expect((await record()).scopes.smoke!.checks).toEqual(["refreshed"]);
	expect((await record()).scopes.smoke!.version).toBe("2.0.0-rc.1+rebuilt");
	const other = await beginHarnessAcceptance("pi", "other", await cli("1.0.0"), options);
	await other.finish({ status: "passed", complete: true, checks: ["independent"] });
	expect((await record()).scopes.other!.version).toBe("1.0.0");
	const stable = await beginHarnessAcceptance("pi", "smoke", await cli("2.0.0"), options);
	await stable.finish({ status: "passed", complete: true, checks: ["stable"] });
	expect((await record()).scopes.smoke!.version).toBe("2.0.0");
	expect((await evidence()).filter((entry) => entry.status === "blocked").length).toBe(2);
});

test("concurrent scope publications merge and stale runs cannot lower a scope", async () => {
	const low = await beginHarnessAcceptance("pi", "shared", await cli("1.0.0"), options);
	const high = await beginHarnessAcceptance("pi", "shared", await cli("2.0.0"), options);
	const other = await beginHarnessAcceptance("pi", "other", await cli("3.0.0"), options);
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
	const run = await beginHarnessAcceptance("pi", "locked", await cli("1.0.0"), { ...options, lockTimeoutMs: 20 });
	await mkdir(`${options.recordPath!}.lock`);
	await expect(run.finish({ status: "passed", complete: true, checks: ["pass"] })).rejects.toThrow("Timed out");
	await expect(readFile(options.recordPath!)).rejects.toThrow();
	expect((await evidence())[0]!.publicationError).toContain("Timed out");
});

test("invalid CLI versions block and retain execution provenance without a success record", async () => {
	await expect(beginHarnessAcceptance("pi", "invalid", await cli("v1.0.0"), options)).rejects.toThrow("strict SemVer");
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
	await expect(beginHarnessAcceptance("pi", "hung", hanging, options)).rejects.toThrow("timed out after 4000ms");
	await expect(readFile(options.recordPath!)).rejects.toThrow();
	const [saved] = await evidence();
	expect(saved!.status).toBe("blocked");
	expect(saved!.cli.path).toBe(hanging.path);
}, 15_000);

test("acceptance artifacts are excluded even when not gitignored", async () => {
	const visibleOptions = { ...options, recordPath: path.join(root, "acceptance.json"), evidenceDir: path.join(root, "evidence") };
	const first = await beginHarnessAcceptance("pi", "one", await cli("1.0.0"), visibleOptions);
	const second = await beginHarnessAcceptance("pi", "two", await cli("1.0.0"), visibleOptions);
	await first.finish({ status: "passed", complete: true, checks: ["one"] });
	await second.finish({ status: "passed", complete: true, checks: ["two"] });
	const saved = JSON.parse(await readFile(visibleOptions.recordPath, "utf8"));
	expect(Object.keys(saved.scopes).sort()).toEqual(["one", "two"]);
});

test("Pi and OMP publications do not invalidate each other's source evidence", async () => {
	await mkdir(path.join(root, "framework/docs"), { recursive: true });
	for (const host of ["pi", "omp"] as const) {
		await writeFile(path.join(root, `framework/docs/${host}-acceptance.json`), '{"schemaVersion":1,"scopes":{}}\n');
	}
	await git("add", ".");
	await git("-c", "user.name=Acceptance Test", "-c", "user.email=acceptance@example.invalid", "commit", "-m", "empty acceptance records");
	const pi = await beginHarnessAcceptance("pi", "shared", await cli("1.0.0"), { ...options, recordPath: undefined });
	const omp = await beginHarnessAcceptance("omp", "shared", await cli("18.6.0"), { ...options, recordPath: undefined });
	await pi.finish({ status: "passed", complete: true, checks: ["pi observed"] });
	await omp.finish({ status: "passed", complete: true, checks: ["omp observed"] });
	for (const [host, version] of [["pi", "1.0.0"], ["omp", "18.6.0"]]) {
		const saved = JSON.parse(await readFile(path.join(root, `framework/docs/${host}-acceptance.json`), "utf8"));
		expect(saved.scopes.shared.version).toBe(version);
	}
});

// Paired regression must retain real version evidence without dirtying the
// checked-out acceptance ledger, and must still enforce its version floor.
test("evidence-only regression honors the checked-in version floor without publishing", async () => {
	const ledger = path.join(root, "framework/docs/pi-acceptance.json");
	const baseline = '{"schemaVersion":1,"scopes":{"workflow-chat":{"scope":"workflow-chat","version":"2.0.0"}}}\n';
	await mkdir(path.dirname(ledger), { recursive: true });
	await writeFile(ledger, baseline);
	await git("add", "framework/docs/pi-acceptance.json");
	await git("-c", "user.name=Acceptance Test", "-c", "user.email=acceptance@example.invalid", "commit", "-m", "version floor");
	const archive = options.evidenceDir!;
	const previous = process.env.HARNESS_ACCEPTANCE_EVIDENCE_DIR;
	process.env.HARNESS_ACCEPTANCE_EVIDENCE_DIR = archive;
	try {
		const isolated = { repoRoot: root };
		await expect(beginHarnessAcceptance("pi", "workflow-chat", await cli("1.9.0"), isolated)).rejects.toThrow("highest passed version 2.0.0");
		const run = await beginHarnessAcceptance("pi", "workflow-chat", await cli("2.1.0"), isolated);
		await run.finish({ status: "passed", complete: true, checks: ["actual regression"] });
		expect(await readFile(ledger, "utf8")).toBe(baseline);
		const entries = await evidence();
		expect(entries.find((entry) => entry.version === "1.9.0")?.status).toBe("blocked");
		expect(entries.find((entry) => entry.version === "2.1.0")).toMatchObject({ status: "passed", complete: true, checks: ["actual regression"] });
	} finally {
		if (previous === undefined) delete process.env.HARNESS_ACCEPTANCE_EVIDENCE_DIR;
		else process.env.HARNESS_ACCEPTANCE_EVIDENCE_DIR = previous;
	}
});

test("host selection failures are retained without a success record", async () => {
	await expect(beginHarnessAcceptance("omp", "dock", async () => { throw new Error("No selected local OMP"); }, options)).rejects.toThrow("No selected local OMP");
	await expect(readFile(options.recordPath!)).rejects.toThrow();
	const [saved] = await evidence();
	expect(saved!.status).toBe("blocked");
});

test("OMP label normalization does not loosen Pi or strict SemVer policy", async () => {
	const omp = await beginHarnessAcceptance("omp", "label", await cli("omp/18.20.0-rc.1+local"), options);
	expect(omp.version).toBe("18.20.0-rc.1+local");
	await omp.finish({ status: "passed", complete: true, checks: ["version normalization"] });
	await expect(beginHarnessAcceptance("pi", "label", await cli("omp/18.20.0"), options)).rejects.toThrow("strict SemVer");
	await expect(beginHarnessAcceptance("omp", "label", await cli("omp/v18.20.0"), options)).rejects.toThrow("strict SemVer");
});

test("OMP runner only certifies canonical unfiltered scheduling", () => {
	expect(isCompleteOmpRun([], {})).toBe(true);
	expect(isCompleteOmpRun(["--parallel=4"], {})).toBe(true);
	for (const args of [["--test-name-pattern", ".*"], ["--only"], ["--todo"], ["--bail"], ["tests/harness-dock/one.test.ts"], ["--parallel=4", "--test-name-pattern=one"]]) {
		expect(isCompleteOmpRun(args, {})).toBe(false);
	}
	expect(isCompleteOmpRun([], { CHIEF_MAP_UNAVAILABLE_HOST: "omp" })).toBe(false);
});

test("JUnit promotion requires executed cases and every expected file", () => {
	const file = "tests/harness-dock/one.test.ts";
	const report = `<testsuites tests="1" failures="0" skipped="0"><testsuite name="${file}" tests="1"><testcase name="executed" /></testsuite></testsuites>`;
	expect(hasCompleteOmpReport(report, [file], root)).toBe(true);
	expect(hasCompleteOmpReport(report, [file, "tests/harness-dock/missing.test.ts"], root)).toBe(false);
	expect(hasCompleteOmpReport(report.replace('skipped="0"', 'skipped="1"'), [file], root)).toBe(false);
	expect(hasCompleteOmpReport(report.replace('<testcase name="executed" />', '<testcase name="unfinished"><skipped /></testcase>'), [file], root)).toBe(false);
	expect(hasCompleteOmpReport(report.replace('tests="1"', 'tests="2"'), [file], root)).toBe(false);
	expect(hasCompleteOmpReport('<testsuites tests="0"></testsuites>', [file], root)).toBe(false);
	expect(hasCompleteOmpReport(report.slice(0, -5), [file], root)).toBe(false);
});

test("TypeScript host argv records its actual Bun interpreter", async () => {
	const script = path.join(root, "ignored", "omp-cli.ts");
	await mkdir(path.dirname(script), { recursive: true });
	await writeFile(script, 'const version: string = "omp/18.20.0"; console.log(version);\n');
	const run = await beginHarnessAcceptance("omp", "typescript-cli", { path: script, command: [process.execPath, script], source: "test-owned TypeScript CLI" }, options);
	await run.finish({ status: "passed", complete: true, checks: ["interpreter provenance"] });
	expect((await evidence())[0]!.runtime.cli.execPath).toBe(process.execPath);
});

test("OMP runner records actual Bun suite failures and refuses filtered promotion", async () => {
	const directory = path.join(root, "tests/harness-dock");
	await mkdir(directory, { recursive: true });
	const fixture = path.join(directory, "runner.test.ts");
	await writeFile(fixture, 'import { test, expect } from "bun:test"; test("observed runner case", () => expect(1).toBe(1));\n');
	const selected = await cli("omp/18.6.0");
	expect(await runOmpTests([], { ...options, cli: selected })).toBe(0);
	expect((await record()).scopes.dock!.version).toBe("18.6.0");
	expect(await runOmpTests([], { ...options, all: true, cli: await cli("18.5.0") })).toBe(0);
	expect((await record()).scopes["full-repository"]!.version).toBe("18.5.0");
	expect(await runOmpTests(["--test-name-pattern", "observed"], { ...options, cli: await cli("19.0.0") })).toBe(0);
	expect((await record()).scopes.dock!.version).toBe("18.6.0");
	for (const [version, body] of [
		["19.1.0", 'import { test } from "bun:test"; test("executed", () => {}); test.skip("not executed", () => {});'],
		["19.2.0", 'import { test } from "bun:test"; test("executed", () => {}); test.todo("unfinished");'],
		["19.3.0", "export {};"],
	]) {
		await writeFile(fixture, body!);
		const code = await runOmpTests([], { ...options, cli: await cli(version!) });
		if (version !== "19.3.0") expect(code).toBe(0);
		expect((await record()).scopes.dock!.version).toBe("18.6.0");
		const result = (await evidence()).find(entry => entry.version === version)!;
		expect(result.complete).toBe(false);
		expect(result.status).toBe(code === 0 ? "passed" : "failed");
	}
	await writeFile(fixture, 'import { test, expect } from "bun:test"; test("observed runner failure", () => expect(1).toBe(2));\n');
	expect(await runOmpTests([], { ...options, cli: await cli("20.0.0") })).not.toBe(0);
	expect((await record()).scopes.dock!.version).toBe("18.6.0");
	expect((await evidence()).find(entry => entry.version === "20.0.0")!.status).toBe("failed");
	await expect(runOmpTests([], { ...options, cli: await cli("18.5.0") })).rejects.toThrow("highest passed");
}, 20_000);

test("source mutations during a run block promotion and retain execution evidence", async () => {
	const run = await beginHarnessAcceptance("pi", "changing", await cli("1.0.0"), options);
	await writeFile(path.join(root, "source.ts"), "export const changed = true;\n");
	await expect(run.finish({ status: "passed", complete: true, checks: ["observed"] })).rejects.toThrow("Source changed");
	await expect(readFile(options.recordPath!)).rejects.toThrow();
	const [saved] = await evidence();
	expect(saved!.status).toBe("blocked");
	expect(saved!.source.sha256).not.toBe(saved!.finishedSource.sha256);
});

test("source evidence distinguishes tracked and untracked changes at the same HEAD", async () => {
	const clean = await beginHarnessAcceptance("pi", "source", await cli("1.0.0"), options);
	await clean.finish({ status: "passed", complete: true, checks: ["clean"] });
	const first = (await record()).scopes.source!;
	await writeFile(path.join(root, "source.ts"), "export const value = 2;\n");
	await writeFile(path.join(root, "new.ts"), "export const fresh = true;\n");
	const dirty = await beginHarnessAcceptance("pi", "source", await cli("1.0.0"), options);
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
