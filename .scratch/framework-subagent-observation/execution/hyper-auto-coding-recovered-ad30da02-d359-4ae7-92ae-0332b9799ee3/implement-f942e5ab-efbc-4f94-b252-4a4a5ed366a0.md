# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "09-coalesced-sync-period-safetymd-f07fad11-1856-",
  "head": "1a9b74f8e0d964b607dceec6295ea790e567a0f6",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "09-coalesced-sync-period-safety",
  "status": "implemented, tested, committed on ticket branch (merge/close left to integration per triage policy)",
  "commit": "1a9b74f",
  "branch": "hyper/framework-subagent-observation/09-coalesced-sync-period-safety-ef5a9e-e98ea402077c",
  "behavior_delivered": "Session-commit hints now coalesce: the first hint of a turn schedules one read-only synchronization at the turn's end, same-turn hints join it, and hints arriving while that read is under way mark exactly one follow-up read after it (nothing is cleared before the promise it belongs to). The handler still settles after adoption, so close-out/disposal waits keep their meaning. Every read remains the existing synchronize: no write, lock, temp commit or re-initialization; same-period documents adopt only the disk baseline; an external period change still goes through accounting.periodSwitched(), dropping the closed period's in-flight consumption.",
  "files_changed": [
    "extensions/model-cost/shared-logic/runtime.ts",
    "extensions/model-cost/README.md",
    "tests/model-cost/coalesced-sync-period-safety.test.ts (new, 6 tests)",
    ".scratch/framework-subagent-observation/implementation/09-coalesced-sync-period-safety.md",
    ".scratch/framework-subagent-observation/implementation/evidence/09-coalesced-sync-period-safety-evidence-2026-10-17.md",
    ".scratch/framework-subagent-observation/implementation/evidence/logs/09-*.log (4)"
  ],
  "acceptance_evidence": [
    {
      "criterion": "multiple mergeable hints reduce syncs; final adopts independently given latest record; hints and syncs counted separately",
      "test": "coalesced-sync-period-safety.test.ts: several notices in one turn are one synchronization...",
      "evidence": "3 hints -> exactly 1 storage.synchronize call (call counter on runtime.storage), all three latest file records readable via runtime.view, storage.commit/load calls 0, file bytes and root entries unchanged"
    },
    {
      "criterion": "controlled pause of one sync; another real process commits and notifies; final record visible; no permanent miss",
      "test": "coalesced-sync-period-safety.test.ts: a notice delivered while a synchronization is paused...",
      "evidence": "real child process (tests/model-cost/support/store-child.ts, framework safe-file/lock) commits during the paused first read; second hint delivered while paused; after release exactly 2 reads occur and the child's record is visible in Owner view; file remains the child's bytes"
    },
    {
      "criterion": "same-period refresh adopts disk baseline only, no commit/discard/duplicate of local in-flight",
      "test": "coalesced-sync-period-safety.test.ts: the disk baseline is adopted while the in-flight amount stays local...",
      "evidence": "local saved 1 + in-flight 1; external 6; after refresh own(main)=2, inclusiveTotals=8, disk record stays 1, storage.commit calls 0, file bytes unchanged"
    },
    {
      "criterion": "external period switch keeps only new-period records; late hint does not bring back old accumulation",
      "test": "coalesced-sync-period-safety.test.ts: the closed period's in-flight consumption is dropped...",
      "evidence": "old-period in-flight 2; new document period-replaced with 3; after sync own(main)/roundTotals empty, accrued only new 3, file unchanged; late hint re-read still does not restore it; old Round end writes nothing (0 commits)"
    },
    {
      "criterion": "read-only sync takes no write lock, creates no temp commit, modifies no document; missing/invalid policy reused without re-initialization",
      "test": "read-only tests: real process reads with instrument; notice over absent/unusable document",
      "evidence": "instrumented child FS ops {reads: 2, publishes: 0, locks: 0}, file and directory unchanged; absent root notice creates no file and keeps original period; unusable document pauses and is left untouched; storage.load calls stay 0 across all hint-driven syncs"
    },
    {
      "criterion": "controlled concurrency/period boundaries, owning partition and affected consumers, typecheck, real process write + Owner-visible result",
      "test": "all 6 cases plus partition runs",
      "evidence": "real child-process commit adopted by Owner in the paused-sync case; see verification below"
    }
  ],
  "verification": [
    {
      "command": "bun test tests/model-cost/coalesced-sync-period-safety.test.ts",
      "result": "6 pass / 0 fail, 64 expect() calls (logs/09-focused-suite.log)"
    },
    {
      "command": "bun test tests/model-cost",
      "result": "509 pass / 0 fail, 51 files, ~19.1s (logs/09-model-cost-partition.log)"
    },
    {
      "command": "bun test tests/framework",
      "result": "579 pass / 0 fail, 48 files, ~58.7s (logs/09-framework-partition.log)"
    },
    {
      "command": "bun run typecheck",
      "result": "exit 0 (logs/09-typecheck.log)"
    }
  ],
  "fault_injections": [
    "removed end-of-turn deferral -> test 1 failed (3 same-batch hints became 2 reads)",
    "loop while -> if (drop in-flight hint) -> paused-sync test 2 failed (second read never happened)",
    "periodChanged no longer calls periodSwitched -> period test 4 failed on own(main) assertion",
    "same-period changed document wrongly calls periodSwitched -> test 3 failed on in-flight amount assertion",
    "all injections restored; final suite green and re-run after restore"
  ],
  "not_verified": [
    "No real pi/OMP host end-to-end session run; P18/P20's notice axis is covered in-process plus an independent real bun child process through the same safe-file/lock entry, not a harness adapter process. Harness disposal/rendering belongs to other tickets.",
    "Windows only; POSIX lock/rename behavior not exercised.",
    "Full-repository bun run test not run; left to integration stage per repo testing policy."
  ],
  "ticket_status": "Set to in-progress in the ticket file; evidence/logs and Comments added. Closing on merge belongs to the integration step."
}
