# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "09-background-roundsmd-3a271aa9-f661-41cc-a2d6-5",
  "head": "f2f24848b2dd769ca81846a0c0383a379b1cbcda",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "09-background-rounds (P19, P20)",
  "status": "implemented, tested, committed; not merged (integration agent's step)",
  "commits": [
    "bd43a07 — S1 mechanism: provider session-liveness read into the pi Round rest condition",
    "f2f2484 — real-host fixture/script, docs row, evidence record"
  ],
  "branch": "hyper/model-cost-pi-migration/09-background-rounds-8ca6ce-411dc288ea83 (from 304451e)",
  "delivered_behavior": {
    "private_integration": "framework/adapters/pi/nicobailon.ts publishes the provider's versioned session-liveness registry (Symbol.for(\"@agegr/pi-web/session-liveness/v1\")) when the process carries none (never over another host's), reads back the one registration the provider leaves per session, and answers backgroundActivity(sessionId): holds | clear | unread. Unread covers exactly the four required shapes: no registration, a registration naming another session, a registration whose answer cannot be taken, and a registry this entry did not publish. The table member key is Symbol.for so a second evaluation of the framework's graph (one per extension entrypoint) reads the same registrations.",
    "round_mapping": "framework/adapters/pi/round.ts asks the provider only after pi's own idle/no-pending facts look restful: holds → not quiescent, clear → quiescent, unread → nothing established (candidate kept, reason reported once). No local window, poll or timeout.",
    "assembly": "framework/adapters/pi.ts injects the reading; an assembly with no child entry answers clear, i.e. pi's native facts alone.",
    "release": "Registrations are the provider's own (its release removes them); the published slot is never displaced and nothing is released on a binding's behalf."
  },
  "acceptance_evidence": {
    "P19 S1 (12 cases, tests/framework/pi-background-rounds.test.ts)": "holds keeps a settled parent Round open and clear ends it; the completion wake's Turns carry the same Round id (no second Round); all four unread shapes keep the Round open and report once; a failed child-entry requirement does NOT silence the provider's own clear; parent/child Rounds are their own; a no-provider process rests on pi's facts; another evaluation's registry is read, not treated as another host's.",
    "P19 S2/S3 (real host, scripts/pi-background-round-smoke.ts, 13 observations, ~31s)": "real pi 1.2.0 + pinned pi-subagents 0.78.0, isolated layout + capture endpoint: two real background delegations live while the parent's public Round is open; the children's terminal states do not end it; the Round opens once and closes once across the delegation; every Turn of it is one Round (the wake continued it); the boundary saved the parent's own requests as its own tokens (S3); the provider's two kept completion-replay records stood while the Round closed; children are their own sessions naming this parent; a later ordinary Round still opens and closes with the provider present; a model-issued non-blocking wait on a finished run was answered and the Round still ended.",
    "P20 S1": "a registration whose own work is a future task / kept terminal history / an open subscription (the provider's published standard) holds nothing back; the adapter puts no keep-alive traffic of its own on the provider's surfaces; advancing the clock 10 minutes changes nothing (no local deadline), only the provider's own answer ends the Round; an execution a task really starts is handled by its own session's Round. S2: the provider's kept terminal records stood while the Round closed.",
    "fault_injection (each restored, green after)": "ignore the provider reading → 8/12 fail; read unread as clear → 3 fail; treat any registration as held → 6 fail; add a local deadline that dispatches → 4 fail; silent time-based rest → 2 fail; module-local registry marker → 1 fail."
  },
  "commands_actually_run": [
    "bun run typecheck → clean",
    "bun test tests/framework/pi-background-rounds.test.ts → 12 pass / 0 fail (33 expect)",
    "bun test tests/framework → 442 pass / 0 fail (36 files, 2060 expect)",
    "bun test tests/model-cost → 394 pass / 0 fail (31 files, 2011 expect)",
    "bun scripts/pi-background-round-smoke.ts → 13 observations held"
  ],
  "environment": "win32 10.0.26200 / x64, bun 1.4.2, node v24.18.0; pi 1.2.0 at D:\\nvm4w\\nodejs\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\bundle\\cli.js; pi-subagents@0.78.0 from this repo's node_modules; no credentials, no paid calls (local capture endpoint). The operator's real ~/.omp/cost-archive/consumption.json was read-only checked and holds 0 pi records — the runs wrote nothing there.",
  "unresolved_or_unverified": [
    "Provider wake-deadline expiry (the 10s reservation never starting) is not reachable in this host's idle path; the provider's own module smoke with an injected clock is its evidence, and this ticket's side (accept its answer, add no deadline of its own) is covered by S1.",
    "A real durable schedule registration was not driven: schedule.create requires a workflow script in the reply text, which the dock's scripted answer cannot emit beside a tool call. Covered by the provider's published standard plus S1.",
    "The non-blocking wait was opened on an already-finished run (terminal answer, not a standing subscription).",
    "Both delegated sessions' own consumption records did not appear in this run (children exit with their own turn; no refusal in their stderr). That claim belongs to ticket 05/08 and is evidenced by 05's phase 4, not asserted here.",
    "Foreground delegation, nesting, resume, cancellation, reload/recovery: other tickets (10, 11) or the known stale-ctx host fault recorded by 05.",
    "A foreign host already holding the liveness registry answers unread (no displacement): source-level reasoning only, no such host on this machine.",
    "POSIX not run; only win32 x64."
  ],
  "files_changed": [
    "framework/adapters/pi/nicobailon.ts",
    "framework/adapters/pi/round.ts",
    "framework/adapters/pi.ts",
    "framework/docs/harness-support.md",
    "tests/framework/pi-background-rounds.test.ts (new)",
    "tests/framework/support/pi-surface-double.ts",
    "tests/harness-dock/fixtures/pi-background-rounds/{entrypoint,prefix}.ts (new)",
    "scripts/pi-background-round-smoke.ts (new)",
    ".scratch/model-cost-pi-migration/evidence/09-background-rounds.md (new record)"
  ],
  "notes_for_integration": [
    "The ticket file's Status/labels were left untouched (workflow-owned); the evidence record is the handoff material.",
    "The register row work.async-job-snapshot was updated for pi; the adjacent lifecycle.semantic-events row is stale since ticket 05 and was intentionally not changed — recorded for its owner.",
    "Suggested verification on the merged tree: bun run typecheck, bun test tests/framework, bun test tests/model-cost, and (real host, serialized) bun scripts/pi-background-round-smoke.ts; ticket 05's scripts/pi-subagent-smoke.ts is an affected real-host consumer whose phases 1–2 depend on rounds closing with a provider present (my registration-failure case keeps that behavior)."
  ]
}
