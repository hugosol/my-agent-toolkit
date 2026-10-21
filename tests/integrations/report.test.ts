import { describe, expect, test } from "bun:test";
import { compareDemand, printIntegrationReport } from "../../scripts/integrations/check";
import type {
	DemandResult,
	IntegrationContract,
	SessionFactsFieldReport,
	SupplyResult,
	SupplyStatus,
} from "../../scripts/integrations/model";

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

describe("session facts field reporting", () => {
	const fieldReport: SessionFactsFieldReport = {
		mapping: "declared",
		declaration: { file: "adapters/target/session.ts", line: 4, column: 30 },
		fields: [
			{ field: "sessionId", status: "mapped", file: "adapters/target/session.ts", line: 5, column: 2 },
			{ field: "agentName", status: "unavailable", reason: "pi reports no agent definition", file: "adapters/target/session.ts", line: 9, column: 12 },
		],
	};
	const sessionContract: IntegrationContract = {
		id: "framework:session-facts",
		kind: "framework",
		member: "session-facts",
		requirement: "optional",
		origins: [{ file: "extensions/a/runtime.ts", line: 2, column: 1 }],
		path: ["extension:a", "delivery.session"],
	};
	const sessionDemand: DemandResult = { extension: "a", files: [], contracts: [sessionContract], diagnostics: [] };

	test("keeps the field report separate from legacy completion and optional fact policy", () => {
		const result = compareDemand(sessionDemand, {
			adapter: "target",
			exists: true,
			supplies: [{ contractId: "framework:session-facts", status: "provided" }],
			sessionFacts: fieldReport,
			diagnostics: [],
		});
		expect(result.complete).toBe(true);
		expect(result.sessionFacts).toEqual(fieldReport);
	});

	test("reports a missing canonical mapping without pretending the fields are mapped", () => {
		const missing: SessionFactsFieldReport = {
			mapping: "missing",
			declaration: { file: "adapters/target/index.ts", line: 2, column: 1 },
			reason: "No canonical defineSessionFactsMapping declaration was found in this adapter.",
			fields: [
				{ field: "sessionId", status: "missing", file: "adapters/target/index.ts", line: 2, column: 1 },
				{ field: "agentName", status: "missing", file: "adapters/target/index.ts", line: 2, column: 1 },
			],
		};
		const result = compareDemand(sessionDemand, {
			adapter: "target",
			exists: true,
			supplies: [{ contractId: "framework:session-facts", status: "provided" }],
			sessionFacts: missing,
			diagnostics: [],
		});
		expect(result.complete).toBe(true);
		expect(result.sessionFacts?.mapping).toBe("missing");
		expect(result.sessionFacts?.fields.every(field => field.status === "missing")).toBe(true);
	});

	test("prints field status and location without a field suggestion", () => {
		const result = compareDemand(sessionDemand, {
			adapter: "target",
			exists: true,
			supplies: [{ contractId: "framework:session-facts", status: "provided" }],
			sessionFacts: fieldReport,
			diagnostics: [],
		});
		const lines: string[] = [];
		const original = console.log;
		console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };
		try {
			printIntegrationReport({ stage: "integration-contracts", behaviorTestsRun: false, complete: true, results: [result] });
		} finally {
			console.log = original;
		}
		const text = lines.join("\n");
		expect(text).toContain("session-facts mapping DECLARED adapters/target/session.ts:4:30");
		expect(text).toContain("MAPPED sessionId (adapters/target/session.ts:5:2)");
		expect(text).toContain("UNAVAILABLE agentName — pi reports no agent definition (adapters/target/session.ts:9:12)");
	});
});
