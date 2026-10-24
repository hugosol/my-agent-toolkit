/**
 * S1: the public Pi assembly, observed only at the native host boundary.
 * P7/P10/P13/P14. Expected widget identity, placement, severity and State projection are
 * fixed by the existing consumption contract, not recomputed from the adapter mapping.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { piAdapter, type PiCommandRegistration, type PiExtensionApi, type PiExtensionContext, type PiSessionEntry, type PiSessionHeader } from "../../adapters/pi";
import { defineExtension, defineImplementation, type ExtensionDefinition } from "../../framework/interface";
import type { FeedbackLevel } from "../../framework/interface/feedback";

function host() {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const retained = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const commands = new Map<string, PiCommandRegistration>();
	const widgets: Array<{ key: string; lines: readonly string[] | undefined; placement: string | undefined }> = [];
	const notices: Array<{ message: string; level: FeedbackLevel | undefined }> = [];
	const entries: Array<{ customType: string; data: unknown }> = [];
	const api = {
		on(event: string, handler: (event: unknown, ctx: PiExtensionContext) => unknown) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			retained.set(event, [...list]);
			return () => { const index = list.indexOf(handler); if (index >= 0) list.splice(index, 1); };
		},
		registerCommand(name: string, command: PiCommandRegistration) { commands.set(name, command); },
		appendEntry(customType: string, data: unknown) { entries.push({ customType, data }); },
	} as unknown as PiExtensionApi;
	const context = (id: string, options: { hasUI?: boolean; branch?: readonly PiSessionEntry[]; header?: PiSessionHeader } = {}): PiExtensionContext => ({
		sessionManager: { getSessionId: () => id, getSessionName: () => "same misleading name/main/child", getBranch: () => options.branch ?? [], getHeader: () => options.header ?? null },
		hasUI: options.hasUI ?? true,
		ui: {
			notify(message, level) { notices.push({ message, level }); },
			setWidget(key, content, settings) { widgets.push({ key, lines: content as readonly string[] | undefined, placement: settings?.placement }); },
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
	});
	const emit = async (event: string, payload: unknown, ctx: PiExtensionContext, late = false) => {
		const results: unknown[] = [];
		for (const handler of [...((late ? retained : handlers).get(event) ?? [])]) results.push(await handler(payload, ctx));
		return results;
	};
	return { api, widgets, notices, entries, context, emit,
		start: (ctx: PiExtensionContext, late = false) => emit("session_start", { type: "session_start", reason: "startup" }, ctx, late),
		run: (ctx: PiExtensionContext, late = false) => emit("before_agent_start", { type: "before_agent_start", messageType: "user" }, ctx, late),
		command: (name: string, ctx: PiExtensionContext) => commands.get(name)!.handler("", ctx),
	};
}

function definition(id: string, text: string, follow = false): ExtensionDefinition {
	return defineExtension({ id, displayName: "same display name", state: { inheritance: follow ? "follow" : "none" }, commands: [{ type: "toggle", name: id, state: "enabled" }], marker: { text } });
}
const enabled = (id: string): PiSessionEntry => ({ type: "custom", customType: `${id}:state`, data: { enabled: true } });
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function captureStderr(run: () => Promise<void>): Promise<string> {
	const original = process.stderr.write;
	const chunks: string[] = [];
	process.stderr.write = ((chunk: string | Uint8Array) => { chunks.push(String(chunk)); return true; }) as typeof process.stderr.write;
	return run().then(() => chunks.join("")).finally(() => { process.stderr.write = original; });
}

describe("Pi delivery-position Marker area (P7/P10)", () => {
	// Violation: last binding wins, a display name selects State, or a second area is created.
	// Two extensions, reverse registration order and identical display names distinguish each.
	test("shares one ordered area, reads actual session State, and clears when disabled", async () => {
		const native = host();
		const a = definition("pi-ui-order-a", "◈ alpha");
		const z = definition("pi-ui-order-z", "◈ zeta");
		expect(piAdapter(z)(native.api).bound).toBe(true);
		expect(piAdapter(a)(native.api).bound).toBe(true);
		const on = native.context("pi-ui-order-owner", { branch: [enabled(a.id), enabled(z.id)] });
		await native.start(on);
		expect(native.widgets[native.widgets.length - 1]).toEqual({ key: "semantic-extensions", placement: "aboveEditor", lines: ["◈ alpha", "◈ zeta"] });
		expect(native.entries).toEqual([]);
		expect((await native.run(on)).filter(Boolean)).toEqual([]);
		const off = native.context("pi-ui-order-other");
		await native.start(off);
		expect(native.widgets[native.widgets.length - 1]?.lines).toBeUndefined();
		await native.start(on);
		expect(native.widgets[native.widgets.length - 1]?.lines).toEqual(["◈ alpha", "◈ zeta"]);
		await native.command(a.id, on);
		expect(native.widgets[native.widgets.length - 1]?.lines).toEqual(["◈ zeta"]);
		await native.command(z.id, on);
		expect(native.widgets[native.widgets.length - 1]).toEqual({ key: "semantic-extensions", placement: "aboveEditor", lines: undefined });
	});

	// Violation: a second binding replaces the first registration or shares its State cell.
	test("keeps same-extension bindings' distinct actual-session projections isolated", async () => {
		const first = host();
		const second = host();
		const def = definition("pi-ui-binding-isolation", "◈ isolated binding");
		expect(piAdapter(def)(first.api).bound).toBe(true);
		expect(piAdapter(def)(second.api).bound).toBe(true);
		const on = first.context("pi-ui-binding-on", { branch: [enabled(def.id)] });
		const off = second.context("pi-ui-binding-off");
		await first.start(on);
		await second.start(off);
		expect(second.widgets[second.widgets.length - 1]?.lines).toBeUndefined();
		await first.run(on);
		expect(first.widgets[first.widgets.length - 1]?.lines).toEqual(["◈ isolated binding"]);
		await second.command(def.id, off);
		await first.command(def.id, on);
		expect(first.widgets[first.widgets.length - 1]?.lines).toBeUndefined();
		await second.run(off);
		expect(second.widgets[second.widgets.length - 1]?.lines).toEqual(["◈ isolated binding"]);
		expect(first.notices).toEqual([{ message: "same display name disabled", level: "info" }]);
		expect(second.notices).toEqual([{ message: "same display name enabled", level: "info" }]);
	});

	// Violation: Pi invents a Viewed-session seat or copies all Owner fields into a child.
	// A real native parent-file fact, not a name, supplies identity; only one field follows.
	test("projects the delivery's child seat with following State and declared defaults", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "pi-ui-lineage-"));
		roots.push(root);
		const parentFile = path.join(root, "unrelated-file-name.jsonl");
		writeFileSync(parentFile, '{"type":"session","id":"pi-ui-lineage-owner"}\n');
		const native = host();
		const follow = definition("pi-ui-lineage-a", "◈ follows", true);
		const own = definition("pi-ui-lineage-z", "◈ owner only");
		expect(piAdapter(follow)(native.api).bound).toBe(true);
		expect(piAdapter(own)(native.api).bound).toBe(true);
		const owner = native.context("pi-ui-lineage-owner", { branch: [enabled(follow.id), enabled(own.id)] });
		await native.start(owner);
		expect(native.widgets[native.widgets.length - 1]?.lines).toEqual(["◈ follows", "◈ owner only"]);
		const child = native.context("pi-ui-lineage-child", { header: { type: "session", id: "pi-ui-lineage-child", parentSession: parentFile } });
		await native.start(child);
		// A child start owns no State transition; its enabled run is the publication boundary.
		await native.run(child);
		expect(native.widgets[native.widgets.length - 1]?.lines).toEqual(["◈ follows"]);
		await native.run(owner);
		expect(native.widgets[native.widgets.length - 1]?.lines).toEqual(["◈ follows", "◈ owner only"]);
		await native.run(child);
		expect(native.widgets[native.widgets.length - 1]?.lines).toEqual(["◈ follows"]);
		expect(native.entries).toEqual([]);
	});
});

test("never invents Owner identity from a display name when the native id is absent (P7)", async () => {
	const native = host();
	const def = definition("pi-ui-no-identity", "◈ must stay absent");
	expect(piAdapter(def)(native.api).bound).toBe(true);
	const ctx = native.context("", { branch: [enabled(def.id)] });
	const stderr = await captureStderr(async () => { await native.start(ctx); await native.run(ctx); });
	expect(stderr).toContain("this session reports no identity; the extension stays off for it");
	expect(native.widgets).toEqual([]);
	expect(native.entries).toEqual([]);
	expect(native.notices).toEqual([]);
});

describe("Pi feedback channels and resource lifetime (P7/P10/P13/P14)", () => {
	// Violation: severity is collapsed, UI absence draws a widget, or notices enter history/context.
	test.each([true, false])("preserves every severity and isolates model context with hasUI=%s", async hasUI => {
		const native = host();
		const def = definition(`pi-ui-feedback-${hasUI}`, "◈ feedback");
		const implementation = defineImplementation({ create: () => ({}), subscriptions: [{ scope: "session", events: { session_start: (_state, delivery) => {
			for (const level of ["info", "warning", "error"] as const) delivery.feedback.notify(level, `notice ${level}`);
		} } }] });
		expect(piAdapter(def, { implementation })(native.api).bound).toBe(true);
		const ctx = native.context(`pi-ui-feedback-${hasUI}`, { hasUI, branch: [enabled(def.id)] });
		const stderr = await captureStderr(async () => { await native.start(ctx); });
		expect(native.notices).toEqual(hasUI ? [{ message: "notice info", level: "info" }, { message: "notice warning", level: "warning" }, { message: "notice error", level: "error" }] : []);
		expect(stderr).toBe(hasUI ? "" : "notice info\nnotice warning\nnotice error\n");
		expect(native.widgets).toEqual(hasUI ? [{ key: "semantic-extensions", placement: "aboveEditor", lines: ["◈ feedback"] }] : []);
		expect(native.entries).toEqual([]);
		expect((await native.run(ctx)).filter(Boolean)).toEqual([]);
	});

	// Violation: a throwing native output is swallowed or replaced by another channel.
	test("propagates the native widget and notification failures unchanged", async () => {
		const native = host();
		const def = definition("pi-ui-errors", "◈ errors");
		expect(piAdapter(def)(native.api).bound).toBe(true);
		const ctx = native.context("pi-ui-errors", { branch: [enabled(def.id)] });
		const widgetError = new Error("native widget rejected");
		ctx.ui.setWidget = () => { throw widgetError; };
		await expect(native.start(ctx)).rejects.toBe(widgetError);
		const feedbackError = new Error("native notification rejected");
		ctx.ui.setWidget = () => {};
		ctx.ui.notify = () => { throw feedbackError; };
		await expect(native.command(def.id, ctx)).rejects.toBe(feedbackError);
		expect(native.notices).toEqual([]);
	});

	// Violation: released subscriptions still publish, or one binding removes another's area entry.
	// Captured native callbacks model already-queued delivery after unsubscription, not private APIs.
	test("stops released and late UI deliveries while another binding keeps rendering", async () => {
		const first = host();
		const second = host();
		const def = definition("pi-ui-lifetime", "◈ live binding");
		const implementation = defineImplementation({ create: () => ({}), subscriptions: [{ scope: "session", events: { session_start: (_state, delivery) => delivery.feedback.notify("info", `started ${delivery.session.sessionId}`) } }] });
		// Each loader evaluation constructs its own assembly and implementation lifetime.
		expect(piAdapter(def, { implementation })(first.api).bound).toBe(true);
		expect(piAdapter(def, { implementation })(second.api).bound).toBe(true);
		const a = first.context("pi-ui-released", { branch: [enabled(def.id)] });
		const b = second.context("pi-ui-still-live", { branch: [enabled(def.id)] });
		await first.start(a);
		await second.start(b);
		await first.emit("session_shutdown", { type: "session_shutdown", reason: "quit" }, a);
		const before = { widgets: first.widgets.length, notices: first.notices.length, entries: first.entries.length };
		await first.start(first.context("pi-ui-after-release"));
		await first.run(a);
		await first.start(first.context("pi-ui-late-delivery"), true);
		await first.run(a, true);
		expect({ widgets: first.widgets.length, notices: first.notices.length, entries: first.entries.length }).toEqual(before);
		await second.run(b);
		expect(second.widgets[second.widgets.length - 1]?.lines).toEqual(["◈ live binding"]);
		await second.command(def.id, b);
		expect(second.widgets[second.widgets.length - 1]?.lines).toBeUndefined();
		expect(second.notices).toEqual([{ message: "started pi-ui-still-live", level: "info" }, { message: "same display name disabled", level: "info" }]);
	});
});
