/**
 * Dock fixture: the public Round and Turn edges one pi session dispatches as its activity is
 * interrupted and as new work follows it, written to stderr.
 *
 * It exists because "the interrupted Round ended where it settled, was not reopened by a late
 * arrival, and a wake that really ran opened a Round of its own" is a claim about the framework's
 * *public* extension consumption — one that no extension's own account of itself can establish. This
 * file binds a probe definition with the framework's own pi adapter and records, on the process's
 * non-model channel, every edge one session's subscriptions receive: the Round's open and close, and
 * each Turn's start with the Round identity that Turn was reported to belong to. A driver can
 * therefore compare the sequence across two processes and place the document's own saves beside it.
 *
 * The child entry the assembly requires is the driver's own statement of the run's layout, because
 * reading a session's background work belongs to the integration scope an assembly opens by requiring
 * something in the sessions a provider spawns (see `prefix.ts`). The probe adds nothing else: its
 * whole body is the one subscription below, so what it prints is the framework's dispatch and never a
 * behavior of its own.
 */
import { piAdapter } from "../../../../adapters/pi";
import type { ExtensionDefinition } from "../../../../framework/interface";
import type { SemanticEventHandlers } from "../../../../framework/interface/session";
import { PI_TERMINAL_ROUNDS_CHILD_ENTRY_ENV, PI_TERMINAL_ROUNDS_PREFIX } from "./prefix";

/** The definition this fixture binds: identity and a label, with every behavior injected below. */
const PROBE: ExtensionDefinition = { id: "pi-terminal-rounds", displayName: "piTerminalRounds" };

/** Writes one evidence line on the process's own diagnostic channel. */
function note(line: string): void {
	process.stderr.write(`${PI_TERMINAL_ROUNDS_PREFIX} ${line}\n`);
}

/** The child entry this probe's assembly declares, as the run's own layout states it. */
const childEntry = process.env[PI_TERMINAL_ROUNDS_CHILD_ENTRY_ENV];
if (childEntry === undefined || childEntry.length === 0) {
	throw new Error(`${PI_TERMINAL_ROUNDS_CHILD_ENTRY_ENV} is not set: this fixture reads a Round's background work only through the integration scope a child entry opens`);
}

const events: SemanticEventHandlers = {
	round_start: delivery => note(`round_start ${delivery.session.sessionId}`),
	round_end: delivery => note(`round_end ${delivery.session.sessionId}`),
	// The Turn edges are recorded beside the Round's because they are what says which Round each
	// request was reported to belong to: a Run that continues a Round carries that Round's identity,
	// and one that opens a new Round carries a different one.
	turn_start: delivery =>
		note(`turn_start ${delivery.turn.session.sessionId} round=${delivery.turn.roundId ?? "<none>"}`),
	turn_end: delivery =>
		note(
			`turn_end ${delivery.turn.session.sessionId} outcome=${delivery.end.outcome} usage=${delivery.end.usage === undefined ? "<none>" : "reported"}`,
		),
};

export default piAdapter(PROBE, {
	childEntry,
	factory: () => ({ subscriptions: [{ scope: "session", events }] }),
});
