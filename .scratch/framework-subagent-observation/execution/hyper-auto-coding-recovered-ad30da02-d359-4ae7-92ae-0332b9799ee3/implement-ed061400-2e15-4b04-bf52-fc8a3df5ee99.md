# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "12-real-harness-reuse-verificationmd-6f9e69a5-17",
  "head": "ce7ba1b50b70b00bd95f483fbf536ff465197485",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "12-real-harness-reuse-verification",
  "status": "in-progress (implementation + evidence committed; not merged into hyper-tdd)",
  "branch": "hyper/framework-subagent-observation/12-real-harness-reuse-verificati-f0bd4a-e98ea402077c",
  "commit": "ce7ba1b50b70b00bd95f483fbf536ff465197485",
  "base": "3b0a1f7 (hyper-tdd tip at start)",
  "delivered": [
    "tests/framework/process-mode-reuse.test.ts: real OMP adapter proves no runtime dir/location record while given facts still reach the common observation interface; same given facts over the real local access adopt to the identical ObservedSession; real OMP and real pi adapters leave the same ObservedSession and session_context delivery (P24, P34).",
    "scripts/pi-subagent-smoke.ts: foreground check now waits (bounded) for both parent and child consumption records instead of assuming parent committed when the child record appears; no fixed sleep. Root-caused by bisecting ticket 10 trees; product commit ordering is intact.",
    "Evidence report: .scratch/framework-subagent-observation/evidence/12-real-harness-reuse-verification-evidence-2026-10-17.md plus logs/12-*.",
    "Ticket checklist and in-progress record updated."
  ],
  "acceptance": [
    {
      "criterion": "same-process no endpoint/locator + equivalent observation on in-process and real cross-process paths",
      "evidence": "process-mode-reuse.test.ts (3 pass) + session-observation-access.test.ts handed-to-nobody case; real OMP + pi foreground runs"
    },
    {
      "criterion": "actual OMP, pi foreground, pi background evidence incl. detail surface, pre-first-round reading, background pre-exit commit",
      "evidence": "OMP dock 107/107 real setWidget frames; pi foreground 14/14 incl. real detail widget; pi background 10/10 registration before first Round end + child-owned consumption record with provider exitCode 0"
    },
    {
      "criterion": "P34 behavior + maintainability audit, no third harness",
      "evidence": "new common-interface tests; audit: native mapping in adapters, communication/sources in framework, billing + business display rules in shared logic; no third harness. Finding recorded: both frontends retain near-duplicate terminal layout helpers (drawing-layer debt); not claimed as fully de-duplicated."
    },
    {
      "criterion": "contract scenario matrix (normal exit, reconnect, disconnect, nesting, concurrency, billing, failure/deadline)",
      "evidence": "mapped per promise to named deterministic cases in the report; real close-out smoke covers normal exit and 15s deadline/unwritten reporting; nested/concurrent real OMP/pi runs not separately run (marked unverified; deterministic coverage cited)"
    },
    {
      "criterion": "separate collection/notification, drawing and exit-wait measurements",
      "evidence": "publication/frame counts from observation-notice-frequency and redraw-merge suites (21 pass); real exit waits 12ms normal and 14,998ms at the 15,000ms deadline; front/background smokes 42.30s combined"
    },
    {
      "criterion": "source/env state, versions, OS, commands, exits, results, timings, logs; Windows != POSIX",
      "evidence": "report environment table + logs/12-environment.txt; POSIX and other versions explicitly unverified"
    },
    {
      "criterion": "isolated endpoints/storage, no paid model, no operator data",
      "evidence": "all real runs used isolated temp roots, capture endpoints and isolated OMP install"
    },
    {
      "criterion": "coordinated final gate: typecheck, full tests, real-host smokes",
      "evidence": "typecheck exit 0; dock 107 pass/0 fail/249.03s; OMP_BOT_BINARY bun run test 1364 pass/0 fail/7702 expect/153 files/441.82s; frozen files restored byte-identically; final pi foreground 14 obs and background 10 obs"
    }
  ],
  "verification": {
    "commands": [
      "bun run typecheck -> exit 0",
      "bun test tests/framework -> 582 pass / 0 fail / 2639 expect / 49 files",
      "bun test tests/model-cost -> 507 pass / 2 transient fail under load; failed files rerun alone 12/12 pass",
      "bun test tests/harness-dock (normalized frozen files) -> 107 pass / 0 fail / 1185 expect / 28 files / 249.03s / exit 0",
      "OMP_BOT_BINARY=... bun run test -> 1364 pass / 0 fail / 7702 expect / 153 files / 441.82s / exit 0",
      "bun scripts/pi-subagent-smoke.ts --foreground-only --expect-pi-version 1.3.0 -> 14 observations / exit 0",
      "bun scripts/pi-subagent-smoke.ts --background-only --expect-pi-version 1.3.0 -> 10 observations / exit 0",
      "bun scripts/pi-close-out-smoke.ts -> 11 observations / exit 0; 12ms normal, 14998ms deadline"
    ],
    "frozen_files_restored": {
      "bun.lock": "e7ed487b...",
      "viewed-session patch.diff": "057e01f6...",
      "codex-response patch.diff": "294b3727..."
    }
  },
  "unverified": [
    "POSIX carriers and other OMP/pi versions not run",
    "real pi truncation (open Round at disposal) not reproduced on a real host; deterministic coverage only",
    "real OMP nested/concurrent runs not separately executed",
    "human terminal readability judgement not performed",
    "P34 display-layer layout helper duplication remains as recorded debt",
    "final gate ran while another worktree's full suite was active (different .cache); both runs were 0 fail but a strictly exclusive quiet-window rerun is left to integration"
  ],
  "hygiene": [
    "no product source changed",
    "diagnostic worktree removed; no reset used",
    "other tickets/workflow reports untouched",
    "worktree clean after commit; handed off for integration"
  ]
}
