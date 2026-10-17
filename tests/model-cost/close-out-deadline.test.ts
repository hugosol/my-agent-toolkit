/**
 * A disposed session's own commit is bounded by the close-out that owes it, and what the operator is
 * told is what really happened to the file (S1, S3; contract P30, P31; ticket 11).
 *
 * The seam is production: the extension's real definition bound through the framework's public binding
 * (the port double), the runtime `createModelCostRuntime` builds, its real consumption document under a
 * temporary storage root, and the notices the extension published on the delivery the disposal was
 * reported with. What the framework hands the close-out — the wait the edge carries — is used by the
 * extension's own save, and both ends are observed: the wait the save declares to the framework's
 * coordinated file update is the time left of the close-out rather than a fresh budget of its own, the
 * refusal that ends it at the deadline is reported as consumption that was not written, and the
 * document itself is read off the disk to show that nothing of it was.
 *
 * The document is really held while that happens: a writer of this process holds the lock with an
 * update whose own business has not concluded, so the close-out's save has a real wait to be given up
 * and no fake timer can stand in for it. Each case therefore declares a small close-out wait of its own
 * and states what it measured on the real clock rather than waiting out a default.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts, TurnSignal, TurnUsage } from "../../framework/core/protocol";
import { updateFile } from "../../framework/public";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

/** The self-made pricing data: one monetary provider with one tier, and no allowance channel. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: [],
	models: { official: { "model-alpha": { mode: "monetary", tier: "alpha" } } },
};

/** The harness bucket this extension's records are written under. */
const HARNESS = "probe-harness";

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The owner and the session these cases account and dispose. */
const OWNER: OwnerReference = { kind: "owner", key: "main:close-out" };
const MAIN: SessionFacts = { sessionId: "close-out-main", kind: "main", name: "收口主会话", unavailable: [] };

/** The usage the session's one settled request really reported. */
const USAGE: TurnUsage = { input: 1_000, cacheRead: 0, cacheWrite: 0, output: 1_000, totalTokens: 2_000 };

/** The instant this suite accounts everything at, written here rather than read from a wall clock. */
const T0 = Date.parse("2026-10-14T00:00:00.000Z");

/** The close-out wait these cases declare: real time, small enough to wait out. */
const CONTROLLED_MS = 300;

/** The temporary roots this suite made, removed once each case is over. */
const roots: string[] = [];

/** One temporary storage root, untouched by any other case. */
function isolatedRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-close-out-"));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * One document as the file really holds it, or nothing while the file holds no document.
 *
 * The records a case asserts on are read off the disk the run really wrote rather than from anything
 * the extension holds in memory: "what is in the file" is the evidence, and the file is the authority.
 */
function documentOf(file: string): { readonly document: ConsumptionDocument | undefined; readonly hasRecord: boolean } {
	let text: string | undefined;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		text = undefined;
	}
	const document = text === undefined ? undefined : (JSON.parse(text) as ConsumptionDocument);
	const records = document?.harnesses?.[HARNESS]?.sessions ?? [];
	return { document, hasRecord: records.some(record => record.id === MAIN.sessionId) };
}

/** One bound extension over its own storage root, with the session's Round open and consuming. */
async function boundSession(file: string): Promise<PortDouble> {
	const root = path.dirname(file);
	const double = portDouble();
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: () =>
			createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				now: () => T0,
			}).implementation,
	});
	double.deliverSession(OWNER, { session: MAIN, event: { kind: "session_start", reason: "initial" } });
	await double.initiateRun(OWNER);
	// One request of that session, settled with the usage it reported: the consumption its Round's own
	// end now owes the document.
	const started: TurnSignal = { kind: "request_started", session: MAIN, at: T0, provider: "official", model: "model-alpha" };
	const settled: TurnSignal = {
		kind: "response_settled",
		session: MAIN,
		at: T0 + 1_000,
		outcome: "completed",
		readings: [USAGE],
	};
	double.deliverTurn(started, { owner: OWNER });
	double.deliverTurn(settled, { owner: OWNER });
	double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
	return double;
}

describe("a disposed session's commit spends what is left of its close-out (P30, P31)", () => {
	test("a wait the close-out gave up is reported as consumption that was not written, and the document holds none of it", async () => {
		const root = isolatedRoot();
		const file = path.join(root, CONSUMPTION_FILE);
		// Another writer of this process really holds the document, with an update of its own that has
		// not concluded: the session's save can only wait its turn, and that wait is the close-out's.
		const holderRelease = Promise.withResolvers<void>();
		const holderInside = Promise.withResolvers<void>();
		const holding = updateFile(
			file,
			async () => {
				holderInside.resolve();
				await holderRelease.promise;
				return { held: "the writer that owns the lock" };
			},
			{ timeoutMs: 5_000 },
		);
		await holderInside.promise;

		const double = await boundSession(file);
		const startedAt = performance.now();
		const disposal = await double.deliverDisposal(OWNER, { session: MAIN, closeOutWaitMs: CONTROLLED_MS });
		const heldFor = performance.now() - startedAt;

		// The wait the extension declared to the framework's coordinated update was what the close-out
		// had left — not the fifteen seconds such a save takes when nothing bounds it — so the save was
		// refused at the close-out's own deadline rather than long after the host had been answered.
		expect(heldFor).toBeGreaterThanOrEqual(CONTROLLED_MS - 50);
		expect(heldFor).toBeLessThan(CONTROLLED_MS + 300);
		// What the operator is told: that consumption was not written, that the close-out's wait is what
		// ended it, and that what was accumulated is dropped. No notice claims it was saved.
		const notices = disposal.feedback.map(notice => notice.message).join("\n");
		expect(notices).toContain("没有写入");
		expect(notices).toContain("timeout");
		expect(notices).toContain(`${CONTROLLED_MS}ms`);
		expect(notices).toContain("未保存的消费已丢弃");
		expect(notices).not.toMatch(/已保存|保存成功|写入成功/);
		// The framework needed to state nothing of its own: this close-out's work concluded where its
		// wait was given up, so the outcome is not an unconfirmed one.
		expect(double.diagnostics).toEqual([]);
		// And the document proves it: nothing of that session reached the file, which holds no document
		// at all — the record this save would have written is not there, and the writer that really owns
		// the lock has published nothing yet either.
		// Read as what the file really holds rather than as a consumption document: the point is that
		// nothing this extension's schema could read is there.
		const after = documentOf(file);
		expect(after.document as unknown).toBeUndefined();
		expect(after.hasRecord).toBe(false);

		// The writer that held the document is untouched by that: its lock was never released for it, and
		// the document it publishes is what the file then holds.
		holderRelease.resolve();
		expect(await holding).toEqual({ held: "the writer that owns the lock" });
		expect(documentOf(file).document as unknown).toEqual({ held: "the writer that owns the lock" });
	});

	test("a close-out whose commit concludes writes the record, and neither a notice nor a deadline statement is published", async () => {
		const root = isolatedRoot();
		const file = path.join(root, CONSUMPTION_FILE);
		const double = await boundSession(file);

		const startedAt = performance.now();
		const disposal = await double.deliverDisposal(OWNER, { session: MAIN, closeOutWaitMs: CONTROLLED_MS * 10 });
		const heldFor = performance.now() - startedAt;

		// The commit landed well inside the wait it was given, so the host was answered with it: nothing
		// waited for the deadline, and nothing was stated as unconfirmed.
		expect(heldFor).toBeLessThan(CONTROLLED_MS);
		expect(double.diagnostics).toEqual([]);
		expect(disposal.feedback).toEqual([]);
		// The record is the one the session's own usage makes, at the off-peak tier this instant is in:
		// 1,000 input at 2 and 1,000 output at 8 per million is 0.01, written by the run itself.
		const after = documentOf(file);
		expect(after.hasRecord).toBe(true);
		expect(after.document?.harnesses[HARNESS]?.sessions[0]?.own).toEqual({
			official: { "model-alpha": { tokens: { input: 1_000, cacheRead: 0, cacheWrite: 0, output: 1_000 }, costCny: 0.01 } },
		});
	});
});
