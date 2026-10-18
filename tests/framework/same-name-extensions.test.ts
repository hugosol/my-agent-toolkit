/**
 * Same-name extension scenario (N8, P30): why double registration can only be prevented
 * by the load sources.
 *
 * Neither side deduplicates by extension name. The real loader is driven in
 * deployment.test.ts (it returns both candidates when both roots are configured); this
 * suite shows the framework side with a plain recording double — two assemblies of one
 * definition, bound into the same process, both register and neither displaces the other.
 * Nothing here touches a harness, the isolated install, the filesystem or a
 * sibling checkout, so the same-name contract stays checkable in any checkout.
 *
 * The other half — the deployed configuration scans one root and yields exactly one
 * codebase-tools entrypoint — is the discovery test in deployment.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { type OmpExtensionApi, ompAdapter } from "../../adapters/omp";
import { defineExtension } from "../../framework/public";

const SHARED_ID = "codebase-tools";
const SHARED_COMMAND = "codebase-tools";

/** A recording double for the native surface: no harness, no I/O, no files. */
function recordingApi() {
	const labels: string[] = [];
	const commands: string[] = [];
	const api: OmpExtensionApi = {
		setLabel: label => labels.push(label),
		registerCommand: name => commands.push(name),
		appendEntry: () => {},
		on: () => {},
	};
	return { api, labels, commands };
}

/** Two independently assembled extensions that happen to share every identity. */
const sameNameDefinition = defineExtension({
	id: SHARED_ID,
	displayName: "codeBaseTools",
	commands: [{ type: "toggle", name: SHARED_COMMAND, state: "enabled" }],
});

describe("same-name extensions in one process (N8, P30)", () => {
	test("two assemblies of one identity both register: the framework does not dedupe by name", () => {
		const surface = recordingApi();
		const first = ompAdapter(sameNameDefinition);
		const second = ompAdapter(sameNameDefinition);

		expect(first(surface.api).bound).toBe(true);
		expect(second(surface.api).bound).toBe(true);
		expect(surface.labels).toEqual(["codeBaseTools", "codeBaseTools"]);
		expect(surface.commands).toEqual([SHARED_COMMAND, SHARED_COMMAND]);
	});

	test("one assembly registers once, so the double is not inflating the count", () => {
		const surface = recordingApi();
		expect(ompAdapter(sameNameDefinition)(surface.api).bound).toBe(true);
		expect(surface.labels).toEqual(["codeBaseTools"]);
		expect(surface.commands).toEqual([SHARED_COMMAND]);
	});
});
