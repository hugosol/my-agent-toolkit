# 10 — Session 恢复、导航与保存失败收口：自动证据与真实贯通

Ticket: [`implementation/10-session-recovery-save-failure.md`](../implementation/10-session-recovery-save-failure.md)（P16、P17、P18、P19、P46，seam S2／S5）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明，也不是人工验收；H1／H2 与允许的条件性 H3 未确认项不记通过（本票五条承诺的 Coverage 只含自动项与条件性 H3，无 H1／H2；见末节）。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`extensions/model-cost/shared-logic/consumption-store.ts`](../../../extensions/model-cost/shared-logic/consumption-store.ts) | **拒绝后基线推进**：`commit` 现在把协调范围内真正读到的文档留作本实例基线（新增私有 `#rebase`），故 `conflict`／`stale-version`／`stale-period` 拒绝之后，本实例比较下一次快照的对象是**文件当前有效文档**，而不是自己构建被拒快照时持有的那份。这正是 Q6／Q11「重新从磁盘当前有效完整快照初始化周期、Session 累计与版本」；没有该推进时，同版本冲突会永久复现、旧周期实例再也不能保存。`failed`（超时／取消／I/O）不推进，保持最后一次有效读取的基线；`corrupt`／不可解析仍走暂停。 |
| [`extensions/model-cost/shared-logic/request-accounting.ts`](../../../extensions/model-cost/shared-logic/request-accounting.ts) | **保存未落盘即丢弃并按基线重初始化**：新增私有 `discard`（受影响 Session 的 ledger 与 Round 边界一起丢弃，断开当前／上一 Round 的依据；**不动 `handled` 去重标记**），`save` 在 `saved`／`unchanged` 以外的结果上按结果分派：`unusable` 报暂停 notice 并丢弃全部；`paused` 静默丢弃全部（暂停在发生时已报告）；`conflict`／`stale-version`／`stale-period`／`failed` 报一条 error（文件＋结果＋「已丢弃」＋恢复去向）并丢弃——若磁盘周期已变则为整实例丢弃（旧周期消费不写入新周期），否则只丢该 Session。丢弃后不重交：下一次边界只在有新消费时保存，且版本／自身值都从基线记录续起。 |
| [`extensions/model-cost/GLOSSARY.md`](../../../extensions/model-cost/GLOSSARY.md) | 「Storage baseline（存储基线）」定义更新：基线是本实例**持有为有效**的文档状态（正常初始化读到的，或拒绝判定所依据的那份），未落盘的快照不属于基线（报告并丢弃，受影响 Session 自身记录回到基线值）。本票未产生其他新术语。 |
| [`tests/model-cost/session-recovery.test.ts`](../../../tests/model-cost/session-recovery.test.ts) | 新增 S2 套件 9 例（P16 重启 1、P18 恢复无轮 1、P17 另一 Session 不回流 1、P19 fork 1、P46 五类失败 5）；自造价格数据（币种 `XTS`，`input·2 + cacheRead·0.5 + output·8` 每百万 token，峰＝×3），期望全部手算／字面值；失败用例直接写入磁盘文档与制造不可读目标来建模真实故障 |
| [`tests/model-cost/consumption-store.test.ts`](../../../tests/model-cost/consumption-store.test.ts) | 新增 store 层 2 例：同版本不同内容的拒绝后 store 的基线就是文件文档（`sessions`／`session` 读回文件记录）；另一 CLI reset 后 store 周期变为新周期、被替换周期的记录不再可读 |
| [`tests/model-cost/request-accounting.test.ts`](../../../tests/model-cost/request-accounting.test.ts) | 07 既有「拒绝保存」用例补一条断言：被拒的累计被丢弃、该 Session 读回磁盘记录（原用例只断言 notice 与文件不变） |
| [`tests/harness-dock/session-recovery.test.ts`](../../../tests/harness-dock/session-recovery.test.ts) | 新增 S5 隔离宿主套件 4 例：真实独立重启恢复；真实保存故障＋真实重启；真实 tree 回退往返；真实 fork |
| 未改 | `consumption-document.ts`（schema 未动、无新字段）、`runtime.ts`、`request-price.ts`、`model-data.ts`、framework 任何模块、ADR（本票落实 [存储 Lighthouse Q6／Q11／Q8](../lighthouse/06-local-storage.md) 已确认政策，未产生新取舍；`docs/adr/0004` 早把保存失败指向该 Lighthouse） |

**变更前的真实缺口（本票收口）**：原 `save` 在拒绝／失败时只发一条「未保存的累计仍在本实例内存中」的 error，并把该记录当作已保存基线（`ledger.saved`／`savedRevision` 都已推进）。这意味着被拒的消费会在**下一次正常保存时被重新提交**（同版本冲突时还会覆盖另一进程的记录），即 [lighthouse/06 Q6 修订前](../lighthouse/06-local-storage.md#q6普通消费保存失败丢弃未保存部分并重新初始化)的旧政策（「失败后保留内存、下次正常保存带上」）。已批准正文明确该项被替代：报告失败、丢弃未保存部分、从磁盘当前有效完整快照重新初始化，且不重交已丢弃消费。本票按批准正文改正，并补上「不置零／不清 holiday／不清去重标记／不自动重交」的可观察证据。

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 正常保存后独立重启恢复已保存自身聚合、当前周期与版本，不扫描宿主历史/归档、不重算、不维护 lifetime | S2 第 1 例：同 root 上第二次构建 runtime（第二次进程）后，未做任何投递前 `view.own` 就是磁盘的自身值、`identity` 取自记录名；再一笔请求保存为**同 periodId、`saveVersion: 2`、own＝两次请求字面量**，root 内 `.json` 只有 `consumption.json`（无归档／第二套记录）。S5 第 1 例：进程 A 一笔请求落盘后**结束进程**，进程 B 用同一隔离 home 启动并 `switch_session` 到该会话自己的文件（`get_state` 报出的路径），再一笔请求后记录为 `saveVersion: 2`、own＝2×wire 桶，periodId 不变、仍只有一条记录、无 notice——宿主回放的整段历史**不计入消费**。（既有 `consumption-store.test.ts`「a committed snapshot is read back by a later instance」同向。） |
| tree 历史位置往返及继续执行不回滚已发生消费；缺可靠运行期快照的重启/tree/reload 不展示伪历史 Round，文件差值不冒充轮次 | S5 第 3 例：真宿主 `get_entries`→`branch`（回退到第一条用户消息，宿主据此从该点到早的 entries 立起**另一个实际 Session**）→ 在回退位置继续一笔请求：新 Session 自身＝1 笔、版本 1，被离开的会话记录逐字段不变；再 `switch_session` 回原文件继续一笔：原会话 `saveVersion: 2`、own＝2 笔，回退出的会话仍为 1 笔（三次真实出站）。S2 第 2 例（P18）：重启后 `roundTotals` 为 `undefined`；本进程真看到 round_start 后，`previous` 始终未定义、`current` 只等于**本轮自己**的请求，文件里已有的累计从不作为轮次出现。S2 第 3 例：文档已记录的会话在另一 Session 消费并保存后逐字段不变，回到它再消费则版本与自身值在原基础上相加。 |
| fork 新实际 Session 自身从零，复制消息不产生消费且不改原累计；发生真实新请求后只新增本 Session | S2 第 4 例：文档已持有源会话记录（版本 1）时，fork 的新身份 `view.own` 为 `undefined`、文件逐字节不变；新身份第一笔真实请求落盘为**自己的版本 1、own＝1 笔**，源记录逐字段不变、文档恰两条记录。S5 第 4 例：真宿主 `fork` 后 `get_state` 报出新会话 id、出站请求仍 1 次、文档与 fork 前逐字段相同；fork 内再发一笔后：fork 记录版本 1／own＝1×wire 桶、源记录仍是原记录、共两条、无 notice。 |
| 普通保存故障明确报告，丢弃受影响未保存段，恢复完整有效磁盘周期/Session/版本；不置零、不清 holiday/已处理标记、不自动重交 | S2 五例：①同版本另一写入者的记录（`conflict`）→ 一条 error（含文件、「没有写入」、「丢弃」）＋ `view.own` 回到磁盘记录、文件逐字段不变（**holiday: true 保持**）＋同一响应重交不再计入（去重标记保留）＋无新消费的下一轮不写（不重交）＋下一笔新请求保存为**磁盘版本 +1、own＝磁盘 100 输入 + 本轮 7 输入／costCny 0.50003**（旧请求的桶不在其中）；②版本被推进（`stale-version`）→ 回显磁盘版本自身值，下一笔保存为磁盘版本 +1；③另一 CLI reset（`stale-period`）→ 报 stale-period、文件保持新周期文档、本实例自身「无」（不置零、不复活旧周期），随后新消费写入**新 periodId** 且版本从 1 起；④目标不可读（`failed`，文件被目录替代）→ 报 `failed`、`view.own` 仍是最后有效读取的基线记录、目标保持原样，恢复成文档后下一笔保存＝基线版本 +1、own＝基线 + 本轮；⑤实例运行中整份文档变为非本 schema（`unusable`）→ 报暂停 notice、文件逐字节不变、自身无值、后续请求不再计入也不再写。S5 第 2 例：真实宿主同版本冲突 → 一条 error notice（含文件、「没有写入」、「丢弃」）、文件恰是另一写入者留下的文档（holiday: true 保持）、**模型继续**（下一笔真实出站请求成功）且保存为**磁盘版本 +1、own＝磁盘 100 + 本轮 7 输入**；随后独立重启进程 `switch_session` 回该会话再一笔，保存为**版本 3、own＝100 + 2×7 输入**（有效 baseline／版本真实读回）。 |
| 无有效基线按 06 暂停政策，不将普通保存恢复政策自动用于命令/estimate；不增加双执行者租约或异常账本 | S2 第 五 例（上文 ⑤）覆盖运行中发现不可用基线的**报告并暂停**：不猜零覆盖、不写、随后请求不再统计，仅下一次正常初始化再读（既有 `model-cost-store.test.ts` 真实宿主用例覆盖初始化期暂停，S2 `consumption-store.test.ts` 覆盖 load 期与 commit 期 `paused`）。命令（`/budget detail/holiday/clear`）与独立 Codex estimate 在本扩展当前代码中尚不存在（分别由 11／19／12／14 等票持有），故本票无调用方需迁移：恢复政策只写在 `save`（普通消费保存）一处，`commit` 的其它结果原样返回，未对任何命令／estimate 路径套用。未新增租约、心跳、每 Session 检测、重试队列或异常账本（实现只有丢弃与重建）。 |
| 用生产入口故障场景、真实文件读回和独立重启验证有效 baseline/版本，隔离 OMP 证明故障后真实模型继续及导航/fork 结果；金额预期独立 | S5 四例全部经记录基线安装（`.cache/omp-baseline/18.5.0`）＋本扩展生产 entrypoint＋本机捕获端点：真实文件读回（落盘文档逐字段断言）、真实独立重启（同 home 的第二个进程）、真实 tree/fork（宿主 RPC `get_entries`／`branch`／`fork`／`switch_session`）、故障后真实模型继续（故障后仍完成真实出站请求）。金额不断言真实单价：token 桶由端点 wire 数字手推，`costCny` 只用 `> 0.5`（我自己写入的磁盘字面值）判定「未置零」。 |
| 通过批准的生产公共 seam 观察行为，预期来自合同／规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | S2 只经生产 runtime（`createModelCostRuntime`）＋框架公共绑定（`bindAccounting`，port double）读 `runtime.view` 与落盘文档，无私有字段；期望全部由自造价格数据手算或字面写出（如 `oneRequest(n)`、`0.50003`、`oneRequest(1)` 恢复值），未调用被测实现生成期望。S5 是隔离 smoke（真实宿主＋本机端点，无外网）。永久 test 不访问网络。 |
| 使用隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作 | dock 每例独立 run root（agent state／session dir／work／capture 都在 `mkdtemp` 下）＋本票自建共享 home（`<base>/user-home`，扩展 `~/cost-archive` 落在其中），正式 OMP 无任何写入、无正式命令／重启／配置更改；失败信息里可见实际文档路径为 `…\omp-dock-home-…\user-home\.omp\cost-archive\consumption.json`。异步保存用「等期望内容」而非固定时长（Round 结束在宿主下一任务派发）；故障 notice 也是等它真正落地再断言，不假设。本票无 H1／H2；条件性 H3 未触发（真实脚本未多次失败，见末节）。 |

## 真实宿主上确认的宿主约束（写用例时踩到，记录备查）

- **`switch_session` 比较 cwd**：宿主拒绝切到「记录 cwd 与当前不同」的会话文件（`SESSION_CWD_CHANGE_REJECTED`）。所以「独立重启」用例里第二个进程必须与第一个进程**共用工作目录与 session 目录**（本票让两个进程共用一个 run root，只换进程），否则重启后无法回到那个会话；这不是扩展行为，是宿主自身的会话文件约束。
- **session JSONL 第一行是 `title` 条目**，`session` 头在第二行：身份不能按首行解析，本票在 dock 里一律用 RPC `get_state` 取当前 `sessionId`／`sessionFile`。
- **`branch` 会立起新的实际 Session**（新 id 与新文件），`fork` 亦然：`tree` 回退在扩展看来就是一个新身份从零开始，原身份记录不动——这正是本票 P17／P19 断言的形状。

## 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 无输出（exit 0） |
| `bun test tests/model-cost` | **94 pass / 0 fail**（8 文件，360 expect，2.4s；含本票新增 9＋2 例与 07／08／09 既有各例） |
| `bun test tests/framework` | **368 pass / 0 fail**（31 文件，1953 expect，39.0s） |
| `bun test tests/harness-dock/session-recovery.test.ts` | **4 pass / 0 fail**（65 expect，10.7s；真实隔离 OMP） |
| `bun test tests/harness-dock` | **39 pass / 2 fail**（41 例 11 文件 54.7s）；2 个失败为既存环境项 `baseline.test.ts`（本机 `oh-my-pi` 检出／artifact 与记录锚点不再逐字一致），与 07／08／09 记录的同一组一致 |
| `bun test`（全仓） | **667 pass / 4 fail**（671 例 76 文件 215.4s）；4 个失败全部是既存环境项，与 09 记录同组：`tests/harness-dock/baseline.test.ts` 两例，以及 `tests/connect-bot/panel-registration-lifecycle.test.ts`「the protocol the actual omp-bot panel receives is the frozen one (P23)」／`no-panel-expiry.test.ts`「an unregister that never arrives leaves the row to the panel's own window (P25)」两例（两者都要本机 127.0.0.1:8787 的真实 omp-bot 面板，本机未运行，分别 20.3s／15.0s 超时）。本票新增 15 例（S2 9＋store 2＋真实宿主 4）另补强 07 一例，零新增失败。注：并行跑用例时另一次全仓运行出现 666 pass / 5 fail，多出的那一条同属上面两条 connect-bot 面板超时（本仓另有 agent 在同时跑测试造成负载），单跑本票两个文件均稳定全绿 |

## 本轮注入验证（跑完即恢复，仓库内无注入残留）

每次注入后只跑相关套件确认能变红；随后恢复并确认再次全绿。残留检查 `grep -rn "fault injection\|FAULTINJECT\|TEMP DIAG" extensions/ tests/ framework/` 无命中。

| 注入 | 结果 |
| --- | --- |
| `discard` 变为空操作（保留全部内存累计） | `tests/model-cost/session-recovery.test.ts` 的 P46 五例全红；`request-accounting.test.ts` 的 07 拒绝用例红（`view.own` 不是磁盘记录） |
| store 拒绝路径不 `#rebase`（保持已加载基线） | `consumption-store.test.ts` 新 2 例红；S2 的 P46 冲突／版本推进／旧周期 3 例红（io 与不可用两例不受影响，符合预期） |
| `view.own` 不回落已加载记录 | S2 4 例红（P16 重启 1 例＋P46 3 例） |
| `ledgerFor` 用「同 harness 第一条记录」兜底未知 Session | S2 的 P17 与 P19 两例红（fork 自身被灌入源会话累计）；P16 不受影响（它本来就按同 id 种子） |

## Seam 边界（如实说明）

- **P18 的 Round 只在 S2 可读**：Round totals 是扩展进程内的只读结果，S5 侧只能观察落盘文档、宿主 facts 与 RPC 帧；隔离宿主里没有本扩展的前端（TUI 前端属 16／17），所以「重启／tree 不展示伪历史 Round」的证据分工是：S2 证明该结果在重启／回放状态下为 `undefined` 且只含本轮自身增量，S5 证明真实重启与 tree 导航本身不回流消费、文件差值不变成任何记录（也即没有可供冒充的历史轮次落盘）。真实 TUI 上的呈现属 H1。
- **S5 的端点不是真实 provider**：本票只证明真实宿主接线与业务口径（Host facts → adapter → runtime → 落盘文档）；真实服务效果是 H2（07／12 持有），本票不断言。
- **条件性 H3 未触发**：两条 H3 都只在「真实 OMP 脚本多次失败或成本明显过高」时转人工。本票 dock 脚本一次通过（10.7s，4 例），无多次失败、无转交，因此本票无人工项产生。

## 仍未验证

- 真实 TUI／视觉呈现（H1，16／17 持有）与真实 provider 网络效果（H2，07／12 持有）：不在本票 Coverage 内，未记通过。
- 正式环境切换／回退（用户手动，见 25）；命令（`/budget …`）与 Codex estimate 的失败政策适用性：相关实现属其它票，本票只确认「恢复政策只写在普通消费保存」。
- 同一 Session **已在途**的保存（丢弃发生前就已提交、仍排在文件 FIFO 里的那一次）不在本票证据内：它携带的累计在提交时尚未被判定丢弃，框架按调用序发布它，因此该段的最终去向取决于两次保存与丢弃的先后，属规格已接受的「同实际 Session 同时双执行者不支持、未保存段允许丢失」边界，不为此新增租约或取消机制。本票断言的是丢弃之后**新的**边界不再重交该段。
- 本机既存 4 项失败（`baseline.test.ts` 锚点、两条需本机 omp-bot 面板）与本票无关，见上表。
