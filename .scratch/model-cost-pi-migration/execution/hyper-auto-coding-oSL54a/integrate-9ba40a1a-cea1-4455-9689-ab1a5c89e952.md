# integrate

```json
{
  "role": "integrate",
  "agent": "hyper-integrate",
  "agent_id": "integrate-13-deepseek-balancemd-3e7df710-62d8-4a",
  "head": "627ce4a2a0e9a98897a4d535d16aaf9813bbffca",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "13-deepseek-balance",
  "branch": "hyper/model-cost-pi-migration/13-deepseek-balance-98a6a9-411dc288ea83",
  "start_head": "79325364cb8f1f6a7a5301bc8ef364d735a0f18a",
  "end_head": "627ce4a",
  "sync_result": {
    "integration_commit": "79325364cb8f1f6a7a5301bc8ef364d735a0f18a",
    "head_equals_integration_tip_at_start": true,
    "git_diff_HEAD_pi-adapter_at_start": "empty",
    "merge_head_present": false,
    "conflict_markers": false,
    "worktree_clean": true,
    "conflicts_to_resolve": "none",
    "ticket_contribution_diff_stat": "git diff --stat ae4b779 7932536 = 4 files, 672 insertions, 13 deletions (scripts/pi-model-cost-smoke.ts, tests/harness-dock/capture-server.ts, tests/model-cost/provider-balance.test.ts, .scratch/.../evidence/13-deepseek-balance.md); zero OMP/framework production changes"
  },
  "commands": [
    {
      "command": "bun run typecheck",
      "cwd": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-kSea3G",
      "result": "exit 0, no diagnostics"
    },
    {
      "command": "bun run test",
      "cwd": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-kSea3G",
      "result": "exit 1 — 961 pass / 17 fail (107 files, 231.14s). All 17 classified as machine preconditions matching the ticket-02 sync: 5 connect-bot interop 'no binary is at C:\\Users\\hugos\\AppData\\Local\\Temp\\omp-bot\\backend\\target\\release\\omp-bot.exe'; 12 CRLF-checkout (10 '<patch.diff> touches no file' — 8 viewed-session + 2 codex-response-boundary; 1 baseline.test.ts:97 'bun.lock: recorded 9e9f4833… but found 7f5c82e6…'; 1 session-driver.test.ts:90 verifyLockfile 'expected true received false')"
    },
    {
      "command": "bun run test (normalized: CR stripped from host-patches/omp-18.5.0-viewed-session/patch.diff, host-patches/omp-18.5.0-codex-response-boundary/patch.diff, bun.lock; OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe)",
      "cwd": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-kSea3G",
      "result": "exit 0 — 1007 pass / 0 fail (107 files, 5810 expect() calls, 476.31s), includes all 23 tests/harness-dock files"
    },
    {
      "command": "git commit (record)",
      "cwd": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-kSea3G",
      "result": "627ce4a 'Record ticket 13's integration sync and the merged-tree global regression' — only .scratch/model-cost-pi-migration/implementation/13-deepseek-balance.md changed"
    },
    {
      "command": "git merge-tree --write-tree HEAD pi-adapter (read-only)",
      "cwd": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-kSea3G",
      "result": "single tree b578477604875a82e06f0cd6f4da87ca8becfe43, exit 0 — record merges back with no conflict"
    }
  ],
  "fixes_applied": "none — normalized global regression fully green; no ticket or sync regression found",
  "conflicts_resolved": "none",
  "worktree_state": "clean (git status --porcelain empty; git diff empty after restoring the 3 fixtures byte-for-byte, per-file sha256 identical to the pre-run CRLF checkout)",
  "fixture_normalization": {
    "files": [
      "host-patches/omp-18.5.0-viewed-session/patch.diff",
      "host-patches/omp-18.5.0-codex-response-boundary/patch.diff",
      "bun.lock"
    ],
    "pre_run_sha256_crlf": [
      "057e01f615c7a9ed736d76cf24ce95b0fca4f61fcc44efba63c378f0b978c478",
      "294b37277539486f0ccf6cf72452fd5198e0cc69b6b2e6945e42ffebbe7a4223",
      "7f5c82e6c1785f675b9183afbb8d5ee2ecf73278018a2d90857a3da7b1788883"
    ],
    "committed_lf_sha256": [
      "66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b",
      "4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d",
      "9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9"
    ],
    "restored": true,
    "committed": false
  },
  "logs": ".cache/test-logs/full-7932536-ascheckedout.log and .cache/test-logs/normalized-7932536.log (gitignored, not committed)",
  "notes": {
    "pi_adapter_advanced_during_round": "pi-adapter moved to b60e9b8 during this round (the 04-shared-storage integration sync record, .scratch/.../implementation/04-shared-storage.md +14). My results apply to the 7932536 tree only; cross-ticket merged-tree acceptance is deferred to the final independent gate.",
    "not_run_by_scope": "the ticket's real-host pi smoke (bun scripts/pi-model-cost-smoke.ts phaseBalance) was not rerun (real-machine smoke belongs to the final gate); real-account check is P53/ticket 24; pi adapter hermetic unit tests remain the ticket-02 gap",
    "untouched": "integration workspace E:/Developer/myhub/my-agent-toolkit not operated; no branch switch, no new worktree, no reset, no work discarded, no retro, no merge into pi-adapter"
  }
}
