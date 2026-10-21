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
