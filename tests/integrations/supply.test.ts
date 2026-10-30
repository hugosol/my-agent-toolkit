import { afterEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { analyzeSupply } from "../../scripts/integrations/supply";
import type { SupplyOptions, SupplyResult } from "../../scripts/integrations/model";
import {
	DYNAMIC_DELIVERY_ADAPTER,
	FULL_ADAPTER,
	MISSING_BINDING_ADAPTER,
	MISSING_DELIVERY_ADAPTER,
	SESSION_FACTS_ADAPTER,
	SESSION_FACTS_DYNAMIC_ADAPTER,
	SESSION_FACTS_MISSING_FIELD_ADAPTER,
	cleanupContractRoots,
	createContractRoot,
	deliveryContract,
	frameworkContract,
	portContract,
	writeFixture,
} from "./contract-fixtures";

afterEach(cleanupContractRoots);

function supplyFor(root: string, adapter: string, contracts: SupplyOptions["contracts"]): SupplyResult {
	return analyzeSupply({ root, adapter, contracts });
}

function statusOf(result: SupplyResult, id: string) {
	const entry = result.supplies.find(item => item.contractId === id);
	if (entry === undefined) throw new Error(`Missing supply entry for ${id}`);
	return entry;
}

function fieldOf(result: SupplyResult, name: string) {
	const report = result.sessionFacts;
	if (report === undefined) throw new Error("Missing session facts report");
	const entry = report.fields.find(item => item.field === name);
	if (entry === undefined) throw new Error(`Missing session facts field for ${name}`);
	return entry;
}

function lineOf(source: string, marker: string): number {
	const index = source.split("\n").findIndex(line => line.includes(marker));
	if (index < 0) throw new Error(`Missing fixture marker ${marker}`);
	return index + 1;
}

describe("adapter supply analysis", () => {
	for (const adapter of ["pi", "omp"]) {
		test(`${adapter} provides native tool registration without an assembly-specific witness`, () => {
			const result = supplyFor(resolve(import.meta.dir, "../.."), adapter, [portContract("registerTool")]);
			expect(result.diagnostics).toEqual([]);
			expect(statusOf(result, "port:registerTool").status).toBe("provided");
		}, 30_000);
	}

	test("a source-file selection analyzes its owning adapter rather than reporting it missing", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/fixture/internal/port.ts", FULL_ADAPTER);
		const result = supplyFor(root, "adapters/fixture/internal/port.ts", [portContract("onSession")]);
		expect(result.exists).toBe(true);
		expect(result.diagnostics).toEqual([]);
		expect(statusOf(result, "port:onSession").status).toBe("provided");
	});
	test("follows binding factories to typed delivery constructions", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/fixture/internal/port.ts", FULL_ADAPTER);
		const result = supplyFor(root, "fixture", [
			portContract("onSession"),
			portContract("onRound"),
			portContract("onTurn"),
			deliveryContract("session.feedback.notify"),
			deliveryContract("session.capability.state.write"),
			deliveryContract("session.capability.state.read"),
			deliveryContract("round.feedback.notify"),
			deliveryContract("activity.feedback.notify"),
		]);
		expect(result.exists).toBe(true);
		expect(result.definition).toBeDefined();
		expect(result.contextType).toBe("FixtureContext");
		expect(result.diagnostics).toEqual([]);
		for (const id of [
			"port:onSession",
			"port:onRound",
			"port:onTurn",
			"delivery:session.feedback.notify",
			"delivery:session.capability.state.write",
			"delivery:session.capability.state.read",
			"delivery:round.feedback.notify",
			"delivery:activity.feedback.notify",
		]) {
			expect(statusOf(result, id).status).toBe("provided");
		}
		expect(statusOf(result, "delivery:session.feedback.notify").implementation).toBeDefined();
	});

	test("keeps unavailable optional and conditional availability distinct", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/fixture/internal/port.ts", FULL_ADAPTER);
		const result = supplyFor(root, "fixture", [
			portContract("onDisposal", "optional"),
			portContract("sessionObservationAccess", "optional"),
			portContract("subagentIntegration", "optional"),
			deliveryContract("round.closeOut.remaining", "optional"),
			deliveryContract("initialization.subagents", "optional"),
		]);
		expect(result.diagnostics).toEqual([]);
		expect(statusOf(result, "port:onDisposal").status).toBe("unavailable");
		expect(statusOf(result, "port:sessionObservationAccess").status).toBe("unavailable");
		expect(statusOf(result, "port:subagentIntegration").status).toBe("conditional");
		expect(statusOf(result, "delivery:round.closeOut.remaining").status).toBe("unavailable");
		expect(statusOf(result, "delivery:initialization.subagents").status).toBe("conditional");
	});

	test("reports a missing binding and a missing delivery member without inventing supply", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/missing/internal/port.ts", MISSING_BINDING_ADAPTER);
		const missingBinding = supplyFor(root, "missing", [portContract("onTurn"), deliveryContract("round.feedback.notify")]);
		expect(missingBinding.diagnostics).toEqual([]);
		expect(statusOf(missingBinding, "port:onTurn").status).toBe("missing");
		expect(statusOf(missingBinding, "delivery:round.feedback.notify").status).toBe("missing");

		writeFixture(root, "adapters/no-feedback/internal/port.ts", MISSING_DELIVERY_ADAPTER);
		const missingMember = supplyFor(root, "no-feedback", [deliveryContract("round.feedback.notify")]);
		expect(missingMember.diagnostics).toEqual([]);
		expect(statusOf(missingMember, "delivery:round.feedback.notify").status).toBe("missing");
	});

	test("reports dynamic delivery construction as unresolved with a diagnostic", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/dynamic/internal/port.ts", DYNAMIC_DELIVERY_ADAPTER);
		const result = supplyFor(root, "dynamic", [deliveryContract("session.feedback.notify")]);
		expect(statusOf(result, "delivery:session.feedback.notify").status).toBe("unresolved");
		expect(result.diagnostics.some(item => item.code === "supply/unresolved-delivery")).toBe(true);
	});

	test("supports demand-only adapters by reporting every absent adapter prerequisite", () => {
		const root = createContractRoot();
		const result = supplyFor(root, "absent", [
			portContract("onSession"),
			deliveryContract("session.feedback.notify", "optional"),
			frameworkContract("extension-loading", "optional"),
			frameworkContract("model-prices", "optional"),
		]);
		expect(result.exists).toBe(false);
		expect(result.definition).toBeUndefined();
		expect(result.diagnostics).toEqual([]);
		expect(statusOf(result, "port:onSession").status).toBe("missing");
		expect(statusOf(result, "delivery:session.feedback.notify").status).toBe("missing");
		expect(statusOf(result, "framework:extension-loading").status).toBe("missing");
		expect(statusOf(result, "framework:model-prices").status).toBe("missing");
	});

	test("maps framework persistence and marker semantics to typed construction, not to a name", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/fixture/internal/port.ts", FULL_ADAPTER);
		const result = supplyFor(root, "fixture", [
			frameworkContract("state-persistence"),
			frameworkContract("marker"),
			frameworkContract("prompt-contribution"),
			frameworkContract("round-lifecycle-events"),
		]);
		expect(result.diagnostics).toEqual([]);
		expect(statusOf(result, "framework:state-persistence").status).toBe("provided");
		expect(statusOf(result, "framework:marker").status).toBe("provided");
		expect(statusOf(result, "framework:prompt-contribution").status).toBe("provided");
		expect(statusOf(result, "framework:round-lifecycle-events").status).toBe("provided");
	});
});

describe("session facts field report", () => {
	test("reports mapped functions and canonical unavailable facts with their source locations", () => {
		const root = createContractRoot();
		const file = "adapters/facts/internal/port.ts";
		writeFixture(root, file, SESSION_FACTS_ADAPTER);
		const result = supplyFor(root, "facts", [frameworkContract("session-facts")]);
		const report = result.sessionFacts;
		expect(result.diagnostics).toEqual([]);
		expect(statusOf(result, "framework:session-facts").status).toBe("provided");
		expect(report?.mapping).toBe("declared");
		expect(report?.declaration).toMatchObject({ file, line: lineOf(SESSION_FACTS_ADAPTER, "export const SESSION_FACTS") });
		expect(report?.fields.map(field => field.field)).toEqual([
			"sessionId",
			"kind",
			"parentSessionId",
			"name",
			"taskName",
			"agentName",
			"agentId",
			"startup",
			"unavailable",
		]);

		expect(fieldOf(result, "sessionId")).toMatchObject({
			status: "mapped",
			file,
			line: lineOf(SESSION_FACTS_ADAPTER, "sessionId: input => input.sessionId"),
		});
		// An optional field mapped by a function remains mapped; its runtime undefined is not a warning.
		expect(fieldOf(result, "parentSessionId").status).toBe("mapped");
		expect(fieldOf(result, "parentSessionId").reason).toBeUndefined();
		expect(fieldOf(result, "startup").status).toBe("mapped");
		expect(fieldOf(result, "unavailable").status).toBe("mapped");

		expect(fieldOf(result, "agentName")).toMatchObject({
			status: "unavailable",
			reason: "pi reports no agent definition",
			file,
			line: lineOf(SESSION_FACTS_ADAPTER, "agentName: unavailableFact"),
		});
		expect(fieldOf(result, "taskName")).toMatchObject({
			status: "unavailable",
			reason: "pi reports no task handle",
		});
	});

	test("reports a key the mapping omits as missing at the declaration, never mapped", () => {
		const root = createContractRoot();
		const file = "adapters/facts/internal/port.ts";
		writeFixture(root, file, SESSION_FACTS_MISSING_FIELD_ADAPTER);
		const result = supplyFor(root, "facts", [frameworkContract("session-facts")]);
		expect(result.diagnostics).toEqual([]);
		expect(result.sessionFacts?.mapping).toBe("declared");
		expect(fieldOf(result, "agentName")).toMatchObject({
			status: "missing",
			file,
			line: lineOf(SESSION_FACTS_MISSING_FIELD_ADAPTER, "export const SESSION_FACTS"),
		});
		expect(fieldOf(result, "agentName").reason).toBeUndefined();
		expect(fieldOf(result, "sessionId").status).toBe("mapped");
	});

	test("reports dynamic mapping shapes as unresolved instead of guessing field coverage", () => {
		const root = createContractRoot();
		const file = "adapters/facts/internal/port.ts";
		writeFixture(root, file, SESSION_FACTS_DYNAMIC_ADAPTER);
		const result = supplyFor(root, "facts", [frameworkContract("session-facts")]);
		expect(result.diagnostics).toEqual([]);
		expect(result.sessionFacts?.mapping).toBe("unresolved");
		expect(result.sessionFacts?.reason).toContain("spread");
		expect(fieldOf(result, "sessionId").status).toBe("mapped");
		expect(fieldOf(result, "agentName").status).toBe("unavailable");
		expect(fieldOf(result, "kind")).toMatchObject({ status: "unresolved", file });
	});

	test("does not inspect a mapping when the contract set does not demand session facts", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/facts/internal/port.ts", SESSION_FACTS_ADAPTER);
		const result = supplyFor(root, "facts", [portContract("onSession")]);
		expect(result.diagnostics).toEqual([]);
		expect(result.sessionFacts).toBeUndefined();
	});

	test("reports an absent canonical mapping as missing without changing legacy contract supply", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/no-mapping/internal/port.ts", FULL_ADAPTER);
		const result = supplyFor(root, "no-mapping", [frameworkContract("session-facts")]);
		expect(result.diagnostics).toEqual([]);
		expect(statusOf(result, "framework:session-facts").status).toBe("provided");
		expect(result.sessionFacts?.mapping).toBe("missing");
		expect(result.sessionFacts?.reason).toContain("defineSessionFactsMapping");
		expect(result.sessionFacts?.fields.length).toBe(9);
		expect(result.sessionFacts?.fields.every(field => field.status === "missing")).toBe(true);
	});
});
