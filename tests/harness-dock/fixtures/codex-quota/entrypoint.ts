/**
 * Dock fixture extension: the model-cost runtime's Codex allowance windows and the Turn facts a real
 * harness delivers, observed in a real harness.
 *
 * It binds the *production* extension definition and the *production* runtime through the framework's
 * own OMP adapter, exactly as `entrypoints/omp/model-cost.ts` does, and adds nothing to the business:
 * the runtime is the one `createModelCostRuntime` builds, and the one account API query it makes —
 * while the instance initializes, and again whenever a settled Codex Turn finds the last accepted
 * reading older than the configured success TTL — is the query and the parser the production modules
 * really hold. What this fixture substitutes is that query's transport alone, the same substitution
 * the runtime's own suites make: the framework module the account query runs through is pointed at an
 * absent shared file, so the address it reaches does not depend on the machine's own
 * `framework/config.yaml` — and when the dock sets {@link CODEX_QUOTA_SCRIPT_DIR_ENV}, every call to
 * the account API's own address is answered from that run's script directory instead:
 *
 * - the n-th call is answered with the document `answer-<n>.json` states — an unscripted call is
 *   answered like the last scripted one, so a run scripts only the answers that carry meaning — a
 *   script that says `hold` is answered only once the run writes `release`, and every call is
 *   appended to `calls.jsonl` as it arrives, so the dock can count what was really asked and read the
 *   address, the budget, the proxy selection and the headers the runtime itself stated;
 * - every other address keeps the production module's own behaviour over the absent shared file, so
 *   nothing but the account query is scripted.
 *
 * The run's success TTL is the extension's own `config.yaml` value unless the dock sets
 * {@link CODEX_QUOTA_TTL_MS_ENV}, which builds this one run's runtime from that number instead. The
 * override exists here and nowhere else: it is what lets a dock case drive the TTL policy — a fresh
 * reading that keeps a settled Turn from asking again, a stale one that lets it — without waiting the
 * shipped fifteen seconds out, and no shipped default is stated here.
 *
 * What the fixture owns besides that transport is only the observation channel — it has no widget, so
 * it writes what it reads to stderr, which is the channel the dock already captures:
 *
 * - one `quota` line per change the runtime publishes, carrying the read-only result,
 * - one `estimate` line per change, carrying the ratio/left segment the same notification redraws, and
 * - one `turn` line per settled Turn, carrying the Turn's own facts: its identity, its provider, its
 *   outcome, and whether the delivery carried the response's HTTP facts. The last line is what makes
 *   the *host's* half observable: a host that publishes no response boundary still settles the Turn,
 *   and a host that publishes one has that fact stated — the windows no longer read it either way.
 *
 * The runtime it builds is the process's one instance, because the adapter's factory runs once: the
 * quota subscription below is created inside that factory, so every window the runtime accepts — the
 * startup answer or a settled Turn's refresh, and an attempt's own failure — is one line.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import { CODEX_USAGE_URL } from "../../../../extensions/model-cost/shared-logic/business/allowance/codex-quota";
import {
	type ModelCostRuntime,
	createModelCostRuntime,
	modelCostImplementation,
} from "../../../../extensions/model-cost/shared-logic/runtime";
import { type OmpExtensionApi, ompAdapter } from "../../../../adapters/omp";
import type { ImplementationSubscription } from "../../../../framework/interface";
import type { HttpRequestOptions } from "../../../../framework/interface/general/http";
import { createHttpModule } from "../../../../framework/modules/http";

/** This repository, which is where the extension's own declared configuration is resolved from. */
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** The directory the extension's own `config.yaml` lives in, as its OMP assembly states it. */
const CONFIG_DIRECTORY = join(REPOSITORY_ROOT, "extensions", MODEL_COST.id);

/**
 * A shared-configuration path with no file at it.
 *
 * The account query selects the named `codex` proxy and the balance query connects directly, so the
 * framework module both run through reads `framework/config.yaml`. Pointing that module at this
 * absent path keeps the run's own startup refusals deterministic whatever the machine running the
 * dock has configured there, instead of turning this smoke into a test of the machine's proxy setup.
 */
const ABSENT_SHARED_CONFIG = join(tmpdir(), `model-cost-codex-quota-absent-${process.pid}`, "config.yaml");

/** The production `request` shape over that absent shared file: what the runtime really calls. */
const unconfiguredRequest = createHttpModule({ configPath: ABSENT_SHARED_CONFIG }).request;

/** The environment name that points this fixture at one run's account-query script directory. */
export const CODEX_QUOTA_SCRIPT_DIR_ENV = "MODEL_COST_CODEX_QUOTA_SCRIPT_DIR";

/** The environment name that builds this run's runtime from its own Codex success TTL. */
export const CODEX_QUOTA_TTL_MS_ENV = "MODEL_COST_CODEX_QUOTA_TTL_MS";

/** The prefix of the quota line this fixture writes, so the dock can find it among the rest. */
export const CODEX_QUOTA_LINE = `[${MODEL_COST.id}] quota `;

/** The prefix of the estimate line this fixture writes: the ratio/left segment read beside the windows. */
export const CODEX_QUOTA_ESTIMATE_LINE = `[${MODEL_COST.id}] estimate `;

/** The prefix of the Turn line this fixture writes, beside the quota lines. */
export const CODEX_QUOTA_TURN_LINE = `[${MODEL_COST.id}] turn `;

/** One scripted account API answer: what the n-th account query of one run receives. */
export interface ScriptedAccountAnswer {
	/** The answer body, exactly as the account API would carry it. */
	readonly document: unknown;
	/** The status to answer with instead of 200; the document is then the answer's own failure body. */
	readonly status?: number;
	/**
	 * Withhold this answer until the run writes the release marker.
	 *
	 * This is how a dock case keeps a query provably outstanding — the transport has been called and
	 * no answer has been given — so a second settled Turn can be observed joining it.
	 */
	readonly hold?: boolean;
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

/** The call log and the release marker one script directory holds, beside its per-call answer files. */
const CALLS_FILE = "calls.jsonl";
const RELEASE_FILE = "release";

/** How long a held answer waits for its run's release marker before the attempt gives up. */
const HOLD_LIMIT_MS = 60_000;

/** The interval a held answer re-checks the release marker on. */
const HOLD_POLL_MS = 25;

/** Write the answer the n-th account query of one run receives (1-based). */
export function writeAccountAnswer(dir: string, index: number, answer: ScriptedAccountAnswer): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `answer-${index}.json`), JSON.stringify(answer), "utf8");
}

/** Release every held answer of one run: the outstanding query answers as its script states. */
export function releaseAccountQueries(dir: string): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, RELEASE_FILE), "", "utf8");
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

/** Record one arriving call before it is answered, so a held query is visibly out. */
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
 * Wait for the run's release marker, the one thing a held answer waits on.
 *
 * The marker is written by the dock's own process — the one running the case — so nothing inside the
 * harness can be awaited for it: the poll is the observation, and the deadline keeps a run whose case
 * failed from hanging the harness process forever.
 */
async function awaitRelease(dir: string): Promise<void> {
	const marker = join(dir, RELEASE_FILE);
	const deadline = Date.now() + HOLD_LIMIT_MS;
	while (!existsSync(marker)) {
		if (Date.now() >= deadline) {
			throw new Error(`the account query was held for ${HOLD_LIMIT_MS} ms and the run never released it`);
		}
		await new Promise<void>(settle => {
			setTimeout(settle, HOLD_POLL_MS);
		});
	}
}

/**
 * The account query's transport as one dock run scripts it.
 *
 * Only the account API's own address is intercepted; every other call keeps the production module's
 * behaviour over the absent shared file, so the balance path is exactly what it is without a script.
 */
function scriptedAccountRequest(dir: string): (url: string, options?: HttpRequestOptions) => Promise<Response> {
	let calls = 0;
	let last: ScriptedAccountAnswer | undefined;
	return async (url, options) => {
		if (url !== CODEX_USAGE_URL) return unconfiguredRequest(url, options);
		const index = ++calls;
		recordAccountQuery(dir, index, url, options);
		const answer = scriptedAnswer(dir, index) ?? last;
		if (answer === undefined) throw new Error(`the dock scripted no answer for this run's first account query`);
		last = answer;
		if (answer.hold === true) await awaitRelease(dir);
		return new Response(JSON.stringify(answer.document), {
			status: answer.status ?? 200,
			headers: { "content-type": "application/json" },
		});
	};
}

/** The success TTL one dock run states for this process, or nothing when it states none. */
function declaredTtlMs(): number | undefined {
	const declared = Number(process.env[CODEX_QUOTA_TTL_MS_ENV]);
	return Number.isFinite(declared) && declared > 0 ? declared : undefined;
}

export default function codexQuotaProbe(pi: OmpExtensionApi): void {
	// The fixture's own observation group, beside the production subscriptions: it changes no business
	// and reads only what the framework delivered to this session.
	const observe: ImplementationSubscription<ModelCostRuntime> = {
		scope: "session",
		events: {
			turn_end: (_runtime, turn) => {
				process.stderr.write(
					`${CODEX_QUOTA_TURN_LINE}${JSON.stringify({
						turnId: turn.turn.turnId,
						provider: turn.turn.provider,
						outcome: turn.end.outcome,
						hasHttpFacts: turn.end.http !== undefined,
						headerNames: turn.end.http === undefined ? [] : Object.keys(turn.end.http.headers).sort(),
						unavailable: turn.end.unavailable,
					})}\n`,
				);
			},
		},
	};
	const scriptDir = process.env[CODEX_QUOTA_SCRIPT_DIR_ENV];
	const accountRequest = scriptDir === undefined ? unconfiguredRequest : scriptedAccountRequest(scriptDir);
	ompAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
		implementation: modelCostImplementation(
			context => {
				const ttlMs = declaredTtlMs();
				const runtime: ModelCostRuntime = createModelCostRuntime({
					config: ttlMs === undefined ? context.config : { ...context.config, codexQuotaTtlMs: ttlMs },
					configDirectory: CONFIG_DIRECTORY,
					userHomeDirectory: homedir(),
					harness: "omp",
					session: context.session,
					httpRequest: accountRequest,
					...(context.providerAccess === undefined ? {} : { providerAccess: context.providerAccess }),
				});
				// The runtime's own change notification is what a frontend redraws on; this frontend draws
				// the read-only result as one line instead, with the ratio/left segment the same notification
				// redraws beside it.
				runtime.view.subscribe(() => {
					process.stderr.write(`${CODEX_QUOTA_LINE}${JSON.stringify(runtime.presentation.quota())}\n`);
					process.stderr.write(`${CODEX_QUOTA_ESTIMATE_LINE}${JSON.stringify(runtime.presentation.estimate() ?? null)}\n`);
				});
				return runtime;
			},
			{ subscriptions: [observe] },
		),
	})(pi);
}
