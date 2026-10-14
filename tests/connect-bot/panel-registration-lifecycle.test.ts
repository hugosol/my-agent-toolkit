/**
 * What the panel itself does with a session's row, and what a client's silence can and cannot say
 * about it (P24, P25, P26).
 *
 * Three promises about semantics the request-budget migration must not have rewritten, all read
 * from the actual omp-bot panel's own record rather than from the client's account of it:
 *
 * - a server-processed `unregister` still *deletes* the row — the Panel session registration is the
 *   presence of a row in the panel, and the panel's removal is its own published change, with the
 *   row gone from the table a later connection reads, which is not something a client's echo of its
 *   own request could establish;
 * - an `unregister` that never reaches the panel still leaves the row to the panel's own online
 *   window: the row stays registered, and the panel judges it offline only after the online window
 *   this run declares (30s) plus one of the panel's own 5s scans — Panel session online status is
 *   the panel's own assessment, the client's failure is not evidence about it, and going offline
 *   removes nothing;
 * - a client that times out is *not* reporting that the panel did nothing: the same request can be
 *   received, processed and applied while its answer is still on its way, and the two facts have to
 *   be recorded separately on the side that owns each of them.
 *
 * The first two are observed against the real panel (`support/omp-bot.ts`), whose read side is the
 * panel's own publishing channel: a `remove` frame exists for the removal path alone, while a row
 * that merely went quiet is republished as an offline `upsert`. The third needs a dependency whose
 * *response timing* is controllable, so the extension talks to `support/response-timing-adapter.ts`
 * — a real HTTP service that forwards to the real panel and records what the panel answered before
 * it decides when to answer its own client.
 *
 * Both extensions runs go through the frozen behaviour path the extension really has: an isolated
 * process (`support/budget-probe.ts`) arms a session with `/connect-bot` and then disconnects with
 * `/connect-bot off`, and its own configuration file names the endpoint — so the user's installed
 * deployment, its configuration and its registrations are untouched by any of this.
 */
import { afterEach, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import { readConfig } from "../../framework/core/config";
import { REPO_ROOT } from "../harness-dock/baseline";
import { isUpsertData, type OmpBotFrame, type OmpBotPanel, startOmpBot } from "./support/omp-bot";
import { createRunRoot, type ProbeReport, runProbe } from "./support/probe-run";
import {
	type ResponseTimingAdapter,
	startResponseTimingAdapter,
} from "./support/response-timing-adapter";

/** The request budget the repository's own `config.yaml` ships, as the framework's read of it reports it. */
const SHIPPED_BUDGET_MS = readConfig(path.join(REPO_ROOT, "extensions", "connect-bot", "config.yaml"), {
	fields: CONNECT_BOT.config?.fields,
}).requestTimeoutMs as number;
/**
 * A budget far shorter than the delay the adapter holds a response for, so the client runs out of it
 * while the panel's answer is still on its way. The contract allows a shorter budget to make the same
 * wait fail sooner; what is under test is what each side recorded, never the number.
 */
const TIGHT_BUDGET_MS = 300;
/** How long the adapter holds the panel's own answer back: several client budgets long. */
const RELEASE_DELAY_MS = 1_500;
/**
 * The online window this isolated run declares, and the panel's own scan cadence.
 *
 * The window is stated in the panel configuration `support/omp-bot.ts` writes for the run — the
 * panel's delivered default is 10s, which a 10s beat sits exactly on the edge of — and the cadence
 * is the panel's fixed `EXPIRY_SCAN_INTERVAL`. They are the *server's* numbers, derived from
 * nothing this extension sends, and they are what makes a row that went quiet visible as offline.
 */
const ONLINE_WINDOW_MS = 30_000;
const EXPIRY_SCAN_MS = 5_000;
/** The session id the probe's `off` scenario registers under, as the probe names it. */
const OFF_SESSION = "budget-off";
/** Arm success, verbatim, for the one online session a fresh panel holds. */
const CONNECTED = "已接入 omp-bot 面板（当前 1 个在线会话）";
/** The `off` the panel answered: any answer means the row is gone. */
const DISCONNECTED = "已断开 omp-bot 面板";
/** The `off` whose unregister the client's own budget ended before an answer came. */
const PANEL_SILENT = "omp-bot 面板未响应";

/** The panels, adapters and run directories of the case at hand, all disposed together. */
const running: Array<{ dispose(): void | Promise<void> }> = [];
function track<T extends { dispose(): void | Promise<void> }>(value: T): T {
	running.push(value);
	return value;
}

/** The actual panel one case drives: a process of its own, on a port and config of its own. */
async function panelAt(): Promise<OmpBotPanel> {
	const panel = await startOmpBot();
	running.push({ dispose: () => panel.stop() });
	return panel;
}

/** The response-timing adapter one case sends through, in front of the panel it was given. */
function adapterAt(options: Parameters<typeof startResponseTimingAdapter>[0]): ResponseTimingAdapter {
	const adapter = startResponseTimingAdapter(options);
	running.push({ dispose: () => adapter.stop() });
	return adapter;
}

afterEach(async () => {
	for (const resource of running.splice(0)) await resource.dispose();
});

/** Whether one panel frame is the session view an `upsert` carries, for the session and state named. */
function upsertOf(frame: OmpBotFrame, sessionId: string, online: boolean): boolean {
	return frame.event === "upsert" && isUpsertData(frame.data) && frame.data.session.sessionId === sessionId && frame.data.session.online === online;
}

/** The session id one removal frame names, narrowed before anything is read from it. */
function removedSession(frame: OmpBotFrame): string | undefined {
	const data = frame.data;
	if (data === null || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string") {
		return undefined;
	}
	return data.sessionId;
}

/** The one request of a kind a probe run made, failing when it made none or more than one. */
function single(report: ProbeReport, kind: string) {
	const requests = report.sent.filter(request => request.kind === kind);
	expect(requests).toHaveLength(1);
	return requests[0];
}

describe("a server-processed unregister deletes the panel's row (P24)", () => {
	test("the panel removes the row the register built, instead of letting it go offline", async () => {
		const panel = await panelAt();
		const root = track(createRunRoot("panel-deletion", panel.endpoint, SHIPPED_BUDGET_MS));

		const report = await runProbe(root.configFile, "off");

		// The client's half: the disconnect is local first, and the panel answered the unregister that
		// followed it — which is what the operator's word reports and all it reports.
		expect(report.configuration.endpoint).toBe(panel.endpoint);
		expect(report.notifications).toEqual([CONNECTED, DISCONNECTED]);
		expect(report.notificationLevels).toEqual(["info", "info"]);
		const unregister = single(report, "unregister");
		expect(unregister?.outcome).toBe("answered");
		expect(unregister?.status).toBe(200);
		expect(unregister?.answerBody).toEqual({ outcome: "accepted" });
		expect(report.armed).toBe(false);

		// The panel's half, read off its own read side: the removal the unregister performed. A row that
		// had merely gone quiet would be republished as an offline view instead, so this frame is the
		// deletion itself rather than a word about it.
		await panel.waitFor(frame => frame.event === "remove", "the removal the unregister performed");
		const removed = panel.frames.filter(frame => frame.event === "remove");
		expect(removed.map(removedSession)).toEqual([OFF_SESSION]);

		// And the record is really gone, not marked: the row was never published as an offline view — a
		// connection that stopped beating and waited out the panel's window could not produce a removal
		// at all, and would have produced that view instead.
		expect(panel.frames.filter(frame => upsertOf(frame, OFF_SESSION, false))).toEqual([]);
		expect((await panel.snapshot()).map(view => view.sessionId)).toEqual([]);
	}, 60_000);
});

describe("an unregister that never arrives leaves the row to the panel's own window (P25)", () => {
	test("the blocked row stays registered and goes offline by the 30s window, never by deletion", async () => {
		const panel = await panelAt();
		// The unregister is dropped at the dependency: the panel behind it is never told, while the
		// register and the state report before it reach the panel as usual.
		const adapter = adapterAt({ target: panel.endpoint, hold: ["unregister"] });
		const root = track(createRunRoot("panel-blocked-unregister", adapter.endpoint, SHIPPED_BUDGET_MS));

		const registeredAt = performance.now();
		const report = await runProbe(root.configFile, "off");

		// The client's half: one attempt, out of budget, and the operator told exactly that much — the
		// panel's silence about the request, never a claim about the row.
		expect(report.notifications).toEqual([CONNECTED, PANEL_SILENT]);
		expect(report.notificationLevels).toEqual(["info", "error"]);
		const unregister = single(report, "unregister");
		expect(unregister?.outcome).toBe("timed-out");
		expect(report.armed).toBe(false);

		// The dependency's own record: the request really was received there and really was not passed
		// on — so "the unregister was not delivered" is established, not assumed.
		const attempts = adapter.receipts.filter(receipt => receipt.kind === "unregister");
		expect(attempts).toHaveLength(1);
		expect(attempts[0]?.forwarded).toBe(false);
		expect(adapter.receipts.filter(receipt => receipt.kind === "register").map(receipt => receipt.panelStatus)).toEqual([200]);

		// The panel's half, and the panel's own timing: the row is still registered, and the panel's scan
		// publishes it as offline once its 30s window has passed — bounded by the window plus one scan
		// cadence, and long past every number this extension sent.
		await panel.waitFor(
			frame => upsertOf(frame, OFF_SESSION, false),
			"the offline view the panel's own window produced",
			ONLINE_WINDOW_MS + EXPIRY_SCAN_MS + 20_000,
		);
		const retainedMs = performance.now() - registeredAt;
		expect(retainedMs).toBeGreaterThanOrEqual(ONLINE_WINDOW_MS - 1_000);
		expect(retainedMs).toBeLessThanOrEqual(ONLINE_WINDOW_MS + EXPIRY_SCAN_MS + 8_000);

		// The row survived the whole window: the panel never removed it, and a connection opened now
		// still finds it — offline, which is the panel's judgment, not its deletion.
		expect(panel.frames.filter(frame => frame.event === "remove")).toEqual([]);
		expect(await panel.snapshot()).toEqual([expect.objectContaining({ sessionId: OFF_SESSION, online: false })]);
	}, 120_000);
});

describe("a client's timeout is not a statement about the panel (P26)", () => {
	test("a response held back past the budget: the client timed out and the row is really gone", async () => {
		const panel = await panelAt();
		// The panel answers the unregister, and the adapter holds that answer back for several client
		// budgets — the request is received, processed and applied while its client is still waiting.
		const adapter = adapterAt({ target: panel.endpoint, releaseDelayMs: { unregister: RELEASE_DELAY_MS } });
		const root = track(createRunRoot("panel-processed-late", adapter.endpoint, TIGHT_BUDGET_MS));

		const report = await runProbe(root.configFile, "off");

		// The client's half, recorded where it happened: the request ran out of its budget, so its
		// outcome is a request that never completed and the operator reads the panel's silence.
		expect(report.configuration.requestTimeoutMs).toBe(TIGHT_BUDGET_MS);
		const unregister = single(report, "unregister");
		expect(unregister?.outcome).toBe("timed-out");
		expect(unregister?.status).toBeUndefined();
		expect(report.notifications).toEqual([CONNECTED, PANEL_SILENT]);
		expect(report.armed).toBe(false);

		// The dependency's half: the same request was forwarded, the panel answered it, and only then was
		// the answer held back. The panel's answer is the panel's own processing, recorded here by the
		// side that saw both ends of it.
		const held = await adapter.waitFor(
			receipt => receipt.kind === "unregister" && receipt.releasedAt !== undefined,
			"the unregister whose answer it held back",
			20_000,
		);
		const panelAnsweredAt = held.panelAnsweredAt;
		const releasedAt = held.releasedAt;
		expect(held.forwarded).toBe(true);
		expect(held.panelStatus).toBe(200);
		expect(panelAnsweredAt).toBeDefined();
		expect(releasedAt).toBeDefined();
		// Processed inside the client's own budget — and released after it, which is why the client's
		// timeout is not a statement that the panel did nothing.
		expect((panelAnsweredAt ?? Number.POSITIVE_INFINITY) - held.arrivedAt).toBeLessThan(TIGHT_BUDGET_MS);
		expect((releasedAt ?? 0) - held.arrivedAt).toBeGreaterThan(TIGHT_BUDGET_MS);
		expect(held.heldMs).toBe(RELEASE_DELAY_MS);

		// The panel's half: the row is gone, which its read side publishes as a removal and which a
		// connection opened now confirms — the deletion the client could not read from its own timeout.
		await panel.waitFor(frame => frame.event === "remove", "the removal the held-back answer belonged to");
		expect(panel.frames.filter(frame => frame.event === "remove").map(removedSession)).toEqual([OFF_SESSION]);
		expect((await panel.snapshot()).map(view => view.sessionId)).toEqual([]);

		// Nothing here claims the client could have learned any of it: no request it made after the
		// timeout asked the panel about the outcome, so the uncertainty the operator was told is the
		// whole of what the client knows.
		expect(report.sent.map(request => request.kind)).toEqual(["register", "state", "unregister"]);
	}, 60_000);
});
