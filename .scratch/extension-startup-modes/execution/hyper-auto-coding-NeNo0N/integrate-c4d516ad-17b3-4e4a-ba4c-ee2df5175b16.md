# integrate

```json
{
  "role": "integrate",
  "agent": "hyper-integrate",
  "agent_id": "integrate-01-codebase-tools-startupmd-019a6913-f",
  "head": "83ffa0d8c1694f291fabff98bb51e0c19da3b898",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "01-codebase-tools-startup",
  "status": "integration acceptance complete; worktree clean; branch ready for host merge",
  "branch": "hyper/extension-startup-modes/01-codebase-tools-startup-31d6d5-b21292ab9ce5",
  "head": "83ffa0d",
  "integration_sync": {
    "merged_tip": "09483946e091a84570bff1a16da39808215726b6",
    "tree_equal_to_ticket_tip": true,
    "ticket_tip": "dc21eeb",
    "detail": "git diff --stat dc21eeb 0948394 is empty; both trees are f8e9c512cdb53d34a767a078743e0c6a57c2b155; git ls-files -u = 0; no MERGE_HEAD; no conflicts to resolve."
  },
  "commits": [
    {
      "sha": "1822f40",
      "message": "Copy startup policy documents into the dock's deployed discovery root",
      "reason": "tests/harness-dock/consumer-regression.test.ts copied entrypoints/omp but not entrypoints/startup, so codebase-tools refused binding in the copied deployment and /codebase-tools became a model prompt. Added path.join('entrypoints','startup') to DEPLOYED_TREES."
    },
    {
      "sha": "83ffa0d",
      "message": "01: record the integration sync and the merged-tree full regression",
      "reason": "ticket record of this integration round and the evidence."
    }
  ],
  "commands": [
    {
      "command": "git status --porcelain=v1 -b",
      "outcome": "clean; only branch line"
    },
    {
      "command": "bun run typecheck",
      "outcome": "exit 0 (tsc --noEmit + check:authoring: 55 files, 3 declarations, 0 diagnostics)"
    },
    {
      "command": "bun test tests/harness-dock/consumer-regression.test.ts (before fix)",
      "outcome": "0 pass / 3 fail"
    },
    {
      "command": "bun test tests/harness-dock/consumer-regression.test.ts (after fix)",
      "outcome": "3 pass / 0 fail, 61 expect, 41.33s, exit 0"
    },
    {
      "command": "bun test tests/harness-dock/baseline.test.ts (after sibling junctions)",
      "outcome": "6 pass / 0 fail, exit 0"
    },
    {
      "command": "bun test tests/connect-bot (HERDR_BOT_BINARY=herdr-bot@30a5bae build)",
      "outcome": "141 pass / 0 fail, 687 expect, 77.06s, exit 0"
    },
    {
      "command": "bun test tests/model-cost",
      "outcome": "524 pass / 0 fail, 51 files, exit 0"
    },
    {
      "command": "bun test tests/harness-dock/model-cost-persistence.test.ts tests/harness-dock/session-recovery.test.ts",
      "outcome": "8 pass / 0 fail, exit 0 (they had failed under the first full-suite load)"
    },
    {
      "command": "bun run test (final, HERDR_BOT_BINARY=old build, sibling junctions in place)",
      "outcome": "1541 pass / 0 fail / 9193 expect / 170 files / 515.73s / exit 0"
    }
  ],
  "environment": {
    "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-SKIWZY",
    "junctions_created_outside_repo": [
      "C:/Users/hugos/AppData/Local/Temp/oh-my-pi -> E:/Developer/myhub/oh-my-pi",
      "C:/Users/hugos/AppData/Local/Temp/my-omp-toolkit -> E:/Developer/myhub/my-omp-toolkit",
      "C:/Users/hugos/AppData/Local/Temp/herdr-bot -> E:/Developer/myhub/herdr-bot"
    ],
    "herdr_bot_binary": "C:/Users/hugos/AppData/Local/Temp/herdr-bot-old-30a5bae/target/release/herdr-bot.exe (built from herdr-bot 30a5bae, parent of a3031d3 which introduced the required [herdr] section)",
    "why": "tests/connect-bot/support/herdr-bot.ts still writes the pre-[herdr] TOML shape; current sibling HEAD 4dc941c rejects it. This is an environment choice, not a repo change."
  },
  "pre_existing_not_fixed": {
    "test": "tests/model-cost/harnesses/pi/pi-disposal-round-close.test.ts > leaving a session for another one closes no Round",
    "evidence": "Fails when that file is run alone, but passes in the full tests/model-cost partition (524/0) and in the final full-suite run (1541/0). It also fails identically on a snapshot of base 22bb937 (before ticket 01), so it is not introduced by this merge. Not modified."
  },
  "unverified": [
    "P8/P9/P18/P19 terminal marker/feedback display remains human-led and unconfirmed.",
    "Complex scripts, real-machine smoke, and cross-ticket overall acceptance were intentionally left to the final independent gate."
  ],
  "constraints_respected": [
    "did not operate the integration workspace E:/Developer/myhub/my-agent-toolkit",
    "did not switch branches or create a worktree",
    "did not reset or discard work",
    "did not call retro",
    "did not merge the integration branch"
  ]
}
