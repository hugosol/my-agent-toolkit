# 票据 08 证据：子会话自行记账，Owner 按成功提示或重连同步（P16、P17、P19）

日期：2026-10-17。worktree 分支：`hyper/framework-subagent-observation/08-local-accounting-owner-sync-a9eed4-e98ea402077c`
（基于集成分支 `hyper-tdd` 的合并树 `89ebaa2`，含票据 03/04/05/06/10 已合入内容）。平台：Windows 10.0.2622，
bun 1.4.2，typescript 7.0.2。

## 交付内容

本票补齐「响应 usage 只由实际执行会话累计并保存；Owner 的远端观察与重连只读采用、不重复计费、不代写」这一条链路上
缺失的一段：**提交成功提示的发布与接收**。既有实现已经具备 `ConsumptionStore.commit`（本进程协调提交）、
`ConsumptionStore.synchronize` / `runtime.synchronize`（只读同步，不经通知触发）与 `save()`（Round 结束时按自身身份
保存），但没有任何一方把「某会话自己的写入真的落地」这件事告诉服务其 Owner 的进程，因此 Owner 侧只能靠人工调用
`synchronize` 或重新初始化才看得到别的进程写入的记录。

新增（框架侧，S1/S2）：

- `framework/core/protocol.ts`：`ObservedSession.commits` / `SessionObservation.commits`（观测词中的「已确认写入次数」），
  以及提交轴类型 `SessionCommitEvent`（`session_commit`）、`SessionCommitObservation`、`SessionCommitDelivery`、
  `SessionCommitHandler(s)`；`SemanticEvent` 与 `SemanticEventDeliveryMap` 加入该轴。
- `framework/core/observations.ts`：`Entry.commits` / `commitsSource`；`observeCommits`（按来源编号裁决、计数未动即不发布）、
  `recordCommit`（记录一次已确认写入并交出可转发的词）；`#readable`/`readingsFor` 携带该成员；**来源结束不撤销计数**
  （写入落地不是「实时读数」）；类与模块文档同步。
- `framework/modules/local-access.ts`：观测帧编解码携带 `commits`（非负整数，其他形状按未声明成员处理）。
- `framework/core/assembly.ts` + `framework/behaviors/binding.ts`：`ImplementationContext.recordSessionCommit` —— 扩展唯一
  「陈述」通道：binding 把它接到本进程观察源（`observations.recordCommit`）并在该会话的 owner 不由本进程服务时按
  `handOverReading` 规则交给本机接入；`adoptReading` 采纳到达的计数并在移动时向订阅组派发 `session_commit`。
- `framework/public.ts`：导出新增类型。

新增（扩展侧，S1/S3）：

- `extensions/model-cost/shared-logic/request-accounting.ts`：`RequestAccountingInputs.recordCommit`；`save()` 只在
  **确认提交之后**（`saved`/`unchanged`）发出提示 —— 拒绝、暂停、失败一律不发，提交尚未回答时也不发。
- `extensions/model-cost/shared-logic/runtime.ts`：`ModelCostRuntimeInputs.recordSessionCommit` 透传给记账；新增
  `session_commit` 处理器，以 `synchronize({feedback})` 只读采用文件实际内容（不采用提示携带的任何累计）。
- `extensions/model-cost/harnesses/pi.ts`、`harnesses/omp.ts`：装配时把 `context.recordSessionCommit` 交给运行时。

文档：`framework/GLOSSARY.md`（Storage commit notice）、`framework/docs/framework-capabilities.md`（提交轴行、
`ImplementationContext` 行、观察交付段）、`extensions/model-cost/GLOSSARY.md`（Consumption commit notice，并补
Read-only synchronization 的触发条件）、`extensions/model-cost/README.md`（时间与 detail 行为新增一条）。

新增测试：

- `tests/framework/session-observation-access.test.ts`（+4 例，S1）：计数随词到达、只在移动时送达订阅者、重复计数不再发布、
  来源结束只撤销实时读数而不撤销计数、Owner 由本进程服务时记录并不外发、owner 在别处时按每次写入转交、
  `readingsFor` 快照携带计数（重连可恢复）。
- `tests/framework/local-access-observation.test.ts`（+2 例，S2）：真实子进程经真 named pipe 交付计数（帧编解码），
  以及真实交付半边的首词携带本进程持有计数（丢失提示由重连恢复）。
- `tests/model-cost/local-accounting-owner-sync.test.ts`（+4 例，S1/S2/S3，新文件）：确认提交才发提示、失败/拒绝不发；
  Owner 只读采用文件内容且不写任何内容；空根不初始化不建文件；两个真实子进程提交 + Owner 只读采用，
  每笔请求只计一次（Direct 与 Inclusive）。

## 逐项验收

| 票据验收项 | 证据 |
|---|---|
| 使用独立给定的两会话 usage 算例核对 Direct session totals 与 Inclusive session totals，每笔请求仅计一次；远端观察、快照和重连不产生重复累计 | `local-accounting-owner-sync.test.ts`「each request is accounted once…」：父进程运行时载入 `MAIN` 自带 2 笔的基线；两个**真实子进程**分别提交同一子会话的 v1（5 笔）与 v2（6 笔，累计前进而非相加）。每次通知后断言 `view.own(CHILD)` 恰为子进程写在盘上的 own（v1=5 笔、v2=6 笔，而不是 5+6）、`view.own(MAIN)` 恒为 2 笔、`inclusiveTotals(MAIN)` 分别为 7 笔与 8 笔（=2+5、2+6，各计一次）。测试 2 的展示读数同样核对：`presentation.of(target).current`=3 笔（本进程未提交的在途量）、`tree`=7 笔与 9 笔（=3+4、3+6）。同一文档被重复采纳（第二次通知、`changed:false`）不改变任何累计，也不改变文件字节。既有 `shared-storage-refresh.test.ts`、`pi-session-accounting.test.ts`（各含 Direct/Inclusive 断言）在本票分区复跑为绿，未被本票改动影响。 |
| 实际子进程提交证据与 Owner 同步行为共同证明写者归属，Owner 不代写子记录 | `local-accounting-owner-sync.test.ts`「each request is accounted once…」：真实子进程自报 `commits: [{kind:"saved"}]`、`fsOperations.publishes = 1`、`locks > 0`（经 `efficiency-baseline-fs-instrument` 预载真实记录 rename/锁调用），`periodSessions` 含其写入的记录；Owner 侧在采纳前后读取文件文本并断言**字节完全一致**（`fileText === afterSecond`），即 Owner 未写任何内容、也未代写子记录。框架侧 `session-observation-access.test.ts`「the confirmed write of a session whose owner is served elsewhere is handed over, once per write」证明提示只带计数（`{session, owner, commits}`，无任何文件内容），「a session whose owner this process serves is recorded here and handed to nobody」证明同进程服务方不外发。 |
| 阻止 Owner 自身消费提交后，子会话保存仍使 Owner 看到新记录；Owner 接收成功提示只读采用文件内容，不采用提示携带的消费累计，不产生写入 | `local-accounting-owner-sync.test.ts`「the owner adopts the document the notice names, read-only…」：Owner 侧只有**未提交**的在途累计（`view.own(MAIN)`=3 笔而盘中仍为 2 笔），写入方记录出现在文件中后仅投递一条提示，Owner 随即通过自己的只读结果看到 `CHILD` 的记录与身份（`view.own(CHILD)`、`view.identity(CHILD).parentSessionId`、`presentation.of(...).tree`），而 `fileText` 与写入方那份文档逐字节相同、Owner 的在途量仍只在内存。提示本身不携带任何累计（框架用例断言交付词只有 `commits`，无文件内容）；采纳出的数字全部来自文件。 |
| 失败保存不发送成功提示；成功提示只在确认提交后发生，不把开始保存或停止等待当作成功 | `local-accounting-owner-sync.test.ts`「a confirmed save states the notice, and a save that did not land states none」：Round 进行中（累计仅在内存、盘中只有 main 记录）时 `observations.read(CHILD).commits` 为 undefined；Round 结束且**盘中确实出现两条记录**之后计数才为 1。随后把文档写成非本扩展格式：会话保存被拒绝并暂停实例（`pauseReason` 出现、文件字节不变、Operator 得到暂停通知），计数**仍为 1** —— 已经开始的保存、被拒绝的保存都不产生成功提示。已还原的变异（把 `recordCommit` 提前到 `storage.commit` 之前）被该用例捕获（计数被提前置位后与「落地后才为 1」的观察互相矛盾，用例转红）。 |
| 丢弃一次成功提交提示，断开再接入；Owner 无自身消费或提交仍能通过只读同步看到文件中的新记录 | 载体层（S2，真实进程）：`local-access-observation.test.ts`「the delivering half's first word carries the count this process holds…」——提示在无 seat 时投递（不建记录、不建目录、不建端点），随后连接被重新接入，**首词**携带该进程当前持有的计数；「a real process's count arrives over the seat as the notice it is」证明计数确实跨越真 named pipe。框架层：`session-observation-access.test.ts`「a count this process never took is what a connection that reached the seat again states」——本进程从未取到的计数由后续连接（来源 2）的词状态，采纳后恰好派发一条 `session_commit`，且不产生任何 Round/Turn/session 边界。扩展层：`local-accounting-owner-sync.test.ts`「each request…」以第二条（来源 2、计数前进）通知完成对第二份真实提交的采纳，Owner 自身始终没有提交任何东西。 |
| 只读同步复用存储基线与既有失败政策，不变成初始化、强制保存或轮询，不为观察或重连重放 Turn／Round | 「不变成初始化/不建文件」：`local-accounting-owner-sync.test.ts`「a notice for a root that holds no document adopts nothing and creates nothing」——根上无文档时同步答 `absent`，文件始终不存在，周期仍是原基线周期。「不强制保存」：上面两条用例逐字节比对文件（Owner 采纳前后不变），在途累计仍只在内存。「既有失败政策」：unusable 文档使实例暂停并由既有 `unusableBaselineNotice` 上报（用例断言 `pauseReason`；`consumption-store.ts`/`shared-storage-refresh.test.ts` 的既有政策未改动）。「不重放 Turn／Round」：`session-observation-access.test.ts` 的 `watching()` 组记录交付种类，采纳计数只出现 `session_commit`，无 `round_*`/`turn_*`/`session_*` 边界（同文件既有的「来源结束不新增任何计费事实」用例继续为绿）。「提示携带的累计不被采用」：框架用例断言交付词只有计数。 |
| 按仓库测试规范执行计费、存储及受影响消费者分区，TypeScript 变化执行 typecheck；通过真实进程、存储访问／提交证据和实际 Owner 表面验收并记录限制 | 见下「命令与结果」「未验证与限制」。真实进程：两个真实子进程（`tests/model-cost/support/store-child.ts`，带文件系统插桩预载）+ 真本机接入（`local-access-observation.test.ts` 的真 named pipe/location record）。Owner 表面：`runtime.view`（`own`/`identity`/`inclusiveTotals`）与 `runtime.presentation.of(target)`（前端绘制的同一只读结果），非内部 registry。 |

## 命令与结果

| 命令 | 结果 | 日志 |
|---|---|---|
| `bun run typecheck` | exit 0 | `logs/08-typecheck.log`（`logs/08-typecheck-exit.log`） |
| `bun test tests/framework/session-observation-access.test.ts tests/framework/local-access-observation.test.ts tests/model-cost/local-accounting-owner-sync.test.ts` | 34 pass / 0 fail（183 expect，3 文件） | `logs/08-owner-sync-suites.log` |
| `bun test tests/model-cost` | 488 pass / 0 fail（46 文件，2707 expect） | `logs/08-model-cost-partition.log` |
| `bun test tests/framework` | 573 pass / 0 fail（47 文件，2580 expect） | `logs/08-framework-partition.log` |
| `bun test tests/connect-bot tests/codebase-tools` | 161 pass / 5 fail（25 文件，953 expect） | `logs/08-other-consumer-partitions.log` |

上述分区结果对应工作树内容 = 本票提交内容；测试文件与源码在运行期间未再变动。`tests/connect-bot` 的 5 个失败全部发生在
`startOmpBot` 的环境前置检查上：本 worktree 无真实 omp-bot 面板二进制
（`...build it with cargo build --release … or name an existing one in OMP_BOT_BINARY`），
属既有环境前置未满足（票据 05 的集成段是用 `OMP_BOT_BINARY` 跑的），与本票改动无关；`tests/codebase-tools` 全绿。

依赖前置：本 worktree 初始无 `node_modules`，`bun install --frozen-lockfile` 安装 13 个包后 typecheck/测试可运行。

## 变异注入（确认用例能捕获对应违规；每次注入后还原并复跑为绿）

| 注入 | 位置 | 结果 |
|---|---|---|
| 不发出成功提示（`recordCommit?.(...)` 注释掉） | `extensions/model-cost/shared-logic/request-accounting.ts` `save()` 成功分支 | `local-accounting-owner-sync.test.ts` 用例 1 失败（等待计数超时）；还原后绿 |
| 提示在提交回答之前发出（「开始保存」被当作成功） | 同文件，`storage.commit` 之前插入 `recordCommit?.(...)` | 用例 1 失败（计数被提前置位/出现两次，与「落地后才为 1」矛盾）；还原后绿 |
| 重复计数也再次发布 | `framework/core/observations.ts` `observeCommits` 的等值早返回删掉 | `session-observation-access.test.ts` 用例 1 失败（重复词再次送达）；还原后绿 |
| 计数不上线（帧编解码丢失成员） | `framework/modules/local-access.ts` `encodedReading` 去掉 `commits` | `local-access-observation.test.ts` 两条新用例同时失败；还原后绿 |
| 到达的计数不被采纳（`adoptReading` 不派发） | `framework/behaviors/binding.ts` 计分支条件短路 | `session-observation-access.test.ts` 2 例 + `local-accounting-owner-sync.test.ts` 2 例失败；还原后绿 |
| 提示只在本进程记账、不外发 | `framework/behaviors/binding.ts` 的 `handOverReading(handOver, stated)` 删掉 | `session-observation-access.test.ts` 2 例失败（转交与快照断言）；还原后绿 |

## 未验证与限制

- **未跑真实宿主（OMP/pi CLI）与 `tests/harness-dock`**：本票的宿主侧改动只到框架 binding 与 model-cost 装配一行
  （`recordSessionCommit` 接线），而其语义证据来自生产运行时 + 真实子进程 + 真本机接入 + 生产只读结果；
  真实宿主 CLI 与 dock 分区本票未运行（dock 需要 `../oh-my-pi` 源码检出与隔离安装，本 worktree 不具备；属票据 12 的
  P34/P35 范围）。因此本报告不主张真实 CLI 已验证。
- **未跑 POSIX 载体**：真实进程证据全部来自 Windows 命名管道；POSIX 本地 socket 分支未被本票认证。
- **未验证其他宿主/提供方版本**：pi 1.3.0 之外版本、真实 provider 账户均未涉及。
- **「同一提示只同步一次」未直接计数**：本票未对只读同步的调用次数插桩（父进程无文件系统插桩预载），
  「不轮询、不多余重复读」由以下可观察量间接支撑：提示只在计数移动时产生一次交付（框架用例）、
  同一文档的二次采纳 `changed:false` 且不重绘（既有 `shared-storage-refresh.test.ts` 用例）、
  采纳前后文件字节不变且累计不翻倍（本票用例）。**提示合并（多条提示合并为一次刷新）属票据 09 的范围，本票未实现。**
- **丢弃提示的建模方式**：S2 用例以「投递发生在无 seat 时（提示无处可去）」+「后续连接的首词携带计数」建模；
  框架层用例以「本进程从未取到的计数由后续来源状态」建模。真实的「连接中途丢失单帧」未单独构造。
- **重连语义的取舍（明确记录）**：本票实现的是「未取到的计数由后续连接的状态即触发同步」——即计数发生移动时触发，
  而**已经取过该计数的重连不会再次触发**同步（那一次同步早已发生，`changed:false` 的重复读本身也不产生任何效果）。
  这与 P19 的覆盖语句一致（「丢弃一次提交提示后断开再接入，Owner 无自身消费或提交仍能看到文件中新记录」），
  但不是「每次重连无条件同步」。若集成或契约复核要求后者，改动点只有 `observeCommits` 的来源判定与
  `adoptReading` 的派发条件（让较新来源重述同一计数也派发一次），需先修订契约再改。
- **提示合并与周期保护不在本票**：`runtime.ts` 的 `session_commit` 处理器目前是直接 `await synchronize(...)`，
  没有合并/去重调度；P18、P20 属票据 09，本票未实现、也未声称。
- **未在本票运行的分区**：`tests/harness-dock`、全仓 `bun run test`（最终集成按项目约定执行）。
- **合并注意**：本票对 `framework/core/protocol.ts`、`framework/core/observations.ts`、`framework/behaviors/binding.ts`、
  `framework/modules/local-access.ts`、`framework/core/assembly.ts` 均为增量式改动（新增成员/新轴/新增可选入参），
  与票据 07（展示合并）、09（提示合并与周期保护）预期改动面重叠时，应保留本票的 `commits` 成员、
  `recordSessionCommit` 陈述通道与 `session_commit` 轴；票据 09 的合并层应接在 `runtime.ts` 的 `session_commit`
  处理器上（本票此处是直接 `await synchronize(...)`，未做合并/去重调度）。
