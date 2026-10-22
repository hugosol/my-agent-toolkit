# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "01-codebase-tools-startupmd-be146433-a016-4592-9",
  "head": "dc21eebd55c0bc02dd25eaa62adaae1c9a20c8a1",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "01-codebase-tools-startup",
  "status": "implementation complete, committed; ticket status in-progress pending integration/human marker check",
  "commit": "dc21eeb (branch hyper/extension-startup-modes/01-codebase-tools-startup-31d6d5-b21292ab9ce5; clean worktree)",
  "delivered_behavior": {
    "framework": "ExtensionAssembly.startupPolicy selects a YAML startup policy document; framework/core/startup.ts reads only the loaded extension's block (enabled: boolean), refuses a missing/illegal document as a configuration binding failure on the same loading-time path as extension config, and caches per file per process. StateStore.reconcile applies the choice once per process at the first owner session start: a valid history value (true or false) always wins, an enabling choice is recorded through the ordinary session-entry medium, the declared default writes nothing, and the choice is a target, never a toggle. No new runtime/startup runtime; initialize waiting is untouched; codebase-tools needed no business initializer.",
    "entrypoints": "Original entrypoints remain manual mode (pure re-exports). New entrypoints/omp-auto/codebase-tools.ts and entrypoints/pi-auto/codebase-tools.ts are pure re-exports of new mode assemblies. Both modes share omp-assembly.ts/pi-assembly.ts (one native mapping, one definition); mode files only name the policy document and (pi) the mode's child entry. Policy documents: entrypoints/startup/manual.yaml (codebase-tools: disabled) and auto.yaml (enabled). No new profile/env parameter.",
    "docs": "framework/docs/framework-capabilities.md new section + symbol/option/State rows; framework/README.md; framework/GLOSSARY.md (startup policy document, mode, config-switch boundary); extensions/codebase-tools/README.md modes/commands/semantics + H1b automatic-mode visual acceptance."
  },
  "criterion_evidence": {
    "P2 codebase-tools pi/OMP manual entry + original operations": "S2: tests/codebase-tools/startup-modes-dock.test.ts manual case loads the manual entrypoint file and runs /codebase-tools on->off (notifications, marker frames, persisted {enabled:true},{enabled:false}); existing codebase-tools dock suites (command-toggle/marker-lifecycle/init-injection/session-boundaries) pass in the 35-test partition. pi: bun scripts/pi-codebase-tools-smoke.ts manual mode, 25 behavior checks pass.",
    "P3 automatic entry enables without a command": "S1 automatic test; S2 OMP automatic test (first captured model request carries the init, no notify frame); pi --mode auto smoke first run carries the contribution.",
    "P4 same policy content, independent expectations": "S1 swapped documents: manual-named doc stating true starts enabled and records it; auto-named doc stating false stays off and records nothing, each checked against its document's own value. S2 host runs check the shipped defaults independently (manual false, auto true).",
    "P8 no valid history manual false / auto true": "S1 manual and automatic default tests (State, persisted payloads, marker renders, contribution); S2 OMP automatic (state entry, marker at start, init on first request) and manual (no contribution, no state entry, empty marker); pi auto smoke (31 checks). Human terminal marker display deliberately left unverified.",
    "P10 explicit target, not toggle": "S1 history true + choice true stays enabled, no extra persistence, run contributes; S2 OMP auto resume stays enabled and writes no second record; pi auto resume phase asserts the same and that the next command turns it off.",
    "P11 sync State before first prompt planning": "Real first model request captured on OMP and pi auto: request carries the init; the session-entry record precedes the first user message in the journal.",
    "P12 post-startup command toggle": "S1 command off after startup; S2 OMP auto command off/on with notifications, marker cleared/restored, state records, contribution changes; pi auto phase 2; resume case turns it off from the restored value.",
    "P26 no reapplication / no override / no extra startup write": "S1: command off, then a new owner start with no history records nothing and stays off; repeated session_facts and two runs add nothing. S2: OMP new_session after command off has no startup write and no contribution; pi auto new_session phase. Fault injection (removing the once flag) made both the S1 and S2 P26 tests fail, then restored green.",
    "P33 explicit entry statically selects the policy with normal host params": "OMP dock runs use the same host parameters and differ only in the entry file (-e manual entry vs auto entry) and observe the corresponding defaults; pi smoke --mode selects the entrypoint; production reads no profile/env selector.",
    "P36 no new State payload in manual default-off run": "S1 no-record test; S2 OMP manual session with only a turn has zero codebase-tools entries; existing clean-session dock test; pi manual phase-1 no-entry assertion."
  },
  "verification_run": {
    "bun run typecheck": "pass (tsc + check:authoring 55 files / 0 diagnostics)",
    "bun run check:integrations": "exit 0 (structural analysis)",
    "bun test tests/codebase-tools": "35 pass / 0 fail across 9 files (includes new 7-test S1 and 4-test S2 suites)",
    "bun test tests/framework tests/authoring tests/integrations": "726 pass / 0 fail across 63 files",
    "bun test tests/model-cost": "524 pass / 0 fail across 51 files (changed adapter/binding consumers)",
    "bun test tests/connect-bot": "136 pass / 5 fail; all 5 are real-panel interop cases failing only because the external herdr-bot.exe binary is absent (unrelated to this change)",
    "bun scripts/pi-codebase-tools-smoke.ts --mode auto": "pi 1.3.0, 31 checks passed, none failed",
    "bun scripts/pi-codebase-tools-smoke.ts (manual)": "25 behavior checks passed; the process-exit check fails with a libuv assertion (UV_HANDLE_CLOSING, exit 9) on pi 1.3.0 + Node 24.18.0 — the same failure was reproduced on an unmodified HEAD worktree, so it is a pre-existing environment/version issue",
    "fault injection": "once-per-process flag removed -> S1 and S2 P26 tests failed as intended; restored and green"
  },
  "unverified_or_limits": [
    "Human-led marker/feedback display (P8/P9 visual) was not observed; isolated commands and a six-step scenario list are prepared in extensions/codebase-tools/README.md H1b and the ticket Comments, and remain unverified until the user confirms.",
    "The pi manual smoke cannot complete its later phases here because the script stops at the pre-existing exit-code assertion; all manual behavior assertions that ran passed, and the OMP real-host manual coverage is complete.",
    "Installed pi is 1.3.0 while the smoke's expectations were written for 1.2.0 (recorded by the script as a run note).",
    "Business-effect startup activation for connect-bot (its own ticket) is intentionally not wired here; this ticket's shared rule records the declared session-entry value only, with no speculative implementation hook."
  ],
  "handoff": "Worktree committed and clean; no other tickets or workflow reports modified; integration branch was not touched."
}
