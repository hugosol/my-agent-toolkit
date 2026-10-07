/**
 * The per-field State lifecycle at the public adapter seam (S2; P3, P4, P8, C3, N4).
 *
 * A definition declares three independent axes, and this suite drives the two that are
 * not the control kind: the persistence (`session-entry` by default, or `memory` for a
 * value whose live external effect must not be assumed from a restored one — the value
 * is never recorded and never seeded), and the inheritance (`none` by default, so a
 * subagent reads the field's declared default; `follow` opts the field into reading its
 * owner's current value). The same subagent facts therefore yield a contribution and a
 * marker line for codebase-tools, which declares `follow`, and neither for a definition
 * that declares nothing.
 *
 * The same-process multi-main limitation (N10) is a recorded conclusion, not an
 * assertion: it lives in `docs/agent-runtime-support.md` ("First-release limitation:
 * one main session per process") and in the framework backlog, and no test here claims
 * behaviour for a process holding two main sessions. What this suite does exercise is
 * the neighbouring case the contract does fix — a parent chain that leaves the process
 * (a background fork's spawner is gone, or the link is absent) resolving to no owner.
 *
 * The seam is `ompAdapter` plus the narrow native surface the OMP loader hands a
 * factory: one factory per extension per process, called once per session — the main
 * session and every subagent session it spawns — over one shared State store. The
 * agent-runtime side is a test double: it holds the native agent graph (the official
 * registry the adapter walks), delivers each session's lifecycle events, and drives
 * the run-initiation hook and a toggle command with the context the runner builds.
 *
 * What the framework decides is observable without reaching inside it: a run
 * initiation's committed contribution, the entries a command persists, the feedback it
 * publishes, the marker area it renders, and the diagnostic the adapter writes when no
 * owner resolves.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type {
	OmpAgentRef,
	OmpCommandContext,
	OmpExtensionApi,
	OmpRoundEventType,
	OmpRunInitiationResult,
	OmpSessionContext,
	OmpSessionEntry,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";
import { type ExtensionDefinition, defineExtension } from "../../framework/public";

/** The identities the migration fixes: the State record and one slot's custom type. */
const STATE_ENTRY_TYPE = "codebase-tools:state";
const INIT_IDENTITY = "codebase-tools:init";
const REMINDER_IDENTITY = "codebase-tools:reminder";
const COMMAND = "codebase-tools";

/**
 * A definition that declares no State axis at all: the field is the default `enabled`,
 * its persistence is the default `session-entry`, and its inheritance is the default
 * `none`, so no subagent reads its owner's value.
 */
const DEFAULT_SCOPE_TOOLS: ExtensionDefinition = defineExtension({
	id: "default-scope-tools",
	displayName: "defaultScopeTools",
	commands: [{ type: "toggle", name: "default-scope-tools", state: "enabled" }],
	prompts: [{ tag: "init", strategy: "first-enabled-run", content: "default-scope init" }],
	marker: { text: "◈ defaultScopeTools" },
});

/**
 * A definition whose declared field is kept in memory only: it is never recorded in the
 * owner's persistence medium and never seeded from a branch, so the value lives exactly
 * as long as the owner identity that holds it.
 */
const MEMORY_TOOLS: ExtensionDefinition = defineExtension({
	id: "memory-tools",
	displayName: "memoryTools",
	state: { persistence: "memory" },
	commands: [{ type: "toggle", name: "memory-tools", state: "enabled" }],
	marker: { text: "◈ memoryTools" },
});

/**
 * One session as the native runtime holds it: the agent identity the extension context
 * carries, the registry link that places it in the agent graph, and the branch it reads.
 */
interface SessionFacts {
	/** Agent registry id, e.g. `"Main"` or `"0-Explore"`. */
	readonly id: string;
	readonly kind: "main" | "sub";
	/** Registry id of the spawning agent; absent exactly for a top-level session. */
	readonly parentId?: string;
	/** The session identity this agent's session manager reports. */
	readonly sessionId: string;
	/** The State payloads persisted on this session's branch, oldest first. */
	readonly statePayloads?: readonly unknown[];
	/** The contribution identities persisted on this session's branch, oldest first. */
	readonly contributions?: readonly string[];
	/** Whether the native registry knows this agent (a revived session's parent may not). */
	readonly registered?: boolean;
}

/**
 * One session's binding, as re-calling the extension factory for that session produces.
 *
 * Every method may be given the facts of a different session: one binding observes the
 * boundaries the loader delivers it, so a session switch is one call on the binding that
 * served the session it moved away from.
 */
interface SessionBinding {
	/** `session_start`: the runtime loads this session and the bound extension reconciles. */
	start(facts?: SessionFacts): void;
	/** `session_switch`: the binding's current session identity is replaced. */
	switchSession(facts: SessionFacts, reason: "new" | "resume" | "fork"): void;
	/** `before_agent_start`: one run initiation; the contribution the hook committed. */
	run(facts?: SessionFacts): OmpRunInitiationResult | undefined;
	/** Runs the definition's toggle command in this session, as a user of that session would. */
	command(facts?: SessionFacts): void;
}

/** The native surface the loader hands the factory, shared by every session binding. */
interface NativeDouble {
	/** Binds one extension for one session: one factory call, as the loader does. */
	bind(definition: ExtensionDefinition, facts: SessionFacts): SessionBinding;
	/** Appended entries in call order, across every binding. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** Feedback messages in call order, across every binding. */
	readonly notifications: string[];
	/** Marker-area renderings in call order, across every binding. */
	readonly widgets: ReadonlyArray<readonly string[] | undefined>;
}

type SessionHandler = (event: OmpSessionEvent, ctx: OmpSessionContext) => void;
type RunInitiationHandler = (event: unknown, ctx: OmpSessionContext) => OmpRunInitiationResult | undefined | void;

/** The State record a session's branch carries after the toggle enabled the extension. */
const ENABLED: OmpSessionEntry = { type: "custom", customType: STATE_ENTRY_TYPE, data: { enabled: true } };

/** A persisted contribution the branch already carries, as the runtime recorded it. */
function contribution(identity: string): OmpSessionEntry {
	return { type: "custom_message", customType: identity, content: "…", display: false, attribution: "agent" };
}

function nativeDouble(): NativeDouble {
	const graph = new Map<string, SessionFacts>();
	// One factory per extension per process, as `ompAdapter` produces: bindings of one
	// definition share its State store, and different definitions never share one.
	const factories = new Map<string, frameworkOmp.OmpExtensionFactory>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	const notifications: string[] = [];
	const widgets: Array<readonly string[] | undefined> = [];

	const refOf = (id: string): OmpAgentRef | undefined => {
		const facts = graph.get(id);
		if (facts === undefined) return undefined;
		return {
			id: facts.id,
			kind: facts.kind,
			parentId: facts.parentId,
			session: { sessionManager: { getSessionId: () => facts.sessionId } },
		};
	};

	return {
		appended,
		notifications,
		widgets,
		bind(definition, facts) {
			if (facts.registered !== false) graph.set(facts.id, facts);
			const stateEntryType = `${definition.id}:state`;
			const commandName = (definition.commands ?? [])[0]?.name;

			const branchOf = (session: SessionFacts): OmpSessionEntry[] => [
				...(session.statePayloads ?? []).map(data => ({ type: "custom", customType: stateEntryType, data })),
				...(session.contributions ?? []).map(contribution),
			];

			const contextOf = (session: SessionFacts): OmpSessionContext => ({
				agent: { kind: session.kind, id: session.id, parentId: session.parentId },
				sessionManager: { getSessionId: () => session.sessionId, getBranch: () => branchOf(session) },
				hasUI: true,
				ui: {
					notify: message => {
						notifications.push(message);
					},
					setWidget: (_key, content) => {
						widgets.push(content);
					},
				},
			});

			const handlers: Record<OmpSessionEventType, SessionHandler[]> = {
				session_start: [],
				session_switch: [],
				session_branch: [],
				session_tree: [],
				session_shutdown: [],
			};
			let runHandler: RunInitiationHandler | undefined;
			const registrations = new Map<
				string,
				{ readonly handler: (args: string, ctx: OmpCommandContext) => void | Promise<void> }
			>();

			const api: OmpExtensionApi = {
				setLabel(): void {},
				registerCommand(name, registration): void {
					registrations.set(name, registration);
				},
				appendEntry(customType: string, data?: unknown): void {
					appended.push({ customType, data });
				},
				on(event: OmpSessionEventType | OmpRoundEventType | "before_agent_start", handler: never): void {
					if (event === "before_agent_start") runHandler = handler as RunInitiationHandler;
					// This double drives the session axis; the round axis has its own suite.
					else if (event !== "agent_start" && event !== "agent_end")
						handlers[event].push(handler as SessionHandler);
				},
				// The native escape hatch: the official agent registry the adapter walks.
				pi: { AgentRegistry: { global: () => ({ get: refOf }) } },
			};

			let factory = factories.get(definition.id);
			if (factory === undefined) {
				factory = frameworkOmp.ompAdapter(definition, { supportedVersions: ["18.5.0"] });
				factories.set(definition.id, factory);
			}
			if (!factory(api).bound) throw new Error(`the "${definition.id}" definition did not bind`);

			const deliver = (event: OmpSessionEvent, session: SessionFacts): void => {
				for (const handler of handlers[event.type]) handler(event, contextOf(session));
			};

			return {
				start(session: SessionFacts = facts): void {
					deliver({ type: "session_start" }, session);
				},
				switchSession(session: SessionFacts, reason: "new" | "resume" | "fork"): void {
					deliver({ type: "session_switch", reason }, session);
				},
				run(session: SessionFacts = facts): OmpRunInitiationResult | undefined {
					if (runHandler === undefined) throw new Error("binding subscribed no run-initiation hook");
					return runHandler({ type: "before_agent_start" }, contextOf(session)) ?? undefined;
				},
				command(session: SessionFacts = facts): void {
					const registration = commandName === undefined ? undefined : registrations.get(commandName);
					if (registration === undefined) throw new Error(`command "${commandName}" was not registered`);
					registration.handler("", contextOf(session));
				},
			};
		},
	};
}

/**
 * The main session every follower case hangs off: it owns the State, and its own branch
 * seeded `enabled` at the boundary that restored it. The child below is the subagent it
 * directly spawns; the grandchild is the child's own spawn.
 */
const MAIN: SessionFacts = {
	id: "Main",
	kind: "main",
	sessionId: "session-main",
	statePayloads: [{ enabled: true }],
};
const CHILD: SessionFacts = {
	id: "0-Task",
	kind: "sub",
	parentId: "Main",
	sessionId: "session-child",
};
const GRANDCHILD: SessionFacts = {
	id: "0-Task.1",
	kind: "sub",
	parentId: "0-Task",
	sessionId: "session-grandchild",
};

/** Runs the body while capturing the adapter's non-model channel (stderr). */
function withCapturedStderr<T>(body: () => T): { readonly diagnostics: string; readonly value: T } {
	const chunks: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = body();
		return { diagnostics: chunks.join(""), value };
	} finally {
		process.stderr.write = original;
	}
}

describe("per-field inheritance: a subagent reads the declared default unless the field declares follow (P4)", () => {
	test("a field that declares no follow contributes nothing and renders nothing in a subagent", () => {
		const double = nativeDouble();
		const ownerFacts: SessionFacts = {
			id: "ScopeOwner",
			kind: "main",
			sessionId: "scope-owner",
			statePayloads: [{ enabled: true }],
		};
		const subFacts: SessionFacts = {
			id: "ScopeOwner.1",
			kind: "sub",
			parentId: "ScopeOwner",
			sessionId: "scope-subagent",
		};
		const owner = double.bind(DEFAULT_SCOPE_TOOLS, ownerFacts);
		owner.start();
		const subagent = double.bind(DEFAULT_SCOPE_TOOLS, subFacts);
		subagent.start();

		// The owner is enabled by its own branch, so its own run contributes the slot and
		// re-asserts the area: the scenario does reach an active owner.
		const rendersBeforeRuns = double.widgets.length;
		expect(owner.run()?.message.customType).toBe("default-scope-tools:init");
		// The subagent reads the field's declared default instead of the owner's value, so
		// its run contributes nothing and renders no line of the owner's.
		expect(subagent.run()).toBeUndefined();
		// Only the owner's own run rendered: the subagent's session boundary and its run both
		// left the area to the sessions that are active in it.
		expect(double.widgets.slice(rendersBeforeRuns)).toEqual([["◈ defaultScopeTools"]]);
	});
});

describe("per-field inheritance: an explicit follow keeps the live read (P4, C3)", () => {
	test("each run reads the owner's current value, and the subagent's own branch decides the slot", () => {
		const double = nativeDouble();
		// The owner seeds `enabled` from its own branch at the main session's start.
		const main = double.bind(CODEBASE_TOOLS, MAIN);
		main.start();
		const child = double.bind(CODEBASE_TOOLS, CHILD);
		child.start();

		// The owner's own command records the opposite of the value it seeded `true` from:
		// the subagent's session boundary seeded nothing, so it holds no write face.
		main.command();
		expect(double.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);

		// The owner is now off, so the subagent's run is silent even though its own branch
		// carries no slot identity yet — the value is the owner's, not the branch's.
		expect(child.run()).toBeUndefined();

		// Turning the owner back on is followed live: the subagent's next run contributes
		// the slot its own branch calls for. No slot identity yet → init.
		main.command();
		expect(double.appended[1]).toEqual({ customType: STATE_ENTRY_TYPE, data: { enabled: true } });
		expect(child.run()?.message.customType).toBe(INIT_IDENTITY);
	});

	test("a subagent's run derives its slot from its own branch, not the owner's", () => {
		const double = nativeDouble();
		double.bind(CODEBASE_TOOLS, MAIN).start();
		// This subagent's branch already carries the init contribution.
		const child = double.bind(CODEBASE_TOOLS, { ...CHILD, sessionId: "session-initialised", contributions: [INIT_IDENTITY] });
		child.start();

		// Enabled and already initialised on its own branch → the repeating slot, not a
		// second init.
		expect(child.run()?.message.customType).toBe(REMINDER_IDENTITY);
	});

	test("a nested subagent walks up the parent chain to the same root owner", () => {
		const double = nativeDouble();
		double.bind(CODEBASE_TOOLS, MAIN).start();
		const child = double.bind(CODEBASE_TOOLS, CHILD);
		child.start();
		const grandchild = double.bind(CODEBASE_TOOLS, GRANDCHILD);
		grandchild.start();

		// Two hops up: the grandchild follows the same root owner, so it initialises its
		// own branch while that owner is enabled.
		expect(grandchild.run()?.message.customType).toBe(INIT_IDENTITY);
		// ...and the direct child, on the same owner, does the same on its own branch.
		expect(child.run()?.message.customType).toBe(INIT_IDENTITY);
	});
});

describe("a subagent has no write face (P3, C3)", () => {
	test("a command in a subagent writes nothing and announces nothing", () => {
		const double = nativeDouble();
		const main = double.bind(CODEBASE_TOOLS, MAIN);
		main.start();
		const child = double.bind(CODEBASE_TOOLS, CHILD);
		child.start();

		child.command();

		// No record, no feedback: the owner's intent is not the subagent's to change.
		expect(double.appended).toEqual([]);
		expect(double.notifications).toEqual([]);
		// The owner's value is untouched: its own next toggle flips from the seeded `true`.
		main.command();
		expect(double.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
		expect(double.notifications).toEqual(["codeBaseTools disabled"]);
	});
});

describe("per-field persistence: a memory field owns no value across a boundary (P3)", () => {
	test("a memory field is never seeded from its branch and is never recorded", () => {
		const double = nativeDouble();
		const main = double.bind(MEMORY_TOOLS, MAIN);
		main.start();

		// MAIN's branch carries `{enabled: true}`, and the toggle still starts from the
		// declared default: a memory field reads no branch record.
		main.command();
		expect(double.notifications).toEqual(["memoryTools enabled"]);
		// Nor does it write one: the session stays free of records for this field, so a
		// restored value can never claim the effect is running.
		expect(double.appended).toEqual([]);

		// A boundary that keeps the identity is not a reseed either: the value the cell
		// holds is the one the next toggle flips, however the branch reads.
		main.switchSession(MAIN, "resume");
		main.command();
		expect(double.notifications).toEqual(["memoryTools enabled", "memoryTools disabled"]);
		expect(double.appended).toEqual([]);
	});

	test("replacing the owner drops a memory field to the declared default", () => {
		const double = nativeDouble();
		const main = double.bind(MEMORY_TOOLS, MAIN);
		main.start();
		main.command();
		expect(double.notifications).toEqual(["memoryTools enabled"]);

		// The binding moves to another session identity. Its branch carries an enabling
		// record, which a memory field ignores: the next toggle starts from the default.
		// (Every value here reads `enabled`; a value carried over from the first owner, or
		// seeded from this branch, would make one of these notices `disabled`.)
		const other: SessionFacts = {
			id: "Other",
			kind: "main",
			sessionId: "memory-other-owner",
			statePayloads: [{ enabled: true }],
		};
		main.switchSession(other, "new");
		main.command(other);
		expect(double.notifications).toEqual(["memoryTools enabled", "memoryTools enabled"]);

		// The owner the boundary replaced reads the declared default again: it did not keep
		// the value it held either.
		main.command();
		expect(double.notifications).toEqual([
			"memoryTools enabled",
			"memoryTools enabled",
			"memoryTools enabled",
		]);
	});
});

describe("two extensions with different per-field policies coexist (P3, P4)", () => {
	test("each field keeps its own value, its own record and its own line", () => {
		const double = nativeDouble();
		const ownerFacts: SessionFacts = {
			id: "CombinationOwner",
			kind: "main",
			sessionId: "combination-owner",
			statePayloads: [{ enabled: true }],
		};
		const subFacts: SessionFacts = {
			id: "CombinationOwner.1",
			kind: "sub",
			parentId: "CombinationOwner",
			sessionId: "combination-subagent",
		};
		const persistedOwner = double.bind(CODEBASE_TOOLS, ownerFacts);
		const memoryOwner = double.bind(MEMORY_TOOLS, ownerFacts);
		persistedOwner.start();
		memoryOwner.start();
		const persistedSub = double.bind(CODEBASE_TOOLS, subFacts);
		const memorySub = double.bind(MEMORY_TOOLS, subFacts);
		persistedSub.start();
		memorySub.start();

		// Both fields are enabled in the owner's own session: codebase-tools from the value
		// its branch seeded, the memory field from its declared default. The memory field
		// records nothing at all, and the two lines share the area.
		memoryOwner.command();
		expect(double.appended).toEqual([]);
		expect(double.notifications).toEqual(["memoryTools enabled"]);
		expect(double.widgets[double.widgets.length - 1]).toEqual(["◈ codeBaseTools", "◈ memoryTools"]);

		// The followed field contributes on the subagent's branch and re-asserts the area...
		const rendersBeforeRuns = double.widgets.length;
		expect(persistedSub.run()?.message.customType).toBe(INIT_IDENTITY);
		// ...while the memory field, enabled in its owner, is still absent from the subagent:
		// its run contributes nothing and renders no line of its owner's.
		expect(memorySub.run()).toBeUndefined();
		expect(double.widgets.slice(rendersBeforeRuns)).toEqual([["◈ codeBaseTools", "◈ memoryTools"]]);

		// Turning codebase-tools off leaves the memory field's line standing: the two
		// policies share the area and their records without either deciding the other's value.
		persistedOwner.command();
		expect(double.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
		expect(double.notifications).toEqual(["memoryTools enabled", "codeBaseTools disabled"]);
		expect(double.widgets[double.widgets.length - 1]).toEqual(["◈ memoryTools"]);
	});
});

describe("an unresolvable owner degrades to off (P8, N4)", () => {
	test("a session whose parent link resolves to no main contributes nothing and cannot toggle", () => {
		const double = nativeDouble();
		double.bind(CODEBASE_TOOLS, MAIN).start();
		// A background fork whose spawning agent is not in the registry: the chain leaves
		// the process, so no owner resolves.
		const fork = double.bind(CODEBASE_TOOLS, {
			id: "Tan-1",
			kind: "sub",
			parentId: "gone",
			sessionId: "session-fork",
			contributions: [INIT_IDENTITY],
		});

		const { diagnostics, value } = withCapturedStderr(() => {
			fork.start();
			const contributionOfFirstRun = fork.run();
			// A second delivery must not repeat the diagnostic.
			const contributionOfSecondRun = fork.run();
			fork.command();
			return { contributionOfFirstRun, contributionOfSecondRun };
		});

		// Off, whatever the branch holds: an unresolved owner is never enabled.
		expect(value.contributionOfFirstRun).toBeUndefined();
		expect(value.contributionOfSecondRun).toBeUndefined();
		// Not toggleable: no record, no feedback.
		expect(double.appended).toEqual([]);
		expect(double.notifications).toEqual([]);
		// One best-effort line on the non-model channel, and only one.
		expect(diagnostics.split("\n").filter(line => line.trim().length > 0)).toHaveLength(1);
		expect(diagnostics).toContain("codebase-tools");
	});

	test("a background fork whose parent link is absent is off too", () => {
		const double = nativeDouble();
		double.bind(CODEBASE_TOOLS, MAIN).start();
		// A `/tan`-style clone: a subagent with no spawning-agent link at all.
		const clone = double.bind(CODEBASE_TOOLS, { id: "Tan-1", kind: "sub", sessionId: "session-clone" });

		const { diagnostics, value } = withCapturedStderr(() => {
			clone.start();
			return clone.run();
		});

		expect(value).toBeUndefined();
		expect(double.appended).toEqual([]);
		expect(diagnostics.split("\n").filter(line => line.trim().length > 0)).toHaveLength(1);
	});

	test("a subagent whose main ancestor is known is not reported as unresolved", () => {
		const double = nativeDouble();
		double.bind(CODEBASE_TOOLS, MAIN).start();
		const child = double.bind(CODEBASE_TOOLS, CHILD);

		const { diagnostics } = withCapturedStderr(() => {
			child.start();
			child.run();
		});

		expect(diagnostics).toBe("");
	});
});
