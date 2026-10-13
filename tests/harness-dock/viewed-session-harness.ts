/**
 * The Viewed session host artifact: the frozen isolated install of the supported harness, plus this
 * repository's Viewed session patch applied on top of it.
 *
 * The ticket that owns the outlet has to hand the rest of the migration a *runnable* host that
 * publishes it — not a source checkout that cannot run a session, and not a probe. The freezing,
 * materialisation and verification this artifact needs are the shared ones
 * (`host-patch-artifact.ts`); this module is the artifact's own names and the one place that says
 * which directory its patch is applied inside: the supported package's own root, because this patch
 * only touches that package's sources.
 */
import * as path from "node:path";
import {
	type BaselineRecord,
	type IsolatedHarness,
	type IsolatedHarnessLayout,
	REPO_ROOT,
	readBaselineRecord,
} from "./baseline";
import {
	type PatchArtifact,
	type PatchArtifactFile,
	type PatchArtifactRecord,
	ensurePatchArtifact,
	patchArtifactLayout,
	patchTouchedFiles,
	readPatchArtifactRecord,
} from "./host-patch-artifact";

/** The frozen patch and its record. */
export const VIEWED_SESSION_PATCH_DIR = path.join(REPO_ROOT, "host-patches", "omp-18.5.0-viewed-session");
export const VIEWED_SESSION_PATCH_FILE = path.join(VIEWED_SESSION_PATCH_DIR, "patch.diff");
export const VIEWED_SESSION_RECORD_FILE = path.join(VIEWED_SESSION_PATCH_DIR, "record.json");

/**
 * Directory-name segment of the patched prefix. It names the base version and the one patch on
 * top of it, so the artifact never shares a prefix with the unpatched baseline install.
 */
export const VIEWED_SESSION_PREFIX_LABEL = "18.5.0-viewed-session";

/** One file the patch touches, with the hashes that freeze it. */
export type ViewedSessionPatchFile = PatchArtifactFile;

/** The frozen description of this artifact. */
export type ViewedSessionArtifactRecord = PatchArtifactRecord;

/** This artifact's own names, and the root its patch is applied inside. */
const VIEWED_SESSION_ARTIFACT: PatchArtifact = {
	patchFiles: [{ patchFile: VIEWED_SESSION_PATCH_FILE, patchRoot: layout => layout.packageRoot }],
	recordFile: VIEWED_SESSION_RECORD_FILE,
	prefixLabel: VIEWED_SESSION_PREFIX_LABEL,
	manifestName: "viewed-session-host.json",
	prefixName: "omp-viewed-session-prefix",
};

/** Every file a unified diff touches, in patch order. */
export { patchTouchedFiles };

/**
 * The patched prefix's layout. The prefix is a sibling of the recorded install's prefix, so the
 * patched host never reuses or overwrites the baseline artifact.
 */
export function viewedSessionHarnessLayout(
	record: BaselineRecord,
	repoRoot: string = REPO_ROOT,
): IsolatedHarnessLayout {
	return patchArtifactLayout(record, VIEWED_SESSION_ARTIFACT, repoRoot);
}

/** The frozen record, when the repository carries one. */
export function readViewedSessionRecord(
	file: string = VIEWED_SESSION_RECORD_FILE,
): ViewedSessionArtifactRecord | undefined {
	return readPatchArtifactRecord(VIEWED_SESSION_ARTIFACT, file);
}

/** The record this materialisation wrote, or the frozen one it verified against. */
export async function ensureViewedSessionHarness(
	record: BaselineRecord = readBaselineRecord(),
	repoRoot: string = REPO_ROOT,
): Promise<IsolatedHarness> {
	return ensurePatchArtifact(record, VIEWED_SESSION_ARTIFACT, repoRoot);
}
