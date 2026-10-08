/**
 * The delivered role, order and position of codebase-tools' injected prompt, recorded
 * per provider path from the harness's own outbound request (C9, B3, P23).
 *
 * Both paths run the real deployed extension through the isolated OMP 18.5.0 install with
 * a local capture endpoint standing in for the provider, and the assertions read only what
 * the harness serialized. The `openai-completions` path (`deepseek/deepseek-flash`) is the
 * main path: its api adapter is the one the real provider would receive. The
 * `openai-codex-responses` path (`openai-codex/gpt-6-luna`) is a **shape-only** capture: it
 * shows what the harness serializes, and says nothing about whether chatgpt.com would
 * accept it — the real round trip needs credentials and is recorded outside this suite.
 *
 * The delivered role is a recorded fact, not an activation gate: nothing here (or in the
 * framework) decides enablement or delivery from it — the last test pins that by requiring
 * delivery on both paths although their serializers chose different roles — and the paths
 * that remain untested stay unverified in the support record rather than being inferred
 * from these two.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { writeAgentSettings, writeProviderOverride } from "../harness-dock/agent-config";
import { type CaptureProtocol, type CapturedRequest, type CaptureServer, startCaptureServer } from "../harness-dock/capture-server";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

/** The OMP discovery root this repository deploys. */
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
/** The init slot's text: the resource is the injected content, not a paraphrase of it. */
const INIT_PROMPT = readFileSync(
	path.join(REPO_ROOT, "extensions", "codebase-tools", "shared-logic", "prompts", "init.md"),
	"utf8",
);
const COMMAND = "codebase-tools";
/** The text of the user turn that triggers the injection, unique inside one request. */
const TURN_TEXT = "codebase-tools role turn";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(readBaselineRecord());
}, 300_000);

/**
 * A JWT-shaped credential whose claim names a ChatGPT account.
 *
 * The Codex provider reads the account id out of the token before it builds a request,
 * exactly as it does for a real login credential, so the probe token has to carry it.
 */
function codexProbeToken(accountId = "acc_role_probe"): string {
	const claims = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
		"utf8",
	).toBase64();
	return `aaa.${claims}.bbb`;
}

interface RoleRun {
	readonly runRoot: RunRoot;
	readonly capture: CaptureServer;
}

interface RoleRunOptions {
	readonly label: string;
	/** Catalog provider whose models the run redirects to the capture endpoint. */
	readonly provider: string;
	/** Catalog model selector the run executes. */
	readonly model: string;
	readonly apiKey: string;
	readonly protocol: CaptureProtocol;
	/** Harness settings the path needs to be observable (Codex prefers websockets). */
	readonly settings?: Record<string, string>;
}

/** One controlled run: temporary agent state carrying the provider override and capture. */
function createRoleRun(options: RoleRunOptions): RoleRun {
	const runRoot = createRunRoot(options.label);
	const capture = startCaptureServer({ dir: runRoot.captureDir, protocol: options.protocol });
	writeProviderOverride(runRoot.agentDir, options.provider, { baseUrl: capture.baseUrl, apiKey: options.apiKey });
	if (options.settings !== undefined) writeAgentSettings(runRoot.agentDir, options.settings);
	return { runRoot, capture };
}

/** The two provider paths the first release records; `openai-codex` is shape-only (layer 1). */
const DEEPSEEK_PATH: RoleRunOptions = {
	label: "role-deepseek",
	provider: "deepseek",
	model: "deepseek/deepseek-flash",
	apiKey: "dock-deepseek-key",
	protocol: "openai-completions",
};

const CODEX_PATH: RoleRunOptions = {
	label: "role-codex",
	provider: "openai-codex",
	model: "openai-codex/gpt-6-luna",
	apiKey: codexProbeToken(),
	protocol: "openai-codex-responses",
	// The catalog model prefers websockets, and `PI_REQ_DEBUG`-style capture of the Codex
	// transport only sees the SSE request; pinning SSE is what makes the body observable.
	settings: { "providers.openaiWebsockets": "off" },
};

async function openSession(run: RoleRun, model: string): Promise<ControlledSession> {
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [OMP_ENTRYPOINT_DIR],
		model,
	});
}

async function stopQuietly(session: ControlledSession | undefined): Promise<void> {
	if (session === undefined) return;
	try {
		await session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped; the run root still gets cleaned up.
	}
}

/** The parsed shape of one captured request body: this harness's own serialized JSON. */
interface CapturedBody {
	readonly messages?: ReadonlyArray<{ readonly role?: string; readonly content?: unknown }>;
	readonly input?: ReadonlyArray<{ readonly role?: string; readonly content?: unknown }>;
	readonly instructions?: unknown;
}

function capturedBody(request: CapturedRequest): CapturedBody {
	return (request.json ?? {}) as CapturedBody;
}

/** Every conversation item of a captured body, whichever shape the path serialized. */
function conversationItems(request: CapturedRequest): ReadonlyArray<{ readonly role?: string; readonly content?: unknown }> {
	const body = capturedBody(request);
	return body.messages ?? body.input ?? [];
}

/** The role the path gave the injected prompt in one captured request (`<none>`: not delivered). */
function deliveredRole(request: CapturedRequest): string {
	return conversationItems(request).find(item => messageText(item.content).includes(INIT_PROMPT))?.role ?? "<none>";
}

/** The plain text of one provider message content, whatever shape the path serializes. */
function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
		.join("");
}

/**
 * Enable the extension and run one turn, returning the run's single captured request.
 *
 * One user turn reaches the provider once here (the scripted answer asks for no tool), so
 * a single capture is the whole outbound conversation for that turn.
 */
async function captureEnabledTurn(run: RoleRun, model: string): Promise<CapturedRequest> {
	let session: ControlledSession | undefined;
	try {
		session = await openSession(run, model);
		const enable = await session.prompt(`/${COMMAND}`);
		expect(enable.agentInvoked).toBe(false);
		const turn = await session.prompt(TURN_TEXT);
		expect(turn.agentInvoked).toBe(true);
		expect(turn.status).toBe("completed");
		expect((await session.stop()).exitCode).toBe(0);
		const requests = run.capture.requests();
		expect(requests).toHaveLength(1);
		return requests[0] as CapturedRequest;
	} finally {
		await stopQuietly(session);
		run.capture.stop();
		run.runRoot.dispose();
	}
}

describe("the injected init is delivered as its own message (C9, deepseek path)", () => {
	test("openai-completions delivers the init after the turn's user message, as role user", async () => {
		const request = await captureEnabledTurn(createRoleRun(DEEPSEEK_PATH), DEEPSEEK_PATH.model);

		const messages = conversationItems(request);
		expect(messages.length).toBeGreaterThanOrEqual(3);

		// The system prompt stayed the harness's own: the injected text is not part of it.
		const system = messages[0];
		expect(system?.role).toBe("system");
		expect(messageText(system?.content)).not.toContain(INIT_PROMPT);

		// The init is delivered exactly once, as its own message whose text is the resource.
		const carrying = messages.filter(message => messageText(message.content).includes(INIT_PROMPT));
		expect(carrying).toHaveLength(1);
		expect(messageText(carrying[0]?.content).trim()).toBe(INIT_PROMPT.trim());
		expect(carrying[0]?.role).toBe("user");

		// Position: after this turn's user message, appended at the tail of the request.
		const turnIndex = messages.findIndex(message => messageText(message.content).includes(TURN_TEXT));
		expect(turnIndex).toBeGreaterThanOrEqual(0);
		const initIndex = messages.indexOf(carrying[0] as (typeof messages)[number]);
		expect(initIndex).toBeGreaterThan(turnIndex);
		expect(initIndex).toBe(messages.length - 1);
	}, 240_000);
});

describe("the openai-codex path serializes the same injection (C9, shape-only layer 1)", () => {
	test("openai-codex-responses delivers the init as an appended developer input item", async () => {
		const request = await captureEnabledTurn(createRoleRun(CODEX_PATH), CODEX_PATH.model);

		const body = capturedBody(request);
		const items = conversationItems(request);
		expect(items.length).toBeGreaterThanOrEqual(3);

		// The system prompt travels in `instructions`, not in the conversation items.
		expect(String(body.instructions)).not.toContain(INIT_PROMPT);

		const carrying = items.filter(item => messageText(item.content).includes(INIT_PROMPT));
		expect(carrying).toHaveLength(1);
		expect(messageText(carrying[0]?.content).trim()).toBe(INIT_PROMPT.trim());
		// Recorded fact for this path: the Codex serializer keeps the developer slot the
		// harness's LLM view gives a persisted custom message (unlike the shared Responses
		// conversion, which folds user/developer into `user`).
		expect(carrying[0]?.role).toBe("developer");

		const turnIndex = items.findIndex(item => messageText(item.content).includes(TURN_TEXT));
		expect(turnIndex).toBeGreaterThanOrEqual(0);
		const initIndex = items.indexOf(carrying[0] as (typeof items)[number]);
		expect(initIndex).toBeGreaterThan(turnIndex);
		expect(initIndex).toBe(items.length - 1);
	}, 240_000);
});

describe("the delivered role is a recorded fact, not a gate (C9)", () => {
	test("both paths deliver the injection, under the different roles their serializers choose", async () => {
		const deepseekRole = deliveredRole(await captureEnabledTurn(createRoleRun(DEEPSEEK_PATH), DEEPSEEK_PATH.model));
		const codexRole = deliveredRole(await captureEnabledTurn(createRoleRun(CODEX_PATH), CODEX_PATH.model));

		// Delivery is decided by State and the branch, never by the wire role: the same
		// extension and the same slot delivered on both paths even though their serializers
		// chose different roles, so no activation or refusal path can be reading it.
		expect(deepseekRole).toBe("user");
		expect(codexRole).toBe("developer");
		expect(deepseekRole).not.toBe(codexRole);
	}, 240_000);
});
