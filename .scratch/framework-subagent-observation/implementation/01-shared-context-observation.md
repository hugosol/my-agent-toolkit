# 01: 共同上下文观察与首次快照

**What to build:** OMP 与 pi 的会话通过 framework 共同消费 interface 向扩展提供当前上下文及首次接入时已有的当前观察，不必再发生一次状态转换才能读到。adapter 负责原生事实采集，扩展仅消费共同 interface；迁移后移除扩展并行原生采集路径。

**Delivers:** P4, P11, P12

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有所列 promises 的完整 coverage 与验收测试；后续跨进程接线由 03 负责，不将本票实际 OMP、pi 采集与共同消费验证推迟到最终集成。

- [ ] 会话先处于 Working，再建立共同观察订阅；不产生第二次状态转换，仍立即取得 Working 与独立给定的上下文。复用共同活动事实，不在扩展另造 Round 判断。
- [ ] 会话启动、消息结束及宿主可靠执行收敛位置采集 tokens 与采集时对应模型；同一独立给定序列经 OMP、pi 映射产生相同观察。
- [ ] 实际 OMP、pi 运行中，扩展通过共同 interface 取得读数；显示采用对应模型渠道的显示预算，而非宿主 context window。
- [ ] 移除扩展对共同采集所覆盖原生事件的并行订阅，避免重复交付；原生差异保留在 adapter，扩展 shared logic 不依赖原生事件或载体。
- [ ] 按仓库测试规范执行相关确定性测试、所属分区及受影响消费者；TypeScript 变化执行 typecheck，并取得实际宿主与消费表面证据。记录环境、命令、结果及未验证项；未观察不得计为通过。

## Comments

- **集成冲突解决（本轮由集成 helper 执行）**：宿主把 02 的集成提交 `31e1509a`（`hyper-tdd` 当时的尖端）合回本票分支（合入前 HEAD `f2df2c9`），共同消费面在 7 个文件冲突：`framework/core/protocol.ts`、`framework/behaviors/{binding,round-events,subscriptions}.ts`、`framework/public.ts`、`framework/README.md`、`framework/docs/framework-capabilities.md`。本工作树即冲突现场，本轮解决并提交为合并提交 **`1e53262`**（父 `f2df2c9` 与 `31e1509a`）。口径为两轴并存、不丢任一侧：
  - `protocol.ts`：`AgentActivity` 只留一份（02 活动轴的定义），本票上下文块内的重复定义删除（否则重复标识符）；`SemanticEvent` 与 `SemanticEventDeliveryMap` 同时携带 `session_activity` 与 `session_context`；两侧新增类型全部保留。
  - `behaviors/round-events.ts`：一次 Round 边沿既写入本票的会话观察源（`observations?.observeActivity`，供迟到接入读取），又驱动 02 的活动轴（`activity.observe`）；`ACTIVITY_OF_EDGE` 改为从 `behaviors/session-activity.ts` 导入，删除本票内联占位（其注释已预告该替换）。`RoundSynthesisInputs` 并行接收源与活动轴。
  - `behaviors/binding.ts`：组观察 round / Turn / 活动 / 上下文任一时注册 Round 钩子（并集，保留本票「消费源内活动者亦需该簿记」与 02「派生读数出自同一转换」两条理由），并把源与活动轴都交给合成。
  - `behaviors/subscriptions.ts`、`public.ts`、`README.md`、`docs/framework-capabilities.md`：两条轴并列登记；capabilities 表内被合并的 `SemanticEvent` 行锚点改指合并后实际行（`#L989` / `#L1032` / `#L992`），per-axis handler 别名行 `#L266` → `#L381`。
  - 自动合并面逐项复核（`git diff HEAD -- <file>`）：`extensions/model-cost/shared-logic/runtime.ts`（02 的 `session_activity` 处理器与本票的 `session_context` 处理器、`sessionObservations` 活读视图并存）、`tests/framework/support/harness-port-double.ts`、`docs/adr/0002…`、`framework/docs/harness-support.md`、`tests/model-cost/detail-tree.test.ts`、`tests/framework/pi-round-mapping.test.ts`、02 的票面与新增测试/fixture——均只叠加 02 的改动，无本票内容被丢弃或改写。
- **本轮集成验收（合并树 `1e53262`）**：`bun run typecheck` → exit 0（干净）。
  - 按检出原样 `bun run test` → **1256 pass / 5 fail**（1261 tests / 136 files / exit 1）。5 例全在 `tests/connect-bot/**`（P23–P27），失败原因逐条相同：`the interop run needs the actual omp-bot panel, but no binary is at C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`——本机前置缺失，与两票改动均无接触面。
  - 指认既有本地 release 构建（`OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`，10 月 9 日构建、非本轮产物；只设环境变量、未改仓库文件）后：`bun test tests/connect-bot` → **142 pass / 0 fail / exit 0**；`bun run test` → **1261 pass / 0 fail / 7122 expect / 136 files / 399s / exit 0**。
  - 行尾：本检出的 `bun.lock` 与两份 `host-patches/*/patch.diff` 均为 LF（`grep -c $'\r'` = 0），故上一轮记录过的 CRLF 引起的 dock／锁文件失败本次未出现，无需归一检出。
  - 日志：`C:\Users\hugos\AppData\Local\Temp\integrate-01-full-test.log`（原样）、`integrate-01-connectbot.log`、`integrate-01-full-test-withbinary.log`。
- **本轮修复：无源码修复。** 冲突解决后 typecheck 干净、补齐面板前置后全仓零失败，故未改产品源码；本轮只产生合并提交 `1e53262` 与本记录提交。
- **未因全绿而改变的限制**：POSIX 未执行；实现报告中的未验证项（如 pi 实际宿主绘制出的子代理 `Ctx` 字段）原样成立；复杂脚本、实机 smoke 与跨票据整体验收留给最后独立门禁。未操作集成工作区、未切换分支、未新建 worktree、未 reset、未调用 retro，亦未自行合入 `hyper-tdd`（合入由宿主排队）。
- **票据状态**：Status 行保持 `ready-for-agent`——按 `docs/agents/triage-labels.md`，`closed` 要求已合入，而合入由宿主排队执行，本票不自改状态。
