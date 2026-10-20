import { afterEach, describe, expect, test } from "bun:test";
import { analyzeSupply } from "../../scripts/integrations/supply";
import type { SupplyOptions, SupplyResult } from "../../scripts/integrations/model";
import {
	DYNAMIC_DELIVERY_ADAPTER,
	FULL_ADAPTER,
	MISSING_BINDING_ADAPTER,
	MISSING_DELIVERY_ADAPTER,
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

describe("adapter supply analysis", () => {
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
