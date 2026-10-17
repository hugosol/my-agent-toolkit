# 11 — 退出总截止有界，准确报告保存结果（P30、P31、P32）

实现提交：本 worktree 分支，基线 `e50c574`（票据 10 已合入）。
平台：Windows 10.0.26200，bun 1.4.2，pi 1.3.0（`D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`）。

## 交付的语义

- `CloseOutWait`（`framework/core/protocol.ts`）：**处置派发的那条 `round_end` 边**携带该次收口的等待——`budgetMs`（整段预算，默认从进入收口计时的 15000ms）、`deadline`、`remaining()`（剩余量：向下取整到整毫秒，并预留该框架自身等待的观测分辨率）。由观察事实产生的普通边一律不携带，任何 handler 都不会借用一个没有人正在等待的位置的预算。
- `SessionDisposal.closeOutWaitMs?`：宿主自己的可等待位置若有自己的等待上限就声明它；框架取它与此框架默认值中的较小者——声明只能收紧，绝不放大默认上限。
- `RoundSynthesis.dispose`（`framework/behaviors/round-events.ts`）：预算在**进入收口时**计算（早于边的构建），随后最多等到该 deadline。收口先于 deadline 结束就随其工作立即回答，并清掉计时器（不留任何等待、不叠加固定延迟）；到 deadline 仍未收口，则在诊断通道声明该边未完成的工作**结果未确认**，明确不声明“已取消 / 必然未写 / 已保存”，并说明磁盘上实际发布的完整文档为准。无重试、无轮询、不重置在途预算。
- `framework/modules/files.ts`：新增导出 `WAIT_RESOLUTION_MS`（= 该模块等待的轮询间隔 25ms），作为“一次等待多久才能观测到一个条件”的单一来源。**通用文件更新的既有取消语义未改动**：预算与信号只作用于等待，更新一旦开始便等真实结果；未提前释放他人持有的锁，也未新增存储协议。
- `extensions/model-cost`：`ConsumptionStore.commit(harness, record, wait?)` 把调用方声明的等待原样交给 `updateFile`，自身不持有任何预算；`round_end` 的保存把收口的 `remaining()`（下限 1ms，即“立即尝试”）作为自己的等待上限，不再领取新的 15 秒。等待被收口截止结束时，通知点名 `timeout：会话处置收口等待 <budgetMs>ms 已到`、“没有写入”、以及“未保存的消费已丢弃”，不产生任何成功提示；收口内其他失败（如 I/O）只陈述自己的 kind。更新已开始时不被截止打断，其后由它自己的真实结果与发布的文档说话。

## 验证（实际执行）

| 命令 | 结果 |
|---|---|
| `bun scripts/pi-close-out-smoke.ts`（本票新增，真机 pi 1.3.0） | exit 0：11/11 观测通过，61.8s；连续两次运行结果一致（`logs/11-pi-close-out-smoke.log`） |
| `bun test tests/framework` | 561 pass / 0 fail（47 文件，2513 expect，41.7s；含新增 `close-out-deadline.test.ts` 6 例）（`logs/11-framework-partition.log`） |
| `bun test tests/model-cost` | 480 pass / 0 fail（45 文件，2626 expect，16.1s；含新增 `close-out-deadline.test.ts` 2 例）（`logs/11-model-cost-partition.log`） |
| `bun test tests/codebase-tools` | 24 pass / 0 fail（7 文件，334 expect，53.5s）（`logs/11-codebase-tools-partition.log`） |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 142 pass / 0 fail（18 文件，689 expect，76.9s）（`logs/11-connect-bot-partition.log`） |
| `bun run typecheck` | exit 0 |

真机脚本两相（命令、环境与限制见文末）：

- **阶段 1（Owner 缺失，正常处置）**：会话是 pi 自己记录为由一个会话文件派生（`parentSession` 指向本 run 内、写下但没有任何进程服务的文件），因此 adapter 沿 pi 自己的血缘锚点把它解析为 `inherited` owner——owner 是被**具名**解析出来的（不靠名称/目录形状/PID 猜测），而服务它的进程并不存在：这正是“spawned 会话的 Owner 进程已经消失”的生产形态。其自身请求被自身进程记账并提交（`own` 为 input 1000 / output 200，1 次真实请求），关闭进程后 **12ms** 即退出（exit 0，未超时），且没有任何“未写入/未确认”通知——本地结算与退出不等待 Owner，也不依赖 Owner 的确认、同步或绘制。
- **阶段 2（真机故障：文档锁被另一进程真实持有）**：Round 在会话被停止时仍打开、消费已记账未提交（2 次真实请求，文档中该会话无记录）。从“告诉 pi 停止”到进程离开两次实测为 **14997ms** 与 **15002ms**，对照契约的 15000ms 应用截止为 **−3ms / +2ms**：等待由应用截止（15 秒）计量，本平台的调度与拆卸开销在数毫秒级、且两侧都出现，因此不把毫秒级精度当作承诺（区分了应用截止与 OS 调度）。操作者收到“没有写入…（timeout：会话处置收口等待 15000ms 已到）…未保存的消费已丢弃”，没有任何成功提示；文档中该会话仍无任何记录；持有锁的写入方其锁从未被提前释放，它自己发布的文档成为文件内容。

## 确定性证据对应的验收面

- **P30 / 验收项 1（总截止、临界点、在途预算、已完成路径、无固定延迟/重试）**：`tests/framework/close-out-deadline.test.ts` 用平台假时钟精确验证：`deadline = 进入收口 + budgetMs`；`remaining()` 随时钟逐毫秒下降（在途已用预算被计入、不被重置）；已完成路径随工作立即回答、回答后**不留任何计时器**（无固定延迟、无自动重试）；宿主声明的等待只收紧默认值（400→400、更长→15000、未声明→15000）。真机阶段 2 的 14997ms / 15002ms 是同一截止在真实进程上的两次读数。
- **P31 / 验收项 2（可靠取消 → 未提交、无成功提示、以文档为证）**：真实跨进程锁等待下，`updateFile` 以 `remaining()` 为预算在截止前被拒（`kind: "timeout"`，即“从未写入”），文档未变；model-cost 通知为“未提交/已丢弃”，框架**没有**产生“未确认”声明（`tests/model-cost/close-out-deadline.test.ts`、`tests/framework/close-out-deadline.test.ts`、真机阶段 2）。
- **P31 / 验收项 3、4（已开始的更新 → 未确认，且不假装停止）**：在真实 `updateFile` 中把更新函数停在协调范围之内：截止到时框架只声明“unconfirmed”并回答宿主；该更新持有的锁不被提前释放（本进程另一写入者仍 `timeout`）；解除后它发布的完整文档成为文件内容，且文件在截止时为旧内容（`tests/framework/close-out-deadline.test.ts`）。
- **P32 / 验收项 5（Owner 缺失/断开，不回应）**：真机阶段 1；保存路径只有本地存储，观察的交付（`handOverReading` → 访问投递）是不被等待的投递，close-out 与 shutdown 都不以 Owner 为条件。
- **验收项 6（真实故障运行记录等待时间与调度误差）**：真机阶段 2 两次实测（−3ms、+2ms）与应用截止之差；保证范围止于正常处置（强杀、崩溃、断电不在承诺内，`framework/docs/framework-capabilities.md` 与 `framework/GLOSSARY.md` 已同述）。
- **验收项 7（分区与消费者、typecheck、真实证据）**：见上表与下文 log 文件；受影响消费者为 framework 的收口路径与 model-cost 的 Round 末提交，两者分区均执行。

### 故障注入（确认用例能检出违规）

- 去掉收口上界（直接 `await settling`）：`tests/framework/close-out-deadline.test.ts` 的“未收口”用例 5002ms 后超时失败；恢复后通过。
- 把 `WAIT_RESOLUTION_MS` 置 0：`tests/model-cost/close-out-deadline.test.ts` 的可靠取消用例失败（收口已回答时通知尚未产生）；恢复后通过。
- 改动实现之前：同一 model-cost 用例为红（收口在 0.3ms 内即回答、无通知），证明该用例真的要求“按调用方剩余预算等待”。

## 未验证 / 限制

- **真机“更新已开始但未确认”无法从宿主外部安排**：冻结一次 rename 不是脚本能从外部造成的状态。该分支由确定性用例覆盖（真实 `updateFile`、真实锁、真实文档、真实跨进程持有者），真机只覆盖可可靠取消的锁等待。
- **POSIX、其他 pi／宿主版本未运行**；`tests/harness-dock` 分区与全仓 `bun run test` 未执行（本票只要求所属分区与受影响消费者）。connect-bot 分区未设 `OMP_BOT_BINARY` 时为 137 pass / 5 fail：五例都是真机 omp-bot 面板用例在 setup 处失败（面板二进制不在），在任何框架代码运行前即失败；指明该变量后同分区 142 pass / 0 fail。OMP adapter 不报告 disposal（`framework/adapters/omp.ts` 无 `onDisposal`），因此本次收口截止对 OMP 无行为变化，其回归由 framework 分区覆盖。
- **真机阶段 1 的 Owner 形态**是“owner 由 pi 自身血缘解析为 inherited，但服务它的进程不存在”（`framework/adapters/pi/session.ts` 的血缘锚点解析），并非“Owner 进程曾经在线随后断开”；两者对本地保存与退出的要求一致，但“曾经连接随后断开”的载体路径属于票据 05/06 的范围，本票未驱动。
- 真实等待上限为**15 秒级**，本票不要求毫秒级硬实时：实测的 −3ms / +2ms 是本平台两次运行的调度与拆卸读数，不是对每次运行的承诺。
