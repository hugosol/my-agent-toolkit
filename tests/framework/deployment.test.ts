/**
 * Deployment seam for the first release: what the real OMP loader discovers from this
 * repository's OMP entrypoint directory, whether the thin entrypoint's imports outside
 * that directory resolve, whether each extension binds there (connect-bot's binding
 * included, which reads the configuration file its declaration requires), and how an
 * extension's original and replacement implementations are kept out of one process
 * (C11/C12/N8, P29/P30/P31/P42; see framework/docs/harness-support.md, "Shared-source
 * deployment prerequisite").
 *
 * Each test runs the isolated 18.5.0 install's own loader module against the real
 * repository layout. Nothing here modifies harness source, the default global
 * install, formal configuration, or a running agent.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { startCaptureServer } from "../harness-dock/capture-server";
import { listResolutionOffsets } from "../harness-dock/env";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { createRunRoot, listRunArtifacts, type RunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";
import { withCapturedStderrAsync } from "./support/captured-stderr";
import { inWorkingDirectory } from "./support/working-directory";

/** The OMP discovery root this repository deploys (ADR-0002; decision 07). */
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
const CODEBASE_TOOLS_ENTRYPOINT = path.join(OMP_ENTRYPOINT_DIR, "codebase-tools.ts");
const CONNECT_BOT_ENTRYPOINT = path.join(OMP_ENTRYPOINT_DIR, "connect-bot.ts");

/** The credential-free provider fixture; it keeps a controlled turn off the network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

/** The explicit-only set a deployment run configures: the provider fixture and the OMP root. */
const DEPLOYED_ROOT_SET = [PROVIDER_FIXTURE, OMP_ENTRYPOINT_DIR] as const;

/**
 * The convention path of connect-bot's declared configuration file, relative to the extension
 * repository root: the framework's own spelling of it, and the path a run root's working
 * directory would carry it at if a binding still resolved the declaration against the process.
 */
const CONNECT_BOT_CONFIG_FILE = "extensions/connect-bot/config.yaml";

interface DiscoveredExtension {
	readonly resolvedPath: string;
	readonly label?: string;
}

interface LoadExtensionsResult {
	readonly extensions: readonly DiscoveredExtension[];
	readonly errors: ReadonlyArray<{ readonly path: string; readonly error: string }>;
}

/** The slice of the harness's loader this suite drives. */
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

let harness: IsolatedHarness;
let loader: ExtensionLoader;
let helpers: DiscoveryHelpers;

/** Discovery over only the configured root: the explicit-only shape every run uses. */
function discoverConfiguredRoots(roots: readonly string[], cwd = REPO_ROOT): Promise<string[]> {
	return loader.discoverExtensionPaths(roots, cwd, undefined, { ambient: false });
}

/**
 * Writes a configuration file at connect-bot's convention path under a run root's working
 * directory — the one place its binding must not read.
 *
 * The file declares an endpoint of the wrong type, so a binding that resolved the declaration
 * against that working directory would be refused with a configuration error instead of
 * registering: it is the control that tells "the extension bound" apart from "the extension bound
 * from whatever this directory happens to carry".
 */
function writeDecoyConnectBotConfig(runRoot: RunRoot): string {
	const file = path.join(runRoot.workDir, CONNECT_BOT_CONFIG_FILE);
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, "endpoint: 8787\n");
	return file;
}

/** The binding diagnostics one session's process wrote for one extension, in order. */
function diagnosticsFor(extensionId: string, session: ControlledSession): string[] {
	return session.stderr().split("\n").filter(line => line.startsWith(`${extensionId}:`));
}

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
	// Dynamic import is required: the harness is an isolated exact install whose
	// prefix is harness-selected, so no static specifier can name its loader.
	const loaderUrl = pathToFileURL(path.join(harness.packageRoot, "src", "extensibility", "extensions", "loader.ts")).href;
	const helpersUrl = pathToFileURL(path.join(harness.packageRoot, "src", "discovery", "helpers.ts")).href;
	// Unchecked cast: the isolated install owns these module types, and only the surface
	// asserted below is used.
	loader = (await import(loaderUrl)) as ExtensionLoader;
	helpers = (await import(helpersUrl)) as DiscoveryHelpers;
}, 300_000);

describe("OMP entrypoint discovery (C12)", () => {
	test("the OMP entrypoint directory yields one thin entrypoint per extension", async () => {
		const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR]);

		// One extension, one entrypoint: no aggregating root `index.ts` turns the
		// directory into a single multi-extension factory.
		expect(discovered.length).toBe(2);
		expect(discovered.map(file => path.relative(REPO_ROOT, file).replace(/\\/g, "/")).sort()).toEqual([
			"entrypoints/omp/codebase-tools.ts",
			"entrypoints/omp/connect-bot.ts",
		]);
		expect(discovered.map(file => helpers.getExtensionNameFromPath(file)).sort()).toEqual([
			"codebase-tools",
			"connect-bot",
		]);
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

	test("each entrypoint's out-of-directory shared source, Markdown text and bare dependency resolve with 0 errors", async () => {
		const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR]);
		// Both factories bind in one load: connect-bot's declared configuration resolves against
		// the repository root its assembly derives from its own module location, whatever
		// directory this process is running in.
		const result = await loader.loadExtensions(discovered, REPO_ROOT);

		// An unresolvable import anywhere in an entrypoint's graph surfaces here, so an
		// empty error list is the resolution evidence: shared TypeScript under
		// extensions/, the Markdown prompt resources imported as text, and the
		// harness-provided bare package all resolved and both factories bound.
		expect(result.errors).toEqual([]);
		expect(result.extensions.length).toBe(2);
		const labelOf = (entrypoint: string) =>
			result.extensions.find(extension => path.resolve(extension.resolvedPath) === path.resolve(entrypoint))?.label;
		expect(labelOf(CODEBASE_TOOLS_ENTRYPOINT)).toBe("codeBaseTools");
		expect(labelOf(CONNECT_BOT_ENTRYPOINT)).toBe("connectBot");
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

/**
 * The connect-bot entrypoint's own load (P42): what the configured root yields for it, that
 * its out-of-directory shared source resolves, and that the configuration file its binding
 * requires is the one under the extension repository root the assembly derives — including
 * from a working directory outside this repository.
 */
describe("connect-bot entrypoint discovery and binding (P42)", () => {
	test("the configured root yields the connect-bot entrypoint exactly once, under the extension's own name", async () => {
		const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR]);

		const connectBotPaths = discovered.filter(file => helpers.getExtensionNameFromPath(file) === "connect-bot");
		expect(connectBotPaths.map(file => path.resolve(file))).toEqual([path.resolve(CONNECT_BOT_ENTRYPOINT)]);
	});

	test("the entrypoint's shared source resolves and its binding reads the declared configuration file", async () => {
		// connect-bot declares a configuration, and the framework resolves it against the
		// repository root the assembly derives from its own module location — not against the
		// directory the process happens to be running in.
		const result = await loader.loadExtensions([CONNECT_BOT_ENTRYPOINT], REPO_ROOT);

		// An unresolvable import anywhere in the entrypoint's graph surfaces here: its imports
		// leave the discovery directory for the extension's own modules and for the framework
		// source, and this load reports none of them failing.
		expect(result.errors).toEqual([]);
		expect(result.extensions.length).toBe(1);
		// The label is set only past the framework's configuration and admission steps, so a
		// labeled binding is the evidence that `extensions/connect-bot/config.yaml` was found,
		// parsed and validated in this same load.
		const connectBot = result.extensions.find(
			extension => path.resolve(extension.resolvedPath) === path.resolve(CONNECT_BOT_ENTRYPOINT),
		);
		expect(connectBot?.label).toBe("connectBot");
	});

	test("a working directory outside the repository still binds the extension, and its own file is ignored", async () => {
		const runRoot = createRunRoot("connect-bot-external-cwd");
		try {
			// The one directory a binding must not read: a directory that is not the extension
			// repository, carrying a file at the convention path whose endpoint is of the wrong
			// type. A binding that resolved the declaration against it would be refused with a
			// configuration error rather than contributing to the load set.
			const decoy = writeDecoyConnectBotConfig(runRoot);

			const { stderr, value: result } = await withCapturedStderrAsync(() =>
				inWorkingDirectory(runRoot.workDir, () =>
					loader.loadExtensions([CONNECT_BOT_ENTRYPOINT], runRoot.workDir),
				),
			);

			expect(readFileSync(decoy, "utf8")).toBe("endpoint: 8787\n");
			expect(result.errors).toEqual([]);
			expect(result.extensions.length).toBe(1);
			// Binding is the evidence: this load ran in a directory that carries no valid file at
			// the convention path, and the extension is in the load set with its label — which
			// only the framework's configuration and admission steps set.
			expect(result.extensions[0]?.label).toBe("connectBot");
			expect(stderr.split("\n").filter(line => line.includes("configuration error"))).toEqual([]);
		} finally {
			runRoot.dispose();
		}
	});
});

describe("load-source mutual exclusion (N8)", () => {
	// The cutover deletes the sibling implementation, so this contract must not depend on
	// that working tree existing. Each run materializes a stand-in old implementation with
	// the same extension name, which keeps both halves meaningful before and after cutover.
	function materializeLegacyImplementation(runRoot: RunRoot): string {
		const legacyRoot = path.join(runRoot.workDir, "legacy-extensions", "codebase-tools");
		mkdirSync(legacyRoot, { recursive: true });
		writeFileSync(path.join(legacyRoot, "index.ts"), "export const legacyCodebaseTools = true;\n");
		return legacyRoot;
	}

	/**
	 * The same stand-in for connect-bot: the extension's name, in a directory the loader can
	 * discover, exporting a factory the loader can bind and a label of its own — so which
	 * implementation a load set contains is readable from the labels it bound.
	 */
	function materializeLegacyConnectBot(runRoot: RunRoot): string {
		const legacyRoot = path.join(runRoot.workDir, "legacy-extensions", "connect-bot");
		mkdirSync(legacyRoot, { recursive: true });
		// A factory the loader can bind, labeling itself so a load set's contents are readable.
		const source = `export default function legacyConnectBot(pi: { setLabel(label: string): void }): void {\n\tpi.setLabel("legacyConnectBot");\n}\n`;
		writeFileSync(path.join(legacyRoot, "index.ts"), source);
		return legacyRoot;
	}

	test("the explicit-only OMP root discovers only this repository's implementation", async () => {
		const runRoot = createRunRoot("n8-explicit-only");
		try {
			const legacyRoot = materializeLegacyImplementation(runRoot);
			// The old implementation really exists on disk, just outside the configured root.
			expect(existsSync(path.join(legacyRoot, "index.ts"))).toBe(true);

			const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR]);
			expect(discovered.map(file => helpers.getExtensionNameFromPath(file)).sort()).toEqual([
				"codebase-tools",
				"connect-bot",
			]);
			expect(discovered.map(file => path.resolve(file))).toContain(path.resolve(CODEBASE_TOOLS_ENTRYPOINT));
			expect(discovered.some(file => path.resolve(file).startsWith(path.resolve(legacyRoot)))).toBe(false);
		} finally {
			runRoot.dispose();
		}
	});

	test("the loader does not deduplicate by extension name, so exclusion can only come from the load sources", async () => {
		const runRoot = createRunRoot("n8-both-sources");
		try {
			// Pointing discovery at both sources returns both: name matching, `disabledExtensions`
			// and identity probing are not what keeps the two implementations apart.
			const legacyRoot = materializeLegacyImplementation(runRoot);
			const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR, legacyRoot]);

			expect(discovered.length).toBe(3);
			expect(discovered.map(file => helpers.getExtensionNameFromPath(file)).sort()).toEqual([
				"codebase-tools",
				"codebase-tools",
				"connect-bot",
			]);
			expect(discovered.map(file => path.resolve(file))).toContain(path.resolve(CODEBASE_TOOLS_ENTRYPOINT));
			expect(discovered.map(file => path.resolve(file))).toContain(path.resolve(CONNECT_BOT_ENTRYPOINT));
		} finally {
			runRoot.dispose();
		}
	});

	test("the explicit-only root reaches only this repository's connect-bot implementation", async () => {
		const runRoot = createRunRoot("n8-connect-bot-explicit-only");
		try {
			const legacyRoot = materializeLegacyConnectBot(runRoot);
			// The old implementation really exists on disk, just outside the configured root.
			expect(existsSync(path.join(legacyRoot, "index.ts"))).toBe(true);

			const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR]);
			expect(discovered.some(file => path.resolve(file).startsWith(path.resolve(legacyRoot)))).toBe(false);
			const named = discovered.filter(file => helpers.getExtensionNameFromPath(file) === "connect-bot");
			expect(named).toHaveLength(1);

			// Binding the discovered set binds the repository's implementation and nothing else:
			// no binding carries the legacy label.
			const result = await loader.loadExtensions(discovered, REPO_ROOT);
			expect(result.errors).toEqual([]);
			expect(result.extensions.map(extension => extension.label).sort()).toEqual(["codeBaseTools", "connectBot"]);
		} finally {
			runRoot.dispose();
		}
	});

	test("with both sources in the discovery range both connect-bot implementations are bound", async () => {
		const runRoot = createRunRoot("n8-connect-bot-both-sources");
		try {
			const legacyRoot = materializeLegacyConnectBot(runRoot);
			const discovered = await discoverConfiguredRoots([OMP_ENTRYPOINT_DIR, legacyRoot]);

			// Two paths, one extension name: discovery does not deduplicate by name, so both
			// implementations are visible to the load.
			const connectBotPaths = discovered.filter(file => helpers.getExtensionNameFromPath(file) === "connect-bot");
			expect(connectBotPaths).toHaveLength(2);
			const resolved = connectBotPaths.map(file => path.resolve(file));
			expect(resolved).toContain(path.resolve(CONNECT_BOT_ENTRYPOINT));
			expect(resolved).toContain(path.resolve(legacyRoot, "index.ts"));

			// Both are bound into one load set — two same-named factories, neither dropped —
			// which is why only the configured discovery roots keep an original and its
			// replacement from meeting.
			const result = await loader.loadExtensions(discovered, REPO_ROOT);
			expect(result.errors).toEqual([]);
			expect(result.extensions.map(extension => extension.label).sort()).toEqual([
				"codeBaseTools",
				"connectBot",
				"legacyConnectBot",
			]);
		} finally {
			runRoot.dispose();
		}
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
				harness,
				runRoot,
				// The provider fixture keeps the turn credential-free; the discovery root
				// under test is the repository's OMP entrypoint directory.
				extensions: [...DEPLOYED_ROOT_SET],
				model: DOCK_MODEL_SELECTOR,
				env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
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

/**
 * connect-bot's binding on the real harness (P42).
 *
 * The loader tests above observe a binding in this process; these runs observe it in the
 * deployment's own shape: the real CLI of the isolated install, the repository's OMP root as
 * the only configured discovery root, and a temporary agent state directory. What connect-bot
 * needs beyond its own source is its declared configuration file, and the process of this run
 * runs in the run root rather than in the extension repository: the framework resolves the
 * declaration against the repository root the assembly derives from its own module location, so
 * these runs — which is what a real session does — bind the extension with no configuration file
 * in their working directory at all.
 */
describe("connect-bot on the real harness (P42)", () => {
	test("the run's working directory carries no configuration file, and the extension's command runs", async () => {
		const runRoot = createRunRoot("connect-bot-bound");
		const capture = startCaptureServer({ dir: runRoot.captureDir });
		try {
			// The process is started with `--cwd <run root>`: a working directory outside the
			// extension repository, which carries no `extensions/connect-bot/` at all.
			expect(existsSync(path.join(runRoot.workDir, CONNECT_BOT_CONFIG_FILE))).toBe(false);

			const session = await ControlledSession.start({
				harness,
				runRoot,
				extensions: [...DEPLOYED_ROOT_SET],
				model: DOCK_MODEL_SELECTOR,
				env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
			});
			try {
				// The extension's command is registered — which happens only past the framework's
				// configuration and admission steps — so an argument the panel protocol does not
				// know is answered with the extension's own usage error, in this session that
				// started nowhere near the file that declares the extension's configuration.
				const usage = await session.prompt("/connect-bot unknown-argument");
				expect(usage.agentInvoked).toBe(false);
				expect(usage.status).toBe("completed");
				const notified = session
					.frames()
					.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
					.map(frame => ({ message: String(frame.message ?? ""), type: String(frame.notifyType ?? "") }));
				expect(notified).toHaveLength(1);
				expect(notified[0]?.type).toBe("error");
				expect(notified[0]?.message).toContain("unknown-argument");

				// Leaving the endpoint alone: the argument is refused before any effect runs, so
				// the run reaches its end with nothing owed to the panel.
				const exit = await session.stop();
				expect(exit.timedOut).toBe(false);
				expect(exit.exitCode).toBe(0);
				// Neither configuration nor admission refused the extension, so nothing about it
				// reached the non-model channel.
				expect(diagnosticsFor("connect-bot", session)).toEqual([]);
			} finally {
				await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
			}
		} finally {
			capture.stop();
			runRoot.dispose();
		}
	}, 180_000);

	test("a configuration file in the run's working directory is ignored: the binding reads the extension's own", async () => {
		const runRoot = createRunRoot("connect-bot-decoy");
		const capture = startCaptureServer({ dir: runRoot.captureDir });
		try {
			// The control for the run above: a file does exist at this working directory's
			// convention path, and it declares an endpoint of the wrong type. A binding that read
			// the process's own directory would be refused here with a configuration error.
			const decoy = writeDecoyConnectBotConfig(runRoot);
			expect(readFileSync(decoy, "utf8")).toBe("endpoint: 8787\n");

			const session = await ControlledSession.start({
				harness,
				runRoot,
				extensions: [...DEPLOYED_ROOT_SET],
				model: DOCK_MODEL_SELECTOR,
				env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
			});
			try {
				// The command is registered all the same: what the binding read is the file under
				// the extension's own repository root, and this directory's file reached neither
				// the framework nor the extension.
				const probe = await session.prompt("/connect-bot unknown-argument");
				expect(probe.agentInvoked).toBe(false);
				expect(probe.status).toBe("completed");

				const exit = await session.stop();
				expect(exit.exitCode).toBe(0);
				const reports = diagnosticsFor("connect-bot", session);
				expect(reports).toEqual([]);
			} finally {
				await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
			}
		} finally {
			capture.stop();
			runRoot.dispose();
		}
	}, 180_000);
});
