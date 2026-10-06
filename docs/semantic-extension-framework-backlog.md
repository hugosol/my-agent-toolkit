# Semantic extension framework backlog

This is a research backlog, not an implementation-ready specification. Accepted framework scope remains in [ADR-0002](adr/0002-semantic-extension-framework.md); agent-runtime differences and policies are tracked in [agent-runtime-support.md](agent-runtime-support.md).

The focused first-release planning effort is tracked in [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../.scratch/codebase-tools-omp-v1/map.md). Its scope and decision tickets live there; this file remains the deferred research backlog, not the first-release specification.

## Todo list

- [ ] Verify OMP extension code hot reload: whether `/reload-plugins` re-imports edited extension/framework source (or returns cached modules), and whether reload keeps owner-scoped State and contribution registration idempotent and reconstructable from session entries. The first release only promises source changes take effect after a process restart; session resume/State restore is a separate, in-scope contract. Deferred by [decision 02](../.scratch/codebase-tools-omp-v1/lighthouse/02-candidate-support.md).

- [ ] Investigate pi `codemode` and OMP `Code Mode`, their actual semantic differences, and whether either requires framework State inheritance.

- [ ] Decide multiple contribution rules per slot: composition vs explicit precedence, and how conflicts are detected/rejected. The first release supports exactly one rule per slot with an explicit error on multiple matches; deferred by [decision 05](../.scratch/codebase-tools-omp-v1/lighthouse/05-contribution-contract.md).

- [ ] Plan and verify model-cost's separation of agent-runtime observation/State updates from native widget rendering during framework migration.

- [ ] Decide owner disambiguation when multiple main sessions coexist in one process (ACP/cmux/embedded, or old subagents outliving `/new`). First release supports a single main only; native `parentId` + `AgentRegistry` can resolve the wrong `"Main"` slot. Candidate approach: parent-side `before_subagent_spawn` `spawnKey → ownerKey` edge. Deferred by [decision 04](../.scratch/codebase-tools-omp-v1/lighthouse/04-state-ownership.md).

- [ ] Decide whether State persistence media become configurable (in-memory / extension-owned file / agent runtime session entries). First release implements only the owner-session JSONL mapping that codebase-tools needs, keeping the value-vs-mapping seam. Deferred by [decision 04](../.scratch/codebase-tools-omp-v1/lighthouse/04-state-ownership.md).

- [ ] Decide the constrained custom-logic seam for extensions: framework-provided State read/update only, with non-framework work (e.g., HTTP) owned by the extension's own TS rather than a framework capability. Deferred by [decision 06](../.scratch/codebase-tools-omp-v1/lighthouse/06-framework-interface.md).

- [ ] Decide the remaining control kinds (mode selection, configuration switch, parameter setting, command action) and a required-semantics declaration for extensions that need role guarantees. Deferred by [decision 06](../.scratch/codebase-tools-omp-v1/lighthouse/06-framework-interface.md).

## model-cost migration risk: rendering currently updates business state

Source inspection on 2026-10-04: [`buildWidgetLines`](../../my-omp-toolkit/extensions/model-cost/index.ts#L247) reads `ctx.sessionManager.getUsageStatistics()` and `ctx.getContextUsage()`, then assigns `state.lastContextTokens`. [`refresh`](../../my-omp-toolkit/extensions/model-cost/index.ts#L349) installs a widget factory whose `render(width)` calls that function. This is not a presentation-only path. Moving the existing function to an OMP-specific presentation file would preserve the coupling rather than complete the separation.

During migration, arrange agent-runtime observations and reconciliation into State independently of renderer execution. Keep shared cost/budget rules in shared extension logic; native rendering should read the reconciled business values and choose layout/colour, not be the operation that makes business State current. Do not change the established business calculations merely to perform this separation.

The observation triggers, update timing, unavailable-observation policy, and concrete framework interfaces remain to be designed. This is a migration task, not a claim that those contracts or the migration are implemented. Completion must exercise business updates without an installed UI and confirm that repeated native rendering does not mutate business State; also verify that existing visible cost/context behavior is preserved. Choose the actual verification scenario when the update contract is known. No model-cost runtime migration was exercised in this documentation task.

## Deferred codemode research

### Question and current evidence

The design discussion raised pi codemode as a possible additional inheritance consumer. No runtime verification or inheritance requirement has been established. Do not assume OMP lacks a comparable feature: pi has `createCodemodeExtension` in `packages/coding-agent/src/extensions/codemode/index.ts:31-44`, while OMP has `AgentSession.initializeCodeMode` in `packages/coding-agent/src/session/agent-session.ts:5999-6003`. These source observations establish entry points, not equivalence or a shared contract.

### Research scope

1. Establish what each feature executes, in which process/session/execution scope, and how it obtains tools, MCP access, and extension behavior. Distinguish script tool execution from a new agent/model conversation.
2. Determine whether framework State needs to cross an actual ownership boundary. Identify which value would need inheritance and why; do not infer an inheritance requirement from nested execution alone.
3. Exercise the relevant execution paths in both agent runtimes and record agent-runtime versions, settings, observed behavior, and limits. Separate source inspection from runtime evidence.
4. Decide whether the existing live-following inheritance contract is sufficient, whether a different concrete requirement exists, or whether no inheritance is needed. Do not add new inheritance modes speculatively.
5. Update the capability-difference register with the precise agent-runtime conditions, evidence, responsible implementation, and explicit strategy (including any user notice or rejection).

### Completion evidence

A source-backed and runtime-exercised comparison, a concrete answer about State ownership/inheritance, and an updated difference-register entry. If a prerequisite prevents execution, record it explicitly rather than claiming support.
