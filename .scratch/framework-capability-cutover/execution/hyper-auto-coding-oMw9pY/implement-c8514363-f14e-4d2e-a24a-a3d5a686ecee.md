# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "01-state-interface-cutovermd-b789e6bb-bc59-4522-",
  "head": "467a822b1cbd6006d616e20d3e897b3ca62b1c45",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "status": "completed",
  "ticket": ".scratch/framework-capability-cutover/implementation/01-state-interface-cutover.md",
  "branch": "hyper/framework-capability-cutover/01-state-interface-cutover-094c18-e1e098c5b064",
  "commit": "467a822 (Cut over State declarations to the capability interface)",
  "worktree": "clean; ticket implementation committed; integration branch not touched or merged",
  "delivered": [
    "StateDeclaration, StatePersistence and StateInheritance now live canonically in framework/interface/state/index.ts together with OwnerReference, DeclaredValueSeam and OwnerCapabilityHandle; core/definition.ts and core/state.ts import the same declarations, and framework/public.ts no longer re-exports the three declaration types.",
    "The DeclaredValueSeam documentation now states live reads (not a delivery-start snapshot); forward docs no longer describe snapshot semantics.",
    "Updated capability/interface/architecture docs and ADR line citations to the new ownership and line numbers; no compatibility alias or forwarding shell was added.",
    "Added a static State ownership guard to the existing import-boundary suite, a session-entry last-payload test, a State seam-shape assertion, and persistence-failure ordering evidence at the existing seams.",
    "Recorded the pre-change P48 comparable baseline and post-cutover verification evidence under .scratch/framework-capability-cutover/evidence/."
  ],
  "acceptance_evidence": {
    "P48 baseline": "Pre-change: .scratch/framework-capability-cutover/evidence/01-p48-baseline/ (real OMP consumer regression marker/notices, OMP model-cost headless severities and display, pi model-cost TUI frames at 120x40/60x40, pi codebase-tools marker/notices). Baseline captures actual source revision, config, widths, versions and reproduction. Post-cutover pi TUI capture: 60-column frames byte-identical; 120-column frames differ only in the per-run temporary path. Human readability remains unverified as required.",
    "canonical ownership / no internal exposure (P01, P05 partition)": "tests/framework/import-boundary.test.ts > \"State's declarations are published only by the State capability interface\" (8 pass); fault injection of a legacy StatePersistence declaration made it fail with the expected crossing, then restored green; bun run typecheck exit 0; framework/public.ts State exports removed.",
    "actual delivery read/write, two extensions, different owners, retained reads (P07, P08)": "declared-value-write.test.ts: \"each invocation's handler sees the value the previous one left\", \"the seam is the managed read/write pair and carries no store\"; owner-capability.test.ts: \"the retained capability reads the owner's current value, as the delivery's seam does\"; owner-inheritance.test.ts: \"each field keeps its own value, its own record and its own line\"; control.test.ts: \"two sessions keep independent values even though they share the registry label\".",
    "repeated identical writes, order, memory (P09, P10)": "declared-value-write.test.ts: \"two identical writes are two writes: nothing is deduplicated\" (two records, two area updates); control.test.ts: \"persistence is attempted before the marker and feedback, and the record carries the new value\" and \"a failed record does not change the feedback or the authoritative current value\" (asserted effect order persist, marker, notify); owner-inheritance.test.ts memory cases (never seeded, never recorded).",
    "persistence failure / marker failure (P11, P12)": "control.test.ts: the failed-record case keeps the new value and still runs marker/feedback, and \"a marker publication that fails does not roll back the value or its record\" observes the thrown error with value and record retained.",
    "owner end and retained handles (P13)": "owner-capability.test.ts: retired write, retired feedback, reopened owner with the old handle inert, post-end handle inert from birth, old read still current; session-events.test.ts disposed-end retirement.",
    "follow/none/unresolved and no scope escalation (P15)": "owner-inheritance.test.ts: follow/none/unresolved plus \"a subagent has no write face\"; owner-follow.test.ts: \"both scopes observe one session's events, and the child side changes nothing of the Owner's\"; real OMP: tests/codebase-tools/subagent-owner.test.ts and tests/harness-dock/viewed-marker.test.ts. Existing cross-process child suites passed in the framework partition; no new cross-process guarantee claimed.",
    "session-entry restore / memory / navigation / effects (P16)": "session-events.test.ts new \"only the last persisted payload's legal boolean seeds the owner; anything else is the default\" (last valid wins; non-boolean and non-object last payloads fall back; earlier values do not leak). Fault injection of first-payload selection and of non-boolean coercion each failed, then restored green. owner-inheritance.test.ts memory resume; real OMP codebase-tools session-boundaries.test.ts (restart, legacy invalid record, tree navigation, branch, fork) and marker-lifecycle.test.ts (restored line); connect-bot arm.test.ts \"binding alone sends no request, schedules no timer and writes no state\" plus its memory State declaration.",
    "old State exports retire (P51 State partition)": "framework/public.ts removal, the new import-boundary ownership rule, and bun run typecheck; whole-repository legacy retirement remains ticket 11's scope."
  },
  "verification": [
    {
      "command": "bun run typecheck",
      "exit": 0,
      "result": "no diagnostics"
    },
    {
      "command": "bun test tests/framework/declared-value-write.test.ts tests/framework/owner-capability.test.ts tests/framework/owner-inheritance.test.ts tests/framework/control.test.ts tests/framework/session-events.test.ts tests/framework/import-boundary.test.ts",
      "exit": 0,
      "result": "59 pass / 0 fail, 196 expect(), 6 files"
    },
    {
      "command": "bun run test:framework",
      "exit": 0,
      "result": "604 pass / 0 fail, 2725 expect(), 52 files"
    },
    {
      "command": "bun test tests/codebase-tools",
      "exit": 0,
      "result": "24 pass / 0 fail, 334 expect(), 7 files (includes real OMP restore/restart, tree navigation, branch/fork, marker and real subagent following)"
    },
    {
      "command": "bun test tests/connect-bot",
      "exit": "1 first run / 0 rerun",
      "result": "first run without a panel binary: 137 pass / 5 fail, all five missing-omp-bot-binary failures; rerun with OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe: 142 pass / 0 fail, 689 expect(), 18 files"
    },
    {
      "command": "bun test tests/model-cost",
      "exit": 0,
      "result": "515 pass / 0 fail, 2891 expect(), 51 files"
    },
    {
      "command": "bun test tests/harness-dock/consumer-regression.test.ts tests/harness-dock/model-cost-headless.test.ts tests/harness-dock/model-cost-modes.test.ts tests/harness-dock/viewed-marker.test.ts tests/harness-dock/binding-lifecycle.test.ts",
      "exit": 0,
      "result": "19 pass / 0 fail, 229 expect(), 5 files on isolated OMP 18.5.0 (viewed-session patch where applicable)"
    },
    {
      "command": "bun scripts/pi-tui-acceptance.ts --widths 120,60 --rows 40 --out .scratch/framework-capability-cutover/evidence/01-state-verification/pi-tui-post-cutover",
      "exit": "1 (fixed version check only)",
      "result": "34 ok / 1 failed: the sole failure is the script expecting pi 1.2.0 while the CLI reports 1.3.0; 60-column frames byte-identical to baseline, 120-column frames differ only in the temporary run-root path"
    }
  ],
  "fault_injection": [
    "Legacy StatePersistence redeclaration in core/definition.ts -> import-boundary test failed with the expected crossing; restored green.",
    "statePayloads[0] instead of the last payload -> the new session-entry test failed; restored.",
    "Non-boolean payload accepted instead of defaulting -> the new session-entry test failed with 'yes'; restored."
  ],
  "evidence_paths": [
    ".scratch/framework-capability-cutover/evidence/01-p48-baseline/README.md and logs/frames",
    ".scratch/framework-capability-cutover/evidence/01-state-verification/README.md and logs/frames"
  ],
  "unverified_or_limited": [
    "P48 human readability judgment is not made and remains unverified until the user confirms it; the prepared frames/notices and post-cutover comparison are handed off.",
    "pi baseline ran on pi 1.3.0, not the acceptance script's expected 1.2.0 (recorded as an environment deviation).",
    "pi codebase-tools smoke stopped on the known Node 24.18.0 Windows libuv assertion after 34 passed checks (recorded in the baseline); no claim of a full pi codebase-tools pass.",
    "connect-bot needs OMP_BOT_BINARY in this worktree because the default sibling path is absent; the successful rerun used the existing binary at E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe.",
    "The full repository bun run test, check:integrations, five-entry final regression and formal host installation were not run; they remain final-integration/ticket 14 scope. No real provider/credential or formal configuration was used.",
    "Cross-process State evidence is limited to the existing framework child-process suites; no new remote-sync guarantee is claimed."
  ],
  "handoff_notes": [
    "The worktree is clean at commit 467a822; the integration branch was not merged or modified.",
    "The isolated OMP cache is a gitignored junction to the existing baseline cache; host-patches patch.diff files were LF-normalized for the dock, with no tracked content change.",
    "P48 baseline material is pre-change; the verification folder contains the post-cutover comparison and all command/exit records for ticket 14."
  ]
}
