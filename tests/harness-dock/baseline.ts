/**
 * Baseline record: the single checkable correspondence between the harness
 * revision anchor, the artifact that actually runs during acceptance, and the
 * dependency lockfiles of this repository and of the behavior oracle.
 *
 * The record itself is data (`framework/docs/harness-baseline.json`); this module only
 * reads it, materialises the isolated install it names, and re-checks the claimed
 * correspondences. It never re-derives the byte-identity *reasoning* of decision 03,
 * it re-checks the same file set.
 *
 * Default and CI always select the recorded supported version. The candidate path is
 * opt-in through the runtime parameter `OMP_TEST_VERSION=<v>` (`selectHarnessVersion`):
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
	/** SHA-256 of the UTF-8 lockfile with CRLF normalized to LF. */
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
	readonly harness: {
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

export interface IsolatedHarnessLayout {
	readonly prefix: string;
	readonly packageRoot: string;
	readonly cliPath: string;
}

export interface IsolatedHarness {
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

/** `tests/harness-dock` -> repository root. */
export const DOCK_DIR = import.meta.dir;
export const REPO_ROOT = path.resolve(DOCK_DIR, "..", "..");
export const BASELINE_RECORD_PATH = path.join(REPO_ROOT, "framework", "docs", "harness-baseline.json");

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
 * only way to move the dock off the recorded baseline, and it never changes what the
 * record declares as supported.
 */
export const OMP_TEST_VERSION_ENV = "OMP_TEST_VERSION";

export interface VersionSelection {
	/** The version the dock materialises and every controlled run executes. */
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
export function selectHarnessVersion(
	record: BaselineRecord,
	env: Record<string, string | undefined> = process.env,
): VersionSelection {
	const requested = env[OMP_TEST_VERSION_ENV]?.trim();
	if (requested !== undefined && requested.length > 0) {
		return {
			version: requested,
			source: "runtime-parameter",
			recordedSupported: requested === record.harness.supportedVersion,
		};
	}
	return {
		version: record.harness.supportedVersion,
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
export function isolatedHarnessPrefix(
	record: BaselineRecord,
	version: string,
	repoRoot: string = REPO_ROOT,
): string {
	if (!INSTALL_VERSION_PATTERN.test(version)) {
		throw new Error(
			`refusing to use ${JSON.stringify(version)} as an isolated install directory name; an install version must be a single plain path segment`,
		);
	}
	const base = path.dirname(path.resolve(repoRoot, record.harness.acceptanceArtifact.prefix));
	return path.join(base, version);
}

/**
 * Directory layout for one version, resolved against a repository root. The default version
 * is what `selectHarnessVersion` resolves, so callers that drive a session follow the
 * runtime parameter automatically.
 */
export function isolatedHarnessLayout(
	record: BaselineRecord,
	repoRoot: string = REPO_ROOT,
	version: string = selectHarnessVersion(record).version,
): IsolatedHarnessLayout {
	const prefix = isolatedHarnessPrefix(record, version, repoRoot);
	const packageRoot = path.join(prefix, "node_modules", record.harness.package);
	return { prefix, packageRoot, cliPath: path.join(packageRoot, record.harness.acceptanceArtifact.cliEntry) };
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

function detectPrebuiltNatives(prefix: string): IsolatedHarness["prebuiltNatives"] {
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

export function describeHarness(
	record: BaselineRecord,
	layout: IsolatedHarnessLayout,
): IsolatedHarness {
	const version = installedVersion(layout.packageRoot);
	if (version === null) {
		throw new Error(
			`isolated harness is not installed at ${layout.packageRoot}; call ensureIsolatedHarness() first`,
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
 * Materialise the isolated exact install of the version under test (`selectHarnessVersion`:
 * the recorded supported version by default, the `OMP_TEST_VERSION` candidate when set).
 * Idempotent: an existing install of that exact version is reused, otherwise the dependency
 * is installed into a sibling staging directory that is renamed into place, so concurrent
 * callers cannot observe a half-written prefix. Everything lands under the isolated prefix;
 * the default global install, formal configuration and any running agent are never touched.
 */
export async function ensureIsolatedHarness(
	record: BaselineRecord = readBaselineRecord(),
	repoRoot: string = REPO_ROOT,
): Promise<IsolatedHarness> {
	return ensureIsolatedVersion(record, selectHarnessVersion(record).version, repoRoot);
}

/** The same materialisation for an explicitly named version. */
export async function ensureIsolatedVersion(
	record: BaselineRecord,
	version: string,
	repoRoot: string = REPO_ROOT,
): Promise<IsolatedHarness> {
	const { prefix, packageRoot, cliPath } = isolatedHarnessLayout(record, repoRoot, version);
	const layout = { prefix, packageRoot, cliPath };
	if (installedVersion(packageRoot) === version) {
		return describeHarness(record, layout);
	}

	const staging = `${prefix}.staging-${process.pid}-${Date.now()}`;
	mkdirSync(staging, { recursive: true });
	writeFileSync(
		path.join(staging, "package.json"),
		`${JSON.stringify(
			{
				name: "omp-baseline-prefix",
				private: true,
				dependencies: { [record.harness.package]: version },
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
			`isolated install of ${record.harness.package}@${version} failed (exit ${exitCode})\n${stdout}\n${stderr}`,
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
	return describeHarness(record, layout);
}

/**
 * Re-check the anchor<->artifact file identity claimed by the record.
 *
 * The anchor half is the *recorded revision's own bytes*, read from the checkout's object database,
 * not the bytes the checkout's working tree happens to hold now: the record names the revision the
 * accepted artifact is byte-identical to, and a checkout that has moved past that revision still
 * carries it. Comparing against a working tree would make this check a claim about the environment's
 * tip instead of about the frozen revision, which is the opposite of what the record is for.
 */
export function verifyArtifactByteIdentity(
	record: BaselineRecord = readBaselineRecord(),
	repoRoot: string = REPO_ROOT,
): ByteIdentityComparison[] {
	// Always the recorded artifact: the byte-identity claim is about the fixed baseline
	// install, independent of any candidate the runtime parameter names.
	const { packageRoot } = isolatedHarnessLayout(record, repoRoot, record.harness.supportedVersion);
	const anchorPath = resolveRecordPath(record.harness.revisionAnchor.path, repoRoot);
	const anchorRevision = record.harness.revisionAnchor.commit;
	return record.harness.acceptanceArtifact.byteIdentity.files.map(file => {
		const anchor = readRevisionFile(anchorPath, anchorRevision, `packages/coding-agent/src/${file.path}`);
		const anchorSha256 = anchor === null ? null : createHash("sha256").update(anchor).digest("hex");
		const artifactFile = path.join(packageRoot, "src", file.path);
		const artifactSha256 = existsSync(artifactFile) ? sha256File(artifactFile) : null;
		return {
			path: file.path,
			anchorSha256,
			artifactSha256,
			identical: anchorSha256 !== null && anchorSha256 === artifactSha256,
		};
	});
}

/** Compare lockfile contents independently of the checkout's LF/CRLF convention. */
export function verifyLockfile(
	lockfile: LockfileRecord,
	repoRoot: string = REPO_ROOT,
): LockfileComparison {
	const file = path.resolve(repoRoot, lockfile.path);
	const actualSha256 = existsSync(file)
		? createHash("sha256").update(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex")
		: null;
	return { path: lockfile.path, recordedSha256: lockfile.sha256, actualSha256, matches: actualSha256 === lockfile.sha256 };
}

/**
 * Whether one checkout's history carries a revision.
 *
 * A record pins the revision a repository's material comes from, and the local checkout of that
 * repository is not guaranteed to be parked there: the frozen baseline an acceptance run is
 * compared against may be an ancestor of whatever that checkout's tip now is (its own later
 * commits can remove the material that was migrated out of it). This asks the checkout the fact a
 * run can rely on — that it descends from the recorded revision — instead of the checkout's tip
 * equalling it, and it never rewrites the recorded revision: the record and the repository stay
 * as the authority names them.
 */
export function checkoutCarries(checkoutPath: string, revision: string): boolean {
	if (!existsSync(checkoutPath)) return false;
	const result = Bun.spawnSync(["git", "-C", checkoutPath, "merge-base", "--is-ancestor", revision, "HEAD"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return result.exitCode === 0;
}

/**
 * The commit a ref names in one checkout, `HEAD` by default.
 *
 * A record identifies the revision its material comes from by both its commit and its tag, so
 * resolving a ref is how the tag half of that identity is checked without moving any checkout.
 */
export function readCheckoutCommit(checkoutPath: string, ref: string = "HEAD"): CheckoutCommit {
	if (!existsSync(checkoutPath)) {
		return { commit: null, error: `checkout path does not exist: ${checkoutPath}` };
	}
	const result = Bun.spawnSync(["git", "-C", checkoutPath, "rev-parse", `${ref}^{commit}`], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const commit = result.stdout.toString().trim();
	if (result.exitCode !== 0 || commit.length === 0) {
		return {
			commit: null,
			error: `git rev-parse ${ref} failed in ${checkoutPath}: ${result.stderr.toString().trim()}`,
		};
	}
	return { commit, error: null };
}

/**
 * One file as one revision's own object carries it, or `null` when that checkout does not carry the
 * revision or the revision does not carry the file.
 *
 * This is what a record's anchor half is checked against: the frozen revision's bytes, which stay
 * reachable in the object database whatever the checkout's working tree or tip has moved on to. The
 * bytes are returned raw rather than decoded, so hashing a binary contract file is as meaningful as
 * hashing a text one.
 */
export function readRevisionFile(checkoutPath: string, revision: string, path: string): Buffer | null {
	if (!existsSync(checkoutPath)) return null;
	const result = Bun.spawnSync(["git", "-C", checkoutPath, "cat-file", "blob", `${revision}:${path}`], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) return null;
	return Buffer.from(result.stdout);
}
