/**
 * Owner resolution and the read-only follower, at the public adapter seam (S2; P3, P4,
 * P8, C3, N4).
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
 * the run-initiation hook and the toggle command with the context the runner builds.
 *
 * What the framework decides is observable without reaching inside it: a run
 * initiation's committed contribution, the entries a command persists, the feedback it
 * publishes, and the diagnostic the adapter writes when no owner resolves.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type {
	OmpAgentRef,
	OmpCommandContext,
	OmpExtensionApi,
	OmpRunInitiationResult,
	OmpSessionContext,
	OmpSessionEntry,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";

/** The identities the migration fixes: the State record and one slot's custom type. */
const STATE_ENTRY_TYPE = "codebase-tools:state";
const INIT_IDENTITY = "codebase-tools:init";
const REMINDER_IDENTITY = "codebase-tools:reminder";
const COMMAND = "codebase-tools";

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

/** One session's binding, as re-calling the extension factory for that session produces. */
interface SessionBinding {
	/** `session_start`: the runtime loads this session and the bound extension reconciles. */
	start(): void;
	/** `before_agent_start`: one run initiation; the contribution the hook committed. */
	run(): OmpRunInitiationResult | undefined;
	/** Runs the toggle command in this session, as a user of that session would. */
	command(): void;
}

/** The native surface the loader hands the factory, shared by every session binding. */
interface NativeDouble {
	/** Binds the extension for one session: one factory call, as the loader does. */
	bind(facts: SessionFacts): SessionBinding;
	/** Appended entries in call order, across every binding. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** Feedback messages in call order, across every binding. */
	readonly notifications: string[];
}

type SessionHandler = (event: OmpSessionEvent, ctx: OmpSessionContext) => void;
type RunInitiationHandler = (event: unknown, ctx: OmpSessionContext) => OmpRunInitiationResult | undefined | void;
type AnyHandler = SessionHandler | RunInitiationHandler;

/** The State record a session's branch carries after the toggle enabled the extension. */
const ENABLED: OmpSessionEntry = { type: "custom", customType: STATE_ENTRY_TYPE, data: { enabled: true } };

/** A persisted contribution the branch already carries, as the runtime recorded it. */
function contribution(identity: string): OmpSessionEntry {
	return { type: "custom_message", customType: identity, content: "…", display: false, attribution: "agent" };
}

function branchOf(facts: SessionFacts): OmpSessionEntry[] {
	return [
		...(facts.statePayloads ?? []).map(data => ({ type: "custom", customType: STATE_ENTRY_TYPE, data })),
		...(facts.contributions ?? []).map(contribution),
	];
}

function nativeDouble(): NativeDouble {
	const graph = new Map<string, SessionFacts>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	const notifications: string[] = [];
	// The factory is created once per extension per process, as `ompAdapter` does, and
	// every session binding is one call of it over the same store.
	const factory = frameworkOmp.ompAdapter(CODEBASE_TOOLS, { supportedVersions: ["18.5.0"] });

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
		bind(facts) {
			if (facts.registered !== false) graph.set(facts.id, facts);
			const handlers: Record<OmpSessionEventType, SessionHandler[]> = {
				session_start: [],
				session_switch: [],
				session_branch: [],
				session_tree: [],
			};
			let runHandler: RunInitiationHandler | undefined;
			const registrations = new Map<
				string,
				{ readonly handler: (args: string, ctx: OmpCommandContext) => void | Promise<void> }
			>();

			const contextOf = (): OmpSessionContext => ({
				agent: { kind: facts.kind, id: facts.id, parentId: facts.parentId },
				sessionManager: { getSessionId: () => facts.sessionId, getBranch: () => branchOf(facts) },
				// Owner resolution is what this suite observes; the marker area has its own
				// suite, so the UI surface here records only feedback.
				hasUI: true,
				ui: {
					notify: message => {
						notifications.push(message);
					},
					setWidget: () => {},
				},
			});

			const api: OmpExtensionApi = {
				setLabel(): void {},
				registerCommand(name, registration): void {
					registrations.set(name, registration);
				},
				appendEntry(customType: string, data?: unknown): void {
					appended.push({ customType, data });
				},
				on(event: OmpSessionEventType | "before_agent_start", handler: AnyHandler): void {
					if (event === "before_agent_start") runHandler = handler as RunInitiationHandler;
					else handlers[event].push(handler as SessionHandler);
				},
				// The native escape hatch: the official agent registry the adapter walks.
				pi: { AgentRegistry: { global: () => ({ get: refOf }) } },
			};

			if (!factory(api).bound) throw new Error("the codebase-tools definition did not bind");

			return {
				start(): void {
					for (const handler of handlers.session_start) {
						handler({ type: "session_start" }, contextOf());
					}
				},
				run(): OmpRunInitiationResult | undefined {
					if (runHandler === undefined) throw new Error("binding subscribed no run-initiation hook");
					return runHandler({ type: "before_agent_start" }, contextOf()) ?? undefined;
				},
				command(): void {
					const registration = registrations.get(COMMAND);
					if (registration === undefined) throw new Error(`command "${COMMAND}" was not registered`);
					registration.handler("", contextOf());
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

describe("a subagent follows its nearest main ancestor (P4, C3)", () => {
	test("each run reads the owner's current value, and the subagent's own branch decides the slot", () => {
		const double = nativeDouble();
		// The owner seeds `enabled` from its own branch at the main session's start.
		const main = double.bind(MAIN);
		main.start();
		const child = double.bind(CHILD);
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
		double.bind(MAIN).start();
		// This subagent's branch already carries the init contribution.
		const child = double.bind({ ...CHILD, sessionId: "session-initialised", contributions: [INIT_IDENTITY] });
		child.start();

		// Enabled and already initialised on its own branch → the repeating slot, not a
		// second init.
		expect(child.run()?.message.customType).toBe(REMINDER_IDENTITY);
	});

	test("a nested subagent walks up the parent chain to the same root owner", () => {
		const double = nativeDouble();
		double.bind(MAIN).start();
		const child = double.bind(CHILD);
		child.start();
		const grandchild = double.bind(GRANDCHILD);
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
		const main = double.bind(MAIN);
		main.start();
		const child = double.bind(CHILD);
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

describe("an unresolvable owner degrades to off (P8, N4)", () => {
	test("a session whose parent link resolves to no main contributes nothing and cannot toggle", () => {
		const double = nativeDouble();
		double.bind(MAIN).start();
		// A background fork whose spawning agent is not in the registry: the chain leaves
		// the process, so no owner resolves.
		const fork = double.bind({
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
		double.bind(MAIN).start();
		// A `/tan`-style clone: a subagent with no spawning-agent link at all.
		const clone = double.bind({ id: "Tan-1", kind: "sub", sessionId: "session-clone" });

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
		double.bind(MAIN).start();
		const child = double.bind(CHILD);

		const { diagnostics } = withCapturedStderr(() => {
			child.start();
			child.run();
		});

		expect(diagnostics).toBe("");
	});
});
