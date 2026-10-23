/** S1: public Pi assembly; native fixtures are external host facts, never port mocks. */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { defineExtension, defineImplementation, type ImplementationContext } from "../../framework/interface";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import { piAdapter, type PiCommandRegistration, type PiExtensionApi, type PiExtensionContext, type PiRunInitiationResult, type PiSessionEntry } from "../../adapters/pi";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import { INIT_PROMPT, REMINDER_PROMPT } from "../../extensions/codebase-tools/shared-logic/prompts";
import { boundPiSurface } from "./support/pi-surface-double";

function host() {
	const commands = new Map<string, PiCommandRegistration>();
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const entries: Array<{ customType: string; data: unknown }> = [];
	const notices: string[] = [];
	const api = {
		on(event: string, handler: (event: unknown, ctx: PiExtensionContext) => unknown) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => { const index = list.indexOf(handler); if (index >= 0) list.splice(index, 1); };
		},
		registerCommand(name: string, command: PiCommandRegistration) { commands.set(name, command); },
		appendEntry(customType: string, data: unknown) { entries.push({ customType, data }); },
	} as unknown as PiExtensionApi;
	const context = (id: string, branch: readonly PiSessionEntry[] = []): PiExtensionContext => ({
		sessionManager: { getSessionId: () => id, getSessionName: () => undefined, getBranch: () => branch },
		hasUI: true,
		ui: { notify: message => { notices.push(message); }, setWidget: () => {} },
		isIdle: () => true,
		hasPendingMessages: () => false,
	});
	const emit = async (event: string, payload: unknown, ctx: PiExtensionContext) => {
		const results: unknown[] = [];
		for (const handler of [...(handlers.get(event) ?? [])]) results.push(await handler(payload, ctx));
		return results;
	};
	return { api, entries, notices, context, emit,
		command: (ctx: PiExtensionContext, args = "") => commands.get("codebase-tools")!.handler(args, ctx),
		registered: () => [...commands.keys()],
		run: async (ctx: PiExtensionContext) => (await emit("before_agent_start", { type: "before_agent_start", messageType: "user" }, ctx)).find(value => value !== undefined) as PiRunInitiationResult | undefined,
		start: (ctx: PiExtensionContext, reason = "resume") => emit("session_start", { type: "session_start", reason }, ctx),
	};
}

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function document(text: string): string {
	const root = mkdtempSync(path.join(tmpdir(), "pi-native-config-"));
	roots.push(root);
	const file = path.join(root, "config.yaml");
	writeFileSync(file, text);
	return file;
}

describe("Pi native configuration compatibility (P9)", () => {
	// CFG-STARTUP-VALID/INVALID/YAML: only the loaded block matters, invalid text never
	// becomes a default. A permissive parse would register commands in the refused cases.
	test.each([
		["valid", "codebase-tools:\n  enabled: true\nconnect-bot:\n  enabled: invalid\n", true],
		["nonboolean", "codebase-tools:\n  enabled: \"true\"\nconnect-bot:\n  enabled: true\n", false],
		["malformed", "codebase-tools:\n  enabled: [\n", false],
	] as const)("startup policy %s retains its existing binding result", async (_name, yaml, admitted) => {
		const native = host();
		const result = piAdapter(CODEBASE_TOOLS, { startupPolicy: document(yaml) })(native.api);
		expect(result.bound).toBe(admitted);
		if (admitted) {
			const ctx = native.context(`pi-native-policy-${_name}`);
			await native.start(ctx, "startup");
			expect((await native.run(ctx))?.message.customType).toBe("codebase-tools:init");
			expect(native.entries).toEqual([{ customType: "codebase-tools:state", data: { enabled: true } }]);
		} else {
			expect(native.registered()).toEqual([]);
			expect(native.entries).toEqual([]);
			if (!result.bound) expect(result.failures.map(failure => failure.kind)).toEqual(["configuration"]);
		}
	});
	// Baseline CFG-BOT-VALID/INVALID: exactly 1000 reaches the factory; zero refuses before
	// registration, not a fallback budget. The real Pi assembly performs the config read.
	test("uses declared business values and refuses an illegal budget before registration", () => {
		const valid = host();
		let received: Readonly<Record<string, unknown>> | undefined;
		const file = document("endpoint: http://127.0.0.1:18787\nrequestTimeoutMs: 1000\n");
		const definition = defineExtension({ id: "pi-native-config-valid", displayName: "config", config: { ...CONNECT_BOT.config!, path: file } });
		expect(piAdapter(definition, { implementation: defineImplementation({ create: context => { received = context.config; return {}; } }) })(valid.api).bound).toBe(true);
		expect(received).toEqual({ endpoint: "http://127.0.0.1:18787", requestTimeoutMs: 1000 });
		let created = false;
		const invalid = host();
		const invalidDefinition = defineExtension({ id: "pi-native-config-invalid", displayName: "invalid config", commands: [{ type: "toggle", name: "codebase-tools", state: "enabled" }], config: { ...CONNECT_BOT.config!, path: document("endpoint: http://127.0.0.1:18787\nrequestTimeoutMs: 0\n") } });
		const retryable = piAdapter(invalidDefinition, { implementation: defineImplementation({ create: () => { created = true; return {}; } }) });
		const result = retryable(invalid.api);
		expect(result.bound).toBe(false);
		if (!result.bound) expect(result.failures.map(failure => failure.kind)).toEqual(["configuration"]);
		expect(created).toBe(false);
		expect(invalid.registered()).toEqual([]);
		expect(invalid.entries).toEqual([]);
		writeFileSync(invalidDefinition.config!.path!, "endpoint: http://127.0.0.1:18787\nrequestTimeoutMs: 1000\n");
		const recovered = host();
		expect(retryable(recovered.api).bound).toBe(true);
		expect(created).toBe(true);
		expect(recovered.registered()).toEqual(["codebase-tools"]);
	});
});

describe("Pi native model facts (P9/P13)", () => {
	// No catch/retry belongs to registry access. Both host failures and cancellation must be the
	// very rejection the consumer observes, not missing access or another credential.
	test("propagates registry rejection and cancellation without retrying", async () => {
		const native = host();
		let implementation: ImplementationContext | undefined;
		const definition = defineExtension({ id: "pi-native-access-errors", displayName: "access errors" });
		expect(piAdapter(definition, { implementation: defineImplementation({ create: context => { implementation = context; return {}; } }) })(native.api).bound).toBe(true);
		let calls = 0;
		let failure: Error | undefined = new Error("credential refresh rejected");
		const ctx: PiExtensionContext = { ...native.context("pi-native-access-errors"), modelRegistry: {
			getAll: () => [{ id: "m", provider: "selected", baseUrl: "https://model.example/v1" }],
			getProvider: () => undefined,
			getApiKeyForProvider: async () => { calls += 1; if (failure !== undefined) throw failure; return "renewed"; },
		} };
		await native.start(ctx, "startup");
		const access = implementation?.providerAccess;
		expect(access).toBeDefined();
		await expect(access!.resolve("selected")).rejects.toBe(failure);
		expect(calls).toBe(1);
		failure = new DOMException("credential refresh cancelled", "AbortError");
		await expect(access!.resolve("selected")).rejects.toBe(failure);
		expect(calls).toBe(2);
		failure = undefined;
		expect(await access!.resolve("selected")).toEqual({ baseUrl: "https://model.example/v1", credential: "renewed" });
		expect(calls).toBe(3);
	});

	// Provider entry beats a model URL; a refreshed credential is read per operation. A stale
	// snapshot or provider/model-name-only lookup would return the wrong independent literals.
	test("reads exact catalog prices and current provider access without borrowing another provider", async () => {
		const surface = boundPiSurface();
		const session = {
			sessionId: "pi-native-models", idle: true, pending: false,
			catalog: [
				{ id: "same", provider: "other", cost: { input: 99 } },
				{ id: "same", provider: "selected", baseUrl: "https://model.example/v1", cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 4 } },
				{ id: "zero", provider: "selected", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
			],
			credentials: { selected: "before" },
			providerBaseUrls: { selected: "https://provider.example/v1" },
		};
		surface.sessionStarts(session, "startup");
		const context = surface.implemented();
		expect(context.modelPrices?.priceOf("selected", "same")).toEqual({ currency: "USD", unit: "USD/百万 token", amounts: { input: 1, cacheRead: 0, cacheWrite: 4, output: 2 } });
		expect(context.modelPrices?.priceOf("selected", "missing")).toBeUndefined();
		expect(context.modelPrices?.priceOf("selected", "zero")).toBeUndefined();
		expect(await context.providerAccess?.resolve("selected")).toEqual({ baseUrl: "https://provider.example/v1", credential: "before" });
		session.credentials.selected = "after";
		expect(await context.providerAccess?.resolve("selected")).toEqual({ baseUrl: "https://provider.example/v1", credential: "after" });
		expect(await context.providerAccess?.resolve("missing")).toBeUndefined();
	});
});

function historicalBranch(file: string): readonly PiSessionEntry[] {
	const url = new URL(`../../.scratch/pi-adapter-source-aligned-refactor/implementation/01-baseline-artifacts/${file}`, import.meta.url);
	return readFileSync(url, "utf8").trim().split(/\r?\n/).map(line => {
		const value: unknown = JSON.parse(line);
		if (typeof value !== "object" || value === null || !("type" in value) || typeof value.type !== "string") throw new Error("invalid historical entry");
		return { type: value.type,
			...("customType" in value && typeof value.customType === "string" ? { customType: value.customType } : {}),
			...("data" in value ? { data: value.data } : {}),
		};
	});
}

describe("Pi native consumer compatibility (P6/P8)", () => {
	// One native branch can carry several extensions' entries: neither restoration nor later
	// writes may take another extension's activation just because it shares the host.
	test("extensions sharing a native branch keep separate activation and prompt identities", async () => {
		const native = host();
		const other = defineExtension({ id: "pi-native-other", displayName: "other", prompts: [{ tag: "init", strategy: "first-enabled-run", content: "other extension prompt" }] });
		expect(piAdapter(CODEBASE_TOOLS)(native.api).bound).toBe(true);
		expect(piAdapter(other)(native.api).bound).toBe(true);
		const ctx = native.context("pi-native-shared", [
			{ type: "custom", customType: "codebase-tools:state", data: { enabled: false } },
			{ type: "custom", customType: "pi-native-other:state", data: { enabled: true } },
		]);
		await native.start(ctx);
		const requests = await native.emit("before_agent_start", { type: "before_agent_start", messageType: "user" }, ctx);
		expect(requests.filter(value => value !== undefined)).toEqual([{ message: { customType: "pi-native-other:init", content: "other extension prompt", display: false } }]);
		await native.command(ctx);
		expect(native.entries).toEqual([{ customType: "codebase-tools:state", data: { enabled: true } }]);
		expect((await native.emit("before_agent_start", { type: "before_agent_start", messageType: "user" }, ctx)).filter(value => value !== undefined)).toEqual([
			{ message: { customType: "codebase-tools:init", content: INIT_PROMPT, display: false } },
			{ message: { customType: "pi-native-other:init", content: "other extension prompt", display: false } },
		]);
	});

	// STATE-PI-RESTART and STATE-PI-SWITCH from 01: frozen bytes from Pi1.4.0 before
	// this refactor. A new-write/new-read round trip cannot establish this compatibility.
	test("historical restart and selected switch branches keep activation and init progress", async () => {
		const native = host();
		expect(piAdapter(CODEBASE_TOOLS)(native.api).bound).toBe(true);
		const restored = native.context("pi-native-history-restart", historicalBranch("pi-state-before.jsonl"));
		await native.start(restored);
		expect((await native.run(restored))?.message.customType).toBe("codebase-tools:reminder");
		await native.command(restored);
		expect(native.entries).toEqual([{ customType: "codebase-tools:state", data: { enabled: false } }]);
		expect(native.notices).toEqual(["codeBaseTools disabled"]);
		const other = native.context("pi-native-history-other", historicalBranch("pi-switch-other.jsonl"));
		await native.start(other, "new");
		expect(await native.run(other)).toBeUndefined();
		const target = native.context("pi-native-history-target", historicalBranch("pi-switch-target.jsonl"));
		await native.start(target, "resume");
		expect((await native.run(target))?.message.customType).toBe("codebase-tools:reminder");
		await native.command(target);
		expect(native.entries).toEqual([
			{ customType: "codebase-tools:state", data: { enabled: false } },
			{ customType: "codebase-tools:state", data: { enabled: false } },
		]);
	});
	// Directed extension code is different from the framework's retained toggle: failures keep
	// their identity and cleanup stops retained commands before they can write or notify.
	test("directed command failures propagate and cleanup stops later external effects", async () => {
		const native = host();
		const effects: string[] = [];
		let failure: Error | undefined;
		const definition = defineExtension({ id: "pi-native-directed", displayName: "directed", commands: [{ type: "directed", name: "codebase-tools", state: "enabled" }] });
		const implementation = defineImplementation({
			create: () => ({}),
			initialize: () => {},
			cleanup: () => { effects.push("cleanup"); },
			commands: { "codebase-tools": {
				run: (_state, directive, delivery) => {
					if (failure !== undefined) throw failure;
					effects.push(directive.kind);
					delivery.state.write(directive.kind === "activate");
				},
				unrecognized: (_state: unknown, argument: string) => { effects.push(`unrecognized:${argument}`); },
			} },
		});
		expect(piAdapter(definition, { implementation })(native.api).bound).toBe(true);
		const ctx = native.context("pi-native-directed");
		await native.start(ctx, "startup");
		await native.command(ctx);
		await native.command(ctx, "invalid");
		expect(effects).toEqual(["activate", "unrecognized:invalid"]);
		expect(native.entries).toEqual([{ customType: "pi-native-directed:state", data: { enabled: true } }]);
		failure = new Error("command rejected");
		await expect(native.command(ctx)).rejects.toBe(failure);
		failure = new DOMException("command cancelled", "AbortError");
		await expect(native.command(ctx)).rejects.toBe(failure);
		failure = undefined;
		await native.emit("session_shutdown", { type: "session_shutdown", reason: "quit" }, ctx);
		await native.command(ctx);
		expect(effects).toEqual(["activate", "unrecognized:invalid", "cleanup"]);
		expect(native.entries).toEqual([{ customType: "pi-native-directed:state", data: { enabled: true } }]);
	});

	// Framework binding intentionally retains its own local toggle after disposal, but stops
	// prompt callbacks and extension code. An independently assembled binding stays usable.
	test("shutdown stops prompt callbacks, preserves local toggles, and leaves another binding usable", async () => {
		const first = host();
		const second = host();
		expect(piAdapter(CODEBASE_TOOLS)(first.api).bound).toBe(true);
		expect(piAdapter(CODEBASE_TOOLS)(second.api).bound).toBe(true);
		const a = first.context("pi-native-disposed");
		const b = second.context("pi-native-live");
		await first.start(a, "startup");
		await second.start(b, "startup");
		await first.command(a);
		expect((await first.run(a))?.message).toEqual({ customType: "codebase-tools:init", content: INIT_PROMPT, display: false });
		await first.emit("session_shutdown", { type: "session_shutdown", reason: "quit" }, a);
		await first.command(a);
		expect(await first.run(a)).toBeUndefined();
		expect(first.entries).toEqual([
			{ customType: "codebase-tools:state", data: { enabled: true } },
			{ customType: "codebase-tools:state", data: { enabled: true } },
		]);
		expect(first.notices).toEqual(["codeBaseTools enabled", "codeBaseTools enabled"]);
		await second.command(b);
		expect(second.entries).toEqual([{ customType: "codebase-tools:state", data: { enabled: true } }]);
		expect((await second.run(b))?.message.customType).toBe("codebase-tools:init");
	});

	// Independent expectation: the historical enabled record restores true; an existing init
	// selects the reminder. A wrong entry name/filter/order would instead select off or init.
	test("restores recorded activation and init progress, then appends the next toggle", async () => {
		const native = host();
		expect(piAdapter(CODEBASE_TOOLS)(native.api).bound).toBe(true);
		const branch = [
			{ type: "custom", customType: "codebase-tools:state", data: { enabled: false } },
			{ type: "custom", customType: "other:state", data: { enabled: false } },
			{ type: "custom", customType: "codebase-tools:state", data: { enabled: true } },
			{ type: "custom_message", customType: "codebase-tools:init" },
		];
		const ctx = native.context("pi-native-restored", branch);
		await native.start(ctx);
		expect(await native.run(ctx)).toEqual({ message: { customType: "codebase-tools:reminder", content: REMINDER_PROMPT, display: false } });
		expect(native.entries).toEqual([]);
		await native.command(ctx);
		expect(native.entries).toEqual([{ customType: "codebase-tools:state", data: { enabled: false } }]);
		expect(native.notices).toEqual(["codeBaseTools disabled"]);
		expect(await native.run(ctx)).toBeUndefined();
	});
});
