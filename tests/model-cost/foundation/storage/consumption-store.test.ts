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
import type { ConsumptionDocument, SessionRecord } from "../../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import { ConsumptionStore } from "../../../../extensions/model-cost/shared-logic/foundation/storage/consumption-store";

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

/**
 * A complete document one bucket per named harness, which is what two harnesses sharing the root
 * write: each harness's own sessions under its own key, in the order the file keeps them.
 */
function sharedDocument(
	buckets: Readonly<Record<string, readonly SessionRecord[]>>,
	periodId = "period-one",
): ConsumptionDocument {
	const harnesses: Record<string, { sessions: readonly SessionRecord[] }> = {};
	for (const [harness, sessions] of Object.entries(buckets)) harnesses[harness] = { sessions };
	return {
		schemaVersion: 1,
		periodId,
		start: "2026-10-01T00:00:00.000Z",
		start_bal: 42.5,
		holiday: false,
		harnesses,
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

	test("two instances that both loaded an empty root share the period the first write creates", async () => {
		const root = freshRoot();
		const first = new ConsumptionStore(root);
		const second = new ConsumptionStore(root);
		// Both start before either has written: the root holds no document, so both load a fresh
		// period — and it is the same period, because an empty root holds one generation rather than
		// one per instance that happens to look at it.
		expect((await first.load()).kind).toBe("fresh");
		expect((await second.load()).kind).toBe("fresh");
		expect(first.period()?.periodId).toBe(second.period()?.periodId);

		// The first instance's snapshot creates the document. The second instance accumulated in the
		// same (still unwritten) period, so its snapshot must land in that document rather than being
		// refused as a period a reset replaced — nothing was replaced and nothing was ever reset.
		expect(await first.commit("omp", MAIN_SESSION)).toEqual({ kind: "saved" });
		expect(await second.commit("omp", CHILD_SESSION)).toEqual({ kind: "saved" });
		expect(second.period()?.periodId).toBe(first.period()?.periodId);
		expect(fileDocument(root)).toEqual({
			schemaVersion: 1,
			periodId: first.period()?.periodId,
			start: first.period()?.start,
			holiday: false,
			harnesses: { omp: { sessions: [MAIN_SESSION, CHILD_SESSION] } },
		});
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

	test("a target no document can be read from pauses the initializing instance and is left alone", async () => {
		const root = freshRoot();
		mkdirSync(root, { recursive: true });
		// The name holds something a document cannot be read from: an initialization meets the same
		// answer a save does, and neither guesses nor repairs.
		mkdirSync(path.join(root, CONSUMPTION_FILE));

		const store = new ConsumptionStore(root);
		const outcome = await store.load();
		expect(outcome.kind).toBe("unusable");
		if (outcome.kind !== "unusable") return;
		expect(outcome.reason).toContain("无法读取");
		expect(store.pauseReason()).toBeDefined();
		expect(store.period()).toBeUndefined();
		expect(await store.commit("omp", MAIN_SESSION)).toEqual({ kind: "paused" });
		// The name is exactly what it was: still a directory, with nothing written beside it.
		expect(readdirSync(root)).toEqual([CONSUMPTION_FILE]);
		expect(readdirSync(path.join(root, CONSUMPTION_FILE))).toEqual([]);
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

/**
 * The same session id under two harnesses: the file holds both, and each is an identity of its own
 * partition — a different name, direct parent, version and consumption.
 */
const OMP_SHARED: SessionRecord = {
	id: "session-shared",
	name: "omp 的会话",
	parent: null,
	saveVersion: 1,
	own: {
		deepseek: {
			"model-A": { tokens: { input: 10, cacheRead: 0, cacheWrite: 0, output: 1 }, costCny: 0.01 },
		},
	},
};

/** The same id in the other harness: another parent, a far greater version and other consumption. */
const PI_SHARED: SessionRecord = {
	id: "session-shared",
	name: "pi 的会话",
	parent: "pi-parent",
	saveVersion: 9,
	own: {
		"plan-provider": {
			"model-B": { tokens: { input: 20, cacheRead: 0, cacheWrite: 0, output: 2 }, referenceCostUsd: 0.02 },
		},
	},
};

/** The omp record one snapshot later: its own consumption grew and its parent is still its own. */
const OMP_SHARED_GROWN: SessionRecord = {
	...OMP_SHARED,
	saveVersion: 2,
	name: "omp 的会话（改）",
	own: {
		deepseek: {
			"model-A": { tokens: { input: 30, cacheRead: 0, cacheWrite: 0, output: 4 }, costCny: 0.03 },
		},
	},
};

describe("one document holds two harnesses' identities apart (P39)", () => {
	test("the same session id is another record under another harness: its own parent, version and content", async () => {
		const root = seededRoot(JSON.stringify(sharedDocument({ omp: [OMP_SHARED], pi: [PI_SHARED] })));
		const store = new ConsumptionStore(root);
		expect((await store.load()).kind).toBe("loaded");

		// One id, two identities: each partition answers its own record, and the period's own reading
		// holds both in the order the document keeps them.
		expect(store.session("omp", "session-shared")).toEqual(OMP_SHARED);
		expect(store.session("pi", "session-shared")).toEqual(PI_SHARED);
		expect(store.sessions("omp")).toEqual([OMP_SHARED]);
		expect(store.sessions("pi")).toEqual([PI_SHARED]);
		expect(store.periodSessions()).toEqual([OMP_SHARED, PI_SHARED]);

		// A version the other partition is far past: versions are compared inside one harness's own
		// records, so this snapshot is the next one of *its* identity rather than an older version.
		expect(await store.commit("omp", OMP_SHARED_GROWN)).toEqual({ kind: "saved" });
		// And the other partition's own record is judged against itself: the same version with the same
		// content is idempotent, and the same version with other content is a conflict — neither is a
		// verdict about the record this harness just published at the same id.
		expect(await store.commit("pi", PI_SHARED)).toEqual({ kind: "unchanged" });
		expect(await store.commit("pi", { ...PI_SHARED, name: "另一个名字" })).toEqual({ kind: "conflict" });

		// Both partitions are exactly what their own commits made them: no parent, version or content
		// crossed the harness boundary.
		expect(fileDocument(root)).toEqual(
			sharedDocument({ omp: [OMP_SHARED_GROWN], pi: [PI_SHARED] }),
		);
		expect(store.session("omp", "session-shared")?.parent).toBeNull();
		expect(store.session("pi", "session-shared")?.parent).toBe("pi-parent");
	});

	test("a commit only ever rewrites its own harness's record, and a refused one changes nothing", async () => {
		const root = seededRoot(JSON.stringify(sharedDocument({ omp: [OMP_SHARED], pi: [PI_SHARED] })));
		const store = new ConsumptionStore(root);
		await store.load();

		expect(await store.commit("omp", OMP_SHARED_GROWN)).toEqual({ kind: "saved" });
		expect(await store.commit("pi", { ...PI_SHARED, saveVersion: 10, name: "pi 的会话（改）" })).toEqual({
			kind: "saved",
		});
		const saved = fileDocument(root);
		expect(saved).toEqual(
			sharedDocument({ omp: [OMP_SHARED_GROWN], pi: [{ ...PI_SHARED, saveVersion: 10, name: "pi 的会话（改）" }] }),
		);

		// A version the other partition is far past does not refuse this partition's own next snapshot:
		// the omp record is the one a commit under omp reaches, and its version 3 is its own successor
		// however far ahead the pi record of the same id is.
		expect(await store.commit("omp", { ...OMP_SHARED, saveVersion: 3, name: "omp 的会话（再改）" })).toEqual({
			kind: "saved",
		});
		expect((fileDocument(root) as ConsumptionDocument).harnesses.pi?.sessions[0]?.saveVersion).toBe(10);
		expect(store.session("pi", "session-shared")?.name).toBe("pi 的会话（改）");
		expect(store.periodSessions().map(record => `${record.id}@${record.name}`)).toEqual([
			"session-shared@omp 的会话（再改）",
			"session-shared@pi 的会话（改）",
		]);
	});
});

describe("a read-only synchronization adopts what another writer committed (P33)", () => {
	/** The document one instance loaded, and the one another harness's process later published. */
	const LOADED = sharedDocument({ omp: [OMP_SHARED] });
	const PUBLISHED = sharedDocument({ omp: [OMP_SHARED, { ...OMP_SHARED, id: "session-two", parent: "session-shared" }] });

	test("another writer's records are adopted, and the file is not opened for writing at all", async () => {
		const root = seededRoot(JSON.stringify(LOADED));
		const store = new ConsumptionStore(root);
		await store.load();
		// Another harness's process commits its own session in the same period, while this instance is
		// running: the file it sees is the one that process published.
		const published = JSON.stringify(PUBLISHED);
		writeFileSync(path.join(root, CONSUMPTION_FILE), published, "utf8");

		expect(await store.synchronize()).toEqual({ kind: "adopted", periodChanged: false, changed: true });
		expect(store.sessions("omp")).toEqual(PUBLISHED.harnesses.omp?.sessions);
		// Nothing was written: the file is the same bytes, and the root holds no lock, staging directory
		// or temporary file a coordinated update would have left behind on its way through.
		expect(fileText(root)).toBe(published);
		expect(readdirSync(root)).toEqual([CONSUMPTION_FILE]);
		// Once the baseline is what the file holds, a second synchronization has nothing to adopt and
		// nothing to announce: the same document read again is not a change.
		expect(await store.synchronize()).toEqual({ kind: "adopted", periodChanged: false, changed: false });
		expect(fileText(root)).toBe(published);
	});

	test("a document naming another generation is adopted as the period itself", async () => {
		const root = seededRoot(JSON.stringify(LOADED));
		const store = new ConsumptionStore(root);
		await store.load();
		// Another process reset the period: the document it published names a new generation, and this
		// instance's accumulation belongs to the one that was closed.
		const next = sharedDocument({ omp: [{ ...OMP_SHARED, saveVersion: 20 }] }, "period-two");
		writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(next), "utf8");

		expect(await store.synchronize()).toEqual({ kind: "adopted", periodChanged: true, changed: true });
		expect(store.period()?.periodId).toBe("period-two");
		expect(store.sessions("omp")).toEqual(next.harnesses.omp?.sessions);

		// The generation the instance is in is now the file's own, so a snapshot older than the record
		// that generation holds is refused as an older version and the new period's document is left as
		// it is: nothing from the closed one is revived into it.
		const before = fileText(root);
		expect(await store.commit("omp", { ...OMP_SHARED, saveVersion: 2 })).toEqual({ kind: "stale-version" });
		expect(fileText(root)).toBe(before);
		// A snapshot of that generation is the one that lands: the successor of the record it holds.
		expect(await store.commit("omp", { ...OMP_SHARED, saveVersion: 21 })).toEqual({ kind: "saved" });
		expect((fileDocument(root) as ConsumptionDocument).periodId).toBe("period-two");
		expect(store.session("omp", "session-shared")?.saveVersion).toBe(21);
	});

	test("a root holding no document is nothing to adopt, never a fresh period", async () => {
		const empty = freshRoot();
		const first = new ConsumptionStore(empty);
		await first.load();
		expect(await first.synchronize()).toEqual({ kind: "absent" });
		expect(first.period()?.periodId).toBe("period-fresh");
		expect(fileText(empty)).toBeUndefined();

		// A document the instance loaded and the file then lost is the same answer: what this instance
		// holds stays what it holds, and nothing is created, zeroed or re-read as a first run.
		const root = seededRoot(JSON.stringify(LOADED));
		const store = new ConsumptionStore(root);
		await store.load();
		rmSync(path.join(root, CONSUMPTION_FILE), { force: true });
		expect(await store.synchronize()).toEqual({ kind: "absent" });
		expect(store.period()?.periodId).toBe(LOADED.periodId);
		expect(store.sessions("omp")).toEqual(LOADED.harnesses.omp?.sessions);
		expect(fileText(root)).toBeUndefined();
	});

	test("a document that is not this extension's format pauses the instance and is left alone", async () => {
		const broken = "{ this is not a document";
		const root = seededRoot(JSON.stringify(LOADED));
		const store = new ConsumptionStore(root);
		await store.load();
		writeFileSync(path.join(root, CONSUMPTION_FILE), broken, "utf8");

		const outcome = await store.synchronize();
		expect(outcome.kind).toBe("unusable");
		expect(store.pauseReason()).toBeDefined();
		expect(store.period()).toBeUndefined();
		// Nothing is overwritten, and no repair is attempted: the file is the bytes it was, the root
		// holds nothing else, and the pause is what every later commit answers.
		expect(fileText(root)).toBe(broken);
		expect(readdirSync(root)).toEqual([CONSUMPTION_FILE]);
		expect(await store.commit("omp", OMP_SHARED)).toEqual({ kind: "paused" });
	});

	test("a file that cannot be read is reported without pausing the instance", async () => {
		const root = seededRoot(JSON.stringify(LOADED));
		const store = new ConsumptionStore(root);
		await store.load();
		// The target became something this process cannot read a document from: a directory in its place.
		rmSync(path.join(root, CONSUMPTION_FILE), { force: true });
		mkdirSync(path.join(root, CONSUMPTION_FILE));

		const outcome = await store.synchronize();
		expect(outcome.kind).toBe("unreadable");
		// A read that failed is not a baseline that is gone: the instance goes on against the document it
		// last read, and the target is left exactly as it is.
		expect(store.pauseReason()).toBeUndefined();
		expect(store.sessions("omp")).toEqual(LOADED.harnesses.omp?.sessions);
		expect(existsSync(path.join(root, CONSUMPTION_FILE))).toBe(true);

		// Once the target is a document again, the next synchronization adopts it — and the pause never
		// happened, so nothing had to be re-initialized.
		rmSync(path.join(root, CONSUMPTION_FILE), { recursive: true, force: true });
		writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(PUBLISHED), "utf8");
		expect(await store.synchronize()).toEqual({ kind: "adopted", periodChanged: false, changed: true });
	});

	test("an instance that is already paused does not read the file again", async () => {
		const root = seededRoot("{ not a document at all");
		const store = new ConsumptionStore(root);
		expect((await store.load()).kind).toBe("unusable");
		// Nothing is probed or repaired while the instance is paused: the file is not even opened, which
		// is what a target replaced by a directory proves — a read would have reported it unreadable.
		rmSync(path.join(root, CONSUMPTION_FILE), { force: true });
		mkdirSync(path.join(root, CONSUMPTION_FILE));
		expect(await store.synchronize()).toEqual({ kind: "paused" });
	});

	test("a synchronization before any baseline is a misuse, not a data condition", async () => {
		const root = freshRoot();
		const store = new ConsumptionStore(root);
		const failure = store
			.synchronize()
			.then(() => "resolved", (error: unknown) => (error instanceof Error ? error.message : String(error)));
		await expect(failure).resolves.toContain("before it loaded a baseline");
		expect(fileText(root)).toBeUndefined();
	});
});

describe("a batch of commits is adjudicated one record at a time (P32)", () => {
	test("the valid records of a mixed batch are published and the refused one is left refused", async () => {
		const STALE_TARGET: SessionRecord = { ...MAIN_SESSION, saveVersion: 5, own: { deepseek: { "model-A": { tokens: { input: 50, cacheRead: 0, cacheWrite: 0, output: 5 }, costCny: 0.05 } } } };
		const root = seededRoot(JSON.stringify(document([STALE_TARGET])));
		const store = new ConsumptionStore(root);
		await store.load();

		// One process's own batch, submitted in order: an older version of a session the file holds, then
		// two sessions this process is the first to save, then the next version of the session whose old
		// snapshot was refused.
		const second: SessionRecord = { ...CHILD_SESSION, id: "session-second", parent: null };
		const third: SessionRecord = { ...CHILD_SESSION, id: "session-third", parent: "session-second" };
		const outcomes = await Promise.all([
			store.commit("omp", { ...STALE_TARGET, saveVersion: 4 }),
			store.commit("omp", second),
			store.commit("omp", third),
			// The next version of that session after the refusal: the file still holds version 5, and this
			// snapshot was built from the baseline this process loaded rather than from the refused one.
			store.commit("omp", { ...STALE_TARGET, saveVersion: 6, own: { deepseek: { "model-A": { tokens: { input: 60, cacheRead: 0, cacheWrite: 0, output: 6 }, costCny: 0.06 } } } }),
		]);

		// Each record is decided on its own: the older version is refused and the three others land, in
		// the order they were submitted.
		expect(outcomes).toEqual([{ kind: "stale-version" }, { kind: "saved" }, { kind: "saved" }, { kind: "saved" }]);
		// The refused record's version and content are nowhere in the file, and no retry of it happened:
		// what the file holds is exactly the three snapshots that were accepted.
		expect(fileDocument(root)).toEqual(
			document([
				{ ...STALE_TARGET, saveVersion: 6, own: { deepseek: { "model-A": { tokens: { input: 60, cacheRead: 0, cacheWrite: 0, output: 6 }, costCny: 0.06 } } } },
				second,
				third,
			]),
		);
	});
});
