# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "04-host-facts-cutovermd-0059ce4c-3b2f-4ff6-b582-",
  "head": "597405cb473377b3515f6fb24d3a2cc588933c2f",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": ".scratch/framework-capability-cutover/implementation/04-host-facts-cutover.md",
  "branch": "hyper/framework-capability-cutover/04-host-facts-cutover-37375b-e1e098c5b064",
  "commit": "597405cb473377b3515f6fb24d3a2cc588933c2f",
  "status": "implemented, tested, committed; not merged into hyper-tdd",
  "delivered": [
    "framework/interface/host-facts/index.ts remains the sole canonical owner of CatalogPrice, CatalogPriceSource, ProviderHttpFacts, ProviderAccessFacts, ProviderAccess; all framework/adapter/extension consumers import it.",
    "Each adapter now has one lightweight domain/host-facts.ts: OMP createHostFacts() and pi piHostFacts() return prices, access and the saw recorder; adapters/omp/domain/{pricing,provider}.ts and adapters/pi/domain/{pricing,provider}.ts are deleted with no stale references.",
    "index.ts and internal/port.ts are the only callers; each binding records its delivery context through one saw and hands the two plain queries to HarnessPort. No manager, price cache, refresh, subscription, idle or subagent code was added.",
    "Both queries read the host at call time: replaced credentials are visible on the next resolve; missing facts stay absent; catalog changes price only requests issued after the change; transport requestId remains separate from Turn identity.",
    "Runtime facts are plain copies with only resolve/priceOf query objects exposed — no native registry, catalog, context, credential store or HTTP client is reachable.",
    "Updated README, framework README/docs, architecture navigation and ADR-0002 domain map to the merged Host facts domain; final navigation/ADR review remains ticket 11."
  ],
  "acceptance": [
    {
      "criterion": "canonical declarations; no exposed registry/credential store/HTTP client/mutable framework-reserved reference",
      "promise": "P01, P05 (Host facts partition)",
      "evidence": "import-boundary.test.ts Host facts ownership check; turn.test.ts and pi-turn-mapping.test.ts query-key and fresh-copy assertions; typecheck",
      "result": "pass"
    },
    {
      "criterion": "same use path sees updated credentials; missing stays absent without borrowed provider, default address or empty string",
      "promise": "P28",
      "evidence": "new OMP and pi tests covering in-place replacement, withdrawal, unrelated provider, later delivery registry and tampered earlier fact; real OMP model-cost-balance dock; real pi model-cost smoke",
      "result": "pass"
    },
    {
      "criterion": "catalog observed at real request start; no price undefined; requestId distinct from Turn identity; not proven by final display amount alone",
      "promise": "P29",
      "evidence": "new OMP catalog-change test; existing pi request-start pricing test; both adapters' missing/zero price tests; turn-facts identity/HTTP facts tests; real OMP model-cost-modes dock (Ref $0.0050 from host model price and saved referenceCostUsd); real pi smoke host-catalog reference",
      "result": "pass"
    },
    {
      "criterion": "adapter query implementations concentrated; callers migrated; unused old entries retired; no CanAcceptInput/Subagent/manager/cache/refresh/subscription",
      "promise": "P30, P51",
      "evidence": "migration review of the two host-facts files and their two callers; deleted four old files; repository-wide stale-reference search empty; typecheck and framework/extension/test partitions",
      "result": "pass"
    },
    {
      "criterion": "both adapters and affected model-cost/connect-bot paths covered; real host dock/request observation; ownership via migration review; no layout test",
      "promise": "P28, P29, P30",
      "evidence": "OMP model-cost-modes and model-cost-balance docks, pi model-cost smoke; connect-bot has no host-facts consumer and its partition stayed green; only existing adapter/framework seams were used for new behavior tests",
      "result": "pass"
    }
  ],
  "verification": [
    {
      "command": "bun install --frozen-lockfile",
      "exit": 0,
      "result": "13 packages; bun.lock unchanged"
    },
    {
      "command": "bun run typecheck",
      "exit": 0,
      "result": "no diagnostics"
    },
    {
      "command": "bun test tests/framework/{turn,pi-turn-mapping,import-boundary,turn-facts}.test.ts",
      "exit": 0,
      "result": "66 pass / 0 fail, 252 expects"
    },
    {
      "command": "bun run test:framework",
      "exit": 0,
      "result": "621 pass / 0 fail, 2796 expects, 53 files"
    },
    {
      "command": "bun test tests/model-cost",
      "exit": 0,
      "result": "516 pass / 0 fail, 2892 expects, 51 files"
    },
    {
      "command": "bun run test:codebase-tools",
      "exit": 0,
      "result": "24 pass / 0 fail, 334 expects, 7 files"
    },
    {
      "command": "OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot",
      "exit": 0,
      "result": "142 pass / 0 fail, 689 expects, 18 files"
    },
    {
      "command": "bun test tests/harness-dock/model-cost-modes.test.ts",
      "exit": 0,
      "result": "6 pass / 0 fail, 67 expects; real isolated OMP 18.5.0 with frozen viewed-session patch; host catalog price at request start"
    },
    {
      "command": "bun test tests/harness-dock/model-cost-balance.test.ts",
      "exit": 0,
      "result": "6 pass / 0 fail, 38 expects; real isolated OMP 18.5.0; host-resolved address and credential on real balance request"
    },
    {
      "command": "bun scripts/pi-model-cost-smoke.ts",
      "exit": 0,
      "result": "100 checks passed, none failed, 28 isolated real pi 1.3.0 runs"
    },
    {
      "command": "bun run check:integrations",
      "exit": 0,
      "result": "all five discovery declarations complete/not required; declaration matching only"
    }
  ],
  "fault_injection": [
    "OMP saw keeping only the first registry: new credential test failed with stale baseUrl (17 pass / 1 fail); restored and green.",
    "pi same registry fault: new credential test failed (13 pass / 1 fail); restored and green.",
    "Temporary OMP price cache: new catalog-change test failed with old 1/2/3/4 amounts (17 pass / 1 fail); restored and green.",
    "Temporary duplicate ProviderAccessFacts declaration in core/protocol.ts: Host facts ownership check failed (11 pass / 1 fail); removed and green."
  ],
  "limits": [
    "connect-bot has no modelPrices/providerAccess consumer; its partition is regression evidence, not a host-facts usage path.",
    "No real provider account, credential or remote endpoint was used; OMP docks used the local capture endpoint and isolated fixture credentials, pi smoke used isolated run roots and scripted account answers.",
    "P48 readability was not judged.",
    "Full bun run test, final five-entry regression and physical TUI acceptance remain tickets 12/14.",
    "Windows checkout stores host-patches/**/patch.diff as CRLF while the frozen sha256 is LF; the two patched-dock runs locally normalized those two untracked files and restored them afterwards (working tree clean)."
  ],
  "evidence": ".scratch/framework-capability-cutover/evidence/04-host-facts-verification/README.md",
  "working_tree": "clean after commit"
}
