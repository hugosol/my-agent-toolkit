# Historical development verification

Extracted from `extensions/model-cost/README.md`; these are historical observations, not current guarantees.

### Architecture refactor verification (2026-10-18)

- Before and after: `bun run typecheck` passed; `bun test tests/model-cost` retained all 515 cases
  across 51 files and 2,891 assertions, with no failures.
- `smoke:model-cost-data`: 20 checks passed. Production layout smoke passed at 160/120/85/60/40
  columns. A separately launched real Windows console passed all 44 device checks at
  120/85/60/40/120 columns; this does not replace human readability or real-account acceptance.
- Final `bun run test`: 1,376 passed, 4 failed. Two failures concern the baseline lockfile hash:
  the working `bun.lock` uses CRLF, while its LF-normalized bytes match both HEAD and the recorded
  SHA-256. Two before-all failures concern the existing
  `.cache/omp-baseline/18.5.0-codex-response-boundary` prefix, which lacks the frozen
  `pi-ai/src/providers/openai-codex-responses.ts`. The failing test/support sources and baseline
  record match HEAD; no baseline hash, lockfile or cached host was changed to mask these failures.
- `bun run check:integrations --json` passed (`complete: true`, `behaviorTestsRun: false`), for the
  unchanged existing declaration checklist only.


Verification of these updates: the startup-progress replay reproduced three unattributable creation
readings before the fix, then passed the creation, first-attributed-reading and post-readiness-loss
checks after it. The framework/model-cost partitions passed 731 tests, and the four affected real-host
dock files passed 11 tests. The production layout smoke passed at 160/120/85/60/40 columns; the Windows
console-device smoke passed all 44 checks at 120/85/60/40/120 columns, including resize, Chinese cell
widths, retained figures and unchanged storage. Final integration passed `bun run typecheck` and
`bun run test` (983 tests across 106 files, no failures). These observations do not certify a real provider
account or replace the human readability judgement below.

Verification of the publication and merged-redraw behavior (2026-10-17): `bun test tests/model-cost`
491 pass / 0 fail, `bun test tests/framework` 555 pass / 0 fail, and the real-host dock partition
(`HERDR_BOT_BINARY`, with `bun.lock` and the host patches normalized to LF) 107 pass / 0 fail. Real
hosts: a pi 1.3.0 background smoke passed 10/10 observations, and a real-terminal pi TUI capture was
34 ok / 1 failed — the failure is that script's own `pi 1.2.0` version check against this machine's
1.3.0 install. Counted apart rather than inferred: one response's 40 streamed chunks were 2
collections and 0 publications; six deliveries in one turn were one frame; a three-reading batch over
the real named pipe was two frames; a minute of the host's own clock with nothing happening was 0
publications and 0 frames. The Win32 console-device layout smoke was not run in that shell (no console
device); no per-frame cost was profiled, so no efficiency claim is made here.

