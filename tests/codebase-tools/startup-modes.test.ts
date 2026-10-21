/**
 * codebase-tools startup modes at the framework's adapter contract (S1; P3, P4, P8, P10,
 * P11, P26, P36 of the extension-startup-modes contract).
 *
 * The seam is the public assembly interface: the adapter factory consumes the selected
 * startup policy document, and the port double delivers the host facts a startup receives —
 * the owner's session start, the branch's State payloads, the first run initiation and the
 * command the operator types afterwards. What the framework owes there is observed through
 * that same double: the owner's current value, the values recorded in its persistence
 * medium, the marker area, the prompt contribution the first run would carry, and the
 * refusal a missing or illegal policy produces. Nothing here reads a private State debug
 * access or a test-only startup entry.
 *
 * The two shipped documents are the manual mode's default (`false`) and the automatic
 * mode's (`true`); a case that needs another content states it, so an expectation is always
 * read from the document the assembly selected rather than from the entrypoint's name.
 */
import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type { ConfigSource } from "../../framework/core/config";
import type { OwnerReference } from "../../framework/interface/state";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

/** The owner this suite's first session is, and the owner a later main session in the process is. */
const OWNER: OwnerReference = { kind: "owner", key: "main:startup-modes" };
const NEXT_OWNER: OwnerReference = { kind: "owner", key: "main:startup-modes-next" };

/** The extension's declared marker text, as the area renders it. */
const MARKER = "◈ codeBaseTools";
/** The two prompt slots' framework identities, as a run's contribution carries them. */
const INIT_IDENTITY = `${CODEBASE_TOOLS.id}:init`;
const REMINDER_IDENTITY = `${CODEBASE_TOOLS.id}:reminder`;

/** The first main session's start, the way an adapter resolves a process's own beginning. */
const START = { event: { kind: "session_start", reason: "initial" } } as const;

/** One startup policy document, selected as an entrypoint selects one. */
interface StartupPolicySource {
	/** The path the assembly states; the framework resolves and reads the document it names. */
	readonly startupPolicy: string;
	/** The seam the document is read through: this case's in-memory reader. */
	readonly config: ConfigSource;
}

/** How many policy documents this suite has named; the framework reads one per path per process. */
let policies = 0;

/**
 * One startup policy document, selected as an entrypoint selects one: a path plus the
 * document it names, read through the framework's injectable configuration seam.
 *
 * The path is unique per case because a validated policy document is read once per process —
 * the same rule the extension's own configuration follows — so two cases must not share one.
 * `choice` is the document's stated `enabled`; `undefined` states a block with no choice.
 */
function policyOf(name: string, choice: boolean | undefined): StartupPolicySource {
	policies += 1;
	const file = path.resolve("/startup-policies", `case-${String(policies)}`, name);
	const document =
		choice === undefined ? `${CODEBASE_TOOLS.id}: {}\n` : `${CODEBASE_TOOLS.id}:\n  enabled: ${String(choice)}\n`;
	return {
		startupPolicy: file,
		config: {
			reader: candidate => {
				if (candidate !== file) throw new Error(`unexpected configuration read: ${candidate}`);
				return document;
			},
		},
	};
}

/** Binds codebase-tools through one assembly that selected `policy`. */
function assemblyWith(policy: StartupPolicySource): PortDouble {
	const port = portDouble();
	expect(port.bind(CODEBASE_TOOLS, policy).bound).toBe(true);
	return port;
}

describe("the selected startup policy decides the first main session's activation (P3, P8, P11)", () => {
	test("the automatic choice starts enabled, records it, shows the marker and contributes on the first run", async () => {
		const port = assemblyWith(policyOf("auto.yaml", true));

		const start = port.deliverSession(OWNER, START);

		// The value the policy chose is the session's own value before any run happens.
		expect(port.state.view(OWNER.key).read("enabled")).toBe(true);
		// It is recorded through the normal session-entry medium, so a later process can restore it.
		expect(start.persisted).toEqual([{ enabled: true }]);
		// The area at the session's own start shows the line the value renders.
		expect(start.markers.flat()).toContain(MARKER);
		// The first run's request would carry the init slot: the State the request plans from
		// was already set when the session started.
		const firstRun = await port.initiateRun(OWNER);
		expect(firstRun.contribution?.identity).toBe(INIT_IDENTITY);
	});

	test("the manual choice leaves the session off, records nothing and contributes nothing", async () => {
		const port = assemblyWith(policyOf("manual.yaml", false));

		const start = port.deliverSession(OWNER, START);

		expect(port.state.view(OWNER.key).read("enabled")).toBe(false);
		expect(start.persisted).toEqual([]);
		expect(start.markers.flat()).toEqual([]);
		const firstRun = await port.initiateRun(OWNER);
		expect(firstRun.contribution).toBeUndefined();
	});
});

describe("the policy's content decides the result, not the document it came from (P4)", () => {
	test("a manual-named document stating true starts enabled, and an automatic-named one stating false stays off", async () => {
		const enabled = assemblyWith(policyOf("manual.yaml", true));
		const off = assemblyWith(policyOf("auto.yaml", false));

		// Swapped names, independent expectations: each result follows its own document.
		const enabledStart = enabled.deliverSession(OWNER, START);
		expect(enabled.state.view(OWNER.key).read("enabled")).toBe(true);
		expect(enabledStart.persisted).toEqual([{ enabled: true }]);
		expect((await enabled.initiateRun(OWNER)).contribution?.identity).toBe(INIT_IDENTITY);

		const offStart = off.deliverSession(OWNER, START);
		expect(off.state.view(OWNER.key).read("enabled")).toBe(false);
		expect(offStart.persisted).toEqual([]);
		expect((await off.initiateRun(OWNER)).contribution).toBeUndefined();
	});
});

describe("the startup choice is a target, not a toggle (P10)", () => {
	test("a recorded true with a true choice stays enabled and the run contributes", async () => {
		const port = assemblyWith(policyOf("auto.yaml", true));

		const start = port.deliverSession(OWNER, { ...START, statePayloads: [{ enabled: true }] });

		// A toggle applied at startup would have produced false here.
		expect(port.state.view(OWNER.key).read("enabled")).toBe(true);
		// The history already states the value, so the startup choice records nothing.
		expect(start.persisted).toEqual([]);
		expect(start.markers.flat()).toContain(MARKER);
		expect((await port.initiateRun(OWNER)).contribution?.identity).toBe(INIT_IDENTITY);
	});

	test("a recorded false is not overridden by a true choice", async () => {
		const port = assemblyWith(policyOf("auto.yaml", true));

		const start = port.deliverSession(OWNER, { ...START, statePayloads: [{ enabled: false }] });

		expect(port.state.view(OWNER.key).read("enabled")).toBe(false);
		expect(start.persisted).toEqual([]);
		expect(start.markers.flat()).toEqual([]);
		expect((await port.initiateRun(OWNER)).contribution).toBeUndefined();
	});
});

describe("the startup choice is applied once, at the process's first start (P26, P36)", () => {
	test("a command's later choice survives a new session, and repeated observations and runs apply nothing again", async () => {
		const port = assemblyWith(policyOf("auto.yaml", true));

		// The process starts: the policy enables the first main session and records that value.
		const started = port.deliverSession(OWNER, START);
		expect(started.persisted).toEqual([{ enabled: true }]);

		// The operator turns the extension off, which is a command's own write.
		const disabled = port.run(CODEBASE_TOOLS.id, { owner: OWNER });
		expect(disabled.persisted).toEqual([{ enabled: false }]);
		expect(port.state.view(OWNER.key).read("enabled")).toBe(false);
		expect(disabled.markers.flat()).toEqual([]);

		// A new main session in the same process starts from no history of its own. The startup
		// choice belongs to the process's start, so it must not enable this one or record anything.
		const next = port.deliverSession(NEXT_OWNER, START);
		expect(next.persisted).toEqual([]);
		expect(port.state.view(NEXT_OWNER.key).read("enabled")).toBe(false);
		expect(next.markers.flat()).toEqual([]);

		// Repeated observations of that session and its first runs apply nothing and add no record.
		const facts = port.deliverSession(NEXT_OWNER, { event: { kind: "session_facts" } });
		expect(facts.persisted).toEqual([]);
		expect((await port.initiateRun(NEXT_OWNER)).contribution).toBeUndefined();
		expect((await port.initiateRun(NEXT_OWNER)).contribution).toBeUndefined();
	});

	test("a session that records nothing at startup gains no State payload without a command", async () => {
		const port = assemblyWith(policyOf("manual.yaml", false));

		const start = port.deliverSession(OWNER, START);
		await port.initiateRun(OWNER);
		const facts = port.deliverSession(OWNER, { event: { kind: "session_facts" } });

		// The declared default is the value, not a record: nothing was ever written.
		expect(start.persisted).toEqual([]);
		expect(facts.persisted).toEqual([]);
		expect(port.state.view(OWNER.key).read("enabled")).toBe(false);
	});
});
