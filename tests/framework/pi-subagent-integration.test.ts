/**
 * The pi adapter's subagent-provider integration at the public adapter seam (S1; contract P3;
 * ticket 05).
 *
 * What an extension is told is one settled answer per process — `subagents`, `none`, or a `failed`
 * carrying which part broke and the diagnosis the adapter reported — and what an operator reads is
 * that diagnosis on the adapter's own channel. This suite drives the third party's *published*
 * surfaces of the pinned provider (`pi-subagents@0.78.0`) and observes only those two: what the
 * extension's initialization was handed, and what the diagnostic channel said.
 *
 * The distinction the contract asks for is what every case below pins: a process that carries no
 * provider, or one where no provider is running, is the normal no-subagent shape; a requirement the
 * provider's own registration refuses is a **registration** failure; an interface that cannot be
 * read (another version, a refusal, an answer that states no session) is a **protocol** failure; and
 * an interface answering for another session is an **identity** failure. None of them is answered as
 * another, and none of the failures is answered as the none-mode absence.
 *
 * One fact is read from the provider itself rather than from the adapter: whether a session's
 * requirement is really in its registry, through the module it publishes for exactly that — which is
 * the independent source of truth for "the registration happened" and "the registration was
 * released", since the adapter's own account of either is no evidence of it. That module is the same
 * one the adapter resolves at first use (a module instance per process), so nothing is stood in for
 * it here.
 */
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { loadPiSubagentProvider } from "../../adapters/pi/thirdParty/pi-subagents/provider";
import { afterEach, describe, expect, test, vi } from "bun:test";
import { drain } from "../support/pending-query";
import { defineImplementation, type InitializationDelivery } from "../../framework/interface";
import { piAdapter, type PiExtensionApi } from "../../adapters/pi";
import type { SubagentIntegrationFailure } from "../../framework/interface/subagent";
import { withCapturedStderrAsync } from "./support/captured-stderr";
import { disposeSessionFiles, sessionFileDir } from "./support/pi-session-files";
import {
	PROVIDER_READY_CHANNEL,
	PROVIDER_REPLY_PREFIX,
	PROVIDER_REQUEST_CHANNEL,
	type PiSurface,
	type PiSurfaceSession,
	boundPiSurface,
	PI_SURFACE_PROBE,
} from "./support/pi-surface-double";

afterEach(disposeSessionFiles);

// Read the same public module as production, including an explicitly configured installation.
const { registerRequiredChildExtensions } = await loadPiSubagentProvider() as {
	registerRequiredChildExtensions(options: {
		sessionId: string;
		extensions: Array<{ id: string; path: string }>;
		requireForAllRunners: boolean;
	}): { dispose(): void };
};

/** The repository root: this suite lives in `tests/framework/`. */
const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");

/**
 * The child entry the probe assembly declares, as a production assembly declares one: the module this
 * repository's own pi extension is loaded from.
 */
const CHILD_ENTRY = path.join(REPO_ROOT, "entrypoints", "pi", "model-cost.ts");

/** The canonical path of that entry, as the provider's own registration canonicalizes it. */
const CANONICAL_CHILD_ENTRY = realpathSync(CHILD_ENTRY);

/**
 * Whether the provider's own registry already holds a requirement for one session.
 *
 * The provider publishes one registration per session and refuses a second, so *its own* refusal is
 * the independent statement that something holds a requirement for that session — and its acceptance
 * is the statement that nothing does. A probe registration is disposed at once, so reading the fact
 * leaves the registry as it found it.
 */
function providerHoldsRequirement(sessionId: string): boolean {
	try {
		const probe = registerRequiredChildExtensions({
			sessionId,
			extensions: [{ id: "pi-int-requirement-probe", path: CANONICAL_CHILD_ENTRY }],
			requireForAllRunners: true,
		});
		probe.dispose();
		return false;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("already registered")) return true;
		throw error;
	}
}

/**
 * One session as pi reports it, for the cases below.
 *
 * The ids are the case's own, and each case uses its own: the provider's registry is a fact of the
 * process, so a case that reused another's id would be reading another case's requirement.
 */
function session(sessionId: string): PiSurfaceSession {
	return {
		sessionId,
		name: `pi ${sessionId}`,
		model: { id: "deepseek-flash", provider: "deepseek" },
		thinkingLevel: "medium",
		idle: true,
		pending: false,
	};
}

/**
 * The provider's own `ping` answer for one session, as the pinned provider shapes it: the interface
 * version it speaks and the session it is serving.
 */
function pingAnswer(sessionId: string): Record<string, unknown> {
	return {
		version: 1,
		methods: ["ping", "status", "spawn"],
		capabilities: { asyncSpawn: true },
		events: { ready: PROVIDER_READY_CHANNEL },
		session: { cwd: process.cwd(), sessionId, sessionFile: null },
	};
}

/** The provider's own reply envelope for one query, correlated by the id the query itself carried. */
function providerReplies(surface: PiSurface, request: Record<string, unknown>, body: Record<string, unknown>): void {
	const requestId = request.requestId;
	if (typeof requestId !== "string") throw new Error("the adapter's query carried no request id");
	surface.bus.publish(`${PROVIDER_REPLY_PREFIX}${requestId}`, {
		version: 1,
		requestId,
		method: "ping",
		...body,
	});
}

/** The settled answer one initialization was handed, as the failure a case asserts it is. */
function failedSettle(delivery: InitializationDelivery): {
	readonly failure: SubagentIntegrationFailure;
	readonly diagnosis: string;
} {
	const answer = delivery.subagents;
	if (answer.mode !== "failed") throw new Error(`the integration settled as ${answer.mode}, not as a failure`);
	return answer;
}

/** What one run settled as, together with everything the adapter reported while it ran. */
async function settledWithDiagnosis(
	run: () => Promise<InitializationDelivery>,
): Promise<{ readonly diagnosis: string; readonly delivery: InitializationDelivery }> {
	const { stderr, value } = await withCapturedStderrAsync(run);
	return { diagnosis: stderr, delivery: value };
}

/** How many microtask turns a requirement wait gives the adapter's own work before it gives up. */
const REQUIREMENT_TURNS = 200;

/**
 * Waits for the provider's registry to state what a case expects about one session.
 *
 * Taking a requirement is the adapter's own asynchronous work — it resolves the provider's module
 * first — and it is deliberately not something an extension is told about, so the wait is on the fact
 * itself: the provider's own registry, re-read a microtask at a time, never on a duration, so it
 * returns as soon as the fact is there rather than after a guessed delay.
 */
async function waitForRequirement(sessionId: string, holds: boolean): Promise<boolean> {
	for (let turn = 0; turn < REQUIREMENT_TURNS; turn++) {
		if (providerHoldsRequirement(sessionId) === holds) return true;
		await Promise.resolve();
	}
	return providerHoldsRequirement(sessionId) === holds;
}

describe("a harness with no subagent provider is the normal no-subagent shape (P3)", () => {
	test("an assembly without a child entry does not engage a running provider", async () => {
		const surface = boundPiSurface();
		const main = session("pi-int-assembly-disabled");
		surface.bus.publish(PROVIDER_READY_CHANNEL, { ...pingAnswer("another-session"), version: 99 });
		surface.sessionStarts(main, "startup");
		expect((await surface.initialized()).subagents).toEqual({ mode: "none" });
		expect(providerHoldsRequirement(main.sessionId)).toBe(false);
		expect(surface.bus.emissions.filter(item => item.channel === PROVIDER_REQUEST_CHANNEL)).toEqual([]);
		await surface.sessionShutsDown(main, "quit");
	});

	// S1/P13: the published handshake owns one 300 ms budget, not a retry loop or a
	// fresh budget after an uncorrelated reply. Observe initialization and outbound requests.
	test("an unanswered handshake waits exactly one budget and never retries", async () => {
		vi.useFakeTimers();
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-one-handshake-budget");
		try {
			surface.sessionStarts(main, "startup");
			const request = await surface.providerRequest(0);
			// Another request's reply must neither initialize this entry nor restart its clock.
			surface.bus.publish(`${PROVIDER_REPLY_PREFIX}unrelated`, {
				success: true, data: pingAnswer(main.sessionId),
			});
			vi.advanceTimersByTime(299);
			await drain();
			expect(surface.initializations).toEqual([]);
			vi.advanceTimersByTime(1);
			expect((await surface.initialized()).subagents).toEqual({ mode: "none" });
			vi.advanceTimersByTime(3_000);
			await drain();
			expect(surface.bus.emissions.filter(item => item.channel === PROVIDER_REQUEST_CHANNEL).map(item => item.data)).toEqual([request]);
		} finally {
			vi.useRealTimers();
			await surface.sessionShutsDown(main, "quit");
		}
	});

	test("no provider running answers with the no-subagent mode, and reports no failure", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-none");

		const { diagnosis, delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			// The query really goes out on the provider's own channel, on the versioned envelope its
			// documentation states; nothing is there to answer it.
			const request = await surface.providerRequest(0);
			expect(request.method).toBe("ping");
			expect(request.version).toBe(1);
			return await surface.initialized();
		});

		expect(delivery.subagents).toEqual({ mode: "none" });
		expect(diagnosis).toBe("");

		// The requirement is in place all the same: it is what makes the sessions a provider would
		// spawn load this entry, and the mode reported to the extension is not derived from it.
		expect(providerHoldsRequirement(main.sessionId)).toBe(true);
	});

	test("an answered query settles as an integration, with the session really required in the provider's registry", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-served");

		const { diagnosis, delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			providerReplies(surface, await surface.providerRequest(0), { success: true, data: pingAnswer(main.sessionId) });
			return await surface.initialized();
		});

		expect(delivery.subagents).toEqual({ mode: "subagents" });
		// A working integration is not a failure: nothing is reported about it.
		expect(diagnosis).toBe("");
		expect(providerHoldsRequirement(main.sessionId)).toBe(true);
	});

	test("a provider that announced itself needs no query", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-announced");
		// The provider was loaded beside this entry and stated itself before this session began, which is
		// the ordering its own announcement exists for.
		surface.bus.publish(PROVIDER_READY_CHANNEL, pingAnswer(main.sessionId));

		const { delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			return await surface.initialized();
		});

		expect(delivery.subagents).toEqual({ mode: "subagents" });
		expect(surface.bus.emissions.some(emission => emission.channel === PROVIDER_REQUEST_CHANNEL)).toBe(false);
	});

	test("the mode is settled once: a provider appearing later, and a child session, move nothing", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-stable");
		const child = session("pi-int-stable-child");

		const { diagnosis, delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			await surface.providerRequest(0);
			// Nothing answers within the budget, so this process settles as one that runs no provider.
			const settled = await surface.initialized();
			expect(settled.subagents).toEqual({ mode: "none" });

			// Afterwards the provider states itself — on an interface this adapter cannot read — and a
			// child session of this same process begins and ends. Every one of those is a delivery the
			// surface really made, and none of them re-settles the answer the extension was given: a
			// second settle would be diagnosed, and none is.
			surface.bus.publish(PROVIDER_READY_CHANNEL, { ...pingAnswer(main.sessionId), version: 2 });
			surface.sessionStarts(child, "startup");
			// pi awaits this fact's handler, and the session axis's own end is what follows the round
			// close-out the handler reports, so the case awaits the delivery as pi does.
			await surface.sessionShutsDown(child, "quit");
			expect(surface.sessions.filter(entry => entry.session.sessionId === child.sessionId)).toHaveLength(2);
			return await surface.initialized();
		});

		expect(delivery.subagents).toEqual({ mode: "none" });
		expect(surface.initializations).toHaveLength(1);
		expect(diagnosis).toBe("");
	});
});

describe("multiple extension entries share the provider's one session registration", () => {
	test("codebase-tools and model-cost can both require their child entries", async () => {
		const main = session("pi-int-multiple-entries");
		const surfaces = ["codebase-tools", "model-cost"].map(id =>
			boundPiSurface({
				childEntry: path.join(REPO_ROOT, "entrypoints", "pi", `${id}.ts`),
				definition: { ...PI_SURFACE_PROBE, id },
			}),
		);
		try {
			const { stderr, value } = await withCapturedStderrAsync(async () => {
				for (const surface of surfaces) {
					surface.bus.publish(PROVIDER_READY_CHANNEL, pingAnswer(main.sessionId));
					surface.sessionStarts(main, "startup");
				}
				return await Promise.all(surfaces.map(surface => surface.initialized()));
			});
			expect(value.map(delivery => delivery.subagents)).toEqual([
				{ mode: "subagents" },
				{ mode: "subagents" },
			]);
			expect(stderr).toBe("");
		} finally {
			for (const surface of surfaces) surface.sessionShutsDown(main, "quit");
		}
	});
});

describe("an integration that did not take effect is a failure, not an absence (P3)", () => {
	test("a child entry the provider will not load is a registration failure, reported and diagnosed", async () => {
		const absentEntry = path.join(tmpdir(), "pi-subagent-child-entry-absent.ts");
		const surface = boundPiSurface({ childEntry: absentEntry });
		const main = session("pi-int-registration");

		const { diagnosis, delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			return await surface.initialized();
		});

		const failure = failedSettle(delivery);
		expect(failure.failure).toBe("registration");
		expect(diagnosis).toContain(failure.diagnosis);
		expect(diagnosis).toContain("did not accept this entry as a required child extension");
		// The provider refused the requirement, so its own registry holds none for this session, and no
		// interface was queried that this entry could not first state its requirement to.
		expect(providerHoldsRequirement(main.sessionId)).toBe(false);
		expect(surface.bus.emissions.some(emission => emission.channel === PROVIDER_REQUEST_CHANNEL)).toBe(false);
	});

	test("an interface version this adapter does not read is a protocol failure", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-version");

		const { diagnosis, delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			providerReplies(surface, await surface.providerRequest(0), {
				success: true,
				data: { ...pingAnswer(main.sessionId), version: 2 },
			});
			return await surface.initialized();
		});

		expect(failedSettle(delivery).failure).toBe("protocol");
		expect(diagnosis).toContain("interface version 2");
	});

	test("a provider that refuses the query is a protocol failure carrying its own words", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-refused");

		const { diagnosis, delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			providerReplies(surface, await surface.providerRequest(0), {
				success: false,
				error: { code: "not_found", message: "the provider is not serving this session yet" },
			});
			return await surface.initialized();
		});

		expect(failedSettle(delivery).failure).toBe("protocol");
		expect(diagnosis).toContain("the provider is not serving this session yet");
	});

	test("a provider that names no session claims none: its interface version settles the integration", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-nosession");

		const { diagnosis, delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			// A query answered before the provider has a session context: its own interface, its own
			// version, and no statement about which session it serves.
			providerReplies(surface, await surface.providerRequest(0), {
				success: true,
				data: { version: 1, methods: ["ping"] },
			});
			return await surface.initialized();
		});

		expect(delivery.subagents).toEqual({ mode: "subagents" });
		expect(diagnosis).toBe("");
		expect(providerHoldsRequirement(main.sessionId)).toBe(true);
	});

	test("a statement naming another session settles as an identity failure, wherever it arrives", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-identity-late");

		const { diagnosis, delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			// The reply states no session and is therefore not the statement the settle reads; the
			// provider's own announcement, which does name a session, arrives while the query is out and
			// is what decides the integration.
			providerReplies(surface, await surface.providerRequest(0), {
				success: true,
				data: { version: 1, methods: ["ping"] },
			});
			surface.bus.publish(PROVIDER_READY_CHANNEL, pingAnswer("pi-sess-somebody-else"));
			return await surface.initialized();
		});

		expect(failedSettle(delivery).failure).toBe("identity");
		expect(diagnosis).toContain("pi-sess-somebody-else");
	});

	test("an interface answering for another session is an identity failure naming both", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-identity");

		const { diagnosis, delivery } = await settledWithDiagnosis(async () => {
			surface.sessionStarts(main, "startup");
			providerReplies(surface, await surface.providerRequest(0), {
				success: true,
				data: pingAnswer("pi-sess-somebody-else"),
			});
			return await surface.initialized();
		});

		expect(failedSettle(delivery).failure).toBe("identity");
		expect(diagnosis).toContain("pi-sess-somebody-else");
		expect(diagnosis).toContain("pi-int-identity");
	});
});

describe("what this integration holds is released with the session it belongs to (P3)", () => {
	// S1/P10/P14: a native registration refusal must not leave a child requirement or poison
	// a later binding of the same real assembly. The failure is injected at Pi's public on boundary.
	test("a refused binding leaves no effects and the same assembly can bind again", async () => {
		const surface = boundPiSurface();
		const main = session("pi-int-rebind-after-refusal");
		const initialized = Promise.withResolvers<InitializationDelivery>();
		const starts: string[] = [];
		const factory = piAdapter({ ...PI_SURFACE_PROBE, id: "pi-rebind" }, {
			childEntry: CHILD_ENTRY,
			implementation: defineImplementation({
				create: () => ({}),
				initialize: (_state, delivery) => initialized.resolve(delivery),
				subscriptions: [{ scope: "session", events: {
					session_start: (_state, delivery) => { starts.push(delivery.session.sessionId); },
				} }],
			}),
		});
		let registrations = 0;
		const refusing: PiExtensionApi = {
			...surface.api,
			on: ((event: Parameters<PiExtensionApi["on"]>[0], handler: never) => {
				if (++registrations === 2) throw new Error("native subscription refused");
				return surface.api.on(event, handler);
			}) as PiExtensionApi["on"],
		};
		const { value: refused, stderr } = await withCapturedStderrAsync(async () => factory(refusing));
		expect(refused.bound).toBe(false);
		expect(stderr).toContain("native subscription refused");
		surface.sessionStarts(main, "startup");
		await Promise.resolve();
		expect(starts).toEqual([]);
		expect(providerHoldsRequirement(main.sessionId)).toBe(false);

		expect(factory(surface.api).bound).toBe(true);
		surface.sessionStarts(main, "startup");
		providerReplies(surface, await surface.providerRequest(0), { success: true, data: pingAnswer(main.sessionId) });
		expect((await initialized.promise).subagents).toEqual({ mode: "subagents" });
		expect(starts).toEqual([main.sessionId]);
		expect(providerHoldsRequirement(main.sessionId)).toBe(true);
		await surface.sessionShutsDown(main, "quit");
		expect(providerHoldsRequirement(main.sessionId)).toBe(false);
	});

	// S1/P10/P14: releasing one entry must stop its consumer deliveries, not just call dispose;
	// the second real assembly still observes the same native facts and retains its requirement.
	test("a disposed entry stops deliveries while another binding continues", async () => {
		const main = session("pi-int-independent-release");
		const stopped = boundPiSurface({
			childEntry: CHILD_ENTRY,
			definition: { ...PI_SURFACE_PROBE, id: "pi-release-stopped" },
		});
		const live = boundPiSurface({
			childEntry: path.join(REPO_ROOT, "entrypoints", "pi", "codebase-tools.ts"),
			definition: { ...PI_SURFACE_PROBE, id: "pi-release-live" },
		});
		for (const surface of [stopped, live]) {
			surface.bus.publish(PROVIDER_READY_CHANNEL, pingAnswer(main.sessionId));
			surface.sessionStarts(main, "startup");
			expect((await surface.initialized()).subagents).toEqual({ mode: "subagents" });
		}
		await stopped.sessionShutsDown(main, "quit");
		const before = { sessions: stopped.sessions.length, starts: stopped.starts.length, rounds: stopped.rounds.length };
		try {
			for (const surface of [stopped, live]) {
				surface.sessionRenames(main, "still observable");
				surface.runStarts(main);
				surface.startRequest(main);
			}
			expect({ sessions: stopped.sessions.length, starts: stopped.starts.length, rounds: stopped.rounds.length }).toEqual(before);
			expect(live.sessions.map(delivery => delivery.event.kind)).toEqual(["session_start", "session_facts"]);
			expect(live.starts.map(delivery => delivery.turn.session.sessionId)).toEqual([main.sessionId]);
			expect(live.rounds.map(delivery => delivery.event.kind)).toEqual(["round_start"]);
			expect(providerHoldsRequirement(main.sessionId)).toBe(true);
		} finally {
			await live.sessionShutsDown(main, "quit");
		}
		expect(providerHoldsRequirement(main.sessionId)).toBe(false);
	});

	test("the session's own end releases its requirement, and a later session's is its own", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const first = session("pi-int-release-first");
		surface.sessionStarts(first, "startup");
		providerReplies(surface, await surface.providerRequest(0), { success: true, data: pingAnswer(first.sessionId) });
		await surface.initialized();
		expect(providerHoldsRequirement(first.sessionId)).toBe(true);

		surface.sessionShutsDown(first, "quit");
		expect(providerHoldsRequirement(first.sessionId)).toBe(false);

		// A session that begins after it states its own requirement rather than inheriting a spent one,
		// and releasing the first session's requirement left this one untouched.
		const next = session("pi-int-release-next");
		surface.sessionStarts(next, "startup");
		expect(await waitForRequirement(next.sessionId, true)).toBe(true);
		expect(providerHoldsRequirement(first.sessionId)).toBe(false);
	});

	test("a child session this process runs holds its own requirement, released with its own end", async () => {
		const files = sessionFileDir();
		files.write("parent.jsonl", { type: "session", id: "pi-int-child-main" });
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const main = session("pi-int-child-main");
		const child: PiSurfaceSession = {
			...session("pi-int-child"),
			header: { type: "session", id: "pi-int-child", parentSession: files.path("parent.jsonl") },
		};

		surface.sessionStarts(main, "startup");
		providerReplies(surface, await surface.providerRequest(0), { success: true, data: pingAnswer(main.sessionId) });
		await surface.initialized();

		// A session spawned in this process is one whose own children the provider spawns, so it states
		// its own requirement without displacing the one the main session holds.
		surface.sessionStarts(child, "startup");
		expect(await waitForRequirement(child.sessionId, true)).toBe(true);
		expect(providerHoldsRequirement(main.sessionId)).toBe(true);

		surface.sessionShutsDown(child, "quit");
		expect(providerHoldsRequirement(child.sessionId)).toBe(false);
		expect(providerHoldsRequirement(main.sessionId)).toBe(true);
	});

	test("leaving one session for another releases the session being left", async () => {
		const surface = boundPiSurface({ childEntry: CHILD_ENTRY });
		const first = session("pi-int-transfer-first");
		surface.sessionStarts(first, "startup");
		providerReplies(surface, await surface.providerRequest(0), { success: true, data: pingAnswer(first.sessionId) });
		await surface.initialized();

		const second = session("pi-int-transfer-second");
		surface.sessionStarts(second, "startup");

		// The binding serves one owner at a time: the session it left keeps nothing, and the one it now
		// serves states its own requirement.
		expect(providerHoldsRequirement(first.sessionId)).toBe(false);
		expect(await waitForRequirement(second.sessionId, true)).toBe(true);
		// The session being left ends as its own transition, named by its own identity and key, and the
		// session being entered starts under its own: neither is a spawn of the other.
		expect(surface.sessions.map(entry => entry.event.kind)).toEqual(["session_start", "session_end", "session_start"]);
		expect(surface.sessions[1].event).toEqual({ kind: "session_end", reason: "transferred" });
		expect(surface.sessions[1].session.sessionId).toBe(first.sessionId);
		expect(surface.sessions[1].owner).toEqual({ kind: "owner", key: `main:${first.sessionId}` });
		expect(surface.sessions[2].session.kind).toBe("main");
		expect(surface.sessions[2].owner).toEqual({ kind: "owner", key: `main:${second.sessionId}` });
	});
});
