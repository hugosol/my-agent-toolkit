/**
 * codebase-tools subagents keep following their Owner under both startup modes (S1; P14 of the
 * extension-startup-modes contract).
 *
 * The seam is the framework's public assembly interface: the adapter factory consumes the startup
 * policy the mode's entrypoint selected, and the port double delivers the host facts a startup
 * receives — the main session's start, the subagent's own delivery, the first run initiation and
 * the command the operator types. What the framework owes there is observed through that double:
 * the contribution a subagent's run would carry, the marker area it publishes, and the values
 * recorded in the persistence medium.
 *
 * The startup policy is a main-session rule, so what this suite pins is that the two modes differ
 * in *when the owner* is enabled and not in how a subagent reads it:
 *
 * - a subagent follows the Owner's current value in both directions, after the Owner changed
 *   (not just at the first read) and in both modes;
 * - a subagent's own start applies no startup choice and records nothing — the automatic entry a
 *   spawned pi session loads must therefore not enable that session on its own;
 * - an Owner this process cannot reach reads the declared default (`false`), in both modes: an
 *   unreachable owner is not turned into an independently enabled subagent.
 *
 * The owner here is served by the same process, which is the supported in-process subagent access
 * (OMP's built-in subagent). Cross-process reading — a spawned pi session in its own process — is
 * `scripts/pi-codebase-tools-smoke.ts`'s follow phase, and the framework's own two-process carrier
 * suite covers the local access itself.
 */
import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type { ConfigSource } from "../../framework/core/config";
import type { FollowedAccessReader } from "../../framework/core/followed-owners";
import type { SessionFacts } from "../../framework/interface/session";
import type { OwnerReference } from "../../framework/interface/state";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

/** The session that owns the activation value, and the subagent that follows it. */
const OWNER: OwnerReference = { kind: "owner", key: "main:startup-modes-follow" };
const FOLLOWED: OwnerReference = { kind: "inherited", key: OWNER.key };

/** The owning main session and the subagent spawned below it, as each delivery reports them. */
const MAIN_SESSION: SessionFacts = { sessionId: "startup-follow-owner", kind: "main", name: "owner", unavailable: [] };
const CHILD_SESSION: SessionFacts = {
	sessionId: "startup-follow-child",
	kind: "sub",
	parentSessionId: MAIN_SESSION.sessionId,
	name: "child",
	unavailable: [],
};

/** The first main session's start, the way an adapter resolves a process's own beginning. */
const START = { event: { kind: "session_start", reason: "initial" } } as const;

/** The extension's declaration as consumers read it: its marker text and its two slot identities. */
const MARKER = CODEBASE_TOOLS.marker?.text ?? "";
const INIT_IDENTITY = `${CODEBASE_TOOLS.id}:init`;
const REMINDER_IDENTITY = `${CODEBASE_TOOLS.id}:reminder`;

/** One startup policy document, selected as one mode's entrypoint selects it. */
interface StartupPolicySource {
	readonly startupPolicy: string;
	readonly config: ConfigSource;
}

/** How many policy documents this suite named; a validated policy is read once per path per process. */
let policies = 0;

/** One policy document stating `choice` for this extension, through the framework's configuration seam. */
function policyOf(choice: boolean): StartupPolicySource {
	policies += 1;
	const file = path.resolve("/startup-policies", "startup-modes-follow", `case-${String(policies)}.yaml`);
	return {
		startupPolicy: file,
		config: {
			reader: candidate => {
				if (candidate !== file) throw new Error(`unexpected configuration read: ${candidate}`);
				return `${CODEBASE_TOOLS.id}:\n  enabled: ${String(choice)}\n`;
			},
		},
	};
}

/** Binds codebase-tools through one mode's selection, over an owner this process serves. */
function assemblyWith(choice: boolean): PortDouble {
	const port = portDouble();
	expect(port.bind(CODEBASE_TOOLS, policyOf(choice)).bound).toBe(true);
	return port;
}

describe("a subagent follows the Owner's current value in automatic startup mode (P14)", () => {
	test("the automatic choice enables only the Owner, and the subagent's runs turn off and on with it", async () => {
		const port = assemblyWith(true);

		// The process starts: the automatic choice enables its first main session, and the owner's
		// area carries the extension's line from that start.
		const ownerStart = port.deliverSession(OWNER, { session: MAIN_SESSION, ...START });
		expect(ownerStart.persisted).toEqual([{ enabled: true }]);
		expect(ownerStart.markers.flat()).toContain(MARKER);

		// The subagent starts under that owner. It is not its own owner, so the startup choice is
		// neither applied to it nor recorded for it.
		const childStart = port.deliverSession(FOLLOWED, { session: CHILD_SESSION });
		expect(childStart.persisted).toEqual([]);
		expect(port.state.view(OWNER.key).read("enabled")).toBe(true);

		// Its first run is planned from the owner's current value, and its branch's own init is the
		// contribution that values selects.
		const first = await port.initiateRun(FOLLOWED);
		expect(first.contribution?.identity).toBe(INIT_IDENTITY);
		expect(first.markers[first.markers.length - 1]).toEqual([MARKER]);

		// The operator turns the extension off in the owner's session. The area is cleared, and the
		// subagent's next run — its own branch already holding the init — carries nothing.
		const disabled = port.run(CODEBASE_TOOLS.id, { owner: OWNER });
		expect(disabled.persisted).toEqual([{ enabled: false }]);
		expect(disabled.feedback).toEqual([{ level: "info", message: "codeBaseTools disabled" }]);
		expect(disabled.markers[disabled.markers.length - 1]).toEqual([]);
		const off = await port.initiateRun(FOLLOWED, { contributionIdentities: [INIT_IDENTITY] });
		expect(off.contribution).toBeUndefined();
		expect(off.markers).toEqual([]);

		// Turning it back on in the owner's session is followed the other way: the subagent's next run
		// contributes again — the reminder, since its branch's init already exists — and the area
		// carries the line once more. This is the second direction, not a first reading.
		const enabled = port.run(CODEBASE_TOOLS.id, { owner: OWNER });
		expect(enabled.persisted).toEqual([{ enabled: true }]);
		const on = await port.initiateRun(FOLLOWED, { contributionIdentities: [INIT_IDENTITY] });
		expect(on.contribution?.identity).toBe(REMINDER_IDENTITY);
		expect(on.markers[on.markers.length - 1]).toEqual([MARKER]);

		// Nothing the subagent did wrote a value: its start recorded none, and neither run persisted.
		expect(port.state.view(OWNER.key).read("enabled")).toBe(true);
	});
});

describe("a subagent follows the Owner's current value in manual startup mode (P14)", () => {
	test("the manual choice leaves the Owner off, and the subagent's runs follow the operator's command both ways", async () => {
		const port = assemblyWith(false);

		// A session with no history starts off, and the declared default is not a record.
		const ownerStart = port.deliverSession(OWNER, { session: MAIN_SESSION, ...START });
		expect(ownerStart.persisted).toEqual([]);
		expect(ownerStart.markers.flat()).toEqual([]);
		expect(port.state.view(OWNER.key).read("enabled")).toBe(false);

		// The subagent starts off too, and records nothing of its own.
		const childStart = port.deliverSession(FOLLOWED, { session: CHILD_SESSION });
		expect(childStart.persisted).toEqual([]);
		const off = await port.initiateRun(FOLLOWED);
		expect(off.contribution).toBeUndefined();
		expect(off.markers).toEqual([]);

		// The operator enables the owner, and the subagent's next run follows it: its own branch's
		// first enabled run is the init it contributes, and the area carries the line.
		const enabled = port.run(CODEBASE_TOOLS.id, { owner: OWNER });
		expect(enabled.persisted).toEqual([{ enabled: true }]);
		const on = await port.initiateRun(FOLLOWED);
		expect(on.contribution?.identity).toBe(INIT_IDENTITY);
		expect(on.markers[on.markers.length - 1]).toEqual([MARKER]);

		// Disabling is followed as well: the subagent adds no contribution and the area is cleared.
		const disabled = port.run(CODEBASE_TOOLS.id, { owner: OWNER });
		expect(disabled.persisted).toEqual([{ enabled: false }]);
		expect(disabled.markers[disabled.markers.length - 1]).toEqual([]);
		const offAgain = await port.initiateRun(FOLLOWED, { contributionIdentities: [INIT_IDENTITY] });
		expect(offAgain.contribution).toBeUndefined();
		expect(offAgain.markers).toEqual([]);

		// And enabling once more follows the owner again: the reminder, not a second init.
		expect(port.run(CODEBASE_TOOLS.id, { owner: OWNER }).persisted).toEqual([{ enabled: true }]);
		const onAgain = await port.initiateRun(FOLLOWED, { contributionIdentities: [INIT_IDENTITY] });
		expect(onAgain.contribution?.identity).toBe(REMINDER_IDENTITY);
		expect(onAgain.markers[onAgain.markers.length - 1]).toEqual([MARKER]);
	});
});

describe("a subagent's own start is not a main-session startup (P14)", () => {
	test("automatic mode: the subagent start applies nothing and consumes nothing", async () => {
		const port = assemblyWith(true);

		// The first delivery this process sees is a subagent's, as a spawned pi process that never
		// serves a main session would report. It owns no cell, so the automatic choice is not applied
		// and nothing is recorded for it.
		const childStart = port.deliverSession(FOLLOWED, { session: CHILD_SESSION });
		expect(childStart.persisted).toEqual([]);
		const childRun = await port.initiateRun(FOLLOWED);
		expect(childRun.contribution).toBeUndefined();

		// The startup moment belongs to the first *main* session, and the subagent delivery did not
		// spend it: an owner that starts later still receives its automatic choice.
		const ownerStart = port.deliverSession(OWNER, { session: MAIN_SESSION, ...START });
		expect(ownerStart.persisted).toEqual([{ enabled: true }]);
		expect(port.state.view(OWNER.key).read("enabled")).toBe(true);
	});
});

/** One reader for an owner this process does not serve: the seat cannot be reached at all. */
const UNREACHABLE_OWNER: FollowedAccessReader = {
	open: () => Promise.reject(new Error("the owner's seat is not served in this process")),
};

describe("an owner this process cannot reach keeps the existing default read, not an independent enable (P14)", () => {
	for (const [mode, choice] of [
		["automatic", true],
		["manual", false],
	] as const) {
		test(`${mode} mode: the subagent reads the declared default and records nothing`, async () => {
			const port = portDouble({ follow: UNREACHABLE_OWNER });
			expect(port.bind(CODEBASE_TOOLS, policyOf(choice)).bound).toBe(true);

			// A spawned session whose process serves no owner. The owner's access is not reached, so
			// the field reads its declared default — and the automatic mode's enabling choice is not
			// applied to a session that is not its own owner.
			const childStart = port.deliverSession(FOLLOWED, { session: CHILD_SESSION });
			expect(childStart.persisted).toEqual([]);
			const run = await port.initiateRun(FOLLOWED);
			expect(run.contribution).toBeUndefined();
			// The area is published with no line: the default read is a value, not a claim that the
			// owner is off, and this process is the one that answers for the seat it chased.
			expect(run.markers[run.markers.length - 1]).toEqual([]);
			expect(childStart.persisted).toEqual([]);
		});
	}
});
