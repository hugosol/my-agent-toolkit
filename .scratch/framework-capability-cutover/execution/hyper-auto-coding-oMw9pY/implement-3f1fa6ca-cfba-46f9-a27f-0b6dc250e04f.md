# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "09-config-diagnostics-cutovermd-9a991d63-f06d-42",
  "head": "782a6076ab23f4c8c43d75c8c4d3bd68c40fda76",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "09-config-diagnostics-cutover",
  "status": "complete",
  "branch": "hyper/framework-capability-cutover/09-config-diagnostics-cutover-412a17-e1e098c5b064",
  "commit": "782a607",
  "delivered": [
    "framework/interface/general/config.ts publishes exactly getConfig and ExtensionConfigError; ExtensionConfigError is canonically owned by config-contract.ts and thrown by core/config.ts with one class identity.",
    "framework/public.ts deleted; no extension consumer imports framework/core/config or any non-interface framework path; no general/index.ts aggregate and no authoring-root aggregation.",
    "Real temporary config files drive binding success and refusal; getConfig/context.config receive the same validated recorded object; refused bindings build nothing and getConfig misuse remains distinct from ConfigLoadError.",
    "Configuration delivery remains TypeScript Readonly with the existing process cache, same object delivery, no freeze/copy/hot reload/runtime write protection.",
    "model-cost owns shared-logic/foundation/session/describe-value.ts; consumption-document.ts no longer depends on framework/core/config, and consumer-visible diagnostics are unchanged."
  ],
  "criterion_evidence": [
    {
      "criterion": "Public config entry surface, error identity, authoring-owned declarations, no Shared configuration/readers",
      "promise": "P01, P43, P49, P51 (config partition)",
      "evidence": "import-boundary exact-export test; runtime export probe; class-identity probe; repository import scan",
      "result": "pass"
    },
    {
      "criterion": "Real config file binding success/failure; getConfig and context.config; failure does not load; misuse vs load error",
      "promise": "P43",
      "evidence": "tests/framework/config.test.ts real-file success/refusal/cache cases plus existing misuse cases now importing the public error",
      "result": "pass"
    },
    {
      "criterion": "Readonly compile check; original cache/timing/object delivery; no freeze/copy/hot reload",
      "promise": "P44",
      "evidence": "typecheck with @ts-expect-error assertions; real-file cache test; probe: sameObjectAsContextConfig=true, sameObjectAcrossReads=true, frozen=false, mutation visible",
      "result": "pass"
    },
    {
      "criterion": "model-cost local helper; independently specified invalid-document diagnostics; describeValue dependency exits; no framework public tool",
      "promise": "P45, P51 (diagnostics partition)",
      "evidence": "import scan; tests/model-cost/foundation/storage/consumption-document.test.ts exact diagnostic literals; fault injection changed array wording and failed the test",
      "result": "pass"
    },
    {
      "criterion": "Consumer/script/test migration; old exports and legacy exceptions retired; three direct General entries; no aggregate; no cycle",
      "promise": "P51, P52 (09 handoff)",
      "evidence": "connect-bot, model-cost test support and test migrations; framework/public.ts deleted; import-boundary exemption list removed and exact config runtime connection added; typecheck and partitions green",
      "result": "pass"
    },
    {
      "criterion": "Run affected config/binding and model-cost diagnostics partitions and real config observation",
      "promise": "P43, P44, P45, P52",
      "evidence": "focused 109/0; test:framework 633/0; model-cost 518/0; connect-bot config 13/0; model-cost data smoke 20/0; real-file and probe observations",
      "result": "pass"
    }
  ],
  "fault_injection": [
    {
      "injection": "validatedConfigs cache guard replaced with if (true)",
      "observed": "real-file cache case failed with endpoint second instead of first",
      "restored": true
    },
    {
      "injection": "factory context.config spread-copied instead of getConfig object",
      "observed": "real-file success case failed context.config === getConfig assertion",
      "restored": true
    },
    {
      "injection": "model-cost helper array wording changed from an array to a list",
      "observed": "new diagnostics case failed on exact consumer-visible text",
      "restored": true
    }
  ],
  "commands": [
    {
      "command": "bun install --frozen-lockfile",
      "exit": 0,
      "result": "13 packages; bun.lock sha256 e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f unchanged"
    },
    {
      "command": "bun run typecheck",
      "exit": 0,
      "result": "no diagnostics"
    },
    {
      "command": "bun run test:framework",
      "exit": 0,
      "result": "633 pass / 0 fail, 53 files"
    },
    {
      "command": "bun test tests/model-cost",
      "exit": 0,
      "result": "518 pass / 0 fail, 51 files"
    },
    {
      "command": "bun test tests/connect-bot/config.test.ts",
      "exit": 0,
      "result": "13 pass / 0 fail"
    },
    {
      "command": "bun test tests/connect-bot",
      "exit": 1,
      "result": "137 pass / 5 fail; all 5 are interop cases requiring the absent actual omp-bot.exe binary"
    },
    {
      "command": "bun run smoke:model-cost-data",
      "exit": 0,
      "result": "20 passed / 0 failed"
    },
    {
      "command": "bun test config + import-boundary + consumption-document + connect-bot config",
      "exit": 0,
      "result": "109 pass / 0 fail"
    }
  ],
  "unverified": [
    "P48 terminal readability was not judged (human-only).",
    "The five connect-bot interop cases did not run because the actual omp-bot panel binary is absent; connect-bot config consumer tests passed.",
    "No harness dock, real host session, full bun run test, check:integrations, or real discovery-entry regression was run; those belong to later tickets 10-14. Partition green is not a full-repository or harness-support claim."
  ],
  "evidence_path": ".scratch/framework-capability-cutover/evidence/09-config-verification/README.md",
  "worktree_clean": true
}
