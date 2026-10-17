# 11: 退出总截止有界，准确报告保存结果

**What to build:** 正常处置自进入收口起采用默认 15 秒总等待上限，不重置在途预算或追加固定延迟／自动重试。截止时区分可靠取消的未提交与已开始但结果未确认；Owner 不可达或不回应不阻止子会话本地结算和有界退出。

**Delivers:** P30, P31, P32

**Blocked by:** 10 — 正常处置等待 Round 收口和自身保存。

**Status:** in-progress（实现与验证已完成；待在集成分支合入后由集成方置 `closed`）

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P30–P32 全部 coverage 与测试，遵守已批准的截止取舍：停止等待不是证明更新已取消，不改变通用文件更新的既有取消语义。

- [x] 可控时间验证从进入收口计时的 15 秒总截止、临界点和在途已用预算；已完成路径立即收口，不重置预算、不叠加固定延迟或额外自动重试。→ `tests/framework/close-out-deadline.test.ts`（平台假时钟：`deadline = 进入 + budget`、`remaining()` 随时钟下降且预留观测分辨率、声明只收紧默认 15000、已收口路径回答后 `vi.getTimerCount() === 0`）；真机两次实测 14997ms / 15002ms 对照 15000ms 应用截止。
- [x] 排队／锁等待可可靠取消时，截止诊断为未提交且无成功提示；结合实际文档证明结果，不仅检查超时异常。→ `tests/model-cost/close-out-deadline.test.ts`（真实跨进程持有锁：通知为“没有写入…（timeout：会话处置收口等待 300ms 已到）…未保存的消费已丢弃”、无成功提示、文档中无该会话记录、框架无“未确认”声明）；`tests/framework/close-out-deadline.test.ts` 同场景真实 `updateFile` + 文档；真机阶段 2 同上（15000ms）。
- [x] 已进入实际更新但截止前未确认时，报告保存结果未确认，不声称必然未写、已取消或提交成功；诊断与实际文档共同呈现结果。→ `tests/framework/close-out-deadline.test.ts`（真实 `updateFile` 停在更新内：截止时旧文档仍在、锁未被释放给他人、解除后新文档落盘；框架诊断为“unconfirmed”且明确不声明取消/未写/成功）。
- [x] 不提前释放仍由更新持有的锁，不以停止 await 假装停止写入；其后仍以实际成功发布的完整文档为权威，不增加事务日志、强杀恢复或新存储协议。→ 同上用例（另一写入者在截止后仍 `timeout`；解除后发布的完整文档成为文件内容）；`framework/modules/files.ts` 仅新增 `WAIT_RESOLUTION_MS` 导出，既有取消语义未改。
- [x] 实际子进程在 Owner 缺失、断开及不回应场景下仍能完成本地文件提交与有界退出；保存及 shutdown 无等待 Owner 确认、同步或绘制的依赖。→ `bun scripts/pi-close-out-smoke.ts` 阶段 1：真机 pi 1.3.0 上会话由无人服务的会话文件派生（adapter 沿 pi 自身血缘解析出 `inherited` owner，而服务它的进程不存在），自身请求记账并提交（own input 1000/output 200），关闭进程 12ms 退出 exit 0，无“未写入/未确认”通知。
- [x] 真实故障运行记录等待时间及调度误差，区分应用截止与 OS 调度，不要求毫秒级硬实时，也不把正常处置保证扩张到强杀、崩溃或断电。→ 同脚本阶段 2：锁被另一进程真实持有时，从“告诉 pi 停止”到退出两次实测 14997ms / 15002ms（应用截止 15000ms，差 −3ms / +2ms 即本平台调度与拆卸开销，两侧都出现）；文档同述保证止于正常处置。
- [x] 按仓库测试规范执行受控截止、锁等待与更新中场景，覆盖所属分区和受影响消费者；TypeScript 变化执行 typecheck。取得真实进程、文件及诊断证据，记录命令、环境和限制。→ `bun test tests/framework` 561 pass / 0 fail；`bun test tests/model-cost` 480 pass / 0 fail；`bun test tests/codebase-tools` 24 pass / 0 fail；指明 `OMP_BOT_BINARY` 后 `bun test tests/connect-bot` 142 pass / 0 fail（未指明时 5 例真机面板用例在 setup 处因缺二进制失败，与本改动无关）；`bun run typecheck` exit 0；真机脚本 11/11 观测通过（61.8s，连续两次一致）。

交付与验证记录：[证据文档](evidence/11-bounded-shutdown-outcomes-evidence-2026-10-17.md)（含命令、环境、故障注入、未验证项与限制），运行日志见 `evidence/logs/11-*.log`。
