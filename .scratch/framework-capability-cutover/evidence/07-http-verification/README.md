# Ticket 07 — HTTP interface cutover: verification evidence

Source state: branch
`hyper/framework-capability-cutover/07-http-interface-cutover-6001aa-e1e098c5b064` (the branch
created for this ticket), base revision
`c5e4a852f53f31cf31087ee959c61ee0184056d2` (the merged ticket 06 cutover), plus this ticket's
working changes. Dependencies: `bun install --frozen-lockfile` (13 packages); `bun.lock` sha256
`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2. All HTTP
exchanges in the smoke ran against real loopback servers; no provider, credential, external service
or formal harness entry was used for the HTTP behavior. `bun run test:framework` includes the
recorded isolated `@oh-my-pi/pi-coding-agent@18.5.0` deployment test, which passed. The connect-bot
partition used the real panel binary at
`E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe` through `OMP_BOT_BINARY`. Final runs
below finished on the unchanged tree; the only later edit was a comment in
`tests/framework/import-boundary.test.ts`, after which the focused import-boundary test and
typecheck were rerun.

## Delivered behavior

- `framework/interface/general/http.ts` is the HTTP module's one extension-facing entry. Its runtime
  exports are exactly `request` and `HttpConfigurationError`; its type export is exactly
  `HttpRequestOptions`. It exports no transport factory, shared proxy table or configuration
  reader.
- The canonical declarations live in `framework/interface/general/http-contract.ts`:
  `HttpRequestOptions` keeps `method`, `headers`, string `body`, `timeoutMs` and `proxy`, and
  `HttpConfigurationError` keeps its `detail`. The implementation in `framework/modules/http.ts`
  imports that same class and throws it, and the entry re-exports the same class, so an error thrown
  inside is recognized by `instanceof` outside — one identity, no copy.
- The entry's runtime connection is the deliberate thin exception:

  ```text
  interface/general/http.ts ──► interface/general/http-contract.ts   (declarations)
  interface/general/http.ts ──► modules/http.ts                      (request re-export)
  modules/http.ts           ──► interface/general/http-contract.ts   (same declarations)
  interface/general/http-contract.ts ──► (no imports)
  ```

  There is no path from the implementation back to the entry, so the connection creates no cycle.
  `tests/framework/import-boundary.test.ts` now allows exactly this file/specifier pair and no other
  interface import of framework implementation.
- The deep implementation stays in `framework/modules/http.ts`: `createHttpModule`, the injectable
  transport/configuration seam, the shared file path and reader/parser, proxy resolution, the budget
  precedence, the native client and the same declared `request` the entry re-exports. Behavior was
  not copied or reimplemented in the interface.
- `framework/public.ts` no longer exports HTTP; `framework/modules/http.ts` no longer declares or
  exports `HttpRequestOptions`/`HttpConfigurationError` and is removed from the extension legacy
  import exceptions. No compatibility alias, forwarding module or second path is left.
- Consumers migrated: connect-bot's panel client and all connect-bot tests; model-cost's runtime,
  Codex quota, provider balance and all model-cost tests; the HTTP transport smoke; the provider
  account script; framework HTTP tests; and both codex-quota harness-dock fixtures. Internal test
  seams (`createHttpModule`, the module types) remain available to tests but not to extensions.
- The existing smoke was extended where the published entry had no direct evidence: the isolated
  child now drives the public entry for a POST with caller method/headers/body, a non-2xx answer
  and its body read; the run also observes a proxied exchange ending at the wait budget, a disabled
  named entry connecting directly with its real proxy untouched, and an invalid or undeclared named
  entry being refused before the target records anything. No response wrapper, retry or cache was
  added.

## Acceptance mapping

| Ticket acceptance | Promise / partition | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| Only `request`, `HttpRequestOptions`, `HttpConfigurationError` are public; options keep method, headers, string body, `timeoutMs`, proxy; the error keeps `detail`; internal throw and public recognition use one class identity | P01, P49, P51 (HTTP partition); P36 | Runtime export check printed `["HttpConfigurationError","request"]`; `tests/framework/http.test.ts` imports `HttpConfigurationError` from the new entry and asserts `toBeInstanceOf` against errors thrown by the internal implementation in the invalid-budget, invalid-default and proxy-refusal cases; `bun run typecheck` 0; import-boundary 16/16 | Pass |
| Public `request` makes a real local HTTP request; method/headers/body, success and non-success responses, standard `Response` and body read; no response wrapper, retry or cache | P36 | `bun run smoke:http-transport`: the isolated child drove `framework/interface/general/http.ts` under a spawn-time proxy environment; the target recorded `GET /ok` twice with direct hops, `POST /echo` with body `{"sessionId":"one"}` and sentinel `sentinel-value`, and `GET /missing`; the child read `status 200` and the 404 body `no such account`. The main run also proved a non-2xx answer resolves and the body arrives under a sufficient budget | Pass |
| Real target/proxy rules: `proxy: false` and omitted connect directly; a named enabled entry goes through the proxy; a disabled entry connects directly; missing/invalid configuration refuses before sending and the target records no accidental direct request — not only an error-text assertion | P37 | Smoke: cases 1–5, 9, 16, 16b–16d. Enabled plain/TLS proxies and CONNECT record the request line and the target records the hop; omitted and `proxy: false` record direct hops with zero proxy sightings under an ambient proxy trap; a disabled entry with a listening real proxy records a direct hop and zero proxy sightings; an invalid `socks5://` entry, an undeclared name and an absent file reject with `HttpConfigurationError` and add zero target hits; a refused proxy rejects and is not re-sent direct | Pass |
| Controlled delayed response head and body cover the original budget precedence and the proxy path; observe the real whole-exchange timeout/abort and keep original transport failure propagation; no passing a timeout number as mechanism evidence | P38 | Smoke: the proxied `/hang` case times out at ~201ms with a 200ms budget and the target records the hit through the proxy hop; the direct `/slow-body` head arrives while the body is late and the read fails at ~201ms; the same body arrives at ~603ms under 1500ms; the shared 300ms default and built-in 30000ms are measured against real hanging targets; a truncated body rejects the read; a refused proxy rejects with the platform failure | Pass |
| Migrate every connect-bot, model-cost, framework, adapter, script and test HTTP consumer; keep the internal transport factory and configuration reader as internal seams; retire the old export and exception; permit only the exact function connection with no cycle | P49, P51 (HTTP partition); P52 (07 handoff) | Repository search after migration found no declaration import from `modules/http` and no extension import of `framework/public` for HTTP; the import-boundary legacy list no longer contains `modules/http` and its interface-import test permits only `framework/interface/general/http.ts` → `../../modules/http`; the source graph above is acyclic; `bun run test:framework` (628/0), `bun test tests/model-cost` (516/0) and `OMP_BOT_BINARY=… bun test tests/connect-bot` (142/0) pass | Pass |
| Run the existing HTTP smoke, fill its behavior gaps with real local exchange, and run the owning partition and affected consumers | P52 | Commands and results below; the smoke grew from 19 to 23 passing observations and the framework partition stayed 628/0 | Pass |

## Red → green and fault injection

| Slice | Evidence | Result |
| --- | --- | --- |
| Interface entry and declaration ownership | The migration's initial red was the missing `framework/interface/general/http.ts`; existing behavior coverage was reused rather than re-pinned. After the entry was added, the focused `tests/framework/http.test.ts` + `tests/framework/import-boundary.test.ts` ran 35/35 with the canonical class imported from the new entry | Green |
| Public-entry option forwarding | Fault injection: `request` temporarily forwarded `sharedModule.request(url)` with the options dropped. The smoke failed its public-probe observation (19 passed / 1 failed; the target recorded `GET /echo` with empty body and the sentinel missing). The forwarding was restored; the final smoke run is 23/0 | Fault detected, then restored |
| Proxy rules through real target and proxies | Added 16b–16d after the first green smoke; the disabled entry records a direct hop with zero proxy sightings, and both invalid/undeclared selections add zero target hits | Green with real exchange |

All injected changes were removed before the final regression runs; no `FAULT INJECTION` marker
remains in the tree.

## Commands and results

Final tree, run sequentially; no source or fixture was edited during these runs except the noted
comment-only import-boundary edit, whose focused rerun is listed.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages installed; `bun.lock` sha256 unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `bun run test:framework` | 0 | **628 pass / 0 fail**, 3266 `expect()` calls, 53 files (includes HTTP, import-boundary and the real isolated OMP 18.5.0 deployment test) |
| `bun test tests/model-cost` | 0 | **516 pass / 0 fail**, 2892 `expect()` calls, 51 files |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 0 | **142 pass / 0 fail**, 689 `expect()` calls, 18 files (includes the real-panel interop cases) |
| `bun run smoke:http-transport` | 0 | **23 pass / 0 fail**, 0 observations; real loopback targets, plain/TLS proxies, CONNECT, ambient trap, public-entry child process |
| `bun test tests/framework/http.test.ts tests/framework/import-boundary.test.ts` | 0 | **35 pass / 0 fail** (19 HTTP + 16 boundary) |
| `bun test tests/framework/import-boundary.test.ts` after the final comment edit | 0 | **16 pass / 0 fail** |
| `bun -e 'const m = await import("./framework/interface/general/http.ts"); console.log(Object.keys(m).sort())'` | 0 | `[ "HttpConfigurationError", "request" ]` |

Two earlier runs were invalid for evidence: running connect-bot and model-cost concurrently
produced three timing-sensitive model-cost store failures, and the first connect-bot run had no
`OMP_BOT_BINARY`, so its five real-panel interop cases could not start. Both suites passed when run
sequentially with the real panel binary available; the failures are recorded rather than hidden.

## Scope limits and unverified items

- This ticket closes P36–P38 and its P01/P49/P51 HTTP partition, plus the P52 handoff for ticket 07.
  It does not close those promises globally: the safe-file and configuration General modules, the
  internal port, the final legacy retirement, the five real entry regressions and the final handoff
  remain later tickets.
- The public entry cannot select a named proxy in the smoke without editing the repository's own
  `framework/config.yaml`. Named-proxy resolution is therefore exercised through the internal
  factory over real temporary configuration files and real loopback proxies; the public entry
  re-exports that same implementation and is driven directly for direct, HTTPS, method/headers/body,
  non-2xx and body-read cases. The configuration file was not modified.
- No harness dock was required by this ticket's HTTP behavior. `bun run test:framework` included the
  real isolated OMP 18.5.0 deployment test; connect-bot's interop cases used the real panel process.
  No connect-bot or model-cost real-host dock, provider account, external service or physical TUI
  was run.
- `scripts/pi-provider-account-read.ts` was migrated and typechecks; the script itself was not run
  because it needs a real provider credential and performs an external account read, which is not
  part of this ticket's HTTP partition.
- P48 terminal readability was not judged. Focused green is not a claim of full-repository green or
  harness support certification.
