# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "05-subagent-factsmd-bec342ec-e612-4c13-84ed-c76f",
  "head": "d34e7f61e82212dfdf493410c0e16daa320c67e2",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "status": "incomplete-real-host-phases",
  "commit": "d34e7f6 (on hyper/model-cost-pi-migration/05-subagent-facts-dfc162-411dc288ea83, worktree clean, started from the prior WIP 2928430)",
  "delivered": {
    "framework/adapters/pi/nicobailon.ts": "one settle reads both provider statements: the versioned ready announcement and the reply to this entry's query. Real load order settles us before the provider has a session context, so its reply states no session while the announcement that follows states it — so an answer naming no session is now read as the provider making no identity claim (not a protocol failure, not success evidence), while a refusal/unreadable version stay protocol failures, a statement naming another session is an identity failure, and a refused registration is a registration failure whether or not anything answers (the WIP reported it as none). ask() keeps the session-less reply as last resort and waits for a stating statement within the same budget, and unsubscribes both channels.",
    "framework/adapters/pi/session.ts": "piSessionFactsOf now takes the already-resolved position, so facts and owner are two readings of ONE decision (the WIP resolved owner before the start recorded it: a fork/new reported kind=main with an inherited owner).",
    "framework/adapters/pi.ts": "one position per start delivery; a session that is not its own owner is delivered as itself and takes no part in the transfer (the WIP emitted a spurious session_end(transferred) for the served session whenever an in-process child started, and cleared activeOwner); shutdown now ends only the owner session by its own identity and releases that session's child-extension requirement; the requirement is taken per session, released on its own end, on the session being left, and with the access that does not stay.",
    "tests (new, S1)": [
      "tests/framework/pi-session-facts.test.ts (18 cases: identity/direct parent/Owner for main, spawned, nested, same-name, fork/new, unreadable chain, loop; rename facts; startup pair rules)",
      "tests/framework/pi-subagent-integration.test.ts (12 cases: none vs failed{registration|protocol|identity}, diagnostics, mode settled once, registration really in the provider's own registry and released)",
      "tests/framework/support/pi-session-files.ts, tests/harness-dock/fixtures/pi-session-facts/{entrypoint,prefix}.ts, scripts/pi-subagent-smoke.ts, double now attaches the host bus and exposes the settled initialization + observed provider queries"
    ],
    "docs": ".scratch/model-cost-pi-migration/evidence/05-subagent-facts.md"
  },
  "verified_commands": [
    {
      "cmd": "bun run typecheck",
      "result": "clean (includes scripts/)"
    },
    {
      "cmd": "bun test tests/framework",
      "result": "429 pass / 0 fail, 35 files (was 400 before this ticket)"
    },
    {
      "cmd": "bun test tests/model-cost",
      "result": "380 pass / 0 fail, 29 files (untouched modules, confirms no fallout)"
    },
    {
      "cmd": "bun test tests/framework/pi-session-facts.test.ts tests/framework/pi-subagent-integration.test.ts",
      "result": "30 pass / 0 fail"
    },
    {
      "cmd": "five fault injections (spawn decision ignoring start reason; any shutdown ending the served owner; releaseSession no-op; refused registration answered as none; identity mismatch ignored)",
      "result": "each killed exactly the intended case(s) (1/1/3/1/1 failures) and was restored to green"
    },
    {
      "cmd": "bun scripts/pi-subagent-smoke.ts (real pi 1.2.0 + pinned pi-subagents 0.78.0 + capture endpoint, isolated roots)",
      "result": "phase \"no subagent provider loaded\" passed all 5 observations: host session facts reach a subscriber; nothing diagnosed as a failed integration; one session and no child session; consumption accounted and saved under its own identity; the saved startup pair equals the pair the host stated at the session's own start (its printed log is recorded in the evidence file)"
    }
  ],
  "real_host_facts_incorporated": [
    "provider's ready payload carries session{cwd,sessionId,sessionFile}; a ping answered before it has a context carries session:{} (this ordering fact drove the classification fix)",
    "a real foreground delegation spawned a real child: the child session file's own header states its own id and parentSession = the parent session file this adapter reads; the provider's own launch metadata states parentSessionId = the parent session id and launchResolvedExtensions.required=[\"model-cost\"], effective=[runtime, model-cost] — the provider's own evidence that our registration loaded our entry into the child"
  ],
  "blocker": {
    "what": "Default foreground children are created INSIDE the parent pi process (provider child-session.js: pi.SessionManager.create + pi.createAgentSession), which makes the parent session's captured extension context stale; the extension's own pi frontend then throws uncatchably on its next render and kills the parent process (no settle, no save). Reproduced with a failing and with a working balance endpoint; background/async delegation (separate process) does not trigger it.",
    "trace": "Error: This extension ctx is stale after session replacement or reload — at render (extensions/model-cost/harnesses/pi/widget.ts:212) ← announce (shared-logic/request-accounting.ts:752) ← announceChanged (…:1166) ← onChange (runtime.ts:273) ← fail (provider-balance.ts:193) ← runQuery (…:241)",
    "owner": "the pi frontend/assembly line (frontend holding a captured ctx and redrawing later), not this ticket's mechanism; no workaround, silent downgrade or patch was applied, and it is reported as a real-host blocker"
  },
  "unverified": [
    "P11/P12/P13 real-host public delivery for a CHILD session (blocked by the crash above)",
    "the smoke's remaining phases (refused child entry; foreground and background delegation) did not finish inside this run's budget — one long run was stopped when the budget notice arrived; they are committed as rerunnable entrypoints but their results are NOT claimed",
    "nested delegation, resume, cancel, fork inheritance, process replacement on the real host",
    "the \"no provider artifact at all\" variant of none (this machine always carries the pinned artifact; only \"artifact present, nothing running\" was exercised)",
    "POSIX (all real runs were win32)"
  ],
  "notes": [
    "reused, re-checked S3/S1 business coverage for P12/P13 lives in tests/model-cost/session-ownership-tree.test.ts (rename: display now, saved at the next existing commit, no new identity, no extra consumption) and tests/model-cost/session-recovery.test.ts (startup pair rides the consumption commit, restored by a new process, unknown stays unknown) — this ticket added only the pi-side feeding of those same deliveries",
    "no user data written: the real ~/.omp/cost-archive was checked and holds 0 pi records; every run used an isolated home and a per-run layout whose child entry binds the production assembly to that run's own storage root",
    "left untouched: other tickets' files, the integration branch and its worktree, workflow reports; the long smoke job was cancelled rather than left running"
  ]
}
