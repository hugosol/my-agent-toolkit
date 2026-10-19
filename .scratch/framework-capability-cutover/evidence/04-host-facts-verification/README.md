# Ticket 04 — Host facts cutover: verification evidence

Source state: branch
`hyper/framework-capability-cutover/04-host-facts-cutover-37375b-e1e098c5b064`, base revision
`18c7d66ea3197e709d399fac314238a007502d65` (the merged ticket 03 cutover), plus this ticket's
working changes. Dependencies: `bun install --frozen-lockfile` (13 packages); `bun.lock` sha256
`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2, pi 1.3.0. The OMP
docks used the recorded isolated `@oh-my-pi/pi-coding-agent@18.5.0` install. These runs finished
before this record was written.

## Delivered behavior

- `framework/interface/host-facts/index.ts` stays the one canonical owner of `CatalogPrice`,
  `CatalogPriceSource`, `ProviderHttpFacts`, `ProviderAccessFacts` and `ProviderAccess`. All
  framework, adapter and extension consumers import those declarations from it.
- Each adapter now concentrates its provider/catalog query implementation in one lightweight
  `domain/host-facts.ts`:
  - OMP: `createHostFacts()` returns `prices`, `access` and the `saw` recorder of the newest native
    context; `adapters/omp/domain/pricing.ts` and `provider.ts` are deleted.
  - pi: `piHostFacts()` does the same over the registry of the newest pi context;
    `adapters/pi/domain/provider.ts` and `pricing.ts` are deleted.
  The files hold the two plain queries and no manager, price cache, refresh, subscription, idle query
  or subagent fact. `index.ts` creates one set per assembly; `internal/port.ts` records each
  delivery's context through it and hands `prices`/`access` to the framework port.
- Both queries read the host at call time: a credential replaced (in place or through a later
  delivery's registry) is what the next `resolve` sees; a catalog changed between requests prices
  the later request while the issued one keeps its request-start snapshot. Missing facts remain
  absent — no borrowed provider credential, no empty string, no default address, no zero price.
- The factory receives only the plain query objects (`resolve`, `priceOf`) and plain fact copies; no
  native model registry, catalog, context or credential store is reachable through them. The
  framework's `HarnessPort` semantics are unchanged.
- Current documentation was updated for the merged domain: root `README.md`, `framework/README.md`,
  `framework/docs/framework-capabilities.md`, `framework/docs/capability-interface-architecture.md`,
  `framework/docs/extension-development-map.md` and the ADR-0002 adapter domain map. Final
  navigation/ADR consistency review remains ticket 11's.

## Acceptance mapping

| Ticket acceptance | Promise / partition | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| The five Host facts declarations use the canonical interface; public facts expose no registry, credential store, HTTP client or mutable framework-reserved reference | P01, P05 (Host facts partition) | `tests/framework/import-boundary.test.ts` “Host facts' declarations are published only by the Host facts capability interface” (canonical file owns all five; no other declaration/export block/re-export); the same suite's capability-dependency checks; `bun run typecheck`; runtime `Object.keys(providerAccess) === ["resolve"]`, `Object.keys(modelPrices) === ["priceOf"]`, fresh fact copies that do not alter the next answer (`turn.test.ts`, `pi-turn-mapping.test.ts`) | Pass |
| The same use path sees updated credentials on the next `resolve`; missing stays absent without borrowing another provider or inventing an address/empty string | P28 | OMP `tests/framework/turn.test.ts` “a credential replaced or withdrawn between operations is what the next query sees”; pi `tests/framework/pi-turn-mapping.test.ts` same-named case (both cover in-place replacement, withdrawal, an unrelated provider, a later delivery’s newer registry, and a tampered earlier fact); real OMP `tests/harness-dock/model-cost-balance.test.ts`; real pi `bun scripts/pi-model-cost-smoke.ts` (host credential/address reach the balance request, 100 checks / 28 runs) | Pass |
| A catalog changed before a real request is observed at that Turn’s start; no price stays undefined; transport `requestId` is distinct from Turn identity and not proven by the final displayed amount alone | P29 | OMP `turn.test.ts` “a catalog changed between requests prices each request at its own start, not at its end” (start/end facts, later request sees the new price, `providerRequestId` carried apart and `turnId` differs); pi `pi-turn-mapping.test.ts` “the price is the one holding at the request's start, and a later price change prices only later requests”; both adapters’ missing/zero-price cases; request identity/HTTP facts in `turn-facts.test.ts`; real OMP `model-cost-modes.test.ts` (`Ref: $0.0050` from the host’s own `models.yml` price and the saved `referenceCostUsd`); real pi smoke (allowance reference at the host catalog’s stated price) | Pass |
| Each adapter’s provider/catalog queries are concentrated in the approved lightweight home; callers migrated and unused old implementations exit; no CanAcceptInput/Subagent, manager, price cache, refresh or subscription introduced | P30, P51 | Migration review: only `adapters/{omp,pi}/domain/host-facts.ts` hold the mappings; `adapters/{omp,pi}/index.ts` and `internal/port.ts` are the only callers; the four old files are deleted; repository search finds no remaining `domain/pricing`, `domain/provider`, `createModelPrices`, `createProviderAccess`, `harnessModelPrices` or `harnessProviderAccess` reference; the new files import only the canonical host-facts declarations and native context types; `bun run typecheck`; framework/extension/test partitions below | Pass |
| Both adapters and the affected model-cost/connect-bot usage paths are covered; real host dock/request observation run; ownership judged by migration review, with no new layout test | P28, P29, P30 | OMP real docks: `model-cost-modes.test.ts` (host catalog price at request start) and `model-cost-balance.test.ts` (host address/credential on the real balance request); pi real smoke: `pi-model-cost-smoke.ts`; connect-bot has no `modelPrices`/`providerAccess` consumer (repository search), and its real partition stayed green; behavior tests were added at the existing adapter/framework seams, none for file layout | Pass |

## Red → green and fault injection

| Slice | Evidence | Result |
| --- | --- | --- |
| OMP provider query must follow the newest registry | Temporarily changed `saw` to keep only the first registry. `bun test tests/framework/turn.test.ts` failed the new credential case with `baseUrl` still `.../v1` instead of `.../v2` (17 pass / 1 fail). Restored; green. | Red observed, then green |
| pi provider query must follow the newest registry | Same one-line fault in `adapters/pi/domain/host-facts.ts`. `bun test tests/framework/pi-turn-mapping.test.ts` failed the new credential case the same way (13 pass / 1 fail). Restored; green. | Red observed, then green |
| Catalog must be queried at each request start, not cached | Temporarily added a per-provider/model price cache in OMP `createHostFacts`. `bun test tests/framework/turn.test.ts` failed “a catalog changed between requests…” because the second start kept the old 1/2/3/4 amounts instead of 9/9/9/9 (17 pass / 1 fail). Restored; green. | Red observed, then green |
| Host facts declarations must have one owner | Temporarily added `export interface ProviderAccessFacts` to `framework/core/protocol.ts`. `bun test tests/framework/import-boundary.test.ts` failed with `framework/core/protocol.ts declares ProviderAccessFacts outside the Host facts capability interface` (11 pass / 1 fail). Removed; green. | Red observed, then green |

All injected changes were removed before the final regression runs above.

## Commands and results

All runs used the source state above. The final framework partition was rerun after the last test
edit; the other partitions were run after the last production edit and were unaffected by the later
documentation-only edits.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages installed; `bun.lock` unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `bun test tests/framework/{turn,pi-turn-mapping,import-boundary,turn-facts}.test.ts` | 0 | **66 pass / 0 fail**, 252 `expect()` calls, 4 files |
| `bun run test:framework` | 0 | **621 pass / 0 fail**, 2796 `expect()` calls, 53 files |
| `bun test tests/model-cost` | 0 | **516 pass / 0 fail**, 2892 `expect()` calls, 51 files |
| `bun run test:codebase-tools` | 0 | **24 pass / 0 fail**, 334 `expect()` calls, 7 files |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 0 | **142 pass / 0 fail**, 689 `expect()` calls, 18 files |
| `bun test tests/harness-dock/model-cost-modes.test.ts` | 0 | **6 pass / 0 fail**, 67 `expect()` calls; real isolated OMP 18.5.0 with the frozen viewed-session patch; host catalog price produced `Ref: $0.0050` and the saved `referenceCostUsd` |
| `bun test tests/harness-dock/model-cost-balance.test.ts` | 0 | **6 pass / 0 fail**, 38 `expect()` calls; real isolated OMP 18.5.0; host-resolved address and credential reached the local balance endpoint |
| `bun scripts/pi-model-cost-smoke.ts` | 0 | **100 checks passed, none failed**, 28 isolated real pi 1.3.0 runs; allowance reference used the host catalog’s stated price and the balance query used the host-resolved address/credential |
| `bun run check:integrations` | 0 | all five discovery declarations complete/not required; declaration matching only, behavior not assessed |

Environment note: the checked-out `host-patches/**/patch.diff` files carry CRLF under this Windows
checkout, while their frozen sha256 is the LF form. For the two patched-dock runs above the two
`.diff` files were locally normalized to LF so the frozen artifact hash and patch parser matched;
both files were restored to their checked-out content with `git checkout --` afterwards and are not
part of this ticket's changes.

## Scope limits and unverified items

- connect-bot has no `providerAccess` or `modelPrices` consumer in this repository, so it has no
  host-facts usage path to migrate or observe; its partition was rerun only as regression.
- No real provider account, credential or remote endpoint was used. The OMP docks used the local
  capture endpoint and the isolated run's fixture credentials; the pi smoke used isolated run roots.
  The account answers in both are the runs' own scripted documents.
- P48 terminal readability was not judged. The display assertions above are field/value checks, not
  a human readability comparison.
- This ticket did not run the full repository `bun run test`, the final five-entry regression, or a
  physical TUI acceptance run; those remain tickets 12/14. The framework partition is green; that is
  not a claim of full-repository green.
- The OMP dock runs each took their own isolated temp root; no formal harness installation,
  production loader configuration or real agent state was modified.
