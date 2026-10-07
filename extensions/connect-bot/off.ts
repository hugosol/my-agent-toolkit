/**
 * The off effect: drop this session's connection at once, then ask the panel to remove the row it
 * registered — best-effort, and never at the cost of the local half.
 *
 * The order is what the operator's command promises. Everything local stops synchronously first
 * (see {@link disarmLocally}): the extension's own record is dropped and the declared value goes
 * false, so the marker line leaves the area and no later effect of this extension has anything to
 * act on. Only then is the `unregister` awaited, with the ≤1.5s budget the wire contract fixes for
 * it, outside any queue: its failure is reported on its own and never counts toward the failure
 * budget a push path would keep.
 *
 * The panel's answer splits the two words the operator may read, and nothing else. Any HTTP answer
 * means the panel is reachable and the row is gone — a 2xx is the ordinary case, and a `404` is
 * what a restarted omp-bot answers for a session it has forgotten. A request that never completed
 * (a reject, or the budget running out) is the other word: the local switch is off either way, and
 * the panel's row may linger until its own 30s expiry. Neither outcome re-opens what the local
 * half closed, and a failure is never repaired by pretending the session is still connected. Which
 * of the two words that is, and the word a session that was never connected gets instead, is
 * `./feedback`'s decision: this path hands it the two facts it established — whether anything was
 * connected, and whether the panel answered at all — and never a status code.
 *
 * The filter reads the value the invocation started from: an `off` for a session that is not
 * connected — one that never armed, or one already disconnected — is a silent no-op. It sends no
 * request, writes no value and says nothing, and no row is invented to remove.
 */
import type { CommandDelivery } from "../../framework/core/protocol";
import { UNREGISTER_TIMEOUT_MS, pushEvent, type PushEnvelope } from "./client";
import { connectBotConfig } from "./config";
import { disarmLocally } from "./disarm";
import { publishFeedback } from "./feedback";
import { botSessions } from "./session";

/**
 * Disarm one owner: stop everything local, then remove the panel row the record named, and report
 * which of the two things happened.
 *
 * The row to remove is the one this owner registered, taken from the record before it is dropped —
 * the session id the wire protocol keys by, which the framework's opaque owner key deliberately
 * does not carry.
 */
export async function off(delivery: CommandDelivery, ownerKey: string): Promise<void> {
	const enabledBefore = delivery.state.read();
	const record = botSessions.get(ownerKey);
	// Not connected: `enabled` is false, or no record was kept. Either way there is nothing to drop
	// and nothing to remove, and this command must leave the session exactly as it found it —
	// including in what the operator is told, which the one table says is nothing.
	if (!enabledBefore || record === undefined) {
		publishFeedback(delivery.feedback, { trigger: "off", enabledBefore, panelAnswered: false });
		return;
	}

	disarmLocally(delivery.state, ownerKey);

	const envelope: PushEnvelope = { sessionId: record.sessionId, kind: "unregister" };
	let panelAnswered = false;
	try {
		await pushEvent(connectBotConfig().endpoint, envelope, UNREGISTER_TIMEOUT_MS);
		// Any HTTP answer means the panel is reachable: the row is gone even for a non-2xx answer
		// such as `404` after an omp-bot restart, so what the caller hands the table is that fact and
		// never a status code.
		panelAnswered = true;
	} catch {
		// Best-effort: a request that never completed leaves the row to the panel's own expiry, and
		// that fact — never the failure's text — is what the table is handed below.
	}
	publishFeedback(delivery.feedback, { trigger: "off", enabledBefore, panelAnswered });
}
