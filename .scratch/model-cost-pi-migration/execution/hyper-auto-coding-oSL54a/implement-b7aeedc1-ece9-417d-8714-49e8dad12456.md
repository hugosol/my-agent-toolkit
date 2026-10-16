# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "12-session-spanmd-725f442f-c64a-4626-835d-6863eb",
  "head": "36fd7420d07ad01d4bab3a999360237ec98b3e97",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "12-session-span（P28）",
  "status": "partially delivered — the pi-seam span coverage is committed and green; the real-host smoke phase and its evidence record were not produced in this run",
  "commit": "36fd742 on hyper/model-cost-pi-migration/12-session-span-33cab2-411dc288ea83 (worktree C:/Users/hugos/AppData/Local/Temp/hyper-ticket-7gDeaC, based on 4d1f431 of pi-adapter)",
  "delivered": {
    "new file": "tests/model-cost/pi-session-span.test.ts (682 lines, 4 cases)",
    "seam": "S1 (framework public binding through the real pi adapter) + S2 (the production pi frontend's own widget lines, and pi's `/budget` command path) + S3 (the real `consumption.json` under the `pi` harness bucket, plus a second assembly reading it back)",
    "cases": [
      "timeline: no submission → unknown (dash); a whole settled exchange before any submission still leaves it unknown; the submission establishes the start; the tool-requesting response's settle ends it (0:05:00); 30 min of idle + the tool tail + pi's low-level run end (`agent_end`) move nothing; the follow-up settle moves the end to that Turn's own instant (0:40:00); the Round's own end a minute later does not — the document's pair equals the suite's own clock reads",
      "restore/resume: the pair the document already carries (09:30–09:40, independent data) is drawn as 0:10:00; the next submission (10:30) does not restart it; the span continues to 1:06:00 and the commit carries {saved start, new settle}",
      "fork: the source's own 4-minute span; `session_start` reason `fork` reads unknown (—) although its transcript is a copy; the fork's own input+settle read 0:03:00; both records keep their own pairs in the `pi` bucket, the fork with no parent",
      "non-substitution: the main session's live 18-minute span beside the loaded document's two subagent runtimes (25 m / 40 m); via `/budget detail` the Total reads Span: 0:18:00 and the rows read Run: 25m / Run: 40m, the Total carrying neither a child's runtime nor their 65-minute sum; a second assembly over the same root reads all three back"
    ]
  },
  "verification actually run": {
    "bun test tests/model-cost/pi-session-span.test.ts": "4 pass / 0 fail, 33 expect() calls (final state)",
    "bun run typecheck": "exit 0",
    "bun test tests/model-cost": "384 pass / 0 fail, 1967 expect() calls, 30 files",
    "fault injection 1 (violation: the Round end moves the span — `spans.ended(sessionId, now())` in `roundEnded`)": "all 4 cases failed; injection reverted, green re-confirmed",
    "fault injection 2 (violation: a settle establishes the start — `spans.input(sessionId, endedAt)` in `turnedSettled`)": "case 1 failed; reverted, green re-confirmed",
    "environment": "bun 1.4.2 on Windows x64; `bun install --frozen-lockfile` was required first (node_modules was absent, `yaml` missing) — 6 packages"
  },
  "acceptance criteria": {
    "独立时间轴覆盖输入、空闲、工具尾部、同会话恢复、fork 与新周期下一次输入；不把工具结束作为 Turn 结束": "covered by cases 1–3 except 重置/新周期下一次输入 (not covered — see gaps); the tool-tail claim is carried by the exactness of the end (identity with the Turn's own settle instant, with the Round end a minute later moving nothing) after the idle-tool stretch",
    "两个子代理耗时明显不同于主会话跨度的独立数据，对照输出与恢复，确保三者不互相替代": "case 4 (18 m span vs 25 m / 40 m runtimes; drawing and a second assembly over the same root)",
    "无需等待完整子代理耗时或后台终止路线；通过独立文档/受控周期切换验证重置边界": "reused evidence: tests/model-cost/period-switch.test.ts (P20/P21) covers clearing the span at a reset and the new period's next-input start; no actual clear/holiday was run (ticket 15's)",
    "P28 完整 Coverage（S1、S2、S3）": "S1/S2/S3 exercised on the pi seam except the reset segment (reset reused from the port-double suite); no real-pi-host run in this ticket"
  },
  "gaps / unfinished (blunt)": [
    "No real-host pi run for this ticket: no phase was added to `scripts/pi-model-cost-smoke.ts`, so no real pi 1.2.0 submission/`message_end` → saved span, no real idle-window growth check, and no `evidence/12-session-span.md` was written.",
    "The pi assembly path in this file is *mirrored*: `piAdapter(MODEL_COST, { configBaseDir, factory })` composing the same parts as `modelCostPiHarness` (real pi adapter, real definition, real runtime from the framework's validated config, real frontend with its release composed into the framework's cleanup), with the storage root stated by the test. Reason, established by observation: the framework reads one extension's configuration once per process (`framework/core/config.ts`, `validatedConfigs` keyed by definition id), so a second suite in the same process cannot get its own storage root through `modelCostPiHarness`; running the model-cost partition with the production assembly made this file fail exactly that way (380 pass / 4 fail). The production assembly object itself therefore relies on ticket 02's real-pi evidence, not on this file.",
    "Reset on the pi path is NOT covered: the attempt (commit a round, then write the file with another periodId, then drive the next round with consumption; expected `stale-period` refusal → cleared span → new period's next input) instead reported `saved` and kept the closed period's start (drawn `Span: 1:09:00`), i.e. the instance adopted the replaced period without dropping the observed span; the failing case was removed rather than left red. Harness facts for a follow-up: the framework's `nextTask` is `setTimeout(0)` (`framework/adapters/pi.ts`) and the file coordination polls at 25 ms (`framework/modules/files.ts`), so a faked-timer suite must advance the clock by 25 ms per wait turn — a pure `setImmediate` loop starves the timer phase in Bun 1.4.2, and `vi.advanceTimersByTime(n)` moves the fake clock by n+1 ms.",
    "Not run: `bun run test` (whole repo), `tests/harness-dock` (real OMP host), the real pi smoke, and the human-led items (P51/P52/P53) — all untouched."
  ],
  "handoff": "Worktree is clean apart from the commit; no other ticket file, workflow report or integration branch was modified, and no integration branch worktree was touched."
}
