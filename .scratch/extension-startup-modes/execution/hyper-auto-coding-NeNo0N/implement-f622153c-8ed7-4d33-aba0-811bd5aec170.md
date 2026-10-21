# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "08-usage-and-integration-handoffmd-3cfb378b-9fb5",
  "head": "dfc8425a1c6dd4776085f3da16d61c36c476b7b7",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": ".scratch/extension-startup-modes/implementation/08-usage-and-integration-handoff.md",
  "outcome": "implemented and automatically verified; four human-led visual checks remain unverified",
  "branch": "hyper/extension-startup-modes/08-usage-and-integration-handoff-b0da79-b21292ab9ce5",
  "commits": [
    "585acc0 08: document startup-mode usage and acceptance handoff",
    "dfc8425 08: state the acceptance panel and credential prerequisites"
  ],
  "worktree": "clean; no other ticket files, workflow reports, integration branch, spec, contract or support records modified; no formal host config, user session or formal panel touched",
  "delivered": [
    "Root README: per-extension manual/automatic entrypoint roots, one mode per extension, link to each consumer's usage.",
    "codebase-tools README: additive loading and no duplicate detection/merge; per-extension mixed selection; directory roots contribute only their mode; policy read once per process; existing pi/OMP support scope; pi automatic TUI command for P8.",
    "connect-bot README: one mode per extension and no merge/detection; both modes share the same config.yaml endpoint/budget; existing OMP support scope; loading-vs-enabling, enqueue-vs-receipt and non-blocking semantics already present are now tied to the acceptance runbook.",
    "New connect-bot H1d runbook (P18/P19): isolated deployment copy, isolated herdr-bot panel on a dedicated port, isolated agent state, recording/timing instructions for marker-after-receipt and failure-without-marker, plus the automated test references.",
    "framework/README.md human-acceptance index now links the connect-bot P18/P19 visual runbook.",
    "No fixed-wording, source-text or entry-copy assertions were added."
  ],
  "criterion_evidence": [
    "P30 docs distinguish loading, startup target, actual State and non-blocking registration; links checked and published entrypoint selections executed (see verification).",
    "Loading is additive; same-extension double mode is documented as a double bind with no dedup/merge/detection; per-extension mixed selection documented. Evidence: tests/harness-dock/startup-modes-loading.test.ts (single entry, auto+auto combination, manual+auto mix, decoy working dirs) passed.",
    "Effective history wins over mode default including false; first process start vs later navigation; policy edit next process; shared business config. Evidence: tests/codebase-tools/startup-modes.test.ts, startup-policy-change.test.ts, tests/connect-bot/startup-modes.test.ts, startup-lifecycle.test.ts passed in the full suite.",
    "codebase-tools session-entry restore under the opposite mode and connect-bot memory/no-connected-preference documented; P35/P22 evidence passed. Scope notes say no new host support, support-record change or formal deployment.",
    "P8 materials: extensions/codebase-tools/README.md H1 and H1b (OMP and pi commands), automated by startup-modes-dock.test.ts and pi smoke auto.",
    "P9 materials: extensions/codebase-tools/README.md H1c with three restorable isolated scenarios for OMP and pi, automated by startup-recovery-dock.test.ts, startup-modes.test.ts and both pi smoke modes.",
    "P18/P19 materials: extensions/connect-bot/README.md H1d with an isolated real-panel setup and time-ordered scenarios; automated by tests/harness-dock/connect-bot-startup.test.ts (held register, refusal, real isolated panel read side).",
    "Human-led items still unverified: P8 OMP/pi marker rendering, P9 restored-marker rendering, P18 success-before/after marker display, P19 failure feedback and closed display. No screenshots or recordings were captured by the agent; the runbooks specify the terminal evidence the user must record and confirm."
  ],
  "verification": {
    "source_state": "Code HEAD 66ae6af (dev merge) plus the two documentation commits above; Windows 10.0.26200 x64, Bun 1.4.2, isolated OMP @oh-my-pi/pi-coding-agent@18.5.0, default Node 24.18.0, pi smoke Node 22.19.0, git core.autocrlf=true, sibling checkouts available through Temp symlinks.",
    "commands": [
      "bun install --frozen-lockfile -> exit 0",
      "bun run typecheck -> exit 0; check:authoring 58 files, 3 declarations, 0 diagnostics",
      "bun run check:integrations --json -> exit 0; complete:true, 6/6 extension-adapter combinations complete, 0 diagnostics, behaviorTestsRun:false",
      "bun test tests/framework -> 657 pass / 0 fail across 57 files",
      "bun test tests/codebase-tools tests/connect-bot -> 217 pass / 0 fail across 32 files",
      "bun test tests/harness-dock/baseline.test.ts -> 6 pass / 0 fail (isolated 18.5.0 materialized)",
      "bun test startup-modes-loading + codebase-tools startup-modes-dock + startup-recovery-dock + connect-bot startup + connect-bot lifecycle -> 24 pass / 0 fail across 5 files",
      "PI_NODE=<node22.19> bun scripts/pi-codebase-tools-smoke.ts --mode manual -> exit 0; pi 1.3.0, 78 checks passed, 6 isolated runs",
      "PI_NODE=<node22.19> bun scripts/pi-codebase-tools-smoke.ts --mode auto -> exit 0; pi 1.3.0, 62 checks passed, 4 isolated runs",
      "bun run test -> exit 0; 1610 pass / 0 fail across 180 files, 9882 expect() calls, 584.93s",
      "Repository-local markdown link/anchor check over the 9 startup-related docs -> 486 links checked, 0 failures (source-line anchors and out-of-repo references excluded; explicit HTML anchors accounted for)"
    ],
    "scope_notes": [
      "Static authoring/integration checks prove declarations and wiring only, not native behavior or support status.",
      "S1 unit suites prove the controlled adapter/State seam; S2 dock suites prove the real OMP loader, captured model requests, the isolated real herdr-bot panel read side and independent-process restore/navigation.",
      "pi smoke proves the real pi CLI plus capture endpoint and spawned-child follow; it does not prove a real third-party provider or rendered TUI.",
      "The scripted capture endpoint answers model requests; it proves request arrival/contribution, not provider quality. No real credential or formal account was used.",
      "The literal interactive `<provider>/<model>` TUI commands were not run by the agent; the same published entrypoint selections were executed through the real isolated loaders. Visual rendering remains the human-led step."
    ]
  },
  "human_led": {
    "unverified": [
      "P8: OMP/pi marker actually rendered in the interactive terminal.",
      "P9: OMP/pi restored-session marker actually rendered.",
      "P18: OMP terminal shows no marker before a valid receipt and the marker after it.",
      "P19: OMP terminal shows the existing failure feedback and stays closed."
    ],
    "prepared_material": [
      "extensions/codebase-tools/README.md#h1--interactive-tui-acceptance-visual",
      "extensions/codebase-tools/README.md#h1b--automatic-startup-mode-interactive-acceptance-p8-human-led-marker-display",
      "extensions/codebase-tools/README.md#h1c--startup-recovery-interactive-acceptance-p9-human-led-marker-display",
      "extensions/connect-bot/README.md#h1d--automatic-startup-interactive-acceptance-p18-p19-visual"
    ]
  },
  "blockers": [],
  "limitations": [
    "No terminal screenshots/recordings were produced; the four visual judgments remain for the user and are explicitly marked unverified in the docs.",
    "The full-suite result predates the final documentation-only clarification commit dfc8425; source, fixtures, dependencies and environment are unchanged, and the final docs were link-checked after that commit.",
    "A whole-repository link scan still finds pre-existing unrelated links (archived .scratch documents and model-cost glossary anchors); they were not touched by this ticket."
  ]
}
