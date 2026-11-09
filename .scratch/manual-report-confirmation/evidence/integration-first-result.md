# First full integration

- herdr-bot canonical `node scripts/test-backend.mjs`: passed; 78 targets passed, no queued targets, build and doctest passed. Full summary in paired repository `.scratch/manual-report-confirmation/evidence/backend-full/summary.json`.
- toolkit typecheck and check:integrations: passed.
- toolkit canonical `bun run test`: 1841 passed / 6 failed, 12357 assertions, 233 files, 637.52s. Original log retained under `integration/toolkit-full.log`.

Corrections (no weakened product assertions):
1. Four controlled report HTTP fixtures did not answer the new read-only context request. They now supply authoritative auto policy and continue asserting exact report results and no resubmission.
2. uncertain-effects asserted total HTTP count as report count. It now asserts the exact context/report route sequence, preserving the no-autonomous-retry property and persisted report checks.
3. Report preflight had classified absent native identity as cancellation. It now checks only explicit caller abort before the existing native identity validation, retaining the combined Session/tool signal for the remaining operation. A fresh-process tool smoke now returns isError=true, error.kind=session-unavailable, sent=false, saved=false and exit 0.

The corrective run owns separate logs under `integration-corrected/`; earlier failures are not overwritten.
