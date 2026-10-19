import { describe, expect, test } from "bun:test";
import type { ExtensionDefinition } from "../../framework/interface/details/definition";
import type { HarnessIntegrationDeclaration } from "../../framework/core/integration";
import { checkAdapterIntegrations } from "../../framework/integration-check";

const COST: ExtensionDefinition = {
	id: "cost", displayName: "Cost", subagentRequirements: ["session-facts", "turn-usage"],
};
const ROUTING: ExtensionDefinition = {
	id: "routing", displayName: "Routing", subagentRequirements: ["state-follow"],
};

describe("independent subagent integration completeness", () => {
	test("coverage cannot be pooled across execution modes", () => {
		const harness: HarnessIntegrationDeclaration = {
			harness: "mixed",
			subagents: { "in-process": ["session-facts"], "cross-process": ["turn-usage"] },
		};
		const [result] = checkAdapterIntegrations([COST], [harness], [{ extension: "cost", harness: "mixed" }]);
		expect(result.missing).toEqual([
			{ kind: "subagent-capability", mode: "in-process", capability: "turn-usage" },
			{ kind: "subagent-capability", mode: "cross-process", capability: "session-facts" },
		]);
	});

	test("one fully connected mode suffices when that is all the harness declares", () => {
		const harness: HarnessIntegrationDeclaration = {
			harness: "local", subagents: { "in-process": ["session-facts", "turn-usage"] },
		};
		const [result] = checkAdapterIntegrations([COST], [harness], [{ extension: "cost", harness: "local" }]);
		expect(result.missing).toEqual([]);
		expect(result.modes).toEqual(["in-process"]);
	});

	test("reports each extension's own gaps, not another extension's demands or undeployed pairings", () => {
		const harness: HarnessIntegrationDeclaration = {
			harness: "mixed", subagents: { "in-process": ["session-facts", "turn-usage"] },
		};
		const results = checkAdapterIntegrations([COST, ROUTING], [harness, { harness: "unused", subagents: {} }], [
			{ extension: "cost", harness: "mixed" },
			{ extension: "routing", harness: "mixed" },
		]);
		expect(results.map(result => ({ extension: result.extension, harness: result.harness, missing: result.missing }))).toEqual([
			{ extension: "cost", harness: "mixed", missing: [] },
			{ extension: "routing", harness: "mixed", missing: [
				{ kind: "subagent-capability", mode: "in-process", capability: "state-follow" },
			] },
		]);
	});

	test("an advertised but unconnected mode is not silently ignored", () => {
		const [result] = checkAdapterIntegrations([COST], [{ harness: "empty", subagents: { "cross-process": [] } }], [
			{ extension: "cost", harness: "empty" },
		]);
		expect(result.missing).toEqual([
			{ kind: "subagent-capability", mode: "cross-process", capability: "session-facts" },
			{ kind: "subagent-capability", mode: "cross-process", capability: "turn-usage" },
		]);
	});

	test("a harness declaring no subagent mode does not vacuously satisfy a dependent extension", () => {
		const [result] = checkAdapterIntegrations([COST], [{ harness: "main-only", subagents: {} }], [
			{ extension: "cost", harness: "main-only" },
		]);
		expect(result.missing).toEqual([{ kind: "subagent-mode" }]);
	});

	test("a new harness entry without a supply declaration is a missing integration", () => {
		const [result] = checkAdapterIntegrations([COST], [], [{ extension: "cost", harness: "new-harness" }]);
		expect(result.missing).toEqual([{ kind: "harness-declaration" }]);
	});

	test("a new extension entry absent from the catalog cannot pass as having no requirements", () => {
		const [result] = checkAdapterIntegrations([], [], [{ extension: "new-extension", harness: "local" }]);
		expect(result.missing).toEqual([{ kind: "extension-declaration" }]);
	});

	test("an extension without subagent requirements owes no subagent integration", () => {
		const [result] = checkAdapterIntegrations([{ id: "main-only", displayName: "Main only" }], [], [
			{ extension: "main-only", harness: "local" },
		]);
		expect(result.missing).toEqual([]);
	});
});
