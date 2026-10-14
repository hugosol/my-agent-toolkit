/**
 * The subagent-runtime axis: the dispatch of the harness's own execution-duration facts.
 *
 * The axis carries what a harness itself measured for one *execution* of one actual session — a
 * subagent's own run — and nothing else. It is not the round axis and not the Turn axis: a reading
 * arrives while the execution runs and a final reading arrives when the execution is over, and
 * neither instant is the end of the session's Round. The framework therefore synthesizes nothing
 * here and owns no state of its own:
 *
 * - The facts are the harness's own. Which reading replaces which earlier reading of one execution,
 *   which readings are a new execution's own contribution, and which merely repeat a completion
 *   already observed are the *consumer's* rules, because what an execution is worth depends on the
 *   accumulation being kept — and keeping a per-execution ledger is explicitly not something this
 *   framework does.
 * - Nothing the framework owns moves on a delivery: no State is reconciled, no round identity is
 *   minted or retired, no consumption is settled and no file is written. An extension that has to
 *   persist what it accumulated does so with the commit it already makes for its own business, and
 *   a reading that arrives after such a commit waits for the next one rather than causing a write
 *   of its own.
 * - A session's wall-clock span — however a harness persists the distance from a session's creation
 *   to its last record — is a different metric, and an adapter that reported one in a runtime's
 *   place would be reporting the idle gaps between executions as execution time. That is why the
 *   port's hook carries an execution's own duration or the fact that the host has none, and never a
 *   span.
 *
 * A handler's failure is its own. It is reported on the adapter's diagnostic channel — a channel
 * outside model context — and it changes neither the fact the delivery described nor whether
 * another subscriber runs.
 *
 * This module is harness-independent: it reads and writes no State and names no native API.
 */
import type { ExtensionDefinition } from "../core/definition";
import type { SubagentRuntimeDelivery, SubscriptionGroup } from "../core/protocol";
import { dispatchToGroups } from "./subscriptions";

/**
 * Applies one subagent-runtime observation: the subscribed handlers, in declaration order.
 *
 * There is no framework behavior to run first — this axis owns nothing the framework holds — so
 * the delivery reaches its handlers unchanged, exactly as the adapter mapped it.
 */
export function dispatchSubagentRuntime(
	definition: ExtensionDefinition,
	delivery: SubagentRuntimeDelivery,
	groups: readonly SubscriptionGroup[],
	reportFailure: (message: string) => void,
): void {
	dispatchToGroups(definition.id, groups, "subagent_runtime", delivery.owner, () => ({ delivery }), reportFailure);
}
