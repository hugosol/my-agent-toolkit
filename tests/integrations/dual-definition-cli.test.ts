import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IntegrationReport } from "../../scripts/integrations/check";
import { cleanupContractRoots, createContractRoot, FULL_ADAPTER, writeFixture } from "./contract-fixtures";

afterEach(cleanupContractRoots);

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function fixtureRoot(missing?: "onUserInput" | "onTurn", single = false): string {
	const root = createContractRoot();
	writeFixture(root, "framework/interface/index.ts", "export function defineExtension(value: unknown): unknown { return value; }");
	writeFixture(root, "framework/interface/details/implementation.ts", "export function defineImplementation(value: unknown): unknown { return value; }");
	const adapter = missing === undefined ? FULL_ADAPTER : FULL_ADAPTER.replace(
		`${missing}: context => handler => {},`,
		`${missing}: unavailablePortMember("fixture lacks ${missing}"),`,
	);
	writeFixture(root, "adapters/fixture/internal/port.ts", adapter);
	writeFixture(root, "extensions/chat/common.ts", "export function sharedWork(): void {};");
	for (const [role, event] of [["manager", "user_input"], ["node", "turn_start"]] as const) {
		if (single && role === "node") continue;
		writeFixture(root, `extensions/chat/${role}-definition.ts`, `import { defineExtension } from "../../framework/interface";
export const definition = defineExtension({ id: "${role}-chat", displayName: "${role}" });`);
		writeFixture(root, `extensions/chat/${role}-implementation.ts`, `import { defineImplementation } from "../../framework/interface/details/implementation";
import { sharedWork } from "./common";
export const implementation = defineImplementation({ create: () => ({}), subscriptions: [{ scope: "owner", events: { ${event}: () => sharedWork() } }] });`);
		writeFixture(root, `extensions/chat/${role}.ts`, `import { definition } from "./${role}-definition";
import { implementation } from "./${role}-implementation";
export const assembly = { definition, implementation };
throw new Error("Static integration checking must not execute role assemblies");`);
	}
	return root;
}

function run(root: string, extension = "chat", ...extra: string[]) {
	// Approved seam S3: invoke the real maintainer command, with no analyzer mocks.
	const result = spawnSync(process.execPath, ["run", "check:integrations", "--root", root, "--extension", extension, "--adapter", "fixture", ...extra], {
		cwd: repository, encoding: "utf8", timeout: 90_000,
	});
	expect(result.error, result.stderr).toBeUndefined();
	return result;
}

function check(root: string, extension = "chat", ...extra: string[]) {
	const result = run(root, extension, "--json", ...extra);
	return { status: result.status, report: JSON.parse(result.stdout) as IntegrationReport };
}

describe("P4 independent declarations through the integration command", () => {
	// Contract P4 requires two independent results. Selecting only the first definition or
	// merging both implementations would violate it; distinct event requirements expose both.
	test("checks both legal roles in one business directory without merging their requirements", () => {
		const { status, report } = check(fixtureRoot());
		expect(status, JSON.stringify(report)).toBe(0);
		expect(report).toMatchObject({ complete: true, behaviorTestsRun: false });
		expect(report.results.map(result => result.extension)).toEqual(["manager-chat", "node-chat"]);
		const [manager, node] = report.results;
		expect(manager?.diagnostics).toEqual([]);
		expect(node?.diagnostics).toEqual([]);
		expect(manager?.contracts.find(item => item.id === "port:onUserInput")?.supply?.status).toBe("provided");
		expect(manager?.contracts.some(item => item.id === "port:onTurn")).toBe(false);
		expect(node?.contracts.find(item => item.id === "port:onTurn")?.supply?.status).toBe("provided");
		expect(node?.contracts.some(item => item.id === "port:onUserInput")).toBe(false);
	});

	// Selecting a declaration must retain its own assembly and implementation, but not another
	// role's gap. A directory-wide scan would incorrectly return 1 for the healthy selection.
	test.each([
		["manager", "onTurn", "manager-chat", "port:onUserInput"],
		["node", "onUserInput", "node-chat", "port:onTurn"],
	] as const)("selects only the %s declaration source", (role, missing, id, required) => {
		const { status, report } = check(fixtureRoot(missing), `extensions/chat/${role}-definition.ts`);
		expect(status, JSON.stringify(report)).toBe(0);
		expect(report.results).toHaveLength(1);
		expect(report.results[0]).toMatchObject({ extension: id, complete: true, diagnostics: [] });
		expect(report.results[0]?.contracts.find(item => item.id === required)?.supply?.status).toBe("provided");
	});

	test.each([undefined, "onUserInput"] as const)("preserves single-declaration diagnostics with missing capability %s", missing => {
		const { status, report } = check(fixtureRoot(missing, true));
		expect(status).toBe(missing === undefined ? 0 : 1);
		expect(report.results).toHaveLength(1);
		expect(report.results[0]).toMatchObject({ extension: "manager-chat", complete: missing === undefined, diagnostics: [] });
		expect(report.results[0]?.contracts.find(item => item.id === "port:onUserInput")?.supply?.status).toBe(missing === undefined ? "provided" : "unavailable");
	});

	// Without a source relationship, claiming either role is complete would silently skip
	// authored requirements. S3 must report unresolved ownership rather than guess by filename.
	test("does not certify authored implementations whose role cannot be determined", () => {
		const root = fixtureRoot();
		for (const role of ["manager", "node"]) {
			writeFixture(root, `extensions/chat/${role}.ts`, `export { definition } from "./${role}-definition";`);
		}
		const { status, report } = check(root);
		expect(status).toBe(1);
		expect(report.results).toHaveLength(2);
		expect(report.results.every(result => !result.complete)).toBe(true);
		expect(report.results[0]?.diagnostics).toContainEqual(expect.objectContaining({
			code: "demand/implementation-owner", file: "extensions/chat/manager-implementation.ts",
		}));
		expect(report.results[1]?.diagnostics).toContainEqual(expect.objectContaining({
			code: "demand/implementation-owner", file: "extensions/chat/node-implementation.ts",
		}));
	});

	test("prints role-qualified capability gaps and distinguishes invocation failure", () => {
		const root = fixtureRoot("onTurn");
		const result = run(root);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("manager-chat / fixture: COMPLETE");
		expect(result.stdout).toContain("node-chat / fixture: INCOMPLETE");
		expect(result.stdout).toContain("UNAVAILABLE port:onTurn (required) — fixture lacks onTurn");
		expect(result.stdout).toContain("source extensions/chat/node-implementation.ts:");
		const invalid = check(root, "chat", "--unknown-option");
		expect(invalid.status).toBe(2);
		expect(invalid.report).toMatchObject({ complete: false, error: "Unknown option: --unknown-option" });
	});

	// P4: a missing manager capability must not fail node, and the second role must not
	// inherit manager's successful supply result. Literal expected owners are independent.
	test.each([
		["onUserInput", "manager-chat", "node-chat", "manager-implementation.ts"],
		["onTurn", "node-chat", "manager-chat", "node-implementation.ts"],
	] as const)("attributes missing %s only to %s", (member, failedRole, passingRole, origin) => {
		const { status, report } = check(fixtureRoot(member));
		expect(status).toBe(1);
		expect(report.complete).toBe(false);
		expect(report.results.map(result => result.extension)).toEqual(["manager-chat", "node-chat"]);
		const failed = report.results.find(result => result.extension === failedRole);
		const passed = report.results.find(result => result.extension === passingRole);
		expect(failed).toMatchObject({ complete: false, diagnostics: [] });
		expect(passed).toMatchObject({ complete: true, diagnostics: [] });
		expect(failed?.contracts.find(item => item.id === `port:${member}`)).toMatchObject({
			requirement: "required",
			origins: [expect.objectContaining({ file: `extensions/chat/${origin}` })],
			supply: { status: "unavailable", reason: `fixture lacks ${member}` },
		});
		expect(passed?.contracts.some(item => item.id === `port:${member}`)).toBe(false);
	});
});
