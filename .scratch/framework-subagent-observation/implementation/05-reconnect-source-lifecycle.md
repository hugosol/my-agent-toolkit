# 05: 重连恢复快照，失效撤销读数但保留身份

**What to build:** 有效重连立即恢复当前可用观察，不重放历史 Turn 或 Round。重复、迟到和旧来源关闭不能覆盖或撤销更新有效来源的读数；正常撤销或接收侧观察到关闭／错误后，只撤销所属来源实时活动和上下文，保留可靠身份、父关系和已保存消费。

**Delivers:** P5, P6, P7, P8

**Blocked by:** 04 — detail 展示未提交会话、嵌套后代与续跑身份。

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P5–P8 全部 coverage 与测试；来源代际及顺序表示可自行选择，但不能新增心跳、轮询或看门狗。

- [x] 断开期间状态变化后重连，立即接收最新快照，无须等待再次变化，且没有额外 Turn／Round 或计费生命周期交付。
- [x] 通过真实进程和可控制交付顺序验证重复、迟到、旧来源退出；新来源给定读数保持，不以概率性 sleep 保证顺序。
- [x] 正常释放与真实子进程异常退出分别触发所属来源不可用；共同 interface 读取不可用，实际 detail 不残留 Working 或实时上下文。
- [x] 不可用不能冒充 Idle、任务失败或完成，不伪造计费生命周期。
- [x] 对照断连前后树与消费，可靠身份、直接父关系和已保存消费均保留；仅实时登记而未提交消费的身份在本次 Owner 运行中保留，不新增磁盘持久化。
- [x] 旧连接关闭不清除新连接的活动或上下文；资源正常撤销不依赖即将退出的进程成功发送最后一条通知。
- [x] 按仓库测试规范执行受控时序测试、真实关闭／异常退出和实际 detail 观察，覆盖所属分区及受影响消费者；TypeScript 变化执行 typecheck，保存可归因日志与环境限制。

## 本票执行记录（2026-10-17，实现完成后交集成复核）

实现：`ObservationSource` 与 `SessionObservationSink`（`framework/core/protocol.ts`）、来源归属与 `withdrawSource`（`core/observations.ts`）、binding 的 adopt/lost 与 `session_unobserved` 投递、活动轴 `forget`、本机接入按连接编号并在连接关闭时陈述来源结束（`modules/local-access.ts`）、model-cost 的不可用处理与重绘。

证据与逐项对照：见 [evidence/05-reconnect-source-lifecycle-evidence-2026-10-17.md](evidence/05-reconnect-source-lifecycle-evidence-2026-10-17.md)（含 `bun run typecheck` exit 0、`bun test tests/framework` 563 pass / 0 fail、`bun test tests/model-cost` 483 pass / 0 fail、故障注入逐项变红复原、以及第一次分区运行中一例与基线对照的非本票失败说明）。

未验证：真实 harness（pi / OMP）与本票新增失效路径的运行证据、POSIX 平台证据；两者在证据文件中显式标注。
