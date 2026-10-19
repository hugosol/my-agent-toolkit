/**
 * The observation scopes and per-actual-session facts at the framework's public seam
 * (S1; contract P57; ticket 05 slice 1).
 *
 * A subscription group declares `owner` or `session` scope once, and both scopes share the
 * one public dispatch. What this slice drives through the shared port double: a session-scoped
 * group receives a delivery for a *subagent* session carrying that session's own identity, its
 * direct parent and its latest name, while an owner-scoped group in the same binding receives
 * nothing for it; and both receive the owner's own delivery. The framework's own owner-scoped
 * behavior is unchanged either way.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type { OwnerReference } from "../../framework/interface/state";
import type { ExtensionDefinition } from "../../framework/public";
import { portDouble } from "./support/harness-port-double";

/** The main session's owner, as an adapter resolves it. */
const MAIN_OWNER: OwnerReference = { kind: "owner", key: "main:session-a" };

/** The owner a subagent's delivery resolves to: the nearest top-level main session. */
const INHERITED_OWNER: OwnerReference = { kind: "inherited", key: "main:session-a" };

/** The facts a subagent session reports: its own id, its direct parent and its latest name. */
const CHILD = {
	sessionId: "session-child",
	kind: "sub" as const,
	parentSessionId: "session-a",
	name: "child-task",
	unavailable: [],
};

/** The facts a grandchild session reports: its direct parent is the child, not the main session. */
const GRANDCHILD = {
	sessionId: "session-grandchild",
	kind: "sub" as const,
	parentSessionId: "session-child",
	name: "grand-child",
	unavailable: [],
};

/** The facts the main session reports. */
const MAIN = { sessionId: "session-a", kind: "main" as const, name: "main-session", unavailable: [] };

/** A definition that declares nothing: the suite drives its assembly's subscriptions alone. */
const PROBE: ExtensionDefinition = CODEBASE_TOOLS;

describe("a subscription group's scope decides which deliveries reach it (P57)", () => {
	test("a session-scoped group observes a subagent's own identity, parent and name", () => {
		const double = portDouble();
		const observed: Array<{ readonly session: unknown; readonly kind: string }> = [];
		double.bind(PROBE, {
			subscriptions: [
				{
					scope: "session",
					events: {
						session_start: delivery => {
							observed.push({ session: delivery.session, kind: delivery.event.kind });
						},
					},
				},
			],
		});

		double.deliverSession(INHERITED_OWNER, { session: CHILD });

		expect(observed).toEqual([{ session: CHILD, kind: "session_start" }]);
	});

	test("an owner-scoped group is never moved by a subagent's delivery", () => {
		const double = portDouble();
		const observed: unknown[] = [];
		double.bind(PROBE, {
			subscriptions: [
				{ scope: "owner", events: { session_start: delivery => void observed.push(delivery.session) } },
			],
		});

		const childDelivery = double.deliverSession(INHERITED_OWNER, { session: CHILD });
		expect(childDelivery.feedback).toEqual([]);

		double.deliverSession(MAIN_OWNER, { session: MAIN });
		expect(observed).toEqual([MAIN]);
	});

	test("both scopes run in one binding from the one declaration", () => {
		const double = portDouble();
		const ownerSeen: string[] = [];
		const sessionSeen: string[] = [];
		double.bind(PROBE, {
			subscriptions: [
				{
					scope: "owner",
					events: { session_start: delivery => void ownerSeen.push(delivery.session.sessionId) },
				},
				{
					scope: "session",
					events: { session_start: delivery => void sessionSeen.push(delivery.session.sessionId) },
				},
			],
		});

		double.deliverSession(MAIN_OWNER, { session: MAIN });
		double.deliverSession(INHERITED_OWNER, { session: CHILD });
		double.deliverSession(INHERITED_OWNER, { session: GRANDCHILD });

		// The owner group saw the owner's own boundary only; the session group saw every actual
		// session, each with its own identity and its own direct parent.
		expect(ownerSeen).toEqual(["session-a"]);
		expect(sessionSeen).toEqual(["session-a", "session-child", "session-grandchild"]);
	});

	test("a grandchild's direct parent is its own parent session, not the main session", () => {
		const double = portDouble();
		const parents: Array<string | undefined> = [];
		double.bind(PROBE, {
			subscriptions: [
				{
					scope: "session",
					events: { session_start: delivery => void parents.push(delivery.session.parentSessionId) },
				},
			],
		});

		double.deliverSession(INHERITED_OWNER, { session: CHILD });
		double.deliverSession(INHERITED_OWNER, { session: GRANDCHILD });

		expect(parents).toEqual(["session-a", "session-child"]);
	});

	test("a session-scoped round edge carries the actual session's facts", () => {
		const double = portDouble();
		const seen: Array<{ readonly id: string; readonly kind: string }> = [];
		double.bind(PROBE, {
			subscriptions: [
				{
					scope: "session",
					events: {
						round_start: delivery =>
							void seen.push({ id: delivery.session.sessionId, kind: delivery.event.kind }),
					},
				},
			],
		});

		double.deliverRound(INHERITED_OWNER, { session: CHILD });

		expect(seen).toEqual([{ id: "session-child", kind: "round_start" }]);
	});

	test("an owner-scoped round group still sees no subagent edge", () => {
		const double = portDouble();
		const seen: unknown[] = [];
		double.bind(PROBE, {
			subscriptions: [{ scope: "owner", events: { round_start: delivery => void seen.push(delivery.event) } }],
		});

		double.deliverRound(INHERITED_OWNER, { session: CHILD });
		expect(seen).toEqual([]);

		double.deliverRound(MAIN_OWNER, { session: MAIN });
		expect(seen).toEqual([{ kind: "round_start" }]);
	});
});
