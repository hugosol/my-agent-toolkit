# Ticket 11 — legacy retirement and global encapsulation: verification evidence

Source state: branch
`hyper/framework-capability-cutover/11-legacy-retirement-verificatio-821241-e1e098c5b064`, base
revision `af7b7583fe66934330c878381976e95843128804` (the merged ticket 10 cutover), plus this
ticket's documentation changes. No production or test source changed in this ticket: the final
`git diff` contains only `README.md`, `docs/adr/0002-semantic-extension-framework.md`,
`framework/README.md`, `framework/interface/README.md`, and the three files under
`framework/docs/`. Dependencies: `bun install --frozen-lockfile` (13 packages); `bun.lock` sha256
`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2.

## Delivered behavior

- **Static retirement.** No extension imports a framework path outside `framework/interface`; no
  extension or discovery entrypoint imports any of the seven former exceptions (`framework/public`,
  `core/assembly`, `core/definition`, `core/config`, `core/integration`, `modules/http`,
  `modules/files`). `framework/public.ts` and `framework/core/protocol.ts` are absent, and no
  framework module outside `framework/interface` re-exports a capability. Internal files with real
  duties (`core/definition`, `core/config`, `core/integration`, `modules/http`, `modules/files`,
  `core/state`, `core/observations`) remain internals, not extension entries.
- **Ownership.** A repo-wide scan of exported declaration names found no consumer outside
  `framework/interface` importing an interface-owned name from an internal path. The only
  cross-path names are the two exact implementation connections the contract permits (`request` at
  `modules/http.ts` and `getConfig` at `core/config.ts`). Two extension-local business types happen
  to share the names `SessionFacts` and `SessionStartup`; they are unrelated local declarations,
  are not exported by any framework path, and no consumer imports them as framework contracts. The
  import-boundary suite separately proves each capability's canonical owner and that the root
  authoring entry publishes only its own ten names and no capability.
- **Actual objects (independent temporary probe).** Driven through the real framework
  binding/assembly, the factory context exposed exactly `config`, `modelPrices`, `providerAccess`
  and `session`; initialization exactly `feedback`, `hasUI`, `owner`, `subagents`; directed
  `run`/`unrecognized` exactly `args`, `canAcceptInput`, `capability`, `feedback`, `hasUI`, `owner`,
  `provider`, `state`; an action exactly the first six with no `state` or `capability`; the managed
  seam exactly `read`/`write`; the retained capability exactly `feedback`/`state`; Host facts
  exactly `resolve`/`priceOf`. Recursive key scans found no `persist`, `markers`, `publishMarkers`,
  `store`, `source`, `invocation` or port member. Session reads were frozen-surface copies whose
  nested mutation did not reach the later read, `recordCommit` counted once, Host facts answered
  the current credential/price and a previously returned fact could not mutate the host answer, and
  a late retained write after the owner ended rebuilt nothing. The probe was deleted after the run;
  no permanent source-text or layout test was added.
- **Documentation.** The root and framework READMEs, the interface reading map, the capability
  index, the extension development map and the architecture explanation now describe the completed
  cutover. ADR-0002 gained the explicit non-additive `Full capability interface cutover
  (2026-10-19)` amendment, and the architecture document records the rejected candidates:
  separate public `definition/`/`assembly/` layers, `context.hostFacts`/`context.config` grouping,
  General as a capability or aggregate entry, and a public Marker transport. Historical statements
  are preserved; the Session amendment's "until their own migration" sentence is explicitly
  superseded by the new amendment rather than rewritten.

## Acceptance mapping

| Ticket acceptance | Promise / partition | Evidence (actual run or inspection) | Result |
| --- | --- | --- | --- |
| Whole-repo recheck of framework, adapter, extension, script and test consumers and public declarations; P01 ownership complete; root authoring composes without duplicating or aggregating all capabilities; not merely compilable same-name declarations | P01 (global), P49 (final dependency partition) | Static audit: extension imports outside interface = none; interface-owned names imported from internal paths = none; exact connections = `request`, `getConfig` only; `framework/public.ts`/`core/protocol.ts` absent; `definition.test.ts` asserts the root entry's exact ten-name composition and that the OMP adapter exposes only `ompAdapter`; `import-boundary.test.ts` asserts each canonical owner, the no-exemption extension rule, the exact runtime connections and framework→extension absence. 38/0 across `definition`, `import-boundary` and `integration-check`. | Pass |
| Independently recheck actual initialize, directed run/unrecognized, actions, State/retained, Host facts and Session reachable operations/readings; no internal engine or framework-reserved mutation; config keeps only its approved limited exception | P05 (final Session and actual-object partition), P47 (framework partition) | Temporary probe: exact key sets above, recursive internal-member search empty, state read-after-write, capability surface, Session isolation/`recordCommit`, Host facts current-value/copy behavior, inert late retained write. Existing actual-object cases: `implementation-lifecycle.test.ts` (four-member initialization, no markers/publishMarkers), `directed-control.test.ts` (eight members on both paths, no persist/markers, nested state/capability sets), `actions-routing.test.ts` (six members, no state/capability/persist/markers), `control.test.ts` (write → persist → marker → notify order), `owner-capability.test.ts` (retained writes, revocation, no revival), `turn.test.ts` (provider-access keys and live credential changes, catalog-at-request-start, no registry/catalog leak). Configuration's `context.config` is deliberately the one TypeScript-`Readonly` object with no runtime write protection and was excluded from the isolation claim, per the approved limited exception. | Pass |
| Reuse Session capability/observation/lifecycle coverage: read-only reader, no write authority, isolated readings, `recordCommit`, one dispatch, owner/session scope and close-out | P47 (framework partition) | Focused run: `session-capability`, `session-observation-access`, `subscription-scope`, `close-out-deadline`, `owner-capability`, `round-disposal`, `pi-disposal-round-close` — 55 pass / 0 fail, 192 expect() calls. These observe the actual reader/capability objects, mutation isolation, confirmed-write notices, one dispatch and both scopes, close-out deadlines, disposal/round closing and retained-capability revocation. Real host save/end/subagent partitions remain with tickets 12/13. | Pass |
| Delete the old mixed public entry and unused old declarations; all seven exceptions cleared; no compatibility alias, re-export or forwarding shell; internal implementations with duties retained | P51 (global partition) | Static audit above; `framework/public.ts` and `core/protocol.ts` absent; no framework re-export outside `framework/interface`; source inspection kept `core/definition`, `core/config`, `core/integration`, `modules/http`, `modules/files`, `core/state` and `core/observations` because each has real internal consumers; the import-boundary suite passes 17/0 in the final framework run. Fault injection: adding an extension import of `framework/core/definition` failed the boundary suite with the exact crossing; adding a duplicate `StateDeclaration` export to `core/definition.ts` failed the State-ownership case; both restored. | Pass |
| Earlier batches completed their own consumers, objects, exports and exceptions; this ticket handles only residual/global verification and fixes omissions | P01/P05/P51 cross-ticket partitions | The audits above found no residual extension consumer, no legacy path and no duplicate public owner. The only edits are documentation; no earlier ticket's scope had to be re-opened. | Pass |
| Update existing README, capability index, extension development navigation, architecture explanation and ADR non-compatible contract record; correct the unadopted definition/assembly layer, `context.hostFacts`, General capability and public Marker transport candidates; preserve history; add no unproductive docs | P01/P05 (documentation support, not a promise of its own) | Files listed in "Source state"; ADR amendment records the switch and the rejected candidates; architecture §9 now has a "Candidates considered and not adopted" table; capability-index `protocol.ts` labels repaired to the actual interface files and line anchors; no new document created. Relative-link check over all changed documents: all resolve. Markdown-anchor check (excluding source line anchors and pre-existing extension runbook anchors) is clean. | Pass |
| Pass existing static checks, typecheck, relevant framework and consumer partitions and actual-path observation; static retirement and behavior preservation separately evidenced; no new permanent source-text/layout tests | P01/P05/P49/P51/P52 (11 partition) | Commands and results below: typecheck 0; import-boundary/definition/checker 38/0; focused P47 55/0; framework 633/0; codebase-tools 24/0; connect-bot 142/0 with the real panel; model-cost 518/0; `check:integrations` 0; probe 0. Static retirement evidence is the audit and injections; behavior preservation is the suites and probe. No test file was added or changed. | Pass |

## Commands and results

Logs were kept under the gitignored `.cache/ticket11-logs/` during the run.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages installed; lockfile unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `bun test tests/framework/definition.test.ts tests/framework/import-boundary.test.ts tests/framework/integration-check.test.ts` | 0 | 38 pass / 0 fail, 588 expect() calls |
| `bun test tests/framework/{session-capability,session-observation-access,subscription-scope,close-out-deadline,owner-capability,round-disposal,pi-disposal-round-close}.test.ts` | 0 | 55 pass / 0 fail, 192 expect() calls |
| `bun run test:framework` (final, after all injections restored) | 0 | 633 pass / 0 fail, 3325 expect() calls, 53 files |
| `bun test tests/codebase-tools` | 0 | 24 pass / 0 fail, 334 expect() calls, 7 files |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 0 | 142 pass / 0 fail, 689 expect() calls, 18 files |
| `bun test tests/model-cost` (second run) | 0 | 518 pass / 0 fail, 2899 expect() calls, 51 files |
| `bun run check:integrations` | 0 | all five deployed pairs `COMPLETE`/`NOT REQUIRED`; final line says behavior correctness is not assessed |
| Temporary probe `bun .probe-11.ts` | 0 | `failures: []`; exact surfaces, isolation and inert late writes as described above; probe deleted |
| Fault injection: extension import of `framework/core/definition` | 1 | import-boundary 16 pass / 1 fail, crossing `extensions/codebase-tools/definition.ts bypasses the capability interface …`; reverted |
| Fault injection: duplicate `StateDeclaration` export in `core/definition.ts` | 1 | import-boundary 16 pass / 1 fail, `framework/core/definition.ts exports StateDeclaration outside the State capability interface`; reverted |
| Fault injection: `markers` added to the directed delivery | 1 | `directed-control.test.ts` 8 pass / 1 fail on the exact-delivery case; reverted and the file reran 9/0 |

### Transient failure observed

The first `bun test tests/model-cost` run reported 517 pass / 1 fail in
`tests/model-cost/harnesses/pi/pi-disposal-round-close.test.ts` ("leaving a session for another one
closes no Round…", no record published after the 200-iteration wait). No source changed in this
ticket, the test passed in isolation, the whole file next passed 5/0, and the whole partition next
passed 518/0. This is recorded as a non-reproducing timing/isolation observation in an unchanged
suite, not as a ticket-11 regression or a product pass claim; the final green runs are the evidence
reused above.

## Limits and unverified scope

- This record claims the ticket 11 partitions only. Real five-entry OMP/pi discovery regression is
  ticket 12's partition; P48 readability remains human-only and unverified.
- No real harness process was started by this ticket. The actual objects were observed through the
  approved S1 framework construction/port seam; real host save/end/subagent partitions belong to
  tickets 12/13. The connect-bot suite used the real panel binary; its default support path was
  absent, so the run selected the explicit `OMP_BOT_BINARY` above.
- `bun run test` and the harness dock were not run; earlier dock/real-entry results are not reused
  as current evidence. No candidate harness version or real provider credential was exercised.
- The import check is a lexical alarm over `.ts` files, not a proof; computed specifiers, non-`.ts`
  modules and aliasing remain outside it. The static audit used the same lexical limits.
- The capability index's source-line anchors were refreshed for the quoted declarations; source
  remains authoritative for behavior, ordering and errors.
