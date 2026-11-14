/** Historical baseline evidence readers. Host selection lives in installed-omp.ts. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
export function resolveRecordPath(
	recordedPath: string,
	repoRoot: string = REPO_ROOT,
	env: Record<string, string | undefined> = process.env,
): string {
	const recordRoot = env.OMP_BASELINE_RECORD_ROOT?.trim() || repoRoot;
	return path.isAbsolute(recordedPath) ? recordedPath : path.resolve(recordRoot, recordedPath);
}

function readJson(file: string): unknown {
	return JSON.parse(readFileSync(file, "utf8"));
}

export function readBaselineRecord(file: string = BASELINE_RECORD_PATH): BaselineRecord {
	return readJson(file) as BaselineRecord;
}

export function sha256File(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
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
