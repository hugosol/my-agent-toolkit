/** Native session transitions paired with pi-subagents child-extension requirements. */
import type { HarnessPort } from "../../../framework/runtime/port";
import type { PiPortContext } from "../port";
import { observePiSession } from "../native/core/extensions/session";

/** Children require their own children too; transfer releases only the session being left. */
export function onPiSession(context: PiPortContext): NonNullable<HarnessPort["onSession"]> {
	return observePiSession(context, {
		starting: sessionId => context.integration?.requireIn(sessionId),
		ending: sessionId => context.integration?.releaseSession(sessionId),
	});
}
