# Semantic extension framework backlog

This is a research backlog, not an implementation-ready specification. Accepted framework scope remains in [ADR-0002](adr/0002-semantic-extension-framework.md); host differences and policies are tracked in [host-support.md](host-support.md).

The focused first-release planning effort is tracked in [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../.scratch/codebase-tools-omp-v1/map.md). Its scope and decision tickets live there; this file remains the deferred research backlog, not the first-release specification.

## Todo list

- [ ] Investigate pi `codemode` and OMP `Code Mode`, their actual semantic differences, and whether either requires framework State inheritance.

- [ ] Plan and verify model-cost's separation of host observation/State updates from native widget rendering during framework migration.

## model-cost migration risk: rendering currently updates business state

Source inspection on 2026-10-04: [`buildWidgetLines`](../../my-omp-toolkit/extensions/model-cost/index.ts#L247) reads `ctx.sessionManager.getUsageStatistics()` and `ctx.getContextUsage()`, then assigns `state.lastContextTokens`. [`refresh`](../../my-omp-toolkit/extensions/model-cost/index.ts#L349) installs a widget factory whose `render(width)` calls that function. This is not a presentation-only path. Moving the existing function to an OMP-specific presentation file would preserve the coupling rather than complete the separation.

During migration, arrange host observations and reconciliation into State independently of renderer execution. Keep shared cost/budget rules in shared extension logic; native rendering should read the reconciled business values and choose layout/colour, not be the operation that makes business State current. Do not change the established business calculations merely to perform this separation.

The observation triggers, update timing, unavailable-observation policy, and concrete framework interfaces remain to be designed. This is a migration task, not a claim that those contracts or the migration are implemented. Completion must exercise business updates without an installed UI and confirm that repeated native rendering does not mutate business State; also verify that existing visible cost/context behavior is preserved. Choose the actual verification scenario when the update contract is known. No model-cost runtime migration was exercised in this documentation task.

## Deferred codemode research

### Question and current evidence

The design discussion raised pi codemode as a possible additional inheritance consumer. No runtime verification or inheritance requirement has been established. Do not assume OMP lacks a comparable feature: pi has `createCodemodeExtension` in `packages/coding-agent/src/extensions/codemode/index.ts:31-44`, while OMP has `AgentSession.initializeCodeMode` in `packages/coding-agent/src/session/agent-session.ts:5999-6003`. These source observations establish entry points, not equivalence or a shared contract.

### Research scope

1. Establish what each feature executes, in which process/session/execution scope, and how it obtains tools, MCP access, and extension behavior. Distinguish script tool execution from a new agent/model conversation.
2. Determine whether framework State needs to cross an actual ownership boundary. Identify which value would need inheritance and why; do not infer an inheritance requirement from nested execution alone.
3. Exercise the relevant execution paths in both hosts and record host versions, settings, observed behavior, and limits. Separate source inspection from runtime evidence.
4. Decide whether the existing live-following inheritance contract is sufficient, whether a different concrete requirement exists, or whether no inheritance is needed. Do not add new inheritance modes speculatively.
5. Update the capability-difference register with the precise host conditions, evidence, responsible implementation, and explicit strategy (including any user notice or rejection).

### Completion evidence

A source-backed and runtime-exercised comparison, a concrete answer about State ownership/inheritance, and an updated difference-register entry. If a prerequisite prevents execution, record it explicitly rather than claiming support.
