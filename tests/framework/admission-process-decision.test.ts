/**
 * One version decision per process, shared by every consumer in it (P2, P3; contract S1).
 *
 * The judgement of whether the reported agent-runtime version is in the framework's Supported
 * agent-runtime baseline belongs to the process, not to a module instance and not to a binding.
 * The OMP legacy loader rewrites every relative import of an extension's graph to
 * `specifier?mtime=<per-load tag>` — a fresh tag per extension load — so two extensions that use
 * this framework hold two copies of `framework/core/admission.ts`; a copy-scoped record would judge
 * the version once per copy, and a binding-scoped one once per binding.
 *
 * What this file drives is the consuming interface: two extensions assembled through the
 * framework's binding harness, their sessions delivered, re-bound (the loader binds every session
 * again) and followed into a subagent session — plus a copy of the decision module loaded the way
 * the loader loads it, by importing it under its own tag (the repro
 * `marker-module-duplication.test.ts` uses for the same loader behavior). What the fixture reads is
 * the decision value itself: one value per reported version, handed to every copy and every
 * consumer, instead of one per copy or one per binding.
 *
 * No production counter is added, and a notice is deliberately not the evidence — one notice per
 * owner says nothing about how often the version was judged. The decision *count* is corroborated
 * by review of the two modules that make it: `admit` reads the process record first and computes a
 * version's membership only on a miss, and the binding calls `admit` exactly once per binding
 * (`framework/behaviors/binding.ts`, before the first registration). Sharing, not counting, is what
 * the fixture can witness, and the identity of the value handed out is that witness.
 */
import { describe, expect, test } from "bun:test";
import type * as Admission from "../../framework/core/admission";
import { defineExtension } from "../../framework/public";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import { readBaselineRecord } from "../harness/baseline";
import { portDouble } from "./support/runtime-port-double";

/** The version the repository's support record lists — an independent source, not the decision re-read. */
const LISTED_VERSION = readBaselineRecord().agentRuntime.supportedVersion;

/** A version independently specified to be outside that baseline: this repository's candidate. */
const UNLISTED_VERSION = "18.6.1";

/**
 * One module instance of the decision module: what one extension's duplicated graph holds.
 *
 * The type is the module's own, so the fixture calls exactly the interface the binding calls and
 * reads exactly the value it returns.
 */
type AdmissionModule = typeof Admission;

/**
 * Imports a fresh instance of the decision module, keyed by `tag` exactly as the loader's
 * `?mtime=` tag keys it. The specifier is built at run time so each call is its own module.
 */
function duplicatedAdmissionModule(tag: string): Promise<AdmissionModule> {
	return import(`../../framework/core/admission.ts?mtime-repro=${tag}`) as Promise<AdmissionModule>;
}

/**
 * A second extension, assembled beside this repository's own codebase-tools in the one process
 * under test: the fixture needs two extensions that share the process, not two bindings of one.
 */
const PEER_EXTENSION = defineExtension({
	id: "process-decision-peer",
	displayName: "processDecisionPeer",
});

describe("one decision across separately loaded copies of the decision module (P2)", () => {
	test("every copy hands over the one value the process decided for a reported version", async () => {
		const [first, second] = await Promise.all([
			duplicatedAdmissionModule("copies-first"),
			duplicatedAdmissionModule("copies-second"),
		]);
		// The repro is real only while the two imports are different module instances: the loader
		// keys each extension's graph by its own tag, and a deduped import would hide the defect
		// this file exists for.
		expect(second.admit).not.toBe(first.admit);

		// One copy judges the reported version: an unlisted one is decided as unlisted, carrying the
		// version and the baseline it was judged against.
		const decided = first.admit({ version: UNLISTED_VERSION });
		expect(decided).toEqual({
			kind: "unlisted-version",
			version: UNLISTED_VERSION,
			supportedVersions: [LISTED_VERSION],
		});

		// The other copy hands over _that_ decision instead of making one: a record kept per module
		// copy would answer with a value of its own here, which is the "each copy caches once" shape
		// this ticket rejects.
		expect(second.admit({ version: UNLISTED_VERSION })).toBe(decided);
		// And a further report through the first copy is no third decision either.
		expect(first.admit({ version: UNLISTED_VERSION })).toBe(decided);
	});

	test("the decision is per reported version, and a listed one is not the unlisted one", async () => {
		const [first, second] = await Promise.all([
			duplicatedAdmissionModule("versions-first"),
			duplicatedAdmissionModule("versions-second"),
		]);

		// Two reported versions are two decisions — a version the baseline lists is admitted, one
		// outside it is unlisted — rather than one process-wide verdict on the first report.
		const listed = first.admit({ version: LISTED_VERSION });
		const unlisted = second.admit({ version: UNLISTED_VERSION });
		expect(listed).toEqual({ kind: "admitted" });
		expect(unlisted.kind).toBe("unlisted-version");
		expect(unlisted).not.toBe(listed);

		// Either copy reads either decision: the record is keyed by the version, and both copies
		// hold the same one.
		expect(second.admit({ version: LISTED_VERSION })).toBe(listed);
		expect(first.admit({ version: UNLISTED_VERSION })).toBe(unlisted);
	});
});

describe("two extensions assembled and re-bound in one process (P2, C5)", () => {
	test("neither the second extension, the re-binding nor the subagent session adds a decision", async () => {
		const [first, second] = await Promise.all([
			duplicatedAdmissionModule("extensions-first"),
			duplicatedAdmissionModule("extensions-second"),
		]);
		const decided = first.admit({ version: UNLISTED_VERSION });

		// Two extensions assembled through the framework's binding interface, each with its own
		// assembly (one State store, and the framework's own recorded version decision shared by
		// the process), as the loader assembles every extension it discovers.
		const codebaseTools = portDouble();
		const peer = portDouble();
		expect(codebaseTools.bind(CODEBASE_TOOLS, { version: UNLISTED_VERSION }).bound).toBe(true);
		expect(peer.bind(PEER_EXTENSION, { version: UNLISTED_VERSION }).bound).toBe(true);

		// The main session, a re-entry of the loader's own binding (every session is bound again), a
		// later boundary of the same session and a subagent session that follows the owner: every one
		// of those paths delivers, and none of them judges the version anew.
		const owner = { kind: "owner", key: "main:process-decision" } as const;
		codebaseTools.deliverSession(owner);
		peer.deliverSession(owner);
		expect(codebaseTools.bind(CODEBASE_TOOLS, { version: UNLISTED_VERSION }).bound).toBe(true);
		codebaseTools.deliverSession(owner, { event: { kind: "session_start", reason: "resume" } });
		codebaseTools.deliverSession({ kind: "inherited", key: "main:process-decision" });

		// The process still holds the one decision for that version — the very value the first report
		// materialized — rather than one value per extension, per binding or per module copy.
		expect(second.admit({ version: UNLISTED_VERSION })).toBe(decided);
		expect(first.admit({ version: UNLISTED_VERSION })).toBe(decided);
	});
});

describe("a binding that reports no version (P3)", () => {
	test("runs without a warning and records no decision, and the next report is still decided", async () => {
		const [first, second] = await Promise.all([
			duplicatedAdmissionModule("no-report-first"),
			duplicatedAdmissionModule("no-report-second"),
		]);

		// Phase one: the runtime reports no version at all. The binding runs and warns nobody, on
		// either channel: there is nothing to compare, so there is no verdict to report.
		const quiet = portDouble();
		expect(quiet.bind(PEER_EXTENSION, { version: "unreported" }).bound).toBe(true);
		expect(quiet.deliverSession({ kind: "owner", key: "main:no-report" }).notices).toEqual([]);
		expect(quiet.diagnostics).toEqual([]);

		// Phase two, same process: a binding whose runtime reports a version the baseline does not
		// list. The absent report was no conclusion — had it been recorded as one, this report would
		// have been answered from it instead of being judged — so this is a real decision: the session
		// is warned about the version, and the extension keeps running.
		const later = portDouble();
		expect(later.bind(PEER_EXTENSION, { version: UNLISTED_VERSION }).bound).toBe(true);
		expect(later.registrations).toEqual(["label:processDecisionPeer", "onSession"]);
		const warned = later.deliverSession({ kind: "owner", key: "main:unlisted-report" }).notices;
		expect(warned).toHaveLength(1);
		expect(warned[0]).toContain(UNLISTED_VERSION);
		expect(warned[0]).toContain(LISTED_VERSION);

		// And it is the process's one decision for that version: every copy of the decision module
		// now reads that same value.
		const decided = first.admit({ version: UNLISTED_VERSION });
		expect(decided).toEqual({
			kind: "unlisted-version",
			version: UNLISTED_VERSION,
			supportedVersions: [LISTED_VERSION],
		});
		expect(second.admit({ version: UNLISTED_VERSION })).toBe(decided);
	});
});

/**
 * The publishing scope of the unlisted-version notice: the framework's, once per Owner (P6, P7, P8).
 *
 * The version decision is process-scoped, and the notice built on it belongs to the Owner — the main
 * session the delivery names. So one process tells one Owner once, whatever it took to get there:
 * several extensions, an assembly bound again, a re-entry of the session, a boundary of it or a
 * subagent delivery in between. A second Owner is still told, from the version the process already
 * decided, and a subagent is never an Owner of its own.
 */
describe("one framework notice per Owner across the process (P6, P7, P8)", () => {
	test("two extensions, a re-binding, repeated deliveries and a subagent leave one framework notice per Owner", async () => {
		// The process's decision for the reported version, read through a copy of the decision module
		// before anything binds: whatever the deliveries below do, this is the value the process holds.
		const [first, second] = await Promise.all([
			duplicatedAdmissionModule("notice-scope-first"),
			duplicatedAdmissionModule("notice-scope-second"),
		]);
		const decided = first.admit({ version: UNLISTED_VERSION });

		// Two extensions with an assembly each, as the loader assembles every extension it discovers.
		// These two share this process's one copy of the framework; the separately loaded copy the
		// runtime evaluates per extension graph is the real run's observation
		// (`admission-notice.test.ts`), which a suite inside one module instance cannot make.
		const codebaseTools = portDouble();
		const peer = portDouble();
		expect(codebaseTools.bind(CODEBASE_TOOLS, { version: UNLISTED_VERSION }).bound).toBe(true);
		expect(peer.bind(PEER_EXTENSION, { version: UNLISTED_VERSION }).bound).toBe(true);

		// One Owner, delivered to through both extensions: the session is told once, and what it is told
		// is the framework's — neither extension's display name splits it into a notice of its own.
		const owner = { kind: "owner", key: "main:notice-scope" } as const;
		const published = [...codebaseTools.deliverSession(owner).notices, ...peer.deliverSession(owner).notices];
		expect(published).toHaveLength(1);
		expect(published[0]).toContain("my-agent-toolkit");
		expect(published[0]).not.toContain(CODEBASE_TOOLS.displayName);
		expect(published[0]).not.toContain(PEER_EXTENSION.displayName);
		expect(published[0]).toContain(UNLISTED_VERSION);
		expect(published[0]).toContain(LISTED_VERSION);

		// Repeated deliveries are not repeated notices: a re-entry of the same session, a later
		// boundary of it, and the loader binding one of the assemblies again.
		expect(
			codebaseTools.deliverSession(owner, { event: { kind: "session_start", reason: "resume" } }).notices,
		).toEqual([]);
		expect(peer.deliverSession(owner, { event: { kind: "session_end", reason: "transferred" } }).notices).toEqual(
			[],
		);
		expect(codebaseTools.bind(CODEBASE_TOOLS, { version: UNLISTED_VERSION }).bound).toBe(true);
		expect(codebaseTools.deliverSession(owner).notices).toEqual([]);

		// A subagent delivery follows its owner, so it publishes nothing — and, the half that says it is
		// no Owner of its own, it does not consume the notice of the session it follows either: that
		// session is still told when its own delivery comes.
		const followed = "main:notice-subagent-first";
		expect(peer.deliverSession({ kind: "inherited", key: followed }).notices).toEqual([]);
		expect(peer.deliverSession({ kind: "owner", key: followed }).notices).toHaveLength(1);

		// A second Owner gets its own single notice, and no version was judged again to hand it over:
		// every copy of the decision module still reads the one value the process holds.
		const other = { kind: "owner", key: "main:notice-scope-second" } as const;
		expect(codebaseTools.deliverSession(other).notices).toHaveLength(1);
		expect(peer.deliverSession(other).notices).toEqual([]);
		expect(second.admit({ version: UNLISTED_VERSION })).toBe(decided);
		expect(first.admit({ version: UNLISTED_VERSION })).toBe(decided);
	});
});
