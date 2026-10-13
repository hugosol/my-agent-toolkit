# 08 工具续跑与轻量 Round 累计：实施与证据

Ticket: [`08-tool-round-totals.md`](../implementation/08-tool-round-totals.md)
Date: 2026-10-13
Delivers: P3, P14, P15
Contract: [approved contract](../contract.md) — seams S2, S5; acceptance mode Rapid iteration

## 交付的行为

1. **一个实际 Session 的连续活动就是一个 Round。** framework 从 adapter 报告的 run-cycle 事实合成 Round 轴：无开放 Round 的 start 开轮；Round 内的 start（自动续跑、排队输入被 drain、重试、子代理结束后的继续）不切轮；已排定续跑的 settle 是轮内暂停；**非续跑 settle 只是结束候选**，framework 按端口提供的 `nextTask` 在宿主的下一任务轻量复查，只有同一实际 Session 报告 quiescence（idle、无排队、无运行中异步任务）才派发 `round_end`。没有 Round 开放时 settle 不产生任何边（不伪造正常完成证据）；恢复／重载后新 binding 从无开放 Round 开始，也不会补发结束。
2. **消费只来自真实模型请求。** 工具返回没有交付事实、不增加消费；工具后的续跑请求是新 Turn，独立计数一次。Round 边界只触发该 Session 自身快照的保存，本身不入账。
3. **当前／上一 Round 由同一实例的运行期快照差分得到。** `runtime.view.roundTotals(sessionId)` 返回 `current`（开放 Round：当前自身累计 − 该 Round 开始快照）与 `previous`（上一个用完两边界的 Round：结束快照 − 开始快照）；只含该 Session 自身消费，父子活动与迟到子消费都不回填父 Round；开始快照缺失、或该 Round 跨了 period，则隐藏（返回 `undefined`），不猜零、不使用文件差值。没有历史 Round 账本，文档 schema 不变。

## 改动位置

| 位置 | 内容 |
| --- | --- |
| `framework/core/protocol.ts` | `RoundSignal`／`RoundObservation`（adapter 的 run-cycle 事实 + live `quiescent()` 读）；`HarnessPort.onRound(observer)` 改为观察订阅；新增 `HarnessPort.nextTask(callback)`。 |
| `framework/behaviors/round-events.ts` | `createRoundSynthesis`：Framework 拥有 Round 开闭与结束候选复查（候选保留、一次 next-task 复查、被后续事实取代）；`RoundLives`／`dispatchRoundEvent` 不变。 |
| `framework/behaviors/binding.ts` | 装配 synthesis，并按端口 `nextTask` 安排复查；绑定停止交付后不再派发。 |
| `framework/adapters/omp.ts` | `onRound` 改为映射 `agent_start`／`agent_end(willContinue)` 观察；`quiescent()` 变为三值（缺失事实报告一次并返回 `undefined`）；`nextTask` 用宿主自身任务队列（`setTimeout(callback, 0)`）。适配器不再自行判断 Round 边界。 |
| `extensions/model-cost/shared-logic/request-accounting.ts` | `roundStarted` 记录开始快照（含 period）；`roundEnded` 用 `differenceOf` 得到上一 Round 后按原逻辑保存；`view.roundTotals` 为只读展示 seam。 |
| `extensions/model-cost/shared-logic/runtime.ts` | 订阅 `round_start` 与 `round_end`。 |
| `tests/framework/round.test.ts` | 适配器 seam：候选延后、下一任务确认、未完工作不结束、排队／异步任务保持同轮、无开放 Round 不结束、跨 session 独立、abort／fail 共用结束位置（假定时钟）。 |
| `tests/model-cost/round-totals.test.ts` | S2 展示 seam：两轮 current／previous、父子与迟到子消费、恢复累计不是 Round、跨 period 隐藏、工具续跑合计（独立字面预期）。 |
| `tests/harness-dock/round-facts.test.ts` + `fixtures/round-facts/{entrypoint,native-run}.ts` | 隔离真实宿主：一次工具续跑 = 两个请求一轮一次保存；两次连续 prompt = 两轮；宿主 settle 与 round_end 的先后。 |
| `framework/docs/framework-capabilities.md`、`framework/docs/harness-support.md` | Round 轴与 `work.*`／`work.next-task-boundary` 条目更新；`tests/harness-dock/model-cost-accounting.test.ts` 头部关于「真实宿主取不到 round_end」的陈述按事实更正。 |

## 逐 criterion 的证据

| Ticket criterion | 证据 |
| --- | --- |
| 工具返回与 round_end 不增加消费；工具后的真实新请求增加一次；工具续跑总值使用独立字面预期 | `tests/harness-dock/round-facts.test.ts`：两次真实请求（捕获确认 2 次出站），`consumption.json` 的该 Session 记录 tokens = 手算 `{input:7,cacheRead:3,cacheWrite:0,output:7}`×2（由端点 wire 数字独立推出）；`tests/model-cost/round-totals.test.ts` 的 "a tool continuation is one Round's own consumption"：Round 合计为两笔手算金额之和，`round_end` 前后 `view.own` 不变 |
| framework 统一拥有 Round 开闭／结束候选复查；工具、已知自动续跑、排队输入、驱动继续的子等待保持同轮；子结束不能关闭父轮 | `tests/framework/round.test.ts`（工具续跑＝同一 roundId、willContinue 暂停、排队 drain、运行中异步任务、跨 session 独立）＋宿主实测同一问题（2 个 Turn 同一 `roundId`） |
| 非续跑结束先提交候选并返回，下一任务轻量复查同 Session 静止且无已知续跑才结束，不轮询、不用超时 | `tests/framework/round.test.ts`：settle 当时不派发边、下一任务确认；仍忙则不确认、后续 settle 再次核验；无空洞轮询（每个候选只安排一次） |
| 截断／恢复／重载不伪造正常完成证据；正常结束、取消、终止失败共用结束位置；不混淆活动 idle 与保存完成 | `tests/framework/round.test.ts`：无开放 Round 的 settle 无任何边；fail／abort 与普通结束同一路径；"a session still at work does not end"（settle 不等于 idle） |
| 当前／上一 Round 来自同 Session 同周期可靠运行期快照与已算金额差分；只有本 Session 自身消费，父子活动及迟到子消费不回填父 Round | `tests/model-cost/round-totals.test.ts` 全部 9 例（两轮差分、恢复累计、跨 period、父子、迟到子） |
| round_end 捕获稳定自身聚合及关系，异步提交并在 handler 返回前承接真实结果；不把一般保存变为后续事件屏障 | 既有 `tests/model-cost/request-accounting.test.ts`（保存失败与拒绝在 handler 内承接、宿主不等待 handler）＋本次文档 seam 未改该行为 |
| 受控公共事实 tests 与隔离真实工具续跑观察；无历史 Round 持久账本 | 上列 S2 与 dock 两个 suite；Round 字段不进入持久文档（本次未新增 schema 字段，`roundTotals` 只在运行期） |
| 通过批准的生产公共 seam 观察；预期独立；永久网络 tests 使用 mock | S2：`runtime.view` 只读结果与 `consumption.json`；S5：隔离 dock 真实进程。金额预期为手算字面值（差分断言用 `expect.closeTo(…,12)`，与服务端一致地承认浮点和）。永久 test 不访问网络（dock 是隔离 smoke） |
| 隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据 | dock 使用 `.cache/omp-baseline/18.5.0` 记录安装、每次运行独立 run root＋独立 user-home（`~/.omp/cost-archive`）、本地 capture endpoint；未接触正式 OMP 配置／会话／凭据 |

## 实际运行的命令与结果

- `bunx tsc --noEmit` → 无输出（通过）。
- `bun test tests/model-cost/round-totals.test.ts` → 9 pass / 0 fail。
- `bun test tests/framework/round.test.ts tests/framework/round-events.test.ts tests/framework/owner-gate.test.ts` → 30 pass / 0 fail。
- `bun test tests/framework tests/model-cost` → 439 pass / 0 fail。
- `bun test tests/connect-bot` → 142 pass / 2 fail（两个失败是 `panel-registration-lifecycle`／`no-panel-expiry` 的真实面板 20s/15s 超时，改动前 `.cache/full-suite.log` 已记录为既有失败）。
- `bun test tests/harness-dock/round-facts.test.ts` → 2 pass / 0 fail（约 4s）。
- `bun test`（全套）→ **639 pass / 4 fail**；4 个失败与本票无关且改动前即存在（[`.cache/full-suite.log`](../../../.cache/full-suite.log) 同一记录）：2 个 connect-bot 真实面板超时（20s／15s）与 2 个 `harness-dock/baseline.test.ts` 记录基线失败（本机 `oh-my-pi` checkout 停在 `579da1d…`，记录锚点为 `@9348320`）。framework、model-cost、codebase-tools、connect-bot 状态机、`harness-dock/round-facts.test.ts` 全绿。
- 变异校验（临时注入后已还原）：把确认条件放宽为「非 false 即确认」→ 缺失 quiescence 的用例失败；把 `current` 改为整段自身累计 → 差分用例失败；确认 Round 结束门禁的断言确实能测出违例。

## 真实宿主观察（隔离）

- 安装：`.cache/omp-baseline/18.5.0`（记录 baseline），isolated run root + `USERPROFILE/HOME` 指向 run root 的 `user-home`。
- 运行 1（工具续跑）：一个 prompt → 2 次真实模型请求（第 2 次请求体含 `dock-round-tool-ran`）；framework 派发 1 次 `round_start`、2 个 Turn（同一 `roundId`）、1 次 `round_end`；原生观察者记录的 `agent_end` 行排在 `round_end` 之前（本次运行该 settle 时上下文已报 `idle=true`；2026-10-09 的调查在另一场景记录到 settle 时为 `idle=false`，两种都由下一任务复查收口）；`consumption.json` 保存 `saveVersion 1`，tokens 为两次响应之和。
- 运行 2（两轮）：同一 Session 两次 prompt → 2 次 `round_start`／2 次 `round_end`，两个 Turn 的 `roundId` 不同（首轮在第二个 prompt 之前已被确认结束），保存 `saveVersion 2`，tokens 为两轮请求累计。
- 该观察关闭了 `tests/harness-dock/model-cost-accounting.test.ts` 旧头部记录的缺口：「真实 RPC 会话取不到 round_end，因此 round-end 保存不可达」。

## 未完成／未验证与请求裁决

- **H1／H2／H3 不属于本票的自动范围。** P3／P14／P15 的 Coverage 只含条件性 H3（真实 OMP 脚本多次失败或成本明显过高才转人工）；本票真实宿主脚本一次通过，**没有转交人工项**。视觉（widget 的两轮展示）由 P67／H1 及 detail/session 展示票持有，本票只交付它们要读的只读结果。
- **启动时不截断 Round。** 已批准映射写「新开始**可**截断缺少结束证据的旧轮」，而既有行为测试与 OMP 事实都要求「开放 Round 内的 start 是同一轮内的工作」（排队 drain 与 retry 的 start 无法与用户新 prompt 的 start 区分，猜错会切碎真实轮或伪造结束）。因此本实现选择「永不因 start 截断、也不缺证据补发结束」这一许可分支；`RoundLives` 的截断规则保留为身份模块自身的规则（仅当有边在开放轮上被派发时适用，合成不会这样派发）。如后续票需要真实截断语义，请裁决后另开。
- **period 变更的运行期路径**已实现并测试（本实例重新加载另一 period 后隐藏 Round），但与真实 `/budget clear`／holiday 周期动作的贯通仍由 period 票（19）持有。
- 07 的证据资产 `.scratch/model-cost-migration/assets/07-request-price-accounting-evidence-2026-10-13.md` 记录的命令结果早于本次 Round 边界改动（其 `request-accounting.test.ts` 22 pass 等数字需对新树重跑），其「平台事实与已知限制」中「真实宿主取不到 round_end」一条现已不成立。本次没有修改该资产（属 07 的范围）。
