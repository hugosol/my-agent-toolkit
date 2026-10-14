/**
 * The combined host artifact: the frozen isolated install of the supported harness with *both* of
 * this migration's host patches applied to it, on one install.
 *
 * The two patches carry two different host behaviours the pinned revision does not have — the
 * Viewed session outlet (`omp-18.5.0-viewed-session`) and the Codex response boundary
 * (`omp-18.5.0-codex-response-boundary`) — and the acceptance run needs both at once: a real Codex
 * Turn whose response boundary reaches the extension, on the same install whose viewed-session
 * outlet the framework's own public surface reads. One host per behaviour would make every claim
 * about "both together" a claim about two installs.
 *
 * This artifact is not a merge of the two tickets' reports, and its record is not either: it is the
 * chain itself, materialised once, whose `record.json` holds the pre-patch and post-patch sha256 of
 * every file both patches touch — measured on this install, by the shared materialiser
 * (`host-patch-artifact.ts`). The two single-patch artifacts stay what they are, each verified
 * against its own record by its own suite; this is the artifact a run that needs both executes.
 *
 * The patch order is the one the record froze, and it is the order the two patches' own roots allow:
 * the viewed-session patch only touches the supported package's own sources, and the response-
 * boundary patch only touches the installed `@oh-my-pi/pi-ai` package beside it, so neither step can
 * disturb the other's base hashes.
 */
import * as path from "node:path";
import {
	type BaselineRecord,
	type IsolatedHarness,
	type IsolatedHarnessLayout,
	REPO_ROOT,
	readBaselineRecord,
} from "./baseline";
import { CODEX_RESPONSE_PATCH_FILE } from "./codex-response-harness";
import {
	type PatchArtifact,
	type PatchArtifactRecord,
	ensurePatchArtifact,
	patchArtifactLayout,
	readPatchArtifactRecord,
} from "./host-patch-artifact";
import { VIEWED_SESSION_PATCH_FILE } from "./viewed-session-harness";

/** The combined artifact's own frozen patch and record directory. */
export const COMBINED_HOST_PATCH_DIR = path.join(
	REPO_ROOT,
	"host-patches",
	"omp-18.5.0-viewed-session-codex-response",
);
export const COMBINED_HOST_RECORD_FILE = path.join(COMBINED_HOST_PATCH_DIR, "record.json");

/**
 * This artifact's own names, and the chain it carries: the viewed-session patch inside the supported
 * package's own sources, then the response-boundary patch inside the installed scope.
 */
export const COMBINED_HOST_ARTIFACT: PatchArtifact = {
	patchFiles: [
		{ patchFile: VIEWED_SESSION_PATCH_FILE, patchRoot: layout => layout.packageRoot },
		{ patchFile: CODEX_RESPONSE_PATCH_FILE },
	],
	recordFile: COMBINED_HOST_RECORD_FILE,
	prefixLabel: "18.5.0-viewed-session-codex-response",
	manifestName: "combined-host.json",
	prefixName: "omp-combined-host-prefix",
};

/** The record this artifact froze, when the repository carries one. */
export function readCombinedHostRecord(file: string = COMBINED_HOST_RECORD_FILE): PatchArtifactRecord | undefined {
	return readPatchArtifactRecord(COMBINED_HOST_ARTIFACT, file);
}

/** This artifact's prefix layout: a sibling of the recorded install's own prefix. */
export function combinedHostLayout(
	record: BaselineRecord,
	repoRoot: string = REPO_ROOT,
): IsolatedHarnessLayout {
	return patchArtifactLayout(record, COMBINED_HOST_ARTIFACT, repoRoot);
}

/** Materialise (or reuse) the one patched host that carries every locally required behaviour. */
export async function ensureCombinedHostHarness(
	record: BaselineRecord = readBaselineRecord(),
	repoRoot: string = REPO_ROOT,
): Promise<IsolatedHarness> {
	return ensurePatchArtifact(record, COMBINED_HOST_ARTIFACT, repoRoot);
}
