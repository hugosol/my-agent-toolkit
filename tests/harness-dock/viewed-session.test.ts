/**
 * The Viewed session artifact and the contract it publishes (ticket 01).
 *
 * Two halves, both against the *materialised patched host* rather than a copy of the patch source:
 *
 * - the artifact half freezes it: the record's base hashes are checked against the revision anchor
 *   this repository already records as supported, the record's patch hash against the committed
 *   patch, and the materialised bytes against the record's post-patch hashes. The unpatched
 *   baseline install is the control that the outlet comes from the patch and not from the host
 *   version.
 * - the contract half drives the artifact's own outlet module with a controlled view: a target
 *   switch, a same-target fact change, a target that goes invalid, and an unsubscribe. The TUI
 *   that owns a real view cannot be scripted in this headless dock, so these are the deterministic
 *   driving surfaces for those transitions; the real focused-view run is prepared for human
 *   acceptance in `host-patches/omp-18.5.0-viewed-session/README.md`.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, type IsolatedHarness, type BaselineRecord, readBaselineRecord, sha256File } from "./baseline";
import type { PatchRecordEntry } from "./host-patch-artifact";
import {
	VIEWED_SESSION_PATCH_FILE,
	VIEWED_SESSION_RECORD_FILE,
	type ViewedSessionArtifactRecord,
	ensureViewedSessionHarness,
	patchTouchedFiles,
	readViewedSessionRecord,
	viewedSessionHarnessLayout,
} from "./viewed-session-harness";

/** The snapshot fields this suite asserts; the artifact owns the type, the test only reads it. */
interface Facts {
	agent: { id: string; kind: "main" | "sub"; parentId?: string };
	sessionId?: string;
	name?: string;
	provider?: string;
	model?: string;
	effort?: string;
	context?: { tokens: number; contextWindow: number };
	unavailable: readonly string[];
}

interface SessionState {
	name?: string;
	sessionId?: string;
	model?: { provider: string; id: string };
	thinkingLevel?: string;
	context?: { tokens: number; contextWindow: number };
}

/** One live session as the outlet reads it: live getters over a mutable state object. */
interface WatchedSession {
	readonly sessionName?: string;
	readonly sessionId?: string;
	readonly model?: { readonly provider: string; readonly id: string };
	readonly thinkingLevel?: string;
	getContextUsage(): { tokens: number; contextWindow: number } | undefined;
	subscribe(listener: (event: { readonly type: string }) => void): () => void;
}

interface View {
	target: Record<string, unknown>;
	session?: WatchedSession;
}

/** The slice of the artifact's outlet module this suite drives. */
interface OutletModule {
	viewedSessionFacts(target: Record<string, unknown>): Facts;
	ViewedSessionBroadcaster: new (view: () => View) => {
		read(): Facts;
		subscribe(listener: (facts: Facts) => void): () => void;
		notify(): void;
		dispose(): void;
	};
	createSessionViewedSessionSource(options: {
		agent: { id: string; kind: "main" | "sub"; parentId?: string };
		session: WatchedSession;
	}): { read(): Facts; subscribe(listener: (facts: Facts) => void): () => void };
}

const record = readBaselineRecord();

/** The revision-anchor entry for a patched file: the record names anchor files relative to `src`. */
function anchorHashFor(baseline: BaselineRecord, patchedPath: string): string | undefined {
	return baseline.harness.acceptanceArtifact.byteIdentity.files.find(
		entry => `src/${entry.path}` === patchedPath || entry.path === patchedPath,
	)?.sha256;
}

/**
 * A session with one stable identity that records its subscribers, so a test can fire one event at
 * a time and mutate the facts the live getters read.
 */
function watchedSession(initial: SessionState): {
	session: WatchedSession;
	state: SessionState;
	emit(event: { type: string }): void;
	subscribers(): number;
} {
	const state: SessionState = { ...initial };
	const listeners = new Set<(event: { readonly type: string }) => void>();
	return {
		state,
		session: {
			get sessionName(): string | undefined {
				return state.name;
			},
			get sessionId(): string | undefined {
				return state.sessionId;
			},
			get model(): { provider: string; id: string } | undefined {
				return state.model;
			},
			get thinkingLevel(): string | undefined {
				return state.thinkingLevel;
			},
			getContextUsage: () => state.context,
			subscribe: listener => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		},
		emit(event) {
			for (const listener of [...listeners]) listener(event);
		},
		subscribers: () => listeners.size,
	};
}

let harness: IsolatedHarness;
let outlet: OutletModule;
let artifact: ViewedSessionArtifactRecord;
/** This artifact's one patch, as the record freezes it. */
let patch: PatchRecordEntry;
let patchedFiles: string[];

beforeAll(async () => {
	harness = await ensureViewedSessionHarness(record);
	const frozen = readViewedSessionRecord();
	if (!frozen) throw new Error(`${VIEWED_SESSION_RECORD_FILE} was not frozen by the materialisation`);
	artifact = frozen;
	patch = artifact.patches[0];
	patchedFiles = patchTouchedFiles(readFileSync(VIEWED_SESSION_PATCH_FILE, "utf8"));
	// Dynamic import is required: the artifact is an isolated install whose prefix exists only after
	// the materialisation above, so no static specifier can name the module under test.
	const moduleUrl = pathToFileURL(
		path.join(harness.packageRoot, "src", "extensibility", "extensions", "viewed-session.ts"),
	).href;
	outlet = (await import(moduleUrl)) as OutletModule;
}, 600_000);

describe("the frozen Viewed session host artifact", () => {
	test("the record pins the base revision this repository records as supported, not a newer one", () => {
		expect(artifact.harness.package).toBe(record.harness.package);
		expect(artifact.harness.version).toBe(record.harness.supportedVersion);
		expect(artifact.harness.version).toBe("18.5.0");
		// The checkout itself has moved on; the patch stays on the approved anchor.
		expect(artifact.harness.revisionAnchor.commit).toBe(record.harness.revisionAnchor.commit);
		expect(artifact.harness.revisionAnchor.commit).toBe("9348320cc4a30a7195d36a1f05a6c11bcb701a17");
		expect(patch.file).toBe("host-patches/omp-18.5.0-viewed-session/patch.diff");
		expect(patch.sha256).toBe(sha256File(VIEWED_SESSION_PATCH_FILE));
		expect(patch.files.map(file => file.path)).toEqual(patchedFiles);
	});

	test("every patched file's base hash agrees with the baseline record's own revision anchor", () => {
		const anchored = patchedFiles.filter(file => anchorHashFor(record, file) !== undefined);
		// The anchor lists six contract files; the patch touches two of them, and those two carry
		// the strongest available tie between this artifact and the recorded revision.
		expect(anchored).toEqual([
			"src/extensibility/extensions/runner.ts",
			"src/extensibility/extensions/types.ts",
		]);
		for (const file of anchored) {
			const frozen = patch.files.find(entry => entry.path === file);
			expect(frozen?.baseSha256).toBe(anchorHashFor(record, file));
			// ... and the patch really changes them, so the anchor hash cannot be a coincidence of
			// a file the patch only mentions.
			expect(frozen?.patchedSha256).not.toBe(frozen?.baseSha256);
		}
	});

	test("the materialised host carries exactly the frozen post-patch bytes", () => {
		expect(
			existsSync(path.join(harness.packageRoot, "src", "extensibility", "extensions", "viewed-session.ts")),
		).toBe(true);
		for (const file of patch.files) {
			expect(sha256File(path.join(harness.packageRoot, file.path))).toBe(file.patchedSha256);
		}
		expect(artifact.materialise.prefix).toBe(
			path.relative(REPO_ROOT, viewedSessionHarnessLayout(record).prefix).replace(/\\/g, "/"),
		);
	});

	test("the unpatched baseline install carries no outlet: the patch is what publishes it", () => {
		const base = path.join(REPO_ROOT, record.harness.acceptanceArtifact.prefix, "node_modules", record.harness.package);
		expect(existsSync(path.join(base, "src", "extensibility", "extensions", "viewed-session.ts"))).toBe(false);
		expect(readFileSync(path.join(base, "src", "extensibility", "extensions", "types.ts"), "utf8")).not.toContain(
			"getViewedSession",
		);
	});
});

describe("the viewed session contract, as the frozen artifact implements it", () => {
	test("a fact the host cannot obtain is named unavailable instead of guessed", () => {
		const complete = outlet.viewedSessionFacts({
			agent: { id: "0-Explore", kind: "sub", parentId: "Main" },
			sessionId: "session-1",
			name: "explore the dock",
			provider: "viewed-dock",
			model: "viewed-model-a",
			effort: "high",
			context: { tokens: 1200, contextWindow: 64_000 },
		});
		expect(complete).toEqual({
			agent: { id: "0-Explore", kind: "sub", parentId: "Main" },
			sessionId: "session-1",
			name: "explore the dock",
			provider: "viewed-dock",
			model: "viewed-model-a",
			effort: "high",
			context: { tokens: 1200, contextWindow: 64_000 },
			unavailable: [],
		});

		// A session with no model, no effort and no measurable context: the missing facts are named,
		// and the ones the host does own are untouched.
		const partial = outlet.viewedSessionFacts({
			agent: { id: "Main", kind: "main" },
			sessionId: "session-2",
			name: "unnamed",
		});
		expect(partial.unavailable).toEqual(["provider", "model", "effort", "context"]);
		expect(partial.provider).toBeUndefined();
		expect(partial.model).toBeUndefined();
		expect(partial.effort).toBeUndefined();
		expect(partial.context).toBeUndefined();
		expect(partial.sessionId).toBe("session-2");
		expect(partial.name).toBe("unnamed");
		expect(partial.agent).toEqual({ id: "Main", kind: "main" });
	});

	test("a target switch, a same-target fact change and an invalidation each notify; unsubscribe stops it", () => {
		const main = watchedSession({
			name: "main session",
			sessionId: "session-main",
			model: { provider: "viewed-dock", id: "viewed-model-a" },
			thinkingLevel: "low",
			context: { tokens: 100, contextWindow: 64_000 },
		});
		const sub = watchedSession({
			name: "subagent",
			sessionId: "session-sub",
			model: { provider: "viewed-dock", id: "viewed-model-b" },
			thinkingLevel: "high",
			context: { tokens: 200, contextWindow: 64_000 },
		});
		// The view the host owns: focused on the subagent until a switch below moves it back to main.
		let focused: "main" | "sub" = "sub";
		const view = (): View =>
			focused === "sub"
				? {
						target: {
							agent: { id: "0-Explore", kind: "sub", parentId: "Main" },
							sessionId: "session-sub",
							name: "subagent",
							provider: "viewed-dock",
							model: "viewed-model-b",
							effort: "high",
							context: { tokens: 200, contextWindow: 64_000 },
						},
						session: sub.session,
					}
				: {
						target: {
							agent: { id: "Main", kind: "main" },
							sessionId: "session-main",
							name: "main session",
							// Main's own facts are read live from its session, not from the view above.
							provider: main.state.model?.provider,
							model: main.state.model?.id,
							effort: main.state.thinkingLevel,
							context: main.state.context,
						},
						session: main.session,
					};
		const broadcaster = new outlet.ViewedSessionBroadcaster(view);
		const seen: Facts[] = [];
		const unsubscribe = broadcaster.subscribe(facts => seen.push(facts));

		// Target switch: the host moves the view to main, so what is read and delivered is main.
		focused = "main";
		broadcaster.notify();
		expect(seen).toHaveLength(1);
		expect(seen[0]?.agent).toEqual({ id: "Main", kind: "main" });
		expect(seen[0]?.sessionId).toBe("session-main");
		expect(seen[0]?.model).toBe("viewed-model-a");
		expect(seen[0]?.unavailable).toEqual([]);
		// The read is live: it follows the same switch without a cached snapshot.
		expect(broadcaster.read().agent.id).toBe("Main");

		// Same-target fact change: main's own model change is delivered with main's identity.
		main.state.model = { provider: "viewed-dock", id: "viewed-model-b" };
		main.state.thinkingLevel = "high";
		main.state.context = { tokens: 900, contextWindow: 64_000 };
		main.emit({ type: "model_changed" });
		expect(seen).toHaveLength(2);
		expect(seen[1]?.agent.id).toBe("Main");
		expect(seen[1]?.model).toBe("viewed-model-b");
		expect(seen[1]?.effort).toBe("high");
		expect(seen[1]?.context).toEqual({ tokens: 900, contextWindow: 64_000 });

		// An event that cannot change any published fact is not a delivery.
		sub.emit({ type: "message_update" });
		main.emit({ type: "message_update" });
		expect(seen).toHaveLength(2);

		// Same-target context change: a finished message is a context fact change.
		main.emit({ type: "message_end" });
		expect(seen).toHaveLength(3);

		// Invalidation: the focused agent is gone and the view re-attaches to main, which the host
		// announces; the delivered snapshot is main's, never the dead target's.
		focused = "sub";
		broadcaster.notify();
		expect(seen).toHaveLength(4);
		expect(seen[3]?.sessionId).toBe("session-sub");
		focused = "main";
		broadcaster.notify();
		expect(seen).toHaveLength(5);
		expect(seen[4]?.sessionId).toBe("session-main");

		// Unsubscribe: no further deliveries, while reads stay live.
		unsubscribe();
		main.emit({ type: "model_changed" });
		broadcaster.notify();
		expect(seen).toHaveLength(5);
		expect(broadcaster.read().agent.id).toBe("Main");
		broadcaster.dispose();
		expect(main.subscribers()).toBe(0);
	});

	test("a source over one live session reads its facts and follows its own model, effort and context events", () => {
		const session = watchedSession({
			name: "self",
			sessionId: "session-self",
			model: { provider: "viewed-dock", id: "viewed-model-a" },
			thinkingLevel: "medium",
			context: { tokens: 42, contextWindow: 64_000 },
		});
		const source = outlet.createSessionViewedSessionSource({
			agent: { id: "Main", kind: "main" },
			session: session.session,
		});
		expect(source.read()).toEqual({
			agent: { id: "Main", kind: "main" },
			sessionId: "session-self",
			name: "self",
			provider: "viewed-dock",
			model: "viewed-model-a",
			effort: "medium",
			context: { tokens: 42, contextWindow: 64_000 },
			unavailable: [],
		});

		const seen: Facts[] = [];
		const unsubscribe = source.subscribe(facts => seen.push(facts));
		session.state.model = { provider: "viewed-dock", id: "viewed-model-b" };
		session.state.thinkingLevel = "off";
		session.state.context = { tokens: 77, contextWindow: 64_000 };
		session.emit({ type: "thinking_level_changed" });
		expect(seen).toHaveLength(1);
		expect(seen[0]?.effort).toBe("off");
		expect(seen[0]?.model).toBe("viewed-model-b");
		session.emit({ type: "queue_update" });
		expect(seen).toHaveLength(1);
		unsubscribe();
		session.emit({ type: "model_changed" });
		expect(seen).toHaveLength(1);
	});
});
