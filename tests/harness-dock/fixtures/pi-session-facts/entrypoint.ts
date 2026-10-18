/**
 * Dock fixture: the public session facts one real pi binding dispatches, written to stderr.
 *
 * It exists because "the session a fact is about, its direct parent, its Owner and its name came from
 * the host" is a claim about the framework's *public* consumption, not about any one extension's
 * reading of it: this file binds a probe definition with the framework's own pi adapter and records,
 * on the process's non-model channel, the session deliveries one real host dispatches — the start, the
 * facts a rename delivers where it happened, and the end.
 *
 * The lines are deliberately plain: one fact per line, prefixed so a driver can pick them out of a
 * stream it shares with the extension's own diagnostics. Absent facts are written as `none` rather
 * than omitted, so "this host stated none" is a reading the driver can distinguish from "the fixture
 * never saw the delivery".
 */
import { piAdapter } from "../../../../adapters/pi";
import type { ExtensionDefinition, SessionEventDelivery } from "../../../../framework/public";
import { PI_SESSION_FACTS_PREFIX } from "./prefix";

/** The definition this fixture binds: identity and a label, with every behavior injected below. */
const PROBE: ExtensionDefinition = { id: "pi-session-facts", displayName: "piSessionFacts" };

/** Writes one evidence line on the process's own diagnostic channel. */
function note(line: string): void {
	process.stderr.write(`${PI_SESSION_FACTS_PREFIX} ${line}\n`);
}

/** The value of a fact a delivery did not carry, written so a reading can tell it from a missing line. */
function stated(value: string | undefined): string {
	return value === undefined || value.length === 0 ? "none" : value;
}

/** One delivery as the fixture's own line: the event, the actual session, and every fact on it. */
function factsLine(event: string, delivery: SessionEventDelivery): void {
	const session = delivery.session;
	const owner = delivery.owner;
	const startup = session.startup;
	const startupText =
		startup === undefined
			? "none"
			: `${startup.model === undefined ? "?" : `${startup.model.provider}/${startup.model.model}`}@${stated(startup.effort)}`;
	note(
		[
			`session ${event}`,
			`id=${stated(session.sessionId)}`,
			`kind=${session.kind}`,
			`parent=${stated(session.parentSessionId)}`,
			`owner=${owner.kind === "unresolved" ? "unresolved" : `${owner.kind}:${owner.key}`}`,
			`name=${stated(session.name)}`,
			`startup=${startupText}`,
			`unavailable=${session.unavailable.join("|")}`,
		].join(" "),
	);
}

export default piAdapter(PROBE, {
	factory: () => ({
		subscriptions: [
			{
				scope: "session",
				events: {
					session_start: delivery => factsLine("start", delivery as SessionEventDelivery),
					session_facts: delivery => factsLine("facts", delivery as SessionEventDelivery),
					session_end: delivery => factsLine("end", delivery as SessionEventDelivery),
				},
			},
		],
	}),
});
