/**
 * The display's own redraw, merged: the one redraw a turn's observation readings cost together.
 *
 * Two facts belong to different places, and the gap between them is why this module exists. A reading
 * is adopted the moment it arrives — the framework's observation source records it and the accounting's
 * registries move with it — and nothing of that adoption waits for a drawing: what a reading *means*
 * is true as soon as the delivery returned. The drawing is the other fact. A frontend reads the whole
 * display result every time it is told the result changed, so a turn in which three sessions' contexts
 * and activities arrived is one redraw of the latest values rather than six drawings of one reading
 * each — which is what a session whose own run produced a message-end and a settle in the same turn
 * would otherwise cost several times over.
 *
 * So a moved reading *asks* for a redraw instead of performing one. The first ask in a turn arranges
 * the redraw at that turn's end, every later ask in the same turn joins it, and the redraw then reads
 * whatever the display reads at that moment. Nothing is held back from memory for this: what waits is
 * a notification, never a fact, and an edge that settled a Round or saved a session publishes exactly
 * as it did — with the one consequence that a publication already made in the turn spends the redraw
 * that turn still owed, because every reader it notified read the readings those asks were about.
 *
 * That is the whole of the merging, and it is deliberately not a window: no duration, no timer, no
 * repeated attempt, nothing to tune. It is the specification's own boundary — "facts are received and
 * adopted at once, display requests may be merged" — so a quiescent process owes nothing and arranges
 * nothing, and a turn's readings are drawn once, in that turn's own order.
 */
import { reportDiagnostic } from "../../../../framework/interface/general/diagnostics";

export interface CoalescedRedraw {
	/** A reading the display draws moved: the display owes one redraw at the end of this turn. */
	request(): void;
	/** Releases it: a redraw still owed is dropped, and a later ask arranges none. */
	dispose(): void;
}

/** What one merged redraw arranges itself with. */
export interface CoalescedRedrawInputs {
	/** Draws now, through the one change notification every reader of this instance's result holds. */
	readonly redraw: () => void;
	/**
	 * Subscribes to that notification, so a publication this turn already made — the accounting's own,
	 * from a settled Turn or a moved Round — spends the redraw the turn still owed.
	 */
	readonly published: (listener: () => void) => () => void;
}

/** Build the display's one merged redraw. */
export function createCoalescedRedraw(inputs: CoalescedRedrawInputs): CoalescedRedraw {
	/** Whether the readings moved since the last redraw: what the turn still owes. */
	let owed = false;
	/** Whether this turn's redraw is already arranged, so a later ask joins it rather than adding one. */
	let arranged = false;
	let released = false;

	const draw = (): void => {
		arranged = false;
		if (released || !owed) return;
		owed = false;
		// A publication reaches every reader with the readings this redraw was owed for. An ask that
		// arrives while it runs is a later turn's, and arranges its own redraw rather than being lost.
		try {
			inputs.redraw();
		} catch {
			// This microtask owns the callback; never expose arbitrary view/error payloads.
			reportDiagnostic("[model-cost] Merged redraw failed; later redraw requests remain active.");
		}
	};

	const unsubscribe = inputs.published(() => {
		owed = false;
	});

	return {
		request() {
			if (released) return;
			owed = true;
			if (arranged) return;
			arranged = true;
			queueMicrotask(draw);
		},
		dispose() {
			released = true;
			owed = false;
			unsubscribe();
		},
	};
}
