# 01：冻结迁移前代表性效率基线（记录）

**本文件是本票交付的冻结记录**，配套工件为同目录的 [`01-efficiency-baseline.json`](01-efficiency-baseline.json)（采样入口一次真实运行的原始输出）。记录写在这里而不是任何承诺或工单里：`P51` 的最终判断属于 [22：效率前后对照与复杂度判断](22-efficiency-acceptance.md) 与人类验收者，本记录只提供可复现的基点、采样方法与对照材料。

- **入口（可重新运行）**：`bun run baseline:efficiency`，等价于
  `bun --preload ./scripts/support/efficiency-baseline-fs-instrument.ts ./scripts/efficiency-baseline.ts`。
  可选 `--out <path>`、`--label <text>`。直接跑入口（不带 preload）会被自检拒绝，不会产出一份“便宜的基线”。
- **被测路径**：迁移前的生产公共路径——`extensions/model-cost/definition.ts` + `createModelCostRuntime`（`shared-logic/runtime.ts`）+ 框架公共绑定（`tests/framework/support/harness-port-double.ts`，即 S1 消费面）+ 生产前端 `attachModelCostWidget` 按 `extensions/model-cost/harnesses/omp.ts` 的同一方式编入绑定 cleanup。
- **测量手段**：preload 文件系统仪器（`scripts/support/efficiency-baseline-fs-instrument.ts`）包裹本进程自己的 `fs` / `fs/promises` 导出；provider 请求由 `providerAccess` 指向的 loopback 端点真实计数；交付事件由驱动器计数。
- **本票不改动任何被测路径**：本次改动只新增 `scripts/efficiency-baseline.ts`、`scripts/support/efficiency-baseline-fs-instrument.ts` 与 `package.json` 的一条脚本入口，未改产品代码、测试、fixture 或配置。

## 1. 采样方法（每类成本的来源）

| 成本 | 口径 | 采样方法 |
| --- | --- | --- |
| 读取 `reads` | 指向 `consumption.json` / `codex-usage-estimate.json` 的 `readFile` 调用 | 仪器记录每次调用及其路径；文档尚不存在时的读取同样计入（它是路径真实付过的代价，同时出现在 `fail` 列） |
| 锁 `locks` | 名称属于 `<document>.lock`、其安装前准备的暂存目录、以及两者内部条目的所有操作 | 仪器按路径前缀归属 |
| 发布 `publishes` | 目标为文档本身的 `rename` 调用，且该调用自身**成功**结算 | 仪器为每个调用补记结算结果；被平台因“名称被占用”拒绝的重试只计入 `fail`，不冒充已落盘 |
| 请求 `requests` | 真实 HTTP 请求数 | loopback 端点逐请求记录 URL；扩展本身看不到计数器 |
| 事件 `events` + 绘制 `draws` | 驱动器投递的语义交付次数（按类型）与前端交给宿主的 widget 次数 | 驱动器与受控宿主计数 |
| 失败 `fail` | 以上窗口中**失败结算**的调用，按操作名分类 | 仪器补记的结算结果（文档尚不存在、名称已被前一步移除、发布 rename 被拒） |

归属规则：只有路径落在该序列**孤立存储根**下的记录才属于该序列，条目按路径分桶；采样器自己的工作绝不进入窗口——它自己对文档的回读、它轮询“协调已静止”的目录读取、它为序列预置的种子文档（`asSampler` 排除）。工件里每个窗口都带 `operations` 原始记录，任一数字都可回查。

**采样方法自检**：正式序列之前，入口先用生产文件模块（`framework/modules/files.ts` 的 `updateFile`）对一个抛弃文档做一次普通协调更新，若仪器没有记录到该更新的读、锁、发布，则整轮运行被拒绝（工件 `instrumentProbe`，本次：`operations=13, reads=2, publishes=1, locks=7, staging=2`；`syncOperations=1` 说明同步半区也在记录）。

## 2. 固定的代表性序列

七条序列固定在本记录与采样入口里；每条自带用独立字面量/手算写成的期望（价格数据是文件里自造的三层数据，金额全部手算，例如 `1000·2 + 8000·0.5 + 3000·8` / 百万 = 0.03 XTS），全部不变量在本次运行中成立（工件 `sequences[].invariants`）。

| 序列 | 事件序列 | 测量窗口 |
| --- | --- | --- |
| `main-request` | 初始化 → `session_start`+`round_start` → `user_input` → 一次请求（`turn_start`+`turn_end`） → `round_end` | `initialization`、`request`（分开） |
| `multi-turn` | 初始化 → 一轮内 5 次请求 → `round_end` | `turns`（累积）、`commit` |
| `main-child-concurrency` | 主会话 + 两个子代理 + 一个孙会话交错：各自 `session_start`/请求/`round_end`，一条子代理执行时长读数；主会话在两子代理之后继续一次请求 | 整段 |
| `save-onto-shared-document` | 起点是另一个 harness 已写好的文档（含其记录），本 harness 一次请求 + `round_end` 合并提交 | 整段 |
| `read-only-refresh` | 未提交消费在内存中：展示结果/余额/额度/Accrued/额度行、前端重绘、`/budget detail`、改名 `session_facts` | `refresh` |
| `healthy-idle` | 已提交后的真实 3 秒空闲窗口 | `idle` |
| `disposal` | 已提交后 `session_end(disposed)`；随后把成功 TTL 已过期的迟到请求、迟到 `round_end`、迟到命令投进来 + 真实 500 ms | `disposal`、`afterDisposal` |

## 3. 本次记录的基线数值（2026-10-16，win32 x64，bun 1.4.2）

列：文件操作总数 / 读取 / 发布 / 锁 / 暂存 / 元数据 / 目录 / 其他 / 失败 / provider 请求 / widget 绘制 / 墙钟 ms。

（下表与工件 `sequences[]` 的本次运行数值逐格一致；只有 `失败` 与 `ms` 两列会在重复运行时略有波动，见第 4 节。）

| 序列 | 总 | 读 | 发布 | 锁 | 暂存 | 元数据 | 目录 | 其他 | 失败 | 请求 | 绘制 | ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main-request | 15 | 3 | 1 | 7 | 2 | 1 | 1 | 0 | 6 | 1 | 8 | 24 |
| multi-turn | 15 | 3 | 1 | 7 | 2 | 1 | 1 | 0 | 6 | 1 | 16 | 7 |
| main-child-concurrency | 51 | 6 | 4 | 28 | 8 | 4 | 1 | 0 | 15 | 1 | 30 | 16 |
| save-onto-shared-document | 15 | 3 | 1 | 7 | 2 | 1 | 1 | 0 | 4 | 1 | 8 | 7 |
| read-only-refresh | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **1** | 8 | 4 |
| healthy-idle | 15 | 3 | 1 | 7 | 2 | 1 | 1 | 0 | 6 | 1 | 8 | 3006 |
| disposal | 15 | 3 | 1 | 7 | 2 | 1 | 1 | 0 | 6 | 1 | 9 | 507 |

按窗口拆开的关键数字（对照时按这些窗口比较，别只看整段）：

| 窗口 | 总 | 读 | 发布 | 锁 | 暂存 | 元数据 | 目录 | 失败 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main-request / initialization | 3 | 2 | 0 | 0 | 0 | 0 | 1 | 2 | 建根目录 1、基线文档读取 1、估计文档读取 1；两次读取都是“文档尚不存在”，无发布 |
| main-request / request | 12 | 1 | 1 | 7 | 2 | 1 | 0 | 4 | 一次轮结束提交的完整代价 |
| multi-turn / turns（5 次请求） | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 逐事件不碰盘：一次请求的交付本身零文件操作 |
| multi-turn / commit | 12 | 1 | 1 | 7 | 2 | 1 | 0 | 4 | 整轮只提交一次 |
| main-child-concurrency / whole | 51 | 6 | 4 | 28 | 8 | 4 | 1 | 15 | 4 个会话各自提交：读=1 初始化 + 4，发布=4 |
| read-only-refresh / refresh | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 只读刷新零文件操作、零请求，且**不强制提交**在途消费（`consumption.json` 仍不存在） |
| healthy-idle / idle（3 s） | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 健康空闲无固定轮询：零文件、零请求、零重绘、无重建等待 |
| disposal / disposal | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 清理本身不写盘、不请求 |
| disposal / afterDisposal | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 处置后即便成功 TTL 已过期、迟到请求/轮/命令到达，也无文件、无请求、无重绘 |

每序列同时记录的不变量（全部通过，`sequences[].invariants` 带证据文本）要点：初始化只读不写；初始化恰好 1 次 provider 请求（Codex 渠道因宿主无凭据而不发请求，这是“缺失”不是零成本）；请求锚价按手算金额（0.03 / 五轮 0.15）；每轮结束恰好 1 次成功发布；子代理消费只进自己的记录并保留直接父链；子代理执行时长读数落在所属会话；共享文档上合并提交保留另一 harness 的记录；只读刷新零效果；3 秒空闲零效果；处置后零效果且 UI 等待已释放。处置序列另在 `sequences[].evidence` 里如实记下迟到命令的受理结果（本次 `answered`）与处置后 widget 行数（0）——那是被记录的事实，不是断言。

## 4. 复现、噪声与可比性

- **重复运行**：同一源状态下连跑两次（`--label run-a` / `run-b`），七条序列的**读取、发布、锁、暂存、元数据、目录、请求、绘制、事件与全部不变量**完全一致；只有并发序列的失败结算数（因此该序列的 `总` 列）在 15–17 / 51–52 之间波动——Windows 上并发提交的发布 rename 偶发被拒并重试、以及拆除步骤对“已被前一步移除”的名称再删一次，重试成功后**成功发布数仍是 4**。比较时用成功计数（读/发布/锁/暂存/元数据/请求/绘制/事件），不要用 `fail` 与它带动的 `总`；`ms` 列同样只是参考。
- **可比的维度**：`S1` 公共消费面上的公共路径成本（框架绑定 + model-cost shared logic + 生产前端组合）。统一实现后重跑同一条目、比较同一窗口即可。
- **不可比 / 未覆盖**（工件 `notComparableScenarios`，此处不编造任何 pi 数值）：
  1. `native-adapter-fact-mapping`：OMP adapter 的原生读取（Turn、Round、改名、启动模型、context、provider access）是宿主代码，本进程内驱动器用语义交付代替；其成本属真实宿主，由 22 的 dock 运行负责。
  2. `omp-viewed-session-display`：OMP viewed-session 展示面是 OMP 独有事实（pi 保留主会话展示），没有可比较的共同行为。
  3. `real-terminal-drawing`：真实终端绘制、宽度与观感属人类验收（P52）。
  4. `native-session-storage`：宿主自己的会话 JSONL/日志不在本基线归属的存储根内。
  5. `codex-account-query`：账户查询需要真实凭据与代理条目；本基线对该 provider 无访问，记录的是“absence”而非成本（真实账户侧核对见 P53）。
  6. `external-document-adoption-refresh`：读取刷新“采纳他人已提交文档”这一半在两端都还没有实现，本序列只记录只读工作本身零成本的一半。

## 5. 现有业务/接线复杂度与根专属效果（交给 22）

工件 `complexity` 由入口在运行时按文件统计（`wc` 等价，独立于实现行为），单位=行：

| 分层 | 模块 | 行数 |
| --- | --- | --- |
| 业务（宿主无关 shared-logic） | `extensions/model-cost/shared-logic`（含 `presentation/`） | **7076** |
| 接线（宿主专属） | `extensions/model-cost/harnesses`（`omp.ts` 223 + `widget.ts` 1051 + `boundary-timer.ts` 146） | 1420 |
| 接线 | `entrypoints/omp/model-cost.ts` | 9 |
| 接线（框架适配层） | `framework/adapters/omp.ts` / `framework/adapters/pi.ts` | 1061 / 251 |
| 共享框架模块 | `framework/modules/files.ts` / `framework/modules/http.ts` | 671 / 593 |
| 合计 | — | 11081 |

单文件最大的业务模块：`request-accounting.ts` 1183、`presentation/display.ts` 1658、`consumption-document.ts` 576、`runtime.ts` 548、`consumption-store.ts` 526、`codex-quota.ts` 519。

**根专属效果（每进程一次、不得随绑定/子会话重复）清单及本次实测**：

| # | 效果 | 落点 | 本次实测 |
| --- | --- | --- | --- |
| 1 | 进程唯一业务实例（工厂只跑一次） | `framework/core/assembly.ts`（工厂语义）、`harnesses/omp.ts` 模块级 `runtime` | 4 个会话共用一个实例：并发序列整段只有 1 次初始化 |
| 2 | 初始化一次：基线文档读 + 估计文档读 + 两个 provider 预取 | `shared-logic/runtime.ts` `initialize` | `main-request/initialization`：读 2、目录 1、发布 0 |
| 3 | DeepSeek 余额预取（真实 HTTP） | `provider-balance.ts` `prefetch` | 每序列 `requests=1`；4 会话序列仍为 1 |
| 4 | Codex 账户查询（有凭据时才发） | `codex-quota.ts` `startup` | 本环境 0 次（宿主无访问） |
| 5 | 前端挂载一次 | `harnesses/omp.ts` `attachModelCostWidget` | draws 8–30（随事件数变化），每进程 1 次挂载 |
| 6 | UI 边界等待（每 UI 一个） | `harnesses/omp/boundary-timer.ts` + `harnesses/omp.ts` 模块级 `uiBoundaryTimer` | 健康空闲 `timersArmed=1` 且不重建；处置后 = 0 |
| 7 | 清理至多一次并释放订阅/定时器 | `runtime.ts` `cleanup`（balance/quota/accounting）+ 前端释放 | `disposal` 窗口 0 文件、0 请求；`afterDisposal` 全 0 |
| 8 | 每绑定 3 个原生 context 观察事件 | `harnesses/omp.ts` `SESSION_CONTEXT_EVENTS` | 只写进程内读数，不落盘（只读刷新 0 文件操作） |

（1–7 是“根专属”：重复执行就是缺陷；8 是按会话注册，重复注册同会话才是缺陷。）

## 6. 命令、环境与证据归属

```
$ bun run typecheck
$ tsc --noEmit        # 通过，无输出
$ bun run baseline:efficiency
$ bun --preload ./scripts/support/efficiency-baseline-fs-instrument.ts ./scripts/efficiency-baseline.ts \
    --out .scratch/model-cost-pi-migration/evidence/01-efficiency-baseline.json --label pre-migration
sequence                   events reads pubs locks stage  meta  dirs other  fail   req draws     ms  invariants
main-request                    6     3     1     7      2      1     1     0     6      1     8     24 ok
multi-turn                     14     3     1     7      2      1     1     0     6      1    16      7 ok
main-child-concurrency         24     6     4    28      8      4     1     0    15      1    30     16 ok
save-onto-shared-document       6     3     1     7      2      1     1     0     4      1     8      7 ok
read-only-refresh               6     0     0     0      0      0     0     0     0      1     8      4 ok
healthy-idle                    6     3     1     7      2      1     1     0     6      1     8   3006 ok
disposal                       10     3     1     7      2      1     1     0     6      1     9    507 ok

instrument probe: {"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}
every invariant held.
```

- **源状态**：工件 `source` 记录 HEAD = `59a0ed714afb9e2e1ca7370364440d96ea6d3dc5`（分支 `hyper/model-cost-pi-migration/01-efficiency-baseline-...`）、以及当时未提交的路径（`M package.json`、`?? scripts/efficiency-baseline.ts`、`?? scripts/support/efficiency-baseline-fs-instrument.ts`、`?? .scratch/model-cost-pi-migration/evidence/`）——即差异仅为本基线自身新增的文件，被测生产路径与该 HEAD 完全一致。
- **环境**：win32 / x64 / bun 1.4.2 / node 24.x（工件 `run`）；无 OMP 安装、无通道补丁、无网络依赖：provider 请求全部打到 `127.0.0.1` 上本次运行自己启动的端点，余额响应是记录里写死的样例文档；Codex 账户查询因宿主无凭据而未发出。时钟固定为 `2026-10-14T05:00:00Z`（数据自身 +08:00 时区的 13:00，非高峰），所有金额与时段判断与真实墙钟无关。
- **未覆盖**：真实 OMP 宿主、真实 pi 宿主、真实 provider 账户、真实终端绘制（见第 4 节不可比清单）。
- **复现核验（本票完成时实跑）**：按记录交给 22 的同一条命令 `bun run baseline:efficiency` 重跑一次，逐项与冻结工件对比：七条序列的读/发布/锁/暂存/元数据/目录/请求/绘制/事件、每条不变量、以及工件 `notComparableScenarios` 全部一致；差异只有并发序列的失败结算数（15→16，因而该序列 `总` 51→52）与各序列 `ms`，即第 4 节已声明的噪声项。重跑工件写在 `.cache/efficiency-baseline/efficiency-baseline.json`（未纳入提交）。
- **交给 22 的动作**：在同一源状态与环境下重跑 `bun run baseline:efficiency`，按第 3 节窗口逐项对照（尤其是 `multi-turn/turns` 的逐事件零读盘、`read-only-refresh/refresh` 的零效果、`healthy-idle/idle` 的零轮询、以及根专属效果表的实测列）；`fail` 列仅作噪声参考。最终“明显额外开销/显著复杂度增加是否可接受”的判断属人类验收者（P51）。
