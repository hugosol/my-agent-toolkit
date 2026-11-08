# Manual report confirmation — final verification

## Delivered

- manual report invokes native explicit payload confirmation in both Pi and OMP; auto does not ask.
- Toolkit deployment config `extensions/workflow-chat/config.yaml` declares required `reportConfirmationTimeoutMs: 20000`; model parameters cannot override it.
- Full body, can_complete and output paths shown; frozen payload and per-call approval; deny/dismiss/cancel/session end/timeout/no UI/error/late results do not send.
- No automatic retry or natural-language fallback; report HTTP uncertain outcomes remain uncertain rather than claiming not sent.
- Read-only backend `/api/workflow/node/context` resolves frozen policy with the exact node report identity resolver, including retained/nested executions. Direct HTTP bypass is not prevented.
- Role prompts, backend-generated control text, domain glossary and permanent operating/configuration docs migrated.

## Final commands and observed results

- `cargo test --manifest-path backend/Cargo.toml --test workflow_dispatch`: 165 passed. Safe shell and Herdr fixture build passed.
- `node scripts/test-backend.mjs`: complete backend passed, 78 targets, build and doctest passed, none queued. Paired repo evidence: `.scratch/manual-report-confirmation/evidence/backend-full/summary.json`.
- Corrective focused Bun run: 42 passed, 0 failed, 192 assertions across 9 files.
- `bun run typecheck`: passed, authoring check 0 diagnostics.
- `bun run check:integrations`: passed (structural completeness, not native certification).
- Final canonical `bun run test`: 1847 passed, 0 failed, 12374 assertions across 233 files, 617.98s. Logs and command/environment selection: `integration-corrected/`.
- Actual OMP 18.5.0 and Pi 1.5.0 terminal smoke: all 6 approve/deny/timeout cases passed; complete previews and actual report HTTP captured in `tui-final/`. See `tui-result.md` for environment corrections and scope.
- Final missing-native-identity smoke after its classification correction: explicit session-unavailable error, sent=false/saved=false, exit 0. Existing real OMP missing-identity regression also passed in focused and canonical runs.

## Limits and retained failures

Initial unauthorized-report red, smoke setup failures and first canonical 6 failures retained; see `focused.md`, `tui-result.md`, `integration-first-result.md`. Do not treat earlier failures as erased.

Controlled model/UI and external-host fixtures prove mechanisms; historical ticket22 full real-model workflow acceptance was not rerun or claimed. Toolkit and herdr-bot must be upgraded together; existing persistent prompts are not hot-updated, so create a new Chat after deployment. No global host installation, user-session migration or production deployment was performed. Disposable runner scripts removed; evidence retained.
