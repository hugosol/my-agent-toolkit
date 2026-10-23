/**
 * pi's run-initiation surface: the prompt an extension contributes before an agent run begins.
 *
 * The adapter only states the native result shape — pi appends and persists this message after the
 * user's input, and its custom-message path supplies the native role, so no system override is
 * made. What to contribute, and whether to contribute at all, stays with the framework's planning.
 */
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import type { HarnessPort } from "../../../../../framework/runtime/port";
import { markerTransport } from "./ui";
import type { PiPortContext } from "../../../internal/port";

/** The run-initiation axis of one binding's port. */
export function onPiRunInitiation(context: PiPortContext): NonNullable<HarnessPort["onRunInitiation"]> {
	return handler => {
		context.keepSubscription(context.pi.on("before_agent_start", async (_event, ctx) => {
			const planned = await handler(defineAdapterDelivery("run", {
				owner: context.resolveOwner(ctx),
				contributionIdentities: ctx.sessionManager.getBranch()
					.flatMap(entry =>
						entry.type === "custom_message" && typeof entry.customType === "string"
							? [entry.customType]
							: []),
				markers: markerTransport(ctx),
			}));
			// pi's custom-message form carries the identity and display decision the plan stated.
			return planned === undefined ? undefined : {
				message: { customType: planned.identity, content: planned.content, display: planned.display },
			};
		}));
	};
}
