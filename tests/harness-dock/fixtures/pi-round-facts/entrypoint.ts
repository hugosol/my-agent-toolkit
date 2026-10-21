/**
 * Dock fixture: the public Round and Turn edges one pi session dispatches, written to stderr.
 *
 * It exists because "the Round stayed open across pi's own continuations" is a claim about the
 * framework's *public* extension consumption, not about any one extension's reading of it: this file
 * binds a probe definition with the framework's own pi adapter and records, on the process's
 * non-model channel, every edge one session's subscriptions receive — the Round's open and close, and
 * each Turn's start and settle. A run that loads it beside the production model-cost entrypoint can
 * therefore compare the public sequence with what the extension saved, and when.
 *
 * The lines are deliberately plain: one fact per line, in dispatch order, prefixed so the driver can
 * pick them out of a stream it shares with the extension's own diagnostics.
 */
import { piAdapter } from "../../../../adapters/pi";
import {
	type ExtensionDefinition,
	type ImplementationEventHandlers,
	defineImplementation,
} from "../../../../framework/interface";
import { PI_ROUND_FACTS_PREFIX } from "./prefix";

/** The definition this fixture binds: identity and a label, with every behavior injected below. */
const PROBE: ExtensionDefinition = { id: "pi-round-facts", displayName: "piRoundFacts" };

/** Writes one evidence line on the process's own diagnostic channel. */
function note(line: string): void {
	process.stderr.write(`${PI_ROUND_FACTS_PREFIX} ${line}\n`);
}

const events: ImplementationEventHandlers<Record<string, never>> = {
	round_start: (_state, delivery) => note(`round_start ${delivery.session.sessionId}`),
	round_end: (_state, delivery) => note(`round_end ${delivery.session.sessionId}`),
	// The Turn edges are recorded beside the Round's because a Round's end is only meaningful relative
	// to the requests inside it: a close that arrived before a Turn settled would be a different claim
	// from one that arrived after the last of them.
	turn_start: (_state, delivery) =>
		note(`turn_start ${delivery.turn.provider}/${delivery.turn.model} round=${delivery.turn.roundId ?? "<none>"}`),
	turn_end: (_state, delivery) =>
		note(
			`turn_end ${delivery.turn.provider}/${delivery.turn.model} outcome=${delivery.end.outcome} usage=${delivery.end.usage === undefined ? "<none>" : "reported"}`,
		),
};

export default piAdapter(PROBE, {
	implementation: defineImplementation<Record<string, never>>({
		create: () => ({}),
		subscriptions: [{ scope: "session", events }],
	}),
});
