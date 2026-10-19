/**
 * The panel session registration module: one owner's whole register lifecycle in one place.
 *
 * The extension's connection is two things that must move together: the declared `enabled` value
 * the framework renders, and the record the effects read to decide what to send. Both are created
 * by a successful register and dropped by every stop, but the register is a network round-trip
 * that the operator can interrupt: an `off` may arrive while the request is on the wire, an owner
 * may end before the receipt does, and a second `/connect-bot` may arrive while the first attempt
 * is still unanswered. Which attempt may still create effects is therefore a property of the
 * attempt and its owner's current life, not of the presence of a record.
 *
 * This module owns that judgment. Its interface is three intents — activate, deactivate and the
 * owner's end — and everything behind them is the implementation: the attempt in flight, the
 * attempts waiting behind it, the disconnecting window in which a new activation is refused, and
 * the point at which a receipt stops being allowed to write State, start a heartbeat or speak to
 * the operator.
 *
 * The effects themselves stay where they were: the heartbeat, the outbound queue and the failure
 * budget remain their own modules, and a successful attempt is what hands them a record to read.
 * This module is harness-independent — it names no native session event, timer or transport
 * and reaches the panel only through the wire client's injected seam.
 */
import type { FeedbackTransport } from "../../../../framework/interface/feedback";
import type { SessionEventDelivery } from "../../../../framework/interface/session";
import type { OwnerCapabilityHandle } from "../../../../framework/interface/state";
import type { CommandDelivery } from "../../../../framework/public";
import { pushEvent, readRegisterOutcome, type PushEnvelope } from "./client";
import { connectBotConfig } from "./config";
import { disarmLocally } from "./disarm";
import { initialHealth, pushResultObserver, resetHealth } from "./failure-budget";
import { publishFeedback } from "../feedback";
import { startHeartbeat } from "./heartbeat";
import type { ManagedTimers } from "../managed-timer";
import { Outbox, OutboxFlusher } from "./outbox";
import { botSessions, type SessionFacts, stopLocalEffects } from "../session/session";
import { reportState } from "../session/state-machine";

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
 * One register attempt: the facts and effects of one `/connect-bot`, owned by the life that
 * started it.
 *
 * `valid` is this attempt's whole authorization to act. It starts true, and the invalidating
 * event — a stop, or the end of the owner this attempt belongs to — turns it false; a receipt
 * that settles afterwards finds an invalid attempt and writes nothing. A later activation of the
 * same owner is a new attempt, so no returned owner can revive an attempt the boundary already
 * invalidated.
 */
interface PanelRegistrationAttempt {
	readonly ownerKey: string;
	readonly facts: SessionFacts;
	readonly timers: ManagedTimers;
	readonly canAcceptInput: () => boolean | undefined;
	/** The owner-scoped capability this attempt writes and speaks through once its receipt lands. */
	readonly capability: OwnerCapabilityHandle;
	valid: boolean;
}

/**
 * The registrations of one owner: the attempt being processed, the attempts waiting behind it,
 * and the disconnecting window that refuses new activations until an unregister settles.
 *
 * A non-zero `disconnecting` is the token of the unregister in flight. The token is what lets a
 * late continuation clear only its own window: an owner boundary abandons the window by zeroing
 * it, so an old unregister can never unblock a newer one.
 */
interface OwnerRegistrations {
	readonly queue: PanelRegistrationAttempt[];
	current: PanelRegistrationAttempt | undefined;
	processing: boolean;
	disconnecting: number;
}

/**
 * Per-owner panel registration lifecycle for one binding.
 *
 * One instance serves every owner of the binding: the command path activates and deactivates
 * owners through it, and the semantic session-end path reports the owner's end through it, so
 * both see the same attempts and the same disconnecting windows.
 */
export class PanelRegistrations {
	readonly #owners = new Map<string, OwnerRegistrations>();

	/**
	 * Requests one owner's registration.
	 *
	 * An activation during another activation's round-trip is queued, not merged: both commands
	 * are real, and the panel answers them in the order the operator issued them. An activation
	 * while this owner is disconnecting is refused without being queued — the unregister the
	 * operator asked for is already on the wire, and the operator can run the command again once
	 * it settles.
	 */
	activate(delivery: CommandDelivery, ownerKey: string, facts: SessionFacts, timers: ManagedTimers): void {
		const owner = this.#owner(ownerKey);
		if (owner.disconnecting !== 0) {
			publishFeedback(delivery.feedback, { trigger: "disconnecting" });
			return;
		}

		owner.queue.push({
			ownerKey,
			facts,
			timers,
			canAcceptInput: delivery.canAcceptInput,
			capability: delivery.capability,
			valid: true,
		});
		void this.#pump(owner);
	}

	/**
	 * Requests one owner's stop.
	 *
	 * Every attempt of this owner — the one in flight and the ones waiting — is invalidated before
	 * anything else, so a register receipt that lands afterwards cannot recreate what this stop
	 * removed. A connected owner is stopped locally first, then the existing row is removed
	 * best-effort, and the owner stays in the disconnecting window until that request settles.
	 */
	deactivate(delivery: CommandDelivery, ownerKey: string): void {
		const pending = this.#owners.get(ownerKey);
		if (pending !== undefined) this.#invalidate(pending);

		const enabledBefore = delivery.state.read();
		const record = botSessions.get(ownerKey);
		if (!enabledBefore || record === undefined) {
			// Not connected: there is nothing to drop and nothing to remove, and this command
			// leaves the session exactly as it found it, including in what the operator is told.
			publishFeedback(delivery.feedback, { trigger: "off", enabledBefore, panelAnswered: false });
			return;
		}

		const owner = this.#owner(ownerKey);
		const token = ++owner.disconnecting;
		const sessionId = record.sessionId;
		disarmLocally(delivery.capability.state, ownerKey);
		void this.#unregister(delivery.capability.feedback, owner, sessionId, token);
	}

	/**
	 * Applies one owner's end.
	 *
	 * Every attempt of the owner is invalidated, so a register that was still on the wire when the
	 * boundary arrived can never arm a session the boundary already left. The local effects stop
	 * synchronously, and the operator is told during the dispatch, where the delivery's own
	 * feedback channel is still live.
	 */
	ownerEnded(delivery: SessionEventDelivery): void {
		if (delivery.event.kind !== "session_end") return;
		if (delivery.owner.kind !== "owner") return;

		const ownerKey = delivery.owner.key;
		const owner = this.#owners.get(ownerKey);
		if (owner !== undefined) {
			this.#invalidate(owner);
			// The boundary abandons any disconnecting window: the unregister it was waiting for no
			// longer speaks for a live version of this owner.
			owner.disconnecting = 0;
		}

		const connection = botSessions.get(ownerKey);
		stopLocalEffects(ownerKey);
		publishFeedback(delivery.feedback, {
			trigger: "session-end",
			reason: delivery.event.reason,
			enabledBefore: connection !== undefined,
		});

		if (delivery.event.reason !== "transferred" || connection === undefined) return;
		void releaseRow(connection.sessionId);
	}

	/** One owner's registrations, created on first use so a never-seen owner has no entry. */
	#owner(ownerKey: string): OwnerRegistrations {
		let owner = this.#owners.get(ownerKey);
		if (owner === undefined) {
			owner = { queue: [], current: undefined, processing: false, disconnecting: 0 };
			this.#owners.set(ownerKey, owner);
		}
		return owner;
	}

	/** Invalidates every attempt this owner has outstanding, in flight or waiting. */
	#invalidate(owner: OwnerRegistrations): void {
		if (owner.current !== undefined) owner.current.valid = false;
		for (const attempt of owner.queue) attempt.valid = false;
		owner.queue.length = 0;
	}

	/**
	 * Runs one owner's attempts in order, one at a time.
	 *
	 * The loop is re-entrant-safe: an activation arriving while the current attempt awaits is
	 * queued, and this same loop picks it up when the current one settles — unless an
	 * invalidation emptied the queue first.
	 */
	async #pump(owner: OwnerRegistrations): Promise<void> {
		if (owner.processing) return;
		owner.processing = true;
		try {
			for (let attempt = owner.queue.shift(); attempt !== undefined; attempt = owner.queue.shift()) {
				if (!attempt.valid) continue;
				owner.current = attempt;
				try {
					await this.#register(attempt);
				} finally {
					owner.current = undefined;
				}
			}
		} finally {
			owner.processing = false;
		}
	}

	/**
	 * One attempt's register round-trip.
	 *
	 * The receipt is read only while the attempt is still valid, so an invalidated attempt is
	 * discarded whatever the panel answered. A valid receipt writes the declared value, creates or
	 * updates the owner's record and starts its effects; a missing receipt leaves the owner
	 * unarmed. Both write and feedback go through the attempt's owner-scoped capability, so the
	 * framework's own owner life is a second gate behind this module's judgment.
	 */
	async #register(attempt: PanelRegistrationAttempt): Promise<void> {
		const envelope: PushEnvelope = {
			sessionId: attempt.facts.sessionId,
			kind: "register",
			data: registerData(attempt.facts),
		};
		// The configured budget of every request this extension makes; the file is its only source.
		const { endpoint, requestTimeoutMs } = connectBotConfig();
		const outcome = await pushEvent(endpoint, envelope, requestTimeoutMs).catch(() => undefined);
		if (!attempt.valid) return;

		const receipt = outcome === undefined ? undefined : readRegisterOutcome(outcome);
		if (receipt === undefined) {
			// Nothing was armed — and a re-arm that failed leaves this session unarmed too.
			disarmLocally(attempt.capability.state, attempt.ownerKey);
			publishFeedback(attempt.capability.feedback, { trigger: "arm", register: undefined });
			return;
		}

		// The declared value first, so the marker the framework publishes can never lag the state
		// this extension reports; then the record the heartbeat and the outbound queue read; then
		// what the operator is told happened.
		attempt.capability.state.write(true);
		// What the panel is told about this session from the next beat on: the harness's idle fact,
		// read once — a session that arms while the agent is working reports 工作中 rather than a
		// 空闲 it never was.
		const state = attempt.canAcceptInput() === true ? "idle" : "working";
		const armed = botSessions.get(attempt.ownerKey);
		if (armed === undefined) {
			// The owner's outbound queue: one flusher, the same configured request budget every other
			// request this extension makes waits, and every settled push accounted to the failure
			// budget of this owner's own record.
			const outbox = new OutboxFlusher(
				new Outbox(),
				queued => pushEvent(endpoint, queued, requestTimeoutMs),
				pushResultObserver(attempt.ownerKey),
			);
			botSessions.record(attempt.ownerKey, {
				sessionId: attempt.facts.sessionId,
				capability: attempt.capability,
				state,
				outbox,
				health: initialHealth(),
				heartbeat: startHeartbeat(attempt.timers, attempt.ownerKey),
			});
		} else {
			// The same connection asked again: the one heartbeat and the one queue stay as they are,
			// and what the panel just answered for is written into the record they read. What was
			// queued before this register is dropped — it described the connection the panel has
			// just re-answered — and the failure budget starts over.
			armed.sessionId = attempt.facts.sessionId;
			armed.capability = attempt.capability;
			armed.state = state;
			resetHealth(armed.health);
			armed.outbox.clear();
		}
		reportState(attempt.ownerKey, state, "register");
		publishFeedback(attempt.capability.feedback, { trigger: "arm", register: receipt });
	}

	/**
	 * Removes one row after an explicit stop, best-effort and outside any queue.
	 *
	 * Any HTTP answer means the panel was reachable; a request that never completed leaves the row
	 * to the panel's own expiry and is never retried. The owner stays in the disconnecting window
	 * until this settles.
	 */
	async #unregister(
		feedback: FeedbackTransport,
		owner: OwnerRegistrations,
		sessionId: string,
		token: number,
	): Promise<void> {
		const envelope: PushEnvelope = { sessionId, kind: "unregister" };
		const { endpoint, requestTimeoutMs } = connectBotConfig();
		let panelAnswered = false;
		try {
			await pushEvent(endpoint, envelope, requestTimeoutMs);
			panelAnswered = true;
		} catch {
			// Best-effort: the panel's expiry takes a row the request could not remove.
		} finally {
			if (owner.disconnecting === token) owner.disconnecting = 0;
		}
		publishFeedback(feedback, { trigger: "off", enabledBefore: true, panelAnswered });
	}
}

/**
 * Asks the panel to remove the row one ended session left, within the extension's own configured
 * request budget.
 *
 * Its answer is nobody's business here: the connection it described is gone either way, so a
 * reject, a timeout and a reachable panel are the same outcome — the row disappears now, or the
 * panel's own expiry takes it. The request is not queued and never counted: the queue it would
 * have joined belonged to the connection that just ended.
 */
async function releaseRow(sessionId: string): Promise<void> {
	const envelope: PushEnvelope = { sessionId, kind: "unregister" };
	const { endpoint, requestTimeoutMs } = connectBotConfig();
	try {
		await pushEvent(endpoint, envelope, requestTimeoutMs);
	} catch {
		// Best-effort: a panel that does not answer leaves the row to its own expiry.
	}
}
