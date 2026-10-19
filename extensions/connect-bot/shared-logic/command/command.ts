/**
 * `/connect-bot`, implemented for the harness this extension is assembled onto.
 *
 * The command is declared as `directed`, so the framework owns the argument vocabulary — an empty
 * argument names `on` and `off` names `off`, and any other text is not a directive at all — and
 * hands this implementation what it recognized. What the implementation owns is everything the
 * effect is: the gate, the arm and off round-trips and the declared value it writes. The words the
 * operator reads are not among them: every notice this command produces, the usage error for an
 * unrecognized argument included, is chosen by the one table (`./feedback`) from the facts the
 * effect produced. The framework publishes no feedback for a directed command, so nothing here is
 * ever said twice, and it calls into this object for an unrecognized argument too (`unrecognized`)
 * rather than inventing words of its own.
 *
 * Both entry points run the one session/UI gate first: a subagent is refused silently (the
 * framework's owner scope would keep it from reaching either member, and the gate states the rule
 * as this command's own decision), and a session with no UI is refused for that reason, with the
 * table's refusal — which the unified feedback channel turns into a single stderr line.
 *
 * The session facts it sends are read by the harness assembly and injected as plain data, so
 * this module names no harness and reaches no native API.
 */
import type { CommandDelivery, DirectedCommandImplementation, RecognizedDirective } from "../../../../framework/public";
import { publishFeedback } from "../feedback";
import { commandGate } from "./guard";
import type { ManagedTimers } from "../managed-timer";
import type { PanelRegistrations } from "../panel/registration";
import type { SessionFacts } from "../session/session";

/** What this command needs from the harness assembly that assembled it. */
export interface ConnectBotHarness {
	/**
	 * The facts of the session this invocation runs in, as the harness read them natively.
	 *
	 * They are read per invocation rather than captured once: a session's directory and model
	 * are facts of the session being served now, and the delivery the implementation receives
	 * deliberately carries no native context of its own.
	 */
	readonly sessionFacts: () => SessionFacts;
	/**
	 * The managed timer surface of this invocation, as the harness provides it.
	 *
	 * Like the session facts it is read per invocation, and for the same reason: the timer surface
	 * belongs to the harness context this invocation runs in, so the heartbeat the arm path starts
	 * is scheduled against the session it arms — and no native timer type reaches shared logic.
	 */
	readonly managedTimers: () => ManagedTimers;
}

/**
 * The implementation the assembly injects for `/connect-bot`.
 *
 * Only the owner's own main session with a UI gets past the gate: a subagent is refused
 * silently, and a session without a UI is refused with the fixed message the unified feedback
 * channel turns into one stderr line. Either refusal changes no state, sends no request and
 * creates no record — for an unknown argument too, because the gate is consulted before the
 * argument matters.
 *
 * The two recognized directives are the effect and its opposite: the empty argument arms this
 * session, and `off` disarms it. Neither effect is awaited by the framework, so both own their
 * own completion — exactly as any other outbound effect of this extension does.
 *
 * An unrecognized argument is not a directive, so it never reaches `run`. The framework hands
 * the text to `unrecognized` instead, and this member answers it with the usage error the
 * operator reads: no state is written, no request is sent and no record is touched, so a
 * mistyped argument can never disturb a connection that is already in place.
 */
export function createConnectBotCommand(
	harness: ConnectBotHarness,
	registrations: PanelRegistrations,
): DirectedCommandImplementation {
	return {
		run(directive: RecognizedDirective, delivery: CommandDelivery): void {
			const gate = commandGate(delivery);
			if (!gate.allowed) {
				// Both refusals go through the one table: a session with no UI reads the fixed refusal
				// on stderr, and a subagent is refused with no words at all.
				publishFeedback(
					delivery.feedback,
					gate.reason === "no-ui" ? { trigger: "no-ui", hasUI: delivery.hasUI } : { trigger: "subagent" },
				);
				return;
			}

			if (directive.kind === "deactivate") {
				registrations.deactivate(delivery, gate.ownerKey);
				return;
			}
			// Both harness facts are read here, inside the invocation: the timer surface belongs to
			// the context this run is driving, and the register attempt schedules the heartbeat on
			// it. Reading them here also keeps them tied to the command the operator issued, even
			// when the attempt waits behind another one for the same owner.
			registrations.activate(delivery, gate.ownerKey, harness.sessionFacts(), harness.managedTimers());
		},
		unrecognized(argument: string, delivery: CommandDelivery): void {
			const gate = commandGate(delivery);
			if (!gate.allowed) {
				publishFeedback(
					delivery.feedback,
					gate.reason === "no-ui" ? { trigger: "no-ui", hasUI: delivery.hasUI } : { trigger: "subagent" },
				);
				return;
			}
			publishFeedback(delivery.feedback, { trigger: "unknown-argument", argument });
		},
	};
}
