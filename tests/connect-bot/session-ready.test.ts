import { expect, test } from "bun:test";
import { ompAdapter } from "../../adapters/omp";
import { defineExtension, defineImplementation } from "../../framework/interface";
import { ompDouble } from "./support/omp-double";

function readiness() {
	const host = ompDouble();
	const events: string[] = [];
	ompAdapter(defineExtension({ id: "ready-regression", displayName: "Ready regression" }), {
		implementation: defineImplementation({
			create: () => ({}),
			subscriptions: [{ scope: "owner", events: {
				session_start: (_state, delivery) => { events.push(`start:${delivery.session.sessionId}`); },
				session_ready: (_state, delivery) => { events.push(`ready:${delivery.session.sessionId}`); },
			} }],
		}),
	})(host.api);
	const context = (sessionId: string, mode: "tui" | "rpc" = "tui", hasUI = true) => ({
		...host.context({ sessionId, cwd: process.cwd(), hasUI }), mode,
	});
	return { host, events, context };
}

// Exercise the platform task boundary, not an elapsed-time estimate or a simulated clock.
function nextTask(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, 0);
	return promise;
}

test("OMP readiness is deferred and emitted once for an unchanged owner without editor inspection", async () => {
	const { host, events, context } = readiness();
	const ctx = context("first");
	host.startSession(ctx);
	expect(events).toEqual(["start:first"]);
	await nextTask();
	expect(events).toEqual(["start:first", "ready:first"]);
	host.startSession(ctx);
	await nextTask();
	expect(events).toEqual(["start:first", "ready:first"]);
});

test("OMP readiness follows the replacement owner rather than the pending old owner", async () => {
	const { host, events, context } = readiness();
	host.startSession(context("first"));
	host.switchSession(context("second"), "new");
	await nextTask();
	expect(events).toEqual(["start:first", "start:second", "ready:second"]);
});

test("OMP readiness is cancelled when the owner shuts down before the next task", async () => {
	const { host, events, context } = readiness();
	const ctx = context("first");
	host.startSession(ctx);
	host.shutdown(ctx);
	await nextTask();
	expect(events).toEqual(["start:first"]);
});

test("OMP readiness rejects a changed native session identity before the next task", async () => {
	const { host, events, context } = readiness();
	let sessionId = "first";
	const original = context(sessionId);
	const ctx = { ...original, sessionManager: { ...original.sessionManager, getSessionId: () => sessionId } };
	host.startSession(ctx);
	sessionId = "replacement";
	await nextTask();
	expect(events).toEqual(["start:first"]);
});

for (const [mode, hasUI] of [["rpc", true], ["tui", false]] as const) {
	test(`OMP readiness is absent for mode=${mode} hasUI=${hasUI}`, async () => {
		const { host, events, context } = readiness();
		host.startSession(context("first", mode, hasUI));
		await nextTask();
		expect(events).toEqual(["start:first"]);
	});
}
