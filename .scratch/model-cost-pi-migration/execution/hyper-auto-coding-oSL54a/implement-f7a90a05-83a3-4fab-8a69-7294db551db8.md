# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "15-period-resetmd-d51c00f9-fcab-483a-94ed-13a7b2",
  "head": "94651a972a502e42a43e38f5cffc4f6177df6eb7",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "15-period-reset",
  "status": "implemented, committed on ticket branch hyper/model-cost-pi-migration/15-period-reset-bfd000-411dc288ea83 (94651a9); not merged — integration owns merge + merged-tree regression",
  "deliverable": {
    "new_test": "tests/model-cost/pi-period-reset.test.ts — 15 cases realizing P35/P36/P37 on pi through the real pi adapter, the real /budget command registration, the pi frontend and a real storage root",
    "production_fix": "framework/adapters/pi.ts — the command delivery's canAcceptInput now answers undefined (via reportMissingFact) when the surface reports no idle fact, instead of calling ctx.isIdle() and crashing; matches the OMP adapter and the pi round mapping, and makes P37's 'activity unknown -> refuse' reachable on pi",
    "real_host": "scripts/pi-model-cost-smoke.ts — new Phase 10 (real pi processes: whole-file archive of a two-harness/two-provider/main+child document, a second pi process committing into the same root before the reset, holiday first/repeat, non-DeepSeek refusal) plus shared commandNotices/periodCommand helpers",
    "shared_script_fix": "Phase 6 of the same smoke script: its wait condition could be satisfied by records an earlier run left in the shared root, so /budget clear was typed while the entry's own save was still publishing; that exact real-host refusal was observed on the first run. periodCommand now retypes only that one notice, bounded (<=3 attempts, 250ms), printing a note line; no other phase behaviour changed",
    "evidence": ".scratch/model-cost-pi-migration/evidence/15-period-reset.md plus evidence/logs/15-period-reset.log (passing run) and 15-period-reset-run2.log; ticket file 15-period-reset.md updated (all 8 criteria ticked, status implemented-pending-integration)"
  },
  "verification_run": [
    {
      "command": "bun test tests/model-cost/pi-period-reset.test.ts",
      "result": "15 pass / 0 fail, 117 expect"
    },
    {
      "command": "bun test tests/model-cost",
      "result": "415 pass / 0 fail (34 files)"
    },
    {
      "command": "bun test tests/framework",
      "result": "481 pass / 0 fail (38 files) — covers the changed pi adapter's consumers"
    },
    {
      "command": "bun run typecheck",
      "result": "clean"
    },
    {
      "command": "bun scripts/pi-model-cost-smoke.ts (installed pi 1.2.0, resolved via pi.cmd -> @earendil-works/pi-coding-agent dist/bundle/cli.js)",
      "result": "97 checks passed, none failed, exit 0, 28 isolated runs, no kept roots"
    }
  ],
  "red_green": "Before the adapter fix the new suite's unreported-activity case failed with '/budget holiday failed: ctx.isIdle is not a function. (In ctx.isIdle(), ctx.isIdle is undefined)'; after it, the case passes and the framework prints 'this harness reports no idle fact (isIdle); the framework answers nothing rather than inventing one' once per binding",
  "coverage": {
    "P35 (S2,S3)": "mixed pi+omp / deepseek+codex / main+child document archived whole; valid zero; another writer's committed record inside the archive while the instance's own view is older; an in-flight publication waited for; archive failure and publish failure each reported at their own stage with no success claim; also asserted cross-process in the smoke (5 archive records incl. both live sessions)",
    "P36 (S2,S3)": "clear opens holiday=false in one commit; the first holiday opens holiday=true directly with exactly one archive; a second holiday changes nothing, archives nothing, queries nothing; an earlier archive is byte-identical afterwards",
    "P37 (S1,S2,S3)": "non-DeepSeek entry (and an entry whose model pi does not report) warned with nothing written and only the startup prefetch issued; working entry warned and a later settle/round end does not run the refused action; unreported activity refused as an error with no guess; a save not yet settled refuses and is not queued (that save then lands as v4/0.0395 and the period is unchanged); success controls for each; entry display preference survives both a refusal and a successful switch"
  },
  "not_verified": [
    "balance/account answers are the local capture endpoint, not a real account (P53/ticket 24)",
    "the busy and unreported-activity refusals cannot be produced over RPC on real pi (pi dispatches commands when idle and always publishes isIdle), so they are covered only by the in-process suite — recorded in the smoke header and its summary limitations line",
    "the publish-failure injection uses the Windows read-only rename path; the POSIX branch of that case was not run here",
    "P51/P52/P53 remain human-led acceptance, untouched by this ticket"
  ],
  "notes_for_integration": [
    "Only shared file touched outside this ticket's own artifacts is scripts/pi-model-cost-smoke.ts (Phase 6 already integrated from ticket 14); its change is a bounded operator retype of the one pending-save notice and its phase still passes",
    "framework/docs/harness-support.md needed no edit: the lifecycle.input-acceptance row's harness-qualified statement is unchanged and the pi command path now conforms to it; that row's evidence column does not yet cite the pi command path",
    "no docs/changelog file exists to update; no new resource, subscription or timer was added by this ticket; test temp roots are released in afterEach/afterAll and the smoke deletes its run roots on success"
  ]
}
