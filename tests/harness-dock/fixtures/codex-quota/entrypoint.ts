/**
 * Dock fixture extension: the model-cost runtime's Codex allowance windows and the Turn facts it
 * reads them from, observed in a real harness.
 *
 * It binds the *production* extension definition and the *production* runtime through the framework's
 * own OMP adapter, exactly as `entrypoints/omp/model-cost.ts` does, and adds nothing to the business:
 * the runtime is the one `createModelCostRuntime` builds, the account API attempt and the rate-limit
 * headers are the ones that runtime really makes and reads, and the harness driving them is the real
 * isolated install. What this fixture owns is only the observation channel — it has no widget, so it
 * writes what it reads to stderr, which is the channel the dock already captures:
 *
 * - one `quota` line per change the runtime publishes, carrying the read-only result,
 * - one `estimate` line per change, carrying the ratio/left segment the same notification redraws, and
 * - one `turn` line per settled Turn, carrying whether that Turn's end delivered the HTTP facts the
 *   runtime's header source reads. The last line is what makes the *host's* half of the wiring
 *   observable: a host that reports no response boundary for a provider leaves the runtime nothing to
 *   read, and that is a fact this fixture states rather than a silence.
 *
 * The runtime it builds is the process's one instance, because the adapter's factory runs once: the
 * quota subscription below is created inside that factory, so every window the runtime accepts — the
 * startup answer or a response's headers, and the startup attempt's own failure — is one line.
 */
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import { type OmpExtensionApi, ompAdapter } from "../../../../framework/adapters/omp";
import type { ExtensionImplementation, SubscriptionGroup, TurnEndDelivery } from "../../../../framework/public";

/** This repository, which is where the extension's own declared configuration is resolved from. */
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** The directory the extension's own `config.yaml` lives in, as its OMP assembly states it. */
const CONFIG_DIRECTORY = join(REPOSITORY_ROOT, "extensions", MODEL_COST.id);

/** The prefix of the quota line this fixture writes, so the dock can find it among the rest. */
export const CODEX_QUOTA_LINE = `[${MODEL_COST.id}] quota `;

/** The prefix of the estimate line this fixture writes: the ratio/left segment read beside the windows. */
export const CODEX_QUOTA_ESTIMATE_LINE = `[${MODEL_COST.id}] estimate `;

/** The prefix of the Turn line this fixture writes, beside the quota lines. */
export const CODEX_QUOTA_TURN_LINE = `[${MODEL_COST.id}] turn `;

export default function codexQuotaProbe(pi: OmpExtensionApi): void {
	// The fixture's own observation group, beside the production subscriptions: it changes no business
	// and reads only what the framework delivered to this session.
	const observe: SubscriptionGroup = {
		scope: "session",
		events: {
			turn_end: delivery => {
				const turn = delivery as TurnEndDelivery;
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
	ompAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
		factory: context => {
			const runtime: ModelCostRuntime = createModelCostRuntime({
				config: context.config,
				configDirectory: CONFIG_DIRECTORY,
				userHomeDirectory: homedir(),
				harness: "omp",
				...(context.providerAccess === undefined ? {} : { providerAccess: context.providerAccess }),
			});
			// The runtime's own change notification is what a frontend redraws on; this frontend draws
			// the read-only result as one line instead, with the ratio/left segment the same notification
			// redraws beside it.
			runtime.view.subscribe(() => {
				process.stderr.write(`${CODEX_QUOTA_LINE}${JSON.stringify(runtime.presentation.quota())}\n`);
				process.stderr.write(`${CODEX_QUOTA_ESTIMATE_LINE}${JSON.stringify(runtime.presentation.estimate() ?? null)}\n`);
			});
			const implementation: ExtensionImplementation = {
				...runtime.implementation,
				subscriptions: [...(runtime.implementation.subscriptions ?? []), observe],
			};
			return implementation;
		},
	})(pi);
}
