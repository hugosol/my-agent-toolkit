import { describe, expect, test } from "bun:test";
import { registerPiTool } from "../../adapters/pi/native/core/extensions/tools";
import type { PiExtensionApi, PiExtensionContext } from "../../adapters/pi/native/core/extensions/types";
import { registerOmpTool } from "../../adapters/omp/native/extensibility/extensions/tools";
import type { OmpExtensionApi, OmpSessionContext } from "../../adapters/omp/native/extensibility/extensions/types";
import type { ToolExecutionDelivery } from "../../framework/interface/tool";

const request = { title: "Submit report?", message: "Task: child-17\nComplete report:\nFirst line\nLast line", timeoutMs: 30 };
type NativeConfirm = (title: string, message: string, options?: { signal?: AbortSignal; timeout?: number; onTimeout?: () => void }) => Promise<boolean>;

// The seam is the host-registered tool: only the external host/UI is controlled.
for (const host of ["pi", "omp"] as const) {
	describe(`${host} registered tool user confirmation`, () => {
		function registered(confirm?: NativeConfirm, hasUI = true, lifetimeSignal?: AbortSignal) {
			let invoke!: (signal?: AbortSignal) => Promise<unknown>;
			const ctx = {
				sessionManager: { getSessionId: () => "confirm-session" }, hasUI,
				ui: { notify() {}, setWidget() {}, ...(confirm === undefined ? {} : { confirm }) },
			} as unknown as PiExtensionContext & OmpSessionContext;
			let approval: boolean | undefined;
			const tool = {
				name: "confirmation_probe", label: "Confirm", description: "Confirm native user approval",
				parameters: { type: "object" as const, properties: {} },
				async execute(_params: unknown, delivery: ToolExecutionDelivery) {
					approval = await delivery.confirm?.({ ...request, ...(lifetimeSignal === undefined ? {} : { signal: lifetimeSignal }) });
					return { content: [{ type: "text" as const, text: String(approval) }] };
				},
			};
			if (host === "pi") {
				const api: PiExtensionApi = {
					on() { return () => {}; }, registerCommand() {}, appendEntry() {},
					registerTool(native) { invoke = signal => native.execute("confirm-call", {}, signal, undefined, ctx); },
				};
				registerPiTool(api)(tool);
			} else {
				const api: OmpExtensionApi = {
					on() {}, registerCommand() {}, appendEntry() {}, setLabel() {},
					registerTool(native) { invoke = signal => native.execute("confirm-call", {}, signal, undefined, ctx); },
				};
				registerOmpTool(api)(tool);
			}
			return { invoke, approval: () => approval };
		}

		test("only literal native approval accepts, with the complete message and configured timeout", async () => {
			let nativeSignal: AbortSignal | undefined;
			const probe = registered(async (title, message, options) => {
				expect(title).toBe("Submit report?");
				expect(message).toBe("Task: child-17\nComplete report:\nFirst line\nLast line");
				expect(options?.timeout).toBe(30);
				nativeSignal = options?.signal;
				return true;
			});
			await probe.invoke();
			expect(probe.approval()).toBe(true);
			expect(nativeSignal).toBeInstanceOf(AbortSignal);
		});

		test("no UI, unavailable confirmation, dismissal, throws, rejection and nonboolean answers fail closed", async () => {
			let openedWithoutUI = false;
			for (const probe of [
				registered(async () => { openedWithoutUI = true; return true; }, false),
				registered(), registered(async () => false),
				registered(() => { throw new Error("UI failed"); }),
				registered(async () => { throw new Error("UI rejected"); }),
				registered(async () => "yes" as unknown as boolean),
			]) {
				await probe.invoke();
				expect(probe.approval()).toBe(false);
			}
			expect(openedWithoutUI).toBe(false);
		});

		test("tool cancellation dismisses a pending dialog and cannot be replaced by late approval", async () => {
			const answer = Promise.withResolvers<boolean>();
			const opened = Promise.withResolvers<AbortSignal>();
			const probe = registered((_title, _message, options) => { opened.resolve(options!.signal!); return answer.promise; });
			const controller = new AbortController();
			const running = probe.invoke(controller.signal);
			const dialogSignal = await opened.promise;
			controller.abort();
			await running;
			expect(probe.approval()).toBe(false);
			expect(dialogSignal.aborted).toBe(true);
			answer.resolve(true);
			await Promise.resolve();
			expect(probe.approval()).toBe(false);
		});

		test("business lifetime cancellation also closes the dialog while the tool signal stays active", async () => {
			const answer = Promise.withResolvers<boolean>();
			const opened = Promise.withResolvers<AbortSignal>();
			const lifetime = new AbortController();
			const tool = new AbortController();
			const probe = registered((_title, _message, options) => { opened.resolve(options!.signal!); return answer.promise; }, true, lifetime.signal);
			const running = probe.invoke(tool.signal);
			const dialogSignal = await opened.promise;
			lifetime.abort();
			await running;
			expect(tool.signal.aborted).toBe(false);
			expect(dialogSignal.aborted).toBe(true);
			expect(probe.approval()).toBe(false);
			answer.resolve(true);
		});

		test("approval after the deadline is refused even before a delayed timeout callback runs", async () => {
			const probe = registered(async () => {
				const start = performance.now();
				while (performance.now() - start < 40) { /* Simulate a blocked host event loop. */ }
				return true;
			});
			await probe.invoke();
			expect(probe.approval()).toBe(false);
		});

		test("an already cancelled call does not open a dialog", async () => {
			let opened = false;
			const probe = registered(async () => { opened = true; return true; });
			const controller = new AbortController();
			controller.abort();
			await probe.invoke(controller.signal);
			expect(opened).toBe(false);
			expect(probe.approval()).toBe(false);
		});

		test("native timeout cannot turn an automatic Yes selection into user approval", async () => {
			const probe = registered(async (_title, _message, options) => {
				options?.onTimeout?.();
				return true;
			});
			await probe.invoke();
			expect(probe.approval()).toBe(false);
		});

		test("the configured deadline refuses an unresponsive host and late approval", async () => {
			const answer = Promise.withResolvers<boolean>();
			let dialogSignal: AbortSignal | undefined;
			const probe = registered((_title, _message, options) => { dialogSignal = options?.signal; return answer.promise; });
			await probe.invoke();
			expect(probe.approval()).toBe(false);
			expect(dialogSignal?.aborted).toBe(true);
			answer.resolve(true);
			await Promise.resolve();
			expect(probe.approval()).toBe(false);
		});
	});
}
