# 22：效率前后对照与复杂度判断（记录）

**本文件是本票交付的验证记录**：`P51` 的完整 Coverage（S1、S2、S3）与 `P57` 中「P51：禁止的重复工作和健康空闲轮询不新增」一项。本文件不改承诺、不改 seam，也不重复认领其他票的条目。`P51` 的最终判断（"明显额外开销与复杂度是否可接受"）属人类验收者，**本票交付时保持未验收**。

- **入口（可重跑）**：
  - `bun run baseline:efficiency --out <artifact.json> --label <label>`（S1 公共路径的固定七序列采样；前置 preload 由该脚本自带）
  - `bun run compare:efficiency -- --before <before.json> --after <after.json> [--out <report.txt>]`（对齐两份工件并按序列/窗口逐项比较，另按两版 revision 统计复杂度）
  - `bun test tests/harness-dock/efficiency-effects.test.ts`（S2/S3 真实 OMP 宿主的外部效果计数；3 例）
  - `bun run typecheck`
  - `OMP_BOT_BINARY=<本机既有 release 构建> bun test tests/harness-dock`（所属分区）
- **源状态**：分支 `hyper/model-cost-pi-migration/22-efficiency-acceptance-a73e6b-411dc288ea83`，起点 `39fdc3d`（= `pi-adapter` 尖端，含 21 的合入），实现提交 `efb03e0`。改动仅为 `scripts/efficiency-baseline.ts`（并发序列的请求数按其自身时间线陈述 + 读计数前等待该到达）、`scripts/efficiency-comparison.ts`（新增）、`package.json`（新增 `compare:efficiency`）、`tests/harness-dock/support/effect-instrument.ts`（新增）、`tests/harness-dock/efficiency-effects.test.ts`（新增）。**本票无产品代码改动**（`git diff --stat 39fdc3d..efb03e0` 的 5 个文件全在 `scripts/` 与 `tests/harness-dock/` 内；未改 `framework/`、`extensions/`、`entrypoints/`）。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2（`bun run typecheck` → tsc 无诊断）；真实宿主为隔离精确安装 OMP 18.5.0（`.cache/omp-baseline/18.5.0`，未打补丁——本票不涉及 viewed-session / codex-response 两个补丁条件）；无 provider 凭据、无付费调用：模型请求与余额查询全部由本机 capture endpoint 回答（`127.0.0.1`）。

## 1. 交付的行为（本票实现）

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 采样入口按自身时间线陈述请求数 | `scripts/efficiency-baseline.ts` | 并发序列把"子代理 Round 结束"的瞬间陈述为一次时钟推进（`CHILD_ACTIVITY_MS`），该瞬间越过条目自己声明的成功 TTL；于是条目把该序列的请求数陈述为「一次启动预取 + 一次已结算请求刷新」，并在读取计数前**等待该到达**（此前是竞态；**那处时钟推进本身来自 ticket 11 的适配** `fea87c7`，见 §15.2）。序列、采样方法、其他不变量与工件形状不变。 |
| 可归属的对照入口 | `scripts/efficiency-comparison.ts`（`bun run compare:efficiency`） | 对齐两份采样工件，按序列与测量窗口逐项比较（读取/发布/锁/暂存/元数据/目录/总数、请求、绘制、事件、等待、行数），列出可归属差异与噪声列；复杂度按两版 revision **自身 tree 的 tracked TypeScript 行数**分产品面/证据面统计，并列出逐模块变化。不设阈值、不因差异失败——判断属人类。 |
| 真实宿主的外部效果记录器 | `tests/harness-dock/support/effect-instrument.ts` | 通过 `BUN_OPTIONS=--preload` 注入真实宿主进程，在宿主自己的模块图之前包裹 `node:fs`、`node:fs/promises`、`node:net` 的成员并记录每次调用，进程退出时把记录写到运行自己指名的文件。未被指名 dump 文件时**完全不动作**；dump 用包裹前捕获的成员写出，自己的写不进入记录。 |
| 真实宿主效果检查 | `tests/harness-dock/efficiency-effects.test.ts` | 3 例：单会话一轮的存储成本与健康空闲窗口；带一个真实子代理会话时无第二次根查询/无重复根 UI/无本地 IPC；记录器自身的灵敏度对照。 |
| 对照入口自身的覆盖 | `tests/harness-dock/efficiency-comparison.test.ts`（§13 新增，属本票分区） | 11 例，只经入口的命令行 seam（报告文本 + 退出码）观察：相同图不制造差异、差异照印且退出 0（判断属人类）、冻结记录声明的噪声列只观察不比较、缺失窗口/revision 不被填数、复杂度按各 revision 自身 tree 计量（含 §10 的行计数口径）。fixture 工件按字面量手写。 |

## 2. 自动证据（本票分区与真实宿主，实际运行）

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无输出 | — |
| `bun run baseline:efficiency --out …/22-efficiency-after.json --label post-migration` | 0 | 七条序列全部不变量成立（`every invariant held.`）；工件 `../evidence/22-efficiency-after.json` | `logs/22-baseline-post-migration.log` |
| `bun run compare:efficiency -- --before 01-… --after 22-… --out …` | 0 | 对照报告（下表 §3/§4） | `logs/22-efficiency-comparison.txt`、`logs/22-efficiency-comparison-console.log` |
| `bun test tests/harness-dock/efficiency-effects.test.ts` | 0 | **3 pass / 0 fail**，21 expect() | `logs/22-dock-effects-post.log` |
| 同上、在 59a0ed7 工作树（迁移前） | 0 | **3 pass / 0 fail**，21 expect() | `logs/22-dock-effects-pre-migration.log` |
| 故障注入：宿主内多一个 500ms 读盘轮询（临时、未提交） | 1 | 该例按预期失败：`consumptionReads 2 → 12`、空闲窗口 6 次读 | `logs/22-dock-effects-injected-poll.log` |
| 对照 A/B：条目时间线不动（去掉时钟推进） | 1 | 并发序列 `requests=1`（原不变量按预期失败），文件成本各列不变 | `logs/22-ab-no-clock-advance.log` |
| 对照 A/B：TTL 抬到 1e9ms（时钟推进保留） | 1 | 并发序列 `requests=1` | `logs/22-ab-huge-ttl.log` |
| `OMP_BOT_BINARY=<本机既有构建> bun test tests/harness-dock`（所属分区，真实宿主） | 0 | **93 pass / 0 fail**，1121 expect()，26 文件 / 280.4s（含本票新增 3 例；21 时代同分区为 90 pass，90+3=93） | `logs/22-partition-harness-dock.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | 463 pass / 0 fail，2524 expect() | `logs/22-partition-model-cost.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | 481 pass / 0 fail，2250 expect() | `logs/22-partition-framework.log` |

**运行环境的两处说明（都不是本票改动）**：

1. 本工作树 `core.autocrlf=true`，`bun.lock` 与两个 `host-patches/*/patch.diff` 在检出时被写成 CRLF，导致 12 个 dock 基线/补丁用例按"patch touches no file"失败。按 21 的做法把三份文件还原成**已提交 blob 的 LF 字节**（`git cat-file blob HEAD:<path>` 重写，sha256 与 blob 逐一相等）后，同一分区 93 pass / 0 fail。三个文件在工作树里与 HEAD 无内容差异（`git diff --stat` 无输出）。
2. 分区运行期间未改动被测源码或 fixture：源码改动只有本票自己的 `scripts/*` 与 `tests/harness-dock/*` 文件（分区运行前已提交）；运行期间只做只读诊断与文档写作。对照报告与迁移后工件测得的是实现提交 `efb03e0`；其后 `6802bef` 只把对照入口的「文件总数」列从可比差异移入噪声段并加一行口径说明（`scripts/efficiency-comparison.ts`，属证据面 `scripts` family，不影响任何被测路径与上表分区结果）。

`bun run baseline:efficiency` 的采样路径是生产公共路径（真实 `definition` + `createModelCostRuntime` + 框架公共绑定 + 生产前端组合），七条序列的期望值来自手算金额与独立字面量；本票只改其中一个不变量的**陈述口径**与到达等待，未改任何期望的独立来源。

## 3. `P51` 前后对照：固定序列成本（S1）

对照报告 `logs/22-efficiency-comparison.txt` 逐序列、逐窗口给出 before/after。**七条序列的窗口级文件成本全部相同**（读取、发布、锁、暂存、元数据、目录、其他）：

```
sequence / window                  reads  publishes  locks  staging  metadata  dirs  other
main-request / initialization        2/2        0/0    0/0      0/0       0/0   1/1    0/0
main-request / request               1/1        1/1    7/7      2/2       1/1   0/0    0/0
multi-turn / turns                   0/0        0/0    0/0      0/0       0/0   0/0    0/0     ← 逐事件零读盘
multi-turn / commit                  1/1        1/1    7/7      2/2       1/1   0/0    0/0
main-child-concurrency / whole       6/6        4/4  28/28      8/8       4/4   1/1    0/0
save-onto-shared-document / whole    3/3        1/1    7/7      2/2       1/1   1/1    0/0
read-only-refresh / refresh          0/0        0/0    0/0      0/0       0/0   0/0    0/0     ← 只读刷新零文件、零请求
healthy-idle / idle                  0/0        0/0    0/0      0/0       0/0   0/0    0/0     ← 3s 健康空闲零效果
disposal / disposal                  0/0        0/0    0/0      0/0       0/0   0/0    0/0
disposal / afterDisposal             0/0        0/0    0/0      0/0       0/0   0/0    0/0     ← 处置后（含迟到请求）零效果
```

**可归属差异（仅并发序列）**：

（注：`logs/22-efficiency-comparison.txt` 已按 §7 的命令由**当前**对照入口重新生成（见 §10），因此 `file total` 与 `6802bef` 的口径一致地列在噪声段；本表数值不变，本次重跑逐项复现。）

| 差异 | 数值 | 原因（可归属） |
| --- | --- | --- |
| `requests` | 1 → 2（两条都是 `/user/balance`） | 条目自身的时间线：该序列把子代理 Round 结束陈述为 `clock = T0 + 360000ms`（ticket 11 / P24 的"按 Round 区间累计耗时"落地后，宿主不再声明耗时读数，只能按时钟推进），越过条目自己声明的 `balanceTtlMs=30000`；于是第一个在该瞬间之后结算的计价 Turn 触发**一次**已结算请求刷新（`provider-balance.ts` 的共享规则，非轮询）。归属证据：`provider-balance.ts` / `provider-refresh.ts` 在 `59a0ed7..efb03e0` **无任何改动**（`git diff --stat 59a0ed7 HEAD -- extensions/model-cost/` 不含这两个文件）；时间线不动时 `requests=1`（`logs/22-ab-no-clock-advance.log`）；TTL 抬到 1e9ms 时 `requests=1`（`logs/22-ab-huge-ttl.log`）。 |
| `draws` | 30 → 33 | 其中 +1 伴随上面那次刷新的结果变更通知（同一运行里 `requests=1` 时 draws=32）；另 +2 在同一时间线与同一请求数下出现，机制可归属到 P24 的落地：`request-accounting.ts` 的 round_end 为 `kind === "sub"` 新增一次 `announce()`（每个子代理 Round 结束一次；该序列有 3 个子会话 Round 结束，与提交渲染部分合并）。**每渲染级归因未做**，见 §6。**§13 已补 A/B 实测**：停用该 `announce()` 后同一 revision、同一配置下 draws `33 → 30`、其余可比图与语义交付逐项不变、不变量全部成立 —— 即该序列的 +3 全部来自这条通知路径；哪一帧与提交渲染合并仍未定位。**§14** 在交付提交 `cbfc63c` 上以随证据保存的补丁重做了同一次 A/B（§13 那份报告引用的 `3f547df` 是被改写的临时提交，交付分支不可达），结论相同。 |
| `events` | 24 → 23 | 采样器的交付组合变化：`subagent_runtime` 读数交付随 P24 移除（1 次），其余交付计数相同（对照报告 "semantic deliveries" 段）。 |
| `file total` | 51 → 53 | **噪声列驱动**：该列把结算失败的调用也计入（本次并发序列多了 2 次被平台拒绝的发布 rename 重试），失败列本身已被 01 声明为重复运行就波动的项。成功计数（读/发布/锁/暂存/元数据/请求/绘制/事件）逐个相同。 |

**§15.2 给前两条补了同一陈述下的实测**：把「按 Round 区间陈述耗时的时钟推进」这处采样陈述施加回**迁移前的产品树**后，同一棵树上就单独复现出 `requests 1 → 2` 与 `events 24 → 23`（`subagent_runtime 1 → 0`）这两行；反过来，在**同一陈述**下对照迁移前后的产品，全表只剩 `draws 30 → 33` 一条可比差异（`requests 2/2`、`events 23/23`、七条序列窗口级文件成本逐列相同）。即上表前两条的「原因」是**陈述级**、不是产品级成本；本表仍按 01 的冻结工件原样呈现（票的 AC1 如此要求），冻结工件未被改写。**同一陈述下的对照报告另存为交付名 `logs/22-efficiency-comparison-matched.txt`**（与 `logs/22-efficiency-comparison.txt` 并列，逐字节等于 §15.2 的 `…-matched-conditions-fresh.txt`）。

噪声列（对照报告单独列出，不比较）：`failed by operation`、各序列 `wall clock ms`。01 声明这两个量在同一源状态的重复运行间波动，本次观察一致（如 `ms` 16 → 71 属并发序列的负载噪声）。

## 4. `P51` 复杂度对照（两版 tree 自身的 tracked TypeScript 行数）

| 面 | before (59a0ed7) | after (efb03e0) | 差 |
| --- | --- | --- | --- |
| **产品面**（framework + extensions + entrypoints） | **19287** | **23773** | **+4486（+23%）** |
| 证据面（tests + scripts，非产品代码） | 54806 | 79994 | +25188 |

（两张表的数字是 §10 修正行计数口径后的当前值；唯一因此改变的模块是 `framework/adapters/omp/session/facts.ts`（290 → 279，原口径把它读成 278），所以 `framework/adapters` 与产品面合计各比原报告多 1。两者都经 §10 的独立计数复核。）

产品面分层：`extensions/model-cost` 8537 → 10326（+1789，业务 + 接线）、`framework/adapters` 2571 → 3890（+1319，pi 适配器新增/`omp/subagents.ts` 移除）、`framework/modules` 1264 → 2244（+980，新增 `local-access.ts` 本机接入）、`framework/core` 2949 → 3248（+299）、`framework/behaviors` 2070 → 2142（+72）、`framework` 顶层 161 → 158、`entrypoints` 37 → 46、`extensions/{connect-bot,codebase-tools}` 1698 → 1719。

逐模块（对照报告完整列出 36 个产品模块）：最大新增为 `extensions/model-cost/harnesses/pi/widget.ts` 1053（pi 专有绘制接线）、`framework/modules/local-access.ts` 980（本机接入 + 所有权读取）、`framework/adapters/pi.ts` +572、`framework/adapters/pi/nicobailon.ts` 556（第三方接线集中处）、`extensions/model-cost/harnesses/pi.ts` 277；最大移除为 `framework/adapters/omp/subagents.ts` −399（被统一路径替代）与 `harnesses/omp/boundary-timer.ts` −146（移为两端共用）。业务公共逻辑本身 `extensions/model-cost/shared-logic` 增量为 +452（runtime +201、consumption-store +158、其余为小量），其中相当部分是本迁移要求的跨 harness 汇总/合并提交能力。

说明：`scripts/efficiency-baseline.ts` 在 before 列显示 `-`，因为该工件当时是**未提交**的新文件（01 记录里列在未提交路径中），git 的 revision tree 里不存在——这是测量口径，不是删除。

## 5. 真实宿主外部效果计数（S2、S3；`P57` 的 P51 项）

记录器在**宿主进程内**观看效果，测试在**进程外**读它的 dump（§1）；对照例证明记录器真的记录（同一预载下，一个已知读文件并建监听端点的子进程出现在 dump 中：`readFileSync` + `net.createServer` + `net.connect`）。两个真实宿主例的观察（before = 同一测试文件在 59a0ed7 工作树运行）：

| 观察面 | 单会话一轮（before → after） | 主子会话（before → after） | 断言/来源 |
| --- | --- | --- | --- |
| 存储根文件操作 | 13 → 13（明细逐条相同：建根、初始化读消费文档与 Codex 估计、建锁暂存、写锁条目、发布 rename（锁）、读消费文档（锁内）、写发布暂存、发布 rename（文档）、两处 staging 清理、realpath） | — | `consumption.json` 读 = 2、`codex-usage-estimate.json` 读 = 1、`consumption.json` 发布 = 1（= 01 冻结记录里 initialization（读 2）与 request（读 1 + 发布 1）两窗的每轮成本） |
| 健康空闲窗口（3s，真实墙钟） | 0 → 0（**整个宿主进程零文件、零网络、零 provider 到达、零新绘制**） | 0 → 0 | 窗口按自身两个时间界断言，不靠"等够了" |
| provider 到达 | `["balance","model"]` → 同 | `["balance","model","model","model"]` → 同 | 整进程**恰好一次**余额预取（含子代理请求）；子代理不触发第二次根查询/预取 |
| widget 绘制帧 | 10 → 10 | 33 → 18 | 帧数差异见下；两次运行都只由根会话产生（无第二次挂载） |
| 本地 IPC | `net.createServer` = 0、无 `my-agent-toolkit-access` 目标 | 同 | OMP 同进程未开任何监听端点、未触达本机接入管道（`framework/modules/local-access.ts` 的发布方只属 pi 适配器） |
| 进程内总效果数 | 2294 → 2295 | 2688 → 2689 | 差异为**模块加载期**的 `realpath` 解析（before `subagents.ts`；after `followed-owners.ts` + `local-access.ts`），一次性、非逐事件、不落存储根 |

- **未新增的重复工作与轮询**：并发准备/预取仍是每进程一次（含子代理在侧），健康空闲在两个形态下都是零效果，OMP 同进程无 IPC——before/after 逐项相同（上表）。
- **差异**：主子会话例的 widget 绘制 33 → 18（变少），单会话例 10 → 10；该量是前端渲染次数（纯展示工作，不涉请求/落盘/IPC），其变化属显示通知次数，**未逐步归因**（见 §6）。
- **灵敏度**：把宿主内的空闲轮询（临时注入，未提交）加进来后，`consumptionReads` 立刻 2 → 12、空闲窗口出现 6 次读，该例失败；移除注入后同一条目恢复 3 pass（`logs/22-dock-effects-injected-poll.log`）。即"零"不是看不见，而是真的没有。
- **记录器自身的对照**（同一文件的第 3 例）证明"零"不是"没装上预载"：dump 缺失会被该文件的 `recordedEffects` 明确报错而不是读成零。

## 6. 未覆盖 / 限制

- **人类验收未完成**：`P51` 的最终判断（"明显额外开销与复杂度是否可接受"）属人类验收者，本票只准备材料，**不标为通过**；`P52`（真实终端观感）、`P53`（真实账户侧核对）不在本票范围。
- **不预设百分比**：报告与本文只陈述可归属的差值与成本，任何"可接受"判断留给人类；`compare:efficiency` 不因差异失败。
- **未逐步归因的项**：(a) 并发序列 draws 的 +2（机制可归属到 P24 新增的每子代理 Round 结束 `announce()`，但未定位到具体哪几次渲染被合并）—— **§13/§14 把它归到唯一路径、§17.1 归到渲染级（同一帧内容多画 3 次）、§18 归到通知级（3 条通知 ↔ 3 帧 1:1 配对，其中第 3 条即该 `announce()`），该条已关闭**；(b) 主子会话例 widget 绘制 33 → 18 —— **§15.3 已把它归到内容级**：两侧状态推进与内容一致，差异全在同一状态被重复重绘的次数（迁移前 33 帧 = 6 条两行帧 + 27 条三行帧、尾部那组三行帧重绘 26 次；迁移后 18 帧 = 6 + 12、同一组 12 次），同一 run 的非 widget 帧数（38）、provider 到达、存储根操作与网络效果逐项相同，**逐帧/逐通知的机制定位仍未做**（§19.5 记录本轮对这条的处置与理由：方向为减少、不属 P51 的交付项，按限制记录）。两者都只涉及前端渲染次数。
- **只覆盖 OMP 侧的"同进程无 IPC"**：pi 的本机接入（管道发布/连接）按其设计存在，其行为由 P14/P16/P42/P56 的分区与真实 pi 冒烟覆盖；本票的记录器只注入 OMP dock 的宿主进程，未对 pi 宿主做同样的外部效果计数。
- **S1 采样不覆盖宿主原生半边**：OMP adapter 的原生事实映射、宿主自己的会话 JSONL/日志、真实终端绘制仍不可比（01 的 `notComparableScenarios` 原样保留）；本票用真实 OMP 宿主覆盖了其中的存储/请求/IPC/空闲部分，但不覆盖真实终端绘制与真实 provider 账户。
- **范围限制**：全部证据仅覆盖 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（未打补丁）、以及指向本机 capture endpoint 的 shipped DeepSeek provider；不推广到其他版本、POSIX、跨用户或真实账户。
- **迁移前 dock 对照的构造**：before 侧是把本票新增的测试文件与记录器复制进 `59a0ed7` 工作树后运行（该文件当时不存在）；两侧使用同一份测试文件与同一份 OMP 18.5.0 安装版本，故计数可比。after 侧表内 `ms`/失败列等噪声项不参与比较。（§15.3 用同一构造在 `9738b5f` 上第一手复现了 `10`/`33`，该 revision 的产品面与 `59a0ed7` 逐文件相同。）
- **已关闭的限制**：§8/§11/§12 列出的「对照入口无自动化测试覆盖」已由 §13 的 `tests/harness-dock/efficiency-comparison.test.ts`（11 例，含 4 次目标注入证明灵敏度）关闭；§14 另把 §13 的 A/B 归因改写成可复现形式（原报告引用的临时提交 `3f547df` 在交付分支不可达）；§15.2 补上「同一陈述下迁移前产品的实测」（冻结对照里的 `requests`/`events` 两条是陈述级而非产品级），§15.3 把主子例 `frames 33 → 18` 归到内容级；**§17.1 把并发序列 `draws +3` 归到渲染级、§18 把它的「通知→帧」配对做完（本票内部最后一条可归属缺口）**；**§19** 用第二套独立管线（`git archive` tar 流 + 逐文件行计数）复算产品面复杂度并与对照入口的数字**逐族一致**（`19287 → 23773 (+4486)`，集成尖端 `190e1b5` 相同），并把分区首次运行的一次**负载型假失败**（`model-cost-modes.test.ts` 两例 90s 宿主启动停滞、其 `catch` 的 `EBUSY` 掩盖原错；同样两例单跑 6.71s 通过、同源状态整分区重跑 **104 pass / 0 fail** / 220.12s）如实记录在案；本节其余各条仍然成立。

## 7. 复现步骤（本票实际执行）

```sh
# S1：迁移前基线（冻结工件，01 已交付）与迁移后重跑
bun run baseline:efficiency --out .scratch/model-cost-pi-migration/evidence/22-efficiency-after.json --label post-migration

# S1：可归属对照（逐序列/窗口 + 复杂度）
bun run compare:efficiency -- \
  --before .scratch/model-cost-pi-migration/evidence/01-efficiency-baseline.json \
  --after  .scratch/model-cost-pi-migration/evidence/22-efficiency-after.json \
  --out    .scratch/model-cost-pi-migration/evidence/logs/22-efficiency-comparison.txt

# S2/S3：真实 OMP 宿主的外部效果计数（首次运行会先物化隔离安装）
bun test tests/harness-dock/efficiency-effects.test.ts

# 归属 A/B（临时改副本，跑完即弃；日志见 logs/22-ab-*.log）
#   (a) 去掉并发序列的时钟推进           → requests=1
#   (b) 把 balanceTtlMs 抬到 1e9ms        → requests=1

# 所属分区（真实宿主，串行；运行期间源码与 fixture 未变）
OMP_BOT_BINARY="E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe" bun test tests/harness-dock

# §15.2 同一陈述下的可比性实测（临时 worktree，跑完即删；未被采样的产品树 9738b5f 的产品面 == 59a0ed7）
git worktree add --detach <tmp> 9738b5f          # 再把 node_modules/.cache 用 junction 指向本工作树
cd <tmp> && bun --preload ./scripts/support/efficiency-baseline-fs-instrument.ts ./scripts/tmp-efficiency-baseline-01.ts \
  --out <logs>/22-takeover-i-before-control.json  --label before-control   # 01 自己的采样器（控制）
cd <tmp> && bun --preload ./scripts/support/efficiency-baseline-fs-instrument.ts ./scripts/efficiency-baseline.ts \
  --out <logs>/22-takeover-i-before-matched.json  --label before-matched   # 交付态采样器（匹配）
bun run compare:efficiency -- --before <logs>/22-takeover-i-before-control.json  --after <logs>/22-takeover-i-before-matched.json --out <logs>/22-takeover-i-statement-only.txt
bun run compare:efficiency -- --before <logs>/22-takeover-i-before-matched.json  --after <logs>/22-takeover-i-after.json         --out <logs>/22-takeover-i-matched-conditions-fresh.txt

# §15.3 主子例帧归因（临时探针副本，两侧同一份字节；跑完即删，日志 `logs/22-takeover-i-frames-*.log`、转储 `…-.NNframes-*.json`）
MY_DOCK_FRAMES_OUT=<logs>/22-takeover-i-frames-before bun test tests/harness-dock/tmp-frames-probe.test.ts   # 在 <tmp> 上跑
MY_DOCK_FRAMES_OUT=<logs>/22-takeover-i-frames-after  bun test tests/harness-dock/tmp-frames-probe.test.ts   # 在本工作树跑
```

**交给人类验收者的材料**：`22-efficiency-after.json`（迁移后工件）、`logs/22-efficiency-comparison.txt`（对照表）、§3/§4 的差异与复杂度摘要、§5 的真实宿主外部效果计数、§15.2 的同一陈述对照（`logs/22-efficiency-comparison-matched.txt`，逐字节等于 `logs/22-takeover-i-matched-conditions-fresh.txt`；陈述分离的中间报告 `logs/22-takeover-i-statement-only.txt`）。判断项：统一路径是否带来**明显额外开销**（本票观察到的**产品级**可比成本差异只有并发序列的前端渲染次数——同一陈述下 `requests`/`events`/七条序列文件成本逐列相同，§15.2；冻结对照里的那次"已结算请求刷新"与 `events -1` 是采样陈述级，迁移前的产品在同一声明下同样发出）以及**显著复杂度增加**（产品面 +4486 行 / +23%，其中 pi 接线与适配器是新增能力自身）。

## 8. 接手后的独立复核（同一源状态 `6420e21`，无源码改动）

上一轮实现停在 `6420e21`（本票三个提交，工作树除下述三个无内容差异的检出文件外干净）。接手方在同一源状态上重跑了本票的每个入口，结果如下；**本节不改变 §3–§6 的任何结论，只补上"这些数不是一次性的"的证据**。

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断 | — |
| `bun run baseline:efficiency --out …/logs/22-verify-after-run{N}.json --label verify-run{N}`（**5 次新跑**） | 0 | 每次七条序列的 `every invariant held.`；**五次新跑与已提交的 `22-efficiency-after.json` 在全部可比列上逐列相同**——包括本票改过陈述口径的并发序列（`requests=2`、`/user/balance`×2、`draws=33`） | `logs/22-baseline-stability.txt`、`logs/22-verify-after-run1.json`、`logs/22-verify-run-agreement.log` |
| `bun run compare:efficiency -- --before 22-efficiency-after.json --after logs/22-verify-after-run1.json` | 0 | `none: every comparable figure of every sequence and window agrees.` —— 一次**新跑**就复现了已提交的迁移后工件（对照入口自身给出该结论，不靠人工比表） | `logs/22-verify-reproduction.txt` |
| `bun run compare:efficiency -- --before 01-… --after 22-…`（重跑一次） | 0 | 复现 §3/§4；与已提交报告的唯一差异是 `6802bef` 把「文件总数」列移入噪声段（已提交报告早于该提交） | — |
| `bun test tests/harness-dock/efficiency-effects.test.ts` | 0 | **3 pass / 0 fail**，21 expect()，12.0s；记录到的外部效果与已提交证据逐个相同（存储根 13 次操作、明细逐条相同、widget 帧 10 / 18、arrivals 与 §5 相同） | `logs/22-verify-focused-effects.log` |
| 记录器自身的两条规则直探（子进程 `bun --preload …/effect-instrument.ts`） | 0 | 指名 dump 时：只记录探针自己的一次读，**记录器写 dump 自身不进记录**；不指名 dump 时：不写任何文件、行为与未加载一致 | `logs/22-verify-recorder-probe.txt` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主） | 0 | **93 pass / 0 fail**，1121 expect()，26 文件 / 220.8s（90 既有 + 本票 3 例，与 `efb03e0` 时代同分区逐项相同） | `logs/22-verify-partition-harness-dock.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**，2524 expect() | `logs/22-verify-partition-model-cost.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**，2250 expect() | `logs/22-verify-partition-framework.log` |

**复核得到的四条新事实**：

1. **本票改过的那处陈述是确定的，不是竞态**：五次新跑里并发序列每次都得出 `requests=2`、`draws=33`，六次观测（五次新跑 + 已提交工件）无一次不同；同一批六次观测里唯一波动的是「结算失败的调用数」（15/16/17），也就是 §3 归入噪声、`6802bef` 从可比差异移出的那一列——这条经验数据支持该口径修正。
2. **工作树交给集成方时是干净的**：`bun.lock` 与两份 `host-patches/*/patch.diff` 在 `git status` 里显示为 ` M`，但三者的文件字节数与 `HEAD` blob **相等**（`11131` = `git cat-file -s HEAD:bun.lock`）、带过滤器的 hash 与 `HEAD` blob 逐个相同（`git hash-object --path=…`）、`git add --dry-run` 无任何内容可暂存：是 `core.autocrlf=true` 的检出 stat 缓存现象，**没有未提交内容**，也不是本票改动（§2 说明 1 的同一现象）。
3. **§3 的三条归属理由逐条对过 diff，不只是推断**：`git diff --stat 59a0ed7 HEAD -- extensions/model-cost/` 列出的 14 个文件里**没有** `provider-balance.ts` 也没有 `provider-refresh.ts`，所以并发序列的 `requests 1→2` 不是提供方代码变化；`request-accounting.ts` 的 `roundEnded` 在 `delivery.session.kind === "sub"` 分支里调用 `announce()`（该文件第 1076 行，与本票 A/B 日志中"同一时间线、同一请求数下 +2 draws"对应），即每个**子代理 Round 结束**都新公告一次，机制归属成立；同一 diff 移除了 `SubagentRuntimeDelivery` 导入，与 `events 24→23` 的交付组合变化一致。仍未做的是把 +2 draws 定位到具体哪几次渲染（§6 已列）。

## 9. 第二次接手复核（源状态 `385dd6d`，无源码改动；只补本票公开入口的第一手观测）

接手方（第三实例）移交前先核对：`git diff --name-only 6420e21 385dd6d` 只列出 `.scratch/` 下的文件，**被测源状态与 §8 那次复核完全相同**，因此按仓库「相同来源状态未变化才复用旧证据」的约定原样复用 §8 的所属分区与共同消费者结果（`tests/harness-dock` 93 pass / 0 fail、`tests/model-cost` 463 pass / 0 fail、`tests/framework` 481 pass / 0 fail，日志见 §8 表），本节只补本票公开入口的第一手重跑，不重复昂贵分区。

条件：win32/x64、bun 1.4.2、隔离精确安装 OMP `18.5.0`（`framework/docs/harness-baseline.json` 的 `version`；`host-patches/` 下的补丁**不适用**于本票的真实宿主检查，dock 用例只用未打补丁的那份安装）、无 provider 凭据——模型请求与余额查询全部由本机 capture endpoint 回答。

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断 | `logs/22-takeover-c-typecheck.log` |
| `bun run baseline:efficiency --out …/logs/22-takeover-c-after.json --label takeover-c` | 0 | 七条序列 `every invariant held.`；instrument probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}` | `logs/22-takeover-c-baseline.log` |
| `bun run compare:efficiency -- --before 22-efficiency-after.json --after logs/22-takeover-c-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`；`every sequence delivered the same kinds the same number of times.`；复杂度 `EVIDENCE SUBTOTAL +10`（唯一差异是 `scripts/efficiency-comparison.ts 446 → 456`，即 `6802bef` 的口径说明，**产品面 `23772 → 23772 (+0)`**） | `logs/22-takeover-c-reproduction.txt` |
| `bun run compare:efficiency -- --before 01-efficiency-baseline.json --after 22-efficiency-after.json` | 0 | 复现 §3/§4：并发序列 `requests 1→2`、`draws 30→33`、`events 24→23`，七条序列窗口级文件成本逐列相同；产品面 `19287 → 23772` | `logs/22-takeover-c-comparison.txt` |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主，跑了两次） | 0 | 两次都是 **3 pass / 0 fail**、21 expect()（12.76s / 12.17s）；记录到的外部效果与 §5 逐个相同（存储根 13 次操作且明细逐条相同、空闲窗口 0 效果、frames 10 / 18、arrivals `["balance","model"]` 与 `["balance","model","model","model"]`、无 `net.createServer`） | `logs/22-takeover-c-effects.log` |

- **两次真实宿主运行互相一致**，也与 §5/§8 的已提交计数一致：§5 的"零"结论（健康空闲 0 效果、同进程无监听端点、子代理在侧无第二次根预取/根 UI）在交接态上重复成立，不是一次性的。
- 本次新跑工件自报的 `uncommitted paths` 含 `M bun.lock` 与两个 `host-patches/*/patch.diff`：§8 已核对这三者在工作树中的**字节与 `HEAD` blob 逐一相等（LF）**，是 `core.autocrlf=true` 的 stat 缓存现象，也正是 dock 补丁/基线用例所需的字节；除此之外工作树无未提交内容（本次复核只新增本节与 `logs/22-takeover-c-*`）。本次采样工件 `logs/22-takeover-c-after.json` 与那次运行的日志一并保留，供离线复核该 `none` 结论。
- **未覆盖项与 §6 相同，本节未新增**：`P51`/`P52`/`P53` 的人类判断未做（本票交付时保持未验收）；并发序列 `draws +2` 与主子例 `frames 33→18` 仍未逐渲染归因；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、OMP 18.5.0（未打补丁）。
- **交付时的集成分支位置（供集成方核对，不影响本票结论）**：本分支基点是 `39fdc3d`（= 21 合入后的 `pi-adapter`），此刻 `pi-adapter` 尖端已是 `6164d14`（23、25 已合入）。两者之间**产品源没有变化**：`git diff --name-only 39fdc3d pi-adapter -- framework extensions entrypoints` 去掉 `framework/docs/` 后为空；`scripts/efficiency-baseline.ts`、`scripts/efficiency-comparison.ts` 与 `tests/harness-dock/` 也未被改动，`package.json` 只多一行 23 的 TUI 验收脚本。集成侧新增的都是 `.scratch/` 证据/票文件、`framework/docs/harness-support.md` 与 23 的 `scripts/pi-tui-acceptance.ts`、`scripts/support/*`。因此本票的采样序列、效果计数与复杂度判断在合入后仍针对同一产品源；复杂度表是按本票 lineage 的两版 revision（`59a0ed7` → `efb03e0`）计算的，不受集成侧 `scripts/` 增量影响（产品面 subtotal `19287 → 23772` 不变；该数字是 §10 修正行计数口径**之前**的读数，修正后为 `19287 → 23773`，结论不变）。

## 10. 第三次接手复核（源状态 `f8b9616`；并修正对照入口的行计数口径）

接手时：HEAD `f8b9616`，既有提交 `efb03e0`/`6802bef`/`6420e21`/`385dd6d`/`44a4b96`/`f8b9616` 原样保留，未做任何 reset；工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff` 外干净，而这三者与 `HEAD` blob 的字节数相等、带过滤器的 hash 也逐一相等（`git hash-object --path=`，§8 说明 2 的同一现象），不是未提交内容。本节新增的改动**只在证据面** `scripts/efficiency-comparison.ts` 与 `.scratch/` 的证据/票文件；产品面（`framework`、`extensions`、`entrypoints`）仍无改动。

集成侧只读核对：此刻 `pi-adapter` 尖端为 `6164d14`；`git diff --name-only HEAD pi-adapter -- framework extensions entrypoints` 去掉 `framework/docs/` 后为空，产品源与本节复核的 HEAD 相同。

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断（修正后的入口在内） | `logs/22-takeover-d-typecheck.log` |
| `bun run baseline:efficiency --out …/logs/22-takeover-d-after.json --label takeover-d` | 0 | 七条序列 `every invariant held.`；instrument probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}`（与 §9 相同） | `logs/22-takeover-d-baseline.log`、工件 `logs/22-takeover-d-after.json` |
| `bun run compare:efficiency -- --before 22-efficiency-after.json --after logs/22-takeover-d-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`；`every sequence delivered the same kinds the same number of times.`；`PRODUCT SUBTOTAL 23773 → 23773 (+0)`、`EVIDENCE SUBTOTAL +10`（唯一差异是本节修正过的 `scripts/efficiency-comparison.ts` 自身） | `logs/22-takeover-d-reproduction.txt` |
| `bun run compare:efficiency -- --before 01-efficiency-baseline.json --after 22-efficiency-after.json [--out …/logs/22-efficiency-comparison.txt]` | 0 | 复现 §3/§4：七条序列窗口级文件成本逐列相同；可归属差异仍是并发序列 `requests 1→2`（两条 `/user/balance`）、`draws 30→33`、`events 24→23`；复杂度按本节修正后的口径为产品面 `19287 → 23773`（见下） | `logs/22-takeover-d-comparison-corrected.txt`、重生成的 `logs/22-efficiency-comparison.txt` |
| `bun run compare:efficiency -- --before 01-efficiency-baseline.json --after 22-efficiency-after.json --after-rev pi-adapter` | 0 | `PRODUCT SUBTOTAL 19287 → 23773 (+4486)` —— 把复杂度侧直接测到集成尖端 `pi-adapter`，产品面与 `efb03e0` 逐族相同，支持上面的"合入后仍针对同一产品源" | `logs/22-takeover-d-integration-tip.txt` |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、12.02s；记录到的外部效果与 §5 逐个相同：进程内效果数 2295 / 2689、存储根 13 次操作（明细逐条相同）、健康空闲窗口 0 效果、frames 10 / 18、arrivals `["balance","model"]` 与 `["balance","model","model","model"]`、无 `net.createServer` | `logs/22-takeover-d-effects.log` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主，串行） | 0 | **93 pass / 0 fail**、1121 expect()、26 文件 / 218.54s（90 既有 + 本票 3 例；§8 在更早的同源状态上记录同一组数） | `logs/22-takeover-d-partition-harness-dock.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**、2524 expect()、40 文件 / 7.27s | `logs/22-takeover-d-partition-model-cost.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、2250 expect()、38 文件 / 39.84s | `logs/22-takeover-d-partition-framework.log` |
| 独立行计数复核（不经被测入口） | 0 | 4 个 revision × 302 个 tracked 模块：产品面 `19287`(59a0ed7) / `23773`(efb03e0) / `23773`(HEAD) / `23773`(pi-adapter)，证据面 `54806` / `79994` / `80004` / `80085`；与旧口径的唯一差异见下 | `logs/22-takeover-d-complexity-independent.json` |

- **所属分区与消费者是本节第一手重跑**，不是复用 §8：`93 pass / 0 fail`（1121 expect）、`463 pass / 0 fail`（2524 expect）、`481 pass / 0 fail`（2250 expect）与 §8 记录的同一组数逐项相同，说明 §8 的复用判断成立（那两侧源状态确实同一）。三轮都跑在本节定稿后的树上（修正后的对照入口先定稿、再开跑），运行期间未改动被测源码或 fixture。
- 本节采样工件自报的 `uncommitted paths` 是 `bun.lock` 与两份 `host-patches/*/patch.diff`（§8 说明 2 的 CRLF stat 现象，字节与 `HEAD` blob 相同）加上本节的 2 个日志文件（`??`）；**产品源码无未提交内容**，本次修正只落在 `scripts/efficiency-comparison.ts`（证据面）与 `.scratch/` 的证据/票文件。

### 10.1 行计数口径修正（`git grep -c ""` → 逐 blob 计数）

**发现**：用一条独立于被测入口的计数复核 §4 —— `git ls-tree -r <rev> -- framework extensions entrypoints tests scripts` 列出该 revision 的 blob，再 `git cat-file --batch` 逐 blob 数 `0x0a`（末行不以换行结尾时补 1）——产品面 after 得到 **23773**，而对照入口当时报 **23772**。

**定位**：对 4 个 revision（`59a0ed7`、`efb03e0`、`HEAD`、`pi-adapter`）逐文件比对两法，文件集合完全一致（237 / 299 / 299 / 299），**唯一差异**是 `framework/adapters/omp/session/facts.ts`：旧口径读成 278，实际 279（文件自 `efb03e0` 起以空行结尾，末两字节为 `}\n\n`）。隔离复现（临时仓库：`a\n\n` → `git grep -c ""` 报 1 行、`wc -l` 报 2 行；内容只有 `\n` 的 blob → `git grep` 完全不出现在输出里）说明这是 `git grep` 空模式的行为，与仓库内容无关，且它还会**整个略过**"每行都空"的 blob。

**修正**：`revisionLines` 改为读该 revision 自己的 `.ts` blob 逐行计数（`git ls-tree -r` 列 blob + `git cat-file --batch` 一次读完，一个 revision 两次 git 调用）；文件集合与旧口径逐一相同，只有上述那一行改变，证据面合计不受影响（`54806`/`79994`/`80004` 与旧口径相同）。修正后的入口在 4 个 revision 上与独立计数**逐一相同**。

**影响**：§4 已更新为产品面 `19287 → 23773`（+4486）、`framework/adapters` `2571 → 3890`（+1319）、`facts.ts` `290 → 279`；§9 记录的 `23772 → 23772 (+0)` 是修正前的读数，其结论（产品面 +0）在修正后仍成立（`23773 → 23773`）。`logs/22-efficiency-comparison-console.log`、`logs/22-takeover-c-*.txt` 是修正前的历史日志，保留原值。

**边界**：这个修正只让数字与独立计数一致，**不改变**任何可归属差异、结论或人类判断的对象（差的是一行计数）；对照入口本身没有自动化测试覆盖（修正前后都没有），本节对该入口的验证是"入口输出 vs 独立计数"与"旧报告 vs 新报告逐行 diff"，不是仓库测试。§3 的表与 §5 的效果计数未受影响（本次重跑逐项复现）。

**本轮未覆盖项**（与 §6 相同，本节未新增）：`P51`/`P52`/`P53` 的人类判断未做（本票交付时保持未验收）；并发序列 `draws +2` 与主子例 `frames 33→18` 仍未逐渲染归因；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、OMP 18.5.0（未打补丁）、无 provider 凭据（请求由本机 capture endpoint 回答）。

## 11. 第四次接手复核（源状态 `5714ddc`，无源码改动；集成分支尖端已推进到 `190e1b5`）

接手时：HEAD `5714ddc`（= §10 定稿的树），`efb03e0`/`6802bef`/`6420e21`/`385dd6d`/`44a4b96`/`f8b9616`/`5714ddc` 原样保留，未做任何 reset；工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff` 外干净，而这三者的**带过滤器 hash 与 `HEAD` blob 逐一相等**（`git hash-object --path=`，§8 说明 2 的同一 CRLF stat 现象，**不 checkout/restore** —— dock 补丁与基线用例需要这份 LF 字节）。本节**不改任何被测源码或 fixture**：改动只有 `.scratch/` 下的本文件、票文件与 `logs/22-takeover-e-*`。

**本票改动范围复核**：`git diff --name-status 39fdc3d HEAD` 去掉 `.scratch/` 后恰好 5 个文件 —— `M package.json`、`M scripts/efficiency-baseline.ts`、`A scripts/efficiency-comparison.ts`、`A tests/harness-dock/efficiency-effects.test.ts`、`A tests/harness-dock/support/effect-instrument.ts`；`git diff --name-only 39fdc3d HEAD -- framework extensions entrypoints` 为空（产品面无改动）。

**集成分支只读核对（新尖端）**：`pi-adapter` 尖端此刻为 `190e1b5`（23 合入后的 `b57f5a5`；比 §10 记录的 `6164d14` 又推进一次）。`git diff --name-only 39fdc3d pi-adapter -- framework extensions entrypoints` 只有 `framework/docs/harness-support.md`（文档），**产品源目录无变化**；`scripts/efficiency-baseline.ts` 在 `39fdc3d` 与 `pi-adapter` 之间 `SAME`；`package.json` 只多 23 的一行 `accept:model-cost-tui`。另做一次**只读**合并可行性核对：`git merge-tree --write-tree --name-only HEAD pi-adapter` → exit 0、tree `8ed8e09eca1f684d296f21fc4c96ddf12eaed0c2`、无冲突列表（未改任何 ref 或工作树）。
| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断（日志只有命令横幅） | `logs/22-takeover-e-typecheck.log` |
| `bun run baseline:efficiency --out …/logs/22-takeover-e-after.json --label takeover-e` | 0 | 七条序列 `every invariant held.`；instrument probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}`（与 §9/§10 相同） | `logs/22-takeover-e-baseline.log`、工件 `logs/22-takeover-e-after.json` |
| `bun run compare:efficiency -- --before 22-efficiency-after.json --after logs/22-takeover-e-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`；`every sequence delivered the same kinds the same number of times.`；`PRODUCT SUBTOTAL 23773 → 23773 (+0)`、`EVIDENCE SUBTOTAL +43`（唯一差异是 §10 修正过的 `scripts/efficiency-comparison.ts` 自身 446 → 489） | `logs/22-takeover-e-reproduction.txt` |
| `bun run compare:efficiency -- --before 01-efficiency-baseline.json --after 22-efficiency-after.json --out logs/22-takeover-e-comparison.txt` | 0 | 复现 §3/§4：可归属差异仍是并发序列 `requests 1→2`（provider paths `{"/user/balance":1} → {"/user/balance":2}`）、`draws 30→33`、`events 24→23`（semantic deliveries `subagent_runtime 1 → 0`）；七条序列窗口级文件成本逐列相同；复杂度产品面 `19287 → 23773`。**重生成的报告与已提交的 `logs/22-efficiency-comparison.txt` 逐字节相同**（`diff` 无输出） | `logs/22-takeover-e-comparison.txt` |
| `bun run compare:efficiency -- --before 01-… --after 22-… --after-rev pi-adapter` | 0 | `PRODUCT SUBTOTAL 19287 → 23773 (+4486)`，且**产品面逐族与 `efb03e0` 相同**（`28/18/111/1608/10326/158/3890/2142/3248/2244`，见下表）——把复杂度侧直接测到新尖端 `190e1b5` | `logs/22-takeover-e-integration-tip.txt` |
| 独立行计数复核（python：`git ls-tree -r` + `git cat-file --batch`，不经被测入口） | 0 | 4 个 revision：产品面 `19287`(59a0ed7) / `23773`(efb03e0) / `23773`(5714ddc) / `23773`(pi-adapter `190e1b5`)；证据面 `54806` / `79994` / `80037` / `80085`；`facts.ts` `290 → 279`。产品面**逐族**与入口的表逐一相同 | `logs/22-takeover-e-complexity-independent.json` |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、12.05s；外部效果与 §5/§10 逐个相同：进程内效果数 2295 / 2689、存储根 13 次操作（明细逐条相同）、健康空闲窗口 0 效果、frames 10 / 18、arrivals `["balance","model"]` 与 `["balance","model","model","model"]`、网络效果只有指向本机 capture endpoint 的一次 `createConnection`（无 `createServer`） | `logs/22-takeover-e-effects.log` |
| 记录器两条规则直探（子进程 `bun --preload tests/harness-dock/support/effect-instrument.ts`） | 0 | 指名 dump 时：成员被包裹（`fs.readFileSync.name`/`net.createServer.name` = `recorded`），dump 里**恰好只有探针自己那一次 `readFileSync`**（记录器写 dump 自身不进记录）；**不指名 dump 时成员未被包裹**（名字仍是 `readFileSync`/`createServer`）、不写任何 dump —— "没被指名就完全不动" 的失效保护成立 | `logs/22-takeover-e-recorder-probe.txt` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主，串行，运行期间未改源码/fixture） | 0 | **93 pass / 0 fail**、1121 expect()、26 文件 / 219.18s（90 既有 + 本票 3 例） | `logs/22-takeover-e-partition-harness-dock.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、2250 expect()、38 文件 / 39.35s | `logs/22-takeover-e-partition-framework.log` |
| `bun test tests/model-cost`（共同路径消费者，同日 3 次运行） | 1 / 0 / 0 | 第 1 次 `462 pass / 1 fail / 1 error`；紧接着重跑 **463 pass / 0 fail**（7.49s）；在 20 路 CPU 饱和下再跑 **463 pass / 0 fail**（33.20s） | `logs/22-takeover-e-partition-model-cost.log`、`…-model-cost-rerun.log`、`…-model-cost-under-load.log` |

**产品面复杂度逐族（`59a0ed7` → `pi-adapter` `190e1b5`，与 `efb03e0` 的 §4 表相同）**：`entrypoints/omp 28 → 28`、`entrypoints/pi 9 → 18`、`extensions/codebase-tools 90 → 111`、`extensions/connect-bot 1608 → 1608`、`extensions/model-cost 8537 → 10326`、`framework 161 → 158`、`framework/adapters 2571 → 3890`、`framework/behaviors 2070 → 2142`、`framework/core 2949 → 3248`、`framework/modules 1264 → 2244`。证据面数字在两支之间**不可比**（`pi-adapter` 尚未合入本票，因此缺 `tests/harness-dock` 的本票两文件 452+198 行与 `scripts/efficiency-comparison.ts`，同时多出 23 的 `scripts/` 文件），本票的比较对象只是产品面。

**本轮唯一一次非预期失败（已查清、不归本票）**：`tests/model-cost` 第 1 次运行里 `session-recovery.test.ts` 的 P46 用例「a record another writer holds is kept, the refused consumption is dropped, and the next save continues from the disk's version」在 **5000.96ms 超时**，随后该文件的 `savedDocument` 助手又抛出 `no consumption document the case expects was published at …/model-cost-recovery-2uO2tD/consumption.json`（`tests/model-cost/session-recovery.test.ts:238`）。事实与判断：

1. **机制是实时期限**：该助手按 `Date.now() + 5_000` 轮询磁盘文档，且该文件自己的用例本来就跑在 bun 的 5000ms 单例上限内；用例要经过若干次 `mkdir`+`rename` 的锁阶段发布，win32 上满载时可能越过 5s。这与仓库既有记录**同签名**：`01` 的证据（`session-recovery.test.ts` 的 P16/P18 案例在 20s 保存期限内没等到文档，"属并行负载下的实时期限 flake"）、`06` 的证据（`storage-processes.test.ts` 撞 bun 的 5000ms 上限）、`21` 的证据（同一 `savedDocument` 帮助器的 `no consumption document the case expects was published`，单独重跑即绿）。
2. **不可复现**：单独重跑该文件 **13 pass / 0 fail**（313ms）；紧接着整分区重跑 **463 pass / 0 fail**（7.49s）；再把 20 个 CPU 满载进程压在 20 核机上重跑整分区，仍 **463 pass / 0 fail**（33.20s，墙钟慢 4.4 倍但不触发期限）。因此"纯 CPU 负载"不是充分解释，最可能的是那次运行紧接在 219s 的真实宿主 dock 分区（26 文件、大量真实宿主进程与临时目录收尾）之后、机器尚未静定的状态。
3. **不归本票**：本票没有产品代码改动，也没有改 `tests/model-cost/`；失败用例的路径（本地存储锁与跨进程发布）不经本票任何文件；同一棵树上 §10 的同一分区是 463 pass / 0 fail。故记为**环境性实时期限 flake**，不计为本票回归、也不据此宣称套件绝对稳定。

**本轮未覆盖项**（与 §6/§10 相同，本节未新增）：`P51`/`P52`/`P53` 的人类判断未做（本票交付时保持未验收）；并发序列 `draws +2` 与主子例 `frames 33→18` 仍未逐渲染归因；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、OMP 18.5.0（未打补丁）、无 provider 凭据（请求由本机 capture endpoint 回答）；对照入口仍无自动化测试覆盖（其正确性证据是 §10 的"入口输出 vs 独立计数"与本节"重生成报告与已提交报告逐字节相同"）。

## 12. 第五次接手复核（源状态 `570c7ee`，无源码改动；归因机制与行计数口径的第一手复验）

接手时：HEAD `570c7ee`（= §11 定稿的树），`efb03e0`/`6802bef`/`6420e21`/`385dd6d`/`44a4b96`/`f8b9616`/`5714ddc`/`570c7ee` 原样保留，**未做任何 reset**。工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff` 外干净，而这三者的**带过滤器 hash 与 `HEAD` blob 逐一相等、字节数也相等**（`bun.lock` `cc3c49a6…` 11131/11131、`viewed-session` `b652e639…` 26585/26585、`codex-response-boundary` `ff98fd25…` 2213/2213，`git hash-object --path=`）——§8 说明 2 的同一 `core.autocrlf=true` 检出 stat 现象，**不 checkout/restore**（dock 补丁与基线用例需要这份 LF 字节）。本节**不改任何被测源码或 fixture**：改动只有 `.scratch/` 下的本文件、票文件与 `logs/22-takeover-f-*`（15 个新文件）。

**本票改动范围复核**：`git diff --name-status 39fdc3d HEAD` 去掉 `.scratch/` 后恰好 5 个文件 —— `M package.json`、`M scripts/efficiency-baseline.ts`、`A scripts/efficiency-comparison.ts`、`A tests/harness-dock/efficiency-effects.test.ts`、`A tests/harness-dock/support/effect-instrument.ts`；`git diff --name-only 39fdc3d HEAD -- framework extensions entrypoints` 为空（产品面无改动）。

**集成分支只读核对**：`pi-adapter` 尖端仍为 `190e1b5`（与 §11 相同，本节未推进）；`git diff --name-only 39fdc3d pi-adapter -- framework extensions entrypoints` 只有 `framework/docs/harness-support.md`（文档）；`git merge-tree --write-tree --name-only HEAD pi-adapter` → exit 0、无冲突列表（未改任何 ref 或工作树）；本节改动前（`570c7ee`）得 tree `3c84b493645d067ff2a59f528aa1d4c133f7cd73`，本节证据提交后（本节定稿的 HEAD）再核对一次得 `f0d5920b5de4f97236d4ab1ce014437e8f647b3e`，两次都无冲突（`logs/22-takeover-f-merge-tree.txt` 保存的是后一次的输出）。

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断 | `logs/22-takeover-f-typecheck.log` |
| `bun run baseline:efficiency --out …/logs/22-takeover-f-after.json --label takeover-f` | 0 | 七条序列 `every invariant held.`；并发序列 `requests=2`（路径 `/user/balance`×2）、`draws=33`；instrument probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}`（与 §9–§11 相同） | `logs/22-takeover-f-baseline.log`、工件 `logs/22-takeover-f-after.json` |
| `bun run compare:efficiency -- --before 22-efficiency-after.json --after logs/22-takeover-f-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`；`every sequence delivered the same kinds the same number of times.`；`PRODUCT SUBTOTAL 23773 → 23773 (+0)`、`EVIDENCE SUBTOTAL +43`（唯一差异是 §10 修正过的 `scripts/efficiency-comparison.ts` 自身） | `logs/22-takeover-f-reproduction.txt` |
| `bun run compare:efficiency -- --before 01-… --after 22-… --out logs/22-takeover-f-comparison.txt` | 0 | 复现 §3/§4：`requests 1→2`、`draws 30→33`、`events 24→23`、产品面 `19287 → 23773 (+4486)`、证据面 `54806 → 79994`；**重生成的报告与已提交的 `logs/22-efficiency-comparison.txt` 逐字节相同**（`diff` 无输出，diff 文件 0 字节） | `logs/22-takeover-f-comparison.txt`、`logs/22-takeover-f-comparison-console.txt`、`logs/22-takeover-f-report-diff.txt` |
| `bun run compare:efficiency -- --before 01-… --after 22-… --after-rev pi-adapter` | 0 | `PRODUCT SUBTOTAL 19287 → 23773 (+4486)`，产品面逐族与 `efb03e0` 相同 | `logs/22-takeover-f-integration-tip.txt` |
| 独立行计数（本节自写的 python：`git ls-tree -r` + `git cat-file --batch`，与 §10 的 JS 实现**各自独立**，不经被测入口） | 0 | 4 revision：产品面 `19287`(59a0ed7) / `23773`(efb03e0) / `23773`(570c7ee) / `23773`(pi-adapter `190e1b5`)；证据面 `54806` / `79994` / `80037` / `80085`；`framework/adapters/omp/session/facts.ts` `290 → 279`；产品面逐族 `28/18/111/1608/10326/158/3890/2142/3248/2244` 与入口表逐一相同 | `logs/22-takeover-f-complexity-independent.json` |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、12.16s；效果 2295 / 2689、存储根 13 次操作（明细与 §5 逐条相同）、健康空闲窗口 0 效果、frames 10 / 18、arrivals `["balance","model"]` 与 `["balance","model","model","model"]`、网络效果只有指向本机 capture endpoint 的一次 `createConnection`（无 `createServer`、无 `my-agent-toolkit-access`） | `logs/22-takeover-f-effects.log` |
| 记录器两条规则直探（本节自写探针文件 + `bun --preload …/effect-instrument.ts`） | 0 | 指名 dump：成员被包裹（`readFileSync.name`/`createServer.name` = `recorded`），dump 里恰好只有探针自己的那次 `readFileSync` 与 `createServer`，**没有任何指向 dump 自身的记录**；不指名 dump：成员名仍是 `readFileSync`/`createServer`、不写任何 dump | `logs/22-takeover-f-recorder-probe.txt` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主，串行，运行期间未改源码/fixture） | 0 | **93 pass / 0 fail**、1121 expect()、26 文件 / 222.44s（90 既有 + 本票 3 例） | `logs/22-takeover-f-partition-harness-dock.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、2250 expect()、38 文件 / 39.10s | `logs/22-takeover-f-partition-framework.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**、2524 expect()、40 文件 / 7.38s（本轮首次运行即绿；§11 记录的同签名实时期限 flake 本轮未复现） | `logs/22-takeover-f-partition-model-cost.log` |

- **这三组数与 §8/§10/§11 逐项相同**（93/1121、481/2250、463/2524），说明那一侧的复用判断成立；三组都跑在定稿后的树上，运行期间未改动被测源码或 fixture。
- 本节采样工件自报的 `uncommitted paths` 是 `bun.lock` 与两份 `host-patches/*/patch.diff`（上面的 CRLF stat 现象，字节与 `HEAD` blob 相同）与本节的日志文件（`??`）；**产品源码无未提交内容**。

**§3 的三条归因机制本轮落到代码（第一手，不改任何结论）**：

1. `SubagentRuntimeDelivery` 在 `extensions/`、`framework/` 中已**完全不存在**（全树 `grep`），且 `git diff 59a0ed7 HEAD -- extensions/model-cost/shared-logic/request-accounting.ts` 显示该导入与 `subagentRuntime(delivery)` 方法一并被删除 —— 与 `events 24 → 23`（semantic deliveries `subagent_runtime 1 → 0`）的交付组合变化一致。
2. 同一文件的 `roundEnded` 在 `delivery.session.kind === "sub"` 分支里执行 `runtimes.activityEnded(...)` + `runtimeRevision += 1` + `announce()`（`extensions/model-cost/shared-logic/request-accounting.ts:1098` 起的函数体；同一改动此前已给 `roundStarted` 的 sub 分支加上 `activityStarted()`）—— 即**每个子代理 Round 结束公告一次**；并发序列有 3 个子代理 Round 结束（`endRound(CHILD_A/CHILD_B/GRAND)`），与 `draws` 在同一时间线、同一请求数下 +2 的机制归属一致。**仍未逐渲染定位**（§6 已列，本节未新增）。
3. `provider-balance.ts` 与 `provider-refresh.ts` 在 `59a0ed7..HEAD` 的 `extensions/model-cost/` 14 文件 diff（+2042/−243）中**都不出现** —— 并发序列的 `requests 1 → 2` 不是提供方代码变化。本票采样入口自己的时间线是来源：`scripts/efficiency-baseline.ts:161` 的 `CHILD_ACTIVITY_MS = 360_000`（> 该条目声明的 `balanceTtlMs`）、`:1112` 的 `clock = T0 + CHILD_ACTIVITY_MS`，且该序列的判据是**等这次到达**而非等时长（`:1122-1138`）。
4. 已提交的 A/B 与稳定性日志逐条支持上述归因：去掉时钟推进 → `requests=1`（同时 `childA.runtimeMs=0`）、TTL 抬到 1e9ms → `requests=1`（`logs/22-ab-no-clock-advance.log`、`logs/22-ab-huge-ttl.log`）；`logs/22-baseline-stability.txt` 的六次观测里 `draws=33`、`requests=2` 逐次相同，唯一波动的两列正是噪声列（`failed` 15/16/17、`file total` 51/52/53）。迁移前 dock 侧对照数字也与 §5 一致（`logs/22-dock-effects-pre-migration.log`：2294 / 2688、frames 10 / 33）；故障注入日志同 §5（`consumptionReads 2 → 12`、空闲窗口 6 次读）。

**本轮未覆盖项**（与 §6/§10/§11 相同，本节未新增）：`P51`/`P52`/`P53` 的人类判断未做（本票交付时保持未验收）；并发序列 `draws +2` 与主子例 `frames 33→18` 仍未逐渲染归因；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、OMP 18.5.0（未打补丁）、无 provider 凭据（请求由本机 capture endpoint 回答）；对照入口仍无自动化测试覆盖（其正确性证据是 §10 的独立计数、§11 的逐字节相同与本节的第二份独立实现）。

## 13. 第六次接手复核（源状态 `7274cb3`；**补齐对照入口自身的自动化覆盖** + 公开入口第一手重跑）

接手时：HEAD `7274cb3`（= §12 定稿树；`efb03e0` … `570c7ee` 全部原样保留，**未做任何 reset**）。工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff`（§8/§12 记录的 `core.autocrlf=true` 检出 stat 现象，带过滤器 hash 与 `HEAD` blob 逐字节相等，**未 checkout/restore**）外干净。

**本轮唯一的实现改动**：新增 `tests/harness-dock/efficiency-comparison.test.ts`（落在本票所属分区）。此前 §6/§8/§10/§11/§12 每轮都把「对照入口无自动化测试覆盖」列为未覆盖项；而对照入口正是本票 `P51` 材料可归属性的器械（它决定「可比差异 / 噪声列 / 未记录」三者），票内「本票负责人负责核对有效性与**补齐缺口**」要求把它补齐。该文件只经入口的命令行 seam 观察（`bun scripts/efficiency-comparison.ts --before … --after … [--out …]`）：读它打印的报告文本与退出码；fixture 工件是**本文件手写的字面量**（期望不调用被测计算生成），临时目录建在 OS temp 且逐例清理（`afterEach`）。它不驱动宿主、不需要 OMP 构建，与同目录的真实宿主半边 `efficiency-effects.test.ts` 互补。

| 例（一句话 = 一个性质） | 观察 |
| --- | --- |
| 两侧图相同 | `none: every comparable figure of every sequence and window agrees.`、两侧 `invariants all held`、退出 0 |
| 一侧不变量失败 | 先打印 `after: invariants 1 FAILED` 与其 detail（读者能区分被采样入口自己接受的数字与被它否定的数字），退出 0 |
| 可比图真有差异 | `requests 1 -> 2`、`draws 8 -> 9` 列在「comparable differences」段且**退出 0**（判断属人类：无阈值、不因差异失败） |
| 只有一侧记录的窗口 | 差异段为 `… window absent -> present`，窗口表该行**没有任何数字**（缺失基线不被填成 0） |
| 被拒调用数与墙钟差异 | 差异段仍是 `none:`；噪声段逐条列出 `failed by operation …` 与 `wall clock ms 24 -> 71` |
| 仅文件总数差异 | 差异段仍是 `none:`；噪声段列出 `file total … (this column counts calls that settled as failures too)`（`6802bef` 的口径不会被回退） |
| 工件未记录 `source.head` 且命令行未给 rev | 打印 `the complexity side cannot be measured` 且**没有** `PRODUCT SUBTOTAL`（缺失基线不被捏造） |
| 用迁移两版 revision 测复杂度 | `PRODUCT SUBTOTAL 19287 23773 +4486`（= §4 的字面量；行计数口径 §10 不被回退） |
| `--before-rev/--after-rev HEAD`（覆盖工件自报 revision） | 两侧同行数、`+0`，且行数 `> 0`（不是恒零） |
| `--out` | 写出的报告与打印的一致，并自建父目录 |
| 缺 `--before` | 退出 1、stderr 指名 `--before <artifact.json> is required`、stdout 为空（不会「什么都没比对」却成功） |

**灵敏度（目标注入 → 观察到真实失败 → 按 `sha256` 还原）**：`scripts/efficiency-comparison.ts` 原件 sha256 `e513caead321ce2aae43a360b310dd985fb87b0c4213bd58a25b2105877a005c`；注入前与每次还原后逐一相等，且 `git diff -- scripts/` 为空。

| 临时注入（跑完即还原） | 模拟的违规 | 观察到的失败 |
| --- | --- | --- |
| `countLines` 退回 `git grep -c ""` 口径（结尾空行少算 1） | §10 修正过的行计数回退 | `measures the migration's product surface from each revision's own tree`：收到 `19207/23685/4478`（期待 `19287/23773/4486`）→ 10 pass / 1 fail（`logs/22-takeover-g-injection-a.log`） |
| 把 `file total` 从噪声段移回可比差异 | `6802bef` 的口径回退 | `observes a refused call's count and the wall clock instead of comparing them`、`rides the file total with the noise columns…` → 9 pass / 2 fail（`logs/22-takeover-g-injection-b.log`） |
| 差异非空时 `process.exitCode = 1` | 加入阈值/判定 | `prints a comparable difference and still exits zero…`、`hands a window only one side recorded…` → 9 pass / 2 fail（`logs/22-takeover-g-injection-c.log`） |
| 缺失 `source.head` 时默认 `HEAD` | 捏造缺失基线 | `states that it cannot measure complexity rather than filling in a missing revision` → 10 pass / 1 fail（`logs/22-takeover-g-injection-d.log`） |

即这些绿色不是断言乏力换来的：每条契约都有一次被注入的真实失败；还原后 11 pass / 0 fail、40 expect()、2.26s（`logs/22-takeover-g-focused.log`）。

**公开入口第一手重跑（本树，串行；运行期间未改被测源码或 fixture）**：

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断（含新增测试文件） | `logs/22-takeover-g-typecheck.log` |
| `bun run baseline:efficiency --out …/logs/22-takeover-g-after.json --label takeover-g` | 0 | 七条序列 `every invariant held.`；并发序列 `requests=2`（`/user/balance`×2）、`draws=33`、`events=23`；`read-only-refresh` 序列级文件操作 0、`healthy-idle`/`disposal` 的**测量窗口**（`idle`/`disposal`/`afterDisposal`）文件操作 0（两条序列**自身**各含一次准备轮，序列级为 3/1/7/2/1/1，两侧逐列相同；见 §16 的措辞修正）；instrument probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}`（与 §2/§9–§12 相同） | `logs/22-takeover-g-baseline.log` |
| 新跑工件 vs 已提交 `22-efficiency-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`、`every sequence delivered the same kinds the same number of times.`；噪声段差异为并发序列被平台拒绝的那次 rename 与各序列墙钟 | `logs/22-takeover-g-reproduction.txt` |
| `--before 01-… --after 22-… --out logs/22-takeover-g-comparison.txt` | 0 | 复现 §3/§4（`requests 1→2`、`draws 30→33`、`events 24→23`、`19287 → 23773 (+4486)`）；**重生成报告与已提交 `logs/22-efficiency-comparison.txt` 的 sha256 相同**（`a486f32712e4314108ef256d0e74a4aefdf7512ffb77e16600c5daab78b1fe72`） | `logs/22-takeover-g-comparison.txt`、`…-comparison-console.txt` |
| `--after-rev pi-adapter`（只读，集成尖端复杂度） | 0 | `190e1b5`：`PRODUCT SUBTOTAL 19287 23773 +4486`（产品面逐族与 `efb03e0` 相同）、`EVIDENCE SUBTOTAL 54806 80085` | `logs/22-takeover-g-integration-tip.txt` |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、12.29s；效果 `2295`/`2689`、存储根 13 次操作、健康空闲窗口 0 效果、frames `10`/`18`、arrivals `["balance","model"]`/`["balance","model","model","model"]`、网络效果只有指向本机 capture 端口的一次 `createConnection`（无 `createServer`、无 `my-agent-toolkit-access`） | `logs/22-takeover-g-effects.log` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主，串行） | 0 | **104 pass / 0 fail**、1161 expect()、27 文件 / 223.27s（§12 的 93 + 本轮 11；含上面 3 例真实宿主检查） | `logs/22-takeover-g-partition-harness-dock.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、2250 expect()、38 文件 / 39.46s（与 §12 逐项相同） | `logs/22-takeover-g-partition-framework.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**、2524 expect()、40 文件 / 7.60s（§11 记录的实时期限 flake 本轮未复现） | `logs/22-takeover-g-partition-model-cost.log` |

**集成分支只读核对**：`pi-adapter` 尖端仍 `190e1b5`（本轮未推进；未操作、未合入）；`git diff --name-only 39fdc3d pi-adapter -- framework extensions entrypoints` 只有 `framework/docs/harness-support.md`（文档）；`git merge-tree --write-tree --name-only HEAD pi-adapter` 只读跑了两次：接手态 `7274cb3` 上 exit 0、tree `fcb61da4a1f92b60676027fa2f9f4dcdd85ea321`、**无冲突列表**（`logs/22-takeover-g-merge-tree.txt`；读者可用 `HEAD^` 复核），本节证据提交上再跑一次同样 exit 0、无冲突列表（该次的 tree 值不落纸：本节证据自身改变 tree，写下它会立刻自指）。两次都未改任何 ref 或工作树。

**`draws +3` 的第一手 A/B 归因（临时注入 product 副本，跑完按 `sha256` 还原；§3/§12 只做到代码层归因的那一项）**：把 `roundEnded` 里 `delivery.session.kind === "sub"` 分支的 `announce()`（`extensions/model-cost/shared-logic/request-accounting.ts:1133`）临时停用，其余（`runtimes.activityEnded`、`runtimeRevision += 1`、失败通知）不动。同一 revision、同一命令行下 `main-child-concurrency` 的 `draws 33 → 30`，而**其余可比图与语义交付逐项相同**（对照报告的可比差异段只有这一行；deliveries 相同；噪声段仍只差失败数与墙钟），且七条序列 `every invariant held.`——即这些不变量不依赖该通知，它是纯展示工作（`logs/22-takeover-g-ab-subannounce.log`、`…-ab-subannounce-comparison.txt`）。结论：迁移后该序列 `draws 30 → 33` 的 +3 **全部落在「每个子代理 Round 结束一次显示通知」这一条路径上**（该序列有 3 个子代理 Round 结束，§12 已核对代码路径），§3 原先「刷新通知 +1 / announce +2」的推断拆分因此被收紧为单一来源；**逐渲染定位（哪一帧与提交渲染合并）仍未做**。还原后 `sha256` 与注入前相同（`a06f1313eddefd808a1875b190652a2deef92b8483db5d8b7eeb51e520042391`）、`git diff -- extensions/ framework/ entrypoints/` 为空，且还原后再采一次样并与已提交工件对照仍为 `none`（`logs/22-takeover-g-after2.json`、`logs/22-takeover-g-reproduction-restored.txt`）。

**本轮未覆盖项**：`P51`/`P52`/`P53` 的人类判断未做（本票交付时保持未验收，票内含人类确认的两个勾选项保持未勾选）；**逐渲染定位**（并发序列那次 `draws +3` 与主子例 `frames 33 → 18` 具体是哪些帧与提交渲染合并）未做——但并发序列的增量本轮已由 A/B 实测归因到唯一的 `announce()` 路径，主子例仍是机制级；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（未打补丁）、无 provider 凭据（模型请求与余额查询由本机 capture endpoint 回答）。**「对照入口无自动化测试覆盖」一条本轮已关闭**（上表 11 例 + 4 次目标注入），不再列入限制。

## 14. 第七次接手复核（源状态 `cbfc63c`；把 §13 的 A/B 归因换成可复现形式 + 公开入口与分区第一手重跑）

接手时：HEAD `cbfc63c`（= §13 定稿树；`efb03e0` … `570c7ee` 的全部既有提交原样保留，**未做任何 reset**）。工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff`（§8/§12 记录的 `core.autocrlf=true` 检出 stat 现象，带过滤器 hash 与 `HEAD` blob 逐字节相等：`cc3c49a6…` 11131/11131、`ff98fd25…` 2213/2213、`b652e639…` 26585/26585，**未 checkout/restore**）外干净。**产品代码无改动**（`git diff --name-only 39fdc3d HEAD -- framework extensions entrypoints` 为空；改动仍是 §12 记录的那 6 个证据面文件加 §13 的测试文件）。

**本节唯一的实质性动作**：把 §13 的 `draws +3` A/B 归因在交付态上重做一次，并换成**可复现的形式**。原因：§13 保存的对照报告 `logs/22-takeover-g-ab-subannounce-comparison.txt` 把测量 revision 记为 `3f547df`，而该提交是那一轮被改写掉的临时提交（`git cat-file -t 3f547df` = commit，但 `git rev-list --all` 不含它、`git merge-base --is-ancestor 3f547df HEAD` 为假）：交付分支上**不可达**，读者无法回到那棵树复核。本节的做法是：注入单独存成补丁文件、被测 revision 就用交付提交 `cbfc63c`（注入作为该工件自报的未提交路径出现）。

| A/B 步骤 | 观察 | 日志 |
| --- | --- | --- |
| 注入（临时，已还原） | `roundEnded` 的 `kind === "sub"` 分支里 `announce()`（`extensions/model-cost/shared-logic/request-accounting.ts:1133`）被注释掉，其余（`runtimes.activityEnded`、`runtimeRevision += 1`、失败通知）不动；补丁 969 B | `logs/22-takeover-h-ab-subannounce-injection.diff` |
| 注入态采样（exit 0） | `main-child-concurrency` `draws=30`（对照态 33）、其余行与对照态逐列相同、七条序列 `every invariant held.`、probe 不变 | `logs/22-takeover-h-ab-subannounce.log`、工件 `…-ab-subannounce.json` |
| 注入态对照（exit 0） | 可比差异段**只有一行** `main-child-concurrency draws 33 -> 30`；`semantic deliveries` 逐条相同；两侧 `invariants all held`；产品面 `23773 23773 +0`；`after: source cbfc63c…`（可达）、注入列为该工件的未提交路径 | `logs/22-takeover-h-ab-subannounce-comparison.txt` |
| 还原 | `sha256 = a06f1313eddefd808a1875b190652a2deef92b8483db5d8b7eeb51e520042391`（与 §13 记录的注入前原件相同）；`git diff --name-only -- extensions framework entrypoints` 为空 | — |
| 还原后采样 + 对照（exit 0） | `draws` 回到 33、`none: every comparable figure of every sequence and window agrees.`、交付相同、产品面 `+0` | `logs/22-takeover-h-after-restored.log/.json`、`…-after-restored-comparison.txt` |

结论与 §3/§13 一致并被第一手确认：迁移后 `main-child-concurrency` 的 `draws 30 -> 33`（+3）**全部落在「每个子代理 Round 结束一次 `announce()`」这一条路径上**——停用后同一 revision、同一命令行下只剩这一行可比差异，且七条序列的不变量全部成立（该通知是纯展示工作）。**逐渲染定位（哪一帧与提交渲染合并）仍未做**。

**公开入口第一手重跑（本树，串行；运行期间未改被测源码或 fixture）**：

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断（含 §13 的测试文件） | `logs/22-takeover-h-typecheck.log` |
| `bun run baseline:efficiency --out …/22-takeover-h-after.json --label takeover-h` | 0 | 七条序列 `every invariant held.`；逐行与 §12/§13 相同（并发 `requests=2`/`draws=33`/`events=23`；`read-only-refresh` 序列级文件操作 0、`healthy-idle`/`disposal` 的**测量窗口**（`idle`/`disposal`/`afterDisposal`）文件操作 0（两条序列**自身**各含一次准备轮，序列级为 3/1/7/2/1/1，两侧逐列相同；见 §16 的措辞修正））；probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}` | `logs/22-takeover-h-baseline.log` |
| 新跑工件 vs 已提交 `22-efficiency-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`、交付相同；产品面 `23773 23773 +0`；证据面 `79994 → 80455`（= §13 的 `tests/harness-dock/efficiency-comparison.test.ts` 418 行 + 对照入口自身 43 行，后者 §12 已记录同一原因） | `logs/22-takeover-h-reproduction.txt` |
| `--before 01-… --after 22-… --out …` | 0 | 复现 §3/§4（`requests 1→2`、`draws 30→33`、`events 24→23`、产品面 `19287 → 23773 (+4486)`）；**重生成报告与已提交 `logs/22-efficiency-comparison.txt` 的 sha256 相同**（`a486f327…`） | `logs/22-takeover-h-comparison.txt`、`…-comparison-console.txt` |
| `--after-rev pi-adapter`（只读，集成尖端） | 0 | `190e1b5`：产品面 `19287 23773 +4486`、证据面 `54806 80085` | `logs/22-takeover-h-integration-tip.txt` |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、12.01s；效果 `2295`/`2689`、存储根 13 次操作、健康空闲窗口 0 效果、frames `10`/`18`、arrivals `["balance","model"]`/`["balance","model","model","model"]`、网络效果只有指向本机 capture 端口的一次 `createConnection`（无 `createServer`、无 `my-agent-toolkit-access`） | `logs/22-takeover-h-effects.log` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主，串行） | 0 | **104 pass / 0 fail**、1161 expect()、27 文件 / 221.93s（与 §13 逐项相同） | `logs/22-takeover-h-partition-harness-dock.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、2250 expect()、38 文件 / 39.49s | `logs/22-takeover-h-partition-framework.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**、2524 expect()、40 文件 / 7.48s（§11 记录的实时期限 flake 未复现） | `logs/22-takeover-h-partition-model-cost.log` |

**行计数口径的第二套独立复核（`git archive` 导出各 revision 的 blob + 逐字节计数：与入口的 `git ls-tree`/`git cat-file` 是不同管线、不同语言）**：产品面 `19287`(59a0ed7) / `23773`(efb03e0) / `23773`(cbfc63c) / `23773`(pi-adapter `190e1b5`)；证据面 `54806` / `79994` / `80455` / `80085`；产品面逐族 after = `entrypoints/omp` 28、`entrypoints/pi` 18、`extensions/codebase-tools` 111、`extensions/connect-bot` 1608、`extensions/model-cost` 10326、`framework` 158、`framework/adapters` 3890、`framework/behaviors` 2142、`framework/core` 3248、`framework/modules` 2244，与 §4 逐一相同（`entrypoints` 合计 37 → 46、`extensions/{codebase-tools,connect-bot}` 1698 → 1719 亦同）；`cbfc63c → pi-adapter` 产品面 `+0`。

**集成分支只读核对**：`pi-adapter` 尖端仍 `190e1b5`（本轮未推进；未操作、未合入）；`git diff --name-only 39fdc3d pi-adapter -- framework extensions entrypoints` 只有 `framework/docs/harness-support.md`（文档）；`git merge-tree --write-tree --name-only HEAD pi-adapter` exit 0、tree `bc337a0340c6a79403a72311bcfc74aba425572f`、**无冲突列表**（`logs/22-takeover-h-merge-tree.txt`）。

**本轮未覆盖项**：`P51`/`P52`/`P53` 的人类判断未做（票内含人类确认的两个勾选项保持未勾选）；**逐渲染定位**（并发序列 `draws +3` 与主子例 `frames 33 → 18` 具体哪些帧与提交渲染合并）未做——并发序列的增量已两轮 A/B 归因到唯一的 `announce()` 路径，主子例仍是机制级；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（未打补丁）、无 provider 凭据（模型请求与余额查询由本机 capture endpoint 回答）。§13 的 A/B 报告引用的 `3f547df` 不可达一条**已由本节取代**（同源 A/B、交付 revision、补丁随证据保存）。

## 15. 第八次接手复核（源状态 `62dd204`；把 S1 对照的「可比差异」按同一陈述分离 + 主子例 `frames 33 → 18` 的第一手归因 + 公开入口/分区第一手重跑）

接手时：HEAD `62dd204`（= §14 定稿树；`efb03e0` … `cbfc63c` 的全部既有提交原样保留，**未做任何 reset**）。工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff`（§8/§12/§14 记录的 `core.autocrlf=true` 检出 stat 现象，带过滤器 hash 与 `HEAD` blob 逐字节相等，**未 checkout/restore**）外干净。**产品代码无改动**（`git diff --name-only 39fdc3d HEAD -- framework extensions entrypoints` 仍为空；交付改动仍是 §12 记录的证据面 6 个文件）。本节改动只有 `.scratch/` 下的本文件、票文件与 `logs/22-takeover-i-*`（含本节新增的采样工件、对照报告与帧转储）。

### 15.1 为什么要做本节这件事

§3 的「可归属差异」表把并发序列的 `requests 1 → 2` 与 `events 24 → 23` 已归因到**采样入口自己的陈述**（时钟推进 / `subagent_runtime` 交付移除），但七轮复核里给出的都是**代码层理由**（相关产品文件未改、A/B 去掉时钟推进后回到 1），**从未在同一陈述下实际跑过迁移前的产品**。票的 AC1 要求「相同条件可比」，因此本轮把这两条差异做了一次**控制实验**：把 §11（`fea87c7`，P24 落地）引入的那处采样陈述，施加回**迁移前的产品树**上。

### 15.2 控制实验：同一棵树、只换陈述，再只换产品

**被采样的迁移前树**取 `9738b5f`（= 01 的证据提交；它的产品面与冻结工件同源：`git diff --stat 59a0ed7 9738b5f -- framework extensions entrypoints` **为空**，01 只加了 `scripts/efficiency-baseline.ts` 与 `scripts/support/efficiency-baseline-fs-instrument.ts`）。为运行它，临时建了一棵 worktree（`git worktree add --detach …/22-before-matched 9738b5f`，`node_modules`/`.cache` 用 junction 指向本工作树，**运行后已 `git worktree remove --force` 并确认临时目录消失**；未改任何 ref、未碰 `pi-adapter` 的工作区）。三个采样（都在 win32/x64、bun 1.4.2、无 provider 凭据、本机 capture endpoint 下，串行）：

| 采样 | 命令（cwd） | 退出 | 结果 | 工件/日志 |
| --- | --- | --- | --- | --- |
| (a) 控制：迁移前树 + **01 自己的采样器** | `bun --preload ./scripts/support/efficiency-baseline-fs-instrument.ts ./scripts/tmp-efficiency-baseline-01.ts --out … --label before-control`（`…/22-before-matched`，脚本由 `git show 9738b5f:…` 写出） | 0 | 七条序列 `every invariant held.`（并发：`events=24`、`requests=1`、`draws=30`），4.00 s | `logs/22-takeover-i-before-control.json` |
| (b) 匹配：迁移前树 + **交付态采样器** | 同上，脚本换成 `scripts/efficiency-baseline.ts`（= 交付态），`--label before-matched` | 0 | 并发：`events=23`、`requests=2`（两条 `/user/balance`）、`draws=30`；**唯一失败的不变量**是迁移后才成立的那条「the child's own Round's interval was recorded on its session」（`childA.runtimeMs=undefined`，即产品不声明耗时读数时该字段无值）；3.87 s | `logs/22-takeover-i-before-matched.json` |
| (c) 交付态新跑 | `bun run baseline:efficiency --out …/22-takeover-i-after.json --label takeover-i`（本工作树） | 0 | 七条序列 `every invariant held.`；与已提交工件逐列相同（见下） | `logs/22-takeover-i-baseline.log`、`…-after.json` |

两个工件自报 `source.head = 9738b5f…`、`changedPaths` = 被换掉的两个采样文件（+ 本节的临时 01 脚本），即**被测产品树写进了工件本身**，读者可回到该 revision 复核。

四个对照（都经对照入口，`logs/22-takeover-i-*.txt`）：

| 对照 | 可比差异 | 结论 |
| --- | --- | --- |
| (a) 控制 vs **冻结工件** `01-efficiency-baseline.json` | `none: every comparable figure of every sequence and window agrees.` | 临时树**逐项复现了冻结工件**——(b) 与 (a) 之间的差异只可能来自陈述本身 |
| (a) 控制 vs (b) 匹配（**同一棵迁移前树，只换陈述**） | `main-child-concurrency requests 1 -> 2`、`events 24 -> 23`（语义交付 `subagent_runtime 1 -> 0`），其余逐列相同 | 冻结对照里那两条「可比差异」**由采样陈述的改变单独产生** |
| (b) 匹配 vs 已提交 `22-efficiency-after.json`（**同一陈述，只换产品**） | `main-child-concurrency draws 30 -> 33`（**全表唯一一条可比差异**；`requests 2/2`、`events 23/23`、七条序列窗口级文件成本逐列相同） | 同一条件下迁移前后的**请求/事件/读取/锁/发布/暂存成本完全相同** |
| (b) 匹配 vs (c) 交付态新跑 | 同上（`draws 30 -> 33`） | 该结论不依赖某一份工件：两侧都是本轮第一手新跑 |

**陈述改变的出处**：`git log -S CHILD_ACTIVITY_MS --all -- scripts/efficiency-baseline.ts` → `fea87c7`（2026-10-16，`11：子代理活动耗时改由公共 Round 区间累计，旧 runtimeMs 与缺口标记保留（P24、P25、P27）`）。`git diff 9738b5f 39fdc3d -- scripts/efficiency-baseline.ts` 显示它删掉了 01 的 `declareRuntime(...)`/`CHILD_RUNTIME_MS`、改成 `clock = T0 + CHILD_ACTIVITY_MS`（本票 `efb03e0` 只是在其后加了「等这次到达」与 2 次请求的不变量陈述）。也就是说，这条陈述差是**迁移自身对采样器的适配**，不是本票发明的口径；本票此前把它记为「可归属差异的原因」，本轮补上的是**同一陈述下的实测**：**迁移前的产品在同一声明下同样发出 2 次请求、23 次交付**，并且**通过交付态自己那条请求不变量**（含"等这次到达"）。

**边界（不夸大）**：冻结工件仍是 `P51` 对照的**主材料**（票的 AC1 要求对照 01 的工件），本节不改写它，也不把它替换成 (b)；(b) 是补充的可比性实测，其工件自带 provenance。§3/§6 已按本节更新指针；**第三、四行那份同一陈述的对照报告另存交付名 `logs/22-efficiency-comparison-matched.txt`**（与 `logs/22-efficiency-comparison.txt` 并列，逐字节等于 `logs/22-takeover-i-matched-conditions-fresh.txt`）。

### 15.3 主子会话例 `widget draws 33 → 18` 的第一手归因（§6 的最后一条未归因项）

做法：把本票交付的真实宿主用例 `tests/harness-dock/efficiency-effects.test.ts`（连同 `support/effect-instrument.ts`）复制进 15.2 的临时迁移前树，并在**两侧使用同一份**临时探针副本（只多一段把该 run 的 RPC 帧 dump 出来的代码；探针文件在两侧都不提交，跑完即删，交付态树 `git status` 中已无该文件）。两侧探针 dump 各写一份 JSON 到 `evidence/logs/`。

| 观察 | 迁移前（`9738b5f` + 交付态用例） | 迁移后（本树） | 来源 |
| --- | --- | --- | --- |
| 用例结果 | **3 pass / 0 fail**、21 expect()、12.32 s | **3 pass / 0 fail**、21 expect()、12.13 s | `logs/22-takeover-i-frames-before.log`、`…-after.log` |
| widget 帧（单会话例 / 主子例） | `10` / **`33`** | `10` / **`18`** | 同上（与已提交的 `22-dock-effects-pre-migration.log`、§5/§14 的 `10`/`18` 逐项一致） |
| 主子例帧构成 | 2 行帧 6 条 + 3 行帧 27 条 | 2 行帧 6 条 + 3 行帧 12 条 | `logs/22-takeover-i-frames-before.33frames-*.json`、`…-after.18frames-*.json` |
| 非 widget 帧数（同一 run 的全部 RPC 帧） | 71 − 33 = **38** | 56 − 18 = **38** | 同上（`allCount` 字段）——**只有本扩展 widget 的 `setWidget` 帧变少**，其余 RPC 流量逐个数相同 |
| 帧内容 | 两侧都是同一条状态推进（会话开始 → 余额预取 → Round 开启 → `Total/Round` 计数 → 尾随标记），两侧的首批帧（2 行帧 `2/3/1` 条）逐项相同；差异全在**同一状态被重复重绘的次数**：尾部那组三行 `Total/Round` 帧迁移前重绘 `26` 次（22+4）、迁移后 `12` 次（10+2） | 同左 | 同上，按 `widgetLines` 归一化（数字抹平）后逐帧比对 |

说明与边界：这条差异是**纯展示工作**（`setWidget` 帧），同一 run 里的 provider 到达（`["balance","model","model","model"]`）、存储根 13 次文件操作、健康空闲 0 效果、网络效果逐个相同（`logs/22-takeover-i-frames-before.log` 与 `…-after.log` 的 console 行）。**可观察的部分是**：同一批状态下，迁移后重绘次数更少（少 15 条 `setWidget`，全部是三行 `Total/Round` 帧）。**推断（未逐帧计时，故只作机制级说明）**：迁移前 OMP 侧对每条到达的通知都重绘一次（P24 把"每条读数/每个边缘"的通知改成按 Round 区间累计），因此同一内容被重绘更多次；探针没有记录帧的时刻，**哪一条通知对应哪一帧未定位**。方向上是**更少**的渲染，不构成额外开销。

### 15.4 公开入口第一手重跑（本树，串行；运行期间未改被测源码或 fixture）

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断 | `logs/22-takeover-i-typecheck.log` |
| `bun run baseline:efficiency --out …/22-takeover-i-after.json --label takeover-i` | 0 | 七条序列 `every invariant held.`；probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}`（与 §9–§14 相同） | `logs/22-takeover-i-baseline.log` |
| 新跑工件 vs 已提交 `22-efficiency-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`、交付相同（唯一噪声列 `file total` 视运行而定） | `logs/22-takeover-i-reproduction.txt` |
| 冻结对照重生成（`01` vs `22`） | 0 | 与已提交 `logs/22-efficiency-comparison.txt` **sha256 相同**（`a486f32712e4314108ef256d0e74a4aefdf7512ffb77e16600c5daab78b1fe72`） | `logs/22-takeover-i-frozen-comparison.txt` |
| `--after-rev pi-adapter`（只读，集成尖端 `190e1b5`） | 0 | 产品面 `19287 → 23773 (+4486)`、证据面 `54806 → 80085`（与 §14 相同） | `logs/22-takeover-i-integration-tip.txt` |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、12.64 s；效果 `2295`/`2689`、存储根 13 次、健康空闲 0 效果、frames `10`/`18`、arrivals 同 §5、无 `createServer`、未触达 `my-agent-toolkit-access` | `logs/22-takeover-i-effects.log` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主，串行） | 0 | **104 pass / 0 fail**、27 文件 / 227.73 s（与 §13/§14 逐项相同） | `logs/22-takeover-i-partition-harness-dock.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、38 文件 / 40.17 s | `logs/22-takeover-i-partition-framework.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**、40 文件 / 7.46 s（§11 记录的实时期限 flake 本轮未复现） | `logs/22-takeover-i-partition-model-cost.log` |

**本轮未覆盖项**（与 §6/§14 相同，本节新增两处收窄）：`P51`/`P52`/`P53` 的人类判断未做（票内含人类确认的两个勾选项保持未勾选）；并发序列 `draws +3` 仍是**路径级**归因（§14 的 A/B 已收敛到唯一的 `announce()`，逐渲染定位未做）；主子例 `frames 33 → 18` 本轮已归因到**内容级**（15.3），逐帧/逐通知的机制定位仍未做；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（未打补丁）、无 provider 凭据（模型请求与余额查询由本机 capture endpoint 回答）；15.2 的匹配采样是**补充**可比性材料，不改写 01 的冻结工件。

## 16. 第九次接手复核（源状态 `1913dc9`，无源码改动；公开入口、所属分区与共同消费者第一手重跑 + 第二套独立行计数 + 一处措辞修正）

接手时：HEAD `1913dc9`（= §15 定稿树；`efb03e0` … `62dd204` 的既有提交全部原样保留，**未做任何 reset**）。工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff`（§8/§12/§14 记录的 `core.autocrlf=true` 检出 stat 现象）外干净：本轮 `git diff --numstat` 对这三份**不输出任何行**（只有 LF/CRLF 警告），即内容与 `HEAD` blob 相同，**未 checkout/restore**。**产品代码无改动**：`git diff --name-only 39fdc3d HEAD -- framework extensions entrypoints` 为空；非 `.scratch/` 改动仍是 §11/§12 记录的那 5 个文件（`M package.json`、`M scripts/efficiency-baseline.ts`、`A scripts/efficiency-comparison.ts`、`A tests/harness-dock/efficiency-effects.test.ts`、`A tests/harness-dock/support/effect-instrument.ts`）加 §13 的 `A tests/harness-dock/efficiency-comparison.test.ts`。

**集成分支只读核对**：本地 `pi-adapter` 尖端仍 `190e1b5`（未操作、未合入）；`origin/pi-adapter` `212f32a`（13:06）是它的**祖先**（`git merge-base --is-ancestor origin/pi-adapter pi-adapter` 成立），远端落后于本地，因此没有需要重测的漂移。

全部命令在本树串行、运行期间未改被测源码或 fixture（本轮 rev/branch/时间/bun/隔离安装见 `logs/22-takeover-j-context.txt`）：

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断 | `logs/22-takeover-j-typecheck.log` |
| `bun run baseline:efficiency --out …/logs/22-takeover-j-after.json --label takeover-j` | 0 | 七条序列 `every invariant held.`；序列级逐行与 §2/§9–§15 相同（并发 `requests=2`/`draws=33`/`events=23`；`read-only-refresh` 序列级文件操作 0）；probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}` | `logs/22-takeover-j-baseline.log`、工件 `…-after.json` |
| 新跑工件 vs 已提交 `22-efficiency-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`、`every sequence delivered the same kinds the same number of times.`；`PRODUCT SUBTOTAL 23773 → 23773 (+0)` | `logs/22-takeover-j-reproduction.txt` |
| `--before 01-… --after 22-… --out logs/22-takeover-j-frozen-comparison.txt` | 0 | 复现 §3/§4：`requests 1→2`、`draws 30→33`、`events 24→23`；七条序列窗口级文件成本逐列相同；`PRODUCT SUBTOTAL 19287 → 23773 (+4486)`、`EVIDENCE SUBTOTAL 54806 → 79994` | `logs/22-takeover-j-frozen-comparison.txt` |
| 上一条重生成报告的 sha256 | — | `a486f32712e4314108ef256d0e74a4aefdf7512ffb77e16600c5daab78b1fe72`，与已提交 `logs/22-efficiency-comparison.txt` **相同** | `logs/22-takeover-j-summary.txt` |
| `--after-rev pi-adapter`（只读） | 0 | `190e1b5`：产品面 `19287 → 23773 (+4486)`、逐族与 `efb03e0` 相同；证据面 `54806 → 80085` | `logs/22-takeover-j-integration-tip.txt` |
| 第二套独立行计数（`git archive` 导出各 revision 的 tar + 逐 blob 数行；与入口的 `git ls-tree`/`git cat-file` 是不同管线，也与 §14 的字节计数各自独立） | — | 产品面 `19287`(59a0ed7) / `23773`(efb03e0) / `23773`(1913dc9) / `23773`(pi-adapter)、证据面 `54806` / `79994` / `80455` / `80085`；产品面**逐族** `entrypoints 37→46`、`codebase-tools 90→111`、`connect-bot 1608→1608`、`model-cost 8537→10326`、`framework 161→158`、`adapters 2571→3890`、`behaviors 2070→2142`、`core 2949→3248`、`modules 1264→2244`，与 §4/§11 的表逐一相同；`efb03e0`/`1913dc9`/尖端三者的产品面逐族完全相同 | 本节 |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、12.07s；效果 `2295`/`2689`、存储根 13 次操作（明细与 §5 逐条相同）、健康空闲窗口 0 效果、frames `10`/`18`、arrivals `["balance","model"]`/`["balance","model","model","model"]`、网络效果只有指向本机 capture 端口的一次 `createConnection`（无 `createServer`、无 `my-agent-toolkit-access`） | `logs/22-takeover-j-effects.log` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主，串行） | 0 | **104 pass / 0 fail**、1161 expect()、27 文件 / 223.69s | `logs/22-takeover-j-partition-harness-dock.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、2250 expect()、38 文件 / 39.56s | `logs/22-takeover-j-partition-framework.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**、2524 expect()、40 文件 / 7.44s（§11 记录的实时期限 flake 本轮未复现） | `logs/22-takeover-j-partition-model-cost.log` |

三组数与 §8/§10–§15 逐项相同（104/1161、481/2250、463/2524），即本票的公开入口、所属分区与共同消费者在这一源状态上仍然一致；本轮**首次运行即绿**，无新增失败。

**本票新增资源的释放（本节第一手核对）**：本票两个测试文件可能创建的是 `omp-dock-effect-{idle,child,control}-*`（经 `createRunRoot`，`efficiency-effects.test.ts` 在 `finally` 里 `disposeRun`/`runRoot.dispose()`）与 `efficiency-comparison-<label>-*`（`mkdtempSync` + `afterEach` 的 `rmSync`）。跑完本轮全部命令后在 OS temp 里检索这两个前缀：**0 个残留**（`omp-dock-effect-*` 从未出现过）。顺带观察、**不属本票结论**：该目录下另有 **852** 个 `omp-dock-*` 目录，标签来自其他 dock 文件（如 `omp-dock-model-cost-fresh-*`、`omp-dock-home-fork-*`、`omp-dock-recovery-tree-*`，落在 `tests/harness-dock/model-cost-store.test.ts`、`session-recovery.test.ts` 等），最新几个的 mtime 落在本轮分区运行期间；本票不判定其成因、也不改动它们（超出本票范围）。

另核 **S1 采样入口自己的临时根**（序列运行根 `model-cost-baseline-<label>-*` 与入口自检探针 `model-cost-baseline-probe-*`）：入口在 `main()` 正常收尾时清空 `runRoots` 的**全部**条目（`scripts/efficiency-baseline.ts:1735`；两类根都进这一集合，见 `:664` 与 `:1565`），本轮两次采样没有留下任何 `model-cost-baseline-*`；OS temp 里现存的 4 个 `model-cost-baseline-probe-*` 的 mtime 是 `2026-10-16 13:26:40 / 13:26:47 / 13:29:53 +0800`（= `05:26–05:29Z`），**早于本轮**（本轮采样在 `13:29–13:30Z`），来自更早的异常终止运行——该清理**没有 `try/finally`**，中途被杀就会留下。本票**不改**这个行为：这份临时根的生命周期属 01 交付的入口本身（本票只改了其中一处陈述与到达等待），改它会让已冻结的对照器械漂移；这里只记录事实与范围。

**一处措辞修正（不改任何数字、不改任何结论）**：§13/§14 的 `baseline:efficiency` 表格单元格此前写作「`read-only-refresh`/`healthy-idle`/`disposal` 文件操作 0」。按本节第一手读的采样日志，这个"0"对 `healthy-idle` 与 `disposal` 只在**它们自己的测量窗口**（`healthy-idle / idle`、`disposal / disposal`、`disposal / afterDisposal`，见 §3 的窗口表）成立；两条序列**自身**各含一次准备轮，序列级文件成本是 `3 reads / 1 publish / 7 locks / 2 staging / 1 metadata / 1 dir`，两侧逐列相同——`read-only-refresh` 则是序列级就为 0。已把这两处单元格的措辞改成窗口+序列级的准确说法；引用的日志不变，数字与结论不变。

**本节未覆盖项**（与 §6/§14/§15 相同）：`P51`/`P52`/`P53` 的人类判断未做（票内含人类确认的两个勾选项保持未勾选）；并发序列 `draws +3` 仍是**路径级**归因（§14 的 A/B 收敛到唯一的 `announce()`），主子例 `frames 33 → 18` 归到**内容级**（§15.3），两者的逐渲染/逐通知定位未做；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（未打补丁）、无 provider 凭据（模型请求与余额查询由本机 capture endpoint 回答）；§15.2 的匹配采样是补充可比性材料，不改写 01 的冻结工件。

## 17. 第十次接手复核（源状态 `a8c2ff3`；把并发序列 `draws 30 → 33` 定位到**渲染级** + 公开入口/所属分区/消费者第一手重跑 + 集成尖端产品面零漂移核对）

接手时：HEAD `a8c2ff3`（= §16 定稿树；`efb03e0` … `33b7637` 的既有提交全部原样保留，**未做任何 reset**）。工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff`（§8/§12/§14 记录的 `core.autocrlf=true` 检出 stat 现象）外干净：本轮 `git diff --numstat` 对这三份**不输出任何行**（只有 LF/CRLF 警告），即内容与 `HEAD` blob 相同，**未 checkout/restore**。**产品代码无改动**：`git diff --name-only 39fdc3d HEAD -- framework extensions entrypoints` 为空；非 `.scratch/` 改动仍是 §11/§12 记录的 5 个文件（`M package.json`、`M scripts/efficiency-baseline.ts`、`A scripts/efficiency-comparison.ts`、`A tests/harness-dock/efficiency-effects.test.ts`、`A tests/harness-dock/support/effect-instrument.ts`）加 §13 的 `A tests/harness-dock/efficiency-comparison.test.ts`。本节改动只有 `.scratch/` 下的本文件、票文件与 `logs/22-takeover-k-*`，外加一个**跑完即删**的临时探针（见 17.1，不在交付里）。

**集成分支只读核对（本节新增一条第一手事实）**：`pi-adapter` 尖端仍 `190e1b5`（本轮未推进；未操作、未合入），`origin/pi-adapter` `212f32a` 是它的**祖先**（远端落后）。§11 记录的是「产品路径下只差 `framework/docs/harness-support.md`」；本节把 `efb03e0`（本票实现提交）与尖端逐 TypeScript 文件比了一次：`git diff --stat efb03e0 pi-adapter -- 'framework/**/*.ts' 'extensions/**/*.ts' 'entrypoints/**/*.ts'` **无输出** —— 即**合入后要测的产品面与本票测量的产品面连一个 TS 文件都不差**（两版之间产品路径下的唯一差异是那份文档）。复杂度侧 `--after-rev pi-adapter` 得 `PRODUCT SUBTOTAL 19287 → 23773 (+4486)`、`EVIDENCE SUBTOTAL 54806 → 80085`（`logs/22-takeover-k-integration-tip.txt`）。另做一次**只读**合并可行性核对：`git merge-tree --write-tree --name-only HEAD pi-adapter` → exit 0、tree `7b5ce13ae273a5344097bc060aa90bc863010c47`、**无冲突列表**（`logs/22-takeover-k-merge-tree.txt`；未改任何 ref 或工作树）。

### 17.1 `main-child-concurrency draws 30 → 33` 的渲染级定位（§6/§13–§16 每轮列出的最后一条技术性缺口）

**问题**：§3 把这条差异归到「每个子代理 Round 结束一次 `announce()`」这条**路径**（§13 停用该调用 → `33 → 30`，§14 以可复现形式重做一遍），但**从未看过多出来的 3 帧画的是什么**——§6 因此每轮都记「逐渲染定位未做」。

**做法**（临时器械，跑完即删，不在交付里）：在交付态采样器的受控宿主上加一段帧记录（`controlledHost` 的 `setWidget` 把每次交给宿主的帧内容按序记下；只在 `MY_BASELINE_FRAMES_OUT` 指名文件时写出）。探针与交付态采样器的差异**另存成补丁** `logs/22-takeover-k-frames-probe.diff`（44 行，4 个 hunk：`FRAME_LOG` 声明、签名加 `sequenceLabel`、`setWidget` 里 push、`main()` 里按环境变量写 dump），读者可据此复核；探针文件 `scripts/tmp-frames-probe.ts` 跑完已删，交付树 `git status` 中不存在。

- 迁移前侧：**临时 worktree** 检出 `9738b5f`（01 的证据提交；其产品面与冻结工件同源，§15.2 已核），把**交付态**的 `scripts/efficiency-baseline.ts` 与 `scripts/support/efficiency-baseline-fs-instrument.ts` 拷进去（与 §15.2 同一构造），两侧跑**同一份探针字节**；`node_modules`/`.cache` 用 junction 指向本工作树；跑完 `git worktree remove` 并清理临时目录（清理中的一次 junction 事故与修复见 17.3）。
- 采样：迁移后 `--label frames-after`（`2026-10-16T13:45:29Z`，`source.head a8c2ff3`）、迁移前 `--label frames-before`（`13:45:32Z`，`source.head 9738b5f`，`changedPaths` = 被换掉的两个采样文件 + 该探针）、迁移后重复一次 `--label frames-after-rerun`（`13:46:41Z`）。三份工件与帧 dump 都在 `logs/`（`22-takeover-k-frames-{after,before,after-rerun}{,-artifact}.json`）。迁移前侧那一次**只有**那条迁移后才成立的不变量失败（`childA.runtimeMs=undefined expected=360000`，与 §15.2 逐字相同），其余六条序列与所有其他不变量成立。

| 观察 | 迁移前（`9738b5f` + 交付态采样器） | 迁移后（本树） | 来源 |
| --- | --- | --- | --- |
| 七条序列的 widget 帧数 | `8 / 16 / 30 / 8 / 8 / 8 / 9` | `8 / 16 / **33** / 8 / 8 / 8 / 9` | 帧 dump（顺序同上表序列次序） |
| 并发序列的**不同帧内容** | **7 种** | **7 种（同一组，逐字节相同）** | 同上 |
| 并发序列的 run-length（同内容连续帧） | `A×10 B×1 C×1 D×5 **E×7** F×1 G×5`（= 30） | `A×10 B×1 C×1 D×5 **E×10** F×1 G×5`（= 33） | 同上 |
| 与前一帧逐字节相同的帧数 | 23 / 30 | 26 / 33 | 同上 |
| 交付的事件与 kinds | 23 条，`{session_start:4, round_start:4, user_input:1, turn_start:5, turn_end:5, round_end:4}`，三个子代理 `round_end` 是第 17/18/19 条 | **逐项相同** | 两份工件的 `sequences[main-child-concurrency]` |

**结论（渲染级）**：`draws 30 → 33` 的 +3 **全部是同一个帧内容（上表的 `E`，3 行：`Total: Cache: 89% ¥Cache/In/Out：13:7:80 Cost: ¥0.09 Span: 0:02:00` / `Round: … Cost: ¥0.03`）被多画 3 次**：两侧的帧内容集合逐字节相同、其余 6 种内容的出现次数逐项相同（`10 / 5 / 5 / 1 / 1 / 1`）、事件与交付逐项相同；多出来的 3 次重绘**不带来任何新内容**（与前一帧逐字节相同）。与 §13/§14 的 A/B 合起来即：该序列有 3 个子代理 Round 结束 → 每次 `announce()` 多画一次**同一状态**的帧，共 +3。重复重绘本身不是迁移引入的模式：迁移前该序列 30 帧里已有 23 帧与前帧逐字节相同（迁移后 26/33）。重复采样两次（`frames-after` / `frames-after-rerun`）给出**完全相同**的帧数与 run-length，即这不是一次抖动。

**仍未定位的**：**通知与帧的配对**（哪一次公告画的是哪一帧）。3 次多出来的重绘落在同一条 `E` run 内（不是每次公告各追加一帧到尾部），要回答"哪一条通知对应哪一帧"得给采样器自己的交付路径（`bound.fire` / 框架 port double 的语义交付）加探针；这已属采样器械内部，不是产品开销的陈述，本节不做，保持为未覆盖项。

**边界（不夸大）**：这是 §15.2「同一陈述」条件下的第一手测量，与已提交的 `logs/22-efficiency-comparison-matched.txt` 的 `draws 30 → 33` 一致；**冻结对照（§3）仍是 `P51` 的主材料，本节不改写它**，也不把这条差异改判成"零成本"——它就是 3 次多余的前端重绘，代价可忽略但真实存在，是否可接受仍属人类判断。

**顺带独立复算 §15.3（用已提交的帧转储，不新增运行）**：主子例 `frames 33 → 18`、与前帧逐字节相同的帧数 `23 → 10`、被重复重绘的两组长 run `22+4 → 10+2`——与 §15.3 记录**逐项相同**；§15.3 的方向（迁移后**更少**重绘）由此得到独立复算。

### 17.2 公开入口、所属分区与共同消费者（本树，串行；运行期间未改被测源码或 fixture）

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断 | `logs/22-takeover-k-typecheck.log` |
| `bun run baseline:efficiency --out …/logs/22-takeover-k-after.json --label takeover-k`（`13:39:47Z`） | 0 | 七条序列 `every invariant held.`；并发序列 `requests=2`（`/user/balance`×2）、`draws=33`、`events=23`；`read-only-refresh` 序列级文件操作 0、`healthy-idle`/`disposal` 的**测量窗口**（`idle`/`disposal`/`afterDisposal`）文件操作 0（两条序列**自身**各含一次准备轮，序列级为 `3/1/7/2/1/1`，两侧逐列相同；§16 的措辞修正）；probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}`（与 §9–§16 相同） | `logs/22-takeover-k-baseline.log`、工件 `22-takeover-k-after.json` |
| 新跑工件 vs 已提交 `22-efficiency-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`、`every sequence delivered the same kinds the same number of times.`；`PRODUCT SUBTOTAL 23773 → 23773 (+0)`、`EVIDENCE SUBTOTAL 80455 → 79994`（−461 = §13 的 `tests/harness-dock/efficiency-comparison.test.ts`，本树 revision 有、`efb03e0` 没有） | `logs/22-takeover-k-reproduction.txt` |
| `--before 01-… --after 22-… --out …` | 0 | 复现 §3/§4：`requests 1→2`、`draws 30→33`、`events 24→23`（`subagent_runtime 1 → 0`），七条序列窗口级文件成本逐列相同；`PRODUCT SUBTOTAL 19287 → 23773 (+4486)`、`EVIDENCE SUBTOTAL 54806 → 79994`；**重生成报告与已提交 `logs/22-efficiency-comparison.txt` 的 sha256 相同**（`a486f327…`，两文件同 hash） | `logs/22-takeover-k-frozen-comparison.txt`、`…-frozen-comparison-console.log` |
| `--after-rev pi-adapter`（只读） | 0 | `190e1b5`：产品面 `19287 → 23773 (+4486)`、证据面 `54806 → 80085` | `logs/22-takeover-k-integration-tip.txt` |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、12.08s；效果 `2295`/`2689`、存储根 13 次操作（明细与 §5 逐条相同）、健康空闲窗口 0 效果、frames `10`/`18`、arrivals `["balance","model"]`/`["balance","model","model","model"]`、网络效果只有指向本机 capture 端口的一次 `createConnection`（无 `createServer`、无 `my-agent-toolkit-access`） | `logs/22-takeover-k-effects.log` |
| 同上，缓存修复后再跑一次 | 0 | **3 pass / 0 fail**、21 expect()、12.15s | `logs/22-takeover-k-effects-restored.log` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主，串行） | 0 | **104 pass / 0 fail**、1161 expect()、27 文件 / 228.18s（与 §13–§16 逐项相同） | `logs/22-takeover-k-partition-harness-dock.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、2250 expect()、38 文件 / 39.34s | `logs/22-takeover-k-partition-framework.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**、2524 expect()、40 文件 / 7.26s（§11 记录的实时期限 flake 本轮未复现） | `logs/22-takeover-k-partition-model-cost.log` |
| 用两个补丁前缀的 dock 用例（缓存修复后再跑） | 0 | **12 pass / 0 fail**、94 expect()、3 文件 / 4.83s | `logs/22-takeover-k-cache-restored-patched.log` |

三组数与 §8/§10–§16 逐项相同（104/1161、481/2250、463/2524）。

**本票新增资源的释放（本节第一手核对）**：跑完本节全部命令后在 OS temp 里检索本票前缀（`omp-dock-effect-*`、`efficiency-comparison-*`）与 S1 入口自己的根（`model-cost-baseline-*`、`model-cost-baseline-probe-*`，本节另有两次探针采样）：**新增残留 0 个**（这些前缀下没有任何 mtime 落在本轮的目录）。与 §16 同一观察：那两类根都在 `main()` 正常收尾时清空（`scripts/efficiency-baseline.ts:1745` 的 `runRoots.splice(0)`），异常终止才会遗留。

### 17.3 临时资源与工作树卫生（含一次 junction 事故与修复，按事实记录）

清理 17.1 的临时 worktree 时出过一次事故，如实记录成因与修复范围：

1. `git worktree remove --force` **注销成功**，但因路径过长（Windows API 上限）删不掉目录，留下一个已注销的目录（`git worktree list` 里已无该条目）。
2. 随后用 PowerShell `Remove-Item -LiteralPath <…>\.cache -Force` 删那两个 junction：**PowerShell 跟随了 junction，删掉了目标目录的内容**（本次被删的是 `.cache/omp-baseline/18.5.0` 整个、`.cache/22` 整个，以及 `.cache/omp-baseline/18.5.0-codex-response-boundary/node_modules/@oh-my-pi/**`），随后抛 `NullReferenceException` 中止。**教训与正确做法**：删 junction 用 `fsutil reparsepoint delete <junction>`（把链接降级成空目录）或 `[System.IO.Directory]::Delete(path, $false)`（不递归），**不要**用会递归的删除命令指向 junction。
3. 恢复与复验：两个被删前缀都从**同源 sibling worktree** `…\Temp\hyper-ticket-LMyfyZ\.cache\omp-baseline\` 用 `robocopy /E` 恢复（`18.5.0` 24880 文件、`18.5.0-codex-response-boundary` 24881 文件；`node_modules/@oh-my-pi/pi-coding-agent` 版本 `18.5.0`、`src/cli.ts` 在位、`package.json` 与来源逐字节相同）。复验：真实宿主 `efficiency-effects.test.ts` **3 pass / 0 fail**、两个补丁前缀的用例 **12 pass / 0 fail**（上表两行）。这两个前缀按 `baseline.ts` 的 `ensureIsolatedVersion` 本来就是**按需物化**的（缺失时 `bun install` 重建），恢复只是省掉一次重装。
4. **无法恢复的一项**：`.cache/22`（未跟踪的缓存 scratch；仓库内没有任何代码引用数字前缀的 `.cache` 条目，sibling worktree 里也没有同名目录）。按事实记为**丢失的缓存 scratch**；它不在本票的任何被测路径、结论或证据链上。
5. 本节此后只做只读核对与文档写作，未再改动产品源码或 fixture；临时 worktree 目录与探针文件都已不存在。

### 17.4 本轮未覆盖项

`P51`/`P52`/`P53` 的人类判断未做（票内含人类确认的两个勾选项保持未勾选）；**并发序列 `draws 30 → 33` 本轮已从"路径级"推进到"渲染级"**（+3 = 同一帧内容多画 3 次、无新内容），仍缺**通知→帧的配对**（见 17.1 末）；主子例 `frames 33 → 18` 仍是**内容级**（§15.3，本节独立复算一致）；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（未打补丁）、无 provider 凭据（模型请求与余额查询由本机 capture endpoint 回答）；§15.2 的匹配采样是补充可比性材料，不改写 01 的冻结工件；17.3 记录的那次缓存事故不改变任何结论，但 `.cache/22` 一项按事实记为丢失。

## 18. 第十一次接手复核（源状态 `78cfbf5`；把并发序列 `draws 30 → 33` 的**通知→帧配对**做完 + 公开入口/所属分区/消费者第一手重跑 + 集成尖端只读核对）

接手时：HEAD `78cfbf5`（= §17 定稿树；`efb03e0` … `a8c2ff3` 的既有提交全部原样保留，**未做任何 reset**）。工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff`（§8/§12/§14/§17 记录的 `core.autocrlf=true` 检出 stat 现象：`git diff --numstat` 对这三份不输出任何行，即内容与 `HEAD` blob 相同，**未 checkout/restore**）外干净。**产品代码无改动**：`git diff --name-only 39fdc3d HEAD -- framework extensions entrypoints` 为空；非 `.scratch/` 改动仍是 §11/§12/§17 记录的那 6 个证据面文件（`M package.json`、`M scripts/efficiency-baseline.ts`、`A scripts/efficiency-comparison.ts`、`A tests/harness-dock/efficiency-effects.test.ts`、`A tests/harness-dock/support/effect-instrument.ts`、`A tests/harness-dock/efficiency-comparison.test.ts`）。本节改动只有 `.scratch/` 下的本文件、票文件与 `logs/22-takeover-l-*`，外加一个**跑完即删**的临时探针（见 18.1，不在交付里）。

### 18.1 并发序列 `draws 30 → 33` 的**通知→帧配对**（§6/§13–§17 每轮列出的最后一条技术性缺口）

**问题**：§13/§14 用 A/B 把这条差异归到**唯一路径**（每个子代理 Round 结束一次 `announce()`；停用后同一 revision 下 `33 → 30`），§17.1 把 +3 归到**渲染级**（同一帧内容多画 3 次、无新内容），但**哪一条通知画的是哪一帧**从未观察过——§17.1 明确把它留作未覆盖项（"这已属采样器械内部"）。

**做法**（临时器械，跑完即删，不在交付里）：把交付态采样器复制成一份探针副本，做三件事（探针与原件的差异另存 `logs/22-takeover-l-notify-frame-probe.diff`，98 插入 / 23 删除，读者可据该补丁复核；探针文件跑完已删，`git status` 中不存在）：

1. `controlledHost` 的 `setWidget` 每次交帧时记下**当时正在被派发的那次交付**（`delivering(note, run)` 包裹 `deliverSession` / `deliverRound` / `deliverTurn` / `deliverUserInput` / `fire` / `initiateRun`，嵌套时按栈恢复）；
2. 包住**前端自己那一个订阅**（`attachModelCostWidget` 收到的 runtime 的 `view.subscribe`；只包这一处，不碰产品路径），于是每次被通知时计数并记下 `(序号, 当时的交付)`——这就是"通知"这一侧的可观察量；
3. 每次交帧同时记下 `notify` 序号，于是帧与通知可按序配对。

采样都在同一命令行、同一工作树、串行、win32/x64、bun 1.4.2、无 provider 凭据（余额与模型请求由本机 capture endpoint 回答）下进行。

| 观察（`main-child-concurrency`） | 交付态 | 停用该 `announce()`（§14 的注入补丁） | 来源 |
| --- | --- | --- | --- |
| 帧数（`draws`） | **33** | **30** | 工件 `22-takeover-l-pairing-{after,noannounce}-artifact.json` |
| 交付给前端的通知数 | **32** | **29** | 同一 dump 的 `notifications` |
| 通知 ↔ 帧的对应 | 每条通知恰好 1 帧；唯一的例外是第 1 帧（`fire session_start` → `followSession` → 直接 `render()`，不经通知）；**没有"有通知无帧"或"有帧无通知"** | 同左 | 同一 dump |
| 失败的不变量 | 七条序列 `every invariant held.` | 同左（该通知不承载任何不变量） | `logs/22-takeover-l-pairing-*.log` |

**逐交付配对**（帧数 `交付态/停用态`，通知数同值）：

| 交付 | 帧数 | 交付 | 帧数 |
| --- | --- | --- | --- |
| `fire session_start` | 1 / 1（0 / 0 通知） | `response_settled baseline-grand` | 1 / 1 |
| `session_start baseline-main` | 1 / 1 | `round_end baseline-child-a` | **3 / 2** |
| `round_start baseline-main` | 2 / 2 | `round_end baseline-child-b` | **3 / 2** |
| `session_start baseline-child-a` | 1 / 1 | `round_end baseline-grand` | **3 / 2** |
| `round_start baseline-child-a` | 2 / 2 | `round_end baseline-main` | 2 / 2 |
| `session_start baseline-child-b` | 1 / 1 | 无交付（提交的异步收尾） | 2 / 2 |
| `round_start baseline-child-b` | 2 / 2 | **合计** | **33 / 30**（通知 32 / 29） |
| `response_settled baseline-main` | 4 / 4 | | |
| `response_settled baseline-child-a` | 1 / 1 | | |
| `session_start baseline-grand` | 1 / 1 | | |
| `round_start baseline-grand` | 2 / 2 | | |
| `response_settled baseline-child-b` | 1 / 1 | | |

即：**唯一被这次停用改变的，是三个子会话 `round_end` 交付各自少了一条通知、少了一帧**（3→2），其余每个交付的帧数与通知数逐项相同；两侧的帧内容集合逐字节相同，run-length 也只剩那一组（`E×10 → E×7`，其余 `A10 B1 C1 D5 F1 G5` 相同），与前帧逐字节相同的帧数 `26/33 → 23/30`。

**哪一条通知**（第一次把"通知"本身钉到产品调用点）：把 `roundEnded` 里那一次 `announce()`（`extensions/model-cost/shared-logic/request-accounting.ts:1133`）临时前后各加一行标记（补丁 `logs/22-takeover-l-subannounce-marker-injection.diff`，+2 行），探针在每条通知上记下"该标记当时是否置位"。

| 观察（交付态 + 标记，`22-takeover-l-pairing-marked.json`） | 结果 |
| --- | --- |
| 帧数 / 通知数 | 33 / 32（与交付态逐项相同） |
| 三个子会话 `round_end` 交付各自的通知 | 3 条；其中**被标记的正是第 3 条**（全局序号 20 / 23 / 26，对应 child-a / child-b / grand） |
| 被标记通知所画的帧 | 帧 21 / 24 / 27，**内容与紧邻前一帧逐字节相同**（同一组 3 行：`Total: … Cost: ¥0.09` / `Round: … Cost: ¥0.03`），即 §17.1 的 `E` 内容 |
| 该 run 的其余一切 | 七条序列 `every invariant held.`；对照入口判"新跑工件 vs 已提交 `22-efficiency-after.json`"为 `none: every comparable figure of every sequence and window agrees.`、产品面 `+0`（`logs/22-takeover-l-marked-vs-delivered.txt`） |

**结论（配对完成）**：并发序列 `draws 30 → 33` 的 +3 = **每个子代理 Round 结束**时，该 `announce()` 恰好发出**一条**通知，前端恰好画**一帧**，而这一帧与其前一帧**逐字节相同**——纯展示工作，不带任何新内容、不触达文件、网络、请求或记账（该 run 的七条不变量与全部文件/请求/交付计数与交付态逐项相同）。§6 里"未逐步归因"的并发序列一项**至此关闭**。

**边界（不夸大）**：每个子 `round_end` 交付内的另外两条通知（本交付的第 1、2 条）未被逐条追到产品调用点——它们在停用态**同样存在、同样各画一帧**，因此不属于本迁移的增量；本节只把增量那一条钉死。另外，"每条通知恰好一帧"是**这次采样陈述下**的观察（前端把一次通知读成一次重绘），不是对任意宿主的普遍断言。

**注入卫生**：标记注入用 `git apply -R` 还原，`sha256 = a06f1313eddefd808a1875b190652a2deef92b8483db5d8b7eeb51e520042391`（与 §13/§14 记录的注入前原件相同），`git diff --name-only -- extensions framework entrypoints` 为空；探针副本已删除（`git status --short -- scripts tests extensions framework entrypoints` 为空，`scripts/` 下无 `tmp*`）。

### 18.2 公开入口、所属分区与共同消费者（本树，串行；运行期间未改被测源码或 fixture）

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断（探针删除后运行，覆盖交付树全部 TypeScript） | `logs/22-takeover-l-typecheck.log` |
| `bun run baseline:efficiency --out …/logs/22-takeover-l-after.json --label takeover-l` | 0 | 七条序列 `every invariant held.`；并发序列 `requests=2`（`/user/balance`×2）、`draws=33`、`events=23`；`read-only-refresh` 序列级文件操作 0、`healthy-idle`/`disposal` 的**测量窗口**（`idle`/`disposal`/`afterDisposal`）文件操作 0（§16 的措辞修正）；probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}`（与 §9–§17 相同） | `logs/22-takeover-l-baseline.log` |
| 新跑工件 vs 已提交 `22-efficiency-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`、`every sequence delivered the same kinds the same number of times.`；产品面 `23773 → 23773 (+0)`、证据面 `80455 → 79994`（−461 = §13 的测试文件，本树 revision 有、`efb03e0` 没有） | `logs/22-takeover-l-reproduction.txt` |
| `--before 01-… --after 22-… --out …` | 0 | 复现 §3/§4（`requests 1→2`、`draws 30→33`、`events 24→23`、产品面 `19287 → 23773 (+4486)`、证据面 `54806 → 79994`）；**重生成报告与已提交 `logs/22-efficiency-comparison.txt` 的 sha256 相同**（`a486f32712e4314108ef256d0e74a4aefdf7512ffb77e16600c5daab78b1fe72`） | `logs/22-takeover-l-frozen-comparison.txt`、`…-frozen-comparison-console.log` |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、12.99s；效果 `2295`/`2689`、存储根 13 次操作（明细与 §5 逐条相同）、健康空闲窗口 0 效果、frames `10`/`18`、arrivals `["balance","model"]`/`["balance","model","model","model"]`、网络效果只有指向本机 capture 端口的一次 `createConnection`（无 `createServer`、无 `my-agent-toolkit-access`） | `logs/22-takeover-l-effects.log` |
| `OMP_BOT_BINARY=… bun test tests/harness-dock`（所属分区，真实宿主，串行） | 0 | **104 pass / 0 fail**、1161 expect()、27 文件 / 231.92s（与 §13–§17 逐项相同） | `logs/22-takeover-l-partition-harness-dock.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、2250 expect()、38 文件 / 39.10s | `logs/22-takeover-l-partition-framework.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**、2524 expect()、40 文件 / 7.54s（§11 记录的实时期限 flake 未复现） | `logs/22-takeover-l-partition-model-cost.log` |

三组数与 §8/§10–§17 逐项相同（104/1161、481/2250、463/2524）。

### 18.3 集成分支只读核对与临时资源

- `pi-adapter` 尖端仍 `190e1b5`（本轮未推进；未操作、未合入），`origin/pi-adapter` 是它的**祖先**；`git diff --stat efb03e0 pi-adapter -- 'framework/**/*.ts' 'extensions/**/*.ts' 'entrypoints/**/*.ts'` **无输出**（合入后要测的产品面与本票测量的产品面连一个 TS 文件都不差）；`--after-rev pi-adapter` 得产品面 `19287 → 23773 (+4486)`、证据面 `54806 → 80085`（`logs/22-takeover-l-integration-tip.txt`）；只读合并可行性核对 `git merge-tree --write-tree --name-only HEAD pi-adapter` → exit 0、tree `e45bd221fe1e95a713ef7d386fc33f19ae827b03`、**无冲突列表**（`logs/22-takeover-l-merge-tree.txt`；未改任何 ref 或工作树）。
- 本票新增资源的释放：跑完本节全部命令后，OS temp 下本票前缀（`omp-dock-effect-*`、`efficiency-comparison-*`）与 S1 入口自己的根（`model-cost-baseline-*`）**新增残留 0 个**；现存 4 个 `model-cost-baseline-probe-*` 的 mtime 为 13:26/13:29（早于本轮、来自异常终止运行，与 §16/§17 记录同一批）。这些根都在 `main()` 正常收尾时清空（`scripts/efficiency-baseline.ts:1745` 的 `runRoots.splice(0)`）。
- 本轮**未**创建临时 worktree、**未**使用 junction，也未做任何缓存删除（§17.3 的事故成因与正确做法在本轮不适用）。

### 18.4 本轮未覆盖项

`P51`/`P52`/`P53` 的人类判断未做（票内含人类确认的两个勾选项保持未勾选）；并发序列 `draws +3` 的**通知→帧配对本轮已完成**（18.1），主子例 `frames 33 → 18` 仍是**内容级**（§15.3，§17.1 独立复算一致）；pi 侧本机接入未做同样的记录器注入；证据范围仍限 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（未打补丁）、无 provider 凭据（模型请求与余额查询由本机 capture endpoint 回答）；§15.2 的匹配采样是补充可比性材料，不改写 01 的冻结工件；`.cache/22` 一项仍按 §17.3 的事实记为丢失。

## 19. 第十二次接手复核（源状态 `0d92213`；公开入口/所属分区/消费者第一手重跑 + 第二套独立管线复算复杂度 + 集成尖端只读核对；含一次负载导致的假失败及其排除）

接手时：HEAD `0d92213437f1fabf07aaa983414fd212f548ceea`（= §18 定稿树；`efb03e0` … `78cfbf5` 的既有提交全部原样保留，**未做任何 reset**，未改产品代码或 fixture）。工作树除 `bun.lock` 与两份 `host-patches/*/patch.diff`（§8/§12/§14/§17/§18 记录的 `core.autocrlf=true` 检出 stat 现象）外干净：本轮用 `sha256sum` 逐份比过工作树文件与 `HEAD` blob —— `bun.lock` 两侧同为 `a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6`、`host-patches/omp-18.5.0-viewed-session/patch.diff` 两侧同为 `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b`（三份文件工作树里 CRLF 计数均为 0，即已是 LF）—— 即内容与 `HEAD` 相同、**未 checkout/restore**。源状态快照见 `logs/22-takeover-m-source.txt`：`head=0d92213`、分支 `hyper/model-cost-pi-migration/22-efficiency-acceptance-a73e6b-411dc288ea83`、`git diff --name-only 39fdc3d HEAD -- framework extensions entrypoints` 为空。本节改动只有 `.scratch/` 下的本文件、票文件与 `logs/22-takeover-m-*`；**所有采样与测试都在源码/fixture 未变的状态下跑完，之后才写本节**。

### 19.1 公开入口、所属分区与共同消费者（本树，串行；运行期间未改被测源码或 fixture）

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | `tsc --noEmit` 无诊断 | `logs/22-takeover-m-typecheck.log` |
| `bun run baseline:efficiency --out …/logs/22-takeover-m-after.json --label takeover-m`（`14:04:54Z`） | 0 | 七条序列 `every invariant held.`；下表；并发序列 `requests=2`（`/user/balance`×2）、`draws=33`、`events=23`；probe `{"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}`（与 §9–§18 逐项相同） | `logs/22-takeover-m-baseline.log`、工件 `22-takeover-m-after.json` |
| 新跑工件 vs 已提交 `22-efficiency-after.json` | 0 | `none: every comparable figure of every sequence and window agrees.`、`every sequence delivered the same kinds the same number of times.`；`PRODUCT SUBTOTAL 23773 → 23773 (+0)`、`EVIDENCE SUBTOTAL 80455 → 79994`（−461 = §13 的 `tests/harness-dock/efficiency-comparison.test.ts` 与 §10 的对照入口改动：本树 revision 有、`efb03e0` 没有） | `logs/22-takeover-m-reproduction.txt`、`…-reproduction-console.log` |
| `--before 01-… --after 22-…`（`--out` 到新文件） | 0 | 复现 §3/§4：`requests 1→2`、`draws 30→33`、`events 24→23`（`subagent_runtime 1 → 0`）、七条序列窗口级文件成本逐列相同；`PRODUCT 19287 → 23773 (+4486)`、`EVIDENCE 54806 → 80455`；**重生成报告与已提交 `logs/22-efficiency-comparison.txt` 逐字节相同**（两文件 sha256 同为 `a486f32712e4314108ef256d0e74a4aefdf7512ffb77e16600c5daab78b1fe72`，各 11531 字节） | `logs/22-takeover-m-frozen-comparison.txt`、`…-frozen-comparison-console.log`；`logs/22-takeover-m-vs-committed.txt`（01 vs 新跑工件） |
| `bun test tests/harness-dock/efficiency-effects.test.ts`（真实宿主） | 0 | **3 pass / 0 fail**、21 expect()、15.34s；效果 `2295` / `2689`；存储根 13 次操作（`mkdir` 锁暂存、`mkdir cost-archive`、读 `codex-usage-estimate.json`、读 `consumption.json`、`realpath cost-archive`、两处 `rename`、两处 `unlink`、两处 `writeFile`，与 §5 明细逐条相同）；健康空闲窗口 `[]`；frames `10` / `18`；arrivals `["balance","model"]` / `["balance","model","model","model"]`；网络只有指向本机 capture 端口的一次 `createConnection`（无 `createServer`、无 `my-agent-toolkit-access`） | `logs/22-takeover-m-effects.log` |
| `OMP_BOT_BINARY="E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe" bun test tests/harness-dock`（所属分区，真实宿主，串行） | 0 | **104 pass / 0 fail**、1161 expect()、27 文件 / 220.12s（与 §13–§18 逐项相同） | `logs/22-takeover-m-partition-harness-dock-rerun.log` |
| `bun test tests/framework`（共同路径消费者） | 0 | **481 pass / 0 fail**、2250 expect()、38 文件 / 39.37s | `logs/22-takeover-m-partition-framework.log` |
| `bun test tests/model-cost`（共同路径消费者） | 0 | **463 pass / 0 fail**、2524 expect()、40 文件 / 7.34s（§11 记录的实时期限 flake 本轮未复现） | `logs/22-takeover-m-partition-model-cost.log` |

`bun run baseline:efficiency` 的七条序列（本轮新跑，`--label takeover-m`）：

```
sequence                   events reads pubs locks stage  meta  dirs other  fail   req draws     ms  invariants
main-request                    6     3     1     7      2      1     1     0     6      1     8     24 ok
multi-turn                     14     3     1     7      2      1     1     0     6      1    16      7 ok
main-child-concurrency         23     6     4    28      8      4     1     0    16      2    33     47 ok
save-onto-shared-document       6     3     1     7      2      1     1     0     4      1     8      7 ok
read-only-refresh               6     0     0     0      0      0     0     0     0      1     8      4 ok
healthy-idle                    6     3     1     7      2      1     1     0     6      1     8   3007 ok
disposal                       10     3     1     7      2      1     1     0     6      1     9    508 ok
```

（与 §17.2/§18.2 同一组数；`read-only-refresh` 序列级文件操作为 0，`healthy-idle`/`disposal` 的**测量窗口**为 0，两条序列自身各含一次准备轮 —— §16 的措辞口径。）

### 19.2 分区首次运行的一次负载型假失败，与它的排除（如实记录）

本轮第一次跑所属分区（`14:06`–`14:14`）结束时是 **102 pass / 2 fail**、整轮 **480.60s**（同源状态下 §13–§18 与本节重跑都是 220–232s，即约 **2.07×**）。两例都在 `tests/harness-dock/model-cost-modes.test.ts`：

| 失败例 | 报告的错误 | 时长 |
| --- | --- | --- |
| `a hidden model draws no usage widget and still runs (P8, P9) > an unlisted pair shows no widget at all while the model really executes` | `EBUSY: resource busy or locked, rm '<TEMP>\omp-dock-model-cost-modes-hidden-GweJhC'`（`tests/harness-dock/run-root.ts:40`，来自 `startRun` 的 catch：`model-cost-modes.test.ts:319`） | 90052.85ms |
| `a token-only model shows its approved usage with no amount of its own (P8) > the Go ids draw the fixed budget and a token total, and no currency anywhere` | 同上（`…-token-only-q8PD7b`） | 90049.04ms |

**成因判读（第一手）**：可见的 `EBUSY` 不是根因 —— 它由 `startRun` 自己的 `catch` 里那句 `runRoot.dispose()` 抛出，**掩盖**了先前 `ControlledSession.start` 的停滞（该文件这两例自己声明的预算是 `240_000ms`，所以 90.05s 不是用例预算到期；`EBUSY` 出现在 90.05s 只说明那一刻宿主进程仍占着 run root）。即这一轮遇到的是宿主启动停滞，而不是行为失败。

**排除证据（同一源状态 `0d92213`，产品代码与这两例的 fixture 本轮都未改动）**：

1. 同样两例单独跑：`bun test tests/harness-dock/model-cost-modes.test.ts -t "unlisted pair shows no widget at all|the Go ids draw the fixed budget"` → **2 pass / 0 fail**、14 expect()、**6.71s**（`logs/22-takeover-m-modes-targeted-rerun.log`）—— 正常情况下这两例远在预算之内。
2. 随后整分区重跑：**104 pass / 0 fail**、1161 expect()、27 文件 / **220.12s**（§19.1 表中那一行，`…-partition-harness-dock-rerun.log`），与 §13–§18 逐项相同。
3. 本票不改产品代码（§19 开头：`framework`/`extensions`/`entrypoints` 零差异），这两例也不属于本票新增用例；首次运行期间本机没有其它被测套件在跑（两次 dock 运行之间只有只读 git 与文档写作）。

**临时资源（本节第一手核对）**：失败运行留下的两个 run root 里的文件已全部删除（现存各 0 文件，只剩空目录骨架与一条指回同树内已删目标的悬空链接 `user-home/.bun/install/cache/yaml/2.9.1@@@1`，MSYS 下 `rm` 报 `Permission denied` 删不掉，按 OS temp 垃圾如实记录）。本票自己的前缀在 OS temp 下**新增残留 0**：`omp-dock-effect-*` 0、`efficiency-comparison-*` 0、`model-cost-baseline-*` 0（现存 4 个 `model-cost-baseline-probe-*` 的 mtime 为 `13:26`/`13:29`，早于本轮，与 §16/§17/§18 记录同一批）；另外两个 `omp-dock-model-cost-modes-*` 目录（`…-hidden-cRVyKC`、`…-token-only-7f2bTJ`）的 mtime 是 **2026-10-15 21:28/21:30**，属更早运行留下的、非本轮的残留。本轮**未创建临时 worktree、未使用 junction、未做任何缓存删除**（§17.3 那次事故的成因与正确做法在本轮不适用），也未改动任何 ref 或集成分支工作区。

### 19.3 复杂度的第二套独立复算（`git archive` tar 流 + 逐文件行计数）

§4/§10/§3 的复杂度由对照入口自己的管线（`git ls-tree` + `git cat-file --batch`）得到。本节另用一条**独立实现**复算：`git archive --format=tar <rev> framework extensions entrypoints` 取出该 revision 自己的 tree，逐 `.ts` 成员按"换行数 + 末字节非换行时 +1"计数（即 §10 定下的行口径），再按族聚合。

| family | before `59a0ed7` | after `efb03e0` | tip `pi-adapter` `190e1b5` |
| --- | --- | --- | --- |
| `entrypoints/omp` | 28 | 28 | 28 |
| `entrypoints/pi` | 9 | 18 | 18 |
| `extensions/codebase-tools` | 90 | 111 | 111 |
| `extensions/connect-bot` | 1608 | 1608 | 1608 |
| `extensions/model-cost` | 8537 | 10326 | 10326 |
| `framework` | 161 | 158 | 158 |
| `framework/adapters` | 2571 | 3890 | 3890 |
| `framework/behaviors` | 2070 | 2142 | 2142 |
| `framework/core` | 2949 | 3248 | 3248 |
| `framework/modules` | 1264 | 2244 | 2244 |
| **PRODUCT SUBTOTAL** | **19287** | **23773** | **23773** |

逐族与 `+4486` 与 §4 完全一致，且与对照入口自己在同一 revision 上的数字相同 —— 即 §4 那张表不是单一管线的产物。

### 19.4 集成分支只读核对（本轮新增两条第一手事实）

- `pi-adapter` 尖端仍 `190e1b5`（本轮未推进；未操作、未合入），`origin/pi-adapter` `212f32a` 是它的**祖先**；`git merge-base --is-ancestor origin/pi-adapter pi-adapter` → 0。
- 产品面零漂移：`git diff --stat efb03e0 pi-adapter -- 'framework/**/*.ts' 'extensions/**/*.ts' 'entrypoints/**/*.ts'` **无输出**；`--after-rev pi-adapter` 得 `PRODUCT SUBTOTAL 19287 → 23773 (+4486)`、逐族与 §4/§19.3 相同（`EVIDENCE SUBTOTAL 54806 → 80085`，`logs/22-takeover-m-integration-tip-complexity.txt`）。
- 合并可行性（只读）：`git merge-tree --write-tree --name-only HEAD pi-adapter` → exit 0、tree `fe49bdb7a94848f8f59d2fa20f51dd93d042d917`、**无冲突列表**（`logs/22-takeover-m-merge-tree.txt`；未改任何 ref 或工作树）。
- **本轮新查清的一条集成事实**：尖端**尚不含本票的证据面文件** —— `pi-adapter:scripts/efficiency-comparison.ts` 与 `pi-adapter:tests/harness-dock/efficiency-effects.test.ts` 在尖端树里不存在，`pi-adapter:scripts/efficiency-baseline.ts` 是 1711 行的（§10 修正前）变体；尖端另含 **25 的证据审计段落** `framework/docs/harness-support.md`（本树没有，因为本票在它之前分叉）。因此合入本票会带入本票的 4 个证据面新增/修改文件并保留 25 那段文档，`merge-tree` 判定无冲突。**合入后全仓数的预期**：25 的记录是全组装树 `bun test` **1200 pass / 0 fail**，其中不含本票的 14 例（`efficiency-effects` 3 + `efficiency-comparison` 11），所以合并后的全仓运行预期为 **1214 pass**（由 25 的记录加算术得出，本节未跑全仓 `bun test`）。

### 19.5 本轮未覆盖项

`P51`/`P52`/`P53` 的人类判断未做（票内含人类确认的两个勾选项保持未勾选，本票只提供材料）；`pi` 侧本机接入未做同样的记录器注入（该观察面归 pi 各票，见 §6）；证据范围仍限 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（未打补丁）、无 provider 凭据（模型请求与余额查询由本机 capture endpoint 回答）；§15.2 的匹配采样是补充可比性材料，不改写 01 的冻结工件；`.cache/22` 一项仍按 §17.3 的事实记为丢失；§19.2 那次负载型假失败的成因按观察记录（宿主启动 90s 停滞），未追到更深的系统层原因，结论是它不属本票改动。

**主子例 `frames 33 → 18`（真实宿主）的处置（明确写下，不是遗漏）**：它保持 §15.3 的**内容级**归因（§17.1 用已提交转储独立复算一致），本轮**不再**为它加探针，理由三条：(a) 它的方向是重绘**减少**（33 → 18、与前帧逐字节相同的帧数 23 → 10、非 widget 帧数两侧同为 38），P51 要确认的"禁止的重复工作不新增"不因一次减少而改变；(b) 迁移前侧已有的两条可比差异（`requests`、`events`）已在 §15.2 归到采样陈述级，同陈述下全表只剩并发序列 `draws +3`，而那条已在 §17.1/§18.1 从路径级走到通知级配对被关闭；(c) 要把真实宿主侧也做到"逐通知→逐帧"，需要在宿主进程里包住前端自己的订阅（§18.1 的成套器械是对采样器**自己**的受控宿主做的，真实宿主侧只能临时改产品文件），代价与本票要交付的材料不成比例。该条因此**按限制记录**（属于 AC1 要求的"未覆盖项"），**不标为通过，也不影响 P51 的结论**（真实宿主侧的重绘次数差异只涉展示，且方向为减少）。
