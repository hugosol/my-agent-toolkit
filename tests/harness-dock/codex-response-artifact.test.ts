/**
 * The frozen Codex response-boundary host artifact (P39; S5).
 *
 * The artifact half of this ticket's host evidence: the record pins the base revision this repository
 * records as supported rather than whatever the checkout says today, the base hashes agree with the
 * exact install of that version, the materialised host carries exactly the frozen post-patch bytes,
 * and the unpatched install carries none of them — so the boundary a real Codex Turn publishes in
 * `model-cost-codex-quota.test.ts` is attributable to this patch and to nothing else.
 *
 * Nothing here runs a session; the runnable half is the smoke beside it.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
	REPO_ROOT,
	type IsolatedHarness,
	ensureIsolatedHarness,
	isolatedHarnessLayout,
	readBaselineRecord,
	sha256File,
} from "./baseline";
import {
	CODEX_RESPONSE_ARTIFACT,
	CODEX_RESPONSE_PATCH_FILE,
	CODEX_RESPONSE_RECORD_FILE,
	codexResponseHarnessLayout,
	ensureCodexResponseHarness,
	readCodexResponseRecord,
} from "./codex-response-harness";
import { type PatchArtifactRecord, type PatchRecordEntry, patchRootOf, patchTouchedFiles } from "./host-patch-artifact";

const record = readBaselineRecord();

let harness: IsolatedHarness;
let artifact: PatchArtifactRecord;
/** This artifact's one patch, as the record freezes it. */
let patch: PatchRecordEntry;

beforeAll(async () => {
	harness = await ensureCodexResponseHarness(record);
	const frozen = readCodexResponseRecord();
	if (!frozen) throw new Error(`${CODEX_RESPONSE_RECORD_FILE} was not frozen by the materialisation`);
	artifact = frozen;
	patch = artifact.patches[0];
}, 600_000);

describe("the frozen Codex response-boundary host artifact", () => {
	test("the record pins the base revision this repository records as supported, not a newer one", () => {
		expect(artifact.harness.package).toBe(record.harness.package);
		expect(artifact.harness.version).toBe(record.harness.supportedVersion);
		expect(artifact.harness.version).toBe("18.5.0");
		// The checkout itself has moved on; the patch stays on the approved anchor.
		expect(artifact.harness.revisionAnchor.commit).toBe(record.harness.revisionAnchor.commit);
		expect(artifact.harness.revisionAnchor.commit).toBe("9348320cc4a30a7195d36a1f05a6c11bcb701a17");
		expect(patch.file).toBe("host-patches/omp-18.5.0-codex-response-boundary/patch.diff");
		expect(patch.sha256).toBe(sha256File(CODEX_RESPONSE_PATCH_FILE));
		expect(patch.files.map(file => file.path)).toEqual(
			patchTouchedFiles(readFileSync(CODEX_RESPONSE_PATCH_FILE, "utf8")),
		);
		// The change is one provider file: this patch publishes a response boundary the transport
		// already holds rather than restructuring it.
		expect(patch.files.map(file => file.path)).toEqual(["pi-ai/src/providers/openai-codex-responses.ts"]);
	});

	test("every patched file's base hash is the installed base revision's own bytes", async () => {
		// The exact install of the recorded version: the artifact's own base, and the same installed
		// scope the patch is applied inside.
		await ensureIsolatedHarness(record);
		const baseRoot = patchRootOf(CODEX_RESPONSE_ARTIFACT.patchFiles[0], isolatedHarnessLayout(record));
		for (const file of patch.files) {
			expect(sha256File(path.join(baseRoot, file.path))).toBe(file.baseSha256);
			// ... and the patch really changes it, so the hash cannot be a file the patch only mentions.
			expect(file.patchedSha256).not.toBe(file.baseSha256);
		}
	}, 600_000);

	test("the materialised host carries exactly the frozen post-patch bytes", () => {
		const patchedRoot = patchRootOf(CODEX_RESPONSE_ARTIFACT.patchFiles[0], harness);
		for (const file of patch.files) {
			expect(sha256File(path.join(patchedRoot, file.path))).toBe(file.patchedSha256);
		}
		expect(artifact.materialise.prefix).toBe(
			path.relative(REPO_ROOT, codexResponseHarnessLayout(record).prefix).replace(/\\/g, "/"),
		);
		expect(existsSync(path.join(harness.prefix, CODEX_RESPONSE_ARTIFACT.manifestName))).toBe(true);
	});
});
