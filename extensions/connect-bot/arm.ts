/**
 * The arm effect: register this owner with the panel, and treat the session as armed only if
 * the panel actually registered it.
 *
 * The effect is deliberately not awaited by the command — the framework never awaits an
 * injected implementation, and an outbound round-trip owns its own completion — so everything
 * this module needs is handed to it: the delivery it acts through, the owner it acts for, the
 * session facts and the managed timer a runtime read natively.
 *
 * Arming writes exactly two things. The framework's declared value goes true through the
 * delivery's seam, which is what the extension's marker renders and what any later background
 * effect reads through the capability it kept. The extension's own record is created for the
 * owner, holding the real session id a later unregister would name, the state the panel is told
 * about from the next beat on, the outbound queue every background push leaves through, the
 * running heartbeat, and the failure budget that queue's settled pushes are counted against.
 * Nothing else about the session is remembered here; the online count the panel returned is
 * reported and not kept.
 *
 * The opposite outcome drops both halves again. A register the panel never acknowledged — a
 * reject, a timeout, or an answer that is not the registered receipt — leaves this session
 * unarmed, and a session that was armed before the attempt is disarmed by it: the value returns
 * to false, the marker leaves the area, the heartbeat is cancelled, the queue is dropped and the
 * record — the failure budget with it — is gone, so what this extension says and what a later
 * effect would act on are the same thing again. Nothing is left scheduled or in flight by a
 * failed attempt, which is what makes a retry — running the command once more — a clean attempt
 * rather than a resumed one.
 *
 * The report that follows a successful register is unconditional and not a transition: the panel
 * is told this session's state once per arm and per re-arm (`./state-machine`), so a reconnected
 * row shows the current value without waiting a heartbeat for it — and a state the session never
 * left is still what the panel is told.
 *
 * A repeat of an arm is the same connection asked again, and it is treated as one: the owner's
 * timer and queue are kept rather than duplicated — a second timer would double every beat and a
 * second queue could deliver one beat twice — while what the panel just answered for is written
 * into the record it already has, and the failure budget the record holds starts over.
 */
import type { CommandDelivery } from "../../framework/core/protocol";
import type { AgentState } from "./agent-state";
import { PUSH_TIMEOUT_MS, REGISTER_TIMEOUT_MS, pushEvent, readRegisterOutcome, type PushEnvelope } from "./client";
import { connectBotConfig } from "./config";
import { disarmLocally } from "./disarm";
import { initialHealth, pushResultObserver, resetHealth } from "./failure-budget";
import { publishFeedback } from "./feedback";
import { startHeartbeat } from "./heartbeat";
import type { ManagedTimers } from "./managed-timer";
import { Outbox, OutboxFlusher } from "./outbox";
import { botSessions, type SessionFacts } from "./session";
import { reportState } from "./state-machine";

/**
 * The register body: the session facts the panel's session view renders beyond the envelope's
 * own session id. An optional fact this session does not report is omitted rather than sent as
 * an empty value.
 */
function registerData(facts: SessionFacts): Record<string, unknown> {
	const data: Record<string, unknown> = { cwd: facts.cwd };
	if (facts.sessionName !== undefined && facts.sessionName.length > 0) data.sessionName = facts.sessionName;
	if (facts.model !== undefined && facts.model.length > 0) data.model = facts.model;
	return data;
}

/**
 * Arm one owner: one `register` round-trip, and the session is armed only if the panel
 * answered with the registered receipt.
 *
 * A rejected or timed-out request and a reachable panel that did not register this session —
 * `404` after an omp-bot restart, any other non-2xx, a body that is not the receipt — are the
 * same outcome: the session is left unarmed, and the operator is told once. For a session that
 * was already armed, that outcome is the same disarm the first failed arm would produce, because
 * a failed re-registration must not leave this session claiming to be connected to a panel that
 * refused it.
 *
 * Arm is not filtered on the current value either: running the command again asks the panel
 * again, and it asks with `register` alone. Nothing is unregistered first, the owner keeps its
 * one record and no second timer is created — which is what makes a panel restart a one-command
 * reconnect whose panel row is refreshed in place rather than dropped and re-added.
 */
export async function arm(
	delivery: CommandDelivery,
	ownerKey: string,
	facts: SessionFacts,
	timers: ManagedTimers,
): Promise<void> {
	const envelope: PushEnvelope = {
		sessionId: facts.sessionId,
		kind: "register",
		data: registerData(facts),
	};
	const outcome = await pushEvent(connectBotConfig().endpoint, envelope, REGISTER_TIMEOUT_MS).catch(() => undefined);
	const receipt = outcome === undefined ? undefined : readRegisterOutcome(outcome);
	if (receipt === undefined) {
		// Nothing was armed — and a re-arm that failed leaves this session unarmed too.
		disarmLocally(delivery.state, ownerKey);
		publishFeedback(delivery.feedback, { trigger: "arm", register: undefined });
		return;
	}

	// The declared value first, so the marker the framework publishes can never lag the state
	// this extension reports; then the record the heartbeat and the outbound queue read; then what
	// the operator is told happened.
	delivery.state.write(true);
	// What the panel is told about this session from the next beat on: the runtime's idle fact,
	// read once — a session that arms while the agent is working reports 工作中 rather than a 空闲
	// it never was.
	const state: AgentState = delivery.canAcceptInput() === true ? "idle" : "working";
	const armed = botSessions.get(ownerKey);
	if (armed === undefined) {
		// The owner's outbound queue: one flusher, the wire client's push budget, and every settled
		// push accounted to the failure budget of this owner's own record.
		const outbox = new OutboxFlusher(
			new Outbox(),
			queued => pushEvent(connectBotConfig().endpoint, queued, PUSH_TIMEOUT_MS),
			pushResultObserver(ownerKey),
		);
		botSessions.record(ownerKey, {
			sessionId: facts.sessionId,
			capability: delivery.capability,
			state,
			outbox,
			health: initialHealth(),
			heartbeat: startHeartbeat(timers, ownerKey),
		});
	} else {
		// The same connection asked again: the one heartbeat and the one queue stay as they are,
		// and what the panel just answered for is written into the record they read. What was
		// queued before this register is dropped — it described the connection the panel has just
		// re-answered, and the beat that follows says everything an old one would have said. A
		// register the panel answered is also a fresh start for the failure budget, so the outage
		// this connection may have been in is neither counted nor announced any more.
		armed.sessionId = facts.sessionId;
		armed.capability = delivery.capability;
		armed.state = state;
		resetHealth(armed.health);
		armed.outbox.clear();
	}
	// The one report that is not a transition: arming — and re-arming — tells the panel what this
	// session's state is now, whether or not it changed while the session was away. The re-arm
	// above has just dropped what was queued for the connection it re-answered, so this is the
	// first thing the panel hears about the row it just registered.
	reportState(ownerKey, state, "register");
	publishFeedback(delivery.feedback, { trigger: "arm", register: receipt });
}
