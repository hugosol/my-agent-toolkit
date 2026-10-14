/**
 * The Codex response boundary artifact: the frozen isolated install of the supported harness, plus
 * this repository's Codex response-boundary patch applied on top of it.
 *
 * The pinned revision's Codex transport (`openai-codex-responses`) fetches its response and never
 * publishes its status and headers, so an extension's `after_provider_response` handler — the
 * channel the chat-completions, Responses, Anthropic and native paths all reach — never fires for a
 * Codex Turn. The patch makes that one transport publish the boundary it already holds, through the
 * same `notifyProviderResponse` helper every other streaming provider uses; nothing else about the
 * install changes.
 *
 * The artifact is materialised the way the dock materialises every host patch
 * (see `host-patch-artifact.ts`): one isolated prefix under `.cache/omp-baseline/`, built from the
 * recorded exact version, patched by the committed `patch.diff`, and verified against `record.json`.
 * Its patch root is the installed scope directory, because the change lives in the installed
 * `@oh-my-pi/pi-ai` package rather than in the supported package's own sources.
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
	type PatchArtifactRecord,
	ensurePatchArtifact,
	patchArtifactLayout,
	readPatchArtifactRecord,
} from "./host-patch-artifact";

/** The frozen patch and its record. */
export const CODEX_RESPONSE_PATCH_DIR = path.join(REPO_ROOT, "host-patches", "omp-18.5.0-codex-response-boundary");
export const CODEX_RESPONSE_PATCH_FILE = path.join(CODEX_RESPONSE_PATCH_DIR, "patch.diff");
export const CODEX_RESPONSE_RECORD_FILE = path.join(CODEX_RESPONSE_PATCH_DIR, "record.json");

/** This artifact's own names, and the installed scope its patch is applied inside. */
export const CODEX_RESPONSE_ARTIFACT: PatchArtifact = {
	patchFiles: [{ patchFile: CODEX_RESPONSE_PATCH_FILE }],
	recordFile: CODEX_RESPONSE_RECORD_FILE,
	prefixLabel: "18.5.0-codex-response-boundary",
	manifestName: "codex-response-host.json",
	prefixName: "omp-codex-response-boundary-prefix",
};

/** The record this artifact froze, when the repository carries one. */
export function readCodexResponseRecord(
	file: string = CODEX_RESPONSE_RECORD_FILE,
): PatchArtifactRecord | undefined {
	return readPatchArtifactRecord(CODEX_RESPONSE_ARTIFACT, file);
}

/** This artifact's prefix layout: a sibling of the recorded install's own prefix. */
export function codexResponseHarnessLayout(
	record: BaselineRecord,
	repoRoot: string = REPO_ROOT,
): IsolatedHarnessLayout {
	return patchArtifactLayout(record, CODEX_RESPONSE_ARTIFACT, repoRoot);
}

/** Materialise (or reuse) the frozen patched host this ticket's real-host smoke runs against. */
export async function ensureCodexResponseHarness(
	record: BaselineRecord = readBaselineRecord(),
	repoRoot: string = REPO_ROOT,
): Promise<IsolatedHarness> {
	return ensurePatchArtifact(record, CODEX_RESPONSE_ARTIFACT, repoRoot);
}
