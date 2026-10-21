/**
 * The Subagent capability's canonical extension-facing declarations.
 *
 * The settled integration result one initialization receives lives here. Integration demand is
 * derived by offline source analysis rather than a second requirement vocabulary in definitions.
 * The harness's execution mode and the way it locates the party that loads an entry into the
 * sessions it spawns remain adapter/verification business;
 * nothing here selects, queries or reports an execution mode.
 *
 * Sharing these semantics across the two supported harnesses does not mean sharing a JavaScript
 * instance or memory across processes: the framework maps the same meaning onto whichever topology
 * the harness runs.
 */

/**
 * Why an entry's subagent integration did not take effect on a harness that has such an
 * integration to settle.
 *
 * `registration` — the party that loads this entry into the sessions it spawns was reached, and it
 * did not accept the requirement this entry has to state there. `identity` — the reached party
 * answered for another session than the one this entry serves, so nothing it loads serves this
 * session. `protocol` — the reached party answered, and not on the versioned interface this entry
 * reads. The three are different failures with different remedies, which is why none of them is
 * reported as the others and none of them is reported as a harness that offers no such integration.
 */
export type SubagentIntegrationFailure = "registration" | "identity" | "protocol";

/**
 * How one extension entry's subagent integration stands on the harness that bound it, as the
 * adapter settled it once at the process's initialization node.
 *
 * `subagents` — this entry is integrated with the harness's subagent facility: the sessions that
 * facility spawns are observed with this entry, and the facts of those sessions reach consumers.
 * `none` — this harness has no such facility for this entry, or it is not enabled in this process.
 * That is a supported, normal shape: the entry serves the main session without integrated child
 * observations, and it asserts nothing about subagents the harness may run without it.
 *
 * `failed` — this entry's integration was attempted and did not take effect. It is deliberately not
 * `none`: an operator has to be able to tell a harness that offers no integration from one whose
 * integration broke, and neither may be inferred from the other. The failure carries which part
 * failed and the diagnosis the adapter reported for it.
 *
 * The mode is settled when initialization completes and never moves afterwards: it is not decided
 * by how many child sessions exist, and no later observation, registration or discovery changes it.
 */
export type SubagentIntegration =
	| { readonly mode: "subagents" }
	| { readonly mode: "none" }
	| {
			readonly mode: "failed";
			readonly failure: SubagentIntegrationFailure;
			readonly diagnosis: string;
	  };


