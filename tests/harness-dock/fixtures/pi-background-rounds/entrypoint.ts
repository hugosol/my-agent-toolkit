/**
 * Dock fixture: the public Round and Turn edges one pi session dispatches while it waits on a
 * delegation, written to stderr.
 *
 * It exists because "the parent's Round stayed open across a waiting delegation, and the wake
 * continued that same Round" is a claim about the framework's *public* extension consumption — one
 * that no extension's own account of itself can establish. This file binds a probe definition with
 * the framework's own pi adapter and records, on the process's non-model channel, every edge one
 * session's subscriptions receive: the Round's open and close, and each Turn's start and end with the
 * Round identity that Turn was reported to belong to. A run that loads it beside the production
 * model-cost entrypoint can therefore compare the sequence with what the session saved, and when.
 *
 * The child entry the assembly requires is the driver's own statement of the run's layout, because
 * reading a session's background work belongs to the integration scope an assembly opens by requiring
 * something in the sessions a provider spawns (see `prefix.ts`). The probe adds nothing else: its
 * whole body is the one subscription below, so what it prints is the framework's dispatch and never a
 * behavior of its own.
 */
import { piAdapter } from "../../../../adapters/pi";
import type { ExtensionDefinition, SemanticEventHandlers } from "../../../../framework/public";
import { PI_BACKGROUND_ROUNDS_CHILD_ENTRY_ENV, PI_BACKGROUND_ROUNDS_PREFIX } from "./prefix";

/** The definition this fixture binds: identity and a label, with every behavior injected below. */
const PROBE: ExtensionDefinition = { id: "pi-background-rounds", displayName: "piBackgroundRounds" };

/** Writes one evidence line on the process's own diagnostic channel. */
function note(line: string): void {
	process.stderr.write(`${PI_BACKGROUND_ROUNDS_PREFIX} ${line}\n`);
}

/** The child entry this probe's assembly declares, as the run's own layout states it. */
const childEntry = process.env[PI_BACKGROUND_ROUNDS_CHILD_ENTRY_ENV];
if (childEntry === undefined || childEntry.length === 0) {
	throw new Error(`${PI_BACKGROUND_ROUNDS_CHILD_ENTRY_ENV} is not set: this fixture reads a Round's background work only through the integration scope a child entry opens`);
}

const events: SemanticEventHandlers = {
	round_start: delivery => note(`round_start ${delivery.session.sessionId}`),
	round_end: delivery => note(`round_end ${delivery.session.sessionId}`),
	// The Turn edges are recorded beside the Round's because they are what says whether a later run
	// continued the Round the session was already in: each Turn states the Round it belongs to, and
	// the session is named on every line so a driver reads one session's Turns out of a stream a
	// process with more than one session could carry.
	turn_start: delivery =>
		note(
			`turn_start ${delivery.turn.session.sessionId} ${delivery.turn.provider}/${delivery.turn.model} round=${delivery.turn.roundId ?? "<none>"}`,
		),
	turn_end: delivery =>
		note(
			`turn_end ${delivery.turn.session.sessionId} ${delivery.turn.provider}/${delivery.turn.model} outcome=${delivery.end.outcome} usage=${delivery.end.usage === undefined ? "<none>" : "reported"}`,
		),
};

export default piAdapter(PROBE, {
	childEntry,
	factory: () => ({ subscriptions: [{ scope: "session", events }] }),
});
