/**
 * The consumption store: loading a baseline, committing one session's snapshot, and what an
 * unusable baseline means for the instance (P45, P47; S2/S4).
 *
 * The seam is the extension's own store, driven over real files in a temporary root — never a
 * memory double of the framework's file module, because the coordination this store depends on is
 * exactly what such a double would replace. Every document a case reads or expects is written out
 * in full here, from the storage contract, rather than produced by the code under test, and every
 * root this file uses is a fresh temporary directory that is removed afterwards. No case resolves
 * a storage root, and none touches a real user directory.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ConsumptionDocument, SessionRecord } from "../../extensions/model-cost/shared-logic/consumption-document";
import { ConsumptionStore } from "../../extensions/model-cost/shared-logic/consumption-store";

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** The fixed file name inside the root: the store's whole file organization for this document. */
const CONSUMPTION_FILE = "consumption.json";

/** A fresh temporary storage root, with nothing in it. */
function freshRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-store-"));
	roots.push(root);
	return root;
}

/** The record a case commits, as the approved schema writes one. */
const MAIN_SESSION: SessionRecord = {
	id: "session-main",
	name: "主会话",
	parent: null,
	saveVersion: 1,
	own: {
		deepseek: {
			"model-A": { tokens: { input: 1000, cacheRead: 500, cacheWrite: 0, output: 200 }, costCny: 0.01 },
		},
	},
};

/** The same session one snapshot later: the content a coordinated save really publishes. */
const MAIN_SESSION_GROWN: SessionRecord = {
	...MAIN_SESSION,
	saveVersion: 2,
	name: "主会话（改）",
	own: {
		deepseek: {
			"model-A": { tokens: { input: 1500, cacheRead: 500, cacheWrite: 0, output: 400 }, costCny: 0.02 },
		},
	},
};

/** A subagent's record, whose direct parent is the session above. */
const CHILD_SESSION: SessionRecord = {
	id: "session-child",
	name: "资料核对",
	parent: "session-main",
	saveVersion: 1,
	own: {
		deepseek: {
			"model-A": { tokens: { input: 600, cacheRead: 0, cacheWrite: 0, output: 100 }, costCny: 0.005 },
		},
	},
};

/** A second session that belongs to another terminal: nothing this file commits may disturb it. */
const OTHER_SESSION: SessionRecord = {
	id: "session-other",
	name: "另一个终端",
	parent: null,
	saveVersion: 7,
	own: {
		"openai-codex": {
			"model-B": { tokens: { input: 2000, cacheRead: 1000, cacheWrite: 0, output: 300 }, referenceCostUsd: 0.02 },
		},
	},
};

/** A complete document of the approved schema, as a file on disk would hold it. */
function document(sessions: readonly SessionRecord[], periodId = "period-one"): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId,
		start: "2026-10-01T00:00:00.000Z",
		start_bal: 42.5,
		holiday: false,
		harnesses: { omp: { sessions } },
	};
}

/** One root holding one document at the fixed file name. */
function seededRoot(contents: string): string {
	const root = freshRoot();
	mkdirSync(root, { recursive: true });
	writeFileSync(path.join(root, CONSUMPTION_FILE), contents, "utf8");
	return root;
}

/** The text of one root's consumption file, or `undefined` when the root holds none. */
function fileText(root: string): string | undefined {
	const file = path.join(root, CONSUMPTION_FILE);
	return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

/** The document one root's consumption file holds, as it was written. */
function fileDocument(root: string): unknown {
	return JSON.parse(fileText(root) as string);
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the consumption store", () => {
	test("a root with no document starts a fresh period and writes nothing", async () => {
		const root = freshRoot();
		const store = new ConsumptionStore(root);
		expect((await store.load()).kind).toBe("fresh");
		// A fresh period is a real period: an identity, an ISO start and no holiday, with no
		// session and no boundary balance invented for it.
		expect(store.period()?.periodId.length).toBeGreaterThan(0);
		expect(Number.isNaN(Date.parse(store.period()?.start ?? ""))).toBe(false);
		expect(store.period()?.holiday).toBe(false);
		expect(store.period()?.startBal).toBeUndefined();
		expect(store.sessions("omp")).toEqual([]);
		expect(store.pauseReason()).toBeUndefined();
		// Reading is not writing: nothing is saved until a session really has consumption.
		expect(fileText(root)).toBeUndefined();
	});

	test("a committed snapshot is read back by a later instance, parent included", async () => {
		const root = freshRoot();
		const first = new ConsumptionStore(root);
		expect((await first.load()).kind).toBe("fresh");
		expect(await first.commit("omp", MAIN_SESSION)).toEqual({ kind: "saved" });
		// A child is saved before its parent ever was: nothing demands the parent first.
		expect(await first.commit("omp", CHILD_SESSION)).toEqual({ kind: "saved" });
		expect(first.consumptionFile).toBe(path.join(root, CONSUMPTION_FILE));

		const second = new ConsumptionStore(root);
		expect((await second.load()).kind).toBe("loaded");
		expect(second.period()).toEqual(first.period());
		expect(second.sessions("omp")).toEqual([MAIN_SESSION, CHILD_SESSION]);
		expect(second.session("omp", "session-child")?.parent).toBe("session-main");
		expect(second.session("omp", "session-main")?.parent).toBeNull();
	});

	test("committing one session leaves every other record exactly as it was", async () => {
		const root = seededRoot(JSON.stringify(document([OTHER_SESSION, MAIN_SESSION])));
		const store = new ConsumptionStore(root);
		expect((await store.load()).kind).toBe("loaded");
		expect(await store.commit("omp", MAIN_SESSION_GROWN)).toEqual({ kind: "saved" });
		expect(fileDocument(root)).toEqual(document([OTHER_SESSION, MAIN_SESSION_GROWN]));
		expect(store.sessions("omp")).toEqual([OTHER_SESSION, MAIN_SESSION_GROWN]);
	});

	test("committing the same snapshot again is idempotent", async () => {
		const root = seededRoot(JSON.stringify(document([MAIN_SESSION])));
		const store = new ConsumptionStore(root);
		await store.load();
		expect(await store.commit("omp", MAIN_SESSION_GROWN)).toEqual({ kind: "saved" });
		const afterSave = fileDocument(root);
		expect(await store.commit("omp", MAIN_SESSION_GROWN)).toEqual({ kind: "unchanged" });
		// The same business content again: the same document, one record, no second contribution.
		expect(fileDocument(root)).toEqual(afterSave);
		expect(store.sessions("omp")).toEqual([MAIN_SESSION_GROWN]);
	});

	test("a snapshot of the same version with other content is a conflict, and the disk wins", async () => {
		const conflicted: SessionRecord = { ...MAIN_SESSION_GROWN, name: "另一个名字" };
		const root = seededRoot(JSON.stringify(document([MAIN_SESSION])));
		const store = new ConsumptionStore(root);
		await store.load();
		expect(await store.commit("omp", MAIN_SESSION_GROWN)).toEqual({ kind: "saved" });
		const saved = fileDocument(root);
		expect(await store.commit("omp", conflicted)).toEqual({ kind: "conflict" });
		// Nothing was added, nothing was taken as the maximum, and the disk's record is still there.
		expect(fileDocument(root)).toEqual(saved);
		expect(store.session("omp", MAIN_SESSION.id)).toEqual(MAIN_SESSION_GROWN);
	});

	test("a refused snapshot leaves the document the file holds as the instance's own baseline", async () => {
		const root = seededRoot(JSON.stringify(document([MAIN_SESSION])));
		const store = new ConsumptionStore(root);
		await store.load();
		// Another writer publishes a record of that session at the same version with other content
		// while this instance runs: the refusal is decided against the file, so the file's document is
		// what this instance holds now — version base included, or its next snapshot would be refused
		// against the same record again.
		writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(document([MAIN_SESSION_GROWN])), "utf8");
		expect(await store.commit("omp", { ...MAIN_SESSION_GROWN, name: "另一个名字" })).toEqual({ kind: "conflict" });
		expect(store.session("omp", MAIN_SESSION.id)).toEqual(MAIN_SESSION_GROWN);
		expect(store.sessions("omp")).toEqual([MAIN_SESSION_GROWN]);
	});

	test("a period another CLI reset becomes the instance's period, so the replaced period is not rebound", async () => {
		const root = seededRoot(JSON.stringify(document([MAIN_SESSION], "period-one")));
		const store = new ConsumptionStore(root);
		await store.load();
		// The reset another CLI committed replaces the whole period: the snapshot of the replaced one is
		// refused, and the new period's document — not the one this instance loaded — is its baseline.
		writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(document([OTHER_SESSION], "period-two")), "utf8");
		expect(await store.commit("omp", { ...MAIN_SESSION, saveVersion: 2 })).toEqual({ kind: "stale-period" });
		expect(store.period()?.periodId).toBe("period-two");
		expect(store.session("omp", MAIN_SESSION.id)).toBeUndefined();
		expect(store.session("omp", OTHER_SESSION.id)).toEqual(OTHER_SESSION);
	});

	test("a snapshot with an older save version is refused", async () => {
		const root = seededRoot(JSON.stringify(document([{ ...MAIN_SESSION, saveVersion: 5 }])));
		const store = new ConsumptionStore(root);
		await store.load();
		const before = fileText(root);
		expect(await store.commit("omp", { ...MAIN_SESSION, saveVersion: 4 })).toEqual({ kind: "stale-version" });
		expect(fileText(root)).toBe(before);
	});

	test("a snapshot belonging to another period is refused and never rebound", async () => {
		const root = seededRoot(JSON.stringify(document([MAIN_SESSION], "period-one")));
		const store = new ConsumptionStore(root);
		expect((await store.load()).kind).toBe("loaded");
		// Another CLI resets the store: the file now belongs to a new period.
		writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(document([OTHER_SESSION], "period-two")), "utf8");
		const reset = fileText(root);
		expect(await store.commit("omp", { ...MAIN_SESSION, saveVersion: 2 })).toEqual({ kind: "stale-period" });
		expect(fileText(root)).toBe(reset);
	});

	test("a document that is not JSON pauses the instance and is never overwritten", async () => {
		const broken = "{ this is not a document";
		const root = seededRoot(broken);
		const store = new ConsumptionStore(root);
		expect((await store.load()).kind).toBe("unusable");
		expect(store.pauseReason()).toBeDefined();
		expect(store.period()).toBeUndefined();
		expect(await store.commit("omp", MAIN_SESSION)).toEqual({ kind: "paused" });
		// The instance paused instead of guessing a zero: the file is the same bytes it was, and
		// nothing else was left behind in the root.
		expect(fileText(root)).toBe(broken);
		expect(readdirSync(root)).toEqual([CONSUMPTION_FILE]);
	});

	test("a document of another format version pauses the instance and is never overwritten", async () => {
		const other = JSON.stringify({ ...document([MAIN_SESSION]), schemaVersion: 2 });
		const root = seededRoot(other);
		const store = new ConsumptionStore(root);
		const outcome = await store.load();
		expect(outcome.kind).toBe("unusable");
		if (outcome.kind !== "unusable") return;
		expect(outcome.reason).toContain("schemaVersion");
		expect(await store.commit("omp", MAIN_SESSION)).toEqual({ kind: "paused" });
		expect(fileText(root)).toBe(other);
	});

	test("the next normal initialization loads again, once the document is usable", async () => {
		const root = seededRoot(JSON.stringify({ ...document([MAIN_SESSION]), schemaVersion: 2 }));
		const store = new ConsumptionStore(root);
		expect((await store.load()).kind).toBe("unusable");
		// The operator fixes the file (here by writing the approved schema back), and the next
		// normal initialization is what reads it: no probe and no automatic write happened before.
		writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(document([MAIN_SESSION])), "utf8");
		expect((await store.load()).kind).toBe("loaded");
		expect(store.pauseReason()).toBeUndefined();
		expect(store.sessions("omp")).toEqual([MAIN_SESSION]);
		expect(await store.commit("omp", MAIN_SESSION_GROWN)).toEqual({ kind: "saved" });
	});

	test("a commit before any load is a misuse, not a data condition", async () => {
		const root = freshRoot();
		const store = new ConsumptionStore(root);
		// Nothing has been loaded, so the instance has no period to stamp a snapshot with: a caller
		// that saves before its initialization is a programming error rather than a refusal value,
		// and it wrote nothing on its way out.
		const failure = store
			.commit("omp", MAIN_SESSION)
			.then(() => "resolved", (error: unknown) => (error instanceof Error ? error.message : String(error)));
		await expect(failure).resolves.toContain("before the store loaded a baseline");
		expect(fileText(root)).toBeUndefined();
	});

	test("concurrent commits of one document serialize, and no session's record is lost", async () => {
		const root = freshRoot();
		const first = new ConsumptionStore(root);
		await first.load();
		const batch: readonly SessionRecord[] = [
			MAIN_SESSION,
			...Array.from({ length: 7 }, (_unused, index) => ({
				...MAIN_SESSION,
				id: `session-${String(index + 1)}`,
				name: `会话 ${String(index + 1)}`,
				parent: "session-main",
			})),
		];
		expect(await first.commit("omp", batch[0] as SessionRecord)).toEqual({ kind: "saved" });
		// Seven instances of their own — each with its own loaded baseline — commit at once.
		const others = await Promise.all(
			batch.slice(1).map(async () => {
				const store = new ConsumptionStore(root);
				await store.load();
				return store;
			}),
		);
		const outcomes = await Promise.all(
			others.map((store, index) => store.commit("omp", batch[index + 1] as SessionRecord)),
		);
		expect(outcomes).toEqual(batch.slice(1).map(() => ({ kind: "saved" })));
		const written = fileDocument(root) as ConsumptionDocument;
		expect(written.harnesses.omp?.sessions.map(session => session.id)).toEqual(batch.map(session => session.id));
		expect(written.harnesses.omp?.sessions[3]).toEqual(batch[3] as SessionRecord);
	});
});
