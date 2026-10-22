/**
 * The startup policy document's loading rules at the framework's adapter contract (S1; P5,
 * P34 of the extension-startup-modes contract).
 *
 * Two rules are observed here, both on the same loading-time path as an extension's own
 * configuration:
 *
 * - A document serves a whole mode, so only the block of the extension actually bound is read
 *   and validated. Naming an extension in the document loads nothing, and an illegal block for
 *   an extension this process did not load is not the loaded extension's business.
 * - The block of the extension that *is* loaded is validated: a missing document, a block whose
 *   `enabled` is not a boolean, and text that is not YAML each refuse that binding with a
 *   visible diagnostic and no registration or effect. A valid extension beside it keeps running.
 *
 * The seam is the public assembly interface: the port double consumes the document the way an
 * adapter hands over its assembly's `startupPolicy`, and the framework's own effects — State,
 * persistence, marker, prompt contribution, registrations, diagnostics — are observed through
 * that same double. The two real consumers are bound: codebase-tools is the pure declarative
 * State consumer, connect-bot the external-effect consumer whose factory must not run for a
 * refused policy.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import type { BindingResult } from "../../framework/runtime/port";
import type { OwnerReference } from "../../framework/interface/state";
import { REPO_ROOT } from "../harness-dock/baseline";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** The first owner this process serves. */
const OWNER: OwnerReference = { kind: "owner", key: "main:startup-policy-configuration" };

/** The first main session's start, the way an adapter resolves a process's own beginning. */
const START = { event: { kind: "session_start", reason: "initial" } } as const;

/** The lines each real consumer's declaration renders while its value holds. */
const CODEBASE_TOOLS_MARKER = "◈ codeBaseTools";
const CONNECT_BOT_MARKER = "◐ connectBot";

/** The prompt slot codebase-tools' enabled State selects on the first run. */
const CODEBASE_TOOLS_INIT = `${CODEBASE_TOOLS.id}:init`;

/** The directories this suite wrote a policy document into, removed after each case. */
const policyDirectories: string[] = [];

afterEach(() => {
	for (const directory of policyDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

/**
 * One policy document written into a directory of its own.
 *
 * The framework reads one document per path per process, so every case names a fresh path — the
 * same reason a suite of extension configuration writes a fresh file.
 */
function policyDocument(text: string): string {
	const directory = mkdtempSync(path.join(tmpdir(), "startup-policy-configuration-"));
	policyDirectories.push(directory);
	const file = path.join(directory, "policy.yaml");
	writeFileSync(file, text);
	return file;
}

/** The configuration seam every binding here reads through: the repository's own files. */
const REPOSITORY: { readonly baseDir: string } = { baseDir: REPO_ROOT };

/** The `config` violation details a refused result reports, in order. */
function configDetails(result: BindingResult): readonly string[] {
	if (result.bound) return [];
	return result.failures.flatMap(failure =>
		failure.kind === "configuration" && failure.violation.kind === "config" ? [failure.violation.detail] : [],
	);
}

/** A factory for connect-bot that records whether the binding reached it. */
function connectBotFactory(): {
	readonly factory: () => { readonly commands: { readonly "connect-bot": { readonly run: () => void } } };
	readonly calls: () => number;
} {
	let calls = 0;
	return {
		factory: () => {
			calls += 1;
			return { commands: { "connect-bot": { run: () => {} } } };
		},
		calls: () => calls,
	};
}

describe("only the loaded extension's block is read and validated (P5)", () => {
	test("an illegal block for an extension this process did not load leaves the loaded block in force", async () => {
		const file = policyDocument(
			["codebase-tools:", "  enabled: true", "connect-bot:", '  enabled: "yes"', ""].join("\n"),
		);
		const port = portDouble();

		const result = port.bind(CODEBASE_TOOLS, { startupPolicy: file, config: REPOSITORY });

		// The document parses. The loaded block states a boolean, so this binding is admitted even
		// though another block in the same document names a value that is not one.
		expect(result.bound).toBe(true);
		expect(port.diagnostics).toEqual([]);
		expect(port.commands.map(command => command.name)).toEqual([CODEBASE_TOOLS.id]);

		const start = port.deliverSession(OWNER, START);
		expect(port.state.view(OWNER.key).read("enabled")).toBe(true);
		expect(start.persisted).toEqual([{ enabled: true }]);
		expect(start.markers.flat()).toContain(CODEBASE_TOOLS_MARKER);

		// The selected consumer's first request carries its contribution: the choice was applied.
		const firstRun = await port.initiateRun(OWNER);
		expect(firstRun.contribution?.identity).toBe(CODEBASE_TOOLS_INIT);
	});
});

describe("a loaded block that is missing, illegal or unparseable refuses that binding (P34)", () => {
	test("a missing policy document refuses the binding with a visible configuration failure and no business effect", () => {
		const absent = path.join(mkdtempSync(path.join(tmpdir(), "startup-policy-absent-")), "absent.yaml");
		policyDirectories.push(path.dirname(absent));
		const bot = connectBotFactory();
		const port = portDouble();

		const result = port.bind(CONNECT_BOT, {
			startupPolicy: absent,
			config: REPOSITORY,
			factory: bot.factory,
		});

		expect(result.bound).toBe(false);
		expect(configDetails(result)).toEqual([`the startup policy file "${absent}" does not exist`]);
		// The failure is visible on the non-model channel, not silently swallowed.
		expect(port.diagnostics).toHaveLength(1);
		expect(port.diagnostics[0]).toContain(`${CONNECT_BOT.id}: configuration error (config)`);
		expect(port.diagnostics[0]).toContain("does not exist");

		// Nothing of the external-effect consumer's business began: no factory, no command, no
		// session delivery effect. A rejected extension contributes nothing.
		expect(bot.calls()).toBe(0);
		expect(port.registrations).toEqual([]);
		const start = port.deliverSession(OWNER, START);
		expect(start.persisted).toEqual([]);
		expect(start.markers.flat()).toEqual([]);
		expect(start.feedback).toEqual([]);
	});

	test("a non-boolean enabled refuses only the loaded extension's block", async () => {
		// The document parses and the other block is valid; the refusal is this binding's own block.
		const file = policyDocument(
			["codebase-tools:", '  enabled: "true"', "connect-bot:", "  enabled: false", ""].join("\n"),
		);
		const port = portDouble();

		const result = port.bind(CODEBASE_TOOLS, { startupPolicy: file, config: REPOSITORY });

		expect(result.bound).toBe(false);
		expect(configDetails(result)).toHaveLength(1);
		expect(configDetails(result)[0]).toContain('"codebase-tools"');
		expect(configDetails(result)[0]).toContain('"enabled"');
		expect(configDetails(result)[0]).toContain("requires a boolean");
		expect(port.diagnostics[0]).toContain(`${CODEBASE_TOOLS.id}: configuration error (config)`);
		expect(port.registrations).toEqual([]);

		// Nothing the declaration would have contributed runs: no marker, no record, no prompt.
		const start = port.deliverSession(OWNER, START);
		expect(start.persisted).toEqual([]);
		expect(start.markers.flat()).toEqual([]);
		expect((await port.initiateRun(OWNER)).contribution).toBeUndefined();
	});

	test("text that is not YAML refuses the binding instead of a block being improvised", () => {
		const file = policyDocument(["codebase-tools:", "  enabled: [", ""].join("\n"));
		const port = portDouble();

		const result = port.bind(CODEBASE_TOOLS, { startupPolicy: file, config: REPOSITORY });

		expect(result.bound).toBe(false);
		expect(configDetails(result)).toHaveLength(1);
		expect(configDetails(result)[0]).toContain("is not valid YAML");
		expect(port.diagnostics[0]).toContain(`${CODEBASE_TOOLS.id}: configuration error (config)`);
		expect(port.registrations).toEqual([]);
	});
});

describe("a valid adjacent extension keeps running when another block is refused (P34)", () => {
	test("the refused consumer contributes nothing while the valid consumer's own command still works", () => {
		const file = policyDocument(
			["codebase-tools:", "  enabled: true", "connect-bot:", '  enabled: "true"', ""].join("\n"),
		);

		// The external-effect consumer's block is illegal: its binding is refused before its
		// factory could build the command or the panel registration lifecycle.
		const refusedFactory = connectBotFactory();
		const refusedPort = portDouble();
		const refused = refusedPort.bind(CONNECT_BOT, {
			startupPolicy: file,
			config: REPOSITORY,
			factory: refusedFactory.factory,
		});
		expect(refused.bound).toBe(false);
		expect(refusedFactory.calls()).toBe(0);
		expect(refusedPort.diagnostics).toHaveLength(1);

		// The same document's valid block still binds its own extension, and the command that
		// extension always had remains the way to operate it.
		const validPort: PortDouble = portDouble();
		const valid = validPort.bind(CODEBASE_TOOLS, { startupPolicy: file, config: REPOSITORY });
		expect(valid.bound).toBe(true);
		const start = validPort.deliverSession(OWNER, START);
		expect(validPort.state.view(OWNER.key).read("enabled")).toBe(true);
		expect(start.markers.flat()).toContain(CODEBASE_TOOLS_MARKER);

		const disabled = validPort.run(CODEBASE_TOOLS.id, { owner: OWNER });
		expect(disabled.persisted).toEqual([{ enabled: false }]);
		expect(validPort.state.view(OWNER.key).read("enabled")).toBe(false);
	});
});

describe("an unparseable source in one entrypoint is not another entrypoint's document (P34)", () => {
	test("a broken manual document refuses its binding while the automatic document still enables its own", () => {
		const brokenManual = policyDocument(["codebase-tools:", "  enabled: [", ""].join("\n"));
		const validAutomatic = policyDocument(["connect-bot:", "  enabled: true", ""].join("\n"));

		// Each entrypoint states the document its mode selected: the unparseable one is not made
		// to answer for the other, and the other is not a block of the unparseable document.
		const manualPort = portDouble();
		expect(manualPort.bind(CODEBASE_TOOLS, { startupPolicy: brokenManual, config: REPOSITORY }).bound).toBe(false);

		let startupCalls = 0;
		const automaticPort = portDouble();
		const automatic = automaticPort.bind(CONNECT_BOT, {
			startupPolicy: validAutomatic,
			config: REPOSITORY,
			factory: () => ({
				commands: { "connect-bot": { run: () => {} } },
				startup: delivery => {
					startupCalls += 1;
					delivery.capability.state.write(true);
				},
			}),
		});
		expect(automatic.bound).toBe(true);

		const start = automaticPort.deliverSession(OWNER, START);
		expect(automaticPort.state.view(OWNER.key).read("enabled")).toBe(true);
		expect(startupCalls).toBe(1);
		expect(start.markers.flat()).toContain(CONNECT_BOT_MARKER);
	});
});
