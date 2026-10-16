/**
 * The pi adapter's session facts at the public adapter seam (S1; contract P11, P12, P13; ticket 05).
 *
 * What the framework owes on this axis is the *mapping*: one delivery per native session fact,
 * carrying the actual session's identity, its kind, its direct parent, its Owner and its latest name,
 * and — on the one start that proves a session was beginning — the model and effective effort it began
 * on. The rules themselves (how a tree is read from those facts, what a renamed row shows, when a
 * snapshot is saved) belong to the shared business suite; this one drives the native facts the pi
 * adapter reads.
 *
 * Three things are deliberately *not* derived from anything else, and each is asserted here rather
 * than assumed:
 *
 * - a direct parent is the session pi's own lineage link names — a session *file* — resolved through
 *   that file's own header id, so a file named after nothing proves the id was read rather than the
 *   path; the Owner is the nearest top-level session above it, which for a nested session is not its
 *   direct parent;
 * - a session that pi stood up from another session's entries (a `new`, a `fork`) is a top-level
 *   session of its own: the link records where the copy came from, not a session that spawned it;
 * - the startup pair is written only where the start proves a beginning, and never filled in from the
 *   values the session happens to report later: a resumed, forked or replayed session carries none.
 */
import { describe, expect, test } from "bun:test";
import { sessionFileDir } from "./support/pi-session-files";
import { type PiSurfaceSession, boundPiSurface } from "./support/pi-surface-double";

/**
 * One session as pi's own surface reports it, for the cases below: a top-level session of its own
 * unless a case states a header and a start reason that make it a spawned one.
 */
const MAIN: PiSurfaceSession = {
	sessionId: "pi-sess-main",
	name: "pi main session",
	model: { id: "deepseek-flash", provider: "deepseek" },
	thinkingLevel: "medium",
	idle: true,
	pending: false,
};

describe("a session's identity, direct parent and Owner are native facts (P11)", () => {
	test("a top-level session is its own Owner and states no parent", () => {
		const surface = boundPiSurface();
		surface.sessionStarts(MAIN, "startup");

		expect(surface.sessions.map(delivery => delivery.event.kind)).toEqual(["session_start"]);
		const delivery = surface.sessions[0];
		expect(delivery.event).toEqual({ kind: "session_start", reason: "initial" });
		expect(delivery.session.sessionId).toBe("pi-sess-main");
		expect(delivery.session.kind).toBe("main");
		expect(delivery.owner).toEqual({ kind: "owner", key: "main:pi-sess-main" });
		// A top-level session has no parent by position, which is not the same as a parent this host
		// could not obtain: nothing names the fact as missing.
		expect(delivery.session.parentSessionId).toBeUndefined();
		expect(delivery.session.unavailable).not.toContain("direct parent session");
	});

	test("a spawned session's direct parent is the id the linked session file's own header states", () => {
		const files = sessionFileDir();
		files.write("a1b2c3.jsonl", { type: "session", id: "pi-sess-main" });
		const surface = boundPiSurface();
		const child: PiSurfaceSession = {
			sessionId: "pi-sess-child",
			name: "review the diff",
			header: { type: "session", id: "pi-sess-child", parentSession: files.path("a1b2c3.jsonl") },
			model: { id: "deepseek-flash", provider: "deepseek" },
			thinkingLevel: "medium",
			idle: true,
			pending: false,
		};

		surface.sessionStarts(child, "startup");

		const delivery = surface.sessions[0];
		expect(delivery.session.kind).toBe("sub");
		// The file is named after nothing: the id is the one that file's own header states, and the
		// Owner is that same top-level session because nothing above it states a lineage link.
		expect(delivery.session.parentSessionId).toBe("pi-sess-main");
		expect(delivery.owner).toEqual({ kind: "inherited", key: "main:pi-sess-main" });
		expect(delivery.session.unavailable).not.toContain("direct parent session");
		// pi states no agent definition or task handle for a session, and neither is borrowed from the
		// name it does report.
		expect(delivery.session.agentName).toBeUndefined();
		expect(delivery.session.agentId).toBeUndefined();
		expect(delivery.session.unavailable).toContain("agent name");
		expect(delivery.session.unavailable).toContain("agent id");
	});

	test("a nested session's direct parent is the session that spawned it, not the Owner above it", () => {
		const files = sessionFileDir();
		files.write("root.jsonl", { type: "session", id: "pi-sess-main" });
		files.write("middle.jsonl", { type: "session", id: "pi-sess-middle", parentSession: files.path("root.jsonl") });
		const surface = boundPiSurface();
		const grandchild: PiSurfaceSession = {
			sessionId: "pi-sess-leaf",
			header: { type: "session", id: "pi-sess-leaf", parentSession: files.path("middle.jsonl") },
			model: { id: "deepseek-flash", provider: "deepseek" },
			thinkingLevel: "medium",
			idle: true,
			pending: false,
		};

		surface.sessionStarts(grandchild, "startup");

		const delivery = surface.sessions[0];
		expect(delivery.session.kind).toBe("sub");
		expect(delivery.session.parentSessionId).toBe("pi-sess-middle");
		expect(delivery.owner).toEqual({ kind: "inherited", key: "main:pi-sess-main" });
	});

	test("two sessions with the same display name stay two identities with their own parents", () => {
		const files = sessionFileDir();
		files.write("first.jsonl", { type: "session", id: "pi-sess-a" });
		files.write("second.jsonl", { type: "session", id: "pi-sess-b" });
		const surface = boundPiSurface();
		const named = "explore the tests";
		surface.sessionStarts(
			{ sessionId: "pi-child-1", name: named, header: { type: "session", id: "pi-child-1", parentSession: files.path("first.jsonl") } },
			"startup",
		);
		surface.sessionStarts(
			{ sessionId: "pi-child-2", name: named, header: { type: "session", id: "pi-child-2", parentSession: files.path("second.jsonl") } },
			"startup",
		);

		expect(surface.sessions.map(delivery => delivery.session.name)).toEqual([named, named]);
		expect(surface.sessions.map(delivery => delivery.session.sessionId)).toEqual(["pi-child-1", "pi-child-2"]);
		expect(surface.sessions.map(delivery => delivery.session.parentSessionId)).toEqual(["pi-sess-a", "pi-sess-b"]);
		expect(surface.sessions.map(delivery => delivery.owner)).toEqual([
			{ kind: "inherited", key: "main:pi-sess-a" },
			{ kind: "inherited", key: "main:pi-sess-b" },
		]);
	});

	test("a session pi stood up from another session's entries is a top-level session of its own", () => {
		const files = sessionFileDir();
		files.write("source.jsonl", { type: "session", id: "pi-sess-source" });
		const link = { type: "session", id: "pi-sess-copy", parentSession: files.path("source.jsonl") } as const;
		const fork = boundPiSurface();
		fork.sessionStarts({ sessionId: "pi-sess-fork", header: { ...link, id: "pi-sess-fork" } }, "fork");
		const newSession = boundPiSurface();
		newSession.sessionStarts({ sessionId: "pi-sess-new", header: { ...link, id: "pi-sess-new" } }, "new");

		// The link records which session's entries the copy was built from, not a session that spawned
		// it: the copy is its own top-level session, whatever its header still says.
		for (const surface of [fork, newSession]) {
			const delivery = surface.sessions[0];
			expect(delivery.session.kind).toBe("main");
			expect(delivery.session.parentSessionId).toBeUndefined();
			expect(delivery.owner.kind).toBe("owner");
			expect(delivery.session.unavailable).not.toContain("direct parent session");
		}
		expect(fork.sessions[0].owner).toEqual({ kind: "owner", key: "main:pi-sess-fork" });
		expect(newSession.sessions[0].owner).toEqual({ kind: "owner", key: "main:pi-sess-new" });
	});

	test("a chain this host cannot read leaves the parent and the Owner unavailable rather than guessed", () => {
		const files = sessionFileDir();
		files.write("not-a-header.jsonl", { type: "message", id: "not-a-session" });

		const absentParent = boundPiSurface();
		absentParent.sessionStarts(
			{ sessionId: "pi-sess-orphan", header: { type: "session", id: "pi-sess-orphan", parentSession: files.path("absent.jsonl") } },
			"startup",
		);
		const orphan = absentParent.sessions[0];
		expect(orphan.session.kind).toBe("sub");
		expect(orphan.session.parentSessionId).toBeUndefined();
		expect(orphan.session.unavailable).toContain("direct parent session");
		expect(orphan.owner).toEqual({ kind: "unresolved" });

		// A file whose first line states no session header states no anchor either, and the walk ends
		// where it stands rather than continuing along the path's name.
		const notASession = boundPiSurface();
		notASession.sessionStarts(
			{ sessionId: "pi-sess-other", header: { type: "session", id: "pi-sess-other", parentSession: files.path("not-a-header.jsonl") } },
			"startup",
		);
		expect(notASession.sessions[0].session.parentSessionId).toBeUndefined();
		expect(notASession.sessions[0].session.unavailable).toContain("direct parent session");
		expect(notASession.sessions[0].owner).toEqual({ kind: "unresolved" });
	});

	test("a lineage that loops ends the walk without naming an Owner", () => {
		const files = sessionFileDir();
		files.write("first.jsonl", { type: "session", id: "pi-sess-loop-a", parentSession: files.path("second.jsonl") });
		files.write("second.jsonl", { type: "session", id: "pi-sess-loop-b", parentSession: files.path("first.jsonl") });

		const surface = boundPiSurface();
		surface.sessionStarts(
			{ sessionId: "pi-sess-loop-child", header: { type: "session", id: "pi-sess-loop-child", parentSession: files.path("first.jsonl") } },
			"startup",
		);

		const delivery = surface.sessions[0];
		// The direct parent is still the one hop pi states; the Owner is the fact this chain does not
		// state, and it is reported as unresolved rather than followed around the loop.
		expect(delivery.session.parentSessionId).toBe("pi-sess-loop-a");
		expect(delivery.owner).toEqual({ kind: "unresolved" });
	});

	test("a child session's own start and end are delivered without ending the session this binding serves", () => {
		const files = sessionFileDir();
		files.write("parent.jsonl", { type: "session", id: "pi-sess-main" });
		const surface = boundPiSurface();
		surface.sessionStarts(MAIN, "startup");
		const child: PiSurfaceSession = {
			sessionId: "pi-sess-child",
			header: { type: "session", id: "pi-sess-child", parentSession: files.path("parent.jsonl") },
			model: { id: "deepseek-flash", provider: "deepseek" },
		};
		surface.sessionStarts(child, "startup");

		// The child's start is its own delivery with the owner it resolved: the session this binding
		// serves is not left for it, and no boundary is paired where none happened.
		expect(surface.sessions.map(entry => entry.event.kind)).toEqual(["session_start", "session_start"]);
		expect(surface.sessions[1].session.kind).toBe("sub");
		expect(surface.sessions[1].owner).toEqual({ kind: "inherited", key: "main:pi-sess-main" });

		// The child's end is its own too, and the main session's own end still ends the session this
		// binding serves.
		surface.sessionShutsDown(child, "quit");
		expect(surface.sessions.map(entry => entry.event.kind)).toEqual(["session_start", "session_start"]);
		surface.sessionShutsDown(MAIN, "quit");
		expect(surface.sessions.map(entry => entry.event.kind)).toEqual(["session_start", "session_start", "session_end"]);
		expect(surface.sessions[2].event).toEqual({ kind: "session_end", reason: "disposed" });
		expect(surface.sessions[2].owner).toEqual({ kind: "owner", key: "main:pi-sess-main" });
	});

	test("a session the host reports no name for names the fact rather than inventing one", () => {
		const surface = boundPiSurface();
		surface.sessionStarts({ ...MAIN, name: undefined }, "startup");

		expect(surface.sessions[0].session.name).toBeUndefined();
		expect(surface.sessions[0].session.unavailable).toContain("session name");
	});
});

describe("a rename is the session's current facts, delivered where it happened (P12)", () => {
	test("the new name reaches consumers as a facts delivery under the same identity", () => {
		const surface = boundPiSurface();
		surface.sessionStarts(MAIN, "startup");
		surface.sessionRenames({ ...MAIN, name: "renamed work" }, "renamed work");

		expect(surface.sessions.map(delivery => delivery.event.kind)).toEqual(["session_start", "session_facts"]);
		const renamed = surface.sessions[1];
		expect(renamed.event).toEqual({ kind: "session_facts" });
		expect(renamed.session.name).toBe("renamed work");
		// Nothing but the name moved: the identity, the Owner and the position are the ones the session
		// already had, and a rename creates no session boundary for the framework.
		expect(renamed.session.sessionId).toBe("pi-sess-main");
		expect(renamed.session.kind).toBe("main");
		expect(renamed.owner).toEqual({ kind: "owner", key: "main:pi-sess-main" });
	});

	test("a rename of a spawned session keeps its direct parent and Owner", () => {
		const files = sessionFileDir();
		files.write("parent.jsonl", { type: "session", id: "pi-sess-parent" });
		const surface = boundPiSurface();
		const child: PiSurfaceSession = {
			sessionId: "pi-sess-child",
			name: "first name",
			header: { type: "session", id: "pi-sess-child", parentSession: files.path("parent.jsonl") },
		};
		surface.sessionStarts(child, "startup");
		surface.sessionRenames({ ...child, name: "second name" }, "second name");

		const renamed = surface.sessions[1];
		expect(renamed.session.name).toBe("second name");
		expect(renamed.session.parentSessionId).toBe("pi-sess-parent");
		expect(renamed.owner).toEqual({ kind: "inherited", key: "main:pi-sess-parent" });
	});

	test("a name pi states was cleared is a session with no name, not the name it had", () => {
		const surface = boundPiSurface();
		surface.sessionStarts(MAIN, "startup");
		surface.sessionRenames({ ...MAIN, name: undefined }, undefined);

		const cleared = surface.sessions[1];
		expect(cleared.session.name).toBeUndefined();
		expect(cleared.session.unavailable).toContain("session name");
	});
});

describe("the startup pair is written only where a start proves a beginning (P13)", () => {
	test("a session beginning on a model and a level states both on that start alone", () => {
		const surface = boundPiSurface();
		surface.sessionStarts(MAIN, "startup");

		expect(surface.sessions[0].session.startup).toEqual({
			model: { provider: "deepseek", model: "deepseek-flash" },
			effort: "medium",
		});
		expect(surface.sessions[0].session.unavailable).not.toContain("startup model");
		expect(surface.sessions[0].session.unavailable).not.toContain("startup effort");

		// Every later delivery of that session reports none: what the session runs now is not what it
		// began on, and the pair is never re-read on a delivery that is not a beginning.
		surface.sessionRenames({ ...MAIN, name: "renamed", model: { id: "deepseek-pro", provider: "deepseek" } }, "renamed");
		expect(surface.sessions[1].session.startup).toBeUndefined();
	});

	test("a session entered again, or one built from another session's entries, states no startup pair", () => {
		const conversation = [{ type: "message", message: { role: "user" } }];
		const resumed = boundPiSurface();
		resumed.sessionStarts({ ...MAIN, branch: conversation }, "resume");
		expect(resumed.sessions[0].event).toEqual({ kind: "session_start", reason: "resume" });
		expect(resumed.sessions[0].session.startup).toBeUndefined();

		const forked = boundPiSurface();
		forked.sessionStarts({ ...MAIN, branch: conversation }, "fork");
		expect(forked.sessions[0].session.startup).toBeUndefined();
	});

	test("a start whose branch already carries a conversation proves no beginning", () => {
		const surface = boundPiSurface();
		surface.sessionStarts({ ...MAIN, branch: [{ type: "message", message: { role: "assistant" } }] }, "startup");

		// The harness's own start signal is the one a replayed session makes as well, so a branch that
		// already holds the conversation the session was built from is not a beginning.
		expect(surface.sessions[0].session.startup).toBeUndefined();
		// Nothing was invented in its place either: the pair is absent, not read from the settings the
		// session happens to be running under.
		expect(surface.sessions[0].session.startup?.model).toBeUndefined();
	});

	test("an unstated part of the pair is named while the part the host does report is kept", () => {
		const noLevel = boundPiSurface();
		noLevel.sessionStarts({ sessionId: "pi-sess-nolevel", model: { id: "deepseek-flash", provider: "deepseek" } }, "startup");
		expect(noLevel.sessions[0].session.startup).toEqual({ model: { provider: "deepseek", model: "deepseek-flash" } });
		expect(noLevel.sessions[0].session.unavailable).toContain("startup effort");

		const noModel = boundPiSurface();
		noModel.sessionStarts({ sessionId: "pi-sess-nomodel", thinkingLevel: "high" }, "startup");
		expect(noModel.sessions[0].session.startup).toEqual({ effort: "high" });
		expect(noModel.sessions[0].session.unavailable).toContain("startup model");

		const neither = boundPiSurface();
		neither.sessionStarts({ sessionId: "pi-sess-neither" }, "startup");
		expect(neither.sessions[0].session.startup).toBeUndefined();
		expect(neither.sessions[0].session.unavailable).toContain("startup model");
		expect(neither.sessions[0].session.unavailable).toContain("startup effort");
	});

	test("a session that begins on one model reports no second pair when it is re-bound onto another", () => {
		const surface = boundPiSurface();
		const session: PiSurfaceSession = { ...MAIN };
		surface.sessionStarts(session, "startup");
		expect(surface.sessions[0].session.startup).toEqual({
			model: { provider: "deepseek", model: "deepseek-flash" },
			effort: "medium",
		});

		// A reload is the same session being re-bound rather than a boundary, so it delivers nothing at
		// all — there is no second start through which the model the session now runs could be reported
		// as what it began on.
		session.model = { id: "deepseek-pro", provider: "deepseek" };
		surface.sessionStarts(session, "reload");
		expect(surface.sessions).toHaveLength(1);
		expect(surface.sessions[0].session.startup).toEqual({
			model: { provider: "deepseek", model: "deepseek-flash" },
			effort: "medium",
		});
	});
});
