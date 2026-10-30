import { describe, expect, test } from "bun:test";
import { defineExtension, defineImplementation } from "../../framework/interface";
import type { ToolDeclaration } from "../../framework/interface/tool";
import type { BoundTool } from "../../framework/runtime/port";
import { planIntegration } from "../../framework/behaviors/integration-plan";
import { portDouble } from "./support/harness-port-double";

const definition = defineExtension({ id: "tools-test", displayName: "Tools" });
const declaration: ToolDeclaration<{ calls: number }> = {
	name: "probe", label: "Probe", description: "Inspect a value",
	parameters: { type: "object", properties: { value: { type: "boolean", description: "A boolean" } }, required: ["value"], additionalProperties: false },
	execute: (state, params, delivery) => {
		state.calls++;
		return { content: [{ type: "text", text: delivery.sessionId }], details: { params, calls: state.calls }, isError: false };
	},
};

describe("framework tools", () => {
	test("static declaration stays lazy and materialized calls share business state", async () => {
		let creations = 0;
		const tools: BoundTool[] = [];
		const authored = defineImplementation({ create: () => { creations++; return { calls: 0 }; }, tools: [declaration] });
		expect(creations).toBe(0);
		const double = portDouble({ registerTool: tool => tools.push(tool) });
		expect(double.bind(definition, { factory: authored }).bound).toBe(true);
		expect(creations).toBe(1);
		const first = await tools[0]!.execute({ value: true }, { sessionId: "one", callId: "first" });
		const second = await tools[0]!.execute({ value: false }, { sessionId: "two", callId: "second" });
		expect(first.details).toEqual({ params: { value: true }, calls: 1 });
		expect(second.details).toEqual({ params: { value: false }, calls: 2 });
		expect(second.content[0]?.text).toBe("two");
	});

	test("unsupported tool capability refuses before hooks and cleans up once", () => {
		let cleaned = 0;
		const double = portDouble();
		const result = double.bind(definition, { factory: defineImplementation({ create: () => ({ calls: 0 }), tools: [declaration], cleanup: () => { cleaned++; } }) });
		expect(result.bound).toBe(false);
		expect(double.registrations.filter(value => !value.startsWith("label:"))).toEqual([]);
		expect(cleaned).toBe(1);
		expect(portDouble().bind(definition).bound).toBe(true);
	});

	test("ended implementation never executes retained tool handlers", () => {
		const tools: BoundTool[] = [];
		const double = portDouble({ registerTool: tool => tools.push(tool) });
		double.bind(definition, { factory: defineImplementation({ create: () => ({ calls: 0 }), tools: [declaration], cleanup: () => {} }) });
		const owner = { kind: "owner", key: "tools-owner" } as const;
		double.deliverSession(owner);
		double.deliverSession(owner, { event: { kind: "session_end", reason: "disposed" } });
		expect(() => tools[0]!.execute({}, { sessionId: "ended", callId: "late" })).toThrow("disposed");
	});

	test("planner requires tool registration only for declared tools", () => {
		expect(planIntegration({ tools: true }).port.find(item => item.member === "registerTool")?.requirement).toBe("required");
		expect(planIntegration({}).port.some(item => item.member === "registerTool")).toBe(false);
	});
});


