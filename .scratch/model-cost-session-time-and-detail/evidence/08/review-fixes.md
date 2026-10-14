# 08: independent review fixes (review-c6061d62)

Source: independent review of `e3a1d0ea..2ecbfbeb` (`wayfinder/subagent-enhance`), report kept outside the
repository (`.scratch` copy is not committed). This round applies the review's three spec findings and its two
standards judgement calls, and nothing else.

## Findings and their disposition

| # | Finding | Disposition |
|---|---|---|
| S1 | *priority 1* — a reset another process committed left this instance's observed Session spans in memory, so the next successful commit wrote closed-period time into the new document (`request-accounting.ts`, the `discard(undefined)` path) | **Fixed.** `discard(undefined)` — the one path that means "the period underneath this instance is gone" — now clears the observed spans with the rest, and `periodSwitched()` (which calls it) drops its own now-redundant clear. The per-session refusal keeps them, which is the distinction the module documents. Case: `tests/model-cost/period-switch.test.ts` → "a reset another process committed takes this instance's observed time with the closed period". |
| S2 | *priority 2* — an invalid persisted `runtimeMs` was silently dropped; only `span.fault` reached the document's faults list and the operator | **Fixed.** `readSessionRecord` now reports every unreadable optional time fact (`runtimeMs` and `span`, each named with its place and the value that was dropped), `readConsumptionDocument` collects all of them, and `timeFactFaultNotice` says "时间数据无效" rather than naming only main-session time. Cases: `tests/model-cost/consumption-document.test.ts` → "the consumption document's optional time facts"; the required diagnostic is asserted in `tests/model-cost/subagent-runtime.test.ts` → "a record whose runtime is not a measurement …". |
| S3 | *priority 1* — the adapter observed only the `task` tool's payloads, so a kept-alive subagent's follow-up executions (run by `attachIrcWakeTurnMonitor` / `runSubagentFollowUpTurn` in the existing session under the same registry id, with no delegation call) never reached accounting | **Fixed.** `HarnessPort.onSubagentRuntime`'s OMP adapter now also subscribes to the harness's own subagent frames on `pi.events` (`task:subagent:progress` for the readings, `task:subagent:lifecycle` for the openings) and maps the same per-execution duration/status. Because the harness reuses the agent id for later executions, the adapter brackets executions by those openings: the first execution observed under an agent keeps the agent's own id (what the delegation route already reports) and later ones are reported as `<agent id>#<execution number>`, so a consumer accumulates a follow-up instead of reading it as a repeat. Cases: `tests/framework/subagent-runtime.test.ts` → "a kept-alive agent's later execution is a new one, stated on the harness's own frames". |
| T1 | standards judgement call — possible Middle Man at `framework/behaviors/subagent-runtime.ts` | **Applied.** The module was one `dispatchToGroups` call; the binding now dispatches the axis directly (exactly as the user-input route does) and the module is deleted. Its knowledge lives in `framework/docs/framework-capabilities.md`'s axis section and the comment at the call site. |
| T2 | standards judgement call — three byte-identical `controlApi()` copies | **Applied.** One shared helper at `tests/model-cost/support/control-api.ts`, used by `tests/model-cost/assembled-consumption.test.ts`, `tests/model-cost/detail-layout.test.ts` and `scripts/support/detail-layout-fixture.ts`. |

Documentation updated for S3: `framework/docs/harness-support.md` (`execution.subagent-duration` register row: both
native routes, the bracketed identity, and the evidence status) and `framework/docs/framework-capabilities.md`
(the axis section's OMP paragraph). `tests/model-cost/session-span.test.ts`'s "another writer's version conflicts"
case now writes the other writer's document in the *same* generation, so it really exercises a version conflict
inside one period (the period-replaced refusal is `period-switch.test.ts`'s subject, as that file's header says).

## Evidence (this round)

| command | result |
|---|---|
| `bun run typecheck` | exit 0 (`evidence/08/typecheck.log`); the check is real: a temporary `const probe: number = "not a number"` under `scripts/` makes it exit 1 with `TS2322` |
| `bun test tests/model-cost` | 345 pass / 0 fail, 27 files, exit 0 (`evidence/08/model-cost.log`) |
| `bun test tests/framework` | 373 pass / 0 fail, 31 files, exit 0 (`evidence/08/framework.log`) |
| `bun test tests/model-cost/period-switch.test.ts -t "a reset another process committed"` | with a temporary removal of the `spans.clear()` in `discard(undefined)`: fails (the leaked reading 10:10→10:41, 1,860,000 ms); with the source restored: passes |
| `bun test tests/framework/subagent-runtime.test.ts` | with a temporary `identityOf` that returns the agent id unconditionally: the follow-up case fails; with the source restored: 11 pass / 0 fail |

## Not run in this round

- `bun test tests/harness-dock` (the harness-facing partition, including the real-host delegation cases that read
  `runtimeMs` out of the document) was **not** run in this round: the round's budget ran out before it. It is the
  first check the next round should run.
- No real-host run drives one *follow-up* turn yet (`write agent://<id>` is that turn's entry), so the frames route
  is covered at the adapter contract and by source inspection of the 18.5.0 checkout, not yet by a real-host
  end-to-end reading of an accumulated follow-up runtime. That gap is stated in the register row.
