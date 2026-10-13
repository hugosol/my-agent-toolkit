/**
 * The frozen combined host artifact: both of this migration's host patches, on one install (P52, P68; S5).
 *
 * Two tickets needed a host behaviour the pinned revision does not have — the Viewed session outlet
 * and the Codex response boundary — and the acceptance run needs them at once, on the same install.
 * This suite re-checks the artifact that carries both: the record chains the two committed patches
 * on the base revision this repository records as supported, each file's pre-patch hash is the
 * unpatched install's own bytes, and the materialised host carries exactly the frozen post-patch
 * bytes of both patches.
 *
 * Each step of the chain is compared against the single-patch artifact's own frozen record. That is
 * not a merged report: the two records were frozen independently, by runs of their own materialiser
 * against their own prefixes, and this artifact has to reproduce their measured bytes exactly — a
 * combination that quietly re-froze one of them, or that applied a patch to bytes its own record does
 * not describe, fails here. The behavioural half — both behaviours in one running session — is the
 * run suite beside it (`model-cost-persistence.test.ts`), which executes this artifact.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
	type IsolatedHarness,
	REPO_ROOT,
	ensureIsolatedHarness,
	isolatedHarnessLayout,
	readBaselineRecord,
	sha256File,
} from "./baseline";
import { readCodexResponseRecord } from "./codex-response-harness";
import {
	COMBINED_HOST_ARTIFACT,
	COMBINED_HOST_RECORD_FILE,
	combinedHostLayout,
	ensureCombinedHostHarness,
	readCombinedHostRecord,
} from "./combined-host-harness";
import { PATCH_ABSENT, type PatchArtifactRecord, type PatchRecordEntry, patchRootOf } from "./host-patch-artifact";
import { readViewedSessionRecord, VIEWED_SESSION_PATCH_FILE, VIEWED_SESSION_PATCH_DIR } from "./viewed-session-harness";

const record = readBaselineRecord();
const layout = combinedHostLayout(record);
const baseLayout = isolatedHarnessLayout(record, REPO_ROOT, record.harness.supportedVersion);

let harness: IsolatedHarness;
let artifact: PatchArtifactRecord;
/** Each chain step paired with the directory it applies inside, in the materialised and base prefixes. */
let roots: ReadonlyArray<{ readonly step: PatchRecordEntry; readonly patched: string; readonly base: string }>;

beforeAll(async () => {
	harness = await ensureCombinedHostHarness(record);
	const frozen = readCombinedHostRecord();
	if (!frozen) throw new Error(`${COMBINED_HOST_RECORD_FILE} was not frozen by the materialisation`);
	artifact = frozen;
	roots = artifact.patches.map((step, index) => ({
		step,
		patched: patchRootOf(COMBINED_HOST_ARTIFACT.patchFiles[index], layout),
		base: patchRootOf(COMBINED_HOST_ARTIFACT.patchFiles[index], baseLayout),
	}));
	// The unpatched control beside the artifact: the same recorded version without either patch.
	await ensureIsolatedHarness(record);
}, 900_000);

describe("the frozen combined host artifact", () => {
	test("the record chains both patches on the base revision this repository records as supported", () => {
		expect(artifact.harness.package).toBe(record.harness.package);
		expect(artifact.harness.version).toBe(record.harness.supportedVersion);
		expect(artifact.harness.version).toBe("18.5.0");
		// The checkout itself has moved on; both patches stay on the approved anchor.
		expect(artifact.harness.revisionAnchor.commit).toBe(record.harness.revisionAnchor.commit);
		expect(artifact.harness.revisionAnchor.commit).toBe("9348320cc4a30a7195d36a1f05a6c11bcb701a17");

		expect(artifact.patches.map(step => step.file)).toEqual([
			path.relative(REPO_ROOT, VIEWED_SESSION_PATCH_FILE).replace(/\\/g, "/"),
			"host-patches/omp-18.5.0-codex-response-boundary/patch.diff",
		]);
		expect(artifact.materialise.prefix).toBe(path.relative(REPO_ROOT, layout.prefix).replace(/\\/g, "/"));
		expect(artifact.materialise.apply).toHaveLength(2);
		expect(existsSync(path.join(harness.prefix, COMBINED_HOST_ARTIFACT.manifestName))).toBe(true);
	});

	test("each chain step's hashes and files are the single-patch artifact's own frozen ones", () => {
		const viewed = readViewedSessionRecord();
		const codex = readCodexResponseRecord();
		if (!viewed || !codex) throw new Error("the single-patch artifacts' records are missing");
		// The combination freezes nothing of its own: the same two patches, measured against the same
		// base install, have to land on the bytes their own records froze — hash for hash.
		expect(artifact.patches[0]).toEqual(viewed.patches[0]);
		expect(artifact.patches[1]).toEqual(codex.patches[0]);
		expect(artifact.patches[0]?.sha256).toBe(sha256File(VIEWED_SESSION_PATCH_FILE));
		// The viewed patch's own record lives beside the patch it freezes; the chain names the same file.
		expect(path.dirname(VIEWED_SESSION_PATCH_FILE)).toBe(VIEWED_SESSION_PATCH_DIR);
	});

	test("every file's pre-patch hash is the unpatched install's own bytes, and the patch changes it", () => {
		for (const { step, base } of roots) {
			for (const file of step.files) {
				const absolute = path.join(base, file.path);
				if (file.baseSha256 === PATCH_ABSENT) {
					// The patch creates this file: the base install has nothing to hash.
					expect(existsSync(absolute)).toBe(false);
					continue;
				}
				expect(sha256File(absolute)).toBe(file.baseSha256);
				expect(file.patchedSha256).not.toBe(file.baseSha256);
			}
		}
	});

	test("the materialised host carries exactly the frozen post-patch bytes of both patches", () => {
		for (const { step, patched } of roots) {
			for (const file of step.files) {
				expect(sha256File(path.join(patched, file.path))).toBe(file.patchedSha256);
			}
		}
		// Both behaviours' carriers are present in the one install this artifact materialised: the
		// outlet module the viewed patch creates, and the transport file the response patch changes.
		expect(existsSync(path.join(harness.packageRoot, "src", "extensibility", "extensions", "viewed-session.ts"))).toBe(true);
		expect(readFileSync(path.join(harness.packageRoot, "src", "extensibility", "extensions", "types.ts"), "utf8")).toContain(
			"getViewedSession",
		);
		expect(readFileSync(path.join(harness.prefix, "node_modules", "@oh-my-pi", "pi-ai", "src", "providers", "openai-codex-responses.ts"), "utf8")).toContain(
			"notifyProviderResponse",
		);
	});

	test("neither behaviour is in the unpatched install: both come from the chain", () => {
		const basePackageRoot = path.join(REPO_ROOT, record.harness.acceptanceArtifact.prefix, "node_modules", record.harness.package);
		expect(existsSync(path.join(basePackageRoot, "src", "extensibility", "extensions", "viewed-session.ts"))).toBe(false);
		expect(readFileSync(path.join(basePackageRoot, "src", "extensibility", "extensions", "types.ts"), "utf8")).not.toContain(
			"getViewedSession",
		);
		expect(
			readFileSync(
				path.join(REPO_ROOT, record.harness.acceptanceArtifact.prefix, "node_modules", "@oh-my-pi", "pi-ai", "src", "providers", "openai-codex-responses.ts"),
				"utf8",
			),
		).not.toContain("notifyProviderResponse");
	});
});
