/**
 * The implementation startup activation slot at the framework's adapter contract (S1).
 *
 * The framework owns the startup moment and the effective choice; an extension whose activation
 * is an external effect states what "enabled" means through one `startup` entry, which the
 * framework calls at the process's first owner session start and only when the effective target
 * is enabling. The port double supplies the session boundary and the host facts, so every case
 * here observes the framework's decision rather than any harness's mapping.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { defineExtension } from "../../framework/interface";
import type { OwnerReference } from "../../framework/interface/state";
import type { SubagentIntegration } from "../../framework/interface/subagent";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** The first owner this process serves, and a later main owner in the same process. */
const OWNER: OwnerReference = { kind: "owner", key: "main:startup-activation" };
const NEXT_OWNER: OwnerReference = { kind: "owner", key: "main:startup-activation-next" };

/** The marker the area renders while the test extension's declared value holds. */
const MARKER = "◈ startup";

/** The extension the framework binds in these cases: one memory field and one marker. */
const STARTUP_TEST = defineExtension({
	id: "startup-activation",
	displayName: "Startup activation",
	state: { field: "enabled", persistence: "memory", inheritance: "none" },
	marker: { text: MARKER },
});

/** One startup policy document, written into a directory of its own. */
function policyOf(choice: boolean, extensionId = "startup-activation"): string {
	const directory = mkdtempSync(path.join(tmpdir(), "implementation-startup-"));
	policyRefs.push(directory);
	const file = path.join(directory, "policy.yaml");
	writeFileSync(file, `${extensionId}:\n  enabled: ${String(choice)}\n`);
	return file;
}

/** The directories this suite made, removed after each case so no document is read twice by accident. */
const policyRefs: string[] = [];

/** Lets the promise chains a session delivery and a run initiation started run to their end. */
async function settleMicrotasks(): Promise<void> {
	for (let turn = 0; turn < 100; turn += 1) await Promise.resolve();
}

afterEach(() => {
	for (const directory of policyRefs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("the selected startup policy's enabling choice invokes the declared activation (P3, P8)", () => {
	test("the first owner session start runs the entry once and its write is the declared value", () => {
		const activated: Array<{ readonly owner: OwnerReference; readonly hasUI: boolean }> = [];
		const double: PortDouble = portDouble();
		const binding = double.bind(STARTUP_TEST, {
			startupPolicy: policyOf(true),
			startup: delivery => {
				activated.push({ owner: delivery.owner, hasUI: delivery.hasUI });
				delivery.capability.state.write(true);
			},
		});
		expect(binding.bound).toBe(true);

		double.deliverSession(OWNER);

		expect(activated).toEqual([{ owner: OWNER, hasUI: true }]);
		expect(double.state.view(OWNER.key).read("enabled")).toBe(true);
		expect(double.markerUpdates[double.markerUpdates.length - 1]).toEqual([MARKER]);
	});
});

/** The extension whose declared value is recorded on the session branch, for history cases. */
const HISTORY_TEST = defineExtension({
	id: "startup-history",
	displayName: "Startup history",
	state: { field: "enabled", persistence: "session-entry", inheritance: "none" },
	marker: { text: MARKER },
});

describe("the policy states an intent, not a command: a disabled target invokes nothing (P15, P18)", () => {
	test("a false effective choice never reaches the activation entry", () => {
		let activated = 0;
		const double = portDouble();
		double.bind(STARTUP_TEST, {
			startupPolicy: policyOf(false),
			startup: () => {
				activated += 1;
			},
		});

		double.deliverSession(OWNER);

		expect(activated).toBe(0);
		expect(double.state.view(OWNER.key).read("enabled")).toBe(false);
	});
});

describe("the startup activation is applied once, at the process's first owner start (P26)", () => {
	test("a later main session in the same process invokes no activation", () => {
		let activated = 0;
		const double = portDouble();
		double.bind(STARTUP_TEST, {
			startupPolicy: policyOf(true),
			startup: () => {
				activated += 1;
			},
		});

		double.deliverSession(OWNER);
		double.deliverSession(NEXT_OWNER, { event: { kind: "session_start", reason: "new" } });

		expect(activated).toBe(1);
	});
});

describe("a recorded value outranks the policy's default in both directions (P9, P22)", () => {
	test("a recorded false leaves an enabling policy without an activation", () => {
		let activated = 0;
		const double = portDouble();
		double.bind(HISTORY_TEST, {
			startupPolicy: policyOf(true, "startup-history"),
			startup: () => {
				activated += 1;
			},
		});

		double.deliverSession(OWNER, { statePayloads: [{ enabled: false }] });

		expect(activated).toBe(0);
		expect(double.state.view(OWNER.key).read("enabled")).toBe(false);
	});

	test("a recorded true is an enabling target even when the policy states false", () => {
		let activated = 0;
		const double = portDouble();
		double.bind(HISTORY_TEST, {
			startupPolicy: policyOf(false, "startup-history"),
			startup: () => {
				activated += 1;
			},
		});

		double.deliverSession(OWNER, { statePayloads: [{ enabled: true }] });

		expect(activated).toBe(1);
		expect(double.state.view(OWNER.key).read("enabled")).toBe(true);
	});

	test("a memory field ignores an old enabling payload: the policy is the only startup input", () => {
		let activated = 0;
		const double = portDouble();
		double.bind(STARTUP_TEST, {
			startupPolicy: policyOf(false),
			startup: () => {
				activated += 1;
			},
		});

		double.deliverSession(OWNER, { statePayloads: [{ enabled: true }] });

		expect(activated).toBe(0);
		expect(double.state.view(OWNER.key).read("enabled")).toBe(false);
	});
});

describe("native runtime replacement is not a second process startup", () => {
	for (const reason of ["new", "resume", "fork"] as const) {
		test(`a fresh binding first reached by ${reason} consumes startup without applying the policy`, () => {
			let activated = 0;
			const double = portDouble();
			double.bind(HISTORY_TEST, { startupPolicy: policyOf(true, "startup-history"), startup: () => { activated += 1; } });
			const replacement = double.deliverSession(OWNER, { processStart: false, event: { kind: "session_start", reason } });
			expect(double.state.view(OWNER.key).read("enabled")).toBe(false);
			expect(replacement.persisted).toEqual([]);
			expect(activated).toBe(0);
			// Even an ensuing start that claims startup cannot revive the consumed moment.
			double.deliverSession(NEXT_OWNER, { processStart: true });
			expect(double.state.view(NEXT_OWNER.key).read("enabled")).toBe(false);
			expect(activated).toBe(0);
		});
	}

	for (const enabled of [false, true]) {
		test(`replacement preserves recorded ${enabled} without applying the policy`, () => {
			let activated = 0;
			const double = portDouble();
			double.bind(HISTORY_TEST, { startupPolicy: policyOf(!enabled, "startup-history"), startup: () => { activated += 1; } });
			const replacement = double.deliverSession(OWNER, { processStart: false,
				event: { kind: "session_start", reason: "resume" }, statePayloads: [{ enabled }] });
			expect(double.state.view(OWNER.key).read("enabled")).toBe(enabled);
			expect(replacement.persisted).toEqual([]);
			expect(activated).toBe(0);
		});
	}

	for (const processStart of [undefined, true]) {
		test(`initial process resume applies policy with provenance ${String(processStart)}`, () => {
			let activated = 0;
			const double = portDouble();
			double.bind(HISTORY_TEST, { startupPolicy: policyOf(true, "startup-history"), startup: () => { activated += 1; } });
			const boundary = double.deliverSession(OWNER, { event: { kind: "session_start", reason: "resume" },
				...(processStart === undefined ? {} : { processStart }) });
			expect(double.state.view(OWNER.key).read("enabled")).toBe(true);
			expect(boundary.persisted).toEqual([{ enabled: true }]);
			expect(activated).toBe(1);
		});
	}
});

describe("the startup activation adds no wait beside the lifecycle's required ones (P27)", () => {
	test("the first request waits for the integration and initialization, and never for a pending startup", async () => {
		const integration = Promise.withResolvers<SubagentIntegration>();
		const initialization = Promise.withResolvers<void>();
		const activation = Promise.withResolvers<void>();
		const order: string[] = [];
		const double = portDouble({ subagentIntegration: () => integration.promise });
		double.bind(STARTUP_TEST, {
			startupPolicy: policyOf(true),
			startup: () => {
				order.push("startup");
				return activation.promise;
			},
			initialize: () => {
				order.push("initialize");
				return initialization.promise;
			},
		});

		// The startup entry runs at the session node, before the initialization chain has settled.
		double.deliverSession(OWNER);
		expect(order).toEqual(["startup"]);

		let finished = false;
		const firstRun = double.initiateRun(OWNER).then(result => {
			finished = true;
			return result;
		});
		await settleMicrotasks();
		// The subagent integration is still being settled: the request waits for it, exactly as it
		// did before startup modes existed.
		expect(finished).toBe(false);

		integration.resolve({ mode: "none" });
		await settleMicrotasks();
		// The integration settled and the implementation's own initialization began: that promise
		// still gates the request.
		expect(order).toEqual(["startup", "initialize"]);
		expect(finished).toBe(false);

		initialization.resolve();
		const result = await firstRun;
		expect(finished).toBe(true);
		// The startup activation is not a completion barrier: the request was issued while the
		// effect it began was still pending, and the plan is the ordinary one for this State.
		expect(result.contribution).toBeUndefined();
		expect(order).toEqual(["startup", "initialize"]);

		activation.resolve();
		await settleMicrotasks();
		expect(double.diagnostics).toEqual([]);
	});
});
