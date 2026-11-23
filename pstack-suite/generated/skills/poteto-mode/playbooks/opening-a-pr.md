### Opening a PR

Use at the end of a delivery playbook that calls for publishing a PR, or early when the selected autopilot playbook says so. Opening a PR is not a merge or deploy grant. Follow the task scope and existing project and forge requirements; read-only work does not publish.

Work from a git worktree off trunk, and keep unrelated work out of it. Rebase into small, landable commits. If the suite includes the deslop skill, read it and apply it to the diff before commit; if absent, report the missing review method.

Title: `type(scope): subject`, naming a real symbol when one carries the change. Body: a one-minute briefing under 40 lines with these `##` headings in order, dropping empty ones: `## Why`, `## What changed`, `## Scope`, `## Tradeoffs` (only rejected alternatives a reviewer would otherwise ask about), `## Blast Radius`, `## Verification`.

Stack follow-ups by base branch. Open PRs ready, through the run's PR tool with `draft: false`. Without one, use `gh pr create` without `--draft`, or `origin pr create --status open` when Origin's CLI resolves the repository. Opening a PR does not start a babysit.
