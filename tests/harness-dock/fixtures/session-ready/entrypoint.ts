import { appendFileSync, existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { ompAdapter, type OmpExtensionApi } from "../../../../adapters/omp";
import { piAdapter, type PiExtensionApi } from "../../../../adapters/pi";
import { defineExtension, defineImplementation } from "../../../../framework/interface";
import type { SessionEventDelivery } from "../../../../framework/interface/session";

function record(kind: string, session?: string, file?: string): void {
	appendFileSync(process.env.DOCK_READY_TRACE!, `${JSON.stringify({ kind, session, file })}\n`);
}

const definition = defineExtension({ id: "dock-session-ready", displayName: "Dock session ready" });
const note = (delivery: SessionEventDelivery) => record(delivery.event.kind, delivery.session.sessionId);
const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [{ scope: "owner", events: { session_start: (_s, delivery) => note(delivery), session_ready: (_s, delivery) => note(delivery) } }],
});

export default function probe(api: OmpExtensionApi | PiExtensionApi): void {
	if (process.env.DOCK_READY_HARNESS === "omp") {
		const omp = api as OmpExtensionApi;
		ompAdapter(definition, { implementation })(omp);
		omp.registerCommand("dock-ready-input", {
			description: "Record input through the native composer",
			handler: async args => { record("native-command-input", args); },
		});
		omp.on("session_start", async (_event, ctx) => {
			// The public widget factory lends this observer the native TUI without taking focus.
			// It does not set the editor, write its text, or intercept input.
			const ui = ctx.ui as typeof ctx.ui & {
				setWidget(key: string, factory: (tui: { getFocused(): { disableSubmit?: boolean } | null }) => { render(): string[]; invalidate(): void }): void;
			};
			ui.setWidget("dock-gate-observation", tui => {
				const native = ctx.sessionManager as typeof ctx.sessionManager & { getSessionFile(): string | undefined };
				record(tui.getFocused()?.disableSubmit === true ? "native-gate-closed" : "native-gate-not-closed", native.getSessionId(), native.getSessionFile());
				return { render: () => [], invalidate() {} };
			});
			ui.setWidget("dock-gate-observation", undefined);
			const release = process.env.DOCK_READY_RELEASE!;
			const deadline = Date.now() + 12_000;
			while (!existsSync(release)) {
				if (Date.now() > deadline) throw new Error("dock did not release OMP startup");
				await delay(15);
			}
			record("native-hook-released");
		});
		return;
	}
	const pi = api as PiExtensionApi;
	pi.on("session_start", async () => {
		if (process.env.DOCK_READY_PI_MODAL !== "1") return;
		record("pi-hook-before-ready");
		const release = process.env.DOCK_READY_RELEASE!;
		const deadline = Date.now() + 12_000;
		while (!existsSync(release)) {
			if (Date.now() > deadline) throw new Error("dock did not release Pi startup");
			await delay(15);
		}
	});
	piAdapter(definition, { implementation })(pi);
	pi.on("session_start", async (_event, ctx) => {
		if (process.env.DOCK_READY_PI_MODAL !== "1") return;
		if (ctx.ui.confirm === undefined) throw new Error("Pi native confirmation is unavailable");
		const confirmed = await ctx.ui.confirm("Dock startup modal", "This native prompt can still block later input.");
		record(confirmed ? "pi-modal-confirmed" : "pi-modal-dismissed");
	});
}
