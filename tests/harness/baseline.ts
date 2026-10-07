/**
 * Baseline record: the single checkable correspondence between the agent-runtime
 * revision anchor, the artifact that actually runs during acceptance, and the
 * dependency lockfiles of this repository and of the behavior oracle.
 *
 * The record itself is data (`docs/agent-runtime-baseline.json`); this module only
 * reads it, materialises the isolated install it names, and re-checks the claimed
 * correspondences. It never re-derives the byte-identity *reasoning* of decision 03,
 * it re-checks the same file set.
 *
 * Default and CI always select the recorded supported version. The candidate path is
 * opt-in through the runtime parameter `OMP_TEST_VERSION=<v>` (`selectRuntimeVersion`):
 * it materialises that exact version into its own isolated prefix and is a regression
 * alarm, never a support claim.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";

export interface ByteIdentityFileRecord {
	readonly path: string;
	readonly sha256: string;
}

export interface LockfileRecord {
	readonly path: string;
	readonly sha256: string;
}

export interface RevisionAnchorRecord {
	readonly kind: string;
	readonly path: string;
	readonly commit: string;
	readonly tag?: string;
	readonly version: string;
	readonly role?: string;
}

export interface AcceptanceArtifactRecord {
	readonly kind: string;
	readonly dependencySpec: string;
	readonly prefix: string;
	readonly installCommand: string;
	readonly cliEntry: string;
	readonly role?: string;
	readonly byteIdentity: {
		readonly source: string;
		readonly method: string;
		readonly conclusion: string;
		readonly files: readonly ByteIdentityFileRecord[];
	};
}

export interface BaselineRecord {
	readonly recorded: string;
	readonly agentRuntime: {
		readonly package: string;
		readonly supportedVersion: string;
		readonly revisionAnchor: RevisionAnchorRecord;
		readonly acceptanceArtifact: AcceptanceArtifactRecord;
	};
	readonly sourceCombination: {
		readonly repository: string;
		readonly revisionAtRecord: string;
		readonly lockfile: LockfileRecord;
	};
	readonly oracle: {
		readonly repository: string;
		readonly path: string;
		readonly revision: string;
		readonly role?: string;
		readonly lockfile: LockfileRecord;
	};
	readonly environment: {
		readonly platform: string;
		readonly arch: string;
		readonly bun: string;
		readonly nativesBuilt: boolean;
		readonly checkoutRunsFullSession: boolean;
		readonly conditions: readonly string[];
	};
}

export interface IsolatedRuntimeLayout {
	readonly prefix: string;
	readonly packageRoot: string;
	readonly cliPath: string;
}

export interface IsolatedRuntime {
	readonly version: string;
	readonly prefix: string;
	readonly packageRoot: string;
	readonly cliPath: string;
	readonly prebuiltNatives: {
		readonly packages: readonly string[];
		readonly binaries: readonly string[];
	};
}

export interface ByteIdentityComparison {
	readonly path: string;
	readonly anchorSha256: string | null;
	readonly artifactSha256: string | null;
	readonly identical: boolean;
}

export interface LockfileComparison {
	readonly path: string;
	readonly recordedSha256: string;
	readonly actualSha256: string | null;
	readonly matches: boolean;
}

export interface CheckoutCommit {
	readonly commit: string | null;
	readonly error: string | null;
}

/** `tests/harness` -> repository root. */
export const HARNESS_DIR = import.meta.dir;
export const REPO_ROOT = path.resolve(HARNESS_DIR, "..", "..");
export const BASELINE_RECORD_PATH = path.join(REPO_ROOT, "docs", "agent-runtime-baseline.json");

/**
 * Resolve a path recorded in the baseline. Cross-repository paths are recorded
 * relative to this repository (sibling checkouts) but may be absolute.
 */
export function resolveRecordPath(recordedPath: string, repoRoot: string = REPO_ROOT): string {
	return path.isAbsolute(recordedPath) ? recordedPath : path.resolve(repoRoot, recordedPath);
}

function readJson(file: string): unknown {
	return JSON.parse(readFileSync(file, "utf8"));
}

export function readBaselineRecord(file: string = BASELINE_RECORD_PATH): BaselineRecord {
	return readJson(file) as BaselineRecord;
}

/**
 * The runtime parameter that selects the version under test (decision 07/08). It is the
 * only way to move the harness off the recorded baseline, and it never changes what the
 * record declares as supported.
 */
export const OMP_TEST_VERSION_ENV = "OMP_TEST_VERSION";

export interface VersionSelection {
	/** The version the harness materialises and every controlled run executes. */
	readonly version: string;
	/** Where the selection came from. */
	readonly source: "runtime-parameter" | "recorded-baseline";
	/** True when `version` is exactly the recorded supported version. */
	readonly recordedSupported: boolean;
}

/**
 * Resolve the version under test. Default (and CI): the recorded supported version, so a
 * normal suite run always exercises the fixed baseline. A candidate is opt-in through the
 * runtime parameter `OMP_TEST_VERSION=<v>` and is a regression alarm, never a support claim.
 */
export function selectRuntimeVersion(
	record: BaselineRecord,
	env: Record<string, string | undefined> = process.env,
): VersionSelection {
	const requested = env[OMP_TEST_VERSION_ENV]?.trim();
	if (requested !== undefined && requested.length > 0) {
		return {
			version: requested,
			source: "runtime-parameter",
			recordedSupported: requested === record.agentRuntime.supportedVersion,
		};
	}
	return {
		version: record.agentRuntime.supportedVersion,
		source: "recorded-baseline",
		recordedSupported: true,
	};
}

/** A version that is safe to use verbatim as one directory-name segment. */
const INSTALL_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/;

/**
 * The isolated prefix for one version: the recorded prefix's parent directory plus the
 * version, so a candidate never reuses or overwrites the fixed baseline's install.
 */
export function isolatedRuntimePrefix(
	record: BaselineRecord,
	version: string,
	repoRoot: string = REPO_ROOT,
): string {
	if (!INSTALL_VERSION_PATTERN.test(version)) {
		throw new Error(
			`refusing to use ${JSON.stringify(version)} as an isolated install directory name; an install version must be a single plain path segment`,
		);
	}
	const base = path.dirname(path.resolve(repoRoot, record.agentRuntime.acceptanceArtifact.prefix));
	return path.join(base, version);
}

/**
 * Directory layout for one version, resolved against a repository root. The default version
 * is what `selectRuntimeVersion` resolves, so callers that drive a session follow the
 * runtime parameter automatically.
 */
export function isolatedRuntimeLayout(
	record: BaselineRecord,
	repoRoot: string = REPO_ROOT,
	version: string = selectRuntimeVersion(record).version,
): IsolatedRuntimeLayout {
	const prefix = isolatedRuntimePrefix(record, version, repoRoot);
	const packageRoot = path.join(prefix, "node_modules", record.agentRuntime.package);
	return { prefix, packageRoot, cliPath: path.join(packageRoot, record.agentRuntime.acceptanceArtifact.cliEntry) };
}

export function sha256File(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function installedVersion(packageRoot: string): string | null {
	const manifest = path.join(packageRoot, "package.json");
	if (!existsSync(manifest)) return null;
	const parsed = readJson(manifest) as { version?: string };
	return parsed.version ?? null;
}

function detectPrebuiltNatives(prefix: string): IsolatedRuntime["prebuiltNatives"] {
	const scope = path.join(prefix, "node_modules", "@oh-my-pi");
	if (!existsSync(scope)) return { packages: [], binaries: [] };
	const packages = readdirSync(scope).filter(name => name.startsWith("pi-natives"));
	const binaries: string[] = [];
	for (const name of packages) {
		const dir = path.join(scope, name);
		if (!statSync(dir).isDirectory()) continue;
		for (const entry of readdirSync(dir)) {
			if (entry.endsWith(".node")) binaries.push(path.join(name, entry));
		}
	}
	return { packages, binaries };
}

function describeRuntime(
	record: BaselineRecord,
	layout: IsolatedRuntimeLayout,
): IsolatedRuntime {
	const version = installedVersion(layout.packageRoot);
	if (version === null) {
		throw new Error(
			`isolated runtime is not installed at ${layout.packageRoot}; call ensureIsolatedRuntime() first`,
		);
	}
	return {
		version,
		prefix: layout.prefix,
		packageRoot: layout.packageRoot,
		cliPath: layout.cliPath,
		prebuiltNatives: detectPrebuiltNatives(layout.prefix),
	};
}

/**
 * Materialise the isolated exact install of the version under test (`selectRuntimeVersion`:
 * the recorded supported version by default, the `OMP_TEST_VERSION` candidate when set).
 * Idempotent: an existing install of that exact version is reused, otherwise the dependency
 * is installed into a sibling staging directory that is renamed into place, so concurrent
 * callers cannot observe a half-written prefix. Everything lands under the isolated prefix;
 * the default global install, formal configuration and any running agent are never touched.
 */
export async function ensureIsolatedRuntime(
	record: BaselineRecord = readBaselineRecord(),
	repoRoot: string = REPO_ROOT,
): Promise<IsolatedRuntime> {
	return ensureIsolatedVersion(record, selectRuntimeVersion(record).version, repoRoot);
}

/** The same materialisation for an explicitly named version. */
export async function ensureIsolatedVersion(
	record: BaselineRecord,
	version: string,
	repoRoot: string = REPO_ROOT,
): Promise<IsolatedRuntime> {
	const { prefix, packageRoot, cliPath } = isolatedRuntimeLayout(record, repoRoot, version);
	const layout = { prefix, packageRoot, cliPath };
	if (installedVersion(packageRoot) === version) {
		return describeRuntime(record, layout);
	}

	const staging = `${prefix}.staging-${process.pid}-${Date.now()}`;
	mkdirSync(staging, { recursive: true });
	writeFileSync(
		path.join(staging, "package.json"),
		`${JSON.stringify(
			{
				name: "omp-baseline-prefix",
				private: true,
				dependencies: { [record.agentRuntime.package]: version },
			},
			null,
			"\t",
		)}\n`,
	);

	const install = Bun.spawn(["bun", "install"], {
		cwd: staging,
		env: process.env as Record<string, string>,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(install.stdout).text(),
		new Response(install.stderr).text(),
		install.exited,
	]);
	if (exitCode !== 0) {
		rmSync(staging, { recursive: true, force: true });
		throw new Error(
			`isolated install of ${record.agentRuntime.package}@${version} failed (exit ${exitCode})\n${stdout}\n${stderr}`,
		);
	}

	mkdirSync(path.dirname(prefix), { recursive: true });
	try {
		renameSync(staging, prefix);
	} catch {
		// Another caller won the race, or a stale prefix exists: keep the usable one.
		rmSync(staging, { recursive: true, force: true });
	}

	const installed = installedVersion(packageRoot);
	if (installed !== version) {
		throw new Error(
			`isolated install at ${packageRoot} reports version ${installed ?? "<missing>"}, expected ${version}`,
		);
	}
	return describeRuntime(record, layout);
}

/** Re-check the anchor<->artifact file identity claimed by the record. */
export function verifyArtifactByteIdentity(
	record: BaselineRecord = readBaselineRecord(),
	repoRoot: string = REPO_ROOT,
): ByteIdentityComparison[] {
	// Always the recorded artifact: the byte-identity claim is about the fixed baseline
	// install, independent of any candidate the runtime parameter names.
	const { packageRoot } = isolatedRuntimeLayout(record, repoRoot, record.agentRuntime.supportedVersion);
	const anchorRoot = path.join(resolveRecordPath(record.agentRuntime.revisionAnchor.path, repoRoot), "packages", "coding-agent", "src");
	return record.agentRuntime.acceptanceArtifact.byteIdentity.files.map(file => {
		const anchorFile = path.join(anchorRoot, file.path);
		const artifactFile = path.join(packageRoot, "src", file.path);
		const anchorSha256 = existsSync(anchorFile) ? sha256File(anchorFile) : null;
		const artifactSha256 = existsSync(artifactFile) ? sha256File(artifactFile) : null;
		return {
			path: file.path,
			anchorSha256,
			artifactSha256,
			identical: anchorSha256 !== null && anchorSha256 === artifactSha256,
		};
	});
}

export function verifyLockfile(
	lockfile: LockfileRecord,
	repoRoot: string = REPO_ROOT,
): LockfileComparison {
	const file = path.resolve(repoRoot, lockfile.path);
	const actualSha256 = existsSync(file) ? sha256File(file) : null;
	return { path: lockfile.path, recordedSha256: lockfile.sha256, actualSha256, matches: actualSha256 === lockfile.sha256 };
}

export function readCheckoutCommit(checkoutPath: string): CheckoutCommit {
	if (!existsSync(checkoutPath)) {
		return { commit: null, error: `checkout path does not exist: ${checkoutPath}` };
	}
	const result = Bun.spawnSync(["git", "-C", checkoutPath, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
	const commit = result.stdout.toString().trim();
	if (result.exitCode !== 0 || commit.length === 0) {
		return { commit: null, error: `git rev-parse HEAD failed in ${checkoutPath}: ${result.stderr.toString().trim()}` };
	}
	return { commit, error: null };
}
