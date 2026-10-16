# 09：后台委派与公开保活的 Round 接续（记录）

**本文件是本票交付的验证记录**：pi adapter 按 nicobailon 的公开保活协议读取「提供方仍持有后台工作」这一事实（P19）、把该事实作为关轮静止条件的一项（P19）、并保持未来任务/终态记录/订阅本身不保活（P20）的实现、自动与真实宿主证据。本文件不改承诺、不改 seam，也不重复认领后续票的条目。

- **入口（可重跑）**：
  - `bun test tests/framework/pi-background-rounds.test.ts`（本票新增的 S1 分区）
  - `bun test tests/framework`（所属分区 + 共同契约消费者）
  - `bun test tests/model-cost`（S3 文档消费者；本票未改其模块，用于确认未被波及）
  - `bun run typecheck`
  - `bun scripts/pi-background-round-smoke.ts [--keep] [--pi <path>]`（真实宿主入口；见 §3）
- **源状态**：分支 `hyper/model-cost-pi-migration/09-background-rounds-8ca6ce-411dc288ea83`，起点 `304451e`（05 合入后的集成分支快照）。本票改动为 `framework/adapters/pi/nicobailon.ts`、`framework/adapters/pi/round.ts`、`framework/adapters/pi.ts`、`framework/docs/harness-support.md`（`work.async-job-snapshot` 行的 pi 列）、新增 `tests/framework/pi-background-rounds.test.ts`、`tests/framework/support/pi-surface-double.ts`（提供方保活注册仪式）、新增 `tests/harness-dock/fixtures/pi-background-rounds/{entrypoint,prefix}.ts`、新增 `scripts/pi-background-round-smoke.ts`。**本票未改** `framework/core/**`、`framework/behaviors/**`、`extensions/model-cost/**`、`entrypoints/**`。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2 / node v24.18.0；真实宿主 pi 1.2.0（`D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`）、第三方工件 `pi-subagents@0.78.0`（本仓库 `node_modules/pi-subagents`，`package.json` 的固定依赖；保活协议实现见其 `src/integrations/pi-web-session-liveness.js`）。无 provider 凭据、无付费调用：所有模型请求都由本机 OpenAI 兼容捕获端点回答。

## 1. 交付的行为（本票实现）

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 保活协议的可读一侧 | `framework/adapters/pi/nicobailon.ts` | 该协议只有 `register` 没有问题入口，因此本接入在进程**没有**该槽位时发布 `{version:1, register}`（`Symbol.for("@agegr/pi-web/session-liveness/v1")`），把提供方为「它当前服务的会话」登记的那一份留下；已存在他人发布的槽位**不覆盖**（对方协议属于对方主机）。表的成员键用 `Symbol.for`，因为一个 pi 进程会为每个扩展入口各建一套模块表，同一 framework 的第二份图必须认得出这是自家注册表。 |
| 会话级后台活动读数 | 同上 `backgroundActivity(sessionId)` | 只读该会话自己的登记：提供方 `isActive()` 为真→`holds`，为假→`clear`。其余一律 `unread`：本进程没有任何登记、登记指名的是另一个会话、登记里的答案取不到（抛错）、槽位是他人发布的注册表。**这四种都不等于 false**，都不冒充「没有后台活动」。 |
| 静止条件组合 | `framework/adapters/pi/round.ts` | 先读 pi 自身 idle/无排队消息，只有会话看起来静止时才问提供方；`holds`→非静止，`clear`→静止，`unread`→**无从确立**（候选保留、不关轮）并在诊断通道报一次原因。没有自己的静默窗口、轮询或超时：一次重检一次读，不设计时器。 |
| 薄装配注入 | `framework/adapters/pi.ts` | 装配把本进程提供方的读数作为 `background` 注入 Round 映射；没有子入口声明的装配（本入口没有提供方接入范围）回答 `clear`，即只按 pi 原生事实判断。 |

## 2. S1 自动证据（本票分区，真实运行）

```
$ bun run typecheck                       # tsc --noEmit，无输出
$ bun test tests/framework/pi-background-rounds.test.ts   # 12 pass / 0 fail（33 expect）
$ bun test tests/framework                # 442 pass / 0 fail（36 files, 2060 expect, 36.09s）
$ bun test tests/model-cost               # 394 pass / 0 fail（31 files, 2011 expect）
```

- **P19（S1）**：`holds` 让已 settle 的父轮保持打开、`clear` 才允许关轮（同一条用例两向都钉住）；完成唤醒在**同一轮**内继续（只有一个 `round_start`，唤醒 run 的 Turn 与前一轮同 id）；`unread` 的四种形态都不关轮且各报一次原因：无登记、登记指名另一会话、`isActive()` 抛错、槽位是他人发布的注册表；本 framework 另一份模块图发布的注册表**能读到**（不是他人主机）；相反，本入口子入口要求被拒（`failed{registration}`）**不**把提供方的 `clear` 变成沉默——失败说的是本入口的登记结果，提供方的登记按它自己的账读。父子独立：子会话自己的 start/settle 开关它自己的轮，父轮仍等自己的结果；本入口没有提供方的进程只按 pi 原生事实静止（与改动前一致）。
- **P20（S1）**：一条只登记「未来任务 / 已保留终态历史 / 已开订阅」的登记（其自身按提供方公开标准回答无活动）不拖住当前轮；该轮照常开关，且本入口在提供方自己的通道上**没有任何自有保活流量**（本用例里只有用例自己发布的宣告）。未来任务真正触发时按它自己的会话走边界；另外「本入口自己的期限」不关轮：把时钟推进 10 分钟后再来一个结束候选，提供方仍持有工作时依然不关轮，只有提供方自己的答案改变才关。

**故障注入（每条注入后立即还原并复跑绿）**

| 注入 | 结果 |
| --- | --- |
| A：忽略提供方读数（`background` 恒 `clear`） | 8/12 条失败（含 P19 主用例、父子独立、无期限用例） |
| B：把 `unread` 一律当 `clear` | 3 条失败（无登记、另一会话、他人注册表） |
| C：只要有登记就当作「持有」（不读它的答案） | 6 条失败 |
| D：加一个本地期限，到点后自行补发一次 settle | 4 条失败 |
| E：让静止答案随时间自行变为真（静默本地期限） | 2 条失败，含专测该项的用例 |
| F：注册表成员键改回模块局部 `Symbol()` | 1 条失败（另一份模块图的注册表用例） |

## 3. 真实宿主事实（本机实测，源不变）

`bun scripts/pi-background-round-smoke.ts` 一次运行（隔离 home/agent/session/work 目录 + 捕获端点 + 运行自带 layout；**不写操作者真实存储根**——运行后核对操作者 `~/.omp/cost-archive/consumption.json` 的 pi 分区为 0 条），13 项观察全部成立（约 31s）：

1. 宿主是固定版本、固定工件在位；
2. 两次后台委派真的启动，提供方自己的 async 工件说它们仍在运行；
3. **只有委派在忙时，父会话的公共 Round 是开着的**（pi 已 settle、idle）；
4. **子会话进入终态本身不结束父轮**；
5. 整个委派期间父会话**只开一次、只关一次**；
6. **该轮里每个 Turn 都是同一个 Round**（结果唤醒的原生 run 接续了原轮，没有另开一轮）；
7. **该轮的关轮边界把父会话自己的请求存进了文档**（S3：自己的 input = Turn 数 × 捕获端点用量）；
8. 提供方对两个已完成 run 的**保留记录**（`completion-replay` 两条）在关轮时仍在，而它仍报告没有持有——终态历史不保活；
9. 两次委派各自是独立会话，其会话文件把本父会话写成直接父；
10. 该会话随后的普通 prompt **正常开关一轮**（提供方在位但没有持有），说明上面的等待不是「这个会话再也不关轮」；
11. 后续轮里模型对已完成 run 发起的 **non-blocking wait** 由提供方作答（其自己的 tool result 文本），该轮仍然结束；
12. 该轮的边界同样把新增请求存进了文档。

**两条如实记录、不当通过的观察**：本次运行里两个被委派会话**自己的**消费记录没有出现在文档里（`note` 行）；它们各自进程的 `runner.stderr.log` 只有一条本扩展的诊断，没有拒绝保存的提示，子进程随它的轮结束退出（委派会话自己的记账归属属 [08]，其身份/父链证据本票已在第 9 项核对）。第二次委派用到的等待调用在**已完成**的 run 上立即得到终态答复，因此这一项只证明「该调用不拖住轮」，不是「长期未消费的订阅存在时仍关轮」。

**本票读过的第三方事实（源码/工件级，非运行证据）**：提供方在 `session_start` 为当前会话登记一份保活，`isActive()` = `owedResultRunIds || hasLiveSubagentWork || completionNotifier.hasPendingDelivery() || parentWake.isPending()`（`node_modules/pi-subagents/src/extension/index.js`，与候选检出 `a4c8ced`/v0.78.0 一致）；其中 `hasPendingDelivery` = `pending.size > 0 || unstartedWakes.length > 0`（`src/runs/background/notify.js`），父会话空闲时通知走「追加 + 一次 wake 用户消息」，唤醒是否仍挂由 {10 秒期限} 决定（`src/shared/parent-wake.js`：`WAKE_PENDING_MS = 10_000`、`isPending()`）；`PI_SUBAGENT_CHILD=1` 的子进程**根本不加载** provider 扩展（`index.js` 的三元分支），所以被委派会话自己的进程没有保活登记，只按 pi 原生事实判断（本次运行的子进程 `effective` 只含 runtime + required 的 model-cost，与该分支一致）。

## 4. 归属与复用

- 复用了 05 的 S1 断言面（会话身份/直接父、接入失败与正常无提供方的区分）与 [05 的真实委派记录](05-subagent-facts.md)：本票不重复认领「子会话身份与直接父正确」，只核对它在**父子独立开关轮**这一场景下仍然成立（第 9 项）。
- P18 的正常继续、P21/P22 的取消/终态失败与晚到、P23 的恢复边界仍属 [10]；P24/P25/P27 的耗时属 [11]；`/budget detail` 的无子代理分支属动作票。本票不复制它们的断言，也不声称已交付。
- `framework/docs/harness-support.md` 的 `work.async-job-snapshot` 行按本票实现更新了 pi 列（原话是「pi 没有这种事实」）。同表 `lifecycle.semantic-events` 行的「pi mapping remains unimplemented」在 05 之后已过时，属该表其他条目的记录更新，本票不代改，留给出票人核对。

## 5. 未验证 / 未覆盖

1. **提供方唤醒期限「到期后不再保活」的真实路径**：只有在「已发出的唤醒始终没有启动」时才走得到，而本次宿主的空闲路径总让唤醒启动一次 run；本次真实运行覆盖的是「通知交接 → 唤醒启动 → 接续原轮 → 关轮」。提供方自己的模块 smoke（[08 事实核查](../research/08-round-boundary-facts.md) §5，注入时钟）是该期限行为的独立证据；本票一侧（接受它的答案、且不新增本地期限）由 §2 的 P20 用例覆盖。
2. **真实耐久定时任务的登记**：该工件要求 `schedule.create` 携带 workflow 脚本，而 dock 的脚本化应答无法在同一条助手消息里同时给出工具调用与 ` ```js workflow ` 文本块，因此本次没有在真实宿主登记一份定时任务。提供方公开标准（未来任务不保活）与 §2 的映射证据覆盖该语义；`真正触发的执行按其自己的会话` 只在 S1 里按会话边界核对过。
3. **前台委派**：05 已记录该路径会让父进程因失效 ctx 崩溃（属 pi 前端/装配线），本票未重复该路径；本票的后台路径与父子独立由第 3–4、9 项覆盖。
4. **嵌套、续跑、取消、重载/恢复**：分别属 [11]、[10]；本票不冒充。
5. **他人主机已发布注册表的后果**：本接入不覆盖他人槽位，因此在「别的 host 先发布该注册表」的进程里读不到提供方陈述（按契约报 unread，不冒充不活动，也不关轮）。本机没有这样的 host，只有源码级推理；若真实接入出现该形态，按既有选型重评规则带证据返回。
6. **POSIX**：所有真实运行都在 win32 上执行，POSIX 未运行。
7. **操作者真实存储根**：本票只读核对（pi 分区 0 条），未写入、未清理。
