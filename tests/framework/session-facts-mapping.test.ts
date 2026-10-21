/**
 * The adapter-authoring Session facts mapping: every canonical fact is decided in one place, a
 * mapping that answers nothing omits the member, and the reasons a host cannot state a fact are
 * carried to consumers exactly as the field attempted it.
 */
import { describe, expect, test } from "bun:test";
import {
	defineSessionFactsMapping,
	unavailableFact,
} from "../../framework/runtime/adapter-authoring";

interface MappingInput {
	readonly id: string;
	readonly name?: string;
	readonly dynamicAgentName?: string;
}

describe("one SessionFacts mapping decides every canonical field", () => {
	test("static and dynamic absences are both reported while resolved fields are carried", () => {
		const mapping = defineSessionFactsMapping<MappingInput>({
			sessionId: input => input.id,
			kind: () => "sub",
			parentSessionId: unavailableFact("direct parent session"),
			name: (input, unavailable) => {
				if (input.name === undefined) unavailable.push("session name");
				return input.name;
			},
			taskName: () => undefined,
			agentName: (input, unavailable) => {
				const name = input.dynamicAgentName;
				if (name === undefined) unavailable.push("agent name");
				return name;
			},
			agentId: () => "agent-1",
			startup: () => undefined,
			unavailable: () => ["position unavailable"],
		});

		const facts = mapping({ id: "session-1" });
		expect(facts.sessionId).toBe("session-1");
		expect(facts.kind).toBe("sub");
		expect(facts.agentId).toBe("agent-1");
		expect(facts.parentSessionId).toBeUndefined();
		expect(facts.name).toBeUndefined();
		expect(facts.taskName).toBeUndefined();
		expect(facts.agentName).toBeUndefined();
		expect(facts.startup).toBeUndefined();
		expect(facts.unavailable).toEqual([
			"position unavailable",
			"direct parent session",
			"session name",
			"agent name",
		]);
	});

	test("a field mapper's undefined answer is absence, not a statement that the host lacks the fact", () => {
		const mapping = defineSessionFactsMapping<MappingInput>({
			sessionId: input => input.id,
			kind: () => "main",
			parentSessionId: () => undefined,
			name: () => undefined,
			taskName: () => undefined,
			agentName: unavailableFact("agent name"),
			agentId: () => undefined,
			startup: () => undefined,
			unavailable: () => [],
		});

		const facts = mapping({ id: "session-2" });
		expect(facts.name).toBeUndefined();
		expect(facts.parentSessionId).toBeUndefined();
		expect(facts.unavailable).toEqual(["agent name"]);
	});

});
