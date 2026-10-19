/**
 * State follow and session observation are declared and managed separately, and neither one reaches
 * the Owner's cell to write it (P21, P22, P23; S1, S2; ticket 06).
 *
 * Two things are under test here, both at the seams the contract states. The first is the *reading*
 * half of a followed field: a session of this process that reads its Owner's value is answered by the
 * seat this process serves — no location record, no endpoint, no configuration — while a session
 * whose Owner is served elsewhere is answered by the framework's own local access. The value read is
 * the Owner's *current* one: it follows the Owner's own write, in either direction, and the read
 * never writes anything back.
 *
 * The second is that observing a session has nothing to do with the field following anything: an
 * extension that declares no `follow` at all still has its Owner's seat receiving the registration
 * and the later readings of a session a *real* other process ran, and adopting them changes nothing
 * of the Owner's own declared value. What this file deliberately does not double is the carrier: the
 * cases that say another process registers and updates start a real child process over a real named
 * pipe or socket file, and every wait is a bounded wait on that process's own answer.
 *
 * The pi assemblies' own in-process path — two bindings of one process, the Owner's seat served by
 * one and read by the other — is `owner-follow.test.ts` (§ "the pi assembly reads a followed Owner a
 * session this process serves holds"); the cross-process read of a followed value, over the carrier
 * and the state of a real serving process, is `owner-follow-processes.test.ts`.
 */
import { afterEach, describe, expect, test, vi } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { SessionFacts, SessionObservationReader } from "../../framework/interface/session";
import type { OwnerReference } from "../../framework/interface/state";
import type { ObservedSession } from "../../framework/runtime/port";
import { StateStore } from "../../framework/core/state";
import { SubagentAccess } from "../../framework/core/subagent-access";
import {
	type AccessTarget,
	createOwnerAccessPublisher,
	localOwnerAccess,
	openOwnerAccess,
} from "../../framework/modules/local-access";
import { type ExtensionDefinition, defineExtension } from "../../framework/interface";
import { type PortDouble, portDouble } from "./support/harness-port-double";
import {
	type ObservationChildPlan,
	type RunningObservationChild,
	startObservationChild,
} from "./support/observation-access-child-runner";

/** The declared field every probe owns. */
const FIELD = "enabled";

/** The Owner the deliveries below name: the value belongs to it, and the sessions follow it. */
const OWNER: OwnerReference = { kind: "owner", key: "main:independence-owner" };

/** The same Owner as a subagent session resolves it: `inherited` names the session that owns the value. */
const FOLLOWED: OwnerReference = { kind: "inherited", key: OWNER.key };

/** The session this process serves: the root, and the Owner of the value under test. */
const MAIN: SessionFacts = { sessionId: "independence-owner-session", kind: "main", name: "owner", unavailable: [] };

/** The session the real child process runs: directly below the served one. */
const CHILD: SessionFacts = {
	sessionId: "independence-child-session",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	name: "child",
	unavailable: [],
};

/** A field that declares `follow`, with the three public consumption points a read reaches. */
const FOLLOW_PROBE: ExtensionDefinition = defineExtension({
	id: "follow-independence-probe",
	displayName: "followIndependenceProbe",
	state: { inheritance: "follow" },
	commands: [{ type: "toggle", name: "follow-independence-probe", state: FIELD, description: "toggle the probe" }],
	prompts: [{ tag: "init", strategy: "first-enabled-run", content: "the probe's contribution" }],
	marker: { text: "◈ followIndependenceProbe" },
});

/** The same declaration with the default inheritance: the subagent reads the declared default. */
const PLAIN_PROBE: ExtensionDefinition = defineExtension({
	id: "plain-independence-probe",
	displayName: "plainIndependenceProbe",
	state: { field: FIELD },
	commands: [{ type: "toggle", name: "plain-independence-probe", state: FIELD, description: "toggle the probe" }],
	marker: { text: "◈ plainIndependenceProbe" },
});

/** One temporary directory that stands in for the repository: a shared configuration and its runtime dir. */
interface Workspace {
	readonly root: string;
	readonly configPath: string;
	readonly runtimeDirectory: string;
	dispose(): void;
}

function workspace(): Workspace {
	const root = mkdtempSync(path.join(tmpdir(), "framework-follow-independence-"));
	const directory = path.join(root, "framework");
	mkdirSync(directory, { recursive: true });
	const configPath = path.join(directory, "config.yaml");
	writeFileSync(configPath, 'runtimeDir: ".runtime"\n', "utf8");
	return {
		root,
		configPath,
		runtimeDirectory: path.join(directory, ".runtime"),
		dispose: () => rmSync(root, { recursive: true, force: true }),
	};
}

/** One empty temporary directory: the working directory a real process is started in. */
function elsewhere(): { readonly directory: string; dispose(): void } {
	const directory = mkdtempSync(path.join(tmpdir(), "framework-follow-independence-cwd-"));
	return { directory, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

/** Waits until a condition holds, or states that it never did. */
async function until(condition: () => boolean, message: string, timeoutMs = 10000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(message);
		/* The observed event belongs to another process; there is no clock to advance for it. */
		await Bun.sleep(10);
	}
}

/** Every location record under one runtime directory. */
function recordsIn(runtimeDirectory: string): readonly string[] {
	if (!existsSync(runtimeDirectory)) return [];
	return readdirSync(runtimeDirectory).filter(name => name.startsWith("owner-access-"));
}

/** One reading of one session a real process ran, with the readings that process stated. */
function reading(
	readings: { readonly activity?: "working" | "idle"; readonly tokens?: number } = {},
): ObservedSession {
	return {
		session: CHILD,
		owner: FOLLOWED,
		...(readings.activity === undefined ? {} : { activity: readings.activity }),
		...(readings.tokens === undefined
			? {}
			: { context: { tokens: readings.tokens, provider: "official", model: "model-alpha" } }),
	};
}

/** The children this file started, ended after each case. */
const children: RunningObservationChild[] = [];
const workspaces: Array<{ dispose(): void }> = [];

afterEach(async () => {
	for (const child of children.splice(0)) await child.finish().catch(() => undefined);
	while (workspaces.length > 0) workspaces.pop()?.dispose();
});

describe("a followed field reads the Owner this process serves, and follows its write (P21)", () => {
	test("the seat is answered in this process — no location, no configuration — and the value moves both ways", async () => {
		const publisher = createOwnerAccessPublisher({ report: () => {} });
		const serving = new StateStore({
			field: FIELD,
			persistence: "session-entry",
			access: new SubagentAccess({ extension: FOLLOW_PROBE.id, publisher }),
		});
		// The reading half of the same framework module, as an assembly wires it — pointed at a
		// configuration file that is not there. A read answered in this process never resolves a runtime
		// directory, so every read below is the in-process one and not a carrier round trip. Every reach
		// this reader makes is kept, so a case waits for the framework's own continuation rather than
		// for a duration.
		const target: AccessTarget = { extension: FOLLOW_PROBE.id, owner: OWNER.key };
		const reached: Array<Promise<unknown>> = [];
		const following: PortDouble = portDouble({
			follow: {
				open: (owner, { waitMs }) => {
					const attempt = openOwnerAccess({
						target: { ...target, owner },
						waitMs,
						configPath: path.join(tmpdir(), "framework-follow-independence-absent.yaml"),
					});
					reached.push(attempt.then(() => undefined, () => undefined));
					return attempt;
				},
			},
		});
		try {
			// The Owner's own boundary, with the value its own session restored.
			serving.reconcile({
				owner: OWNER,
				event: { kind: "session_start", reason: "new" },
				statePayloads: [{ [FIELD]: true }],
				publishMarker: () => {},
			});
			expect(localOwnerAccess(target)).toBeDefined();
			following.bind(FOLLOW_PROBE, {});

			// First semantic use waits for the initial value, even when the access answers directly
			// from another store in this process without a location record or configuration read.
			const on = await following.initiateRun(FOLLOWED);
			expect(on.contribution).toEqual({
				identity: "follow-independence-probe:init",
				content: "the probe's contribution",
				display: false,
				attribution: "agent",
			});
			// The same value is what the marker area projects for that seat: the injected prompt and the
			// area read one snapshot rather than each making a call of its own.
			expect(on.markers[on.markers.length - 1]).toEqual(["◈ followIndependenceProbe"]);

			// The Owner's own value changes, through the same declared-value path a command writes with:
			// the next consumption reads the value the Owner now holds rather than the one it read before.
			const writer = serving.writer({ ownerKey: OWNER.key, persist: () => {}, publishMarker: () => {} });
			writer.write(false);
			expect(writer.read()).toBe(false);
			const off = await following.initiateRun(FOLLOWED);
			expect(off.contribution).toBeUndefined();
			expect(off.markers[off.markers.length - 1]).toEqual([]);

			// And back again: the read follows both directions, and none of the reads wrote anything of
			// the Owner's — the cell still holds what the Owner's own write left it.
			writer.write(true);
			expect((await following.initiateRun(FOLLOWED)).contribution).toBeDefined();
			expect(serving.view(OWNER.key).read(FIELD)).toBe(true);
		} finally {
			following.state.dispose();
			publisher.dispose();
		}
	});

	test("the access is spent with the Owner's life, and the life entered next is what a later read reaches", async () => {
		// What spaces the framework's recovery is a delay measured against the clock, so this case runs on
		// its own clock: the failure the retired seat leaves behind is advanced through, never waited for.
		vi.useFakeTimers();
		const publisher = createOwnerAccessPublisher({ report: () => {} });
		const serving = new StateStore({
			field: FIELD,
			persistence: "session-entry",
			access: new SubagentAccess({ extension: FOLLOW_PROBE.id, publisher }),
		});
		const target: AccessTarget = { extension: FOLLOW_PROBE.id, owner: OWNER.key };
		const reached: Array<Promise<unknown>> = [];
		const following = portDouble({
			follow: {
				policy: { waitMs: 2000, baseMs: 250, maxMs: 8000 },
				open: (owner, { waitMs }) => {
					const attempt = openOwnerAccess({
						target: { ...target, owner },
						waitMs,
						configPath: path.join(tmpdir(), "framework-follow-independence-absent.yaml"),
					});
					reached.push(attempt.then(() => undefined, () => undefined));
					return attempt;
				},
			},
		});
		try {
			// The Owner's first life, with the value it restored: the reach establishes the access and the
			// read is that value.
			serving.reconcile({
				owner: OWNER,
				event: { kind: "session_start", reason: "new" },
				statePayloads: [{ [FIELD]: true }],
				publishMarker: () => {},
			});
			following.bind(FOLLOW_PROBE, {});
			await following.initiateRun(FOLLOWED);
			await Promise.allSettled(reached);
			await Promise.resolve();
			expect((await following.initiateRun(FOLLOWED)).contribution).toBeDefined();

			// The Owner's life ends: the seat is gone, and so is the access that stood for it. What the
			// next read answers is the field's declared default — a spent access states nothing rather
			// than the value it can no longer stand behind, which is what the carrier's own suite has
			// the follower answer after the same boundary.
			serving.reconcile({
				owner: OWNER,
				event: { kind: "session_end", reason: "disposed" },
				statePayloads: [],
				publishMarker: () => {},
			});
			expect(localOwnerAccess(target)).toBeUndefined();
			expect((await following.initiateRun(FOLLOWED)).contribution).toBeUndefined();

			// The Owner is entered again with the other restored value. Nothing of the retired life is
			// carried into it: the read after the fresh reach is the value this life holds, and this
			// life's own writes are followed from there.
			serving.reconcile({
				owner: OWNER,
				event: { kind: "session_start", reason: "resume" },
				statePayloads: [{ [FIELD]: false }],
				publishMarker: () => {},
			});
			expect(localOwnerAccess(target)).toBeDefined();
			expect(serving.view(OWNER.key).read(FIELD)).toBe(false);
			// The attempt the retired seat left spaced out is what the clock below passes; the read after
			// it is the fresh access's, and the value it reads is this life's current one.
			vi.advanceTimersByTime(1000);
			expect((await following.initiateRun(FOLLOWED)).contribution).toBeUndefined();
			await Promise.allSettled(reached);
			await Promise.resolve();
			const writer = serving.writer({ ownerKey: OWNER.key, persist: () => {}, publishMarker: () => {} });
			writer.write(true);
			expect((await following.initiateRun(FOLLOWED)).contribution).toBeDefined();
			writer.write(false);
			expect((await following.initiateRun(FOLLOWED)).contribution).toBeUndefined();
		} finally {
			following.state.dispose();
			publisher.dispose();
			vi.useRealTimers();
		}
	});
});

describe("a field that declares no follow is observed all the same (P23)", () => {
	test("a real process registers and then updates on that Owner's seat, and nothing of the Owner's changes", async () => {
		const ws = workspace();
		workspaces.push(ws);
		const cwd = elsewhere();
		workspaces.push(cwd);
		const target: AccessTarget = { extension: PLAIN_PROBE.id, owner: OWNER.key };

		// The serving half the adapter builds for this process: the seat is the Owner's own, and what
		// arrives on it is handed to the binding that received it.
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath, report: () => {} });
		const following = portDouble({
			observationAccess: {
				receive: (owner, sink) => publisher.receive({ extension: PLAIN_PROBE.id, owner }, sink),
				deliver: () => {},
			},
		});
		// The extension's own half: what a consumer of this process's observations reads.
		let source: SessionObservationReader | undefined;
		following.bind(PLAIN_PROBE, {
			factory: context => {
				source = context.session.observations;
				return {};
			},
		});

		// The Owner's own boundary, with the value its session restored: the independent given value
		// every assertion below compares against.
		following.deliverSession(OWNER, { session: MAIN, statePayloads: [{ [FIELD]: true }] });
		expect(following.state.view(OWNER.key).read(FIELD)).toBe(true);
		// What this process serves on that seat is an observation seat and nothing else: a field that
		// declares no `follow` offers no value of its owner's to any reader.
		expect(localOwnerAccess(target)).toBeUndefined();

		// One real process, running the session itself: its own facts, its own activity, and a later
		// reading of its own context — the registration and the update a follow field would have
		// carried, delivered for a field that declares none.
		const plan: ObservationChildPlan = {
			target,
			readings: [reading({ activity: "working", tokens: 4242 }), reading({ activity: "idle", tokens: 8888 })],
			resultPath: path.join(cwd.directory, "child-report.json"),
			configPath: ws.configPath,
		};
		const child = startObservationChild(plan, { cwd: cwd.directory });
		children.push(child);
		try {
			await child.ready();
			await until(() => recordsIn(ws.runtimeDirectory).length === 1, "the observation seat published no record");
			child.send({ t: "deliver", index: 0 });
			await until(
				() => source?.read(CHILD.sessionId)?.context?.tokens === 4242,
				"the registration never reached this process's own observations",
			);
			child.send({ t: "deliver", index: 1 });
			await until(
				() => source?.read(CHILD.sessionId)?.context?.tokens === 8888,
				"the later reading never reached this process's own observations",
			);

			// The delivering process really reached the seat — the record and the endpoint this process
			// published are what it connected through — and what it states is the reading it holds.
			const report = await child.report();
			expect(report.reached).toBe(true);
			expect(report.ended).toBe(false);
			expect(report.delivered).toEqual([CHILD.sessionId, CHILD.sessionId]);

			// The framework's own record holds the session by its own identity, with the activity and
			// the latest context the process that runs it stated — which is the whole of what this
			// extension consumes about it.
			const held = source?.read(CHILD.sessionId);
			expect(held?.session).toEqual(CHILD);
			expect(held?.owner).toEqual(FOLLOWED);
			expect(held?.activity).toBe("idle");
			expect(held?.context).toEqual({ tokens: 8888, provider: "official", model: "model-alpha" });

			// Nothing of the observation reached the Owner's declared value: the field still reads the
			// value the Owner's own boundary restored, in this process and in any medium.
			expect(following.state.view(OWNER.key).read(FIELD)).toBe(true);
		} finally {
			publisher.dispose();
		}
	});
});

describe("a reading from another process writes nothing of the Owner's (P22)", () => {
	test("it is adopted as the reading it is, and the Owner's given value is the one its boundary set", () => {
		const following = portDouble({ observationsAcrossProcesses: true });
		following.bind(PLAIN_PROBE, {});
		const start = following.deliverSession(OWNER, { session: MAIN, statePayloads: [{ [FIELD]: true }] });
		expect(start.persisted).toEqual([]);
		expect(following.state.view(OWNER.key).read(FIELD)).toBe(true);

		// One reading, stated the way the process that ran the session states it: identity, activity
		// and context together, on the seat this process serves for that Owner.
		const renderings = following.markerUpdates.length;
		following.deliverObserved(reading({ activity: "working", tokens: 4242 }));
		expect(following.observations.read(CHILD.sessionId)?.activity).toBe("working");
		expect(following.observations.read(CHILD.sessionId)?.context?.tokens).toBe(4242);

		// The Owner's own value is untouched by it: the reading states what the session that ran it
		// observed, and the channel it arrived on carries readings only — nothing of it is written to
		// the Owner's cell, nothing is recorded in any medium, and the area is not republished for a
		// write that never happened.
		expect(following.state.view(OWNER.key).read(FIELD)).toBe(true);
		expect(following.markerUpdates).toHaveLength(renderings);
		expect(following.diagnostics).toEqual([]);
	});
});
