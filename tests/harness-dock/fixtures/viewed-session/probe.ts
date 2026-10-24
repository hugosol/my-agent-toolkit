/**
 * Dock fixture: an ordinary extension that consumes the host's public Viewed session outlet and
 * records exactly what it was handed, one JSON line per observation, in the run root.
 *
 * It uses only the public extension contract: `getViewedSession()` and its subscription, plus
 * `getContextUsage()` as the independent native reading for context comparisons. The same file
 * runs unchanged against the unpatched baseline install, where the outlet members do not exist.
 * That is the control: the probe reports what it found instead of failing, and a run on the
 * baseline therefore reports an absent outlet rather than the outlet's behavior.
 */
import { appendFileSync } from "node:fs";

export const VIEWED_PROBE_LABEL = "viewed-probe";
export const VIEWED_PROBE_COMMAND = "viewed-outlet";
export const VIEWED_PROBE_EVIDENCE_ENV = "DOCK_VIEWED_EVIDENCE";

/** The public context a command handler receives, as far as the outlet is concerned. */
interface ViewedProbeContext {
	getContextUsage?(): { tokens: number; contextWindow: number } | undefined;
	getViewedSession?(): unknown;
	subscribeViewedSessionChanged?(listener: (facts: unknown) => void): () => void;
}

interface ViewedProbeApi {
	setLabel(label: string): void;
	registerCommand(
		name: string,
		options: { description?: string; handler: (args: string, ctx: ViewedProbeContext) => void | Promise<void> },
	): void;
}

const ACTIONS = ["present", "read", "context", "subscribe", "unsubscribe", "deliveries"] as const;

export default function viewedSessionProbe(pi: ViewedProbeApi): void {
	const evidenceFile = process.env[VIEWED_PROBE_EVIDENCE_ENV];
	if (!evidenceFile) throw new Error(`${VIEWED_PROBE_EVIDENCE_ENV} is required by the Viewed session probe`);
	let unsubscribe: (() => void) | undefined;
	let deliveries = 0;
	pi.setLabel(VIEWED_PROBE_LABEL);
	pi.registerCommand(VIEWED_PROBE_COMMAND, {
		description: `Viewed session probe: ${ACTIONS.join(" | ")}`,
		handler: (args, ctx) => {
			const action = args.trim();
			const record = (entry: Record<string, unknown>): void => {
				appendFileSync(evidenceFile, `${JSON.stringify(entry)}\n`);
			};
			switch (action) {
				case "present":
					record({
						kind: "present",
						read: typeof ctx.getViewedSession === "function",
						subscribe: typeof ctx.subscribeViewedSessionChanged === "function",
					});
					return;
				case "read":
					record({ kind: "read", facts: ctx.getViewedSession?.() ?? null });
					return;
				case "context":
					// Native own-session reading, independent of the outlet under test.
					record({ kind: "context", context: ctx.getContextUsage?.() ?? null });
					return;
				case "subscribe":
					unsubscribe = ctx.subscribeViewedSessionChanged?.(facts => {
						deliveries += 1;
						record({ kind: "delivery", deliveries, facts });
					});
					record({ kind: "subscribed", subscribed: unsubscribe !== undefined, deliveries });
					return;
				case "unsubscribe":
					unsubscribe?.();
					unsubscribe = undefined;
					record({ kind: "unsubscribed", deliveries });
					return;
				case "deliveries":
					record({ kind: "deliveries", deliveries });
					return;
				default:
					throw new Error(`${VIEWED_PROBE_COMMAND} takes ${ACTIONS.join(" | ")}, received ${JSON.stringify(action)}`);
			}
		},
	});
}
