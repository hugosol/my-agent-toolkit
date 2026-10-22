# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "04-connect-bot-failure-and-admissionmd-2a37d9ff-",
  "head": "75e1da4493730e5ca93d411fa19491ef0c9ec695",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "04-connect-bot-failure-and-admission",
  "branch": "hyper/extension-startup-modes/04-connect-bot-failure-and-admis-1f4796-b21292ab9ce5",
  "commit": "75e1da4",
  "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-xwgFa8",
  "state": "implemented, tested, committed, tree clean; ticket Status set to in-progress with evidence recorded",
  "delivered": [
    "Automatic startup activation is the same command activation behind the same gate; a controlled register failure (non-2xx, 2xx non-receipt, missing onlineCount, rejected/timeout) leaves the declared value off, writes no State, schedules no heartbeat, makes one attempt, and reports the existing error text at error severity. /connect-bot and /connect-bot off remain the operator's normal operations.",
    "Subagent, no-UI and unregister-in-flight refusals are unchanged in an automatic binding; no register request or enabling effect.",
    "A session restored at process start takes the first-start policy: manual resume stays off; automatic resume attempts its register. A planted old {enabled:true} connect-bot:state payload is ignored in both modes; only a new valid receipt enables; no connect-bot:state record is written (memory persistence intact).",
    "Production fix: connect-bot's observed OMP surface leaves a missing `on` member as the surface stated it, so the framework's registration path reports 'registration failed' with the label set instead of the assembly throwing a raw TypeError first. Restores the pre-existing failing tests/framework/startup-requirements.test.ts case.",
    "Docs: connect-bot README failure/restore semantics and evidence; framework-capabilities startup-mode failure/memory clarification; ticket verification record with commands, results, fault-injection evidence, limitations and the human-led P19 preparation/command."
  ],
  "ownedCriteria": {
    "P19": "S1 tests/connect-bot/startup-modes.test.ts 'a failed startup registration keeps the existing close and feedback rules (P19)' (4 shapes) + S2 dock 'a refused automatic registration keeps the real session working and off (P19)' (real model turn, no state/heartbeat, manual connect+off).",
    "P22": "S2 dock 'a restored session's old enabled payload is not a connection (P22, P24)': manual and automatic independent-process --resume, planted {enabled:true}, refused register keeps off, only later valid receipt enables, connect-bot:state payload count unchanged (1 planted, 0 written).",
    "P23": "S1 'startup and command admission keep the existing refusal rules (P23)': no-UI start+command -> exact stderr twice, no request/widget/timer; subagent start+command -> silence and no request/widget/timer; unregister-in-flight activation -> '正在断开 herdr-bot 面板，请稍后重试', no second register.",
    "P24-connect-bot-partition": "S2 dock 'a session with no recorded value resumed at startup takes its mode's choice (P24)': automatic process resumes the manual session file, registers without a command for the restored session id, enables on the receipt, writes no State record; the old-payload case above is the other half. P24 overall also needs ticket 02's codebase-tools partition."
  },
  "commands": [
    {
      "command": "bun test tests/connect-bot/startup-modes.test.ts",
      "result": "15 pass / 0 fail, 139 assertions"
    },
    {
      "command": "bun test tests/framework/startup-requirements.test.ts",
      "result": "7 pass / 0 fail (was 6/1 failing before the assembly fix)"
    },
    {
      "command": "bun test tests/framework/implementation-startup.test.ts",
      "result": "6 pass / 0 fail"
    },
    {
      "command": "bun test tests/connect-bot",
      "result": "151 pass / 5 fail, all 5 the externally-recorded real-panel failures: herdr-bot rejects test TOML with 'missing field herdr' (framework/docs/harness-support.md:124). Run before the assembly diagnostic fix; focused S1 + framework startup suites rerun green after it."
    },
    {
      "command": "bun test tests/harness-dock/connect-bot-startup.test.ts",
      "result": "6 pass / 1 fail. The failure is the pre-existing real-panel case (P16/P18, external 'missing field herdr'). First run was 4/3: two failures were a bug in this ticket's new sessionIdOf helper (title-slot first line), fixed; the two cases then passed individually and the final full run is 6/1. Our 3 new cases pass."
    },
    {
      "command": "bun test tests/harness-dock/connect-bot-startup.test.ts -t \"a refused automatic registration\"",
      "result": "1 pass / 0 fail"
    },
    {
      "command": "bun test tests/harness-dock/connect-bot-startup.test.ts -t \"old enabled payload|no recorded value resumed\"",
      "result": "2 pass / 0 fail"
    },
    {
      "command": "bun run typecheck",
      "result": "exit 0 (tsc --noEmit + authoring 58 files, 0 diagnostics)"
    },
    {
      "command": "bun run check:integrations",
      "result": "exit 0 (structural analysis only, as the checker states)"
    }
  ],
  "faultInjection": [
    "Temporarily made readRegisterOutcome accept any 2xx: the '2xx answer that is not the registered receipt' S1 case failed. Restored, 15/15 green.",
    "Temporarily made the failure branch write enabled=true: all 4 S1 failure cases failed. Restored, 15/15 green."
  ],
  "limitations": [
    "Human-led (not verified): actual OMP terminal display of the P19 failure line and absence of the ◐ connectBot marker. Automated evidence is the adapter notify/setWidget frames + panel requests. Prepared command and expected observation are in the ticket Verification section (stop herdr-bot, start the isolated TUI with only entrypoints/omp-auto/connect-bot.ts).",
    "External: the available herdr-bot release rejects the test TOML ('missing field herdr'), so all real isolated-panel cases in the touched suites fail to start. Pre-recorded in framework/docs/harness-support.md; not evidence against this change. No real-panel interoperability is claimed by this ticket.",
    "The ticket's tests/connect-bot partition record predates the assembly diagnostic fix; no other partition test reaches the no-subscription surface the fix touches, and the focused suites are green after it."
  ],
  "handoff": {
    "integrationNote": "Independent integration subagent can take the worktree; no merge or integration-branch action was performed by me. The ticket file already carries the verification record and is Status: in-progress (merge should close it). Suggested final checks: bun run typecheck, bun run check:integrations, bun test tests/connect-bot tests/framework/startup-requirements.test.ts, and one dock run of tests/harness-dock/connect-bot-startup.test.ts (expect 6 pass and only the external real-panel failure).",
    "constraintsRespected": "No other ticket files, workflow reports, integration branch or integration worktree were touched; no retro or extra ticket dispatch; no reset."
  }
}
