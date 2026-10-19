# Ticket 03 — Unified feedback output: verification evidence

Source state: branch `hyper/framework-capability-cutover/03-feedback-output-cutover-0257c1-e1e098c5b064`,
base revision `c6ccf83f7c2a03d9f8e944e07d2039917bd76d5e` (the merged ticket 02 cutover), plus this
ticket's working changes. Dependencies: `bun install --frozen-lockfile` (13 packages); `bun.lock`
sha256 `e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2, pi 1.3.0. The OMP
docks used the recorded isolated `@oh-my-pi/pi-coding-agent@18.5.0` install. These three dock files
(`model-cost-session-span`, `model-cost-headless`, `binding-lifecycle`) call
`ensureIsolatedHarness(record)` and do not apply the optional viewed-session patch. The runs used the
source above and finished before this record was written.

## Delivered behavior

- `FeedbackLevel` and `FeedbackTransport.notify` remain canonical in
  `framework/interface/feedback/index.ts`. The OMP mapping now names `FeedbackLevel` instead of
  repeating the union.
- Each adapter keeps its one actual output implementation. `publishNotice` is the only UI/stderr
  mapping in `adapters/omp/domain/feedback.ts` and `adapters/pi/domain/feedback.ts`; the framework
  `NoticeTransport.warn` wrapper and the extension `FeedbackTransport` both reach it. `NoticeTransport`
  itself remains internal.
- `model-cost`'s native terminal-result hook no longer constructs its own `{ notify }` UI/stderr
  implementation. The runtime records the feedback channel the framework hands it at initialization
  (`InitializationDelivery.feedback`, the adapter's actual output) and uses it for a receipt's notice.
  A process with no owner initialization has no operator channel; the receipt still records its time
  and states no notice there. Real-host runs below exercise the owner process.
- The public feedback object delivered to an extension is still only `{ notify }`; no native context,
  marker transport, persistence seam or framework notice channel is reachable through it.
- Framework and adapter docs now state the approved rule: shared actual output, distinct upper-level
  responsibilities and lifetimes, no internal notice interface exposed.

## Acceptance mapping

| Ticket acceptance | Promise / partition | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| `FeedbackLevel` / `FeedbackTransport.notify` canonical ownership; info/warning/error all through the actual path, UI notification vs headless stderr | P01, P31 (Feedback partition) | `tests/framework/feedback-harness.test.ts` (actual OMP adapter binding; exact `{ message, type }` for info/warning/error and exact `probe info\nprobe warning\nprobe error\n` on headless stderr); `tests/framework/feedback-pi-harness.test.ts` (actual pi adapter delivery, same three levels and stderr fallback); `tests/framework/extension-feedback.test.ts` (mixed error/warning/info order through the framework port); `tests/framework/import-boundary.test.ts` “Feedback's declarations are published only by the Feedback capability interface”; `bun run typecheck` exit 0 | Pass |
| Actual request/history: notices never enter model context; public feedback exposes no native transport or management | P05, P31 (Feedback partition) | OMP `feedback-harness.test.ts` “a notice is never model context”: the probe's notices are absent from the only appended State entry and from the run contribution, whose content is the declared prompt text; `Object.keys(delivery.feedback)` is `["notify"]`. pi `feedback-pi-harness.test.ts`: same key set, no `entries` recorded, stderr/UI only. `owner-capability.test.ts` keeps the capability handle's own shape (`feedback`, `state`) | Pass |
| Both kinds of notification use each adapter's same actual output, not a new forwarding entry | P32 | One `publishNotice` per adapter, driven by both `noticeTransport` and `feedbackTransport` in `feedback-harness.test.ts` and `feedback-pi-harness.test.ts` with the same native context: identical UI notification at `warning` and identical stderr lines. An attempted adapter-entry re-export was rejected by the existing public-surface test (`definition.test.ts` expects only `ompAdapter`) and was reverted; no public helper was added. `model-cost` now reuses the initialization channel instead of constructing an output. | Pass |
| Same-Owner end: retained notice discarded, `session_end` dispatch notice still visible; lifetimes not conflated | P14 | `tests/framework/owner-capability.test.ts`: “feedback through a capability retained for a retired owner reaches nobody”, “the handler announces the switch on it, and the channel is closed when the dispatch ends”, “the capability that same delivery hands out is inert, and is not that channel”; `tests/framework/session-events.test.ts` carries the dispatch channel on `session_end`. The model-cost result notice uses the process's initialization channel, not an Owner capability, so it is not part of this retained/dispatch pair. | Pass |
| All notification consumers migrated; old exports/legacy paths removed; reuse feedback, Owner lifecycle and actual UI/headless paths; message content, level, channel and model-invisibility evidence | P51, P52 (03 handoff) | Repository search finds no remaining inline `ctx.ui.notify` / `process.stderr.write` notification producer in `extensions/`; only the two adapter `publishNotice` functions and the intentional framework wrappers remain. `model-cost` harnesses and the model-cost runtime were migrated; `bun run typecheck`; all four affected partitions plus the real OMP/pi runs below. Terminal readability is not claimed here (P48). | Pass for this partition |

## Red → green and fault injection

| Slice | Evidence | Result |
| --- | --- | --- |
| Public surface must stay the assembly function only | While the adapter-entry `feedbackTransport` export existed, `tests/framework/definition.test.ts` “the OMP entry exposes the assembly function and nothing else at runtime” failed with `["feedbackTransport","ompAdapter"]`. The export was removed; the initialization feedback channel is used instead. | Red observed, then green |
| Model-cost native notice uses the initialization feedback channel | Temporarily removing `operatorFeedback = delivery.feedback` made the new `session-span.test.ts` case “a receipt with no usable clock time states one error on the initialization feedback channel” fail with `received []` (0 pass / 1 fail). The assignment was restored; the same command is green (26 pass / 0 fail). | Red observed, then green |
| Feedback declaration ownership | Temporarily adding `export type FeedbackLevel = "info"` to `framework/core/protocol.ts` made the new ownership check fail with `framework/core/protocol.ts declares FeedbackLevel outside the Feedback capability interface` (0 pass / 1 fail). The declaration was removed; `import-boundary.test.ts` is green (11 pass / 0 fail). | Red observed, then green |
| Warning-level and pi coverage | The code already implemented all three levels and the pi mapping; the new tests close an evidence gap rather than manufacture a behavior change. No product red was produced for these two cases. | Coverage added; green |
| Dispatch-scoped delivery channel | An early version of the pi test called `delivery.feedback.notify` after the dispatch returned and observed no output; that is the framework's dispatch wrapper doing its job. The test now drives the channel inside `onSession`, while the handler is running. | Observation recorded; not a product failure |

## Commands and results

All runs used the source above.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages installed; `bun.lock` unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `bun test tests/framework/{feedback-harness,feedback-pi-harness,extension-feedback,owner-capability,session-events,import-boundary}.test.ts` | 0 | **47 pass / 0 fail**, 159 expect() calls, 6 files |
| `bun run test:framework` | 0 | **616 pass / 0 fail**, 2766 expect() calls, 53 files |
| `bun test tests/model-cost` | 0 | **516 pass / 0 fail**, 2892 expect() calls, 51 files |
| `bun run test:codebase-tools` | 0 | **24 pass / 0 fail**, 334 expect() calls, 7 files |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 0 | **142 pass / 0 fail**, 689 expect() calls, 18 files |
| `bun test tests/harness-dock/model-cost-session-span.test.ts` | 0 | **4 pass / 0 fail**, 37 expect() calls; real isolated OMP 18.5.0, real `async-result` terminal notices, real widget span |
| `bun test tests/harness-dock/{model-cost-headless,binding-lifecycle}.test.ts` | 0 | **9 pass / 0 fail**, 90 expect() calls; real isolated OMP, headless notices and binding lifecycle |
| `bun scripts/pi-model-cost-smoke.ts` | 0 | **100 checks passed, none failed**, 28 isolated real pi 1.3.0 runs; includes the no-subagent command notice path |
| `bun scripts/pi-background-round-smoke.ts` | 0 | **15 observations held**; real pi 1.3.0; both delivered `subagent-notify` terminal results advanced the main Session span before another main Turn ended |
| `bun run check:integrations` | 0 | all five discovery declarations complete; declaration matching only, behavior not assessed |

The connect-bot partition needs the external `omp-bot` panel binary; without `OMP_BOT_BINARY` the same
suite exits 1 on five interop cases because no binary is at its default path. That is an environment
precondition, not a product failure.

## P48 status

**P48 remains unverified.** This ticket did not make a readability judgment. The automated runs above
assert exact message text, level and channel; the existing P48 baseline material and the final
readability comparison remain ticket 14's human handoff. The OMP dock reads `setWidget`/notify frames
rather than a physical terminal, and the pi smokes read RPC frames rather than a TUI.

## Scope limits

- This ticket did not run the full repository `bun run test`, `bun run check:integrations`, the final
  five-entry regression, or a physical TUI acceptance run; those remain tickets 12/14.
- No real provider, credential, formal installation or production loader configuration was touched.
  OMP requests went to the dock's local capture endpoint; pi runs used isolated temporary roots.
- The model-cost native result notice is stated on the process's initialization feedback channel. A
  process with no owner initialization (for example, a spawned-session process that only serves an
  inherited session) has no operator channel there; the receipt still records its time and the notice
  is not stated. This path was not driven by a real host run in this ticket.
- Warning-level feedback is covered at both adapter mappings and the framework delivery; the
  model-cost and codebase-tools consumers were exercised by their partitions and the real OMP docks.
- `NoticeTransport` still has no production caller in the current framework; it remains the internal
  upper-level wrapper the decision allows, and the shared-output evidence drives both wrappers through
  the adapter mapping.
