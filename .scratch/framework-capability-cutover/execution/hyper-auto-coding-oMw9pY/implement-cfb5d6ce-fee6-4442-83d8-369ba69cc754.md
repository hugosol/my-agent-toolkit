# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "10-internal-port-cutovermd-2931755a-cced-40f6-b9",
  "head": "41b7d3e74f94914167e5a012b381d0ef7fbb78a3",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "status": "complete",
  "ticket": "10: 统一内部 port 并保持离线检查独立",
  "branch": "hyper/framework-capability-cutover/10-internal-port-cutover-a5bd8e-e1e098c5b064",
  "commit": "41b7d3e",
  "base": "a00bcee",
  "delivered": [
    "framework/runtime/port.ts is the single framework/adapter interaction contract, owning HarnessPort, BindingResult/BindingFailure, StateValues, NoticeTransport, SessionDelivery/SessionDisposal, RoundSignal/RoundObservation, SessionContextObservation, ObservedSession/ObservationSource, SessionObservationSink/Access, MarkerTransport, ViewedSessionPort, RunDelivery, PromptContribution, CommandInvocation, BoundCommand and TurnSignal/TurnSignalFacts; each name is declared only there.",
    "The port imports the canonical Session/State/Feedback/Host facts/Subagent/Command/authoring declarations from framework/interface and re-exports none of them. framework/core/protocol.ts is deleted (git rename), with no alias or forwarding shell.",
    "Every framework, adapter, Local access, script and test consumer now imports framework/runtime/port. DirectedDirective moved beside parseDirectedArgument in behaviors/control.ts; describeBindingFailure is private to behaviors/binding.ts.",
    "Extension code imports only framework/interface and adapter public roots; harness assemblies keep the existing adapter entry and native escape hatch. Framework/adapters import no extension business and name no native harness package.",
    "Interface-to-implementation connections remain exact: defineExtension is implemented in the root authoring entry with no internal import; request/updateFile/getConfig keep their three exact implementation specifiers. No blanket re-export, wide internal import or cycle.",
    "SubagentExecutionMode, HarnessIntegrationDeclaration, ExtensionHarnessEntry remain in core/integration.ts; RequiredSemantic/FRAMEWORK_REQUIRED_SEMANTICS remain in core/requirements.ts. The offline checker still compares declarations only; complete state exits 0, injected missing state exits 1 with the missing capability named. No tool module, scanner, diagnostic command or package script was added.",
    "No runtime/startup path imports the checker or inventory; Loading entrypoints/omp real host bound all three extensions. History preservation remains an internal framework invariant, not a declarable option."
  ],
  "acceptance_evidence": {
    "single port ownership": "Declaration search: all 22 approved names occur exactly once, in framework/runtime/port.ts; old core/protocol.ts absent; bun run typecheck resolves all consumers.",
    "canonical references and consumer migration": "Port imports the canonical interface declarations only; no interface imports the port; no extension imports the port; all prior core/protocol import sites migrated; helper relocation as above; typecheck + import-boundary green.",
    "interface-only extensions and adapter boundary": "Dependency greps for extension->framework internals, extension->adapter domain/internal and framework/adapters->extensions are empty; import-boundary 17/0 covers native packages, escape hatch, interface direction and framework->extension absence; tests/codebase-tools 24/0 and real OMP dock 3/0 load assemblies.",
    "exact internal connections": "import-boundary allows only general/http.ts->modules/http, general/files.ts->modules/files, general/config.ts->core/config; defineExtension root-owned with no implementation import; authoring entry test still lists exactly ten authoring names; no interface imports runtime/port.",
    "internal integration ownership and checker": "core/integration.ts and core/requirements.ts are sole owners; SubagentExecutionMode absent from interfaces; integration-check unit 8/0; CLI complete exit 0, injected missing OMP state-follow exit 1 with 'MISSING omp / codebase-tools: in-process: missing state-follow', restored then complete exit 0; package.json unchanged.",
    "loading independence and history preservation": "No runtime import of integration-check/check-adapter-integrations/core/integration outside adapter declarations and the offline script; real OMP consumer regression 3/0; DeclarableRequiredSemantic still two values and history-preservation stays internal; no startup gate added.",
    "verification and dependency review": "All commands below ran on the committed source state; dependency ownership was reviewed by grep/re-export inspection (not only declaration checks), and behavior/real-host runs are separate evidence."
  },
  "commands": [
    {
      "command": "bun install --frozen-lockfile",
      "exit": 0,
      "result": "13 packages installed; bun.lock unchanged (sha256 e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f)"
    },
    {
      "command": "bun run typecheck",
      "exit": 0,
      "result": "no diagnostics"
    },
    {
      "command": "bun test tests/framework/import-boundary.test.ts",
      "exit": 0,
      "result": "17 pass / 0 fail, 526 expect() calls"
    },
    {
      "command": "bun test tests/framework/integration-check.test.ts",
      "exit": 0,
      "result": "8 pass / 0 fail, 9 expect() calls"
    },
    {
      "command": "bun run check:integrations",
      "exit": 0,
      "result": "all five deployed pairs COMPLETE or NOT REQUIRED; behavior correctness not assessed"
    },
    {
      "command": "bun run check:integrations (fault injection: OMP state-follow removed, then restored)",
      "exit": 1,
      "result": "MISSING omp / codebase-tools: in-process: missing state-follow; restored afterwards"
    },
    {
      "command": "bun run test:framework",
      "exit": 0,
      "result": "633 pass / 0 fail, 3325 expect() calls, 53 files"
    },
    {
      "command": "bun test tests/codebase-tools",
      "exit": 0,
      "result": "24 pass / 0 fail, 334 expect() calls, 7 files (real isolated OMP 18.5.0 entrypoint sessions)"
    },
    {
      "command": "bun test tests/connect-bot (default panel path absent)",
      "exit": 1,
      "result": "137 pass / 5 fail; all five failures are the support helper's missing real panel binary at the default temp path"
    },
    {
      "command": "OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot",
      "exit": 0,
      "result": "142 pass / 0 fail, 689 expect() calls, 18 files, real panel binary"
    },
    {
      "command": "bun test tests/model-cost",
      "exit": 0,
      "result": "518 pass / 0 fail, 2899 expect() calls, 51 files"
    },
    {
      "command": "bun test tests/harness-dock/consumer-regression.test.ts",
      "exit": 0,
      "result": "3 pass / 0 fail, 61 expect() calls; real OMP 18.5.0 loaded deployed entrypoints/omp and all three extensions"
    },
    {
      "command": "bun scripts/pi-model-cost-smoke.ts",
      "exit": 0,
      "result": "100 checks passed, none failed; 28 isolated real pi 1.3.0 runs"
    }
  ],
  "environment": {
    "os": "Windows 10.0.26200 x64",
    "bun": "1.4.2 (744846f84)",
    "node": "v24.18.0",
    "typescript": "7.0.2",
    "omp": "18.5.0 from .cache/omp-baseline/18.5.0 (baseline record; byte-checked by the dock)",
    "pi": "1.3.0 via D:\\nvm4w\\nodejs\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\bundle\\cli.js",
    "fixtures": "repository test fixtures and isolated agent directories; no formal load configuration or harness patch changed; no credentials or real provider accounts for the pi smoke"
  },
  "evidence_file": ".scratch/framework-capability-cutover/evidence/10-internal-port-verification/README.md",
  "unverified_or_limits": [
    "Ticket 10 partition only: full five-entry real-entry regression remains ticket 12; final navigation/ADR consistency remains ticket 11; final P52 handoff remains ticket 14.",
    "P48 terminal readability remains human-only and unverified; no readability claim is made.",
    "pi codebase-tools real smoke and OMP standalone model-cost/connect-bot dock files were not rerun for this ticket; the real OMP consumer regression loads all three extensions, and pi model-cost smoke exercises the pi adapter/entry path. No new harness version or candidate support is claimed.",
    "The import check remains a lexical alarm over .ts specifiers, not a proof; computed specifiers, non-.ts modules and aliasing are outside it.",
    "connect-bot's default real-panel temp path was absent; the green run used the existing OMP_BOT_BINARY selection."
  ],
  "worktree": "clean; implementation committed on the ticket branch; no integration branch merge performed and no other ticket/workflow files modified"
}
