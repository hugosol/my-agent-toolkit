/**
 * The three agent states the panel renders for one session.
 *
 * `state.value` is the wire protocol's closed enum, frozen with the panel: `idle` and `working`
 * are what a session reports from the moment it is armed (the runtime's idle fact, read once),
 * and `awaiting-input` is the state a finished round leaves behind. The panel judges 在线/离线 from
 * heartbeats instead, and that axis never enters here.
 *
 * This module owns the vocabulary alone. Which event moves the value, when a move is a real change
 * worth reporting, and the `state` event itself belong to the state machine driven by the session's
 * round and lifecycle deliveries.
 */

/** A session's agent state, as the panel's session view renders it. */
export type AgentState = "working" | "awaiting-input" | "idle";
