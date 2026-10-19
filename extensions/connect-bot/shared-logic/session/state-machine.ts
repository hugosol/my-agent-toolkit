/**
 * The agent-state machine: the semantic edge that moves a session's value, and the one `state`
 * report a real move makes.
 *
 * The vocabulary is `./agent-state`'s. What lives here is when the value moves. Two edges move
 * it, and they are the framework's own semantic round axis rather than any harness's event:
 * `round_start` is the agent taking up a prompt, `round_end` is that round reaching quiescence —
 * whether it ended on an ordinary answer, an error or an abort. `idle` is not a destination of
 * any edge: it is the fact a session is armed with, asked once of `canAcceptInput()` by the arm
 * path, so an armed session moves only between 工作中 and 等待用户输入.
 *
 * Only a *real* move is reported. The value the owner's record already holds is compared before
 * anything is enqueued, so a repeated edge, an edge whose value was already reached, and the
 * settle that follows an already-reported end are all silent — the de-bounce that makes the panel
 * see exactly one `state` per transition. It is also what makes a push the panel never answered
 * cost nothing: the next heartbeat carries the value in force, and the value in force is the one
 * this module wrote into the record.
 *
 * A report leaves through the owner's own outbound queue and never around it, so a `state` keeps
 * its order against the heartbeats beside it. An owner with no record — a session that never
 * armed, or one that has already stopped — has nothing to report, which is what keeps an
 * unarmed session silent without any caller having to ask whether it is armed.
 *
 * Nothing here names a harness or a native event: an edge arrives as the framework's
 * semantic kind, and the two facts a report needs — the real session id and the queue — are read
 * from the extension's own record.
 */
import type { OwnerReference } from "../../../../framework/interface/state";
import type { AgentState } from "./agent-state";
import { botSessions } from "./session";

/** The semantic round edges that move an armed session's state. */
export type RoundEdge = "round_start" | "round_end";

/**
 * Why one `state` was reported, as the payload's `reason` carries it.
 *
 * `register` is the arm path's own reason — arm and re-arm report unconditionally once, and that
 * report is not a move. The two edges are the framework's semantic round kinds, so the trace
 * names what actually happened rather than a harness's event for it. The panel renders
 * `data.value` alone and reads no reason; this is diagnostic only.
 */
export type StateReason = "register" | RoundEdge;

/**
 * Report one owner's state now: enqueue the `state` event on the owner's own queue, in order
 * with everything else that owner is sending.
 *
 * The caller decides *whether* the value is worth reporting (arm always is, a round edge only
 * when it moved); this member only carries it to the panel.
 */
export function reportState(ownerKey: string, value: AgentState, reason: StateReason): void {
	const session = botSessions.get(ownerKey);
	if (session === undefined) return;
	session.outbox.enqueue({ sessionId: session.sessionId, kind: "state", data: { value, reason } });
}

/**
 * Apply one semantic round edge for one owner: move the record, and report the move when there
 * is one.
 *
 * The owner check restates the framework's own scope, exactly as the command gate does: only a
 * session that *is* its own owner holds a record of its own, so a subagent's round edge — whose
 * owner resolves to the main session it follows, or to nothing at all — never reaches another
 * session's record or queue on its own account.
 */
export function applyRoundEdge(owner: OwnerReference, edge: RoundEdge): void {
	if (owner.kind !== "owner") return;
	const session = botSessions.get(owner.key);
	if (session === undefined) return;
	// Taking up input is 工作中; reaching quiescence is 等待用户输入 whatever ended the round —
	// an ordinary answer, an error or an abort all leave the agent waiting for the operator.
	const value: AgentState = edge === "round_start" ? "working" : "awaiting-input";
	if (value === session.state) return;
	session.state = value;
	reportState(owner.key, value, edge);
}
