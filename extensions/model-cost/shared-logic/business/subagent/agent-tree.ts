/**
 * The agent tree's own facts: which sessions one main session's tree holds, each one's own
 * consumption, and the session-scoped readings the tree shows beside it.
 *
 * This module answers the business question the display asks — what the tree *is* — and leaves how
 * a row is worded, coloured or emphasised to the presentation layer. It reads the one authority the
 * rest of the extension reads: the identities and own accumulations `ConsumptionView` holds, plus the
 * per-session context and activity readings. It adds no accumulation of its own.
 *
 * Three rules stay here rather than in a frontend:
 *
 * - **The root.** A target's main session is the top-level session its reliable direct parents lead
 *   to; the tree, the Session span and the detail form all belong to that session. The walk stops at
 *   a session that already appeared, so a relation that describes a circle terminates.
 * - **The descendants.** They are the view's own natural depth-first traversal of the identity union
 *   (see `ConsumptionView.descendants`): one entry per actual session, each with its distance from
 *   the root, whether it is a child or a grandchild. The root is not among them, and no inclusive
 *   total is added on top of the sessions' own figures.
 * - **The readings beside a session.** Startup is what that session began with, never what it runs
 *   now. Runtime is that session's own measured working time and stays absent when nothing reliable
 *   is known — absent is not zero. Context is read against its own model channel's fixed budget;
 *   an unobserved session has none.
 */
import type {
	OwnConsumption,
	SessionStartup,
} from "../../foundation/session/consumption-document";
import type {
	ConsumptionView,
	SessionDescendant,
	SessionIdentity,
} from "../../foundation/session/request-accounting";
import type { SessionActivity, SessionActivityReading } from "../../foundation/session/session-activity";
import {
	type ContextUsage,
	type SessionContextReader,
	contextUsageOf,
} from "../context/session-context";
import type { ModelPricingData } from "../pricing/model-data";

/** One provider/model pair of the root session's own accumulation, as one model row. */
export interface AgentTreePair {
	readonly provider: string;
	readonly model: string;
}

/** The tree's root: the main session's name and the pairs it consumed itself. */
export interface AgentTreeRoot {
	/** The root's latest display name, falling back to the session id, as the view states it. */
	readonly name: string;
	/** The root's own accumulation, which its model rows are read from. */
	readonly own: OwnConsumption;
	/** One entry per provider/model pair the root itself consumed, in the view's own order. */
	readonly pairs: readonly AgentTreePair[];
}

/**
 * One descendant session's own facts, as one session row states them.
 *
 * Everything here is that session's own: its accumulation excludes its descendants', its runtime is
 * its own working time, its context is its own binding's reading, and its startup is the snapshot it
 * began with. Nothing is inherited from its parent.
 */
export interface AgentTreeNode {
	readonly identity: SessionIdentity;
	/** The session's distance from the root: a child is 1, a grandchild 2. */
	readonly depth: number;
	/** The session's own accumulation, and nothing of its own descendants'. */
	readonly own: OwnConsumption;
	/** The model and effective effort the session began with; absent when nothing proved them. */
	readonly startup?: SessionStartup;
	/** The session's own accumulated working time this period; absent when nothing reliable is known. */
	readonly runtimeMs?: number;
	/** The session's last observed activity; absent for a session no Round edge has moved. */
	readonly activity?: SessionActivity;
	/** The session's own context reading against its channel's budget; absent when unobserved. */
	readonly context?: ContextUsage;
}

/** One main session's tree, as the detail form lists it. */
export interface AgentTree {
	readonly root: AgentTreeRoot;
	/** The root's descendants, depth-first, exactly as {@link ConsumptionView.descendants} orders them. */
	readonly descendants: readonly AgentTreeNode[];
}

/** The session-scoped readings and model data a tree is read with. */
export interface AgentTreeSources {
	readonly context: SessionContextReader;
	readonly activity: SessionActivityReading;
	readonly data: ModelPricingData;
}

/**
 * The top-level session one session belongs to: the main session whose tree it is part of.
 *
 * The walk follows the reliable direct parents the view holds and stops when it reaches a session
 * with none, when the view knows no identity for the next step, or when it meets one it already
 * visited — a circular relation terminates rather than walking forever.
 */
export function mainSessionOf(view: ConsumptionView, sessionId: string): string {
	const seen = new Set<string>([sessionId]);
	let cursor = sessionId;
	for (;;) {
		const parent = view.identity(cursor)?.parentSessionId;
		if (parent === undefined || parent === null || seen.has(parent)) return cursor;
		seen.add(parent);
		cursor = parent;
	}
}

/** Whether one session is the root of its own tree, and therefore owns the detail form's tree. */
export function isTreeRoot(view: ConsumptionView, sessionId: string): boolean {
	return view.identity(sessionId)?.parentSessionId === null;
}

/** One descendant's own facts, read from the same authority every other display read uses. */
function nodeOf(
	view: ConsumptionView,
	sources: AgentTreeSources,
	descendant: SessionDescendant,
): AgentTreeNode {
	const { identity, depth } = descendant;
	const startup = view.startup(identity.sessionId);
	const runtimeMs = view.runtime(identity.sessionId);
	const activity = sources.activity.read(identity.sessionId);
	const context = contextUsageOf(sources.context.read(identity.sessionId), sources.data);
	return {
		identity,
		depth,
		own: view.own(identity.sessionId) ?? {},
		...(startup === undefined ? {} : { startup }),
		...(runtimeMs === undefined ? {} : { runtimeMs }),
		...(activity === undefined ? {} : { activity }),
		...(context === undefined ? {} : { context }),
	};
}

/**
 * The tree of one main session, with each node's own facts and the readings beside it.
 *
 * The root is stated once and its own accumulation is what its model rows read, so no second
 * accumulation is derived for the tree. Descendants come from the view's natural traversal, which
 * already merges the sessions a previous process committed with the ones this process observed and
 * gives each actual session one entry.
 */
export function agentTreeOf(
	view: ConsumptionView,
	rootId: string,
	sources: AgentTreeSources,
): AgentTree {
	const own = view.own(rootId) ?? {};
	const pairs: AgentTreePair[] = [];
	for (const [provider, models] of Object.entries(own)) {
		for (const model of Object.keys(models)) pairs.push({ provider, model });
	}
	return {
		root: { name: view.identity(rootId)?.name ?? rootId, own, pairs },
		descendants: view.descendants(rootId).map(descendant => nodeOf(view, sources, descendant)),
	};
}
