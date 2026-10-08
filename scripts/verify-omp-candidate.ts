/**
 * Upgrade-regression runner for an oh-my-pi candidate (P34, decision 07/08, acceptance plan §9).
 *
 * The long-term upgrade standard covers framework capabilities only: this script installs one
 * exact version into its own isolated prefix, runs the framework suite (`tests/framework`, the
 * C1–C15 alarm) against it, and writes a checkable result record next to that install. It does
 * not run the extension suite (that one runs permanently on the fixed version) and it does not
 * decide anything: a green run is a regression alarm, never a support claim.
 *
 * Usage
 *   bun scripts/verify-omp-candidate.ts                     # fixed supported version: install + framework suite + record
 *   OMP_TEST_VERSION=18.6.1 bun scripts/verify-omp-candidate.ts
 *   bun scripts/verify-omp-candidate.ts --dry-run           # print the resolved plan, change nothing
 *   bun scripts/verify-omp-candidate.ts --install-only      # isolate-install only, do not run the suite
 *
 * Isolation: the only writes are under the isolated prefix (`.cache/omp-baseline/<version>`,
 * gitignored) and OS temp directories the harness manages. The default global install, formal
 * configuration and any running agent are never touched, and the candidate version never enters
 * the baseline record (`docs/agent-runtime-baseline.json` keeps declaring 18.5.0 until a
 * maintainer replaces it explicitly).
 */
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import {
	type IsolatedRuntime,
	type IsolatedRuntimeLayout,
	REPO_ROOT,
	ensureIsolatedVersion,
	isolatedRuntimeLayout,
	readBaselineRecord,
	selectRuntimeVersion,
} from "../tests/harness/index";

const RECORD_NAME = "candidate-verification.json";
const FRAMEWORK_SUITE = ["bun", "test", "tests/framework"] as const;
const FLAGS = ["--dry-run", "--install-only", "--help", "-h"] as const;

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
	readonly prebuiltNatives: IsolatedRuntime["prebuiltNatives"];
	readonly isolation: {
		readonly isolatedBase: string;
		readonly prefixUnderIsolatedBase: boolean;
		readonly defaultGlobalInstallTouched: false;
		readonly formalConfigurationTouched: false;
		readonly runningAgentTouched: false;
		readonly agentState: "temporary directory per run (harness)";
	};
	readonly install: { readonly command: string; readonly exitCode: number | null; readonly error: string | null };
	readonly frameworkSuite: null | {
		readonly command: string;
		readonly exitCode: number;
		readonly pass: number | null;
		readonly fail: number | null;
		readonly ran: number | null;
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
const selection = selectRuntimeVersion(record);

let layout: IsolatedRuntimeLayout;
try {
	layout = isolatedRuntimeLayout(record, REPO_ROOT, selection.version);
} catch (error) {
	console.error(`[upgrade] refusing to run: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(2);
}

const recordPath = path.join(layout.prefix, RECORD_NAME);
const isolatedBase = path.dirname(path.resolve(REPO_ROOT, record.agentRuntime.acceptanceArtifact.prefix));
const relativeToBase = path.relative(isolatedBase, layout.prefix);
const prefixUnderIsolatedBase =
	relativeToBase.length > 0 && !relativeToBase.startsWith("..") && !path.isAbsolute(relativeToBase);
const dependencySpec = `${record.agentRuntime.package}@${selection.version}`;

console.log(`[upgrade] version under test:  ${selection.version} (${selection.source})`);
console.log(`[upgrade] recorded supported:  ${record.agentRuntime.supportedVersion}`);
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
let prebuiltNatives: IsolatedRuntime["prebuiltNatives"] = { packages: [], binaries: [] };
let installExitCode: number | null = null;
let installError: string | null = null;
let frameworkSuite: CandidateVerification["frameworkSuite"] = null;

try {
	const runtime = await ensureIsolatedVersion(record, selection.version);
	installedVersion = runtime.version;
	prebuiltNatives = runtime.prebuiltNatives;
	installExitCode = 0;
	console.log(`[upgrade] installed version:   ${runtime.version} at ${runtime.packageRoot}`);
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
	recordedSupportedVersion: record.agentRuntime.supportedVersion,
	isRecordedSupportedVersion: selection.recordedSupported,
	dependencySpec,
	prefix: path.relative(REPO_ROOT, layout.prefix).replace(/\\/g, "/"),
	installedVersion,
	prebuiltNatives,
	isolation: {
		isolatedBase: path.relative(REPO_ROOT, isolatedBase).replace(/\\/g, "/"),
		prefixUnderIsolatedBase,
		defaultGlobalInstallTouched: false,
		formalConfigurationTouched: false,
		runningAgentTouched: false,
		agentState: "temporary directory per run (harness)",
	},
	install: { command: "bun install in the isolated prefix", exitCode: installExitCode, error: installError },
	frameworkSuite,
	regressionAlarm,
	certification:
		"none: a green framework suite is a regression alarm only. Replacing the supported version is an explicit maintainer action (edit SUPPORTED_AGENT_RUNTIME_VERSIONS in framework/core/baseline.ts, update docs/agent-runtime-support.md, restart), and an upgrade that touches an extension-visible surface additionally needs one human TUI spot check.",
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
