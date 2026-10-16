/**
 * The per-session context readings pi's own bindings publish, and what the detail tree does with them
 * (P44; S1).
 *
 * A session's context usage is reachable only from that session's own binding, so the extension's pi
 * half observes every binding it gets — the session this entry serves and every session the subagent
 * provider spawns through the same entry — and publishes the reading into the one runtime the process
 * shares. That is what the detail form's descendant rows draw: each session's own context beside its
 * own statistics, against the fixed display budget of *that* session's channel, without a
 * viewed-session outlet and without anything reaching the storage root.
 *
 * The seam is the framework's own public consumption: the extension's real definition is bound through
 * the framework's real pi adapter, the runtime is the one `createModelCostRuntime` builds, the
 * observation is the production `observeSessionContext` and the drawing is the production
 * `attachModelCostWidget`. Two bindings share one runtime here because that is what two sessions of one
 * pi process are: each session's own binding publishes into the process's readings, and the reading a
 * descendant published is what the session it belongs to is drawn beside. The storage root is the one
 * fact this file states for itself, because the framework reads one extension's configuration once per
 * process and a suite in a shared process must name its own.
 *
 * What it cannot establish here is a real host's own lineage of an in-process spawned session: the
 * controlled surface states the facts a case delivers. The real process paths — the shipped assembly,
 * the provider's own delegation and the launch of a child session — are the real-host script's.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { MODEL_COST_HARNESS, observeSessionContext } from "../../extensions/model-cost/harnesses/pi";
import { attachModelCostWidget } from "../../extensions/model-cost/harnesses/pi/widget";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { piAdapter } from "../../framework/adapters/pi";
import type { OwnerReference, SessionFacts } from "../../framework/core/protocol";
import { type ControlledPiSurface, type HostSession, controlledPiSurface } from "./support/pi-host";
import { uiBoundaryTimerOf } from "./support/ui-timer";

/** The repository root, from this file's own location, so the adapter resolves the real declaration. */
const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..", "..");

/** The self-made price list: one monetary tier, which is the channel whose display budget has a number. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: [],
	models: { official: { "model-alpha": { mode: "monetary", tier: "alpha" } } },
};

const HARNESS = "pi-context-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const CHILD: SessionFacts = { sessionId: "session-child", kind: "sub", name: "子代理", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:pi-context" };
const CONSUMPTION_FILE = "consumption.json";

/** The instant every read-time reading is taken at: a peak instant of the price list's own zone. */
const CLOCK_AT = Date.parse("2026-10-01T03:00:00.000Z");

/** The document the tree is drawn from: the main session and the child it spawned. */
const TREE = {
	schemaVersion: 1,
	periodId: "period-pi-context",
	start: "2026-10-01T00:00:00.000Z",
	holiday: false,
	harnesses: {
		[HARNESS]: {
			sessions: [
				{
					id: "session-main",
					name: "主会话",
					parent: null,
					saveVersion: 1,
					own: {
						official: {
							"model-alpha": { tokens: { input: 100, cacheRead: 0, cacheWrite: 0, output: 100 }, costCny: 0.001 },
						},
					},
				},
				{
					id: "session-child",
					name: "子代理",
					parent: "session-main",
					saveVersion: 1,
					own: {
						official: {
							"model-alpha": { tokens: { input: 20, cacheRead: 0, cacheWrite: 0, output: 20 }, costCny: 0.0002 },
						},
					},
				},
			],
		},
	},
} as unknown as ConsumptionDocument;

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** The main session's own binding, as its context publishes it. */
const MAIN_HOST: HostSession = {
	sessionId: MAIN.sessionId,
	name: MAIN.name,
	provider: "official",
	model: "model-alpha",
	effort: "high",
	mode: "rpc",
	context: { tokens: 1_000, contextWindow: 100_000 },
};

/** The spawned session's own binding: its own model, its own context, its own reading. */
const CHILD_HOST: HostSession = {
	sessionId: CHILD.sessionId,
	name: CHILD.name,
	provider: "official",
	model: "model-alpha",
	effort: "high",
	mode: "rpc",
	context: { tokens: 90_000, contextWindow: 1_000_000 },
};

/** One run of this file: the runtime both bindings share and the surfaces they were bound to. */
interface Fixture {
	readonly runtime: ModelCostRuntime;
	readonly main: ControlledPiSurface;
	readonly child: ControlledPiSurface;
}

/**
 * One process's own runtime over an isolated storage root, shared by the two bindings below, and the
 * two surfaces a main session and the session it spawned are bound to.
 *
 * Each surface is bound through the framework's real pi adapter with the extension's real definition
 * and the real runtime; the framework's factory runs once per process, so the runtime a binding is
 * handed is the same one the binding before it got. The production halves are attached per binding,
 * exactly as the shipped assembly attaches them.
 */
function fixture(): Fixture {
	const root = mkdtempSync(path.join(tmpdir(), "pi-context-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(TREE), "utf8");
	let runtime: ModelCostRuntime | undefined;
	const bind = piAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
		factory: context => {
			runtime ??= createModelCostRuntime({
				// The framework's own read of the declared configuration is what its shape is validated
				// against; the root is this file's, so no case writes where the shipped declaration points.
				config: { ...context.config, storageDir: root },
				configDirectory: path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id),
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				now: () => CLOCK_AT,
			});
			return runtime.implementation;
		},
	});
	const main = controlledPiSurface();
	const child = controlledPiSurface();
	for (const surface of [main, child]) {
		if (!bind(surface.api).bound) throw new Error("the model-cost binding was refused");
	}
	const built = runtime as ModelCostRuntime;
	// One process, one UI: both bindings register with the same boundary wait, exactly as the shipped
	// assembly hands the process's one timer to every frontend it attaches.
	const uiBoundaryTimer = uiBoundaryTimerOf(built);
	observeSessionContext(main.api, built);
	attachModelCostWidget(main.api, built, uiBoundaryTimer);
	observeSessionContext(child.api, built);
	attachModelCostWidget(child.api, built, uiBoundaryTimer);
	return { runtime: built, main, child };
}

/** Every line of one drawing that carries the given text. */
function linesWith(lines: readonly string[], text: string): readonly string[] {
	return lines.filter(line => line.includes(text));
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the extension publishes each session's own context reading into the one process runtime (P44)", () => {
	test("every binding of the process publishes its own reading into the one runtime", () => {
		const { main, child, runtime } = fixture();
		// The binding of the session this entry serves publishes its own reading when its session starts,
		// and the reading is keyed by that session: no other session's facts are borrowed for it.
		main.sessionStarts(MAIN_HOST);
		main.runInitiates(MAIN_HOST);
		expect(runtime.sessionContext.read(MAIN.sessionId)).toEqual({
			tokens: 1_000,
			provider: "official",
			model: "model-alpha",
		});
		expect(runtime.sessionContext.read(CHILD.sessionId)).toBeUndefined();

		// The spawned session's own binding runs in the same process and publishes its own reading at its
		// start and again at the message its next Turn settled: both land in the process's one runtime.
		child.sessionStarts(CHILD_HOST, "new");
		expect(runtime.sessionContext.read(CHILD.sessionId)?.tokens).toBe(90_000);
		child.turnSettles({ ...CHILD_HOST, context: { tokens: 91_010, contextWindow: 1_000_000 } }, { input: 1_010, output: 0 });
		expect(runtime.sessionContext.read(CHILD.sessionId)).toEqual({
			tokens: 91_010,
			provider: "official",
			model: "model-alpha",
		});
		// The main session's own reading stands as its own binding published it.
		expect(runtime.sessionContext.read(MAIN.sessionId)?.tokens).toBe(1_000);
	});

	test("a reading pi states as unknown is no reading at all", () => {
		const { main, child, runtime } = fixture();
		main.sessionStarts(MAIN_HOST);
		const unknown = { ...CHILD_HOST, context: { tokens: null, contextWindow: 1_000_000 } };
		child.sessionStarts(unknown, "new");

		// pi's own unknown is a null token count, which is not a context of zero and not a reading: the
		// process's record for that session stays empty.
		expect(runtime.sessionContext.read(CHILD.sessionId)).toBeUndefined();
		// The same binding's later reading, published when one of its messages settled, is recorded.
		child.turnSettles(CHILD_HOST, { input: 90_000, output: 0 });
		expect(runtime.sessionContext.read(CHILD.sessionId)).toEqual({
			tokens: 90_000,
			provider: "official",
			model: "model-alpha",
		});
	});

	test("the observation is given up with the binding that made it", () => {
		const { main, child, runtime } = fixture();
		// This surface's own observation, so the release below is the only registration it has.
		const observed = controlledPiSurface();
		const release = observeSessionContext(observed.api, runtime);
		observed.sessionStarts(CHILD_HOST, "new");
		expect(runtime.sessionContext.read(CHILD.sessionId)?.tokens).toBe(90_000);

		// The released observation is given up: the registrations it made are gone, so a later reading of
		// the same session is not observed, and the last one it published stands.
		release();
		observed.turnSettles({ ...CHILD_HOST, context: { tokens: 300_000, contextWindow: 1_000_000 } }, { input: 300_000, output: 0 });
		expect(runtime.sessionContext.read(CHILD.sessionId)?.tokens).toBe(90_000);
		// A binding that still holds its own observation is untouched by that release.
		main.sessionStarts(MAIN_HOST, "new");
		expect(runtime.sessionContext.read(MAIN.sessionId)?.tokens).toBe(1_000);
		// The fixture's own binding of the child session is untouched too.
		child.turnSettles({ ...CHILD_HOST, context: { tokens: 400_000, contextWindow: 1_000_000 } }, { input: 400_000, output: 0 });
		expect(runtime.sessionContext.read(CHILD.sessionId)?.tokens).toBe(400_000);
	});
});
