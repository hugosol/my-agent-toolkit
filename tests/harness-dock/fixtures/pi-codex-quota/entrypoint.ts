/**
 * Dock fixture extension: model-cost's Codex allowance windows and ratio estimate in a real pi run.
 *
 * It binds the *production* extension definition and the *production* runtime through the framework's
 * own pi adapter, exactly as `entrypoints/pi/model-cost.ts` does through the extension's pi assembly,
 * and adds nothing to the business: the runtime is the one `createModelCostRuntime` builds, its one
 * account API query — made while the instance initializes, and again whenever a settled Codex request
 * finds the last accepted reading older than the configured success TTL — is the query and parser the
 * production modules really hold, and the ratio measurement it feeds is the production
 * `codex-estimate.ts` behind the production estimate document.
 *
 * What this fixture substitutes is that query's transport alone, the same substitution the runtime's
 * own suites make: the framework module the account query runs through is pointed at an absent shared
 * file, so the address it reaches does not depend on the machine's own `framework/config.yaml` — and
 * when the smoke sets {@link PI_CODEX_QUOTA_SCRIPT_DIR_ENV}, every call to the account API's own
 * address is answered from that run's script directory instead:
 *
 * - the n-th call is answered with the document `answer-<n>.json` states — an unscripted call is
 *   answered like the last scripted one, so a run scripts only the answers that carry meaning — and
 *   every call is appended to `calls.jsonl` as it arrives, so the smoke can count what was really
 *   asked and read the address, the budget, the proxy selection and the headers the runtime itself
 *   stated;
 * - every other address keeps the production module's own behaviour over the absent shared file, so
 *   nothing but the account query is scripted. The balance query is one of those: a run whose
 *   declared provider is the Codex one resolves no DeepSeek access, so no balance request is made.
 *
 * The run's success TTL is the extension's own `config.yaml` value unless the smoke sets
 * {@link PI_CODEX_QUOTA_TTL_MS_ENV}, which builds this one run's runtime from that number instead. The
 * override exists here and nowhere else: it is what lets a run drive the TTL policy — a reading that
 * is stale the moment a Turn settles, versus one that outlives the whole run — without waiting the
 * shipped fifteen seconds out, and no shipped default is stated here.
 *
 * What the fixture owns besides that transport is only the observation channel: it has no widget, so
 * it writes what it reads to stderr, which is the channel the smoke already captures:
 *
 * - one `quota` line per change the runtime publishes, carrying the read-only result a frontend
 *   would draw (`runtime.presentation.quota()`), and
 * - one `estimate` line per change, carrying the ratio/left segment the same notification redraws
 *   (`runtime.presentation.estimate()`), or `null` while neither window is readable.
 *
 * That notification is the one the whole read-only result shares, so a line also follows a change that
 * touched no window — a session's Round edge, say. A reader therefore waits for the reading it is
 * about rather than for the first line to arrive, and the lines are a log of what the result held, not
 * a count of account queries: those the run's own script directory counts.
 *
 * The runtime it builds is the process's one instance, because the adapter's factory runs once, and
 * the subscription below is created inside that factory.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import { MODEL_COST_HARNESS } from "../../../../extensions/model-cost/harnesses/pi";
import { CODEX_USAGE_URL } from "../../../../extensions/model-cost/shared-logic/business/allowance/codex-quota";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import { type PiExtensionApi, piAdapter } from "../../../../adapters/pi";
import { createHttpModule, type HttpRequestOptions } from "../../../../framework/modules/http";

/** This repository, which is where the extension's own declared configuration is resolved from. */
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** The directory the extension's own `config.yaml` lives in, as its pi assembly states it. */
const CONFIG_DIRECTORY = join(REPOSITORY_ROOT, "extensions", MODEL_COST.id);

/**
 * A shared-configuration path with no file at it.
 *
 * The account query selects the named `codex` proxy, so the framework module it runs through reads
 * `framework/config.yaml`. Pointing that module at this absent path keeps the run's own startup
 * refusals deterministic whatever the machine running the smoke has configured there, instead of
 * turning the run into a test of the machine's proxy setup.
 */
const ABSENT_SHARED_CONFIG = join(tmpdir(), `model-cost-pi-codex-quota-absent-${process.pid}`, "config.yaml");

/** The production `request` shape over that absent shared file: what the runtime really calls. */
const unconfiguredRequest = createHttpModule({ configPath: ABSENT_SHARED_CONFIG }).request;

/** The environment name that points this fixture at one run's account-query script directory. */
export const PI_CODEX_QUOTA_SCRIPT_DIR_ENV = "PI_MODEL_COST_CODEX_QUOTA_SCRIPT_DIR";

/** The environment name that builds this run's runtime from its own Codex success TTL. */
export const PI_CODEX_QUOTA_TTL_MS_ENV = "PI_MODEL_COST_CODEX_QUOTA_TTL_MS";

/** The prefix of the quota line this fixture writes, so a reader can find it among the rest. */
export const PI_CODEX_QUOTA_LINE = `[${MODEL_COST.id}] quota `;

/** The prefix of the estimate line this fixture writes: the ratio/left segment read beside the windows. */
export const PI_CODEX_QUOTA_ESTIMATE_LINE = `[${MODEL_COST.id}] estimate `;

/** One scripted account API answer: what the n-th account query of one run receives. */
export interface ScriptedAccountAnswer {
	/** The answer body, exactly as the account API would carry it. */
	readonly document: unknown;
	/** The status to answer with instead of 200; the document is then the answer's own failure body. */
	readonly status?: number;
}

/** One account query the fixture's transport answered, as it recorded it when the call arrived. */
export interface RecordedAccountQuery {
	/** The call's position in this run's own sequence, 1-based. */
	readonly index: number;
	/** When the call arrived, on this process's clock. */
	readonly at: number;
	readonly method: string;
	readonly url: string;
	/** The proxy selection the runtime stated: a named entry, `false` for a direct connection, or null. */
	readonly proxy: false | string | null;
	/** The wait budget the runtime stated, in milliseconds, or null when it stated none. */
	readonly timeoutMs: number | null;
	/** The headers the runtime itself prepared, exactly as it stated them. */
	readonly headers: Readonly<Record<string, string>>;
}

/** The call log one script directory holds, beside its per-call answer files. */
const CALLS_FILE = "calls.jsonl";

/** Write the answer the n-th account query of one run receives (1-based). */
export function writeAccountAnswer(dir: string, index: number, answer: ScriptedAccountAnswer): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `answer-${index}.json`), JSON.stringify(answer), "utf8");
}

/** Every account query one run's transport answered, in the order the calls arrived. */
export function recordedAccountQueries(dir: string): RecordedAccountQuery[] {
	if (!existsSync(join(dir, CALLS_FILE))) return [];
	return readFileSync(join(dir, CALLS_FILE), "utf8")
		.split("\n")
		.filter(line => line.trim().length > 0)
		.map(line => JSON.parse(line) as RecordedAccountQuery);
}

/** One scripted answer as the fixture reads it back, or nothing while the call is not scripted yet. */
function scriptedAnswer(dir: string, index: number): ScriptedAccountAnswer | undefined {
	try {
		return JSON.parse(readFileSync(join(dir, `answer-${index}.json`), "utf8")) as ScriptedAccountAnswer;
	} catch {
		return undefined;
	}
}

/** Record one arriving call before it is answered, so the smoke can count what was really asked. */
function recordAccountQuery(dir: string, index: number, url: string, options: HttpRequestOptions | undefined): void {
	const record: RecordedAccountQuery = {
		index,
		at: Date.now(),
		method: options?.method ?? "GET",
		url,
		proxy: options?.proxy ?? null,
		timeoutMs: options?.timeoutMs ?? null,
		headers: options?.headers === undefined ? {} : { ...options.headers },
	};
	appendFileSync(join(dir, CALLS_FILE), `${JSON.stringify(record)}\n`, "utf8");
}

/**
 * The account query's transport as one run scripts it.
 *
 * Only the account API's own address is intercepted; every other call keeps the production module's
 * behaviour over the absent shared file.
 */
function scriptedAccountRequest(dir: string): (url: string, options?: HttpRequestOptions) => Promise<Response> {
	let calls = 0;
	let last: ScriptedAccountAnswer | undefined;
	return async (url, options) => {
		if (url !== CODEX_USAGE_URL) return unconfiguredRequest(url, options);
		const index = ++calls;
		recordAccountQuery(dir, index, url, options);
		const answer = scriptedAnswer(dir, index) ?? last;
		if (answer === undefined) throw new Error(`the smoke scripted no answer for this run's first account query`);
		last = answer;
		return new Response(JSON.stringify(answer.document), {
			status: answer.status ?? 200,
			headers: { "content-type": "application/json" },
		});
	};
}

/** The success TTL one run states for this process, or nothing when it states none. */
function declaredTtlMs(): number | undefined {
	const declared = Number(process.env[PI_CODEX_QUOTA_TTL_MS_ENV]);
	return Number.isFinite(declared) && declared > 0 ? declared : undefined;
}

export default function piCodexQuotaProbe(pi: PiExtensionApi): void {
	const scriptDir = process.env[PI_CODEX_QUOTA_SCRIPT_DIR_ENV];
	const accountRequest = scriptDir === undefined ? unconfiguredRequest : scriptedAccountRequest(scriptDir);
	piAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
		factory: context => {
			const ttlMs = declaredTtlMs();
			const runtime: ModelCostRuntime = createModelCostRuntime({
				config: ttlMs === undefined ? context.config : { ...context.config, codexQuotaTtlMs: ttlMs },
				configDirectory: CONFIG_DIRECTORY,
				userHomeDirectory: homedir(),
				harness: MODEL_COST_HARNESS,
				session: context.session,
				httpRequest: accountRequest,
				...(context.providerAccess === undefined ? {} : { providerAccess: context.providerAccess }),
			});
			// The runtime's own change notification is what a frontend redraws on; this frontend writes
			// the two read-only results the allowance part of a drawing reads instead.
			runtime.view.subscribe(() => {
				process.stderr.write(`${PI_CODEX_QUOTA_LINE}${JSON.stringify(runtime.presentation.quota())}\n`);
				process.stderr.write(
					`${PI_CODEX_QUOTA_ESTIMATE_LINE}${JSON.stringify(runtime.presentation.estimate() ?? null)}\n`,
				);
			});
			return runtime.implementation;
		},
	})(pi);
}
