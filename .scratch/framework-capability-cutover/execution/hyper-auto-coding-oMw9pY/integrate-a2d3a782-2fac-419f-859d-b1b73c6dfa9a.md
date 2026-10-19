# integrate

```json
{
  "role": "integrate",
  "agent": "hyper-integrate",
  "agent_id": "integrate-12-omp-real-entry-regressionmd-97aa8ed",
  "head": "8aa4d15a4c46648ea17a04b557417eded5ba3f27",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "12-omp-real-entry-regression",
  "status": "integration-acceptance-passed",
  "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-fAyvCW",
  "branch": "hyper/framework-capability-cutover/12-omp-real-entry-regression-9d4725-e1e098c5b064",
  "head": "8aa4d15a4c46648ea17a04b557417eded5ba3f27",
  "syncCheck": {
    "headMatchesHostIntegrationCommit": true,
    "mergeParents": [
      "a3166c51e4dd14240dd4d9e0017d58fba1f3e410",
      "baf2ae6d3777d3173bbfd8e4e0688007bbe973b8"
    ],
    "diffVsFirstParent": "22 added files, all under .scratch/framework-capability-cutover/evidence/12-omp-real-entry-regression/ (README, p48 material, 3 probe scripts, raw outputs); no production/test/docs/config changes",
    "diffVsTicketBranch": "empty (merged tree equals ticket branch baf2ae6)",
    "conflicts": "none",
    "workingTree": "clean"
  },
  "commands": [
    {
      "command": "bun run typecheck",
      "cwd": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-fAyvCW",
      "exit": 0,
      "observed": "tsc --noEmit produced no diagnostics"
    },
    {
      "command": "OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun run test",
      "cwd": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-fAyvCW",
      "exit": 0,
      "observed": "1432 pass / 0 fail, 8447 expect() calls, 158 files, 448.44s",
      "log": ".cache/integration-test.log"
    }
  ],
  "fixes": "none required; no conflicts and global tests passed on first run",
  "commits": "none created (no changes needed)",
  "notRun": [
    "bun run check:integrations",
    "real-entry probe smokes",
    "cross-ticket final gate"
  ],
  "notes": "OMP_BOT_BINARY was set to the real panel binary because this worktree sits outside the repo's sibling layout, so the test fallback path would not resolve; this mirrors the implementation report's connect-bot invocation. Full suite includes all five partitions and tests/harness-dock (29 dock files), so no separate dock run was needed.",
  "blockers": []
}
