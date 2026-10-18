/**
 * Dock fixture: the per-session observation one real pi binding delivers, written to stderr.
 *
 * It exists because "a session the harness ran in another process is observed here, and what a
 * consumer attaches to already holds its readings" is a claim about the framework's *public*
 * consumption, not about any one extension's reading of it: this file binds a probe definition with
 * the framework's own pi adapter and records, on the process's non-model channel, both what the
 * per-session observation delivery carried and what the framework's own observation source held for
 * that session at the moment the delivery arrived.
 *
 * That second half is the point of the probe: an extension reads the process's common observation
 * source for a reading that arrived before it attached, and a line stating the source's own answer
 * is what lets a driver tell "the reading reached this process" from "this delivery happened to
 * carry it". The lines are deliberately plain — one fact per line, prefixed so a driver can pick
 * them out of a stream it shares with the extension's own diagnostics — and an absent reading is
 * written as `none` rather than omitted, so "this host stated none" is distinguishable from "the
 * fixture never saw the delivery".
 */
import { piAdapter } from "../../../../adapters/pi";
import type { ExtensionDefinition, SessionObservation } from "../../../../framework/public";
import { PI_SUBAGENT_OBSERVATION_PREFIX } from "./prefix";

/** The definition this fixture binds: identity and a label, with every behavior injected below. */
const PROBE: ExtensionDefinition = { id: "pi-subagent-observation", displayName: "piSubagentObservation" };

/** Writes one evidence line on the process's own diagnostic channel. */
function note(line: string): void {
	process.stderr.write(`${PI_SUBAGENT_OBSERVATION_PREFIX} ${line}\n`);
}

/** The value of a reading a delivery did not carry, written so a reading can tell it from a missing line. */
function stated(value: string | number | undefined): string {
	return value === undefined ? "none" : String(value);
}

/** One session's owner as one line states it. */
function ownerText(owner: SessionObservation["owner"] | undefined): string {
	if (owner === undefined) return "none";
	return owner.kind === "unresolved" ? "unresolved" : `${owner.kind}:${owner.key}`;
}

/** What the process's own observation source holds for one session, as one line states it. */
function heldText(held: SessionObservation | undefined): string {
	return `held_activity=${stated(held?.activity)} held_tokens=${stated(held?.context?.tokens)}`;
}

/**
 * The probe's binding, as one entry binds it with the file a spawned session loads it from.
 *
 * The entry is stated rather than inferred, because observations cross between processes for one
 * *extension*: the seat is the pair of an extension id and an owner, so the extension whose spawned
 * sessions deliver their readings here is the very one bound here. A driver therefore writes an
 * entry of its own layout that names itself, exactly as a deployment's entrypoint does.
 */
export function piSubagentObservationProbe(childEntry: string) {
	return piAdapter(PROBE, {
		childEntry,
		factory: context => ({
		subscriptions: [
			{
				scope: "session",
				events: {
					session_activity: delivery => {
						const held = context.sessionObservations.read(delivery.session.sessionId);
						note(
							[
								"activity",
								`id=${delivery.session.sessionId}`,
								`kind=${delivery.session.kind}`,
								`parent=${stated(delivery.session.parentSessionId)}`,
								`owner=${ownerText(delivery.owner)}`,
								`activity=${delivery.activity}`,
								heldText(held),
							].join(" "),
						);
					},
					session_context: delivery => {
						const held = context.sessionObservations.read(delivery.session.sessionId);
						note(
							[
								"context",
								`id=${delivery.session.sessionId}`,
								`kind=${delivery.session.kind}`,
								`parent=${stated(delivery.session.parentSessionId)}`,
								`owner=${ownerText(delivery.owner)}`,
								`tokens=${stated(delivery.reading.tokens)}`,
								`model=${delivery.reading.provider === undefined ? "none" : `${delivery.reading.provider}/${delivery.reading.model ?? "?"}`}`,
								heldText(held),
							].join(" "),
						);
					},
				},
			},
		],
		}),
	});
}
