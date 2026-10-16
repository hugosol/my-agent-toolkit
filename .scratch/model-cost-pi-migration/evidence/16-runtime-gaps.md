# 16：耗时观测缺口与本周期完整性（记录）

**本文件是本票交付的验证记录**：取消/失败有已知活动、缺结束、崩溃恢复、后续成功与周期重置下，可靠耗时小计与本周期不完整性如何保留（P26）的实现、自动与真实宿主证据。本文件不改承诺、不改 seam，也不重复认领其它票的条目。

- **入口（可重跑）**：
  - `bun test tests/model-cost/pi-runtime-gaps.test.ts`（本票新增：生产 pi 装配 + 受控 pi 原生面 + 本 run 自己的存储根的 S1/S2/S3 分区）
  - `bun test tests/model-cost/subagent-runtime.test.ts`（[11](../implementation/11-subagent-runtime.md) 的口径与旧记录先例；本票复核其在本树有效）
  - `bun test tests/model-cost`（所属分区）
  - `bun test tests/harness-dock/model-cost-runtime-gap.test.ts`（本票新增：真实 OMP 宿主的崩溃/恢复）
  - `bun test tests/harness-dock/baseline.test.ts`（真实宿主基线与工件在位；本机检出为 CRLF，见 §6.1）
  - `bun run typecheck`
- **源状态**：分支 `hyper/model-cost-pi-migration/16-runtime-gaps-db0502-411dc288ea83`，起点 `5581010`（15 合入后的集成分支）。本票改动只有三处：
  - `extensions/model-cost/shared-logic/request-accounting.ts`：1 行——缺口诊断通知把对象当字符串插值（`${fault}` → `[object Object]`），改为 `${fault.fault}`，使操作者真被告知是哪一个时间事实失败（模块头注承诺的就是这句）；
  - 新增 `tests/model-cost/pi-runtime-gaps.test.ts`（7 例）；
  - 新增 `tests/harness-dock/model-cost-runtime-gap.test.ts`（1 例）。
  无 seam、schema、文档或其它生产路径变更；未新增任何通用 LastGoodValue 框架、缺口专文件或持久化账本。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2；OMP 真实宿主为记录基线 18.5.0 的隔离安装（`.cache/omp-baseline/18.5.0`，无宿主补丁），模型请求全部由本机捕获端点回答，无凭据、无付费调用。pi 侧本票不驱动真实宿主（§4.2 说明原因），本机 pi 1.2.0 与工件 `pi-subagents@0.78.0` 仍是既有真实宿主记录的固定基点。

## 1. 交付的行为与实现缺口

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 缺口诊断可读 | `request-accounting.ts`（`roundEnded` 的耗时分支） | 未能测得区间时，通知内容为**失败的原因**（「活动区间缺少有效时刻」等）而非对象本身；此前实测为 `子代理运行耗时采集失败（[object Object]）`，与本模块声明的「操作者被告知哪一个时间事实失败」不符。 |
| 可靠小计与缺口（既有，本票核对） | `subagent-runtime.ts`、`request-accounting.ts`、`consumption-document.ts` | 已结算区间累加；缺结束不加、不补离线时间；无法测量的区间只标缺口不造数；未知与可靠零分开；缺口不被后续成功清除；跨周期随旧周期一起丢弃并归档，新周期从零开始，旧周期迟到结束不回填。 |

## 2. 自动证据（真实运行）

运行时源状态：`request-accounting.ts` = `a06f13…2391`、`tests/model-cost/pi-runtime-gaps.test.ts` = `84368a…ecfb`、`tests/harness-dock/model-cost-runtime-gap.test.ts` = `04ac6a…263c`（§6.5 给出复现条件）。

```
$ bun run typecheck                                   # tsc --noEmit，无输出，exit 0
$ bun test tests/model-cost                           # 422 pass / 0 fail（35 files, 2257 expect, 11.45s）
  └ tests/model-cost/pi-runtime-gaps.test.ts          # 7 pass / 0 fail（本票新增）
$ bun test tests/harness-dock/model-cost-runtime-gap.test.ts   # 1 pass / 0 fail（真实宿主，5.79s）
```

- **P26（S1/S2/S3，生产 pi 装配）**：`tests/model-cost/pi-runtime-gaps.test.ts` 用真实 pi adapter + 真实 definition/runtime/前端绑定受控 pi 原生面，扩展自己的时钟由 case 注入（生产 runtime 的既有输入），因此每个区间都是 case 自己两个时刻的算术，而非实现算出的值：
  - **已观察取消失败**：一次被中断（`stopReason: aborted` / `agent_settled{aborted:true}`）与一次终态失败的活动各自结算自己的区间（45 s + 30 s = 75 s），该次被中断请求的用量同一次提交落盘（手算金额 0.0085）；主会话自己的活动不产生 runtime，其记录连 `runtimeMs` 键都没有；显示行给出同一数字。
  - **可靠零与未知**：同刻开闭的活动记 `0`（文档里是真的数字 `0`，不是缺席），从未被观测的活动在读数与显示行里都是不可得。
  - **缺结束**：活动只开不结，文件逐字节不变；下一个装配读回 45 s 小计（不是墙钟跨度、也不是未知）；把那次从未结束的结束帧交给新进程后，框架无轮在开、不产生任何边，文件仍逐字节不变——离线时段没有被补算。
  - **缺口**：时钟在结束帧读不出时刻 → 保留 30 s 小计、操作者收到 error 通知（原因可读、含「缺口」字样）；随后的正常活动加上自己的 20 s 而缺口标记不消失；重启后再加 20 s，标记仍在（50 000 → 70 000）；本实例观测无缺口的那条记录完全不带标记。
  - **旧文档**：独立写入的旧文档（有值 480 000 + 已知缺口、合法零 `0`、无值、主会话）由本装配读/更/恢复：值原样、零仍是零、缺值不增不猜、缺口标记保留，读数与显示行把三种事实分开；前端的 `Run:` 行分别画出 `8m` / `0ms` / `—`。
  - **周期重置**：`/budget clear` 关闭周期后，活动文档无任何 session（小计与缺口随整文档进 `archives/`）；把跨重置仍开着的活动的结束帧交给新周期，贡献为零、不写文件、也不在新周期留下缺口；真正的新活动从零累计（`saveVersion` 回到 1、无标记）。首次 `/budget holiday` 同样开始新累计。

**故障注入（每条注入后立即还原并复跑绿）**

| 注入 | 结果 |
| --- | --- |
| A：某次成功结算时把缺口清掉（`gap = false`） | 2 条失败：缺口用例（后续成功不再保留标记）与旧文档用例（带标记记录被测量后标记消失） |
| B：去掉 `closedActivities` 守卫（旧周期的结束帧照常结算） | 1 条失败：clear 用例（新周期被写入一条空小计的缺口记录，文件不再逐字节不变） |
| C：`available()` 对「什么都没测到」返回 `0` | 1 条失败：取消/失败用例（主会话本应不可得，变成可靠的 0） |
| D：快照不写 `runtimeGap` | 4 条失败：缺口用例、旧文档用例、clear 与 holiday 用例 |
| E：周期切换不丢弃 ledger（`ledgers.clear()` 去掉） | 2 条失败：clear 与 holiday 用例（旧周期的小计与缺口跨周期保留） |
| G：提交只看消费增长（去掉 `runtimeRevision` 条件） | 7 条失败：本文件全部用例（只要消费没增长，耗时与缺口就再也落不了盘） |

## 3. 复核的前票证据（同一棵树，未改动这些模块）

- [11](../implementation/11-subagent-runtime.md) 的口径与旧记录兼容：`bun test tests/model-cost/subagent-runtime.test.ts` 在本票所属分区运行内全绿（`bun test tests/model-cost` → 422 pass / 0 fail，含该文件 7 例）。本票在其上补的是 pi 装配面、跨周期、恢复与真实宿主，不复制其断言。
- [15](../implementation/15-period-reset.md) 的整文档归档与周期语义：本票的 clear/holiday 用例只核对 P26 关心的部分（小计/缺口是否随周期丢弃并归档、新周期是否从零累计），归档内容、余额与命令条件的完整结论仍属 15。

## 4. 真实宿主事实

### 4.1 OMP 真实宿主：进程带着活动死亡（本票新增）

`bun test tests/harness-dock/model-cost-runtime-gap.test.ts` 一次运行（隔离 user home + 本 run 自己的 agent/session/work 目录 + 捕获端点；真实 OMP 18.5.0 隔离安装 + 本仓库 `entrypoints/omp/model-cost.ts`；阻塞式委派，子会话在本进程内）：**1 pass / 0 fail（5.79 s）**。观察：

1. **真实测得的数字**：完成一次委派后，子会话自己的记录带一个**正数** `runtimeMs`（宿主真实活动的区间，本 run 不预设时长），且不带缺口标记——这次活动每个区间都被观测到；
2. **带活动死亡不加账**：第二次委派开始、其子会话的请求被端点扣住（活动仍在跑）时结束该进程（5 s 内未自行退出即被 kill）：`consumption.json` 与崩溃前**逐字节相同**——没有离线时段被补算，也没有为那次未结束的活动写出任何记录；
3. **下一个进程继续**：新进程用 `--session <原会话文件>` 恢复同一会话，再委派一次：新子记录带它自己的正数 `runtimeMs`，**第一条子记录逐字段等于前一个进程写下的那条**（后续成功不重写、不清除已有关闭活动留下的数字），无 `runtimeGap` 记录，且第二个实例没有报任何基线故障。

未覆盖（如实记录）：真实宿主上**构造不出**「无法测量的区间」这一缺口（时钟总是可读，且框架对没有开轮在前的 settle 不产生边），故缺口标记本身的规则由 §2 的受控时间用例承担，真实宿主只承担小计的测量、崩溃后的保留与恢复。

顺带记下的一条宿主事实（本票运行中实测，非承诺）：`switch_session` 进入一个会话时，若该会话文件记录的 **cwd 与当前进程的 cwd 不同**，基线宿主以 `SESSION_CWD_CHANGE_REJECTED` 拒绝该切换，RPC 上表现为 `cancelled: true`。因此「同一部署的新进程」必须复用同一 run root（工作目录），本 case 与既有的 `session-recovery`/`detail-tree` 重启用例做法一致。

### 4.2 pi 真实宿主：本票未驱动，原因在既有记录里

pi 上的子代理耗时来自**同进程内**被生成的子会话（其 Round 边由根实例观测）。本迁移已记录的宿主事实使这条真实路径当前不可得，不是本票可以静默补丁的：

- 前台（进程内）委派会被提供方的进程内会话替换**打死父进程**（[05 §3.3](05-subagent-facts.md)：扩展自己的前端持有失效 ctx 后重绘抛错，父进程退出），因此「真实 pi 上观察一个子会话的耗时落盘」目前跑不到；
- 后台委派走独立进程，而子进程的扩展**根本不记账**（[08 §3.1/§3.2](08-session-accounting.md)：owner 为 `inherited`，初始化不发生 ⇒ 既无累计也无提交）。

本票因此没有新增 pi 真实宿主断言，也不把 mock 或 RPC 结果当真实宿主通过；缺口与恢复的 pi 侧证据限于 §2 的生产装配（受控原生面 + 真实存储文件 + 真实前端）。若要补 pi 真实路径，需先由 [02]/[20] 处理失效 ctx（前台）或由共同生命周期/本机推送决定（后台）——都超出本票范围。

## 5. 归属与复用

- **复用（已复核有效）**：`tests/model-cost/subagent-runtime.test.ts`（11 的口径、旧文档与缺口先例）、`tests/model-cost/pi-session-accounting.test.ts` 与 `pi-terminal-rounds.test.ts`（pi 装配绑定、子会话身份与文档读回的形状）、`tests/model-cost/pi-period-reset.test.ts`（`/budget` 命令路径与周期边界用例的形状）、`tests/harness-dock/session-recovery.test.ts` 与 `model-cost-persistence.test.ts`（真实宿主双进程与阻塞委派的先例）。本票在其上补的是：pi 面的耗时/缺口分区、跨周期不回填、以及真实宿主的「带活动死亡 + 恢复」。
- **未认领**：展示对「未知/不完整」的进一步呈现（P43，属 [18]）——本票只核对读数与前端已画出的行（`Run:` 的数字/`0ms`/`—`），未新增展示字段；周期归档与命令条件的完整结论属 [15]；效率与复杂度判断属 [22]（P51）。

## 6. 未验证 / 未覆盖

1. **本机检出的行尾差异**：本 worktree 为 `core.autocrlf=true` 检出，`bun.lock` 与两处 `host-patches/*.diff` 是 CRLF，因此 `bun test tests/harness-dock/baseline.test.ts` 的「lockfile sha256 对应」一项失败（记录值是已提交 LF blob 的哈希）。这是检出物与环境的差异，不是本票改动；本票未改动这些文件，也**没有**为了跑测试去改工作树字节。
2. **整个 `tests/harness-dock` 分区**：本票只运行了自己新增的真实宿主文件（以及为核对基线可用性运行了 `baseline.test.ts`）；`model-cost-persistence`、`detail-tree` 等文件未重跑（它们的结论属 [08]/[24]/[12]，本票未触及它们的路径）。
3. **pi 真实宿主**：见 §4.2（被 05/08 记录的宿主事实阻挡）。
4. **POSIX**：所有运行都在 win32；POSIX 未运行。
5. **每次真实验证的复现条件**：§2 的散列对应录制时的文件内容；`tests/model-cost/pi-runtime-gaps.test.ts` 为纯进程内（假定时器 + 注入时钟），无外部依赖；§4.1 需要 `.cache/omp-baseline/18.5.0`（首次运行会物化该隔离安装）与可用的本机回环端点。运行期间这些源文件与夹具保持不变。
6. **人类验收**：本票不含 P51/P52/P53 的人工判断项。
