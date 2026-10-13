# 14 — Codex ratio/left estimate: H2 material and evidence (P66)

Ticket: [14: Codex 成对采样估计与独立保存](../implementation/14-codex-ratio-estimate.md)
Contract: [P66](../contract.md) — automatic part delivered here; H2 (real ratio/left effect in normal use) stays with the user.
Date: 2026-10-13. Harness baseline: OMP 18.5.0 / Windows x64 / Bun 1.4.2 (unchanged; nothing here alters it).

## 1. What was delivered and where it is observable

| Behaviour | Production seam | Permanent test |
|---|---|---|
| Only one report's own pair is sampled; a single-window report measures nothing | S2 — `runtime.presentation.estimate()` (report delivered through the framework's own binding) | `tests/model-cost/codex-estimate.test.ts` |
| Thresholds: five-hour movement ≥ 50 points, both windows up, neither saturated | S2 — same result | same file |
| `estimating…` while no sample exists; `left≈N.N×5h · ratio≈R.R` once one does | S2 — same result | same file |
| Rollover / five-hour age-out / impossible capture time rebuild the baseline without withdrawing the ratio | S2 — same result | same file |
| Baseline published at once; a ratio refinement at most once a minute; a newer baseline on disk wins and is adopted; a known ratio never dropped to nothing | the measurement's own entry `runtime.estimate.observe()`, then the real `codex-usage-estimate.json` | same file |
| Restart continues the stored measurement | a second runtime over the same storage root | same file |
| A document that is not this shape (or is not JSON) is a first run; text that is not JSON is never overwritten | real file under the storage root | same file |

## 2. Sanitized readings that already exist on this machine

`~/.omp/cost-archive/codex-usage-estimate.json` (read only, not modified — the storage root the migration reuses after the user's manual backup/clear):

```json
{
  "baseline": {
    "capturedAt": "2026-10-13T08:22:06.554+08:00",
    "fiveHour": { "usedPercent": 0, "resetsAt": "2026-10-13T13:22:05.000+08:00" },
    "weekly": { "usedPercent": 65, "resetsAt": "2026-10-18T12:00:26.000+08:00" }
  },
  "ratio": 6.5333
}
```

Notes for the human check: this is the readable shape the new implementation writes, with no account id, no credential and no plan field — the file carries percentages, reset instants and one ratio. It is evidence that a real account has produced a ratio (6.5333) on this machine, but it is the *old* extension's document: it is not a test result of the new code and it is not proof that the new implementation composes/writes correctly. The new implementation reads a document of this shape, so a restart with it present continues from it.

## 3. Sequence expectations for the H2 observation (hand-computed, independent of the implementation)

The five-hour window is the anchor's own window. "left" is the unconsumed weekly share times the ratio; the numbers below are arithmetic on the percentages, not values read back from the code.

| Step | Report (one source, both windows) | Expected reading |
|---|---|---|
| 1 | 5h 10%, 7d 2% | `estimating…`; the baseline (10/2) is in the file at once with `ratio: null` |
| 2 | 5h 60%, 7d 7% | `left≈9.3×5h · ratio≈10.0` (50 / 5 = 10; (100 − 7) / 100 × 10 = 9.3) — in memory only until a minute after step 1's write |
| 3 | 5h 59%, 7d 6.9% | unchanged `ratio≈10.0` (49 points is below the threshold) |
| 4 | 5h 61%, 7d 7% | unchanged `ratio≈10.0` (weekly movement only) |
| 5 | 5h 100%, 7d 40% | unchanged `ratio≈10.0` (a saturated window hides later consumption) |
| 6 | the five-hour reset instant moves five hours on, 5h 5%, 7d 3% | unchanged `ratio≈10.0`; a new baseline (5/3) is written at once |
| 7 | 5h 55%, 7d 7.5% | `ratio≈11.1` (50 / 4.5 against the *new* baseline; (100 − 7.5) / 100 × 11.111 = 10.3) |
| 8 | restart the CLI | the same `ratio≈11.1` without re-learning, and later samples still span step 6's anchor |
| 9 | 7d reset moves a week on, 5h 5%, 7d 3% | unchanged `ratio≈11.1`, new baseline written at once |
| 10 | a weekly-only report (7d 20%, no five-hour value) | the held pair still renders with the stored ratio; the weekly-only report is never paired with the held five-hour value |

## 4. Normal observation steps (no quota is to be consumed for this check)

1. Isolated install: work only in an isolated copy/config (the migration's own dock/harness pattern), never the official OMP environment — P61's isolation rule. A storage root of its own (`storageDir`) keeps the real `~/.omp/cost-archive` untouched.
2. Use Codex normally (whatever prompts the user would send anyway). Do not run anything whose only purpose is to move a window by 50 points.
3. After a session, read the display's Codex line (`ratio≈… · left≈…`) and, if wanted, the root's `codex-usage-estimate.json` directly.
4. Record which of the two sources actually reported: on this recorded baseline a real Codex Turn delivers **no** HTTP response facts (`framework/docs/harness-support.md`, row `turn.provider-response-boundary`; measured in `tests/harness-dock/model-cost-codex-quota.test.ts`), so in normal use only the once-per-process startup account API answer feeds a pair — and one answer cannot qualify a sample by itself. That is a property of the host, not of this ticket's code: the sampling rules, the document and the merge are exercised with reports fed exactly as an adapter feeds them.
   > **Superseded (2026-10-13) for the acceptance artifact; the H2 item stays unverified.** The "no response facts" half holds on the *unpatched* recorded baseline only. The frozen Codex response-boundary patch (ticket 13, `tests/harness-dock/model-cost-codex-quota.test.ts`) makes a settled Turn carry the response's own headers on the patched install, with the unpatched baseline as that suite's own control, and ticket 24's combined host artifact carries both patches in one process — `tests/harness-dock/model-cost-persistence.test.ts` asserts a settled Codex Turn with the response's own headers there. Nothing above is rewritten, and no sample was fabricated or quota consumed: the P66 human check in section 5 remains **unverified, user confirmation required**.
5. If no qualifying sample occurs in the observation, record it as such: the honest outcome is "still estimating…", confirmed with the readings above. No sample is to be fabricated.

## 5. Status of the P66 human check

**Unverified — user confirmation required.** The automatic part (S2 read-only behaviour and the real independent document: merge, restart read-back, failure handling) is delivered and passing (see the ticket report). The P66 H2 item — the real ratio/left effect in normal use — is prepared above and cannot be judged by the agent, and no quota was consumed to produce it. Also note ticket 24 owns the complete cross-document P52 verification; this ticket covers the estimate document's own part of it.
