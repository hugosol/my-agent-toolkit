## Agent skills

### Issue tracker

Issues, specs, and disposable development records live under `.scratch/<feature>/`; put evidence, acceptance results, rehearsal records, and test-run logs in its `evidence/` directory so they can be removed together after development. Long-lived documentation must be self-contained and must not reference these records. Decision tickets use the `open`/`claimed`/`resolved` lifecycle. See `docs/agents/issue-tracker.md`.

### Triage labels

Implementation tickets use `needs-triage`/`needs-info`/`ready-for-agent`/`ready-for-human`/`wontfix`, with `in-progress`/`closed` tracking execution. See `docs/agents/triage-labels.md`.

### Testing

Before choosing test scope for iteration, ticket completion, or final integration, read `docs/agents/testing.md` for test tiers and shared-worktree run coordination.

### Domain docs

Multi-context: `GLOSSARY-MAP.md` at the repo root points at one `GLOSSARY.md` per context (`framework/`, `extensions/<id>/`); `docs/adr/` and `docs/agents/` stay at the repo root. See `docs/agents/domain.md`.
