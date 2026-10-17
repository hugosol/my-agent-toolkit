# 06: State follow 与会话观察独立运行

**What to build:** 同进程和跨进程子会话均在语义使用时取得 Owner 当前权威 State，而非永久启动快照。观察与 follow 独立声明和管理，没有 follow 字段仍能观察；brief/detail 只是展示偏好，不建立或拆除观察来源。观察和 follow 都不赋予远端写 Owner State 的能力。

**Delivers:** P21, P22, P23

**Blocked by:** 04 — detail 展示未提交会话、嵌套后代与续跑身份。

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P21–P23 全部 coverage 与测试，复用现有 State 缺值默认与恢复政策，不增加新的 State 权威。

- [ ] 两种进程模式分别验证初始读取及 Owner 值从 true 改 false 后的后续语义读取；实际跨进程使用取得 false，不能把不可达时默认值计为成功读取。
- [ ] 一次语义处理内相关读取使用所取得的一致快照，不要求每个 getter 分别通信；同进程直接读取，跨进程复用 framework Local access。
- [ ] 读取及观察更新后 Owner 的独立给定值不被修改；错误方向、未声明操作及远端 State 写入被拒绝。
- [ ] 无 follow 字段扩展在实际进程中仍可完成登记与更新，观察启用不依赖 follow 字段存在。
- [ ] brief 期间更新后切 detail，实际表面显示最新读数；重复切换不重复来源、不停止采集、不重建观察连接。
- [ ] 按仓库测试规范覆盖 State 消费者、真实进程读取和实际展示切换，执行所属分区；TypeScript 变化执行 typecheck。记录读到权威值的证据与未验证限制。

## Comments

### 2026-10-17 执行记录（P21、P22、P23）

实现与证据见 [证据文件](evidence/06-follow-observation-independence-evidence-2026-10-17.md) 与
[分区日志](evidence/logs/06-partition-framework.log)、[model-cost 分区日志](evidence/logs/06-partition-model-cost.log)。
要点：

- **一处源码修复（P21 的进程模式不一致）**：进程内被跟随的读取走 `openOwnerAccess` 的 `directCaller`，而它的
  `ended()` 只在自身 `dispose()` 时置位，于是 Owner 生命结束（cell 退休、offer 撤回）或同一 owner 被重新进入后，
  这条 access 仍回答**旧生命的值**（永久快照的另一形态）。跨进程不受影响：seat 半边都释放后 host 销毁连接，
  远端调用方自行失效并重连。修复（`framework/modules/local-access.ts`，3 处）：`directCaller(target, seat,
  source)` 增加 target，`ended()` 补充「本进程为该 seat 提供的 values 半边已不是当初的 source」；调用点传
  `options.target`。afterwards 两条路径含义一致：退休 seat 只答声明默认值，新生命读取取得新生命当前值。
- P21–P23 其余语义由既有实现承载（`state.ts` 的 `followed`/`view`、`followed-owners.ts` 的读取半边、
  `binding.ts` 的 owner seat 接收、`observations.ts` 的进程观察源）；未新增 State 权威、公开接口或来源存储。
- S1／S2：新增 `tests/framework/follow-observation-independence.test.ts`（4 例）——进程内 follow 直读
  （读取指向不存在的配置文件仍读得 Owner 真值，证明确实走进程内 seat）、Owner true→false→true 的后续语义读取、
  access 随 Owner 生命耗尽且新生命数值可读、无 follow 字段的真实子进程（真 record／端点）登记与后续更新、
  远端读数采纳后 Owner 独立给定值不变。
- S2／S3：新增 `tests/model-cost/form-observation-independence.test.ts`（1 例）——`MODEL_COST` 声明
  `inheritance: none`，真实交付进程 + 生产前端：brief 期间读数已采集但不画树，切 detail 后行显示
  `Ctx: 10% (45,000/450.0K)`；detail 期间再更新与重复切换后分别显示 `90,000`／`120.0K`；会话行恒为 1 行，
  交付进程 `reached: true`、`ended: false`，三条读数都经同一接入送达（未重建连接、未停止采集）。
- 判定：`bun run typecheck` exit 0；`bun test tests/framework` **559 pass / 0 fail**；
  `bun test tests/model-cost` **479 pass / 0 fail**；既有两个进程证据套件
  （`owner-follow.test.ts`、`owner-follow-processes.test.ts`、`session-observation-access.test.ts`）
  **22 pass / 0 fail**。三处变异注入（丢弃接入推送变化 → 退回启动快照；观察 seat 只在有值半边时接收；
  进程内 access 一律报耗尽）各自被对应用例捕获，还原后全绿；修复自身的红为修复前的新用例 2。
- 未验证：真机 pi CLI 与 OMP 真机（P34／P35 由票据 12 承载，本票未跑 `pi-subagent-smoke` 与 dock 分区，
  避免共享工作树内与同伴票据的运行冲突）；POSIX 载体；pi 1.3.0 之外的版本；「seat 两半边都持有时连接也在
  边界被销毁」为代码推断，未单独取证。
- 合并注意：`local-access.ts` 的 `directCaller` 与票据 05 的同函数改动重叠——取本票的签名、`ended()` 与调用点，
  保留票据 05 的 `nextSource()`／`seat.readings?.adopt(asSource, reading)`，其 `SessionObservationSink`
  不可退回裸函数 sink。
