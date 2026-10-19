# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "03-feedback-output-cutovermd-0d087142-4d2e-4e06-",
  "head": "11cab0b6792d2eebf0213b5359c1c87346137ab7",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "03-feedback-output-cutover",
  "status": "complete",
  "branch": "hyper/framework-capability-cutover/03-feedback-output-cutover-0257c1-e1e098c5b064",
  "commit": "11cab0b",
  "base_revision": "c6ccf83f7c2a03d9f8e944e07d2039917bd76d5e",
  "worktree": "clean",
  "delivered": [
    "FeedbackLevel/FeedbackTransport.notify remain canonical in framework/interface/feedback/index.ts; the OMP mapping now references FeedbackLevel instead of repeating the union.",
    "Each adapter keeps one actual UI/stderr output implementation: both noticeTransport and feedbackTransport reach the same publishNotice in adapters/omp/domain/feedback.ts and adapters/pi/domain/feedback.ts; NoticeTransport stays internal.",
    "model-cost's native terminal-result hook no longer constructs its own { notify } UI/stderr implementation. It uses the feedback channel handed to the implementation at initialization (InitializationDelivery.feedback), avoiding a new adapter public export; a no-init process records the receipt but has no operator channel.",
    "Feedback ownership check added to import-boundary.test.ts; framework docs/interface docs updated to state shared actual output with distinct responsibilities/lifetimes.",
    "Added OMP and pi actual-delivery tests for info/warning/error on UI and stderr, exact message/level/channel assertions, feedback key surface, and model-context invisibility."
  ],
  "acceptance": [
    {
      "criterion": "canonical Feedback ownership + info/warning/error through actual UI/stderr path",
      "evidence": "tests/framework/feedback-harness.test.ts, feedback-pi-harness.test.ts, extension-feedback.test.ts, import-boundary.test.ts; typecheck",
      "result": "pass"
    },
    {
      "criterion": "notifications absent from actual request/history; public feedback leaks no native transport or management",
      "evidence": "OMP feedback-harness 'a notice is never model context'; feedback keys [\"notify\"] in OMP and pi tests; pi entries remain empty",
      "result": "pass"
    },
    {
      "criterion": "framework notices and extension feedback use the same actual output per adapter, not a new forwarding entry",
      "evidence": "single publishNotice per adapter driven by both transports in OMP/pi tests; adapter-entry export attempt was rejected by definition.test.ts and reverted; model-cost reuses initialization feedback",
      "result": "pass"
    },
    {
      "criterion": "retained notice discarded at owner end while session_end dispatch notice remains visible",
      "evidence": "tests/framework/owner-capability.test.ts retained/dispatch cases; session-events.test.ts dispatch channel",
      "result": "pass"
    },
    {
      "criterion": "all notification consumers migrated; old exports retired; P52 handoff record",
      "evidence": "model-cost OMP/pi harnesses and runtime migrated; repository search finds no remaining inline extension UI/stderr notification producer; evidence/03-feedback-verification/README.md",
      "result": "pass for this partition"
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
      "command": "bun test tests/framework/{feedback-harness,feedback-pi-harness,extension-feedback,owner-capability,session-events,import-boundary}.test.ts",
      "exit": 0,
      "result": "47 pass / 0 fail, 159 expect calls"
    },
    {
      "command": "bun run test:framework",
      "exit": 0,
      "result": "616 pass / 0 fail, 2766 expect calls, 53 files"
    },
    {
      "command": "bun test tests/model-cost",
      "exit": 0,
      "result": "516 pass / 0 fail, 2892 expect calls, 51 files"
    },
    {
      "command": "bun run test:codebase-tools",
      "exit": 0,
      "result": "24 pass / 0 fail, 334 expect calls"
    },
    {
      "command": "OMP_BOT_BINARY=... bun test tests/connect-bot",
      "exit": 0,
      "result": "142 pass / 0 fail, 689 expect calls"
    },
    {
      "command": "bun test tests/harness-dock/model-cost-session-span.test.ts",
      "exit": 0,
      "result": "4 pass / 0 fail, 37 expect calls; real OMP 18.5.0, async-result notices"
    },
    {
      "command": "bun test tests/harness-dock/{model-cost-headless,binding-lifecycle}.test.ts",
      "exit": 0,
      "result": "9 pass / 0 fail, 90 expect calls; real OMP 18.5.0"
    },
    {
      "command": "bun scripts/pi-model-cost-smoke.ts",
      "exit": 0,
      "result": "100 checks passed, none failed; 28 isolated real pi 1.3.0 runs"
    },
    {
      "command": "bun scripts/pi-background-round-smoke.ts",
      "exit": 0,
      "result": "15 observations held; real pi 1.3.0; both subagent-notify results advanced Span"
    },
    {
      "command": "bun run check:integrations",
      "exit": 0,
      "result": "all five declarations complete; declaration matching only"
    }
  ],
  "fault_injection": [
    "Removing operatorFeedback assignment failed the model-cost native notice test with received [] (0 pass/1 fail); restored, 26 pass in that file.",
    "Adding a duplicate FeedbackLevel export to framework/core/protocol.ts failed the ownership check; restored, import-boundary 11 pass.",
    "The adapter-entry feedbackTransport export attempt failed definition.test.ts public-surface test; reverted in favor of the existing initialization feedback channel."
  ],
  "unverified": [
    "P48 terminal readability remains human-led for ticket 14; not claimed.",
    "No full bun run test, final five-entry regression, physical OMP/pi TUI, real provider/credential, or production loader configuration.",
    "The no-owner-initialization process path for model-cost native result notices was not driven by a real host run; receipt time is still recorded and no notice is stated there."
  ],
  "evidence_record": ".scratch/framework-capability-cutover/evidence/03-feedback-verification/README.md"
}
