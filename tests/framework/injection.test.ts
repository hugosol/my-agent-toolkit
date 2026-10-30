/**
 * The framework's injected-prompt contribution at the public adapter seam (S2; P18,
 * P19, P21, P22, C7, C8).
 *
 * The decision under test is `planContribution`: which slot, if any, one agent-run
 * initiation contributes, from the owner's current State and the current branch alone.
 * The harness side of the seam is the narrow native surface the loader hands the
 * factory, so a test double stands in for the loader: it records the run-initiation hook
 * binding subscribed, delivers run initiations with the session context the runner would
 * build (identity plus the branch the behavior reads), and reports the native payload
 * the hook committed.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import { INIT_PROMPT, REMINDER_PROMPT } from "../../extensions/codebase-tools/shared-logic/prompts";
import type {
	OmpCommandContext,
	OmpExtensionApi,
	OmpRoundEventType,
	OmpRunInitiationHandler,
	OmpRunInitiationResult,
	OmpSessionContext,
	OmpSessionEntry,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import { type ExtensionDefinition, defineExtension } from "../../framework/interface";
import { REPO_ROOT } from "../harness-dock/baseline";

/** The identities the migration fixes: one State entry and both slots' custom types. */
const STATE_ENTRY_TYPE = "codebase-tools:state";
const INIT_IDENTITY = "codebase-tools:init";
const REMINDER_IDENTITY = "codebase-tools:reminder";
const COMMAND = "codebase-tools";

type SessionHandler = (event: OmpSessionEvent, ctx: OmpSessionContext) => void;

/** One run initiation as the runner delivers it: a session identity and its branch. */
interface RunFacts {
	readonly sessionId: string;
	/** The current branch, oldest first, as the session manager holds it. */
	readonly branch: readonly OmpSessionEntry[];
}

/** The native surface a loader hands the factory, recording the run-initiation hook. */
interface NativeDouble {
	readonly api: OmpExtensionApi;
	/** Appended entries in call order: a contribution must never produce one. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** Delivers the native startup with an existing selected branch. */
	start(facts: RunFacts): void;
	/** Delivers the native terminal disposal while the harness retains its callbacks. */
	shutdown(facts: RunFacts): void;
	/** Runs one bound toggle command for a session, as an alternating user would. */
	toggle(sessionId: string, command?: string): void;
	/** Delivers one run initiation, as the runner does; returns what the hook committed. */
	deliverRun(facts: RunFacts): OmpRunInitiationResult | undefined;
}

/** The State record a session's branch carries after the toggle enabled the extension. */
function enabledState(): OmpSessionEntry {
	return { type: "custom", customType: STATE_ENTRY_TYPE, data: { enabled: true } };
}

/** A persisted contribution the branch already carries, as the harness recorded it. */
function persistedContribution(customType: string): OmpSessionEntry {
	return { type: "custom_message", customType, content: INIT_PROMPT, display: false, attribution: "agent" };
}

/** One slot's Markdown resource, read from its own file as the loader's text import does. */
function resourceText(name: "init" | "reminder"): string {
	return readFileSync(path.join(REPO_ROOT, "extensions", "codebase-tools", "shared-logic", "prompts", `${name}.md`), "utf8");
}

/** Records the run hook and the effects; the loader context the double builds matches the runner. */
function nativeDouble(): NativeDouble {
	const registrations = new Map<
		string,
		{ readonly handler: (args: string, ctx: OmpCommandContext) => void | Promise<void> }
	>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	let hook: OmpRunInitiationHandler | undefined;
	const starts: SessionHandler[] = [];
	const shutdowns: SessionHandler[] = [];

	const sessionFacts = (sessionId: string, branch: readonly OmpSessionEntry[]): OmpSessionContext => ({
		// The registry label is deliberately the same for every main session: the owner key
		// must come from the session identity, not from this label.
		agent: { kind: "main", id: "Main" },
		sessionManager: { getSessionId: () => sessionId, getBranch: () => branch },
		// Contribution planning is what this suite observes; the marker area and feedback
		// are exercised by their own suites, so the UI surface records nothing.
		hasUI: true,
		ui: { notify: () => {}, setWidget: () => {} },
	});

	const api: OmpExtensionApi = {
	registerTool() {},
	// The suite drives State through the command, not through labels.
		setLabel(): void {},
		registerCommand(name, registration): void {
			registrations.set(name, registration);
		},
		appendEntry(customType: string, data?: unknown): void {
			appended.push({ customType, data });
		},
		on(event: string, handler: never): void {
			// This suite is about the run initiation; session reconciliation and the round axis
			// have their own suites.
			if (event === "before_agent_start") {
				hook = handler as OmpRunInitiationHandler;
			}
			if (event === "session_start") starts.push(handler as SessionHandler);
			if (event === "session_shutdown") shutdowns.push(handler as SessionHandler);
		},
}

	return {
		api,
		appended,
		start(facts) {
			for (const handler of starts) handler({ type: "session_start" }, sessionFacts(facts.sessionId, facts.branch));
		},
		shutdown(facts) {
			for (const handler of shutdowns) handler({ type: "session_shutdown" }, sessionFacts(facts.sessionId, facts.branch));
		},
		toggle(sessionId, command = COMMAND) {
			const registration = registrations.get(command);
			if (registration === undefined) throw new Error(`command "${command}" was not registered`);
			registration.handler("", sessionFacts(sessionId, []));
		},
		deliverRun(facts) {
			if (hook === undefined) throw new Error("binding subscribed no run-initiation hook");
			const committed = hook({ type: "before_agent_start" }, sessionFacts(facts.sessionId, facts.branch));
			// These definitions declare no initialization, so the framework's run hook settles
			// synchronously: a promise here would mean the double is driving an extension that does,
			// and the suite would rather fail than read a pending value as a contribution.
			if (committed instanceof Promise) throw new Error("the run hook waited for an initialization");
			return committed ?? undefined;
		},
	};
}

/** Binds any definition to the double through the public adapter. */
function bindDefinition(double: NativeDouble, definition: ExtensionDefinition): void {
	const factory = frameworkOmp.ompAdapter(definition);
	if (!factory(double.api).bound) throw new Error("the definition did not bind");
}

/** Binds the codebase-tools definition to the double through the public adapter. */
function bindCodebaseTools(double: NativeDouble): void {
	bindDefinition(double, CODEBASE_TOOLS);
}

/** An enabled session whose branch carries only the toggle's State record. */
function enabledRun(sessionId: string, extra: readonly OmpSessionEntry[] = []): RunFacts {
	return { sessionId, branch: [enabledState(), ...extra] };
}

// Source: ticket01's OMP 18.5.0 journal captured at 89bd2d72 before any runtime refactor.
// A lost State read would suppress the reminder and make the next toggle append true.
// S1 is the public ompAdapter assembly; the native manager supplies the frozen selected branch.
test("historical OMP State restores enabled, retains init and records the next toggle as disabled (P6, P8)", () => {
	const branch = readFileSync(path.join(REPO_ROOT, "tests/codebase-tools/fixtures/omp-state-before-source-refactor.jsonl"), "utf8")
		.trim().split("\n").map(line => JSON.parse(line) as OmpSessionEntry);
	const double = nativeDouble();
	bindCodebaseTools(double);
	double.start({ sessionId: "historical-owner", branch });
	expect(double.deliverRun({ sessionId: "historical-owner", branch })).toEqual({
		message: { customType: "codebase-tools:reminder", content: REMINDER_PROMPT, display: false, attribution: "agent" },
	});
	expect(double.appended).toEqual([]);
	double.toggle("historical-owner");
	expect(double.appended).toEqual([{ customType: "codebase-tools:state", data: { enabled: false } }]);
	expect(double.deliverRun({ sessionId: "historical-owner", branch })).toBeUndefined();
});

// S1: invoke the real native registrations after disposal rather than observing cleanup alone.
// Framework-local toggles intentionally remain callable (binding.ts); an injected prompt must not.
// Re-enabling through that retained toggle distinguishes a lifetime gate from merely being off.
test("native prompt callbacks retained after disposal stop contributions without stopping another extension (P10, P14)", () => {
	const first = nativeDouble();
	const second = nativeDouble();
	bindCodebaseTools(first);
	bindDefinition(second, defineExtension({ ...CODEBASE_TOOLS, id: "other-prompts" }));
	const facts = { sessionId: "shared-session", branch: [] };
	first.start(facts);
	second.start(facts);
	first.toggle(facts.sessionId);
	second.toggle(facts.sessionId);
	expect(first.deliverRun(facts)?.message?.customType).toBe("codebase-tools:init");
	expect(second.deliverRun(facts)?.message?.customType).toBe("other-prompts:init");
	expect(first.appended).toEqual([{ customType: "codebase-tools:state", data: { enabled: true } }]);
	first.shutdown(facts);
	first.toggle(facts.sessionId);
	expect(first.appended).toEqual([
		{ customType: "codebase-tools:state", data: { enabled: true } },
		{ customType: "codebase-tools:state", data: { enabled: true } },
	]);
	expect(first.deliverRun(facts)).toBeUndefined();
	expect(second.deliverRun(facts)?.message?.customType).toBe("other-prompts:init");
	second.toggle(facts.sessionId);
	expect(second.deliverRun(facts)).toBeUndefined();
	expect(second.appended).toEqual([
		{ customType: "other-prompts:state", data: { enabled: true } },
		{ customType: "other-prompts:state", data: { enabled: false } },
	]);
});
describe("first enabled run contributes init (P18, P19, C7)", () => {
	test("an enabled run whose branch has no slot identity contributes one hidden, agent-attributed init", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);
		double.toggle("session-1");

		const result = double.deliverRun(enabledRun("session-1"));

		// One contribution, with the slot's fixed identity and the framework-owned
		// visibility, position (append) and attribution — none of them a declaration.
		expect(result?.message).toEqual({
			customType: INIT_IDENTITY,
			content: INIT_PROMPT,
			display: false,
			attribution: "agent",
		});
	});

	test("a run whose branch already carries the slot identity never contributes a second init", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);
		double.toggle("session-1");

		// The branch fact alone decides progress: no stored flag can disagree with it, so the
		// one-shot slot stays spent and the run hands over to the repeating slot (P18).
		const result = double.deliverRun(enabledRun("session-1", [persistedContribution(INIT_IDENTITY)]));

		expect(result?.message.customType).not.toBe(INIT_IDENTITY);
		expect(result?.message.customType).toBe(REMINDER_IDENTITY);
	});

	test("a disabled owner contributes nothing, whatever its branch carries", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);

		expect(double.deliverRun({ sessionId: "session-1", branch: [] })).toBeUndefined();
		expect(double.deliverRun(enabledRun("session-1", [persistedContribution(INIT_IDENTITY)]))).toBeUndefined();
	});

	test("a re-entered delivery plans the same contribution and writes no State", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);
		double.toggle("session-1");
		const facts = enabledRun("session-1");
		// Enabling persisted the toggle's State record; the run hook must add nothing.
		const afterEnable = double.appended.length;

		// A source-base retry can call the whole chain again for one submission; the branch
		// fact is unchanged, so the second attempt plans the same message.
		const first = double.deliverRun(facts);
		const second = double.deliverRun(facts);

		expect(second).toEqual(first);
		expect(first?.message.customType).toBe(INIT_IDENTITY);
		// The hook persisted nothing: progress lives on the branch, never in an entry.
		expect(double.appended.length).toBe(afterEnable);
	});
});

describe("prompt resources load independently (P37, C11, B10)", () => {
	test("each slot's text is its own resource file, loaded unmodified", () => {
		const [initSlot, reminderSlot] = CODEBASE_TOOLS.prompts ?? [];

		// Two separate text imports: each slot's declaration carries the bytes of its own
		// Markdown resource, so loading one cannot substitute or rewrite the other.
		expect(initSlot?.tag).toBe("init");
		expect(initSlot?.content).toBe(resourceText("init"));
		expect(reminderSlot?.tag).toBe("reminder");
		expect(reminderSlot?.content).toBe(resourceText("reminder"));
		expect(resourceText("init").length).toBeGreaterThan(0);
	});

	test("the run's contribution carries the init slot's resource text", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);
		double.toggle("session-1");

		const contribution = double.deliverRun(enabledRun("session-1"))?.message;

		expect(contribution?.content).toBe(resourceText("init"));
	});
});

describe("the repeating slot contributes on every enabled run (P18, P20, C7)", () => {
	test("an enabled run whose branch already carries the init contributes the reminder slot", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);
		double.toggle("session-1");

		// The branch fact that suppresses the init is the same fact that selects the
		// repeating slot: init progress never disturbs the reminder.
		const result = double.deliverRun(enabledRun("session-1", [persistedContribution(INIT_IDENTITY)]));

		expect(result?.message).toEqual({
			customType: REMINDER_IDENTITY,
			content: REMINDER_PROMPT,
			display: false,
			attribution: "agent",
		});
	});

	test("consecutive enabled runs each contribute the reminder, and no delivery writes an entry", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);
		double.toggle("session-1");
		const facts = enabledRun("session-1", [persistedContribution(INIT_IDENTITY)]);
		const afterToggle = double.appended.length;

		const first = double.deliverRun(facts);
		const second = double.deliverRun(facts);

		// A repeating slot is not spent by an earlier run: every delivery hands back the one
		// contribution its facts call for, and the hook itself records no progress. A
		// re-entered delivery of one run looks the same to this decision — the harness
		// commits only the attempt that wins, so the run still ends with one reminder.
		expect(first?.message.customType).toBe(REMINDER_IDENTITY);
		expect(second).toEqual(first);
		expect(double.appended.length).toBe(afterToggle);
	});

	test("a pending one-shot slot is chosen over a repeating slot declared ahead of it", () => {
		const double = nativeDouble();
		bindDefinition(
			double,
			defineExtension({
				id: "slot-order",
				displayName: "slot-order",
				commands: [{ type: "toggle", name: COMMAND, state: "enabled" }],
				prompts: [
					{ tag: "reminder", strategy: "every-enabled-run", content: "repeating text" },
					{ tag: "init", strategy: "first-enabled-run", content: "one-shot text" },
				],
			}),
		);
		double.toggle("session-1");

		// Selection is by rule, not by declaration position: the slot that must contribute
		// before anything repeats is not starved by a repeating slot written ahead of it.
		const pendingInit = double.deliverRun({ sessionId: "session-1", branch: [] });
		// Once the branch carries it, the same declaration contributes its repeating slot.
		const afterInit = double.deliverRun({
			sessionId: "session-1",
			branch: [persistedContribution("slot-order:init")],
		});

		expect(pendingInit?.message.customType).toBe("slot-order:init");
		expect(pendingInit?.message.content).toBe("one-shot text");
		expect(afterInit?.message.customType).toBe("slot-order:reminder");
	});

	test("one run never carries two contributions: the first declared repeating slot is the one", () => {
		const double = nativeDouble();
		bindDefinition(
			double,
			defineExtension({
				id: "two-repeating",
				displayName: "two-repeating",
				commands: [{ type: "toggle", name: COMMAND, state: "enabled" }],
				prompts: [
					{ tag: "first", strategy: "every-enabled-run", content: "first text" },
					{ tag: "second", strategy: "every-enabled-run", content: "second text" },
				],
			}),
		);
		double.toggle("session-1");

		const result = double.deliverRun({ sessionId: "session-1", branch: [] });

		// One run initiation answers with one contribution or none: several satisfied slots
		// resolve to the first declared one, never to a concatenation of both.
		expect(result?.message.customType).toBe("two-repeating:first");
	});
});

describe("off, re-entry and branch rewinds keep the contribution honest (P20, B7, B11)", () => {
	test("an off run contributes nothing, and re-enabling resumes with the reminder", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);
		const branchCarryingInit = enabledRun("session-1", [persistedContribution(INIT_IDENTITY)]);

		double.toggle("session-1");
		expect(double.deliverRun(enabledRun("session-1"))?.message.customType).toBe(INIT_IDENTITY);
		double.toggle("session-1");
		// Off is silent and clears nothing: the committed init stays a fact of the branch.
		expect(double.deliverRun(branchCarryingInit)).toBeUndefined();
		double.toggle("session-1");
		// Back on, the branch no longer lacks the init, so the run carries the reminder
		// instead of starting over.
		expect(double.deliverRun(branchCarryingInit)?.message.customType).toBe(REMINDER_IDENTITY);
		// Only the toggles wrote entries: no delivery advanced any progress.
		expect(double.appended.map(entry => entry.data)).toEqual([
			{ enabled: true },
			{ enabled: false },
			{ enabled: true },
		]);
	});

	test("an attempt cancelled before commit leaves the same plan, and a rewound branch returns to init", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);
		double.toggle("session-1");
		const noInit = enabledRun("session-1");
		const withInit = enabledRun("session-1", [persistedContribution(INIT_IDENTITY)]);

		// A preparation cancelled before its commit leaves the branch untouched, so the
		// retry plans the same init from the same two facts.
		const cancelled = double.deliverRun(noInit);
		expect(cancelled?.message.customType).toBe(INIT_IDENTITY);
		expect(double.deliverRun(noInit)).toEqual(cancelled);

		// Once the init is committed the plan moves on; a tree navigation back past that
		// message puts the branch where it was, and the plan returns to init.
		expect(double.deliverRun(withInit)?.message.customType).toBe(REMINDER_IDENTITY);
		expect(double.deliverRun(noInit)?.message.customType).toBe(INIT_IDENTITY);
		expect(double.deliverRun(withInit)?.message.customType).toBe(REMINDER_IDENTITY);
	});

	test("two bindings of one extension decide from State and branch, not from which delivered first", () => {
		const factory = frameworkOmp.ompAdapter(CODEBASE_TOOLS);
		const first = nativeDouble();
		const second = nativeDouble();
		expect(factory(first.api).bound).toBe(true);
		expect(factory(second.api).bound).toBe(true);
		// The second binding serves this session and delivers first; whichever binding the
		// host reaches first, the decision comes from the owner's State and the branch.
		second.toggle("session-1");
		const noInit = enabledRun("session-1");
		const withInit = enabledRun("session-1", [persistedContribution(INIT_IDENTITY)]);

		expect(second.deliverRun(noInit)?.message.customType).toBe(INIT_IDENTITY);
		expect(first.deliverRun(noInit)?.message.customType).toBe(INIT_IDENTITY);
		expect(first.deliverRun(withInit)?.message.customType).toBe(REMINDER_IDENTITY);
		expect(second.deliverRun(withInit)?.message.customType).toBe(REMINDER_IDENTITY);
	});
});
