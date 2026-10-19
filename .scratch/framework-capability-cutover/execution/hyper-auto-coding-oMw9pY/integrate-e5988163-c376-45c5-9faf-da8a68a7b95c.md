# integrate

```json
{
  "role": "integrate",
  "agent": "hyper-integrate",
  "agent_id": "integrate-02-prompt-marker-cutovermd-209cd987-5d",
  "head": "c6ccf83f7c2a03d9f8e944e07d2039917bd76d5e",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "02-prompt-marker-cutover",
  "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-FY0ePD",
  "branch": "hyper/framework-capability-cutover/02-prompt-marker-cutover-adfbcc-e1e098c5b064",
  "status": "complete",
  "sync_check": {
    "head": "c6ccf83f7c2a03d9f8e944e07d2039917bd76d5e",
    "hyper_tdd": "c6ccf83f7c2a03d9f8e944e07d2039917bd76d5e",
    "head_parents": [
      "b6f0c21abf27a20a5237474244a015ee4e7dbc52",
      "1416a046944a0f45a7f8cdd70c3fca49b8293916"
    ],
    "head_subject": "Merge ticket branch hyper/framework-capability-cutover/02-prompt-marker-cutover-adfbcc-e1e098c5b064",
    "tree_diff_vs_hyper_tdd": "none (git diff --quiet hyper-tdd HEAD exited 0)",
    "conflict_markers": "none",
    "worktree_status": "clean (git status --porcelain empty before and after the run)"
  },
  "commands": [
    {
      "command": "bun run typecheck",
      "exit": 0,
      "result": "tsc --noEmit; no diagnostics"
    },
    {
      "command": "OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun run test",
      "exit": 0,
      "result": "1406 pass / 0 fail / 7861 expect() calls; 157 files; 460.03 s",
      "log": "C:/Users/hugos/AppData/Local/Temp/hyper-integrate-02-full-1792406524.log"
    }
  ],
  "fixes": "none required; no source changes, no conflict resolution, no new commits",
  "post_run_state": {
    "git_status_porcelain": "empty",
    "bun_lock_sha256": "e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f",
    "host_patch_line_endings": "all 8 host-patches files at committed LF bytes"
  },
  "verification_scope": "project-global suite only, as assigned; complex scripts, real-host smoke, and cross-ticket final acceptance were not run",
  "blockers": [],
  "note": "First merge-in succeeded and the host's integration commit c6ccf83 is already the current dev branch tip; because no fixes were needed the branch remains at c6ccf83 and is ready for the host's queued merge."
}
