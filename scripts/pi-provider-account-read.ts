/**
 * The account side of the pi migration's real-provider acceptance: run the real, loaded model-cost
 * extension on the real pi host against a provider's *real* account, and publish what that account
 * answered beside what the host drew — desensitized, timestamped and reproducible.
 *
 * This is the one script in this repository that reads the machine's own provider credential, and it
 * is written to be worth that: it never prints a secret (a credential reaches a report only as
 * `sha256:<12 hex>`), it makes no model request (so no paid call, and the account's own read is the
 * only traffic it causes), it never installs, logs in, switches or cleans anything, and every run of
 * it happens in an isolated agent state, session directory, working directory and user home under the
 * OS temp root. The machine's formal agent state, its real storage root and any running agent are only
 * read — the real storage root is even listed before and after, so "untouched" is an observation
 * rather than a promise.
 *
 * Usage
 *   bun scripts/pi-provider-account-read.ts                     # every scenario this machine can authenticate
 *   bun scripts/pi-provider-account-read.ts --scenario deepseek-balance
 *   bun scripts/pi-provider-account-read.ts --model deepseek/deepseek-flash
 *   bun scripts/pi-provider-account-read.ts --out .cache/provider-account --keep
 *   bun scripts/pi-provider-account-read.ts --prepare           # print the login steps a missing provider needs
 *
 * What one scenario does, in order:
 *
 *   1. **Resolve a credential.** The provider's own record is read from the prepared isolated agent
 *      state (`--prepare`; preferred, so a credential the human created for this round is what is
 *      used) or from the machine's own pi store (`--agent-dir`). No usable record → the scenario is
 *      reported `blocked`, with the exact login step that would supply one, and nothing is sent.
 *   2. **Read the account itself, twice.** The same account answer the extension queries is read
 *      independently — this script's own parser, beside the host's — immediately before and after the
 *      host run, so the account's own movement frames the reading the host drew.
 *   3. **Run the real host.** The installed pi loads the shipped entrypoint
 *      (`entrypoints/pi/model-cost.ts`) in an isolated run root whose agent state holds the resolved
 *      credential and the host's own provider catalog, and whose user home makes the extension's
 *      storage root isolated. The scenario's own reading is awaited on the widget frames the real
 *      frontend publishes. No prompt is sent: this round observes the account side, and a paid model
 *      call needs authorization of its own.
 *   4. **Compare and publish.** The drawn reading must be one the account's own two reads support; a
 *      reading they do not support fails the run rather than being recorded as the account's.
 *
 * What it deliberately does not do:
 *
 *   - It does not treat a balance change as a request cost. A balance moves for the account's own
 *     reasons — other clients, grants, rounding, the discount its price list already reflects — and
 *     this report carries the account's raw answer, never a difference presented as what a request
 *     cost.
 *   - It does not require the provider's charge to equal the maintained model price. The maintained
 *     data is reference pricing for the extension's own computed cost; the account is the account.
 *     Where the host's own catalog states a price for the run's model, that price is recorded as the
 *     reference it is.
 *   - It does not manufacture a reading. A scenario whose query failed, timed out or answered no
 *     usable document is recorded as exactly that, with the failure's own detail, never a zero, a
 *     cached guess or a fixture's amount.
 *
 * Limits of the evidence it produces (all recorded in the report, none worked around):
 *
 *   - Windows x64, the installed `@earendil-works/pi-coding-agent` version this run names, and the
 *     machine's own network path to the provider. No POSIX, no other pi version, no other machine.
 *   - The independent read reaches the provider directly (the balance is read with `proxy: false` by
 *     the product too); the Codex allowance answer is reached through the shared configuration's own
 *     named `codex` proxy, because that is the path that endpoint is reachable by here.
 *   - One process, one provider account, the one credential its store holds. The report says which
 *     credential by fingerprint, so a reading can be tied to an account without naming a secret.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { request } from "../framework/interface/general/http";
import { type PiCli, PiSession, piVersion, resolvePiCli } from "../tests/harness-dock/pi-session";
import { createRunRoot } from "../tests/harness-dock/run-root";
import {
	type AllowanceAgreement,
	type BalanceAgreement,
	type ProviderBalanceReading,
	type ProviderCredential,
	type ReportedWindow,
	allowanceAgreementOf,
	allowanceWindowsOf,
	balanceAgreementOf,
	credentialFingerprint,
	displayedAllowanceOf,
	displayedBalanceOf,
	providerBalanceOf,
	providerCredentialOf,
	redactSecrets,
} from "./support/provider-account-reading";

/** The repository this script reads the shipped entrypoint from: this file lives in `scripts/`. */
const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..");

/** The extension's own pi entrypoint, exactly as pi's loader discovers it. */
const ENTRYPOINT = path.join(REPOSITORY_ROOT, "entrypoints", "pi", "model-cost.ts");

/** The pi credential store's own file name, under the agent state directory. */
const CREDENTIAL_FILE = "auth.json";

/** The provider catalog pi keeps in its agent state, as the file this script copies into a run. */
const CATALOG_FILE = "models-store.json";

/** The machine's own pi settings, read only for the provider/model pair it declares. */
const SETTINGS_FILE = "settings.json";

/** The extension's storage root inside an isolated user home, as its shipped configuration resolves it. */
const ISOLATED_STORAGE_RELATIVE = path.join(".omp", "cost-archive");

/** The document the extension keeps there, whose own shape must carry no balance or account field. */
const CONSUMPTION_FILE = "consumption.json";

/** How long one run may take to publish the reading it exists for. */
const READING_TIMEOUT_MS = 45_000;

/** How long one independent account read may take before it is recorded as unreachable. */
const ACCOUNT_READ_TIMEOUT_MS = 20_000;

/** The address the DeepSeek balance answer is appended to, as the product's own rule states it. */
const BALANCE_PATH = "/user/balance";

/** The official DeepSeek address, used only when the host's own catalog states none. */
const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";

/** The Codex allowance source, which is not derived from an inference base URL. */
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

/** The shared configuration's proxy entry the Codex allowance query selects. */
const CODEX_USAGE_PROXY = "codex";

/** The two providers whose account side this migration's acceptance covers. */
interface AccountScenario {
	readonly id: "deepseek-balance" | "codex-usage";
	/** The provider whose account is read, as this extension's own data names it. */
	readonly provider: string;
	/** What one reading of it is, in one line, for the report's own summary. */
	readonly reading: string;
}

/** The scenarios, in the order they run. */
const SCENARIOS: readonly AccountScenario[] = [
	{
		id: "deepseek-balance",
		provider: "deepseek",
		reading: "the account's own CNY balance, as the loaded extension's startup query reads it",
	},
	{
		id: "codex-usage",
		provider: "openai-codex",
		reading: "the account's own two allowance windows and their resets, as the loaded extension's startup query reads them",
	},
];

/**
 * Every secret this process resolved, kept in memory for one purpose: scrubbing the report before it
 * is written, so "a credential is published only as a fingerprint" is a property of the file rather
 * than of remembering to redact each field.
 */
const resolvedSecrets: string[] = [];

/** The parsed command line. */
interface Options {
	readonly scenarios: readonly AccountScenario[];
	/** The machine's own pi agent state, which holds its credential store and its catalog. */
	readonly agentDir: string;
	/** The isolated state `--prepare` creates, read before the machine's own store. */
	readonly preparedAgentDir: string;
	readonly outDirectory: string;
	readonly model: string | undefined;
	readonly keep: boolean;
	readonly prepare: boolean;
}

/** One option's value, or nothing when the option was not given. */
function optionValue(argv: readonly string[], name: string): string | undefined {
	const index = argv.indexOf(`--${name}`);
	const value = index >= 0 ? argv[index + 1] : undefined;
	return value !== undefined && value.length > 0 ? value : undefined;
}

/** The machine's own pi agent state directory, as pi's own environment override resolves it. */
function machineAgentDirectory(): string {
	return process.env["PI_CODING_AGENT_DIR"] ?? path.join(homedir(), ".pi", "agent");
}

function parseOptions(argv: readonly string[]): Options {
	const named = optionValue(argv, "scenario");
	const scenarios = named === undefined ? SCENARIOS : SCENARIOS.filter(scenario => scenario.id === named);
	if (scenarios.length === 0) {
		throw new Error(`--scenario names ${named}; this script has ${SCENARIOS.map(scenario => scenario.id).join(", ")}`);
	}
	const outDirectory = path.resolve(optionValue(argv, "out") ?? path.join(REPOSITORY_ROOT, ".cache", "provider-account"));
	return {
		scenarios,
		agentDir: path.resolve(optionValue(argv, "agent-dir") ?? machineAgentDirectory()),
		preparedAgentDir: path.resolve(optionValue(argv, "prepared-agent-dir") ?? path.join(outDirectory, "agent-state")),
		outDirectory,
		model: optionValue(argv, "model"),
		keep: argv.includes("--keep"),
		prepare: argv.includes("--prepare"),
	};
}

/** One JSON file's own value, or nothing when it is absent or not JSON. */
function readJson(file: string): unknown {
	if (!existsSync(file)) return undefined;
	try {
		return JSON.parse(readFileSync(file, "utf8")) as unknown;
	} catch {
		return undefined;
	}
}

/** One value as a plain record, or nothing when it is absent or not one. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** One value as a non-empty string, or nothing when it is absent or not one. */
function stringOf(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** One directory's files with their size and modified instant, so "unchanged" can be compared. */
function directoryListing(directory: string): readonly string[] {
	if (!existsSync(directory)) return [];
	const walk = (current: string): string[] =>
		readdirSync(current, { withFileTypes: true }).flatMap(entry => {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) return walk(full);
			const stats = statSync(full);
			return [`${path.relative(directory, full).replace(/\\/g, "/")} ${stats.size} ${Math.round(stats.mtimeMs)}`];
		});
	return walk(directory).sort();
}

/** The instant one moment is reported at: local time with its own offset, and the same in UTC. */
function instantsOf(moment: number): { readonly local: string; readonly utc: string } {
	const local = new Date(moment);
	const offsetMinutes = -local.getTimezoneOffset();
	const sign = offsetMinutes < 0 ? "-" : "+";
	const hours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, "0");
	const minutes = String(Math.abs(offsetMinutes) % 60).padStart(2, "0");
	const date = [
		local.getFullYear(),
		String(local.getMonth() + 1).padStart(2, "0"),
		String(local.getDate()).padStart(2, "0"),
	].join("-");
	const time = [
		String(local.getHours()).padStart(2, "0"),
		String(local.getMinutes()).padStart(2, "0"),
		String(local.getSeconds()).padStart(2, "0"),
	].join(":");
	return { local: `${date}T${time}.${String(local.getMilliseconds()).padStart(3, "0")}${sign}${hours}:${minutes}`, utc: local.toISOString() };
}

/** One provider account's own answer, as this script read it independently of the host. */
interface AccountRead {
	readonly at: string;
	readonly atUtc: string;
	readonly status: number | null;
	readonly outcome: string;
	/** The DeepSeek balance row, when this read was a balance read that answered one. */
	readonly balance?: ProviderBalanceReading;
	/** The allowance windows, when this read was an allowance read that answered them. */
	readonly windows?: { readonly fiveHour?: ReportedWindow; readonly weekly?: ReportedWindow };
	/** The account's own answer body, as this script received it. */
	readonly document?: string;
}

/** The provider's catalog entry for one provider, as the host's own catalog states it. */
function catalogEntryOf(catalog: unknown, provider: string): Record<string, unknown> | undefined {
	return recordOf(recordOf(catalog)?.[provider]);
}

/** The provider's inference base URL, as the host's own catalog states it, or nothing when it states none. */
function baseUrlOf(catalog: unknown, provider: string): string | undefined {
	const models = catalogEntryOf(catalog, provider)?.["models"];
	if (!Array.isArray(models)) return undefined;
	for (const model of models) {
		const baseUrl = stringOf(recordOf(model)?.["baseUrl"]);
		if (baseUrl !== undefined) return baseUrl;
	}
	return undefined;
}

/** One provider's first model id, as the host's own catalog states it. */
function firstModelOf(catalog: unknown, provider: string): string | undefined {
	const models = catalogEntryOf(catalog, provider)?.["models"];
	if (!Array.isArray(models) || models.length === 0) return undefined;
	return stringOf(recordOf(models[0])?.["id"]);
}

/**
 * The reference price the host's own catalog states for one model, kept as what it is: reference data
 * for the extension's computed cost, never the account's charge.
 */
function referencePriceOf(catalog: unknown, provider: string, modelId: string): Record<string, unknown> | undefined {
	const models = catalogEntryOf(catalog, provider)?.["models"];
	if (!Array.isArray(models)) return undefined;
	for (const model of models) {
		const record = recordOf(model);
		if (stringOf(record?.["id"]) !== modelId) continue;
		const cost = recordOf(record?.["cost"]);
		return cost === undefined ? undefined : { statedBy: "the host's own provider catalog (USD per million tokens)", rates: cost };
	}
	return undefined;
}

/** The address the DeepSeek balance answer lives at, as the product strips a trailing `/v1` first. */
function balanceUrlOf(baseUrl: string): string {
	return `${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}${BALANCE_PATH}`;
}

/** One independent read of the DeepSeek balance answer, sent directly rather than through a proxy. */
async function readDeepseekAccount(credential: ProviderCredential, baseUrl: string): Promise<AccountRead> {
	const at = Date.now();
	const stamps = instantsOf(at);
	// The wait is this script's own timer rather than `AbortSignal.timeout`, and it is cleared once the
	// answer is in: a pending 20s timer would hold the process open long after the reading is published.
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ACCOUNT_READ_TIMEOUT_MS);
	try {
		const response = await fetch(balanceUrlOf(baseUrl), {
			method: "GET",
			headers: { authorization: `Bearer ${credential.secret}`, accept: "application/json" },
			signal: controller.signal,
		});
		const body = await response.text();
		const balance = response.ok ? providerBalanceOf(JSON.parse(body || "null")) : undefined;
		return {
			at: stamps.local,
			atUtc: stamps.utc,
			status: response.status,
			outcome: response.ok ? "answered" : "refused",
			...(balance === undefined ? {} : { balance }),
			document: body.slice(0, 4_000),
		};
	} catch (error) {
		return { at: stamps.local, atUtc: stamps.utc, status: null, outcome: error instanceof Error ? `unreachable (${error.name})` : "unreachable" };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * One independent read of the Codex allowance answer.
 *
 * This one goes through the framework's own public HTTP module with the shared configuration's named
 * `codex` proxy, because that is the connection that endpoint has on this host; the account's *answer*
 * is still read here by this script's own parser, which is what keeps the comparison independent of
 * the extension's reading of it.
 */
async function readCodexAccount(credential: ProviderCredential): Promise<AccountRead> {
	const at = Date.now();
	const stamps = instantsOf(at);
	try {
		const response = await request(CODEX_USAGE_URL, {
			method: "GET",
			headers: { authorization: `Bearer ${credential.secret}` },
			timeoutMs: ACCOUNT_READ_TIMEOUT_MS,
			proxy: CODEX_USAGE_PROXY,
		});
		const body = await response.text();
		const document = JSON.parse(body || "null") as unknown;
		return {
			at: stamps.local,
			atUtc: stamps.utc,
			status: response.status,
			outcome: response.ok ? "answered" : "refused",
			...(response.ok ? { windows: allowanceWindowsOf(document, at) } : {}),
			document: body.slice(0, 4_000),
		};
	} catch (error) {
		return { at: stamps.local, atUtc: stamps.utc, status: null, outcome: error instanceof Error ? `unreachable (${error.name})` : "unreachable" };
	}
}

/** Everything one real run of the host left observable. */
interface HostRun {
	readonly observedAt: string;
	readonly observedAtUtc: string;
	readonly drawnLines: readonly string[];
	readonly modelRequestFrames: number;
	readonly stderr: string;
	readonly exitCode: number | null;
	readonly storageFiles: readonly string[];
	readonly consumptionDocument: string;
	readonly failure?: string;
}

/** The widget lines one RPC frame published for this extension's own key, or nothing for another frame. */
function widgetLinesOf(frame: { readonly [key: string]: unknown }): string[] | undefined {
	if (frame["type"] !== "extension_ui_request" || frame["method"] !== "setWidget" || frame["widgetKey"] !== "z-model-cost") {
		return undefined;
	}
	const lines = frame["widgetLines"];
	return Array.isArray(lines) ? lines.map(line => String(line)) : undefined;
}

/** Whether one set of drawn lines carries the reading one scenario waits for. */
function carriesReading(scenario: AccountScenario, lines: readonly string[]): boolean {
	if (scenario.id === "deepseek-balance") return displayedBalanceOf(lines) !== undefined;
	return lines.some(line => /^(5h|7d)\b/.test(line));
}

/**
 * Run the real host once for one scenario, in its own isolated root, and observe the widget frames it
 * publishes until the scenario's own reading appears.
 *
 * Nothing is prompted: the extension's provider query is the initialization's own prefetch, so the
 * reading arrives without a model request — which this run records as the absence of both
 * `agent_start`/`agent_end` frames and a session journal file. The isolated home is what makes the
 * extension's storage root a temp one; the machine's own storage root is listed by the caller before
 * and after.
 */
async function runHost(
	options: Options,
	cli: PiCli,
	scenario: AccountScenario,
	credential: ProviderCredential,
	catalog: unknown,
	selector: string,
): Promise<HostRun> {
	const runRoot = createRunRoot(`pi-account-${scenario.id}`);
	const home = path.join(runRoot.path, "user-home");
	mkdirSync(path.join(home, ISOLATED_STORAGE_RELATIVE), { recursive: true });
	// The run's own agent state: the one record this script resolved, and the host's own catalog when
	// the machine keeps one. Everything else of the machine's agent state stays out of the run.
	const record =
		credential.kind === "api_key"
			? { type: credential.kind, key: credential.secret }
			: { type: credential.kind, access: credential.secret, refresh: "", expires: 0 };
	writeFileSync(path.join(runRoot.agentDir, CREDENTIAL_FILE), `${JSON.stringify({ [scenario.provider]: record }, null, 2)}\n`);
	const catalogDirectory = catalogDirectoryOf(options);
	if (catalogDirectory !== undefined) {
		copyFileSync(path.join(catalogDirectory, CATALOG_FILE), path.join(runRoot.agentDir, CATALOG_FILE));
	}
	const session = await PiSession.start({
		cli,
		runRoot,
		entrypoint: ENTRYPOINT,
		selector,
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
			// A real operator run is an online one: the offline flag the dock's controlled runs set is
			// cleared here so the reading is taken under normal host conditions.
			PI_OFFLINE: undefined,
		},
	});
	let sessionLive = true;
	try {
		const deadline = Date.now() + READING_TIMEOUT_MS;
		let drawnLines: readonly string[] | undefined;
		while (Date.now() < deadline) {
			const renders = session
				.frames()
				.map(frame => widgetLinesOf(frame))
				.filter((lines): lines is string[] => lines !== undefined);
			const found = renders.find(lines => carriesReading(scenario, lines));
			if (found !== undefined) {
				drawnLines = found;
				break;
			}
			await Bun.sleep(100);
		}
		const observedAt = Date.now();
		const exit = await session.stop();
		sessionLive = false;
		const storageRoot = path.join(home, ISOLATED_STORAGE_RELATIVE);
		const consumption = path.join(storageRoot, CONSUMPTION_FILE);
		return {
			observedAt: instantsOf(observedAt).local,
			observedAtUtc: instantsOf(observedAt).utc,
			drawnLines: drawnLines ?? [],
			modelRequestFrames: session.frames().filter(frame => frame["type"] === "agent_start" || frame["type"] === "agent_end").length,
			stderr: redactSecrets(session.stderr(), [credential.secret]),
			exitCode: exit.exitCode,
			storageFiles: directoryListing(storageRoot),
			consumptionDocument: existsSync(consumption) ? redactSecrets(readFileSync(consumption, "utf8").slice(0, 4_000), [credential.secret]) : "",
			...(drawnLines === undefined
				? {
						failure: `no widget rendering carried ${
							scenario.id === "deepseek-balance" ? "a balance line" : "an allowance line"
						} within ${READING_TIMEOUT_MS}ms`,
					}
				: {}),
		};
	} finally {
		// The run's own resources are released on every path: a session that is still live is stopped,
		// and the temp root goes with it unless the caller asked to keep the run for inspection.
		if (sessionLive && session.running()) await session.stop({ timeoutMs: 10_000 }).catch(() => undefined);
		if (options.keep) console.log(`      kept run root: ${runRoot.path}`);
		else runRoot.dispose();
	}
}

/** Where the host's catalog is read from: the prepared isolated state first, then the machine's own. */
function catalogDirectoryOf(options: Options): string | undefined {
	for (const directory of [options.preparedAgentDir, options.agentDir]) {
		if (existsSync(path.join(directory, CATALOG_FILE))) return directory;
	}
	return undefined;
}

/** The credential one scenario runs on: the prepared isolated state's own first, then the machine's. */
function credentialFor(options: Options, scenario: AccountScenario): { readonly credential: ProviderCredential; readonly source: string } | undefined {
	for (const directory of [options.preparedAgentDir, options.agentDir]) {
		const credential = providerCredentialOf(readJson(path.join(directory, CREDENTIAL_FILE)), scenario.provider);
		if (credential !== undefined) return { credential, source: `${directory}/${CREDENTIAL_FILE}` };
	}
	return undefined;
}

/**
 * The `provider/model` pair one scenario's session runs on.
 *
 * The account's own facts are not those of a session, so the model choice is not what is observed; it
 * decides only which display a frontend draws. The run therefore starts on the pair the machine itself
 * uses when that pair belongs to the scenario's provider (a real operator's own configuration), else
 * on that provider's first catalog model, and refuses the scenario when neither exists rather than
 * inventing a model id.
 */
function selectorOf(options: Options, scenario: AccountScenario, catalog: unknown, settings: unknown): string | undefined {
	if (options.model !== undefined) return options.model;
	const declared = recordOf(settings);
	const declaredModel = declared?.["defaultProvider"] === scenario.provider ? stringOf(declared["defaultModel"]) : undefined;
	if (declaredModel !== undefined) return `${scenario.provider}/${declaredModel}`;
	const first = firstModelOf(catalog, scenario.provider);
	return first === undefined ? undefined : `${scenario.provider}/${first}`;
}

/** The step that would supply one provider's missing credential, for the report to state exactly. */
function loginStep(options: Options, cliPath: string, provider: string): string {
	return (
		`clear the resolution offsets (OMP_PROFILE PI_PROFILE XDG_DATA_HOME XDG_CONFIG_HOME PI_CODING_AGENT_DIR OMP_AUTH_BROKER_*), then:\n` +
		`        PI_CODING_AGENT_DIR=${options.preparedAgentDir} ${cliPath} login ${provider}\n` +
		`      that credential lands in the isolated state and never in the formal one`
	);
}

/** One scenario's outcome, as the report publishes it. */
interface ScenarioOutcome {
	readonly id: string;
	readonly provider: string;
	readonly reading: string;
	readonly status: "observed" | "blocked" | "failed";
	readonly reason?: string;
	readonly prerequisite?: string;
	readonly credential?: { readonly provider: string; readonly kind: string; readonly fingerprint: string; readonly source: string };
	readonly selector?: string;
	readonly startedAt?: string;
	readonly observedAt?: string;
	readonly finishedAt?: string;
	readonly accountReads?: { readonly before: AccountRead; readonly after: AccountRead };
	readonly drawn?: readonly string[];
	readonly balanceAgreement?: BalanceAgreement;
	readonly allowanceAgreement?: { readonly fiveHour: AllowanceAgreement; readonly weekly: AllowanceAgreement };
	readonly referencePrice?: Record<string, unknown>;
	readonly modelRequests?: string;
	readonly exitCode?: number | null;
	readonly stderr?: string;
	readonly storageFiles?: readonly string[];
	readonly consumptionDocument?: string;
	readonly uncovered?: readonly string[];
}

/** One scenario, carried through resolution, its two account reads, the host run and the comparison. */
async function readScenario(
	options: Options,
	cli: PiCli,
	scenario: AccountScenario,
	catalog: unknown,
	settings: unknown,
): Promise<ScenarioOutcome> {
	const base = { id: scenario.id, provider: scenario.provider, reading: scenario.reading };
	const resolved = credentialFor(options, scenario);
	if (resolved === undefined) {
		return {
			...base,
			status: "blocked",
			reason: `neither ${options.preparedAgentDir}/${CREDENTIAL_FILE} nor ${options.agentDir}/${CREDENTIAL_FILE} holds a usable credential for '${scenario.provider}'`,
			prerequisite: loginStep(options, cli.path, scenario.provider),
			uncovered: ["the account's own answer for this provider", "the reading the loaded extension draws from it"],
		};
	}
	const selector = selectorOf(options, scenario, catalog, settings);
	const credentialSummary = {
		provider: scenario.provider,
		kind: resolved.credential.kind,
		fingerprint: credentialFingerprint(resolved.credential.secret),
		source: resolved.source,
	};
	resolvedSecrets.push(resolved.credential.secret);
	if (selector === undefined) {
		return {
			...base,
			status: "blocked",
			reason: `no model for provider '${scenario.provider}' is stated by the prepared or machine catalog, so no session could run it`,
			prerequisite: "'--model <provider>/<model>' names the pair this scenario's session should run",
			credential: credentialSummary,
			uncovered: ["the reading the loaded extension draws from this account"],
		};
	}
	const startedAt = Date.now();
	const baseUrl = baseUrlOf(catalog, scenario.provider) ?? DEEPSEEK_DEFAULT_BASE_URL;
	const readAccount = async (): Promise<AccountRead> =>
		scenario.id === "deepseek-balance" ? readDeepseekAccount(resolved.credential, baseUrl) : readCodexAccount(resolved.credential);
	const before = await readAccount();
	const run = await runHost(options, cli, scenario, resolved.credential, catalog, selector);
	const after = await readAccount();
	const published: ScenarioOutcome = {
		...base,
		status: "observed",
		credential: credentialSummary,
		selector,
		startedAt: instantsOf(startedAt).local,
		observedAt: run.observedAt,
		finishedAt: instantsOf(Date.now()).local,
		accountReads: { before, after },
		drawn: run.drawnLines.map(line => redactSecrets(line, [resolved.credential.secret])),
		referencePrice: referencePriceOf(catalog, scenario.provider, selector.slice(selector.indexOf("/") + 1)),
		modelRequests: run.modelRequestFrames === 0 ? "none: no model request was made by this run" : `${run.modelRequestFrames} model-request frame(s)`,
		exitCode: run.exitCode,
		stderr: run.stderr,
		storageFiles: run.storageFiles,
		consumptionDocument: run.consumptionDocument,
	};
	if (run.failure !== undefined) {
		return { ...published, status: "failed", reason: run.failure, uncovered: ["the reading the loaded extension draws from this account"] };
	}
	if (scenario.id === "deepseek-balance") {
		const drawn = displayedBalanceOf(run.drawnLines);
		if (drawn?.amount === undefined) {
			const why = drawn?.unavailable === undefined ? "the host drew no balance line" : `the host drew 'unavailable (${drawn.unavailable})'`;
			return { ...published, status: "failed", reason: `${why}, so no amount was read for this account`, uncovered: ["the reading the loaded extension draws from this account"] };
		}
		const agreement = balanceAgreementOf(drawn.amount, before.balance?.total ?? "", after.balance?.total ?? "");
		const supported = agreement.verdict === "the account's own value";
		return {
			...published,
			status: supported ? "observed" : "failed",
			balanceAgreement: agreement,
			...(supported
				? {}
				: {
						reason: `the drawn amount ${drawn.amount} is not one the account's own reads (${before.balance?.total ?? "none"}, ${after.balance?.total ?? "none"}) support`,
					}),
		};
	}
	const drawnWindows = displayedAllowanceOf(run.drawnLines);
	const allowances = {
		fiveHour: allowanceAgreementOf(drawnWindows.fiveHour, before.windows?.fiveHour?.usedPercent, after.windows?.fiveHour?.usedPercent),
		weekly: allowanceAgreementOf(drawnWindows.weekly, before.windows?.weekly?.usedPercent, after.windows?.weekly?.usedPercent),
	};
	const agreed = allowances.fiveHour.verdict === "the account's own reading" && allowances.weekly.verdict === "the account's own reading";
	return {
		...published,
		status: agreed ? "observed" : "failed",
		allowanceAgreement: allowances,
		...(agreed ? {} : { reason: "a drawn allowance window is not one the account's own reads support" }),
	};
}

/** The report's own notes: the rules this material must not be read against. */
const NOTES: readonly string[] = [
	"An account's answer is an account-side fact. A balance that changed while this ran is not a request cost: the account moves for its own reasons (other clients, grants, rounding, the discount its price list already reflects), and the maintained model price is reference pricing for the extension's own computed cost.",
	"No provider charge has to equal the maintained model price, and this material does not claim it does.",
	"No fixture answered anything here: every reading is the provider's own answer to its own endpoint, and the automated protocol checks' scripted answers are kept apart from it in the migration evidence.",
	"A credential reaches this report only as a truncated SHA-256 fingerprint; the value itself was read by the run and never written out.",
	"Every run used an isolated agent state, session directory, working directory and user home. The machine's formal agent state was read for the credential and the catalog, and its real storage root was listed before and after the runs.",
];

/** Print the steps that would supply the credentials this machine cannot resolve, and make that state. */
function prepare(options: Options, cli: PiCli): void {
	mkdirSync(options.preparedAgentDir, { recursive: true });
	console.log(`prepared isolated agent state: ${options.preparedAgentDir}`);
	const missing = SCENARIOS.filter(scenario => credentialFor(options, scenario) === undefined);
	if (missing.length === 0) {
		console.log("every scenario's provider already resolves a credential; nothing has to be logged in");
		return;
	}
	console.log("the credentials this machine's own pi store cannot resolve:");
	for (const scenario of missing) console.log(`  ${scenario.provider}:\n        ${loginStep(options, cli.path, scenario.provider)}`);
	console.log(
		"\nnothing was installed, logged in or switched: those steps are yours to run, and the next run of this script\n" +
			"reads the credential from that isolated state (never from the formal one) and publishes it only as a fingerprint.",
	);
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const cli = resolvePiCli();
	if (options.prepare) {
		prepare(options, cli);
		return;
	}
	const version = await piVersion(cli);
	const catalogDirectory = catalogDirectoryOf(options);
	const catalog = catalogDirectory === undefined ? undefined : readJson(path.join(catalogDirectory, CATALOG_FILE));
	const settings = readJson(path.join(options.agentDir, SETTINGS_FILE));
	const machineStorageRoot = path.join(homedir(), ".omp", "cost-archive");
	const storageBefore = directoryListing(machineStorageRoot);
	const startedAt = Date.now();
	console.log(`pi ${version} (${cli.path}, ${cli.source})`);
	console.log(`entrypoint: ${ENTRYPOINT}`);
	console.log(`credential sources: ${options.preparedAgentDir}, then ${options.agentDir}`);
	const scenarios: ScenarioOutcome[] = [];
	for (const scenario of options.scenarios) {
		console.log(`\n${scenario.id}: ${scenario.reading}`);
		const outcome = await readScenario(options, cli, scenario, catalog, settings);
		scenarios.push(outcome);
		if (outcome.status === "blocked") {
			console.log(`  BLOCKED  ${outcome.reason}`);
			console.log(`           supply it with: ${outcome.prerequisite}`);
			continue;
		}
		for (const read of [outcome.accountReads?.before, outcome.accountReads?.after]) {
			if (read === undefined) continue;
			console.log(`  account  ${read.at} -> ${read.outcome}${read.status === null ? "" : ` (HTTP ${read.status})`}`);
		}
		console.log(`  credential ${outcome.credential?.fingerprint} (${outcome.credential?.kind}, ${outcome.credential?.source})`);
		console.log(`  host     ${outcome.observedAt} selector ${outcome.selector}; model requests: ${outcome.modelRequests}`);
		for (const line of outcome.drawn ?? []) console.log(`  drawn    ${line}`);
		if (outcome.balanceAgreement !== undefined) {
			const agreement = outcome.balanceAgreement;
			console.log(`  VERDICT  ${agreement.verdict}: drawn ${agreement.displayed}, account ${agreement.before} then ${agreement.after}`);
		}
		if (outcome.allowanceAgreement !== undefined) {
			for (const [window, agreement] of Object.entries(outcome.allowanceAgreement)) {
				console.log(`  VERDICT  ${window}: ${agreement.verdict} (drawn ${agreement.drawn}, account ${agreement.before} then ${agreement.after})`);
			}
		}
		if (outcome.status === "failed") console.log(`  FAILED   ${outcome.reason}`);
	}
	const storageAfter = directoryListing(machineStorageRoot);
	const report = {
		readAt: instantsOf(startedAt).local,
		readAtUtc: instantsOf(startedAt).utc,
		finishedAt: instantsOf(Date.now()).local,
		pi: { version, cli: cli.path, source: cli.source },
		entrypoint: ENTRYPOINT,
		repository: REPOSITORY_ROOT,
		platform: `${process.platform} ${process.arch}`,
		runtime: `bun ${Bun.version}`,
		harnessPatches: "none: the pi path runs the shipped entrypoint on the installed pi, with no host patch applied",
		credentialSources: { prepared: options.preparedAgentDir, machine: options.agentDir },
		machineStorageRoot: {
			directory: machineStorageRoot,
			changedByTheseRuns: JSON.stringify(storageBefore) !== JSON.stringify(storageAfter),
			listing: storageBefore,
		},
		scenarios,
		notes: NOTES,
	};
	mkdirSync(options.outDirectory, { recursive: true });
	const written = path.join(options.outDirectory, `readings-${instantsOf(startedAt).utc.replace(/[:.]/g, "-")}.json`);
	writeFileSync(written, `${redactSecrets(JSON.stringify(report, null, 2), resolvedSecrets)}\n`);
	const observed = scenarios.filter(scenario => scenario.status === "observed").length;
	const blocked = scenarios.filter(scenario => scenario.status === "blocked").length;
	const failed = scenarios.filter(scenario => scenario.status === "failed").length;
	console.log(
		`\nACCOUNT READ SUMMARY: ${observed} observed, ${blocked} blocked, ${failed} failed — report: ${written}` +
			(failed > 0 ? "\nA scenario that ran did not agree with the account's own answer; see the report." : ""),
	);
	process.exitCode = failed > 0 ? 1 : 0;
	// Bun keeps one handle for about twenty seconds after a spawned harness child has exited. That is
	// teardown time this script does not owe and no part of its evidence depends on it: the report is
	// written synchronously above, so the process ends here rather than waiting the handle out.
	process.exit(process.exitCode);
}

await main();
