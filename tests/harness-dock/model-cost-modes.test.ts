/**
 * The consumption modes, their widget and the reference channel on the real patched host (P7, P8, P9,
 * P10, P25; S5).
 *
 * These runs are the extension's real OMP entrypoint loaded into the isolated patched host, driven
 * over RPC, with the extension's own native widget read off the host's `setWidget` frames. What they
 * establish is the half a unit test cannot: that the modes' display behavior is really wired into the
 * host, that a `hidden` model creates no usage widget while the model still executes, that the fixed
 * display budget is displayed without touching what the session sends to the provider, and that the
 * allowance channel's own price really reaches a request — the host's model catalog, mapped by the
 * adapter into the price the framework snapshots at the request's start, so the reference amount and
 * the fee-structure ratio are produced by a production run rather than by an injected catalog.
 *
 * Every model is reached through the dock's own capture endpoint, so no run needs a credential and
 * nothing leaves the machine; the request the host really sent is the run's own outbound evidence. The
 * allowance model's price is the run's own `models.yml` fixture — explicit amounts per million tokens —
 * so the reference amount below is hand-computed from numbers this file states, not from a real
 * provider's price.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { MODEL_COST_WIDGET_KEY } from "../../extensions/model-cost/harnesses/omp/widget";
import { writeAgentSettings } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";
import { ensureViewedSessionHarness } from "./viewed-session-harness";

const record = readBaselineRecord();
/** The dock's own provider fixture: an unknown provider name, whose model this extension does not list. */
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");

/**
 * A run-root copy of the extension's source with no shared framework configuration.
 *
 * The production entrypoint resolves `framework/config.yaml` from its own module location, and this
 * suite's own `apiKey: "dock-key"` is a resolvable credential, so a machine that has enabled the
 * `codex` proxy there would make every Codex run here issue a real account query. Copying the three
 * trees the entrypoint needs and dropping the copied shared config keeps these runs loading the
 * production source verbatim while the Codex startup query stays refused as `misconfigured`, exactly
 * as it is on a machine with no such entry. The copy lives under the run root, so the run's own
 * disposal removes it.
 */
function materializeModelCostSource(runRoot: RunRoot): string {
	const source = path.join(runRoot.path, "source");
	for (const relative of ["framework", "extensions/model-cost", "entrypoints/omp"]) {
		cpSync(path.join(REPO_ROOT, relative), path.join(source, relative), { recursive: true });
	}
	rmSync(path.join(source, "framework", "config.yaml"), { force: true });
	return path.join(source, "entrypoints", "omp", "model-cost.ts");
}

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for the priced runs, as the wire numbers it sends. */
const CAPTURE_USAGE = { input: 2000, output: 1000, cacheRead: 1000 };

/**
 * The usage the capture endpoint reports for the allowance run, whose model price this file states.
 *
 * The Codex protocol's `input_tokens` counts the prompt tokens the cached and the written ones are
 * detailed from, exactly as the chat protocol's `prompt_tokens` does, so these wire numbers are the
 * run's own reading of 1000 non-cached input, 1000 cache reads, 500 cache writes and 1000 output.
 */
const CODEX_CAPTURE_USAGE = { input: 2500, output: 1000, cacheRead: 1000, cacheWrite: 500 };

/**
 * The price the run's own `models.yml` states for the allowance model: US dollars per million tokens,
 * one amount per reported bucket. It is a fixture, not a real provider's price, and it is what the
 * reference amounts this file asserts are computed from.
 */
const CODEX_MODEL_COST = { input: 1, output: 2, cacheRead: 1, cacheWrite: 2 };

/** The OpenCode Go provider and model every token-only run names, as the extension's data lists them. */
const GO_PROVIDER = "opencode-go";
const GO_MODEL = "deepseek-v4-pro";
const GO_SELECTOR = `${GO_PROVIDER}/${GO_MODEL}`;

/** The official provider the monetary runs redirect, and the Allowance channel's own provider. */
const DEEPSEEK_PROVIDER = "deepseek";
const CODEX_PROVIDER = "openai-codex";
const CODEX_MODEL = "gpt-6-luna";

/** One run's isolated home and the storage root the shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly consumptionFile: string;
	readonly env: Record<string, string>;
}

/** The isolated user home one run uses: `<run root>/user-home`, with the OMP home inside it. */
function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	const consumptionFile = path.join(storageDirectory, CONSUMPTION_FILE);
	// The period the extension starts on, written where its own storage root holds it: a holiday
	// period, because DeepSeek bills a holiday period off-peak all day, so the amount a run accounts
	// for is the same figure whatever the wall clock says when the request goes out. This is the run's
	// own baseline file, not a fixture of the extension's.
	writeFileSync(
		consumptionFile,
		JSON.stringify({
			schemaVersion: 1,
			periodId: "period-modes",
			start: "2026-10-01T00:00:00.000Z",
			holiday: true,
			harnesses: { omp: { sessions: [] } },
		}),
		"utf8",
	);
	return {
		home,
		consumptionFile,
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** One model a run defines for a provider in its own `models.yml`. */
interface RunModel {
	readonly id: string;
	readonly name: string;
	/** The provider API dialect for this model; omitted means the provider's own. */
	readonly api?: string;
	readonly reasoning: boolean;
	readonly input: readonly string[];
	/** The four amounts the harness's own catalog states, per million tokens. */
	readonly cost?: typeof CODEX_MODEL_COST;
	readonly contextWindow: number;
	readonly maxTokens: number;
}

/** One provider a run defines in its own `models.yml`. */
interface RunProvider {
	readonly id: string;
	/** The provider API dialect for the models defined here. */
	readonly api?: string;
	/** Absent keeps the harness's own definitions for the provider, whose transport is redirected. */
	readonly models?: readonly RunModel[];
}

/**
 * Write the run's own `models.yml`: each provider is pointed at the capture endpoint, and a provider
 * that states models replaces the harness's definitions for it with them.
 *
 * The dock's usual provider override rewrites one *built-in* provider's transport, which is all a run
 * that takes the catalog's own models needs. A provider the harness does not carry at all — the Go
 * channel's — must be defined outright, and a run that asserts an amount from the harness's own
 * catalog states that catalog's model and its price here, as a fixture of this file rather than a real
 * provider's price.
 */
function writeRunModels(agentDir: string, baseUrl: string, providers: readonly RunProvider[]): void {
	mkdirSync(agentDir, { recursive: true });
	const lines = ["providers:"];
	for (const provider of providers) {
		lines.push(
			`  ${JSON.stringify(provider.id)}:`,
			`    baseUrl: ${JSON.stringify(baseUrl)}`,
			'    apiKey: "dock-key"',
		);
		if (provider.api !== undefined) lines.push(`    api: ${JSON.stringify(provider.api)}`);
		if (provider.models === undefined || provider.models.length === 0) continue;
		lines.push("    models:");
		for (const model of provider.models) {
			lines.push(`      - id: ${JSON.stringify(model.id)}`, `        name: ${JSON.stringify(model.name)}`);
			if (model.api !== undefined) lines.push(`        api: ${JSON.stringify(model.api)}`);
			lines.push(
				`        reasoning: ${String(model.reasoning)}`,
				`        input: [${model.input.map(entry => JSON.stringify(entry)).join(", ")}]`,
			);
			if (model.cost !== undefined) {
				lines.push(
					`        cost: { input: ${model.cost.input}, output: ${model.cost.output}, cacheRead: ${model.cost.cacheRead}, cacheWrite: ${model.cost.cacheWrite} }`,
				);
			}
			lines.push(`        contextWindow: ${model.contextWindow}`, `        maxTokens: ${model.maxTokens}`);
		}
	}
	writeFileSync(path.join(agentDir, "models.yml"), `${lines.join("\n")}\n`, "utf8");
}

/** The Go channel's own provider: not a built-in one, so the run defines it and its model outright. */
const GO_PROVIDER_DEFINITION: RunProvider = {
	id: GO_PROVIDER,
	api: "openai-completions",
	models: [
		{
			id: GO_MODEL,
			name: "Go DeepSeek",
			reasoning: false,
			input: ["text"],
			contextWindow: 64000,
			maxTokens: 8192,
		},
	],
};

/** The Allowance channel's provider, with the one model this file's own price fixture prices. */
const CODEX_PROVIDER_DEFINITION: RunProvider = {
	id: CODEX_PROVIDER,
	models: [
		{
			id: CODEX_MODEL,
			name: "Dock Luna",
			api: "openai-codex-responses",
			reasoning: true,
			input: ["text"],
			cost: CODEX_MODEL_COST,
			contextWindow: 272000,
			maxTokens: 128000,
		},
	],
};

/** The official provider, whose transport is redirected while the catalog's definitions stay. */
const DEEPSEEK_PROVIDER_DEFINITION: RunProvider = { id: DEEPSEEK_PROVIDER };

/** One provisioned run: the session, the capture endpoint behind it and the isolated root. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly home: IsolatedHome;
}

/** The display modes one run can be provisioned for. */
type Provision =
	/** The dock's own unknown provider and model: a pair this extension's data does not name. */
	| { readonly kind: "unlisted" }
	/** The Go provider's token-only id, defined in the run's own `models.yml`. */
	| { readonly kind: "token-only" }
	/** The official DeepSeek provider, redirected to the capture endpoint. */
	| { readonly kind: "deepseek" }
	/** The allowance channel's provider, redirected to the capture endpoint over the Codex protocol. */
	| { readonly kind: "codex" }
	/** Both of the last two in one session, so a model switch crosses the two channels. */
	| { readonly kind: "both" }
	/** The official provider beside the Go channel's, whose provider the run defines itself. */
	| { readonly kind: "monetary-and-go" };

/** The model each provision runs, and which providers its own `models.yml` writes. */
const PROVISION_BY_KIND: Record<Provision["kind"], { readonly selector: string; readonly providers: readonly RunProvider[] }> = {
	unlisted: { selector: DOCK_MODEL_SELECTOR, providers: [] },
	"token-only": { selector: GO_SELECTOR, providers: [GO_PROVIDER_DEFINITION] },
	deepseek: { selector: `${DEEPSEEK_PROVIDER}/deepseek-flash`, providers: [DEEPSEEK_PROVIDER_DEFINITION] },
	codex: { selector: `${CODEX_PROVIDER}/${CODEX_MODEL}`, providers: [CODEX_PROVIDER_DEFINITION] },
	both: {
		selector: `${DEEPSEEK_PROVIDER}/deepseek-flash`,
		providers: [DEEPSEEK_PROVIDER_DEFINITION, CODEX_PROVIDER_DEFINITION],
	},
	"monetary-and-go": {
		selector: `${DEEPSEEK_PROVIDER}/deepseek-flash`,
		providers: [DEEPSEEK_PROVIDER_DEFINITION, GO_PROVIDER_DEFINITION],
	},
};

/**
 * What one run is asked for beyond its provision: the control run that loads no extension, and the
 * endpoint's own scripted balance answer for the runs whose case observes one.
 */
interface RunOptions {
	/** Load this repository's model-cost entrypoint; `false` is the control run without it. */
	readonly withModelCost?: boolean;
	/** The capture endpoint's own balance answer, for a run that drives the prefetch end to end. */
	readonly balance?: Parameters<typeof startCaptureServer>[0]["balance"];
}

/**
 * One run. `extensions` is the extension set the isolated host loads explicitly: the model-cost
 * entrypoint always, and the dock's provider fixture only where the run's model comes from it. The
 * control run without the entrypoint is the same model on the same endpoint, so the two runs'
 * captured requests are comparable.
 */
async function startRun(
	label: string,
	provision: Provision,
	usage: { readonly input: number; readonly output: number; readonly cacheRead?: number; readonly cacheWrite?: number } | undefined,
	options: RunOptions = {},
): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock model-cost reply",
		...(usage === undefined ? {} : { usage }),
		...(options.balance === undefined ? {} : { balance: options.balance }),
	});
	const definition = PROVISION_BY_KIND[provision.kind];
	if (definition.providers.length > 0) writeRunModels(runRoot.agentDir, capture.baseUrl, definition.providers);
	if (provision.kind === "codex" || provision.kind === "both") {
		// The Codex transport prefers websockets, and only the SSE request is observable at the local
		// endpoint this run uses; pinning the transport is what makes that request the one recorded.
		writeAgentSettings(runRoot.agentDir, { "providers.openaiWebsockets": "off" });
	}
	try {
		const session = await ControlledSession.start({
			harness: patched,
			runRoot,
			extensions:
				options.withModelCost === false
					? [PROVIDER_FIXTURE]
					: [PROVIDER_FIXTURE, materializeModelCostSource(runRoot)],
			model: definition.selector,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, home };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the rest of the run still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

/** The extension's own usage-widget frames, in the order the host emitted them. */
function widgetFrames(session: ControlledSession): RpcFrame[] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" &&
				frame.method === "setWidget" &&
				frame.widgetKey === MODEL_COST_WIDGET_KEY,
		);
}

/** The lines of the last widget the host was told to show, or nothing when it was cleared. */
function shownLines(session: ControlledSession): string[] | undefined {
	const shown = widgetFrames(session).filter(frame => frame.widgetLines !== undefined);
	const last = shown[shown.length - 1];
	return last === undefined ? undefined : (last.widgetLines as string[]);
}

/**
 * Waits until the widget the host was told to show carries text a case expects, and answers the whole
 * rendering.
 *
 * A balance reading is background work the extension's own prefetch performs: the exchange that
 * waited for it completes first, and the rendering that carries the reading lands after it. The wait
 * is on the rendering itself rather than on a duration, and the deadline only keeps one that never
 * lands from hanging the case.
 */
async function shownLinesWhere(
	session: ControlledSession,
	accept: (text: string) => boolean,
): Promise<string> {
	const deadline = Date.now() + 30_000;
	for (;;) {
		const text = (shownLines(session) ?? []).join("\n");
		if (accept(text)) return text;
		if (Date.now() > deadline) {
			throw new Error(`no widget rendering the case expects was published; last was:\n${text || "<none>"}`);
		}
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

/** The JSON body of the one request the capture endpoint recorded, as the endpoint recorded it. */
function capturedBody(run: DockRun): unknown {
	const requests = run.capture.requests();
	expect(requests).toHaveLength(1);
	return requests[0]?.json;
}

/** One session's record inside the document the run's storage root holds. */
interface SavedSession {
	readonly id: string;
	readonly name: string;
	readonly parent: string | null;
	readonly saveVersion: number;
	readonly own: Record<
		string,
		Record<string, { readonly tokens: Record<string, number>; readonly costCny?: number; readonly referenceCostUsd?: number }>
	>;
}

/**
 * Waits until the run's document holds the record a case expects, and answers with it.
 *
 * A Round's end is dispatched the way the framework dispatches a semantic handler — the extension
 * waits for its own save before that handler returns, while the host does not wait for the handler —
 * so the write lands a few event-loop turns later. The wait is on the expected content itself rather
 * than on a duration, and the deadline only keeps a save that never happened from hanging the case.
 */
async function savedSession(file: string, accept: (record: SavedSession) => boolean): Promise<SavedSession> {
	const deadline = Date.now() + 15_000;
	const { promise, resolve } = Promise.withResolvers<void>();
	for (;;) {
		if (existsSync(file)) {
			const document = JSON.parse(readFileSync(file, "utf8")) as {
				readonly harnesses?: Record<string, { readonly sessions?: readonly SavedSession[] }>;
			};
			for (const record of Object.values(document.harnesses ?? {}).flatMap(bucket => bucket.sessions ?? [])) {
				if (accept(record)) return record;
			}
		}
		if (Date.now() > deadline) throw new Error(`no session record the case expects was published at ${file}`);
		setImmediate(resolve);
		await promise;
	}
}

/**
 * One body as text, with the run's own temporary root rewritten.
 *
 * The host names the session's working directory in the request it sends, and each isolated run has
 * a root of its own; that path is the only difference two otherwise identical runs may have, so it
 * is normalized away and the rest of the body is compared verbatim.
 */
function comparableBody(run: DockRun): string {
	return JSON.stringify(capturedBody(run)).split(run.runRoot.path.replace(/\\/g, "/")).join("<run-root>");
}

let patched: IsolatedHarness;

beforeAll(async () => {
	patched = await ensureViewedSessionHarness(record);
}, 600_000);

describe("a hidden model draws no usage widget and still runs (P8, P9)", () => {
	test("an unlisted pair shows no widget at all while the model really executes", async () => {
		const run = await startRun("model-cost-modes-hidden", { kind: "unlisted" }, CAPTURE_USAGE);
		try {
			const turn = await run.session.prompt("one unlisted exchange");
			expect(turn.status).toBe("completed");
			expect(turn.agentInvoked).toBe(true);

			// The request really went out and really reached the endpoint: hidden is a display mode,
			// not a refusal to run the model.
			expect(run.capture.requests()).toHaveLength(1);

			// And the extension created no usage widget for it: no frame ever carried lines under the
			// usage widget's key (a clear with no lines is the widget being absent, not a display).
			expect(widgetFrames(run.session).filter(frame => frame.widgetLines !== undefined)).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});

describe("a token-only model shows its approved usage with no amount of its own (P8)", () => {
	test("the Go ids draw the fixed budget and a token total, and no currency anywhere", async () => {
		const run = await startRun("model-cost-modes-token-only", { kind: "token-only" }, CAPTURE_USAGE);
		try {
			const turn = await run.session.prompt("one token-only exchange");
			expect(turn.status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(1);

			const lines = shownLines(run.session);
			expect(lines).toBeDefined();
			const text = (lines ?? []).join("\n");

			// The approved fields, as the host itself reported them: the endpoint's prompt count minus the
			// cached tokens it detailed is the non-cached input (2000 - 1000 = 1000), so this run's own
			// buckets are 1000/1000/0/1000 — a Sum of 3,000 and a cache hit rate of 1000 of 2000, 50%.
			expect(text).toContain("Cache: 50%");
			expect(text).toContain("Sum: 3,000");
			// The run's own model has no amount policy, so no amount and no fee-structure ratio appears:
			// no currency mark and no Cache/In/Out ratio wording anywhere in the widget.
			expect(text).not.toContain("\u00A5");
			expect(text).not.toContain("$");
			expect(text).not.toContain("Cache/In/Out");

			// The five Go ids share the DeepSeek display budget: the specification's own fixed 450K,
			// displayed as a fact (and never sent anywhere).
			expect(text).toContain("450.0K");
			expect(text).toContain("Effort: ");
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});

describe("the allowance model draws the Codex budget and the reference its own catalog prices (P7, P10, P25)", () => {
	test("a pure Codex session shows 272K, the hand-computed Ref and the four-amount ratio", async () => {
		const run = await startRun("model-cost-modes-allowance", { kind: "codex" }, CODEX_CAPTURE_USAGE);
		try {
			const turn = await run.session.prompt("one allowance exchange");
			expect(turn.status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(1);

			const lines = shownLines(run.session);
			expect(lines).toBeDefined();
			const text = (lines ?? []).join("\n");

			// The reference amount is this run's own model price over its own reading — the four amounts
			// the harness's catalog states (1/1/2/2 US dollars per million tokens) over 1000/1000/500/1000
			// tokens, so 5,000 of a million: $0.0050, hand-computed here and nowhere recomputed by the code.
			expect(text).toContain("Ref: $0.0050");
			// The allowance channel's own display budget is the specification's 272K, not DeepSeek's.
			expect(text).toContain("272.0K");
			expect(text).toContain("Sum: 3,500");
			expect(text).toContain("Cache: 50%");
			// The ratio's own structure is the catalog's four amounts, cache write included: 1000, 1000,
			// 500·2 and 1000 of 5000 are 20:20:20:40.
			expect(text).toContain("$CacheR/In/CacheW/Out\uff1a20:20:20:40");
			// A reference is not a CNY accounting amount: no yuan anywhere and no Cost line at all.
			expect(text).not.toContain("\u00A5");
			expect(text).not.toContain("Cost:");

			// And the production run really saved it: the session's own record holds the same reading and
			// the same reference amount, in the record's own field.
			const record = await savedSession(run.home.consumptionFile, candidate => candidate.saveVersion >= 1);
			expect(record.own[CODEX_PROVIDER]?.[CODEX_MODEL]?.tokens).toEqual({
				input: 1000,
				cacheRead: 1000,
				cacheWrite: 500,
				output: 1000,
			});
			expect(record.own[CODEX_PROVIDER]?.[CODEX_MODEL]?.referenceCostUsd).toBe(0.005);
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});

describe("one session's two channels keep both currencies across a model switch (P7)", () => {
	test("an amount already accounted is not re-priced, and the other channel is added beside it", async () => {
		// One usage for both requests: the chat path reports 1500 non-cached input of the 2500 prompt
		// tokens this run scripts (it details the cached ones alone), while the Responses path details the
		// cached and the written ones too, so the two channels' readings differ by exactly that.
		const run = await startRun("model-cost-modes-both", { kind: "both" }, CODEX_CAPTURE_USAGE);
		try {
			expect((await run.session.prompt("one priced exchange")).status).toBe("completed");
			const first = (shownLines(run.session) ?? []).join("\n");
			// The first request's own amount: the flash tier's holiday off-peak 1/0.02/4 CNY per million
			// over 1500/1000/0/1000 tokens is 5,520 of a million, so ¥0.0055 — and no reference exists yet.
			expect(first).toContain("Cost: \u00A50.0055");
			expect(first).toContain("450.0K");
			expect(first).not.toContain("Ref:");

			// The session's model switches to the allowance channel, which is the other channel's price
			// and its own request-start anchor: the amount already accounted above is not re-priced.
			await run.session.request({ type: "set_model", provider: CODEX_PROVIDER, modelId: CODEX_MODEL });
			expect((await run.session.prompt("one allowance exchange")).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(2);

			const switched = (shownLines(run.session) ?? []).join("\n");
			// Both currencies, side by side and never added together: the CNY already accounted and the
			// reference the second request's own price produced, with the switched budget and ratio.
			expect(switched).toContain("Cost: \u00A50.0055");
			expect(switched).toContain("Ref: $0.0050");
			expect(switched).toContain("272.0K");
			expect(switched).toContain("$CacheR/In/CacheW/Out\uff1a20:20:20:40");

			// The saved document holds one session's two channels apart, each at its own request's price.
			const record = await savedSession(
				run.home.consumptionFile,
				candidate => candidate.own[CODEX_PROVIDER]?.[CODEX_MODEL] !== undefined,
			);
			expect(record.own[DEEPSEEK_PROVIDER]?.["deepseek-flash"]?.costCny).toBeCloseTo(0.00552, 10);
			expect(record.own[CODEX_PROVIDER]?.[CODEX_MODEL]?.referenceCostUsd).toBe(0.005);
			expect(record.own[CODEX_PROVIDER]?.[CODEX_MODEL]?.costCny).toBeUndefined();
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});

describe("a monetary model shows the fixed budget and the accounted cost (P10)", () => {
	test("the DeepSeek budget is displayed at 450K while the request the host sends is unchanged", async () => {
		const priced = await startRun("model-cost-modes-monetary", { kind: "deepseek" }, CAPTURE_USAGE);
		try {
			const turn = await priced.session.prompt("one priced exchange");
			expect(turn.status).toBe("completed");

			const lines = shownLines(priced.session);
			expect(lines).toBeDefined();
			const text = (lines ?? []).join("\n");
			// The accounted amount of the host's own reading at the period's holiday price — the flash
			// tier's off-peak 1/0.02/4 CNY per million tokens over 1000/1000/1000 tokens, so 0.00502 CNY —
			// and the specification's fixed 450K budget.
			expect(text).toContain("Cost: \u00A50.0050");
			expect(text).toContain("450.0K");
			expect(text).toContain("Cache: 50%");
			// The fee structure is the same 20:0:80... of the tier's own weights whether the season is
			// peak or off-peak, which is what makes the displayed ratio season-invariant: 20/1000/4000.
			expect(text).toContain("\u00A5Cache/In/Out\uff1a0:20:80");

			// The display-only budget left the request alone: a control run of the same model on the
			// same endpoint, without the extension loaded at all, sent the very same body.
			const control = await startRun("model-cost-modes-control", { kind: "deepseek" }, CAPTURE_USAGE, {
				withModelCost: false,
			});
			try {
				expect((await control.session.prompt("one priced exchange")).status).toBe("completed");
				expect(comparableBody(priced)).toEqual(comparableBody(control));
			} finally {
				await disposeRun(control);
			}
		} finally {
			await disposeRun(priced);
		}
	}, 300_000);
});

describe("the balance the CLI holds is the official channel's own line (P8, P67)", () => {
	test("a held reading survives a real switch to a Go id and back, and only the official pair draws it", async () => {
		const run = await startRun("model-cost-modes-balance-switch", { kind: "monetary-and-go" }, CAPTURE_USAGE, {
			balance: { total: "110.00" },
		});
		try {
			// The official pair: the instance's own prefetch really left the process and really was
			// answered, and the endpoint's own amount is what the widget shows.
			expect((await run.session.prompt("one priced exchange")).status).toBe("completed");
			expect(await shownLinesWhere(run.session, text => text.includes("Balance:"))).toContain(
				"\u{1F4B0} Balance: \u00A5110.00",
			);
			expect(run.capture.balanceCalls()).toHaveLength(1);

			// The same CLI switches to the Go channel's token-only id. Its own model has no amount policy,
			// so its structure contributes no ratio of its own, while the tree's Sum keeps both channels'
			// usage — and the balance the process holds is not drawn at all: a token-only display has no
			// official balance (spec §134).
			await run.session.request({ type: "set_model", provider: GO_PROVIDER, modelId: GO_MODEL });
			expect((await run.session.prompt("one token-only exchange")).status).toBe("completed");
			const tokenOnly = (shownLines(run.session) ?? []).join("\n");
			expect(tokenOnly).toContain("Sum: 6,000");
			expect(tokenOnly).not.toContain("Cache/In/Out");
			expect(tokenOnly.split("\n").some(line => line.includes("Balance:"))).toBe(false);

			// The reading was not re-asked for having been hidden: a Go request is no request of the
			// balance's own provider, so nothing in this phase consults the balance endpoint at all.
			expect(run.capture.balanceCalls()).toHaveLength(1);

			// Back on the official pair the reading is drawn again, out of the cache the switch left
			// standing rather than out of a new query — the run stays well inside the shipped 30000ms
			// success TTL, so only a prefetch may have asked, and it asked once.
			await run.session.request({ type: "set_model", provider: DEEPSEEK_PROVIDER, modelId: "deepseek-flash" });
			expect((await run.session.prompt("one priced exchange again")).status).toBe("completed");
			const restored = (shownLines(run.session) ?? []).join("\n");
			expect(restored).toContain("\u{1F4B0} Balance: \u00A5110.00");
			expect(restored).toContain("Sum: 9,000");
			expect(run.capture.balanceCalls()).toHaveLength(1);
			expect(run.capture.requests()).toHaveLength(3);

			// And what the switch crossed is saved as it happened: the official pair's own two requests'
			// amounts, and the Go pair's usage with no amount of its own. The wait is on the document
			// holding both channels' final readings — the save of each request lands a few event-loop turns
			// after its own exchange — and the figures below are then read off it.
			const record = await savedSession(
				run.home.consumptionFile,
				candidate =>
					candidate.own[GO_PROVIDER]?.[GO_MODEL] !== undefined &&
					candidate.own[DEEPSEEK_PROVIDER]?.["deepseek-flash"]?.tokens.output === 2000,
			);
			expect(record.own[DEEPSEEK_PROVIDER]?.["deepseek-flash"]?.tokens).toEqual({
				input: 2000,
				cacheRead: 2000,
				cacheWrite: 0,
				output: 2000,
			});
			expect(record.own[DEEPSEEK_PROVIDER]?.["deepseek-flash"]?.costCny).toBeCloseTo(0.01004, 10);
			expect(record.own[GO_PROVIDER]?.[GO_MODEL]?.tokens).toEqual({
				input: 1000,
				cacheRead: 1000,
				cacheWrite: 0,
				output: 1000,
			});
			expect(record.own[GO_PROVIDER]?.[GO_MODEL]?.costCny).toBeUndefined();
			expect(record.own[GO_PROVIDER]?.[GO_MODEL]?.referenceCostUsd).toBeUndefined();
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
