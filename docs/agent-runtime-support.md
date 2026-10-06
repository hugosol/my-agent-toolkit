# Agent-runtime version and compatibility baseline

Recorded: 2026-10-03. This is the design investigation's version/evidence anchor, not a claim that the planned in-repository runtime framework or fully certified adapters already exist. Exact versions below record observations; the policy for admitting version ranges or unknown installed versions is not yet decided.

## Agent-runtime targets and evidence

| Agent runtime | Package | Source version / checkout | Observed installed runtime | Evidence status |
| --- | --- | --- | --- | --- |
| pi | `@earendil-works/pi-coding-agent` | 1.0.0; `a276dabe57911253350bffb93cb7d7aff6a73261` | `pi --version`: `1.0.0` | Source inspected; isolated RPC and local OpenAI-compatible request smoke performed. Not a full mode/provider certification. |
| oh-my-pi | `@oh-my-pi/pi-coding-agent` | 18.5.0; `9348320cc4a30a7195d36a1f05a6c11bcb701a17` | `omp --version`: `omp/18.4.6` | Source inspected at 18.5.0. Installed runtime differs; no equivalent OMP runtime smoke is claimed. |

Sources: the respective `packages/coding-agent/package.json` files, source-checkout `git log -1`, and direct executable version checks. Checking an executable version is not functional validation. No OMP runtime upgrade was performed in this investigation.

## Shared-source deployment prerequisite

The initial framework lives once in `my-agent-toolkit/framework/`; extensions import that source directly instead of depending on a separately published framework package. Configure pi to scan `entrypoints/pi/` and OMP to scan `entrypoints/omp/`. Each root contains independent thin extension entrypoints importing implementations under `extensions/`, which in turn use the shared framework source. The implementation and framework directories are not extension discovery roots.

Before claiming this deployment works, exercise the actual installed pi and OMP loaders with entrypoints importing TypeScript outside their discovery roots. Verify source/dependency resolution, independent extension discovery, and that each agent runtime selects only its own implementations. The earlier source and prompt probes did not exercise this layout and establish none of these guarantees. Record the tested repository revision, dependency lockfile, and agent-runtime versions instead of an independently released framework version.

Source co-location supports direct editing and debugging but does not establish hot reload or breakpoint mapping. Verify those separately, including whether edits to imported framework modules become visible after extension reload or require restarting the agent runtime. One source tree does not create shared in-memory State across pi and OMP processes. These are deployment prerequisites, not a claim that the source layout or framework has been implemented.

## Investigated common behavior candidates

| Contract area | pi evidence | OMP evidence | Current limitation |
| --- | --- | --- | --- |
| Current system-prompt contribution | Source and actual local request capture | Source | Different agent-runtime representations; final provider mapping and prefix stability need explicit contracts. |
| Persisted hidden custom messages | RPC/request smoke plus disk history inspection | Source | Visibility does not imply developer authority; message roles differ. |
| Conditional and mode-change contribution | Actual pi pipeline smoke; readonly-mode state logic exercised separately | Source | Shared scheduling contracts, restore semantics, and exact frequency units remain to be specified. |
| Filtering own contributed context | Actual outgoing request and unchanged disk history observed | Source | Changes the request prefix despite not deleting disk history; incompatible with stronger request-prefix preservation. |
| Universal developer-role conversation injection | Not established; installed custom-message path produces user messages | Not established across provider protocols | Cannot advertise as an unconditional common behavior. |

Detailed source references and exercised scenarios: [prompt-injection research](research/prompt-injection-research.md).

## Planned agent-runtime-qualified capability: subagent State inheritance

Design decision recorded on 2026-10-04; not implementation or runtime certification. The initial framework implements only codebase-tools-style live following of the owning main session's activation value, with independent init-injection progress in each session. Other inheritance strategies are deferred until there is a concrete need.

| Agent-runtime path | Initial framework scope |
| --- | --- |
| OMP built-in subagent path | Targeted for State inheritance integration; implementation and runtime validation remain required. |
| pi | Subagent State inheritance is unsupported in the initial adapter; no pi subagent implementation is selected or integrated. |

This does not declare pi incapable of running subagents. It limits the framework's supported integration paths. Extension loading, State inheritance, and MCP availability are separate concerns. The framework owns the State contract and its agent-runtime mapping, not a replacement subagent scheduler or MCP implementation.

For codebase-tools, current-session operation without inheritance on pi is explicitly accepted, subject to its other required contracts. Notify the user once at the extension's first activation in that session that the framework will not propagate its activation to subagents. Do not insert this user-facing notice into model instructions or conversation history. Notification transport and reload/resume deduplication details remain open. This is not a general permission to ignore missing required capabilities, and required role and insertion semantics are not relaxed.

### Subagent mechanism evidence and its limits

Source observations checked on 2026-10-04 against the local checkouts; these do not certify installed-agent-runtime behavior:

- **OMP rebinding is not business State copying.** [`bindExtension`](../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/loader.ts#L439) creates an extension/API binding and runs the prepared factory; [`bindPreparedExtensions`](../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/loader.ts#L491) creates a new runtime for the binding set. OMP's [extension guidance](../../oh-my-pi/docs/extensions.md#L1048) explicitly says module globals are shared by parent/child bindings, while session-specific state belongs in the factory closure or persisted session entries. This explains how shared activation and independent injection progress can coexist; it does not define arbitrary extension State inheritance.
- **Use identity, not depth alone.** [`ExtensionAgentIdentity`](../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts#L464) provides `kind: "main" | "sub"`, `id`, `name`, `depth`, and optional `parentId`. Its comments explicitly allow subagents at depth zero. Mapping this identity to a State owner still belongs to the framework adapter; a process-global variable does not encode that relationship.
- **The ordinary pi subagent example has a different process boundary.** The [example's arguments](../../pi/packages/coding-agent/examples/extensions/subagent/index.ts#L300) include `--mode json -p --no-session`, and it [spawns a separate process](../../pi/packages/coding-agent/examples/extensions/subagent/index.ts#L346). The example's process cannot inherit the parent's JavaScript module variable merely by importing the same source. This observation concerns that example, not every possible pi subagent implementation.
- **Do not conflate pi's experimental durable path with ordinary extensions.** The [durable harness](../../pi/packages/durable/README.md#L3) is explicitly experimental. Its [subagent implementation](../../pi/packages/coding-agent/src/experimental/durable/subagent.ts#L34) creates a task-owned child conversation through durable interfaces. It is a distinct possible integration path, not evidence that the initial framework pi adapter supports inheritance.

### codebase-tools extension-logic probe

During this design discussion, a throwaway Bun probe imported the actual [`codebase-tools` extension factory](../../my-omp-toolkit/extensions/codebase-tools/index.ts#L45) and `__resetCodebaseToolsForTests`. It supplied minimal agent-runtime substitutes for hook/command registration, session entries, agent identity (`"main"` / `"sub"`), and UI calls. It invoked both factories and their `session_start` handlers while activation was off, then invoked the main command and child `before_agent_start` handlers in this order:

| Step | Observed child result |
| --- | --- |
| Child turn before main activation | No contributed message |
| Main toggles on; the already-created child runs | `codebase-tools:init` |
| Same child runs again | `codebase-tools:reminder` |
| Main toggles off; same child runs | No contributed message |

The process exited with code 0 and no stderr. The child substitute recorded one non-LLM state entry containing `{ on: true, initInjected: true }`. The observed stop after main deactivation comes from reading `globalOn` on the next hook call, not from replacing that child entry. The probe establishes live following rather than a creation-time snapshot, and separately maintained child injection progress, for the existing extension logic.

This was **not** a real OMP task spawn or a pi subprocess test. It does not verify native loader behavior, real session persistence/resume, provider message roles, MCP availability, multi-owner isolation, parent disappearance, or future framework behavior. The probe ran directly from an inline script and left no probe file. Framework implementation must replace accidental process-global ownership with an explicit owner relationship; actual agent-runtime-path contract scenarios remain required.

## Capability-difference register

Use this register as the single index of agent-runtime differences relevant to framework consumers, not as an exhaustive catalog of native features or a new runtime policy engine. The record shape is uniform; each feature retains its own semantic contract and implementation strategy. Record the capability/effect, applicable agent-runtime path and conditions, framework policy, implementation owner, and evidence/open work. Stable identifiers below are documentation keys, not finalized runtime API names.

Keep three dimensions separate: native mechanism availability, framework integration support, and verification evidence. `Uninvestigated`, `not integrated`, and `unavailable` are not interchangeable. A similarly named native feature does not establish semantic equivalence. Required versus optional is an extension's dependency on a capability, not a universal property of that capability.

| ID / capability | pi conditions | OMP conditions | Strategy / decision status | Implementation owner | Evidence / open work |
| --- | --- | --- | --- | --- | --- |
| `state.subagent-follow` — live activation following; independent session injection progress | No initial subagent integration | Built-in subagent path targeted | **Accepted:** codebase-tools may operate in the current pi session without inheritance; first-activation notice once per session. Not a blanket fallback for other extensions. | Framework State and agent-runtime adapters; extension declares its use | Scope and policy accepted above; framework implementation and real-agent-runtime validation pending |
| `context.required-role` — required instruction authority | Existing custom-message path does not establish developer authority | Intermediate developer role does not guarantee final provider role | **Agent-runtime-qualified:** no cross-agent-runtime developer-authority guarantee. The OMP adapter records the provider's serialized role for persisted contributions; codebase-tools explicitly accepts `user` on the verified deepseek/openai-codex paths. Other agent runtimes/extensions' required-role semantics remain undecided. | Agent-runtime/provider mapping, recorded per path; decision 05 owns the OMP exception | [Prompt research](research/prompt-injection-research.md); [decision 05](../.scratch/codebase-tools-omp-v1/lighthouse/05-contribution-contract.md); provider-path validation required |
| `ui.native-presentation` — complex native presentation, including footer replacement | Interactive footer replacement has an implementation | Inspected interactive `setFooter` / `setHeader` bindings are no-ops | **Accepted scope:** complex layout remains extension-owned; native presentation is not promised as a universal framework capability. Exact alternate presentations are extension-specific decisions. | Extension's agent-runtime-specific presentation code | [pi footer implementation](../../pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2486), [OMP UI bindings](../../oh-my-pi/packages/coding-agent/src/modes/controllers/extension-ui-controller.ts#L124); source-only observations, no TUI runtime validation |
| `execution.mcp-access` — MCP availability in the relevant execution scope | Subagent path not integrated; no inheritance guarantee | Session creation gates MCP with `restrictToolNames` and `enableMCP` | **Unresolved framework strategy:** keep MCP availability separate from State inheritance. Existing codebase-tools deliberately does not split its prompt by MCP/LSP capability. | Agent runtime owns MCP; framework handling of any declared dependency remains to be designed | [OMP creation condition](../../oh-my-pi/packages/coding-agent/src/sdk.ts#L2404), [codebase-tools ADR](../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md); no automatic enabling or isolation guarantee |
| `execution.codemode` — code execution and possible State-scope effects | Built-in `codemode` extension entry exists | `Code Mode` initialization entry exists; equivalence unestablished | **Deferred research:** no inheritance strategy or missing-capability policy selected | To be determined from actual State-scope effects; native execution remains agent-runtime-owned | [pi entry](../../pi/packages/coding-agent/src/extensions/codemode/index.ts#L31), [OMP entry](../../oh-my-pi/packages/coding-agent/src/session/agent-session.ts#L5999), [research todo](semantic-extension-framework-backlog.md); no runtime comparison |

Per-feature strategies need not share an implementation. A future runtime representation should be driven by actual checks and diagnostics required by these entries, not by inventing a universal fallback language. A new entry must not convert an unknown condition into permission to proceed. This register organizes existing decisions and research gaps; it does not certify additional agent-runtime versions or settle the unresolved policies.

## Meaning of the support list

This file concerns agent-runtime/package version compatibility, not which tools an agent may call. Whether an unlisted version should be blocked, warned about, or only marked unverified remains undecided; recording versions does not itself implement an admission check.

The first release requires strict history preservation: no mutation or reordering of existing conversation entries, and no alteration of their history-derived request content. Request-context filtering, even of the extension's own earlier messages, is deferred. It permits new messages to be appended through the agent runtime's normal recording path; once recorded, they receive the same protection. Non-persisted request contributions are not inherently history mutations, but their inclusion in the first release and their insertion positions remain undecided. Mechanism availability in the table above does not by itself establish policy compliance.

## Compatibility rules already agreed

- Common framework behaviors must be satisfiable across all declared supported agent-runtime targets, possibly through different adapter implementations. Additional agent-runtime-qualified framework capabilities are permitted with explicit support conditions and visible absence; initial subagent State inheritance targets OMP, not pi.
- Required semantics must not be silently weakened. Unsupported role or insertion requirements are rejected.
- Version claims must retain their evidence level. Source inspection, executable startup, and exercised behavior are distinct.
- Cross-agent-runtime semantic contract scenarios are regression alarms: a failure signals an incompatibility to investigate, while a pass never automatically approves an agent-runtime version. A framework maintainer reviews the changed agent-runtime source and/or further test evidence and explicitly decides whether to declare support.

## Decisions still open

- Which exact agent-runtime versions or version ranges form the initial supported release set.
- Whether an unlisted installed version is refused at startup and how that check is implemented.
- Admission of new agent runtimes without silently weakening already-established common contracts.
- Mode/provider constraints for each published contract and the evidence needed to certify them.

Future support declarations require an explicit maintainer decision based on source review and/or exercised scenarios for the declared target; passing tests alone is not that decision. This file deliberately does not label OMP 18.5.0 as runtime-verified merely because its source was inspected.
