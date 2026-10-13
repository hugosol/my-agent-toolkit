/**
 * Upgrade-regression runner for an oh-my-pi candidate (P34, decision 07/08, acceptance plan §9).
 *
 * The long-term upgrade standard covers framework capabilities only: this script installs one
 * exact version into its own isolated prefix, runs the framework suite (`tests/framework`, the
 * C1–C15 alarm) against it, and writes a checkable result record next to that install. The record
 * names the exact harness version, its revision anchor, this repository's own source revision
 * (base commit plus a digest of the working tree), the dependency lockfiles, the environment, and
 * the scope the run did and did not cover — so a green alarm is read for exactly what it is. It
 * does not run the extension suite (that one runs permanently on the fixed version) and it does
 * not decide anything: a green run is a regression alarm, never a support claim.
 *
 * Usage
 *   bun scripts/verify-omp-candidate.ts                     # fixed supported version: install + framework suite + record
 *   OMP_TEST_VERSION=18.6.1 bun scripts/verify-omp-candidate.ts
 *   bun scripts/verify-omp-candidate.ts --dry-run           # print the resolved plan, change nothing
 *   bun scripts/verify-omp-candidate.ts --install-only      # isolate-install only, do not run the suite
 *
 * Isolation: the only writes are under the isolated prefix (`.cache/omp-baseline/<version>`,
 * gitignored) and OS temp directories the dock manages. The default global install, formal
 * configuration and any running agent are never touched, and the candidate version never enters
 * the baseline record (`framework/docs/harness-baseline.json` keeps declaring 18.5.0 until a
 * maintainer replaces it explicitly).
 */
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
	type IsolatedHarness,
	type IsolatedHarnessLayout,
	type LockfileComparison,
	REPO_ROOT,
	ensureIsolatedVersion,
	isolatedHarnessLayout,
	readBaselineRecord,
	resolveRecordPath,
	selectHarnessVersion,
	sha256File,
	verifyLockfile,
} from "../tests/harness-dock/index";

const RECORD_NAME = "candidate-verification.json";
const FRAMEWORK_SUITE = ["bun", "test", "tests/framework"] as const;
const FLAGS = ["--dry-run", "--install-only", "--help", "-h"] as const;

/**
 * The repository's own source revision, as the record names it.
 *
 * A development run's working tree is not a commit, so the record names both: the commit the tree is
 * based on and a digest over every file the tree carries. Pointing a base commit at uncommitted
 * source would name code the commit does not contain.
 */
interface SourceRevision {
	/** The commit the working tree is based on, or `null` when git could not answer. */
	readonly baseCommit: string | null;
	/** Whether the working tree differs from that commit, untracked files included. */
	readonly dirty: boolean;
	/** The paths that differ, as git reports them. */
	readonly changedPaths: readonly string[];
	/** One digest over every tracked-or-untracked source file, in path order. */
	readonly workingTreeDigest: string;
}

/** One run's checkable result record, written next to the isolated install. */
interface CandidateVerification {
	readonly recorded: string;
	readonly runtimeParameter: string;
	readonly requestedVersion: string;
	readonly selectionSource: "runtime-parameter" | "recorded-baseline";
	readonly recordedSupportedVersion: string;
	readonly isRecordedSupportedVersion: boolean;
	readonly dependencySpec: string;
	readonly prefix: string;
	readonly installedVersion: string | null;
	readonly prebuiltNatives: IsolatedHarness["prebuiltNatives"];
	readonly revisionAnchor: { readonly path: string; readonly commit: string; readonly tag?: string };
	readonly source: SourceRevision;
	readonly lockfiles: readonly LockfileComparison[];
	readonly environment: { readonly platform: string; readonly arch: string; readonly bun: string };
	readonly isolation: {
		readonly isolatedBase: string;
		readonly prefixUnderIsolatedBase: boolean;
		readonly defaultGlobalInstallTouched: false;
		readonly formalConfigurationTouched: false;
		readonly runningAgentTouched: false;
		readonly agentState: "temporary directory per run (dock)";
	};
	readonly install: { readonly command: string; readonly exitCode: number | null; readonly error: string | null };
	readonly frameworkSuite: null | {
		readonly command: string;
		readonly exitCode: number;
		readonly pass: number | null;
		readonly fail: number | null;
		readonly ran: number | null;
	};
	readonly coverage: {
		/** The suites this run executed, in order. */
		readonly executed: readonly string[];
		/** What this run does not exercise, so a green alarm is never read as a full verification. */
		readonly unverified: readonly string[];
	};
	readonly regressionAlarm: "green" | "red" | "not-run";
	readonly certification: string;
}

function usage(): string {
	return [
		"Usage: bun scripts/verify-omp-candidate.ts [--dry-run] [--install-only]",
		"",
		"  (no flags)       install the version under test and run the framework suite; write the result record",
		"  --dry-run        print the resolved version, prefix and command; install and run nothing",
		"  --install-only   materialise the isolated install only, do not run the suite",
		"",
		"Version under test: OMP_TEST_VERSION=<v> selects a candidate; unset selects the recorded",
		"supported version. Default and CI only ever run the recorded supported version.",
	].join("\n");
}

/** The last numeric capture of `pattern` in the suite output, or null when absent. */
function lastCount(text: string, pattern: RegExp): number | null {
	const matches = [...text.matchAll(pattern)];
	const last = matches[matches.length - 1];
	return last?.[1] === undefined ? null : Number(last[1]);
}

/**
 * One git query's stdout without its trailing newline, or null when git could not answer.
 *
 * Only the end is trimmed: `git status --porcelain` line columns are part of the reading, and
 * trimming the start eats the first line's first character (the record would name `LOSSARY-MAP.md`
 * for `GLOSSARY-MAP.md`).
 */
function gitText(args: readonly string[]): string | null {
	const result = Bun.spawnSync(["git", ...args], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
	return result.exitCode === 0 ? result.stdout.toString().trimEnd() : null;
}

/**
 * The repository's own source revision: the base commit, what differs from it, and one digest over
 * every file the tree carries.
 *
 * The digest is what makes the run reproducible from its own record: a base commit alone would name
 * the commit's code, and a development tree is not that commit.
 */
function sourceRevision(): SourceRevision {
	const files = (gitText(["ls-files", "--cached", "--others", "--exclude-standard"]) ?? "")
		.split("\n")
		.filter(file => file.length > 0)
		.sort();
	const digest = createHash("sha256");
	for (const file of files) {
		const absolute = path.join(REPO_ROOT, file);
		digest.update(file);
		digest.update("\0");
		digest.update(existsSync(absolute) ? sha256File(absolute) : "<absent>");
		digest.update("\n");
	}
	const changedPaths = (gitText(["status", "--porcelain"]) ?? "")
		.split("\n")
		.map(line => line.slice(3))
		.filter(line => line.length > 0);
	return {
		baseCommit: gitText(["rev-parse", "HEAD"]),
		dirty: changedPaths.length > 0,
		changedPaths,
		workingTreeDigest: digest.digest("hex"),
	};
}

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
	console.log(usage());
	process.exit(0);
}
const unknownFlags = argv.filter(argument => !(FLAGS as readonly string[]).includes(argument));
if (unknownFlags.length > 0) {
	console.error(`[upgrade] unknown argument(s): ${unknownFlags.join(", ")}\n\n${usage()}`);
	process.exit(2);
}
const dryRun = argv.includes("--dry-run");
const installOnly = argv.includes("--install-only");

const record = readBaselineRecord();
const selection = selectHarnessVersion(record);

let layout: IsolatedHarnessLayout;
try {
	layout = isolatedHarnessLayout(record, REPO_ROOT, selection.version);
} catch (error) {
	console.error(`[upgrade] refusing to run: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(2);
}

const recordPath = path.join(layout.prefix, RECORD_NAME);
const isolatedBase = path.dirname(path.resolve(REPO_ROOT, record.harness.acceptanceArtifact.prefix));
const relativeToBase = path.relative(isolatedBase, layout.prefix);
const prefixUnderIsolatedBase =
	relativeToBase.length > 0 && !relativeToBase.startsWith("..") && !path.isAbsolute(relativeToBase);
const dependencySpec = `${record.harness.package}@${selection.version}`;

console.log(`[upgrade] version under test:  ${selection.version} (${selection.source})`);
console.log(`[upgrade] recorded supported:  ${record.harness.supportedVersion}`);
console.log(`[upgrade] install spec:        ${dependencySpec}`);
console.log(`[upgrade] isolated prefix:     ${layout.prefix}`);
console.log(`[upgrade] framework suite:     ${FRAMEWORK_SUITE.join(" ")} (C1–C15 regression alarm)`);
console.log(`[upgrade] result record:       ${recordPath}`);
console.log(
	`[upgrade] isolation: all writes stay under ${isolatedBase}; the default global install, formal configuration and any running agent are never touched.`,
);

if (!prefixUnderIsolatedBase) {
	console.error(
		`[upgrade] refusing to run: the isolated prefix ${layout.prefix} is not a direct child of ${isolatedBase}.`,
	);
	process.exit(2);
}

if (dryRun) {
	console.log("[upgrade] dry run: nothing was installed and no suite was run.");
	process.exit(0);
}

let installedVersion: string | null = null;
let prebuiltNatives: IsolatedHarness["prebuiltNatives"] = { packages: [], binaries: [] };
let installExitCode: number | null = null;
let installError: string | null = null;
let frameworkSuite: CandidateVerification["frameworkSuite"] = null;

try {
	const harness = await ensureIsolatedVersion(record, selection.version);
	installedVersion = harness.version;
	prebuiltNatives = harness.prebuiltNatives;
	installExitCode = 0;
	console.log(`[upgrade] installed version:   ${harness.version} at ${harness.packageRoot}`);
} catch (error) {
	installError = error instanceof Error ? error.message : String(error);
	console.error(`[upgrade] isolated install failed: ${installError}`);
}

if (installError === null && !installOnly) {
	const childEnv: Record<string, string> = {};
	for (const [name, value] of Object.entries(process.env)) if (value !== undefined) childEnv[name] = value;
	// The suite has to resolve the same version this script installed, and only the candidate
	// path sets the runtime parameter; the supported path stays the true default.
	if (selection.source === "runtime-parameter") childEnv.OMP_TEST_VERSION = selection.version;
	else delete childEnv.OMP_TEST_VERSION;

	const suite = Bun.spawn([...FRAMEWORK_SUITE], {
		cwd: REPO_ROOT,
		env: childEnv,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(suite.stdout).text(),
		new Response(suite.stderr).text(),
		suite.exited,
	]);
	const output = `${stdout}\n${stderr}`;
	process.stdout.write(stdout);
	if (stderr.trim().length > 0) process.stderr.write(stderr);

	frameworkSuite = {
		command: FRAMEWORK_SUITE.join(" "),
		exitCode,
		pass: lastCount(output, /(\d+)\s+pass\b/g),
		fail: lastCount(output, /(\d+)\s+fail\b/g),
		ran: lastCount(output, /Ran (\d+) tests?\b/g),
	};
}

const regressionAlarm = installError !== null || (frameworkSuite !== null && frameworkSuite.exitCode !== 0)
	? "red"
	: frameworkSuite === null
		? "not-run"
		: "green";

const verification: CandidateVerification = {
	recorded: new Date().toISOString(),
	runtimeParameter: "OMP_TEST_VERSION",
	requestedVersion: selection.version,
	selectionSource: selection.source,
	recordedSupportedVersion: record.harness.supportedVersion,
	isRecordedSupportedVersion: selection.recordedSupported,
	dependencySpec,
	prefix: path.relative(REPO_ROOT, layout.prefix).replace(/\\/g, "/"),
	installedVersion,
	prebuiltNatives,
	revisionAnchor: {
		path: record.harness.revisionAnchor.path,
		commit: record.harness.revisionAnchor.commit,
		tag: record.harness.revisionAnchor.tag,
	},
	source: sourceRevision(),
	lockfiles: [
		verifyLockfile(record.sourceCombination.lockfile),
		verifyLockfile(record.oracle.lockfile, resolveRecordPath(record.oracle.path)),
	],
	environment: { platform: process.platform, arch: process.arch, bun: Bun.version },
	isolation: {
		isolatedBase: path.relative(REPO_ROOT, isolatedBase).replace(/\\/g, "/"),
		prefixUnderIsolatedBase,
		defaultGlobalInstallTouched: false,
		formalConfigurationTouched: false,
		runningAgentTouched: false,
		agentState: "temporary directory per run (dock)",
	},
	install: { command: "bun install in the isolated prefix", exitCode: installExitCode, error: installError },
	frameworkSuite,
	coverage: {
		executed: frameworkSuite === null ? [] : [FRAMEWORK_SUITE.join(" ")],
		unverified: [
			"tests/harness-dock (the isolated harness's own contract and extension integration scenarios)",
			"tests/model-cost, tests/connect-bot, tests/codebase-tools (extension behaviour on the fixed version)",
			"real provider requests, the interactive TUI, and the patched Viewed session host artifact",
		],
	},
	regressionAlarm,
	certification:
		"none: a green framework suite is a regression alarm only. Support is an evidence claim, not a runtime list: the maintainer replaces it by updating framework/docs/harness-support.md and framework/docs/harness-baseline.json (no source declares a supported version, and normal startup reads none), and an upgrade that touches an extension-visible surface additionally needs one human TUI spot check.",
};

writeFileSync(recordPath, `${JSON.stringify(verification, null, "\t")}\n`);

console.log(`[upgrade] regression alarm: ${regressionAlarm}`);
if (frameworkSuite !== null) {
	console.log(
		`[upgrade] framework suite: exit=${frameworkSuite.exitCode} pass=${frameworkSuite.pass ?? "?"} fail=${frameworkSuite.fail ?? "?"} ran=${frameworkSuite.ran ?? "?"}`,
	);
}
console.log(`[upgrade] result record: ${recordPath}`);
console.log(
	"[upgrade] a green run does not certify the candidate; the maintainer replaces the supported version explicitly.",
);
process.exit(installError !== null ? 1 : (frameworkSuite?.exitCode ?? 0));
