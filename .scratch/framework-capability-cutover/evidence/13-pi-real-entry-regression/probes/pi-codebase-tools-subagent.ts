/**
 * Ticket 13 — codebase-tools on the real pi loader, with a real subagent: the child session's own
 * inheritance of the owner's activation value.
 *
 * This is not a permanent test. The existing `pi-codebase-tools-smoke.ts` drives a single session
 * and asserts its toggle, injected prompts, marker and boundaries, but it loads no subagent
 * provider, so the child entry this extension's pi assembly states (`entrypoints/pi/codebase-tools.ts`)
 * is never exercised. The pinned `pi-subagents@0.78.0` artifact is loaded beside the production
 * entrypoint here, the scripted model answers one turn with the provider's own `subagent` tool, and
 * the spawned session is read back from the session file pi wrote.
 *
 * What it asserts (consumer-visible behavior only):
 *   1. with the owner off, the spawned child carries no codebase-tools contribution and records no
 *      codebase-tools entry — a `follow` field reads the owner's current value, not the declared
 *      default and not another session's value;
 *   2. after the owner's own `/codebase-tools` toggle, the next spawned child carries the init
 *      contribution on its own first run and records it under the framework identity, while its own
 *      journal records no State write: a follower reads the owner's cell and does not own it;
 *   3. the owner's own journal holds the one State value its toggle produced, and the two child
 *      journals hold only their own work (isolation).
 *
 * Usage: PI_NODE=<node> bun .scratch/framework-capability-cutover/evidence/13-pi-real-entry-regression/probes/pi-codebase-tools-subagent.ts [--pi <path>] [--keep]
 * Output: probes/out/codebase-tools-subagent/{report.json,observations.txt}
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { CapturedRequest } from "../../../../../tests/harness-dock/capture-server";
import {
	type PiCli,
	PI_COMMAND_TIMEOUT_MS,
	type PiRun,
	PiSession,
	piVersion,
	resolvePiCli,
	startPiRun,
} from "../../../../../tests/harness-dock/pi-session";
import { type SessionLog, readSessionLog } from "../../../../../tests/harness-dock/session-log";

/** The repository root: this probe lives five levels below it. */
const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..", "..", "..");
const ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "pi", "codebase-tools.ts");
const PROVIDER_ENTRY = path.join(REPO_ROOT, "node_modules", "pi-subagents", "index.js");
const INIT_PROMPT = readFileSync(path.join(REPO_ROOT, "extensions", "codebase-tools", "shared-logic", "prompts", "init.md"), "utf8");

const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";
const COMMAND = "codebase-tools";
const INIT_IDENTITY = `${COMMAND}:init`;
const STATE_ENTRY_TYPE = `${COMMAND}:state`;
const ENABLED_NOTICE = "codeBaseTools enabled";

const OFF_PROMPT = "delegate while the owner is off";
const OFF_ASSIGNMENT = "ticket-13 child assigned while the owner is off";
const ON_PROMPT = "delegate while the owner is on";
const ON_ASSIGNMENT = "ticket-13 child assigned while the owner is on";
const REPLY_TEXT = "ticket-13 child reply";

const OUT_DIR = path.join(import.meta.dir, "out", "codebase-tools-subagent");

/** One check this probe made. */
interface Check {
	readonly name: string;
	readonly pass: boolean;
	readonly detail: string;
}

const checks: Check[] = [];

class ProbeFailure extends Error {
	constructor(name: string, detail: string) {
		super(`check failed: ${name}\n  ${detail}`);
		this.name = "ProbeFailure";
	}
}

function check(name: string, ok: boolean, detail: string): void {
	checks.push({ name, pass: ok, detail });
	if (!ok) throw new ProbeFailure(name, detail);
	console.log(`  ok    ${name}`);
}

// ---------------------------------------------------------------------------
// Reading the external shapes this probe observes
// ---------------------------------------------------------------------------

/** One field of an unknown value, when the value is a non-null object that carries it. */
function fieldOf(value: unknown, key: string): unknown {
	if (value === null || typeof value !== "object" || !(key in value)) return undefined;
	return (value as Record<string, unknown>)[key];
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => {
			const text = fieldOf(part, "text");
			return typeof text === "string" ? text : "";
		})
		.join("");
}

function messagesOf(request: CapturedRequest): readonly unknown[] {
	const messages = fieldOf(request.json, "messages");
	return Array.isArray(messages) ? messages : [];
}

function carriesSubagentTool(request: CapturedRequest): boolean {
	const tools = fieldOf(request.json, "tools");
	return Array.isArray(tools) && tools.some(tool => fieldOf(fieldOf(tool, "function"), "name") === "subagent");
}

/** How many messages of one request carry the init resource's text. */
function contributionsOf(request: CapturedRequest): number {
	return messagesOf(request).filter(message => messageText(fieldOf(message, "content")) === INIT_PROMPT).length;
}

/** The captured child request whose own user message carries the given assignment. */
function childRequestFor(run: PiRun, assignment: string): CapturedRequest | undefined {
	return run.capture.requests().find(request =>
		messagesOf(request).some(message => fieldOf(message, "role") === "user" && messageText(fieldOf(message, "content")).includes(assignment)),
	);
}

/** One session file's own first line, as pi writes the header this adapter reads. */
interface SessionHeader {
	readonly id?: string;
	readonly parentSession?: string;
}

function sessionHeader(file: string): SessionHeader | undefined {
	try {
		const [firstLine] = readFileSync(file, "utf8").split("\n", 1);
		return JSON.parse(firstLine ?? "") as SessionHeader;
	} catch {
		return undefined;
	}
}

/** Every session file pi wrote under one run's session directory, in path order. */
function sessionFiles(directory: string): string[] {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { recursive: true })
		.map(entry => path.join(directory, String(entry)))
		.filter(file => file.endsWith(".jsonl"))
		.sort();
}

/** The spawned session carrying one assignment, waited for: the provider writes it in its own process. */
async function childSessionFor(run: PiRun, parentFile: string, assignment: string, timeoutMs: number): Promise<string | undefined> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = sessionFiles(run.root.sessionDir)
			.filter(file => path.resolve(file) !== path.resolve(parentFile))
			.map(file => ({ file, header: sessionHeader(file) }))
			.find(entry => entry.header?.parentSession !== undefined && readFileSync(entry.file, "utf8").includes(assignment));
		if (found !== undefined) return found.file;
		if (Date.now() > deadline) return undefined;
		await Bun.sleep(100);
	}
}

function extensionEntries(log: SessionLog): SessionLog["entries"] {
	return log.entries.filter(entry => typeof entry.customType === "string" && entry.customType.startsWith(`${COMMAND}:`));
}

function contributionIdentities(log: SessionLog): string[] {
	return log.entries
		.filter(entry => entry.type === "custom_message" && typeof entry.customType === "string" && entry.customType.startsWith(`${COMMAND}:`))
		.map(entry => String(entry.customType));
}

function statePayloads(log: SessionLog): unknown[] {
	return log.entries.filter(entry => entry.type === "custom" && entry.customType === STATE_ENTRY_TYPE).map(entry => entry.data);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

interface Options {
	readonly pi: string | undefined;
	readonly keep: boolean;
}

function parseOptions(argv: readonly string[]): Options {
	let pi: string | undefined;
	let keep = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--pi") {
			pi = argv[index + 1];
			if (pi === undefined) throw new Error("--pi requires a path");
			index += 1;
		} else if (argument === "--keep") {
			keep = true;
		} else {
			throw new Error(`unknown argument ${JSON.stringify(argument)}`);
		}
	}
	return { pi, keep };
}

/**
 * The scripted model: one delegation per prompt marker, then text.
 *
 * The parent's request carries the provider's `subagent` tool; the child's own request carries no
 * such tool, so a marker the parent's turn states is what decides which request delegates.
 */
function responder(): (request: CapturedRequest) => { readonly toolCall?: { readonly name: string; readonly arguments: string }; readonly replyText?: string } | undefined {
	const delegated = new Set<string>();
	return request => {
		if (!carriesSubagentTool(request)) return { replyText: REPLY_TEXT };
		const text = messagesOf(request).map(message => messageText(fieldOf(message, "content"))).join("\n");
		const delegation = [
			{ marker: OFF_PROMPT, assignment: OFF_ASSIGNMENT },
			{ marker: ON_PROMPT, assignment: ON_ASSIGNMENT },
		].find(candidate => text.includes(candidate.marker) && !delegated.has(candidate.assignment));
		if (delegation === undefined) return { replyText: REPLY_TEXT };
		delegated.add(delegation.assignment);
		return {
			toolCall: {
				name: "subagent",
				arguments: JSON.stringify({ agent: "scout", task: delegation.assignment }),
			},
		};
	};
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const cli = resolvePiCli(options.pi);
	const version = await piVersion(cli);
	console.log(`pi ${version} via ${cli.path}`);
	check("the pinned provider artifact this repository installs is present", existsSync(PROVIDER_ENTRY), PROVIDER_ENTRY);
	check("the production pi entrypoint exists", existsSync(ENTRYPOINT), ENTRYPOINT);

	const run = startPiRun(cli, "codebase-tools-subagent", { provider: PROVIDER, model: MODEL, endpoint: { replyText: REPLY_TEXT, respond: responder() } });
	const sessions: PiSession[] = [];
	let failure: unknown;
	try {
		const session = await PiSession.start({
			cli,
			runRoot: run.root,
			entrypoint: [ENTRYPOINT, PROVIDER_ENTRY],
			selector: run.selector,
		});
		sessions.push(session);
		const parentFile = await session.sessionFile();

		// Phase 1: owner off. The child follows the owner's current value, which is the declared default.
		console.log("\nphase: a spawned child while the owner is off");
		await session.run(OFF_PROMPT, PI_COMMAND_TIMEOUT_MS);
		const offFile = await childSessionFor(run, parentFile, OFF_ASSIGNMENT, 60_000);
		check("a real subagent session was spawned with the owner off", offFile !== undefined, `session dir: ${run.root.sessionDir}`);
		const offLog = readSessionLog(run.root.sessionDir, offFile);
		const offRequest = childRequestFor(run, OFF_ASSIGNMENT);
		check("the spawned child's own request was captured", offRequest !== undefined, `captured ${run.capture.requests().length} request(s)`);
		check(
			"the child spawned while the owner was off carries no codebase-tools contribution",
			offRequest !== undefined && contributionsOf(offRequest) === 0,
			`contributions: ${offRequest === undefined ? "<no request>" : contributionsOf(offRequest)}`,
		);
		check(
			"the child spawned while the owner was off records no codebase-tools entry",
			extensionEntries(offLog).length === 0,
			JSON.stringify(extensionEntries(offLog).map(entry => String(entry.customType))),
		);

		// Phase 2: the owner's own toggle enables it; the next spawned child follows that current value.
		console.log("\nphase: a spawned child after the owner's own toggle");
		const mark = session.frameMark();
		await session.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
		check(
			"the owner's own toggle announces the value it produced",
			session.notificationsSince(mark).includes(ENABLED_NOTICE),
			JSON.stringify(session.notificationsSince(mark)),
		);
		await session.run(ON_PROMPT, PI_COMMAND_TIMEOUT_MS);
		const onFile = await childSessionFor(run, parentFile, ON_ASSIGNMENT, 60_000);
		check("a real subagent session was spawned with the owner on", onFile !== undefined, `session dir: ${run.root.sessionDir}`);
		const onLog = readSessionLog(run.root.sessionDir, onFile);
		const onRequest = childRequestFor(run, ON_ASSIGNMENT);
		check("the enabled child's own request was captured", onRequest !== undefined, `captured ${run.capture.requests().length} request(s)`);
		check(
			"the child spawned under the enabled owner carries the init contribution on its first run",
			onRequest !== undefined && contributionsOf(onRequest) === 1,
			`contributions: ${onRequest === undefined ? "<no request>" : contributionsOf(onRequest)}`,
		);
		check(
			"the enabled child records the init under the framework identity",
			JSON.stringify(contributionIdentities(onLog)) === JSON.stringify([INIT_IDENTITY]),
			JSON.stringify(contributionIdentities(onLog)),
		);
		check(
			"the enabled child records no State write: it follows the owner's cell and does not own it",
			statePayloads(onLog).length === 0,
			JSON.stringify(statePayloads(onLog)),
		);

		// Isolation: the owner keeps the one value its toggle wrote, and the child journals carry only
		// their own work.
		const parentLog = session.journal(parentFile);
		check(
			"the owner's journal holds exactly the one State value its toggle produced",
			JSON.stringify(statePayloads(parentLog)) === JSON.stringify([{ enabled: true }]),
			JSON.stringify(statePayloads(parentLog)),
		);
		check(
			"the owner's journal is not the child's: the two child journals remain independent",
			path.resolve(offFile ?? "") !== path.resolve(onFile ?? "") && path.resolve(offFile ?? "") !== path.resolve(parentFile),
			`off: ${offFile}, on: ${onFile}`,
		);
	} catch (error) {
		failure = error;
		for (const session of sessions) if (session.running()) console.error(session.diagnostics());
	} finally {
		for (const session of sessions) await session.stop({ timeoutMs: 10_000 }).catch(() => undefined);
		run.capture.stop();
		mkdirSync(OUT_DIR, { recursive: true });
		const report = {
			source: {
				pi: { path: cli.path, version },
				entrypoint: ENTRYPOINT,
				providerEntry: PROVIDER_ENTRY,
				host: `${process.platform} ${process.arch}`,
				bun: Bun.version,
			},
			runRoot: run.root.path,
			checks,
			failure: failure === undefined ? null : String(failure),
		};
		writeFileSync(path.join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
		writeFileSync(
			path.join(OUT_DIR, "observations.txt"),
			`${checks.map(entry => `${entry.pass ? "ok" : "FAIL"} ${entry.name}\n      ${entry.detail}`).join("\n")}\n`,
			"utf8",
		);
		if (!options.keep) run.root.dispose();
		else console.log(`kept for inspection: ${run.root.path}`);
	}
	console.log(`\n${checks.length} check(s) recorded; ${failure === undefined ? "all passed" : "the run stopped on a failure"}`);
	if (failure !== undefined) throw failure;
}

await main();
