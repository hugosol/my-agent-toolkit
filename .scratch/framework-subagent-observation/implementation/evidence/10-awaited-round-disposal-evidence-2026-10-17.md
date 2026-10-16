# 10 — 正常处置等待 Round 收口与自身保存（P27、P28、P29）

实现提交：`10: 正常处置等待 Round 收口与自身保存（P27、P28、P29）`（本 worktree 分支，基线 `cf2303a`）。
平台：Windows 10.0.26200，bun 1.4.2，pi 1.3.0（`D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`）。

## 交付的语义

- `HarnessPort.onDisposal?`（`framework/core/protocol.ts`）：harness 在自己的可等待退出位置报告一个实际会话的真实终止；`SessionDisposal` 携带该会话自己的事实、owner、`hasUI` 与反馈通道。只有真正离开的会话才报告，transferred（`new`/`resume`/`fork`）、改名、查看切换都不是处置。
- `RoundSynthesis.dispose`（`framework/behaviors/round-events.ts`）：会话已声明但未确认的结束在此**确认**；没有结束声明的 open Round 按**截断**收口。该边派发给订阅者，`dispatchToGroups` 现在回传所有 handler 的 settle，因此报告只在收口完全settle后才回答宿主。候选在此被消费，先前安排的 nextTask 重检不再重复交付；重复处置与迟到 settle 都不再产生边。
- `round_end` 现在携带 `ending: RoundEnding = "confirmed" | "truncated"`（`framework/public.ts` 导出），使消费者可公开区分“工作完成”与“工作不再可观测”，且不引入任何结局/成功声明。
- `framework/behaviors/binding.ts`：仅当该 binding 观察 round/Turn 轴时注册 `onDisposal`（无可收口的簿记就不索取）。
- `framework/adapters/pi.ts`：`session_shutdown` handler 变为 async，在 `END_REASON` 为 `disposed` 时 `await reportDisposal(...)`，**之后**才投递 session axis 的 `session_end`（即撤销观察席位、放弃查看订阅、运行 cleanup）。该进程级读取释放（`state.dispose()` / `deliverer?.dispose()`）的注册移到 binding 之后：两个订阅回答同一原生事实，pi 依注册顺序 await，因此收口与提交提示先完成，载体才释放。
- `extensions/model-cost`：截断的 Round 不贡献区间（`SubagentRuntimes.activityTruncated()`），标记本周期该 Session 的耗时观测不完整（`runtimeGap`）并以 warning 通知操作者；真实上报的 usage 仍按自身身份提交，不补算未知量或完整耗时，也不声明任务成功。

## 验证（实际执行）

| 命令 | 结果 |
|---|---|
| `bun scripts/pi-subagent-smoke.ts --background-only --expect-pi-version 1.3.0`（改动前） | exit 1：真机 pi 1.3.0 后台子会话自身的消费从未落盘（`logs/10-pi-background-before.log`，停在既有已知失败 “the asynchronous child's consumption is saved”） |
| 同命令（改动后） | exit 0：10/10 观测通过，含 “the child's own consumption was saved under the child's own identity by its own process”（`logs/10-pi-background-after.log`） |
| `bun test tests/framework` | 555 pass / 0 fail（含新增 `round-disposal.test.ts` 10 例、`pi-disposal-round-close.test.ts` 7 例） |
| `bun test tests/model-cost` | 471 pass / 0 fail（含新增 `pi-disposal-round-close.test.ts` 5 例） |
| `bun run typecheck` | exit 0 |

确定性证据对应的验收面：

- **P27**：settle 已声明、尚未确认的 Round 在 dispose 时被确认，且宿主等待位置在 handler settle 后才返回（`round-disposal.test.ts`、`pi-disposal-round-close.test.ts`、真机后台 smoke 前后对照）。
- **P28**：无 settle 的 open Round 按截断收口；`ending: "truncated"` 公开可区分；落盘仅含真实上报的 usage，`runtimeGap: true` 且完全不写 `runtimeMs`，通知为 warning（`round-disposal.test.ts`、`tests/model-cost/pi-disposal-round-close.test.ts`）。
- **P29**：可控制完成的异步 handler 证明完成前不清理（binding 释放的 session axis 结束在 handler settle 之后）；顺序为收口 → 等待 handler 与保存 → 通知 → 释放/返回；重复处置、迟到 settle 与重复 shutdown 恰好一次；handler 失败被包含并上报且不冒报成功（`round-disposal.test.ts`、`pi-disposal-round-close.test.ts`、`tests/model-cost/pi-disposal-round-close.test.ts`）。
- **P33（不影响既有承诺）**：transferred（`new`）不关轮，之后的正常 settle 仍按 confirmed 收口（`pi-disposal-round-close.test.ts`、`tests/model-cost/pi-disposal-round-close.test.ts`）。

## 未验证 / 限制

- **真机截断场景**：本次未取得真机（pi 1.3.0）上“会话处置时 open Round 无 settle”的运行证据。确定性证据覆盖截断语义（S1）与进程内 pi 装配（`tests/model-cost`：真实 adapter + 真实 runtime + 受控原生面）；真机证据仅覆盖 confirmed-at-disposal（后台短寿命子会话）。pi 的 `quit` 路径在 `teardownCurrent` 中先 `await session.abort()`（abort 等到 idle，即 settle 必先发生），而未 abort 的 `reload` 路径本次未在真机上驱动。
- **`tests/harness-dock` 分区未运行**（harness-facing 变更的完整分区），也未执行全仓 `bun run test`。
- POSIX 载体、其他 pi／宿主版本、真机 OMP 未运行。
- 整体收口截止（15 秒）与截止下的故障结果（P30、P31）由票据 11 交付，本票据未实现。
