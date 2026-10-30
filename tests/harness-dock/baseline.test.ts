/**
 * The baseline record is only useful if it can be checked. These tests re-check the
 * correspondence it claims: the revision anchor, the artifact that runs acceptance,
 * and the dependency lockfiles of this repository and of the behavior oracle.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	type IsolatedHarness,
	checkoutCarries,
	ensureIsolatedHarness,
	readBaselineRecord,
	readCheckoutCommit,
	readRevisionFile,
	resolveRecordPath,
	selectHarnessVersion,
	verifyArtifactByteIdentity,
	verifyLockfile,
} from "./baseline";

const record = readBaselineRecord();
const manifest: { packageManager: string } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const testRuntime = manifest.packageManager;
const REFRESH_HINT =
	"refresh framework/docs/harness-baseline.json (sourceCombination/oracle lockfile sha256) after a deliberate dependency change";

// These tests check the fixed record itself, so they only apply while the dock runs the
// recorded version. With `OMP_TEST_VERSION` set, the install is deliberately a candidate and
// the run belongs to the upgrade script's own result record, not to the baseline record.
const selection = selectHarnessVersion(record);
const describeFixedRecord = selection.source === "recorded-baseline" ? describe : describe.skip;

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
}, 300_000);

describeFixedRecord("baseline record", () => {
	test("the isolated install provides exactly the recorded supported version", () => {
		expect(harness.version).toBe(record.harness.supportedVersion);
		expect(harness.version).toBe(record.harness.revisionAnchor.version);
		expect(harness.cliPath.startsWith(harness.prefix)).toBe(true);
	});

	test("the recorded revision anchor is reachable in the checkout and names the recorded version", () => {
		const anchorPath = resolveRecordPath(record.harness.revisionAnchor.path);
		// The anchor is a revision, not a checkout position: the checkout that holds it may have moved
		// past it in commits of its own (the frozen baseline's later history removes material this
		// migration moved out), so what a run relies on is that the recorded revision is still in that
		// checkout's history and that its own bytes are the ones the record names. The record stays the
		// authority; the observed tip is recorded per run in the migration run record (D-01).
		expect(checkoutCarries(anchorPath, record.harness.revisionAnchor.commit)).toBe(true);

		const manifest = readRevisionFile(anchorPath, record.harness.revisionAnchor.commit, "packages/coding-agent/package.json");
		expect(manifest).not.toBeNull();
		const parsed = JSON.parse((manifest as Buffer).toString("utf8")) as { version?: string };
		expect(parsed.version).toBe(record.harness.revisionAnchor.version);

		// The record identifies that revision by its commit and by its tag; both have to name it.
		const tag = record.harness.revisionAnchor.tag;
		expect(tag).toBeDefined();
		expect(readCheckoutCommit(anchorPath, tag as string)).toEqual({
			commit: record.harness.revisionAnchor.commit,
			error: null,
		});
	});

	test("the run artifact stays byte-identical to the recorded revision for the recorded contract files", () => {
		const recorded = record.harness.acceptanceArtifact.byteIdentity.files;
		const comparisons = verifyArtifactByteIdentity(record);

		expect(comparisons.map(comparison => comparison.path)).toEqual(recorded.map(file => file.path));
		const drifted = comparisons
			.filter(comparison => !comparison.identical)
			.map(
				comparison =>
					`${comparison.path}: anchor ${comparison.anchorSha256 ?? "<missing>"} vs artifact ${comparison.artifactSha256 ?? "<missing>"}`,
			);
		expect(drifted).toEqual([]);
		// The anchor half is the recorded revision's own bytes: a checkout whose working tree has moved
		// on cannot make this comparison pass by accident, and the frozen hashes stay the record's.
		expect(comparisons.map(comparison => [comparison.path, comparison.anchorSha256])).toEqual(
			recorded.map(file => [file.path, file.sha256]),
		);
		expect(comparisons.map(comparison => [comparison.path, comparison.artifactSha256])).toEqual(
			recorded.map(file => [file.path, file.sha256]),
		);
	});

	test("records the lockfiles of this repository and of the behavior oracle", () => {
		const own = verifyLockfile(record.sourceCombination.lockfile);
		const oracle = verifyLockfile(record.oracle.lockfile, resolveRecordPath(record.oracle.path));
		const stale = [own, oracle]
			.filter(comparison => !comparison.matches)
			.map(
				comparison =>
					`${comparison.path}: recorded ${comparison.recordedSha256} but found ${comparison.actualSha256 ?? "<missing>"} — ${REFRESH_HINT}`,
			);
		expect(stale).toEqual([]);
	});

	test("the oracle checkout carries the recorded revision", () => {
		const checkoutPath = resolveRecordPath(record.oracle.path);
		const checkout = readCheckoutCommit(checkoutPath);
		expect(checkout.error).toBeNull();
		// The record pins the revision the oracle's material comes from, and the local checkout is
		// not parked there: that repository moved past the frozen baseline in a commit of its own
		// which removed the material this migration migrated out, so what a run can rely on is that
		// the recorded revision is still in the checkout's history — the baseline stays the
		// authority's value, only the correspondence asked of the environment is the one that can
		// hold. The observed tip is recorded per run in the migration run record (D-01).
		expect(checkoutCarries(checkoutPath, record.oracle.revision)).toBe(true);
	});

	test("records the accepted environment as conditions, not as pending work", () => {
		expect(process.platform as string).toBe(record.environment.platform);
		expect(process.arch as string).toBe(record.environment.arch);
		// The frozen record describes its historical run; package.json selects today's test runtime.
		expect(`bun@${Bun.version}`).toBe(testRuntime);
		expect(record.environment.nativesBuilt).toBe(false);
		expect(record.environment.checkoutRunsFullSession).toBe(false);
		expect(record.environment.conditions.length).toBeGreaterThan(0);
		// "no natives build" holds because the isolated install ships prebuilt binaries.
		expect(harness.prebuiltNatives.binaries.length).toBeGreaterThan(0);
	});
});
