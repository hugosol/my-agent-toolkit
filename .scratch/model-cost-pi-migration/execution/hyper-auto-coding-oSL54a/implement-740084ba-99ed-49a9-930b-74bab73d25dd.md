# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "21-consumer-regressionmd-a05cd156-f97d-4708-9bd8",
  "head": "55290fc8a22393f017b64454258a5a55421415c7",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "21-consumer-regression (P50)",
  "status": "implemented (committed; not merged into pi-adapter)",
  "commit": "55290fc on hyper/model-cost-pi-migration/21-consumer-regression-8e5b8d-411dc288ea83 (parent = integration tip 8c86378)",
  "files": [
    "tests/harness-dock/consumer-regression.test.ts (new, 551 lines)",
    ".scratch/model-cost-pi-migration/evidence/21-consumer-regression.md (new)",
    ".scratch/model-cost-pi-migration/implementation/21-consumer-regression.md (status + criteria checked)"
  ],
  "behavior_delivered": "A first-in-repo cross-consumer / full-assembly regression on the real OMP host: the run-root copy of the deployed discovery root (framework/ + extensions/{connect-bot,codebase-tools,model-cost} + entrypoints/omp, only connect-bot's config.yaml replaced) is loaded in one isolated patched OMP 18.5.0 session, and the shared path is observed from the consumers' side: (1) the one process-wide marker area carries each bound consumer's own line and the third consumer's marker-less /budget neither adds nor clears a line; (2) one consumer's State is not another's (same field name `enabled` in both extensions); (3) a panel-refused activation of one consumer changes nothing of the others and the session keeps serving; (4) an aborted in-flight exchange reaches the armed consumer as the framework's `round_end` while the other consumer's activation survives; (5) a terminal provider failure (session auto-retry turned off via RPC) likewise reaches the consumer as `round_end` and leaves both activations and the next turn intact.",
  "criteria_evidence": {
    "consumer partitions enumerated + executed (State, observation/permission, marker, init/cleanup, cancel/failure termination, OMP + pi host paths)": "evidence §2 table maps each partition to shared implementation, consumers and executed suites",
    "final integration typecheck + test + serial real-host dock/smoke; source/fixtures unchanged during runs": "bun run typecheck exit 0; bun run test run#1 1198/2, run#2 1200 pass / 0 fail (128 files, 396.8s); dock partition run serially; pi smokes run serially after the suites; no source/fixture edits during any run",
    "commands/exits/failures/source state recorded; prior failures cited only on matching scenario+signature; no pi-pass substituting OMP regression": "evidence §5 table + §6; both hosts evidenced separately (OMP dock/codebase-tools/connect-bot vs pi smokes)",
    "clean-cutover review, all affected consumers migrated, old wiring/aliases/shims removed, no re-pinned internal duration or wiring-copy tests": "evidence §1/§3: removed admission/baseline modules have zero references tree-wide, entrypoints are 9-line re-exports, extensions consume the framework via the pre-existing convention; new test asserts only consumer-visible surfaces",
    "reuse of feature tickets' promise tests + this ticket's unique cross-consumer regression; P57 cases untouched": "no existing test modified; new file is additive",
    "P50 coverage S1/S2/S3": "S1 tests/framework 481/481; S2 dock 90/90 + codebase-tools 24/24 + connect-bot 142/142 + new file 3/3 + pi smoke 100/100; S3 carried by reused model-cost storage partitions 463/463 and dock persistence read-backs"
  },
  "verification_run": [
    {
      "command": "bun run typecheck",
      "exit": 0,
      "result": "no diagnostics"
    },
    {
      "command": "bun test tests/harness-dock/consumer-regression.test.ts",
      "exit": 0,
      "result": "3 pass / 0 fail, 61 expect(), 38.4s"
    },
    {
      "command": "bun test tests/framework (OMP_BOT_BINARY set)",
      "exit": 0,
      "result": "481 pass / 0 fail, 38 files, 39.4s"
    },
    {
      "command": "bun test tests/model-cost",
      "exit": 0,
      "result": "463 pass / 0 fail, 7.5s"
    },
    {
      "command": "bun test tests/connect-bot (OMP_BOT_BINARY set)",
      "exit": 0,
      "result": "142 pass / 0 fail, 76.7s"
    },
    {
      "command": "bun test tests/codebase-tools",
      "exit": 0,
      "result": "24 pass / 0 fail, 46.6s"
    },
    {
      "command": "bun test tests/harness-dock",
      "exit": 0,
      "result": "90 pass / 0 fail, 25 files, 264.0s"
    },
    {
      "command": "bun run test #1 (OMP_BOT_BINARY, normalized checkout)",
      "exit": 1,
      "result": "1198 pass / 2 fail (1200 tests, 128 files, 391.2s)"
    },
    {
      "command": "bun run test #2 (same tree/env)",
      "exit": 0,
      "result": "1200 pass / 0 fail, 128 files, 396.8s"
    },
    {
      "command": "bun scripts/pi-model-cost-smoke.ts",
      "exit": 0,
      "result": "pi 1.2.0: 100 checks passed / none failed, 28 isolated runs, 54.9s"
    },
    {
      "command": "bun scripts/pi-codebase-tools-smoke.ts",
      "exit": 1,
      "result": "pi 1.2.0: 25 checks passed, then stopped on the pre-existing teardown check"
    },
    {
      "command": "bun scripts/verify-omp-candidate.ts",
      "exit": 0,
      "result": "framework suite 481/0 against isolated 18.5.0; record written (baseCommit 8c86378, working-tree digest recorded)"
    }
  ],
  "failures": [
    {
      "where": "bun run test #1: tests/model-cost/pi-period-reset.test.ts:888 (P35 case, another ticket's ownership)",
      "signature": "savedDocument exhausted 1000 event-loop yields; file held {\"harnesses\":{}}",
      "classification": "load/timing flake — file re-run alone: 15 pass / 0 fail (273ms); absent in run #2"
    },
    {
      "where": "bun run test #1: tests/model-cost/session-span.test.ts:675 (P8/P14)",
      "signature": "readdirSync(root) expected [\"consumption.json\",\"consumption.json.lock\"], got [\"consumption.json\"]",
      "classification": "matches the previously recorded platform-timing observation for this expectation shape; file re-run alone: 20 pass / 0 fail (129ms); absent in run #2"
    },
    {
      "where": "bun scripts/pi-codebase-tools-smoke.ts: 'the session exits cleanly when its input closes'",
      "signature": "child exit 9, stderr 'Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\\\win\\\\async.c, line 94'",
      "classification": "pre-existing, scenario+signature+platform match the earlier record; listed explicitly, not marked as passing; the smoke's later phases (new_session/resume/switch) therefore did not run and remain unverified on the pi host"
    }
  ],
  "unverified_or_limits": [
    "Human-led checks P51 (efficiency/complexity), P52 (terminal readability), P53 (real account provider side) are outside this ticket and untouched",
    "No paid call, no credential read; pi-host codebase-tools phases after the known teardown failure not executed",
    "Real omp-bot panel evidence comes from connect-bot's own partition (OMP_BOT_BINARY = existing local release build); the new test's panel endpoint is a scripted local endpoint, not evidence about omp-bot",
    "Evidence is win32/x64, bun 1.4.2, isolated OMP 18.5.0 + two local patches, pi 1.2.0 only — no POSIX/other-version/cross-user claims",
    "Machine precondition for dock/patch assertions: the three CRLF-normalized files (bun.lock + two patch.diff) were restored to their committed LF blob bytes; they are content-identical to HEAD and were left normalized"
  ],
  "handoff_notes": "Worktree clean at 55290fc; nothing merged, no other ticket or workflow report touched, no reset. Integration agent should rebase/merge this branch and re-run bun run typecheck + bun run test on the merged tree; logs for every run above are under .cache/cr-logs/ (gitignored)."
}
