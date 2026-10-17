/**
 * A session's close-out is bounded, and what it states about its own work is what really happened
 * (S1, S3; contract P30, P31, P32; ticket 11).
 *
 * The seam is `bindExtension` plus the port a harness provides, driven by the shared port double: the
 * host's awaited disposal position, the wait the framework gives the close-out, the edge that carries
 * it, and the handler an assembly injected for that edge. What the framework owes there is observed
 * directly — a close-out enters its wait where the host reports the disposal, the edge states what is
 * left of that wait so work that had already spent part of it is not handed a fresh budget, the host is
 * answered at the deadline and not before it, and what is stated about work that had not concluded is
 * that its outcome is unconfirmed rather than cancelled, unwritten or successful.
 *
 * The wait itself is driven on the platform's fake clock, so the deadline, its boundary and what is
 * left of the budget are read exactly rather than waited out. The two cases the deadline tells apart
 * are then driven over the framework's real coordination: a wait that can be given up is a real
 * `timeout` on a lock another writer really holds, and "the update had really begun" is a real lock
 * really held while a document is being replaced. Those cases run on the real clock, because the
 * coordination they exercise is a real file system's — no fake timer stands in for another process's
 * lock — and each declares a small budget of its own rather than waiting out a default.
 *
 * Which native fact becomes a disposal — and so which host position the close-out is reported from — is
 * the adapter's mapping, observed at the pi seam in `pi-disposal-round-close.test.ts`; what the real
 * extension does with the wait is observed in `tests/model-cost`.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { CloseOutWait, OwnerReference, RoundDelivery } from "../../framework/core/protocol";
import { SafeFileUpdateError, type ExtensionDefinition, defineExtension, updateFile } from "../../framework/public";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** The owner a delivery acts on unless one is named. */
const OWNER: OwnerReference = { kind: "owner", key: "main:close-out" };

/** The actual session a disposal from this suite is about unless one is named. */
const SESSION = { sessionId: "close-out-session", kind: "sub" as const, unavailable: [] };

/** The framework's own close-out ceiling, as the contract states the default: fifteen seconds. */
const DEFAULT_CLOSE_OUT_MS = 15_000;

/** The budget the real-clock cases declare, small enough to wait out and long enough to be real. */
const CONTROLLED_MS = 250;

/** The temporary roots this suite made, removed once each case is over. */
const roots: string[] = [];

/** One temporary local root, untouched by any other case. */
function isolatedRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), "framework-close-out-"));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	vi.useRealTimers();
});

/** A definition that declares nothing of its own: every behavior under test is injected. */
function probeDefinition(id: string): ExtensionDefinition {
	return defineExtension({ id, displayName: id });
}

/** One binding of the round axis, its recorded ends, and the double it was bound to. */
interface RoundObserver {
	readonly double: PortDouble;
	readonly ends: readonly RoundDelivery[];
}

/** Binds a definition that subscribes the round axis and records every end it is delivered. */
function bindRoundObserver(id: string, handler?: (delivery: RoundDelivery) => void | Promise<void>): RoundObserver {
	const double = portDouble();
	const ends: RoundDelivery[] = [];
	double.bind(probeDefinition(id), {
		subscriptions: [
			{
				scope: "session",
				events: {
					round_start: () => {},
					round_end: async delivery => {
						ends.push(delivery);
						await handler?.(delivery);
					},
				},
			},
		],
	});
	return { double, ends };
}

/** An end a session stated and the re-check could not confirm: the candidate a disposal confirms. */
function unconfirmedSettle(double: PortDouble): void {
	double.deliverRound(OWNER, { event: { kind: "round_start" }, session: SESSION });
	double.deliverRound(OWNER, { event: { kind: "round_end" }, session: SESSION, quiescent: false });
}

/** Lets every already-settled promise of this turn run, so a state is read after its own microtasks. */
async function settled(): Promise<void> {
	for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

/** The one round end this double's binding was delivered, or a failure naming what it saw instead. */
function onlyEnd(observer: RoundObserver): RoundDelivery {
	expect(observer.ends).toHaveLength(1);
	const end = observer.ends[0];
	if (end === undefined) throw new Error("the round end this case is about was never delivered");
	return end;
}

/** The wait one end carries, or a failure naming that it carried none. */
function waitOf(end: RoundDelivery): CloseOutWait {
	const closeOut = end.closeOut;
	if (closeOut === undefined) throw new Error("this end carried no close-out wait");
	return closeOut;
}

describe("the close-out wait a disposal is given (P30)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	test("the edge a disposal dispatches carries the host's own wait, and an ordinary edge carries none", async () => {
		const observer = bindRoundObserver("close-out-wait-probe");
		// An end the facts alone produced: the host is at no exit position, so there is no wait for this
		// edge to bound and nothing borrows a budget from a position nobody is waiting at.
		observer.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: SESSION });
		observer.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: SESSION, quiescent: true });
		// A round left open with no end stated is the other kind of edge, and it is the close-out's.
		observer.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: SESSION });

		const enteredAt = performance.now();
		await observer.double.deliverDisposal(OWNER, { session: SESSION, closeOutWaitMs: 400 });

		expect(observer.ends).toHaveLength(2);
		expect(observer.ends[0]?.closeOut).toBeUndefined();
		const closeOut = waitOf(observer.ends[1]!);
		// The budget is the host's own, and the deadline is counted from entering the close-out.
		expect(closeOut.budgetMs).toBe(400);
		expect(closeOut.deadline).toBe(enteredAt + 400);
		// The work this edge owes is offered what is left of the budget — never the whole of it, because a
		// wait it is given has to be able to end *inside* the close-out rather than after it — and what it
		// is offered falls with the clock, one millisecond at a time.
		const offered = closeOut.remaining();
		expect(offered).toBeGreaterThan(400 - 50);
		expect(offered).toBeLessThan(400);
		vi.advanceTimersByTime(100);
		expect(closeOut.remaining()).toBe(offered - 100);
		vi.advanceTimersByTime(offered);
		expect(closeOut.remaining()).toBe(0);
		// And it stays there: a wait offered nothing attempts its commit at once rather than at a moment
		// that has already passed.
		vi.advanceTimersByTime(1_000);
		expect(closeOut.remaining()).toBe(0);
	});

	test("the host's own wait tightens the framework's default and never lengthens it", async () => {
		const stated = bindRoundObserver("close-out-shorter-probe");
		stated.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: SESSION });
		await stated.double.deliverDisposal(OWNER, { session: SESSION, closeOutWaitMs: CONTROLLED_MS });
		expect(waitOf(onlyEnd(stated)).budgetMs).toBe(CONTROLLED_MS);

		// A host that states a wait longer than the framework's own is not given one: the default is the
		// ceiling this framework promises, and a close-out that outlived it would be a wait nobody promised.
		const longer = bindRoundObserver("close-out-longer-probe");
		longer.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: SESSION });
		await longer.double.deliverDisposal(OWNER, { session: SESSION, closeOutWaitMs: DEFAULT_CLOSE_OUT_MS * 4 });
		expect(waitOf(onlyEnd(longer)).budgetMs).toBe(DEFAULT_CLOSE_OUT_MS);

		// A host that states none — every adapter of this release — gets that same default.
		const unstated = bindRoundObserver("close-out-default-probe");
		unstated.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: SESSION });
		await unstated.double.deliverDisposal(OWNER, { session: SESSION });
		expect(waitOf(onlyEnd(unstated)).budgetMs).toBe(DEFAULT_CLOSE_OUT_MS);
	});
});

describe("the host's position is held only as long as the close-out really needs (P30)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	test("a close-out that concluded answers with its work, leaves no wait of its own behind and states nothing", async () => {
		const begun = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const observer = bindRoundObserver("close-out-concluded-probe", async () => {
			begun.resolve();
			await release.promise;
		});
		unconfirmedSettle(observer.double);

		let answered = false;
		const answering = observer.double
			.deliverDisposal(OWNER, { session: SESSION, closeOutWaitMs: DEFAULT_CLOSE_OUT_MS })
			.then(() => {
				answered = true;
			});
		await begun.promise;
		await settled();
		// The host is held while the work its close-out owes really runs — and no longer than that.
		expect(answered).toBe(false);

		release.resolve();
		await answering;
		expect(answered).toBe(true);
		// The answer followed the work rather than the budget, and the timer that bounded the wait is
		// gone: nothing of this close-out is left armed to delay what comes next.
		expect(vi.getTimerCount()).toBe(0);
		expect(observer.double.diagnostics).toEqual([]);
	});

	test("a close-out whose work has not concluded is answered at its deadline, and its outcome says unconfirmed", async () => {
		const release = Promise.withResolvers<void>();
		let began = false;
		const observer = bindRoundObserver("close-out-deadline-probe", async () => {
			began = true;
			await release.promise;
		});
		unconfirmedSettle(observer.double);

		let answered = false;
		const answering = observer.double
			.deliverDisposal(OWNER, { session: SESSION, closeOutWaitMs: CONTROLLED_MS })
			.then(() => {
				answered = true;
			});
		await settled();
		// The edge reached its handler exactly once, and the host is still held: the work has begun and
		// nothing has stated an outcome for it.
		expect({ began, answered, ends: observer.ends.length }).toEqual({ began: true, answered: false, ends: 1 });

		// One millisecond before the deadline the framework is still waiting for that work...
		vi.advanceTimersByTime(CONTROLLED_MS - 1);
		await settled();
		expect(answered).toBe(false);

		// ...and at the deadline itself it answers, whether or not the work concluded.
		vi.advanceTimersByTime(1);
		await answering;
		expect(answered).toBe(true);
		// Nothing repeats after the deadline: one edge, no retry, and no timer of the close-out's own
		// left behind. The work that had begun is not waited for any further here.
		expect(observer.ends).toHaveLength(1);
		expect(vi.getTimerCount()).toBe(0);

		// What is stated about work that had not concluded is that its outcome is unconfirmed: not a
		// cancellation, not a document that was not written, and not a save. The document on disk is the
		// authority, and this says so rather than claiming one.
		const diagnostic = observer.double.diagnostics.join("\n");
		expect(diagnostic).toContain("close-out-deadline-probe");
		expect(diagnostic).toContain(SESSION.sessionId);
		expect(diagnostic).toContain(`${CONTROLLED_MS}ms budget`);
		expect(diagnostic).toContain("unconfirmed");
		expect(diagnostic).toContain("remains the authority");

		release.resolve();
	});
});

describe("the deadline over the framework's real coordination (P30, P31)", () => {
	/**
	 * These two cases run on the real clock: what they exercise is real file coordination — a lock
	 * another writer really holds, and a document really being replaced — so no fake timer stands in for
	 * it. Each declares a small budget rather than waiting out a default, and states what it measured.
	 */
	beforeEach(() => {
		vi.useRealTimers();
	});

	test("a wait that can be given up is given up at the deadline, and the document proves nothing was written", async () => {
		const root = isolatedRoot();
		const target = path.join(root, "consumption.json");
		writeFileSync(target, JSON.stringify({ held: "earlier writer" }), "utf8");
		// The document is really being updated by another writer of this process, whose own update has
		// not returned: the close-out's work can only wait its turn, and that wait is the one the
		// deadline gives up.
		const holderRelease = Promise.withResolvers<void>();
		const holderInside = Promise.withResolvers<void>();
		const holding = updateFile(
			target,
			async () => {
				// Read inside the coordinated scope: the holder really holds the lock from here on.
				holderInside.resolve();
				await holderRelease.promise;
				return { held: "holder" };
			},
			{ timeoutMs: 5_000 },
		);
		// The holder really holds the lock before the close-out begins: its own update is running.
		await holderInside.promise;

		const observed = Promise.withResolvers<{ readonly kind: string; readonly elapsed: number }>();
		const observer = bindRoundObserver("close-out-given-up-probe", async delivery => {
			const startedAt = performance.now();
			try {
				// What a session's own save does with the wait it was handed: it bounds its coordination
				// by what is left of the close-out rather than taking a budget of its own.
				await updateFile(target, () => ({ saved: "close-out" }), { timeoutMs: waitOf(delivery).remaining() });
				observed.resolve({ kind: "saved", elapsed: performance.now() - startedAt });
			} catch (error) {
				observed.resolve({
					kind: error instanceof SafeFileUpdateError ? error.kind : `other:${String(error)}`,
					elapsed: performance.now() - startedAt,
				});
			}
		});
		unconfirmedSettle(observer.double);

		const startedAt = performance.now();
		await observer.double.deliverDisposal(OWNER, { session: SESSION, closeOutWaitMs: CONTROLLED_MS });
		const heldFor = performance.now() - startedAt;
		const outcome = await observed.promise;

		// The wait was given up because the close-out ended it: what it declared was what the close-out had
		// left to offer, and it ended there rather than after the host had been answered.
		expect(outcome.kind).toBe("timeout");
		expect(outcome.elapsed).toBeGreaterThanOrEqual(CONTROLLED_MS - 50);
		expect(outcome.elapsed).toBeLessThan(CONTROLLED_MS);
		// The host was held for the work it owed and not a moment past it: the refusal that is the work's
		// own conclusion lands a resolution before the close-out's deadline by construction, so the
		// answer comes with it and never after the budget. The tolerances are this platform's own
		// scheduling of a real wait, measured rather than assumed.
		expect(heldFor).toBeGreaterThanOrEqual(CONTROLLED_MS - 50);
		expect(heldFor).toBeLessThan(CONTROLLED_MS + 250);
		// Nothing was written by it: the document still holds what the writer that really owns the lock
		// has to publish, and no close-out diagnostic was needed — this work concluded on its own.
		expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ held: "earlier writer" });
		expect(observer.double.diagnostics).toEqual([]);

		holderRelease.resolve();
		expect(await holding).toEqual({ held: "holder" });
	});

	test("an update that had already begun is not cancelled by the deadline, and its own published document stays the authority", async () => {
		const root = isolatedRoot();
		const target = path.join(root, "consumption.json");
		writeFileSync(target, JSON.stringify({ version: 1 }), "utf8");
		// An update that really began — the lock is held and the document is being replaced — and whose
		// own business has not concluded: this is the case the deadline cannot take back.
		const updateRelease = Promise.withResolvers<void>();
		const begun = Promise.withResolvers<number>();
		const published = Promise.withResolvers<void>();
		const observer = bindRoundObserver("close-out-begun-probe", async delivery => {
			await updateFile(target, async () => {
				// Read inside the coordinated scope: the lock is held and the document has been read, so
				// this is the instant the update has really begun.
				begun.resolve(performance.now());
				await updateRelease.promise;
				return { version: 2 };
			}).finally(() => published.resolve());
		});
		unconfirmedSettle(observer.double);

		const startedAt = performance.now();
		await observer.double.deliverDisposal(OWNER, { session: SESSION, closeOutWaitMs: CONTROLLED_MS });
		const heldFor = performance.now() - startedAt;
		const beganAt = await begun.promise;

		// The update had really begun before the deadline — the ground this case stands on — and the host
		// was answered at the deadline while that update was still publishing. What is stated about it is
		// that its outcome is unconfirmed: the framework does not claim it stopped.
		expect(beganAt - startedAt).toBeLessThan(CONTROLLED_MS);
		expect(heldFor).toBeLessThan(CONTROLLED_MS + 250);
		expect(observer.double.diagnostics.join("\n")).toContain("unconfirmed");
		// Nothing of it is on disk yet, because its own business has not concluded — and nothing else has
		// written either.
		expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ version: 1 });

		// The lock that update holds is not released for it: another writer of this process still cannot
		// take the document, which is what "the deadline stops the waiting, not the work" means here.
		const competing = await updateFile(target, () => ({ version: 3 }), { timeoutMs: 150 }).then(
			() => "taken",
			error => (error instanceof SafeFileUpdateError ? error.kind : String(error)),
		);
		expect(competing).toBe("timeout");

		// And when that update really concludes, the document it publishes is what the file holds: the
		// write was never stopped, and the complete published document is the authority over any
		// statement the framework could have made about the outcome.
		updateRelease.resolve();
		await published.promise;
		expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ version: 2 });
	});
});
