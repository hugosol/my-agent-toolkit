/**
 * The baseline record is only useful if it can be checked. These tests re-check the
 * correspondence it claims: the revision anchor, the artifact that runs acceptance,
 * and the dependency lockfiles of this repository and of the behavior oracle.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
	type IsolatedRuntime,
	checkoutCarries,
	ensureIsolatedRuntime,
	readBaselineRecord,
	readCheckoutCommit,
	resolveRecordPath,
	selectRuntimeVersion,
	verifyArtifactByteIdentity,
	verifyLockfile,
} from "./baseline";

const record = readBaselineRecord();
const REFRESH_HINT =
	"refresh docs/agent-runtime-baseline.json (sourceCombination/oracle lockfile sha256) after a deliberate dependency change";

// These tests check the fixed record itself, so they only apply while the harness runs the
// recorded version. With `OMP_TEST_VERSION` set, the install is deliberately a candidate and
// the run belongs to the upgrade script's own result record, not to the baseline record.
const selection = selectRuntimeVersion(record);
const describeFixedRecord = selection.source === "recorded-baseline" ? describe : describe.skip;

let runtime: IsolatedRuntime;

beforeAll(async () => {
	runtime = await ensureIsolatedRuntime(record);
}, 300_000);

describeFixedRecord("baseline record", () => {
	test("the isolated install provides exactly the recorded supported version", () => {
		expect(runtime.version).toBe(record.agentRuntime.supportedVersion);
		expect(runtime.version).toBe(record.agentRuntime.revisionAnchor.version);
		expect(runtime.cliPath.startsWith(runtime.prefix)).toBe(true);
	});

	test("the checkout is at the recorded revision anchor", () => {
		const anchorPath = resolveRecordPath(record.agentRuntime.revisionAnchor.path);
		const checkout = readCheckoutCommit(anchorPath);
		expect(checkout.error).toBeNull();
		expect(checkout.commit).toBe(record.agentRuntime.revisionAnchor.commit);

		const manifest = JSON.parse(
			readFileSync(path.join(anchorPath, "packages", "coding-agent", "package.json"), "utf8"),
		) as { version?: string };
		expect(manifest.version).toBe(record.agentRuntime.revisionAnchor.version);
	});

	test("the run artifact stays byte-identical to the anchor for the recorded contract files", () => {
		const recorded = record.agentRuntime.acceptanceArtifact.byteIdentity.files;
		const comparisons = verifyArtifactByteIdentity(record);

		expect(comparisons.map(comparison => comparison.path)).toEqual(recorded.map(file => file.path));
		const drifted = comparisons
			.filter(comparison => !comparison.identical)
			.map(
				comparison =>
					`${comparison.path}: anchor ${comparison.anchorSha256 ?? "<missing>"} vs artifact ${comparison.artifactSha256 ?? "<missing>"}`,
			);
		expect(drifted).toEqual([]);
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
		expect(Bun.version).toBe(record.environment.bun);
		expect(record.environment.nativesBuilt).toBe(false);
		expect(record.environment.checkoutRunsFullSession).toBe(false);
		expect(record.environment.conditions.length).toBeGreaterThan(0);
		// "no natives build" holds because the isolated install ships prebuilt binaries.
		expect(runtime.prebuiltNatives.binaries.length).toBeGreaterThan(0);
	});
});
