/**
 * Deployment seam for the first release: what the real OMP loader discovers from this
 * repository's OMP entrypoint directory, whether the thin entrypoint's imports outside
 * that directory resolve, and how an extension's original and replacement
 * implementations are kept out of one process (C11/C12/N8, P29/P30/P31; see
 * docs/agent-runtime-support.md, "Shared-source deployment prerequisite").
 *
 * Each test runs the isolated 18.5.0 install's own loader module against the real
 * repository layout. Nothing here modifies agent-runtime source, the default global
 * install, formal configuration, or a running agent.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { type IsolatedRuntime, REPO_ROOT, ensureIsolatedRuntime, readBaselineRecord, resolveRecordPath } from "../harness/baseline";
import { startCaptureServer } from "../harness/capture-server";
import { listResolutionOffsets } from "../harness/env";
import { HARNESS_CAPTURE_BASE_URL_ENV, HARNESS_MODEL_SELECTOR } from "../harness/fixtures/extension-root/provider";
import { createRunRoot, listRunArtifacts } from "../harness/run-root";
import { ControlledSession } from "../harness/session";

/** The OMP discovery root this repository deploys (ADR-0002; decision 07). */
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
const CODEBASE_TOOLS_ENTRYPOINT = path.join(OMP_ENTRYPOINT_DIR, "codebase-tools.ts");

interface DiscoveredExtension {
	readonly resolvedPath: string;
	readonly label?: string;
}

interface LoadExtensionsResult {
	readonly extensions: readonly DiscoveredExtension[];
	readonly errors: ReadonlyArray<{ readonly path: string; readonly error: string }>;
}

/** The slice of the agent runtime's loader this suite drives. */
interface ExtensionLoader {
	discoverExtensionPaths(
		configuredPaths: readonly string[],
		cwd: string,
		disabledExtensionIds?: readonly string[],
		options?: { readonly ambient?: boolean },
	): Promise<string[]>;
	loadExtensions(paths: readonly string[], cwd: string): Promise<LoadExtensionsResult>;
}

interface DiscoveryHelpers {
	getExtensionNameFromPath(extensionPath: string): string;
}

const record = readBaselineRecord();
const oracleCodebaseToolsRoot = path.join(resolveRecordPath(record.oracle.path), "extensions", "codebase-tools");

let runtime: IsolatedRuntime;
let loader: ExtensionLoader;
let helpers: DiscoveryHelpers;

/** Discovery over only the configured root: the explicit-only shape every run uses. */
function discoverConfiguredRoots(roots: readonly string[], cwd = REPO_ROOT): Promise<string[]> {
	return loader.discoverExtensionPaths(roots, cwd, undefined, { ambient: false });
}

beforeAll(async () => {
	runtime = await ensureIsolatedRuntime(record);
	// Dynamic import is required: the agent runtime is an isolated exact install whose
	// prefix is runtime-selected, so no static specifier can name its loader.
	const loaderUrl = pathToFileURL(path.join(runtime.packageRoot, "src", "extensibility", "extensions", "loader.ts")).href;
	const helpersUrl = pathToFileURL(path.join(runtime.packageRoot, "src", "discovery", "helpers.ts")).href;
	// Unchecked cast: the isolated install owns these module types, and only the surface
	// asserted below is used.
	loader = (await import(loaderUrl)) as ExtensionLoader;
	helpers = (await import(helpersUrl)) as DiscoveryHelpers;
}, 300_000);

describe("OMP entrypoint discovery (C12)", () => {
	test("the OMP entrypoint directory yields exactly one thin codebase-tools entrypoint", async () => {
		const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR]);

		// One extension, one entrypoint: no aggregating root `index.ts` turns the
		// directory into a single multi-extension factory.
		expect(discovered.length).toBe(1);
		expect(discovered.map(file => path.relative(REPO_ROOT, file).replace(/\\/g, "/"))).toEqual([
			"entrypoints/omp/codebase-tools.ts",
		]);
		expect(discovered.map(file => helpers.getExtensionNameFromPath(file))).toEqual(["codebase-tools"]);
	});

	test("a root index.ts would collapse the directory into one aggregate, which is why none exists", async () => {
		const runRoot = createRunRoot("entrypoint-aggregate");
		try {
			const root = path.join(runRoot.workDir, "entrypoints", "omp");
			mkdirSync(root, { recursive: true });
			writeFileSync(path.join(root, "alpha.ts"), "export default function alpha(): void {}\n");
			writeFileSync(path.join(root, "beta.ts"), "export default function beta(): void {}\n");
			writeFileSync(path.join(root, "index.ts"), "export default function aggregate(): void {}\n");

			// A discovery-root `index.ts` outranks the per-extension files, so an aggregating
			// root would hide the thin entrypoints instead of adding to them.
			const discovered = await discoverConfiguredRoots([root], runRoot.workDir);
			expect(discovered.map(file => path.basename(file))).toEqual(["index.ts"]);
		} finally {
			runRoot.dispose();
		}
	});

	test("the entrypoint's out-of-directory shared source, Markdown text and bare dependency resolve with 0 errors", async () => {
		const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR]);
		const result = await loader.loadExtensions(discovered, REPO_ROOT);

		// An unresolvable import anywhere in the entrypoint's graph surfaces here, so an
		// empty error list is the resolution evidence: shared TypeScript under
		// extensions/, the Markdown prompt resources imported as text, and the
		// agent-runtime-provided bare package all resolved and the factory bound.
		expect(result.errors).toEqual([]);
		expect(result.extensions.length).toBe(1);
		const [extension] = result.extensions;
		expect(path.resolve(extension?.resolvedPath ?? "")).toBe(CODEBASE_TOOLS_ENTRYPOINT);
		expect(extension?.label).toBe("codeBaseTools");
	});

	test("the loader reports an unresolvable import instead of binding (control for the 0-error result)", async () => {
		const runRoot = createRunRoot("loader-control");
		try {
			const root = path.join(runRoot.workDir, "entrypoints", "omp");
			mkdirSync(root, { recursive: true });
			writeFileSync(
				path.join(root, "broken.ts"),
				'import "../does-not-exist";\nexport default function broken(): void {}\n',
			);

			const discovered = await discoverConfiguredRoots([root], runRoot.workDir);
			expect(discovered.length).toBe(1);
			const result = await loader.loadExtensions(discovered, runRoot.workDir);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.extensions.length).toBe(0);
		} finally {
			runRoot.dispose();
		}
	});
});

describe("load-source mutual exclusion (N8)", () => {
	test("the explicit-only OMP root never discovers the original sibling implementation", async () => {
		// The original implementation the cutover replaces must exist for this to mean anything.
		expect(existsSync(path.join(oracleCodebaseToolsRoot, "index.ts"))).toBe(true);

		const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR]);
		const oracleRoot = path.resolve(oracleCodebaseToolsRoot);
		expect(discovered.some(file => path.resolve(file).startsWith(oracleRoot))).toBe(false);
		expect(discovered.map(file => helpers.getExtensionNameFromPath(file))).toEqual(["codebase-tools"]);
	});

	test("the loader does not deduplicate by extension name, so exclusion can only come from the load sources", async () => {
		// Pointing discovery at both sources returns both: name matching, `disabledExtensions`
		// and identity probing are not what keeps the two implementations apart.
		const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR, oracleCodebaseToolsRoot]);

		expect(discovered.length).toBe(2);
		expect(discovered.map(file => helpers.getExtensionNameFromPath(file))).toEqual([
			"codebase-tools",
			"codebase-tools",
		]);
	});
});

describe("explicit-only isolated run (P31)", () => {
	// The run-mode contract: the real CLI is invoked with ambient discovery off, only
	// the repository's OMP root configured, and a temporary agent state. Discovery and
	// binding of that root are observed directly by the loader tests above; this test
	// observes that the deployment runs cleanly under the isolation the acceptance
	// procedure uses.
	test("the real CLI runs the repository's OMP root under a temporary agent state and exits cleanly", async () => {
		const runRoot = createRunRoot("omp-root-session");
		const capture = startCaptureServer({ dir: runRoot.captureDir });
		try {
			const session = await ControlledSession.start({
				runtime,
				runRoot,
				// The provider fixture keeps the turn credential-free; the discovery root
				// under test is the repository's OMP entrypoint directory.
				extensions: [path.join(REPO_ROOT, "tests", "harness", "fixtures", "extension-root", "provider.ts"), OMP_ENTRYPOINT_DIR],
				model: HARNESS_MODEL_SELECTOR,
				env: { [HARNESS_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
			});
			try {
				// Explicit-only: ambient discovery is off and only the configured root is added.
				expect(session.argv).toContain("--no-extensions");
				expect(session.argv).toContain(OMP_ENTRYPOINT_DIR);
				// The only surviving resolution offset is the temporary agent state directory.
				expect(listResolutionOffsets(session.env)).toEqual(["PI_CODING_AGENT_DIR"]);
				expect(session.env.PI_CODING_AGENT_DIR).toBe(runRoot.agentDir);

				const turn = await session.prompt("deployment seam turn");
				expect(turn.agentInvoked).toBe(true);
				expect(turn.status).toBe("completed");

				const exit = await session.stop();
				expect(exit.timedOut).toBe(false);
				expect(exit.exitCode).toBe(0);
				expect(listRunArtifacts(runRoot).some(artifact => artifact.startsWith("agent-state/"))).toBe(true);
			} finally {
				await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
			}
		} finally {
			capture.stop();
			runRoot.dispose();
		}
	}, 180_000);
});
