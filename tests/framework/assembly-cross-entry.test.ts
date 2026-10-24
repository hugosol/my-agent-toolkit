/** S1: public assemblies, with only the external harness registration/event/UI boundary doubled.
 * Ticket 09 owns cross-entry P10/P13/P14; path-specific coverage stays with its original owners.
 */
import { describe, expect, test, vi } from "bun:test";
import { piAdapter, type PiCommandRegistration, type PiExtensionApi, type PiExtensionContext } from "../../adapters/pi";
import { ompAdapter, type OmpExtensionApi } from "../../adapters/omp";
import { defineExtension, defineImplementation } from "../../framework/interface";
import { withCapturedStderrAsync } from "./support/captured-stderr";

interface NativeHost {
	readonly api: object;
	readonly notices: string[];
	readonly levels: Array<string | undefined>;
	readonly widgets: Array<readonly string[] | undefined>;
	readonly entries: Array<{ customType: string; data: unknown }>;
	emit(harness: string, event: string): Promise<void>;
	command(harness: string, name: string, args: string): Promise<void>;
}

function nativeHost(id: string): NativeHost {
	const handlers = new Map<string, Array<(event: unknown, context: unknown) => unknown>>();
	const commands = new Map<string, PiCommandRegistration>();
	const notices: string[] = [];
	const levels: Array<string | undefined> = [];
	const widgets: Array<readonly string[] | undefined> = [];
	const entries: Array<{ customType: string; data: unknown }> = [];
	const context: PiExtensionContext = {
		sessionManager: { getSessionId: () => id, getSessionName: () => "same display name", getBranch: () => [] },
		hasUI: true,
		ui: { notify: (message, level) => { notices.push(message); levels.push(level); }, setWidget: (_key, content) => { widgets.push(content as readonly string[] | undefined); } },
		isIdle: () => true,
		hasPendingMessages: () => false,
	};
	// OMP's own identity is an external fact, not derived from the Pi session context.
	const ompContext = { ...context, agent: { kind: "main", id: "Main" } };
	const api = {
		setLabel() {},
		registerCommand(name: string, registration: PiCommandRegistration) { commands.set(name, registration); },
		appendEntry(customType: string, data: unknown) { entries.push({ customType, data }); },
		on(event: string, handler: (event: unknown, context: unknown) => unknown) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => { const index = list.indexOf(handler); if (index >= 0) list.splice(index, 1); };
		},
	};
	return { api, notices, levels, widgets, entries,
		async emit(harness: string, event: string) {
			for (const handler of [...(handlers.get(event) ?? [])]) await handler({ type: event, reason: event === "session_shutdown" ? "quit" : "startup", messageType: "user" }, harness === "pi" ? context : ompContext);
		},
		async command(harness: string, name: string, args: string) {
			await commands.get(name)?.handler(args, harness === "pi" ? context : ompContext);
		},
	};
}

for (const harness of ["pi", "omp"] as const) {
	describe(`${harness} cross-entry assembly isolation (P10/P13/P14)`, () => {
		// Independent contract: release stops extension callbacks, directed commands and UI effects,
		// not every framework-local toggle. A leaked callback or global cleanup would change this trace.
		test("released binding stops event, directed-command and UI effects while another stays live", async () => {
			const trace: string[] = [];
			const bind = (id: string, host: NativeHost) => {
				const definition = defineExtension({ id, displayName: "same display name", commands: [{ type: "directed", name: id, state: "enabled" }], marker: { text: `marker ${id}` } });
				const implementation = defineImplementation({
					create: () => ({}),
					cleanup: () => { trace.push(`${id}:cleanup`); },
					subscriptions: [{ scope: "session", events: { session_start: (_state, delivery) => { trace.push(`${id}:event:${delivery.session.sessionId}`); delivery.feedback.notify("info", `event ${id}`); } } }],
					commands: { [id]: { run: (_state, directive, delivery) => { trace.push(`${id}:${directive.kind}`); delivery.state.write(directive.kind === "activate"); delivery.feedback.notify("info", `command ${id}`); } } },
				});
				return harness === "pi" ? piAdapter(definition, { implementation })(host.api as unknown as PiExtensionApi) : ompAdapter(definition, { implementation })(host.api as unknown as OmpExtensionApi);
			};
			const first = nativeHost(`${harness}-released`);
			const second = nativeHost(`${harness}-survivor`);
			expect(bind("cross-first", first).bound).toBe(true);
			expect(bind("cross-second", second).bound).toBe(true);
			await first.emit(harness, "session_start");
			await second.emit(harness, "session_start");
			await first.command(harness, "cross-first", "");
			await second.command(harness, "cross-second", "");
			await first.emit(harness, "before_agent_start");
			await second.emit(harness, "before_agent_start");
			expect(first.widgets[first.widgets.length - 1]).toEqual(["marker cross-first"]);
			expect(second.widgets[second.widgets.length - 1]).toEqual(["marker cross-second"]);
			expect(trace).toEqual([`cross-first:event:${harness}-released`, `cross-second:event:${harness}-survivor`, "cross-first:activate", "cross-second:activate"]);
			await first.emit(harness, "session_shutdown");
			const stopped = { notices: first.notices.length, widgets: first.widgets.length, entries: first.entries.length };
			await first.emit(harness, "session_start");
			await first.emit(harness, "before_agent_start");
			await first.command(harness, "cross-first", "off");
			await second.command(harness, "cross-second", "off");
			await second.emit(harness, "before_agent_start");
			expect({ notices: first.notices.length, widgets: first.widgets.length, entries: first.entries.length }).toEqual(stopped);
			expect(trace.slice(4)).toEqual(["cross-first:cleanup", "cross-second:deactivate"]);
			expect(second.notices).toEqual(["event cross-second", "command cross-second", "command cross-second"]);
			expect(second.entries).toEqual([{ customType: "cross-second:state", data: { enabled: true } }, { customType: "cross-second:state", data: { enabled: false } }]);
			expect(second.widgets[second.widgets.length - 1]).toBeUndefined();
			await second.emit(harness, "session_shutdown");
		});

		// Independent expectation: a loader refusal is a binding error, never an accepted instance.
		// A retained failed callback must not affect later event, command, State or UI consumption.
		test("a partially registered refusal cannot contaminate a fresh successful binding", async () => {
			const trace: string[] = [];
			let instance = 0;
			const definition = defineExtension({ id: "cross-rebind", displayName: "rebind", commands: [{ type: "directed", name: "cross-rebind", state: "enabled" }], marker: { text: "fresh binding" } });
			const implementation = defineImplementation({
				create: () => ({ instance: ++instance }),
				cleanup: state => { trace.push(`${state.instance}:cleanup`); },
				subscriptions: [{ scope: "session", events: { session_start: (state, delivery) => { trace.push(`${state.instance}:start:${delivery.session.sessionId}`); delivery.feedback.notify("info", `instance ${state.instance}`); } } }],
				commands: { "cross-rebind": { run: (state, directive, delivery) => { trace.push(`${state.instance}:${directive.kind}`); delivery.state.write(directive.kind === "activate"); } } },
			});
			const piFactory = harness === "pi" ? piAdapter(definition, { implementation }) : undefined;
			const ompFactory = harness === "omp" ? ompAdapter(definition, { implementation }) : undefined;
			const bind = (api: object) => piFactory ? piFactory(api as PiExtensionApi) : ompFactory!(api as OmpExtensionApi);
			const refused = nativeHost(`${harness}-refused`);
			const refusal = bind({ ...refused.api, registerCommand() { throw new Error("command registration refused"); } });
			expect(refusal.bound).toBe(false);
			if (refusal.bound) throw new Error("refusing harness accepted binding");
			expect(refusal.failures).toEqual([{ kind: "initialization", detail: "registration failed: command registration refused" }]);
			await refused.emit(harness, "session_start");
			await refused.emit(harness, "before_agent_start");
			const accepted = nativeHost(`${harness}-accepted`);
			expect(bind(accepted.api).bound).toBe(true);
			await accepted.emit(harness, "session_start");
			await accepted.command(harness, "cross-rebind", "");
			await accepted.emit(harness, "before_agent_start");
			expect(accepted.notices).toEqual(["instance 2"]);
			expect(accepted.entries).toEqual([{ customType: "cross-rebind:state", data: { enabled: true } }]);
			expect(accepted.widgets[accepted.widgets.length - 1]).toEqual(["fresh binding"]);
			await accepted.emit(harness, "session_shutdown");
			expect(trace).toEqual(["1:cleanup", `2:start:${harness}-accepted`, "2:activate", "2:cleanup"]);
			expect(refused.notices).toEqual([]);
		});

		// Named actions await completion and report rejected effects once as feedback, then
		// conclude normally. Directed commands are synchronous; no new waiting rule is added.
		test("awaits a cancelled action and reports it once without delaying an independent binding", async () => {
			const trace: string[] = [];
			const entered = Promise.withResolvers<void>();
			const outcome = Promise.withResolvers<void>();
			const cancellation = new DOMException("cross-entry cancelled", "AbortError");
			const bind = (id: string, host: NativeHost, blocked: boolean) => {
				const definition = defineExtension({ id, displayName: id, commands: [{ type: "actions", name: id, actions: { report: "run effect" } }] });
				const implementation = defineImplementation({ create: () => ({}), commands: { [id]: { report: async (_state, delivery) => {
					trace.push(`${id}:entered`);
					if (blocked) { entered.resolve(); await outcome.promise; }
					delivery.feedback.notify("info", `${id}:committed`);
					trace.push(`${id}:committed`);
				} } } });
				return harness === "pi" ? piAdapter(definition, { implementation })(host.api as PiExtensionApi) : ompAdapter(definition, { implementation })(host.api as OmpExtensionApi);
			};
			const first = nativeHost(`${harness}-cancelled`);
			const second = nativeHost(`${harness}-independent`);
			expect(bind("cross-cancel", first, true).bound).toBe(true);
			expect(bind("cross-continue", second, false).bound).toBe(true);
			await first.emit(harness, "session_start");
			await second.emit(harness, "session_start");
			let settled = false;
			const pending = first.command(harness, "cross-cancel", "report").then(() => { settled = true; trace.push("cancelled:reported"); });
			await entered.promise;
			expect(settled).toBe(false);
			await second.command(harness, "cross-continue", "report");
			expect(trace).toEqual(["cross-cancel:entered", "cross-continue:entered", "cross-continue:committed"]);
			expect(settled).toBe(false);
			outcome.reject(cancellation);
			expect(await pending).toBeUndefined();
			expect(trace).toEqual(["cross-cancel:entered", "cross-continue:entered", "cross-continue:committed", "cancelled:reported"]);
			expect(first.entries).toEqual([]);
			expect(first.notices).toEqual(["/cross-cancel report failed: cross-entry cancelled"]);
			expect(first.levels).toEqual(["error"]);
			expect(second.entries).toEqual([]);
			expect(second.notices).toEqual(["cross-continue:committed"]);
			await first.emit(harness, "session_shutdown");
			await second.emit(harness, "session_shutdown");
		});
	});
}

// Pi alone supplies the awaited disposal position. Its existing default is one 15s
// close-out budget, not a per-handler retry budget; OMP gets no invented timeout.
test("Pi close-out spends its existing 15000ms once while an independent binding stays usable", async () => {
	vi.useFakeTimers();
	const completed = Promise.withResolvers<void>();
	try {
		const trace: string[] = [];
		const entered = Promise.withResolvers<void>();
		const first = nativeHost("pi-closeout-blocked");
		const second = nativeHost("pi-closeout-live");
		const definition = defineExtension({ id: "cross-closeout", displayName: "closeout", commands: [{ type: "actions", name: "cross-closeout", actions: { report: "report" } }] });
		const implementation = defineImplementation({
			create: () => ({}),
			cleanup: () => { trace.push("cleanup"); },
			subscriptions: [{ scope: "session", events: {
				round_end: async (_state, delivery) => { trace.push(`${delivery.event.kind}:${delivery.session.sessionId}`); entered.resolve(); await completed.promise; },
				session_end: (_state, delivery) => { trace.push(`session_end:${delivery.session.sessionId}`); },
			} }],
			commands: { "cross-closeout": { report: (_state, delivery) => { delivery.feedback.notify("info", "live action"); } } },
		});
		expect(piAdapter(definition, { implementation })(first.api as PiExtensionApi).bound).toBe(true);
		expect(piAdapter(definition, { implementation })(second.api as PiExtensionApi).bound).toBe(true);
		await first.emit("pi", "session_start");
		await second.emit("pi", "session_start");
		await first.emit("pi", "agent_start");
		let answered = false;
		const shutdown = withCapturedStderrAsync(() => first.emit("pi", "session_shutdown")).then(captured => { answered = true; return captured; });
		await entered.promise;
		await second.command("pi", "cross-closeout", "report");
		expect(second.notices).toEqual(["live action"]);
		expect(trace).toEqual(["round_end:pi-closeout-blocked"]);
		vi.advanceTimersByTime(14999);
		await Promise.resolve();
		expect(answered).toBe(false);
		expect(trace).toEqual(["round_end:pi-closeout-blocked"]);
		vi.advanceTimersByTime(1);
		const captured = await shutdown;
		expect(trace).toEqual(["round_end:pi-closeout-blocked", "session_end:pi-closeout-blocked", "cleanup"]);
		expect(captured.stderr).toContain('close-out of session "pi-closeout-blocked" was not answered within its 15000ms budget');
		expect(captured.stderr).toContain("whatever work that edge still owed is unconfirmed");
		expect(first.notices).toEqual([]);
		completed.resolve();
		await Promise.resolve();
		await second.command("pi", "cross-closeout", "report");
		expect(second.notices).toEqual(["live action", "live action"]);
		await second.emit("pi", "session_shutdown");
	} finally {
		completed.resolve();
		vi.useRealTimers();
	}
});
