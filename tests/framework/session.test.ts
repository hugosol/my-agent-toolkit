/**
 * The framework's session behavior at the public adapter seam (S2; P5, P7, P10, C4, C6).
 *
 * A session boundary reconciles the owner's State with the value its target branch
 * persisted; a `/tree` navigation inside one session does not. The agent-runtime side of
 * the seam is the narrow native surface the OMP loader hands the factory, so a test
 * double stands in for the loader: it records registrations and appended entries and
 * delivers the native session lifecycle events, each with the session context the runner
 * would build (session identity plus the branch the behavior reads).
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type {
	OmpCommandContext,
	OmpExtensionApi,
	OmpSessionContext,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";

/** The State entry the framework persists, and the command that flips its value. */
const STATE_ENTRY_TYPE = "codebase-tools:state";
const COMMAND = "codebase-tools";

/** One session as the agent runtime holds it: an identity and the branch under it. */
interface SessionFacts {
	readonly sessionId: string;
	/** The State payloads persisted on this session's branch, oldest first. */
	readonly statePayloads: unknown[];
	readonly kind?: "main" | "sub";
}

interface Registration {
	readonly handler: (args: string, ctx: OmpCommandContext) => void | Promise<void>;
}

/** The native surface a loader hands the factory, recording registrations and effects. */
interface NativeSurface {
	readonly api: OmpExtensionApi;
	/** Appended entries in call order. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** Loads a session, as the runner does at startup: `session_start`. */
	startSession(facts: SessionFacts): void;
	/** Switches to another session identity: `session_switch`. */
	switchSession(facts: SessionFacts, reason: "new" | "resume" | "fork"): void;
	/** Branches into a new session identity: `session_branch`. */
	branchSession(facts: SessionFacts, reason: "branch" | "fork" | "btw"): void;
	/** Navigates inside the current session's tree (same identity, new leaf): `session_tree`. */
	navigateTree(facts: SessionFacts): void;
	/** A command context as the runner builds it for one session. */
	commandContext(facts: SessionFacts): OmpCommandContext;
	runCommand(ctx: OmpCommandContext): void;
}

/** One session lifecycle handler as the loader registers it. */
type SessionHandler = (event: OmpSessionEvent, ctx: OmpSessionContext) => void;
/** The run-initiation handler shape the loader also registers through `on`. */
type RunInitiationHandler = (
	event: unknown,
	ctx: OmpSessionContext,
) => { message: { customType: string } } | undefined | void;

/** Records every registration and every effect, and delivers session events like the runner. */
function nativeSurface(): NativeSurface {
	const registrations = new Map<string, Registration>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	// A closed vocabulary: one handler list per session event the loader can deliver.
	const handlers: Record<OmpSessionEventType, SessionHandler[]> = {
		session_start: [],
		session_switch: [],
		session_branch: [],
		session_tree: [],
	};

	// The registry label is deliberately identical for every main session: the owner key
	// must come from the session identity, not from this label.
	const contextOf = (facts: SessionFacts): OmpSessionContext => ({
		agent: { kind: facts.kind ?? "main", id: facts.kind === "sub" ? "0-Explore" : "Main" },
		sessionManager: {
			getSessionId: () => facts.sessionId,
			// The branch as the session manager holds it: the State entries this session persisted.
			getBranch: () => facts.statePayloads.map(data => ({ type: "custom", customType: STATE_ENTRY_TYPE, data })),
		},
		// The marker area and feedback are exercised by their own suites; this suite is
		// about State seeding, so the UI surface records nothing.
		hasUI: true,
		ui: { notify: () => {}, setWidget: () => {} },
	});

	const deliver = (event: OmpSessionEvent, facts: SessionFacts): void => {
		for (const handler of handlers[event.type]) handler(event, contextOf(facts));
	};

	const api: OmpExtensionApi = {
		// The suite drives State through commands and session events, not through labels.
		setLabel(): void {},
		registerCommand(name, registration): void {
			registrations.set(name, registration);
		},
		appendEntry(customType: string, data?: unknown): void {
			appended.push({ customType, data });
		},
		// This suite delivers session lifecycle events; the run-initiation hook is
		// subscribed by binding but exercised by the injection suite.
		on(event: OmpSessionEventType | "before_agent_start", handler: SessionHandler | RunInitiationHandler): void {
			if (event === "before_agent_start") return;
			handlers[event].push(handler as SessionHandler);
		},
	};

	return {
		api,
		appended,
		startSession: facts => deliver({ type: "session_start" }, facts),
		switchSession: (facts, reason) => deliver({ type: "session_switch", reason }, facts),
		branchSession: (facts, reason) => deliver({ type: "session_branch", reason }, facts),
		navigateTree: facts => deliver({ type: "session_tree" }, facts),
		commandContext: facts => contextOf(facts),
		runCommand(ctx: OmpCommandContext): void {
			const registration = registrations.get(COMMAND);
			if (registration === undefined) throw new Error(`command "${COMMAND}" was not registered`);
			registration.handler("", ctx);
		},
	};
}

/** Binds the codebase-tools definition to the double. */
function bindCodebaseTools(surface: NativeSurface): void {
	const factory = frameworkOmp.ompAdapter(CODEBASE_TOOLS, { supportedVersions: ["18.5.0"] });
	const result = factory(surface.api);
	if (!result.bound) throw new Error("the codebase-tools definition did not bind");
}

describe("session boundary seeding (P5, P7, C4)", () => {
	test("a resumed session reads its State back from the target branch", () => {
		const surface = nativeSurface();
		bindCodebaseTools(surface);
		// The branch carries two State records; the last one is the session's current value.
		const session: SessionFacts = {
			sessionId: "session-1",
			statePayloads: [{ enabled: false }, { enabled: true }],
		};
		surface.startSession(session);

		surface.runCommand(surface.commandContext(session));

		// The seeded value was `true`, so the first toggle records `false`.
		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
	});

	test("missing, unknown, or malformed State data falls back to off (P7, N5)", () => {
		const surface = nativeSurface();
		bindCodebaseTools(surface);
		// Each case is a session whose branch holds exactly these State records: the last one
		// declares no usable `enabled` (or there is none at all), so the session starts off.
		const branches: ReadonlyArray<readonly unknown[]> = [
			[],
			[{ on: true }],
			[{ on: true, initInjected: true }],
			[{ enabled: "true" }],
			[{ enabled: 1 }],
			[null],
			[true],
			[{ enabled: true }, { on: false }],
			[{ enabled: true }, { enabled: "yes" }],
			[{ enabled: true }, {}],
		];

		for (const [index, statePayloads] of branches.entries()) {
			const session: SessionFacts = { sessionId: `session-${index}`, statePayloads: [...statePayloads] };
			surface.startSession(session);
			surface.runCommand(surface.commandContext(session));
		}

		// Every session toggled from the default, so every record is `enabled`.
		expect(surface.appended).toEqual(
			branches.map(() => ({ customType: STATE_ENTRY_TYPE, data: { enabled: true } })),
		);
	});
});

describe("tree navigation inside one session (P5, C6)", () => {
	test("a tree navigation reseeds nothing: the session's current value stays authoritative", () => {
		const surface = nativeSurface();
		bindCodebaseTools(surface);
		const session: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);
		// Seeded on, so the first toggle turns the session off.
		surface.runCommand(surface.commandContext(session));
		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);

		// The branch the navigation lands on still holds the enabling record (the toggle's
		// write is not part of it). Navigating is not a boundary, so the session's current
		// value — off — is what the next toggle flips.
		surface.navigateTree(session);
		surface.runCommand(surface.commandContext(session));

		expect(surface.appended).toEqual([
			{ customType: STATE_ENTRY_TYPE, data: { enabled: false } },
			{ customType: STATE_ENTRY_TYPE, data: { enabled: true } },
		]);
	});
});

describe("session identity changes (P5, C4, C6)", () => {
	test("a new session starts from its own branch and retires the session it replaced", () => {
		const surface = nativeSurface();
		bindCodebaseTools(surface);
		const first: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(first);

		// The new session's branch holds no State: it starts off.
		const second: SessionFacts = { sessionId: "session-2", statePayloads: [] };
		surface.switchSession(second, "new");
		surface.runCommand(surface.commandContext(second));
		expect(surface.appended[surface.appended.length - 1]).toEqual({
			customType: STATE_ENTRY_TYPE,
			data: { enabled: true },
		});

		// The session left behind was retired: its owner reads the default again, so its
		// first toggle records `enabled` rather than flipping the value it had seeded.
		surface.runCommand(surface.commandContext(first));
		expect(surface.appended[surface.appended.length - 1]).toEqual({
			customType: STATE_ENTRY_TYPE,
			data: { enabled: true },
		});
	});

	test("resuming a session replaces its cell with the target branch's value", () => {
		const surface = nativeSurface();
		bindCodebaseTools(surface);
		const session: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);
		surface.runCommand(surface.commandContext(session));

		// The branch still records `enabled`: resuming that session re-seeds from it, so the
		// next toggle records the value the branch holds, not the one the cell held.
		surface.switchSession(session, "resume");
		surface.runCommand(surface.commandContext(session));

		expect(surface.appended).toEqual([
			{ customType: STATE_ENTRY_TYPE, data: { enabled: false } },
			{ customType: STATE_ENTRY_TYPE, data: { enabled: false } },
		]);
	});

	test("a branch into a new identity seeds from its own target branch", () => {
		const surface = nativeSurface();
		bindCodebaseTools(surface);
		const branched: SessionFacts = { sessionId: "session-3", statePayloads: [{ enabled: true }] };

		surface.branchSession(branched, "branch");
		surface.runCommand(surface.commandContext(branched));

		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
	});

	test("a fork seeds from its own target branch", () => {
		const surface = nativeSurface();
		bindCodebaseTools(surface);
		const forked: SessionFacts = { sessionId: "session-4", statePayloads: [{ enabled: true }] };

		surface.switchSession(forked, "fork");
		surface.runCommand(surface.commandContext(forked));

		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
	});
});
