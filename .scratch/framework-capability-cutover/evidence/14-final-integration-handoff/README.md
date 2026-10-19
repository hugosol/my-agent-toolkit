# Ticket 14 — final integration and readability handoff: verification evidence

This is ticket 14's own P52 handoff and the final evidence-validity review. It records what was
executed, what passed, what failed, what was reused and what remains unverified. **P48 is not
decided here.** The ticket cannot be marked complete until the user confirms the readability
question in [`p48/README.md`](p48/README.md).

## Source and environment

| Item | Value |
| --- | --- |
| Branch | `hyper/framework-capability-cutover/14-final-integration-handoff-65cfec-e1e098c5b064` |
| Head | `57583d286ab24462e73aceb14f0f6711a52c78df` (merge of ticket 13's branch) |
| Tree during final runs | tracked source and fixtures clean; the only working-tree additions were `.cache/` (gitignored logs and isolated harness installs) and, after the runs, this evidence directory |
| Dependencies | `bun install --frozen-lockfile`, exit 0, 13 packages; `bun.lock` raw sha256 `e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged from every ticket record |
| OS | Windows 10.0.26200, x64 (win32 x64) |
| Bun | 1.4.2 (`744846f84`) |
| Node | v24.18.0 default; ticket 13's pi runs used v22.19.0 through `PI_NODE`; both executables were re-checked present |
| TypeScript | 7.0.2 |
| TypeScript / pi / subagents | TypeScript 7.0.2; pi 1.3.0 (`D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`); `pi-subagents@0.78.0` |
| OMP | isolated exact `@oh-my-pi/pi-coding-agent@18.5.0` under `.cache/omp-baseline/18.5.0`; the viewed-session and Codex prefixes are 18.5.0 as well |
| OMP patches | viewed-session `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b`; Codex response boundary `4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d`; both checked from their committed LF bytes, matching ticket 12's record |
| real panel | `E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`, named through `OMP_BOT_BINARY` for the connect-bot suite; its own temporary configuration and ephemeral loopback port |
| fixtures | `tests/harness-dock/fixtures/`, `tests/harness-dock/capture-server.ts`, `tests/harness-dock/pi-session.ts`, `scripts/support/tui-acceptance-fixture.ts`; unchanged since tickets 12/13 |
| isolation | every real-host run uses its own temporary agent state, session directory, run root, user home and (where applicable) panel configuration; no formal load configuration, global install, credential or running agent was touched |

No production, framework, adapter, extension, entrypoint, script or test source changed in this
ticket. The only repository addition is this evidence directory, including its temporary evidence
probe; it is not part of any `tests/` partition or the shipped scripts.

## What ticket 14 executed

1. Three fault injections, each observed failing, then restored; `git status`/`git diff` clean
   before the final runs.
2. The final `bun run typecheck`, the full `bun run test` and `bun run check:integrations` on the
   restored, stable tree, with no concurrent edit of tested source or fixtures. The full suite and
   the post-suite checks ran in one quiet window in this worktree; the logs are local under
   `.cache/ticket14-logs/` (gitignored).
3. A source/input comparison showing why tickets 12/13's five-entry real runs remain reusable.
4. A P01–P52 coverage/ownership review and a P48 before/after material pack for the user.

### Fault injection and restoration

| Injection | Targeted check | Injected result | Restored result |
| --- | --- | --- | --- |
| Added `markers: invocation.markers` to the framework's directed `CommandDelivery` (`framework/behaviors/control.ts`) | `bun test tests/framework/directed-control.test.ts` | exit 1; 8 pass / 1 fail; `(fail) … the delivery is exactly the approved surface, on `run` and `unrecognized` alike`; received keys included `markers` | file restored; exit 0, 9 pass / 0 fail |
| Re-declared `export type StateDeclaration` in `framework/core/definition.ts` | `bun test tests/framework/import-boundary.test.ts` | exit 1; 16 pass / 1 fail; `framework/core/definition.ts declares StateDeclaration outside the State capability interface` | file restored; exit 0, 17 pass / 0 fail |
| Removed `"state-follow"` from `adapters/omp/domain/subagent/declaration.ts` | `bun run check:integrations` | exit 1; `MISSING omp / codebase-tools: in-process: missing state-follow` | file restored; exit 0, all five pairs `COMPLETE`/`NOT REQUIRED` |

The injections show that the final static, behavioral and declaration-check alarms can each detect a
real violation of the ticket's subject. They are not a claim of exhaustive mutation coverage.

Logs: `injection-markers.log`, `restore-markers.log`, `injection-duplicate.log`,
`restore-duplicate.log`, `injection-integrations.log`, `integrations-restored.log`.

### Final runs (after restoration)

| Command | Exit | Result | Log |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | no diagnostics | `typecheck-final.log`, `typecheck-post-suite.log` |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun run test` | 0 | **1432 pass / 0 fail**, 8447 `expect()` calls, 158 test files, 474.67 s. This is the whole repository: framework, codebase-tools, connect-bot with the real panel, model-cost and the 29 harness-dock files. | `full-test.log` |
| `bun run check:integrations` | 0 | five deployed pairs: omp/codebase-tools COMPLETE, omp/connect-bot NOT REQUIRED, omp/model-cost COMPLETE, pi/codebase-tools COMPLETE (in-process, cross-process), pi/model-cost COMPLETE (in-process, cross-process). Final line: declaration matching only; behavior correctness is not assessed. | `check-integrations-final.log`, `check-integrations-post-suite.log` |
| `bun run smoke:http-transport` | 0 | **23 passed / 0 failed**; real loopback targets, enabled/disabled named proxies, ambient proxy trap, the public-entry child and whole-exchange timeout/body cases. | `http-smoke.log` |
| `bun run smoke:model-cost-data` | 0 | **20 passed / 0 failed, 20 checks**; the shipped pricing document, tiers, multiplier, units and peak windows. | `model-cost-data-smoke.log` |
| `bun run smoke:model-cost-detail-layout` | 0 | **16 PASS / 0 FAIL** at 160, 120, 100, 80 and 60 columns (line-level measurement; stdout was not a terminal). | `model-cost-detail-layout.log` |
| `bun .scratch/.../14-final-integration-handoff/probes/warning-notice-smoke.ts` | 0 | **7/7 checks**; the actual real-OMP warning frame of the production model-cost entry (`[warning] /budget holiday 仅适用于当前 provider 为 DeepSeek ... 「openai」，未执行。`), no model request, clean exit. | `warning-probe.log`; output under `p48/warning/` |

No earlier ticket record in this cutover shows a full `bun run test`; earlier tickets recorded their
owning partitions and are not retroactively replaced by this run. The run used the same isolated
OMP 18.5.0 install and the real panel binary. No source or fixture was edited during the run. The
1432 total is consistent with the recorded partition sizes (framework 633, codebase-tools 24,
connect-bot 142, model-cost 518, harness-dock 115; sum 1432), though the full run reports only the
aggregate, not per-partition counts.

## Ticket 14 acceptance mapping

| Ticket acceptance | Evidence | Result |
| --- | --- | --- |
| All executable implementation, automated checks and required real runs complete before the unified human round; no executable work paused for P48 | No production change was pending at this ticket; the final typecheck, full test and integration check all ran; the P48 pack was prepared without waiting for the human. | Pass for the executable scope; P48 remains the one human item |
| Fault injection and restoration first, then final typecheck, full test and independent integration check on the stable tree, in a quiet window, with complete logs | The three injections above; restored tree; final runs above; logs under `.cache/ticket14-logs/`. | Pass |
| Re-check 12/13 five-entry source/fixtures, dependency/lockfile, harness version/patch and environment; reuse only when the relevant inputs are unchanged, otherwise rerun affected scenes | The comparison below shows the five-entry inputs unchanged; the OMP and pi partitions are reused with their stated scope, and the current full test independently re-loads the OMP entries through the harness dock. | Pass; the pi entry runs are reused, not re-executed, under the unchanged-input rule |
| Review P01–P52 by coverage partition: no orphan or duplicate case claim; static ownership/retirement, failure mechanisms, real mechanisms and real hosts each have evidence; declaration comparison is not behavior proof | The P01–P52 ownership table and evidence-kind section below; `check:integrations` explicitly states that it does not assess behavior. | Pass with the stated limits |
| Summarize the 01 baseline and the 12/13 current terminal frames/recordings, versions/config, applicable widths, automatic field-layout results and reproduction, covering the existing Marker, three-level notices and model-cost display, without redesigning the display | [`p48/README.md`](p48/README.md), [`p48/pi-tui-normalized-diff.txt`](p48/pi-tui-normalized-diff.txt), the layout smoke's 16 PASS / 0 FAIL at 160/120/100/80/60 columns, the warning probe's real-OMP `[warning]` frame (7/7), and the linked baseline/current artifacts. | Material complete; P48 unverified pending the user |
| Final report separates executed, passed, failed, unverified and genuine blockers; keeps the static-check lexical limits and harness support boundaries; does not fabricate source/environment/exit status | This record and its tables, plus the limits section. | Pass |
| Ask the user one unified P48 judgement about "no obvious regression in existing terminal readability"; P48 stays unverified and the ticket is not complete until confirmation; loader, field correctness, lifecycle and error semantics stay with the agent | [`p48/README.md`](p48/README.md) asks exactly that one question. Loader/fields/lifecycle/errors are covered by the full test and the 12/13 runs, not handed to the user. | Open: P48 pending user confirmation |

## Reuse validity for tickets 12/13's five-entry real runs

The relevant input comparison (commands run on the current tree):

```text
git diff --name-status a3166c5..HEAD -- framework adapters extensions entrypoints tests scripts package.json bun.lock tsconfig.json
  M framework/docs/harness-support.md
  M scripts/pi-session-accounting.ts
  M scripts/pi-terminal-round-smoke.ts
git diff --name-status 8aa4d15..HEAD -- framework adapters extensions entrypoints tests scripts package.json bun.lock tsconfig.json
  (the same three files, which are ticket 13's own changes)
sha256sum bun.lock
  e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f
```

| Run | Recorded source state | What could affect it | Current-tree check | Decision |
| --- | --- | --- | --- | --- |
| Ticket 12 OMP entries (codebase-tools, connect-bot, model-cost; the OMP P47 scenes) | ticket 12 branch, base `a3166c5`, source changes none outside evidence | production framework/adapters/extensions/entrypoints/omp, `tests/harness-dock`, host-patches, fixtures, lockfile, OMP 18.5.0 | only `framework/docs/harness-support.md` and two **pi** evidence scripts changed after `a3166c5`; every OMP input is byte-identical (`git diff --name-status` empty for the relevant paths); lockfile hash matches; patch hashes and harness version match; environment matches | Reuse ticket 12's results for the OMP partitions |
| Ticket 13 pi entries (codebase-tools, model-cost; the pi P47 scenes) | ticket 13 branch, base `8aa4d15`, its three script/doc changes plus evidence | production tree, fixtures, scripts, lockfile, pi 1.3.0, Node 22.19.0 | current HEAD is the merge of that branch; the only non-evidence files changed since `8aa4d15` are the same three files; lockfile, pi version, Node 22.19.0 and Bun match | Reuse ticket 13's results for the pi partitions |
| Five-entry summary | 12 + 13 records, each with its own commands/counts and scope | the same inputs | as above | Reuse is valid **only** for the recorded source/environment; a later source change invalidates it |

The current full test adds a fresh real-host OMP load of all three OMP discovery entries and the
model-cost/connect-bot/codebase-tools dock cases (1432/0). The pi entry runs are not part of
`bun run test`; their current evidence is ticket 13's unchanged-input run, and that distinction is
kept rather than presented as a fresh ticket-14 execution.

## P01–P52 coverage and ownership review

The owner column is the ticket that owns the acceptance case for that promise; the evidence column
points at the current record. "Partitions" names the shared-promise partitions that the contract
requires; they are not a second owner for the same case.

| Promise | Owner | Evidence (current record) |
| --- | --- | --- |
| P01 canonical public ownership | 11 global; partitions 01–09 | 11's ownership audit, `import-boundary.test.ts` and `definition.test.ts`; the final full test; each partition's `P01` row |
| P02 CommandDelivery surface | 06 | `directed-control.test.ts` exact-surface case; 06's real OMP consumer run; final full test |
| P03 ActionDelivery surface | 06 | `actions-routing.test.ts` exact-surface case; 06's model-cost/period-switch real run; final full test |
| P04 initialization delivery surface | 05 | `implementation-lifecycle.test.ts` exact-surface case; 11's probe; final full test |
| P05 no internal capability bypass | 11 global; partitions 01–06 | 11's temporary probe (recursive key scans, late writes, read isolation); `directed-control`/`actions-routing`/`implementation-lifecycle`/Session suites; final full test |
| P06 existing defineExtension/factory/context form | 05 | `implementation-lifecycle.test.ts`; both real entries in 12/13 compile and construct; final full test |
| P07 managed State read/write | 01 | `declared-value-write.test.ts`, `owner-capability.test.ts`, `owner-inheritance.test.ts`, `control.test.ts`; final full test |
| P08 live State read | 01 | same State suites; `owner-capability` retained read; final full test |
| P09 repeated write effects | 01 | `declared-value-write.test.ts` two-identical-writes case; final full test |
| P10 write order | 01 | `control.test.ts` persistence-before-marker case; final full test |
| P11 persistence failure | 01 | `control.test.ts` failed-record case; final full test |
| P12 marker failure | 01 | `control.test.ts` failed-publication case; final full test |
| P13 owner-end revocation | 01 | `owner-capability.test.ts` retired/reopened cases; final full test |
| P14 session_end dispatch feedback | 03 | `owner-capability.test.ts`, `session-events.test.ts`; final full test |
| P15 subagent follow/none/unresolved | 01 | `owner-inheritance.test.ts`, `owner-gate.test.ts`; real OMP codebase-tools subagent case in 12; final full test |
| P16 restore and same-Owner navigation | 01 | `session-events.test.ts` last-payload/memory cases; real OMP session boundaries in 12; final full test |
| P17 Prompt strategy | 02 | `injection.test.ts`; real OMP codebase-tools injection/history cases in 12; pi smoke in 13 |
| P18 history preservation | 02 | real OMP/pi captured requests and session records in 12/13; final full test |
| P19 Marker declaration/transport | 02 | `marker.test.ts`, `import-boundary.test.ts`; delivered objects in 06; real OMP/pi marker runs |
| P20 Marker coexistence/disable | 02 | `marker.test.ts` six-rendering case; real OMP consumer regression; pi TUI marker probe |
| P21 area uniqueness/projection | 02 | `marker-module-duplication.test.ts`, `viewed-marker.test.ts`; real OMP viewed-session runs; pi P48 material |
| P22 toggle | 06 | `control.test.ts`, real OMP `command-toggle.test.ts`; final full test |
| P23 directed | 06 | `directed-control.test.ts`, real connect-bot arm/off cases; final full test |
| P24 unrecognized | 06 | `directed-control.test.ts`, real connect-bot unknown-argument cases; final full test |
| P25 actions matching/help | 06 | `actions-routing.test.ts`, real model-cost `/budget` cases; final full test |
| P26 actions async/error | 06 | `actions-routing.test.ts` async/throw/reject cases; real binding-lifecycle dock; final full test |
| P27 CanAcceptInput live query | 06 | `round.test.ts`, `round-events.test.ts`, real model-cost/connect-bot branches; final full test |
| P28 ProviderAccess current access | 04 | `turn.test.ts`, `pi-turn-mapping.test.ts`; real OMP balance run and pi smoke in 12/13 |
| P29 catalog timing | 04 | `turn.test.ts`, `pi-turn-mapping.test.ts`; real OMP model-cost-modes run; final full test |
| P30 adapter host-facts locality | 04 | migration review and the four deleted old files; P28/P29 behavior runs |
| P31 feedback levels | 03 | `feedback-harness.test.ts`, `feedback-pi-harness.test.ts`; real headless/UI runs in 12/13; final full test |
| P32 shared actual output | 03 | `feedback-harness.test.ts`, `feedback-pi-harness.test.ts`; final full test |
| P33 Subagent integration result | 05 | `pi-subagent-integration.test.ts`, `implementation-lifecycle.test.ts`; final full test |
| P34 factory/init timing | 05 | `implementation-lifecycle.test.ts` (validation, one initialize, first-request wait); real binding lifecycle; final full test |
| P35 cleanup/disposal/reuse | 05 | `implementation-lifecycle.test.ts`, real binding-lifecycle dock; final full test |
| P36 HTTP request | 07 | `bun run smoke:http-transport` (ticket 14: 23/0, real loopback; ticket 07's record is the same script) and `http.test.ts` in the final full test |
| P37 HTTP proxy rules | 07 | HTTP smoke cases 1–5, 9, 16, 16b–16d (ticket 14: 23/0; real targets/proxies, no accidental direct request) |
| P38 HTTP budget/timeout/body | 07 | HTTP smoke `/hang`, `/slow-body`, truncated body and real failure cases (ticket 14: 23/0) |
| P39 file lock re-read | 08 | `tests/framework/files.test.ts` two-process increments; final full test |
| P40 complete publication | 08 | `files.test.ts` 20k-document reader race and rename inode checks; final full test |
| P41 file wait budget/cancel | 08 | `files.test.ts` queued timeout, lock timeout, cancelled-while-waiting and after-start cases; final full test |
| P42 file errors | 08 | `files.test.ts` timeout/cancelled/io/corrupt and business-error identity cases; final full test |
| P43 getConfig | 09 | real temporary configuration file success/failure cases; `config.test.ts`; final full test |
| P44 config Readonly/cache/identity | 09 | typecheck `@ts-expect-error` assertions; real-file cache and same-object cases; final full test |
| P45 model-cost diagnostics | 09 | model-cost's own helper and `consumption-document.test.ts`; migration review; final full test |
| P46 five real discovery entries | 12 (OMP three), 13 (pi two) | 12: real loader/dock/probes and 115/0 dock; 13: pi smokes/probes with 52/100/30/15/17/11/18 checks and 14/14 + 12/12 probes; reused under the input comparison above; current full test re-loads the OMP entries |
| P47 Session semantics | 11 (framework), 12 (OMP), 13 (pi) | 11's focused 55/0 suite; 12's real save/end/subagent docks; 13's real pi save/end/subagent/close-out smokes; final full test |
| P48 readability | human (14 prepares) | [`p48/README.md`](p48/README.md); **unverified** |
| P49 dependencies/port/native boundary | 10 (port/final dependency), 11 (global); partitions 01–09 | 10's declaration/re-export/dependency review and port tests; 11's global audit; each batch's `P49` row; `import-boundary.test.ts` and `typecheck` in the final full test |
| P50 offline integration checker | 10 | `integration-check.test.ts` 8/0; actual complete CLI exit 0 and the ticket-14 injected missing pair; checker is not imported by runtime |
| P51 legacy retirement | 11 global; partitions 01–10 | 11's removal audit (`framework/public.ts`/`core/protocol.ts` absent, no re-exports, no extension legacy imports); `import-boundary.test.ts`; final full test |
| P52 evidence attribution | each ticket's own handoff; 14 final validity | every record named here; this README is the final validity review |

No promise is orphaned: P01–P52 all have a named owner and a current evidence path. There is no
duplicate **case** claim: shared promises are split by the partitions the contract names, P46 is
split by harness, P47 by framework/OMP/pi, and each ticket's run record is its own. The same test
file can appear in more than one ticket's run (for example the dock's consumer regression was used
by the State batch for P15/P16 and by ticket 12 for P46/P47), but those are separate runs for
different promise partitions, not one run claimed twice. Ticket 14's full test adds current
whole-repository evidence and does not take over any earlier owner's scope.

### Evidence kinds stay separate

- **Static ownership/retirement**: `definition.test.ts`, `import-boundary.test.ts`,
  `integration-check.test.ts`, ticket 11's global removal audit and ticket 14's duplicate-owner
  injection. This is lexical/structural evidence; it does not prove runtime behavior.
- **Failure mechanisms**: the recorded fault injections (tickets 01–10 and 14) and the explicit
  failure-path cases (P11/P12, P26, P37/P38, P41/P42, P43/P45). Normal-path success is not used as
  a substitute.
- **Real mechanisms**: HTTP real loopback targets/proxies and whole-exchange timing; files with real
  temporary directories and independent child processes; configuration with real temporary files
  and the default reader/parser; model-cost storage processes. No in-process simulated lock or
  parameter-only timeout assertion stands in for these.
- **Real hosts**: tickets 12/13's five discovery entries on the isolated OMP 18.5.0 and pi 1.3.0;
  the current full test's real OMP dock load. The pi entry runs are reused with unchanged inputs,
  as stated above.
- **Declaration comparison is not behavior**: `check:integrations` compares declarations only and
  its own output says behavior correctness is not assessed. It is never cited as a behavior pass.

## P48 handoff

The prepared comparison, the exact before/after artifacts, the automatic field checks, the
reproduction steps and the single human question are in [`p48/README.md`](p48/README.md). The
normalized pi TUI diff is in [`p48/pi-tui-normalized-diff.txt`](p48/pi-tui-normalized-diff.txt).

**P48 remains unverified.** The user must confirm whether the existing terminal readability shows
no obvious regression. Until then this ticket is not complete and no local green result is presented
as P48.

## Executed / passed / failed / unverified / blockers

| Class | Items |
| --- | --- |
| Executed | `bun install --frozen-lockfile`; three fault injections + restores; `bun run typecheck` (pre-injection baseline, post-restore and post-suite); the full `bun run test`; `bun run check:integrations` (complete and injected); `bun run smoke:http-transport`; `bun run smoke:model-cost-data`; `bun run smoke:model-cost-detail-layout`; the warning-notice evidence probe; source/input comparison for 12/13; P48 normalized diff; this coverage review. |
| Passed | typecheck exit 0; full suite exit 0 with 1432 pass / 0 fail / 8447 expects / 158 files; `check:integrations` exit 0 with five complete/not-required pairs; HTTP smoke 23/0; model-cost data smoke 20/0; layout smoke 16 PASS / 0 FAIL; warning probe 7/7; all three injected faults detected and the restored checks green. |
| Failed | Nothing in the final restored tree. The three injected runs failed by design (directed delivery surface, duplicate State owner, missing OMP state-follow) and are recorded above, not hidden. |
| Unverified | **P48 readability** (human). Also not claimed: real provider credentials/accounts, real remote model responses, OMP TUI/physical-terminal readability (no OMP TUI was run), pi support outside 1.3.0, POSIX, other users, and any harness version not installed. |
| Genuine blockers | None for the executable scope. The only remaining acceptance item is the user's P48 judgement; it is a human decision, not an executable blocker. |

## Limits and boundaries retained

- The import/boundary suites are lexical alarms over `.ts` specifiers; computed specifiers, aliasing
  and non-`.ts` modules remain outside them. Ticket 14's duplicate-owner injection exercises the
  alarm, not a proof of complete coverage.
- `check:integrations` is a declaration comparison, not a behavior or support certification. The
  behavior evidence is the suites and real runs named above.
- The five-entry pi results are reused from ticket 13 because the relevant inputs are unchanged; they
  are not a fresh ticket-14 execution. The OMP results are reused from ticket 12 for the same reason,
  and the fresh full test independently re-loads the OMP entries through the harness dock.
- The full suite used the real `omp-bot` panel binary via `OMP_BOT_BINARY`; without it the
  connect-bot interop cases would be environment failures, not product failures (as tickets 09/10
  recorded). The pi runs used Node 22.19.0 because Node 24.18.0 hits the recorded Windows libuv
  assertion in the replaced-session codebase-tools run.
- No real provider credential, remote provider/panel service or formal loading configuration was
  used. The provider endpoint is the dock's local capture server with a fixture credential; the
  panel is the local `omp-bot` release binary with its own temporary configuration.
- The pi material is from pi 1.3.0 while the acceptance script's fixed version assertion expects
  1.2.0; that one failed check is the same in the baseline and current captures. No version support
  is claimed.
- The OMP P48 material is RPC frame text, not a TUI capture; its frames carry no terminal width.
  The baseline OMP raw frames were not retained, so the OMP comparison is against the baseline's
  recorded observations, not a byte diff.
- P48's warning level now has a current real-OMP RPC frame (the ticket-14 warning probe) and is
  covered by the feedback suites and the real-OMP period-switch observations; the baseline has no
  warning frame, and there is no pi TUI warning frame. Its level and text are material; its terminal
  styling is not part of the before/after visual comparison. The human readability question
  therefore concerns the displayed content that the material holds, and any limitation the user
  sees should be stated in their confirmation.

## Reproduction

```powershell
# toolchain and isolated installs used by the final run
bun install --frozen-lockfile
bun run typecheck
$env:OMP_BOT_BINARY = "E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe"
bun run test
bun run check:integrations
bun run smoke:model-cost-detail-layout

# ticket 12/13 real entries (reused inputs; rerun after any relevant source/fixture change)
$env:PI_NODE = "D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe"
$cli = "D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
bun scripts/pi-codebase-tools-smoke.ts --pi $cli
bun scripts/pi-model-cost-smoke.ts --pi $cli
# ...the remaining pi smokes and probes are listed in evidence/13-pi-real-entry-regression/README.md
```

The exact final log paths are `.cache/ticket14-logs/` (gitignored): `full-test.log`,
`typecheck-final.log`, `typecheck-post-suite.log`, `check-integrations-final.log`,
`check-integrations-post-suite.log` and the injection/restore logs.
