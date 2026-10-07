/**
 * Probe (ticket 11): capture the delivered role/order/position of codebase-tools' injected
 * prompt on both provider paths, and keep the raw outbound request bodies as evidence.
 *
 * Both paths run the deployed OMP entrypoint against the isolated exact install, with a
 * local capture endpoint standing in for the provider:
 *
 * - `deepseek/deepseek-flash` (`openai-completions`) — the main path. Same api adapter the
 *   real provider would receive; only the endpoint is local.
 * - `openai-codex/gpt-6-luna` (`openai-codex-responses`) — layer 1 of the two-layer Codex
 *   evidence. **Shape-only**: it records what the runtime serializes and does not show that
 *   chatgpt.com would accept it. Layer 2 (real credentials) is
 *   `scripts/capture-codex-outbound.ts`.
 *
 * Usage: bun .scratch/codebase-tools-omp-v1/assets/11/probes/role-capture.ts
 *
 * Output: `../captures/<deepseek|codex>/request-NNN-*.json` in this ticket's asset tree,
 * plus a fact line per path on stdout.
 */
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import {
	type CaptureProtocol,
	type CapturedRequest,
	ControlledSession,
	type IsolatedRuntime,
	REPO_ROOT,
	createRunRoot,
	ensureIsolatedRuntime,
	readBaselineRecord,
	startCaptureServer,
	writeAgentSettings,
	writeProviderOverride,
} from "../../../../../tests/harness/index";

const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
const CAPTURES_DIR = path.join(import.meta.dir, "..", "captures");
const COMMAND = "codebase-tools";
const TURN_TEXT = "codebase-tools role turn";
/** The init slot's text: the injected content is the resource, not a paraphrase of it. */
const INIT_PROMPT = readFileSync(
	path.join(REPO_ROOT, "extensions", "codebase-tools", "prompts", "init.md"),
	"utf8",
);

/** A JWT-shaped credential; the Codex provider reads its ChatGPT account id from it. */
function codexProbeToken(accountId = "acc_role_probe"): string {
	const claims = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
		"utf8",
	).toBase64();
	return `aaa.${claims}.bbb`;
}

interface PathSpec {
	readonly label: "deepseek" | "codex";
	readonly provider: string;
	readonly model: string;
	readonly apiKey: string;
	readonly protocol: CaptureProtocol;
	/** Runtime settings the path needs to be observable (Codex prefers websockets). */
	readonly settings?: Record<string, string>;
}

const PATHS: readonly PathSpec[] = [
	{
		label: "deepseek",
		provider: "deepseek",
		model: "deepseek/deepseek-flash",
		apiKey: "probe-deepseek-key",
		protocol: "openai-completions",
	},
	{
		label: "codex",
		provider: "openai-codex",
		model: "openai-codex/gpt-6-luna",
		apiKey: codexProbeToken(),
		protocol: "openai-codex-responses",
		settings: { "providers.openaiWebsockets": "off" },
	},
];

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
		.join("");
}

/** Every conversation item of a captured body, whichever shape the path serialized. */
function conversationItems(request: CapturedRequest): ReadonlyArray<{ role?: string; content?: unknown }> {
	const body = (request.json ?? {}) as {
		messages?: ReadonlyArray<{ role?: string; content?: unknown }>;
		input?: ReadonlyArray<{ role?: string; content?: unknown }>;
	};
	return body.messages ?? body.input ?? [];
}

async function capturePath(runtime: IsolatedRuntime, spec: PathSpec): Promise<void> {
	const runRoot = createRunRoot(`role-capture-${spec.label}`);
	const capture = startCaptureServer({ dir: runRoot.captureDir, protocol: spec.protocol });
	writeProviderOverride(runRoot.agentDir, spec.provider, { baseUrl: capture.baseUrl, apiKey: spec.apiKey });
	if (spec.settings !== undefined) writeAgentSettings(runRoot.agentDir, spec.settings);
	let session: ControlledSession | undefined;
	try {
		session = await ControlledSession.start({
			runtime,
			runRoot,
			extensions: [OMP_ENTRYPOINT_DIR],
			model: spec.model,
		});
		const enable = await session.prompt(`/${COMMAND}`);
		const turn = await session.prompt(TURN_TEXT);
		const exit = await session.stop();
		const requests = capture.requests();
		console.log(
			`[role-capture] ${spec.label}: enable=${enable.status} turn=${turn.status} exit=${String(exit.exitCode)} requests=${requests.length}`,
		);
		if (requests.length === 0) throw new Error(`${spec.label}: the capture endpoint received no request`);

		const items = conversationItems(requests[0] as CapturedRequest);
		const injected = items.findIndex(item => messageText(item.content).includes(INIT_PROMPT));
		if (injected < 0) throw new Error(`${spec.label}: no conversation item carries the injected prompt`);
		console.log(
			`[role-capture] ${spec.label}: injected item index=${injected}/${items.length - 1} role=${items[injected]?.role} tail=${injected === items.length - 1} position=after-turn-user=${items
				.slice(0, injected)
				.some(item => messageText(item.content).includes(TURN_TEXT))}`,
		);
		console.log(`[role-capture] ${spec.label}: roles=${items.map(item => item.role).join(",")}`);
		const target = path.join(CAPTURES_DIR, spec.label);
		rmSync(target, { recursive: true, force: true });
		mkdirSync(target, { recursive: true });
		for (const request of requests) {
			cpSync(request.file, path.join(target, path.basename(request.file)));
		}
		console.log(`[role-capture] ${spec.label}: captures -> ${target}`);
	} finally {
		if (session !== undefined) await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
		capture.stop();
		runRoot.dispose();
	}
}

const runtime = await ensureIsolatedRuntime(readBaselineRecord());
for (const spec of PATHS) {
	await capturePath(runtime, spec);
}
