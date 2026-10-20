import { describe, expect, test } from "bun:test";
import { compareDemand } from "../../scripts/integrations/check";
import type { DemandResult, IntegrationContract, SupplyResult, SupplyStatus } from "../../scripts/integrations/model";

function demand(requirement: "required" | "optional"): DemandResult {
	const contract: IntegrationContract = { id: "port:providerAccess", kind: "port", member: "providerAccess", requirement, origins: [{ file: "extensions/a/runtime.ts", line: 2, column: 1 }], path: ["provider query", "providerAccess"] };
	return { extension: "a", files: [], contracts: [contract], diagnostics: [] };
}
function supply(status: SupplyStatus): SupplyResult {
	return { adapter: "target", exists: true, supplies: [{ contractId: "port:providerAccess", status }], diagnostics: [] };
}

describe("integration diagnostic policy", () => {
	test("an explicitly optional absence is reported without failing the check", () => {
		const result = compareDemand(demand("optional"), supply("unavailable"));
		expect(result.complete).toBe(true);
		expect(result.contracts[0].supply?.status).toBe("unavailable");
	});
	test("the same absence blocks a required dependency", () => {
		expect(compareDemand(demand("required"), supply("unavailable")).complete).toBe(false);
	});
	test("unknown supply cannot pass just because a dependency is optional", () => {
		expect(compareDemand(demand("optional"), supply("unresolved")).complete).toBe(false);
	});
	test("conditionally enabled implementations do not certify required availability", () => {
		expect(compareDemand(demand("required"), supply("conditional")).complete).toBe(false);
		expect(compareDemand(demand("optional"), supply("conditional")).complete).toBe(true);
	});
	test("a supply analyzer omitting a requested contract leaves analysis incomplete", () => {
		const result = compareDemand(demand("optional"), { adapter: "target", exists: true, supplies: [], diagnostics: [] });
		expect(result.complete).toBe(false);
		expect(result.contracts[0].supply?.status).toBe("unresolved");
	});
});
