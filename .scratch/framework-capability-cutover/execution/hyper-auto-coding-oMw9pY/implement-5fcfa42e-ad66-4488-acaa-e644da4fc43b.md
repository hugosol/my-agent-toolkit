# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "06-command-delivery-cutovermd-b7a56015-2409-495c",
  "head": "0ddb9ea7cc4d030ec3f7eba4afa6fcd11131b307",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "06-command-delivery-cutover",
  "status": "complete",
  "branch": "hyper/framework-capability-cutover/06-command-delivery-cutover-d809a6-e1e098c5b064",
  "commit": "0ddb9ea",
  "base": "c5a8b2a",
  "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-Nh7Nvo",
  "delivered": [
    "framework/interface/command/index.ts + details/definition.ts + details/implementation.ts now canonically own Command declarations, implementations, deliveries, RecognizedDirective and CanAcceptInput; internal CommandInvocation, BoundCommand, DirectedDirective, parsing/help remain internal.",
    "Actual directed CommandDelivery is explicitly constructed with exactly args, canAcceptInput, provider, owner, feedback, hasUI, state, capability; persist, markers and the internal invocation are not reachable.",
    "Actual ActionDelivery is explicitly constructed with exactly args, owner, hasUI, canAcceptInput, provider, feedback; no State seam, retained capability, persist or markers.",
    "Removed persist from the public CommandDelivery and the constructed object; removed unused CommandActions; removed all Command exports (including CommandInvocation/DirectedDirective) from framework/public.ts with no aliases.",
    "Migrated connect-bot command/panel registration and model-cost period-switch to framework/interface/command; all framework/adapter/test consumers already use the canonical entry.",
    "Behavior preserved: toggle owner scope + ordered State/feedback, directed owner scope/activate/off/repeat/unrecognized, actions routing/help/await/one-report failure without owner gate, live three-valued CanAcceptInput.",
    "Docs updated (framework README, interface README, capability index, architecture status/tree, ADR-0002 Command cutover amendment) and evidence recorded at .scratch/framework-capability-cutover/evidence/06-command-verification/README.md."
  ],
  "acceptance_evidence": {
    "P02/P03 delivery surfaces": "tests/framework/directed-control.test.ts 'the delivery is exactly the approved surface, on run and unrecognized alike'; tests/framework/actions-routing.test.ts 'the action delivery is exactly the approved facts and no capability'",
    "P01/P05/P49/P51 Command partition": "tests/framework/import-boundary.test.ts 'Command declarations are published only by the Command capability interface' (canonical files only; internal names absent; public.ts clean); repository grep shows no Command imports from framework/public and no CommandActions consumer",
    "P22 toggle": "tests/framework/control.test.ts alternating toggle; tests/framework/owner-inheritance.test.ts subagent/unresolved no-write; tests/codebase-tools real OMP command-toggle",
    "P23/P24 directed": "tests/framework/directed-control.test.ts activate/off/repeat/pending/unrecognized/subagent; tests/framework/declared-value-write.test.ts handler-writes-nothing and handler-writes-own-value; tests/connect-bot off/feedback/state-machine with real panel binary",
    "P25/P26 actions": "tests/framework/actions-routing.test.ts matching/help/async/throw/rejection; tests/model-cost/business/pricing/period-switch.test.ts; tests/harness-dock/period-switch.test.ts real host",
    "P27 CanAcceptInput": "tests/framework/round.test.ts live re-read true/false/undefined; tests/framework/round-events.test.ts three-value delivery; model-cost busy/unreported and connect-bot idle/busy branches"
  },
  "verification": [
    {
      "command": "bun install --frozen-lockfile",
      "exit": 0
    },
    {
      "command": "bun run typecheck",
      "exit": 0
    },
    {
      "command": "bun run test:framework",
      "exit": 0,
      "result": "628 pass / 0 fail, 53 files"
    },
    {
      "command": "bun run test:codebase-tools",
      "exit": 0,
      "result": "24 pass / 0 fail (includes real OMP command-toggle)"
    },
    {
      "command": "OMP_BOT_BINARY=... bun test tests/connect-bot",
      "exit": 0,
      "result": "142 pass / 0 fail, 18 files"
    },
    {
      "command": "bun test tests/model-cost",
      "exit": 0,
      "result": "516 pass / 0 fail, 51 files on final tree"
    },
    {
      "command": "bun test tests/harness-dock/binding-lifecycle.test.ts",
      "exit": 0,
      "result": "2 pass / 0 fail"
    },
    {
      "command": "bun test tests/harness-dock/consumer-regression.test.ts",
      "exit": 0,
      "result": "3 pass / 0 fail, all three consumers' commands in one real host"
    },
    {
      "command": "bun test tests/harness-dock/period-switch.test.ts",
      "exit": 0,
      "result": "1 pass / 0 fail, real host /budget holiday and /budget clear"
    },
    {
      "command": "bun run check:integrations",
      "exit": 0,
      "result": "declaration matching only; five entries complete or not required"
    }
  ],
  "red_green": [
    "Directed/action surface red observed naturally: received extra key 'persist' (22 pass / 1 fail) before implementation.",
    "Fault injection: added persist+markers back to both deliveries; both surface cases failed (21 pass / 2 fail); restored and reran green 23 pass / 0 fail.",
    "Import-boundary Command ownership check added with the interface move; suite 16/16 pass."
  ],
  "unverified": [
    "No real pi entry run for this batch; pi adapter command invocation unchanged, pi-facing model-cost surface-double cases pass. Pi real-entry matrix belongs to ticket 12.",
    "Delivery-surface proof uses the approved S1 seam (bindExtension + shared port double); real docks exercise the same path through loaded extensions but assert consumer outcomes, not object keys.",
    "No P48 readability judgment, provider account, external service or physical TUI.",
    "Observed pre-existing flake in tests/model-cost/harnesses/pi/pi-disposal-round-close.test.ts (one run 515/1 fail); identical failure reproduced on base c5a8b2a in 2/5 isolated runs, unrelated to Command; final model-cost run green. Recorded in evidence, not hidden."
  ],
  "integration_notes": [
    "Do not squash; commit is on the ticket branch only. No integration branch merge performed.",
    "Evidence file: .scratch/framework-capability-cutover/evidence/06-command-verification/README.md.",
    "Working tree clean after commit; .cache/ logs are gitignored throwaways."
  ]
}
