/**
 * The consumption document's approved schema, its business comparison and its merge rules
 * (P45, P52's session half; S2/S4).
 *
 * The seam is the extension's own document module: what a file at `consumption.json` has to look
 * like to be read at all, whether two session records say the same business thing, and what one
 * session's commit does to the document a coordinated read just produced. Every expectation is
 * written here from the storage contract — the root fields, the flat session list keyed by id,
 * the four token buckets with the two currencies kept apart, the optional startup facts a spawned
 * session's own start contributes (P19, P22), the version scope periodId+harness+sessionId, and the
 * refusal of anything the approved schema does not name — and the documents the cases read are
 * written out in full rather than produced by the code under test.
 */
import { describe, expect, test } from "bun:test";
import {
	type ConsumptionDocument,
	type SessionRecord,
	mergeSession,
	readConsumptionDocument,
	sameSessionContent,
} from "../../extensions/model-cost/shared-logic/consumption-document";

/** One session record, as the approved schema writes it: a main session with two providers. */
const MAIN_SESSION: SessionRecord = {
	id: "session-main",
	name: "主会话",
	parent: null,
	saveVersion: 2,
	own: {
		deepseek: {
			"model-A": {
				tokens: { input: 1000, cacheRead: 500, cacheWrite: 0, output: 200 },
				costCny: 0.01,
			},
		},
		"openai-codex": {
			"model-B": {
				tokens: { input: 2000, cacheRead: 1000, cacheWrite: 0, output: 300 },
				referenceCostUsd: 0.02,
			},
		},
	},
};

/** One subagent record: the same shape, with a direct parent and one provider. */
const CHILD_SESSION: SessionRecord = {
	id: "session-child",
	name: "资料核对",
	parent: "session-main",
	saveVersion: 1,
	own: {
		deepseek: {
			"model-A": {
				tokens: { input: 600, cacheRead: 0, cacheWrite: 0, output: 100 },
				costCny: 0.005,
			},
		},
	},
};

/** A complete document of the approved schema, with both sessions in one harness. */
function approvedDocument(): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "7e9983ee-6f68-4bb7-8c01-13a48beaf24b",
		start: "2026-10-12T04:00:00.000Z",
		start_bal: 99.8,
		holiday: true,
		harnesses: { omp: { sessions: [MAIN_SESSION, CHILD_SESSION] } },
	};
}

describe("the consumption document's schema", () => {
	test("an approved document is read with its root fields, sessions and own buckets intact", () => {
		const outcome = readConsumptionDocument(approvedDocument());
		expect(outcome.kind).toBe("document");
		if (outcome.kind !== "document") return;
		expect(outcome.document.schemaVersion).toBe(1);
		expect(outcome.document.periodId).toBe("7e9983ee-6f68-4bb7-8c01-13a48beaf24b");
		expect(outcome.document.start).toBe("2026-10-12T04:00:00.000Z");
		expect(outcome.document.start_bal).toBe(99.8);
		expect(outcome.document.holiday).toBe(true);
		expect(outcome.document.harnesses.omp?.sessions).toEqual([MAIN_SESSION, CHILD_SESSION]);
		// The two currencies stay what they were: a Codex reference estimate is not an amount.
		expect(outcome.document.harnesses.omp?.sessions[1]?.own.deepseek?.["model-A"]?.costCny).toBe(0.005);
		expect(outcome.document.harnesses.omp?.sessions[0]?.own["openai-codex"]?.["model-B"]?.referenceCostUsd).toBe(
			0.02,
		);
	});

	test("an optional boundary balance may be omitted, and a zero is not written in its place", () => {
		const { start_bal: _omittedBoundaryBalance, ...withoutBoundaryBalance } = approvedDocument();
		const outcome = readConsumptionDocument(withoutBoundaryBalance);
		expect(outcome.kind).toBe("document");
		if (outcome.kind !== "document") return;
		expect("start_bal" in outcome.document).toBe(false);
	});

	test("another format version is not read as this one", () => {
		const outcome = readConsumptionDocument({ ...approvedDocument(), schemaVersion: 2 });
		expect(outcome.kind).toBe("unusable");
		if (outcome.kind !== "unusable") return;
		expect(outcome.reason).toContain("schemaVersion");
	});

	test("a legacy document is not read as this one", () => {
		// The old DeepSeek cost file: another shape entirely, and never migrated into this one.
		const outcome = readConsumptionDocument({ totalCost: 12.5, sessions: { "session-main": { costCny: 3 } }, holiday: false });
		expect(outcome.kind).toBe("unusable");
	});

	test("a missing root field is unusable rather than defaulted", () => {
		const { harnesses: _omittedHarnesses, ...withoutHarnesses } = approvedDocument();
		expect(readConsumptionDocument(withoutHarnesses).kind).toBe("unusable");
	});

	test("a field the approved schema does not name is unusable, not preserved by accident", () => {
		const outcome = readConsumptionDocument({ ...approvedDocument(), accounts: { main: {} } });
		expect(outcome.kind).toBe("unusable");
		if (outcome.kind !== "unusable") return;
		expect(outcome.reason).toContain("accounts");
	});

	test("a session record carrying an extra authoritative total is refused", () => {
		const outcome = readConsumptionDocument({
			...approvedDocument(),
			harnesses: { omp: { sessions: [{ ...MAIN_SESSION, totalCost: 5, totalTokens: 4000 }] } },
		});
		expect(outcome.kind).toBe("unusable");
		if (outcome.kind !== "unusable") return;
		expect(outcome.reason).toContain("totalCost");
	});

	test("a session record built from the wrong shape is refused", () => {
		// `harnesses.<harness>.sessions` is a flat list; a map of sessions is not this schema.
		expect(
			readConsumptionDocument({
				...approvedDocument(),
				harnesses: { omp: { sessions: { "session-main": MAIN_SESSION } } },
			}).kind,
		).toBe("unusable");
		expect(
			readConsumptionDocument({
				...approvedDocument(),
				harnesses: { omp: { sessions: [{ ...MAIN_SESSION, tokens: { input: 1 } }] } },
			}).kind,
		).toBe("unusable");
		expect(
			readConsumptionDocument({
				...approvedDocument(),
				harnesses: { omp: { sessions: [MAIN_SESSION, { ...CHILD_SESSION, id: "session-main" }] } },
			}).kind,
		).toBe("unusable");
	});

	test("an own entry outside the two approved currencies is refused", () => {
		expect(
			readConsumptionDocument({
				...approvedDocument(),
				harnesses: {
					omp: {
						sessions: [
							{
								...MAIN_SESSION,
								own: {
									deepseek: {
										"model-A": {
											tokens: { input: 1, cacheRead: 0, cacheWrite: 0, output: 0 },
											costUsd: 3,
										},
									},
								},
							},
						],
					},
				},
			}).kind,
		).toBe("unusable");
	});

	test("a negative or non-finite measurement is refused", () => {
		expect(
			readConsumptionDocument({
				...approvedDocument(),
				harnesses: {
					omp: {
						sessions: [
							{
								...MAIN_SESSION,
								own: {
									deepseek: {
										"model-A": { tokens: { input: -1, cacheRead: 0, cacheWrite: 0, output: 0 } },
									},
								},
							},
						],
					},
				},
			}).kind,
		).toBe("unusable");
	});
});

describe("the consumption document's startup facts", () => {
	/** The same child record carrying what a spawned session's own start reported. */
	const WITH_STARTUP: SessionRecord = {
		...CHILD_SESSION,
		startup: { model: { provider: "deepseek", model: "model-A" }, effort: "high" },
	};

	/** One document holding a single record with one candidate `startup` value. */
	const documentWith = (startup: unknown): ConsumptionDocument => ({
		...approvedDocument(),
		harnesses: { omp: { sessions: [{ ...CHILD_SESSION, startup } as SessionRecord] } },
	});

	test("a record's startup facts are read with each part intact, and a part nothing proved stays absent", () => {
		const outcome = readConsumptionDocument(documentWith(WITH_STARTUP.startup));
		expect(outcome.kind).toBe("document");
		if (outcome.kind !== "document") return;
		expect(outcome.document.harnesses.omp?.sessions[0]?.startup).toEqual({
			model: { provider: "deepseek", model: "model-A" },
			effort: "high",
		});

		// Each part stands on its own: a record that proved the level and no model keeps exactly that,
		// and nothing completes the pair for it.
		const half = readConsumptionDocument(documentWith({ effort: "high" }));
		expect(half.kind).toBe("document");
		if (half.kind !== "document") return;
		expect(half.document.harnesses.omp?.sessions[0]?.startup).toEqual({ effort: "high" });
	});

	test("a startup member the schema does not name, or a part of another shape, is refused", () => {
		const reasonOf = (startup: unknown): string | undefined => {
			const outcome = readConsumptionDocument(documentWith(startup));
			return outcome.kind === "unusable" ? outcome.reason : undefined;
		};
		// The document states the pair the schema fixes and nothing else: a model as a bare selector, a
		// pair missing one of its parts, the configured selector behind a level, and an empty level are
		// each a shape the schema does not carry.
		expect(reasonOf("deepseek/model-A")).toContain(".startup");
		expect(reasonOf({ model: "deepseek/model-A" })).toContain("startup.model");
		expect(reasonOf({ model: { provider: "deepseek" } })).toContain("startup.model.model");
		expect(reasonOf({ model: { provider: "deepseek", model: "model-A", selector: "auto" } })).toContain("selector");
		expect(reasonOf({ level: "high" })).toContain("level");
		expect(reasonOf({ effort: "" })).toContain("startup.effort");
	});

	test("two records differing only in their startup facts are not the same business content", () => {
		// The startup facts are content like the name: a pair that changed, or that arrived where the
		// document holds none, is a conflict at the same version rather than a silent update, which is
		// what keeps a startup the document already recorded from being rewritten later.
		expect(sameSessionContent(WITH_STARTUP, CHILD_SESSION)).toBe(false);
		expect(sameSessionContent(WITH_STARTUP, { ...WITH_STARTUP })).toBe(true);
		const document: ConsumptionDocument = { ...approvedDocument(), harnesses: { omp: { sessions: [CHILD_SESSION] } } };
		expect(mergeSession(document, "omp", { ...CHILD_SESSION, startup: { effort: "high" } }).kind).toBe("conflict");
	});
});

describe("the consumption document's optional time facts", () => {
	/** One document holding records with the given extra time fields beside the valid consumption. */
	const documentWith = (records: readonly unknown[]): ConsumptionDocument =>
		({
			schemaVersion: 1,
			periodId: "7e9983ee-6f68-4bb7-8c01-13a48beaf24b",
			start: "2026-10-12T04:00:00.000Z",
			holiday: false,
			harnesses: { omp: { sessions: records } },
		}) as unknown as ConsumptionDocument;

	test("a readable span and runtime are read as the record's own facts", () => {
		const outcome = readConsumptionDocument(
			documentWith([MAIN_SESSION, { ...CHILD_SESSION, runtimeMs: 480_000, span: { start: 1_000, end: 301_000 } }]),
		);
		expect(outcome.kind).toBe("document");
		if (outcome.kind !== "document") return;
		expect(outcome.faults).toEqual([]);
		expect(outcome.document.harnesses.omp?.sessions[1]?.runtimeMs).toBe(480_000);
		expect(outcome.document.harnesses.omp?.sessions[1]?.span).toEqual({ start: 1_000, end: 301_000 });
	});

	test("a declared runtime the schema cannot read is a fault beside the valid consumption rather than a silent drop", () => {
		const outcome = readConsumptionDocument(
			documentWith([MAIN_SESSION, { ...CHILD_SESSION, runtimeMs: "8 minutes" }]),
		);
		expect(outcome.kind).toBe("document");
		if (outcome.kind !== "document") return;
		// The record is still the one the file holds — the consumption beside the figure is not damage —
		// and the place the operator has to look at is named with the value that was dropped.
		expect(outcome.document.harnesses.omp?.sessions[1]?.own).toEqual(CHILD_SESSION.own);
		expect(outcome.document.harnesses.omp?.sessions[1]?.runtimeMs).toBeUndefined();
		expect(outcome.faults).toEqual([
			'harnesses.omp.sessions[1]：harnesses.omp.sessions[1].runtimeMs 不是有限数字（"8 minutes"）',
		]);

		const negative = readConsumptionDocument(documentWith([{ ...CHILD_SESSION, runtimeMs: -1 }]));
		expect(negative.kind).toBe("document");
		if (negative.kind !== "document") return;
		expect(negative.faults).toEqual(["harnesses.omp.sessions[0]：harnesses.omp.sessions[0].runtimeMs 为负数"]);
	});

	test("a record whose runtime and span are both unreadable states both places, each once", () => {
		const outcome = readConsumptionDocument(
			documentWith([{ ...CHILD_SESSION, runtimeMs: "8 minutes", span: { start: 1_000, end: 500 } }]),
		);
		expect(outcome.kind).toBe("document");
		if (outcome.kind !== "document") return;
		expect(outcome.faults).toEqual([
			'harnesses.omp.sessions[0]：harnesses.omp.sessions[0].runtimeMs 不是有限数字（"8 minutes"）',
			"harnesses.omp.sessions[0]：harnesses.omp.sessions[0].span.end 早于 harnesses.omp.sessions[0].span.start",
		]);
		// An absent figure is not a fault at all: a record written before the field existed, and one
		// whose figure is simply unknown, both stay silent.
		const absent = readConsumptionDocument(documentWith([MAIN_SESSION, CHILD_SESSION]));
		expect(absent.kind).toBe("document");
		if (absent.kind !== "document") return;
		expect(absent.faults).toEqual([]);
	});
});

describe("the consumption document's merge", () => {
	test("a record whose id is not in the harness is appended, and the others survive", () => {
		const document: ConsumptionDocument = { ...approvedDocument(), harnesses: { omp: { sessions: [MAIN_SESSION] } } };
		const candidate: SessionRecord = { ...CHILD_SESSION, id: "session-second-child", parent: null };
		const outcome = mergeSession(document, "omp", candidate);
		expect(outcome.kind).toBe("updated");
		if (outcome.kind !== "updated") return;
		expect(outcome.document.harnesses.omp?.sessions.map(session => session.id)).toEqual([
			"session-main",
			"session-second-child",
		]);
		expect(outcome.document.harnesses.omp?.sessions[0]).toEqual(MAIN_SESSION);
	});

	test("a record replaces the one with its id, wherever that record sits", () => {
		const replacement: SessionRecord = { ...CHILD_SESSION, saveVersion: 4, name: "资料核对（改）" };
		const outcome = mergeSession(approvedDocument(), "omp", replacement);
		expect(outcome.kind).toBe("updated");
		if (outcome.kind !== "updated") return;
		expect(outcome.document.harnesses.omp?.sessions).toEqual([MAIN_SESSION, replacement]);
	});

	test("a parent that was never saved is no obstacle", () => {
		const orphan: SessionRecord = { ...CHILD_SESSION, id: "session-orphan", parent: "session-absent" };
		const outcome = mergeSession(approvedDocument(), "omp", orphan);
		expect(outcome.kind).toBe("updated");
		if (outcome.kind !== "updated") return;
		expect(outcome.document.harnesses.omp?.sessions[2]).toEqual(orphan);
	});

	test("an older save version is refused and the document stays as it was", () => {
		const stale: SessionRecord = { ...MAIN_SESSION, saveVersion: 1 };
		expect(mergeSession(approvedDocument(), "omp", stale).kind).toBe("stale-version");
	});

	test("the same version with the same business content is idempotent", () => {
		const repeat: SessionRecord = { ...MAIN_SESSION, own: { ...MAIN_SESSION.own } };
		const outcome = mergeSession(approvedDocument(), "omp", repeat);
		expect(outcome.kind).toBe("unchanged");
		if (outcome.kind !== "unchanged") return;
		expect(outcome.document).toEqual(approvedDocument());
	});

	test("the same version with other business content is a conflict, never a merge", () => {
		const different: SessionRecord = {
			...MAIN_SESSION,
			own: {
				deepseek: {
					"model-A": { tokens: { input: 1500, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0.02 },
				},
			},
		};
		expect(mergeSession(approvedDocument(), "omp", different).kind).toBe("conflict");
		// A rename at the same version is other business content too: the record's fields are its
		// content, and a name is one of them.
		expect(mergeSession(approvedDocument(), "omp", { ...MAIN_SESSION, name: "别的名字" }).kind).toBe("conflict");
	});

	test("records whose keys were written in another order are the same business content", () => {
		const reordered: SessionRecord = {
			saveVersion: 2,
			parent: null,
			name: "主会话",
			id: "session-main",
			own: {
				"openai-codex": {
					"model-B": {
						referenceCostUsd: 0.02,
						tokens: { output: 300, cacheWrite: 0, cacheRead: 1000, input: 2000 },
					},
				},
				deepseek: {
					"model-A": { costCny: 0.01, tokens: { output: 200, cacheWrite: 0, cacheRead: 500, input: 1000 } },
				},
			},
		};
		expect(sameSessionContent(MAIN_SESSION, reordered)).toBe(true);
		expect(mergeSession(approvedDocument(), "omp", reordered).kind).toBe("unchanged");
	});

	test("the version scope is the harness's own list, so another harness is another record", () => {
		const document: ConsumptionDocument = { ...approvedDocument(), harnesses: { omp: { sessions: [MAIN_SESSION] } } };
		const other: SessionRecord = { ...MAIN_SESSION, saveVersion: 1, name: "另一个宿主" };
		const outcome = mergeSession(document, "pi", other);
		expect(outcome.kind).toBe("updated");
		if (outcome.kind !== "updated") return;
		expect(outcome.document.harnesses.omp?.sessions).toEqual([MAIN_SESSION]);
		expect(outcome.document.harnesses.pi?.sessions).toEqual([other]);
	});
});
