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
| 采样入口按自身时间线陈述请求数 | `scripts/efficiency-baseline.ts` | 并发序列把"子代理 Round 结束"的瞬间陈述为一次时钟推进（`CHILD_ACTIVITY_MS`），该瞬间越过条目自己声明的成功 TTL；于是条目把该序列的请求数陈述为「一次启动预取 + 一次已结算请求刷新」，并在读取计数前**等待该到达**（此前是竞态）。序列、采样方法、其他不变量与工件形状不变。 |
| 可归属的对照入口 | `scripts/efficiency-comparison.ts`（`bun run compare:efficiency`） | 对齐两份采样工件，按序列与测量窗口逐项比较（读取/发布/锁/暂存/元数据/目录/总数、请求、绘制、事件、等待、行数），列出可归属差异与噪声列；复杂度按两版 revision **自身 tree 的 tracked TypeScript 行数**分产品面/证据面统计，并列出逐模块变化。不设阈值、不因差异失败——判断属人类。 |
| 真实宿主的外部效果记录器 | `tests/harness-dock/support/effect-instrument.ts` | 通过 `BUN_OPTIONS=--preload` 注入真实宿主进程，在宿主自己的模块图之前包裹 `node:fs`、`node:fs/promises`、`node:net` 的成员并记录每次调用，进程退出时把记录写到运行自己指名的文件。未被指名 dump 文件时**完全不动作**；dump 用包裹前捕获的成员写出，自己的写不进入记录。 |
| 真实宿主效果检查 | `tests/harness-dock/efficiency-effects.test.ts` | 3 例：单会话一轮的存储成本与健康空闲窗口；带一个真实子代理会话时无第二次根查询/无重复根 UI/无本地 IPC；记录器自身的灵敏度对照。 |

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

（注：本票提交的对照报告 `logs/22-efficiency-comparison.txt` 由 `efb03e0` 版本的对照入口生成，因此把 `file total` 一并列在"可比差异"里；口径修正 `6802bef` 后该列改列于噪声段并附原因说明，上表数值不变。）

| 差异 | 数值 | 原因（可归属） |
| --- | --- | --- |
| `requests` | 1 → 2（两条都是 `/user/balance`） | 条目自身的时间线：该序列把子代理 Round 结束陈述为 `clock = T0 + 360000ms`（ticket 11 / P24 的"按 Round 区间累计耗时"落地后，宿主不再声明耗时读数，只能按时钟推进），越过条目自己声明的 `balanceTtlMs=30000`；于是第一个在该瞬间之后结算的计价 Turn 触发**一次**已结算请求刷新（`provider-balance.ts` 的共享规则，非轮询）。归属证据：`provider-balance.ts` / `provider-refresh.ts` 在 `59a0ed7..efb03e0` **无任何改动**（`git diff --stat 59a0ed7 HEAD -- extensions/model-cost/` 不含这两个文件）；时间线不动时 `requests=1`（`logs/22-ab-no-clock-advance.log`）；TTL 抬到 1e9ms 时 `requests=1`（`logs/22-ab-huge-ttl.log`）。 |
| `draws` | 30 → 33 | 其中 +1 伴随上面那次刷新的结果变更通知（同一运行里 `requests=1` 时 draws=32）；另 +2 在同一时间线与同一请求数下出现，机制可归属到 P24 的落地：`request-accounting.ts` 的 round_end 为 `kind === "sub"` 新增一次 `announce()`（每个子代理 Round 结束一次；该序列有 3 个子会话 Round 结束，与提交渲染部分合并）。**每渲染级归因未做**，见 §6。 |
| `events` | 24 → 23 | 采样器的交付组合变化：`subagent_runtime` 读数交付随 P24 移除（1 次），其余交付计数相同（对照报告 "semantic deliveries" 段）。 |
| `file total` | 51 → 53 | **噪声列驱动**：该列把结算失败的调用也计入（本次并发序列多了 2 次被平台拒绝的发布 rename 重试），失败列本身已被 01 声明为重复运行就波动的项。成功计数（读/发布/锁/暂存/元数据/请求/绘制/事件）逐个相同。 |

噪声列（对照报告单独列出，不比较）：`failed by operation`、各序列 `wall clock ms`。01 声明这两个量在同一源状态的重复运行间波动，本次观察一致（如 `ms` 16 → 71 属并发序列的负载噪声）。

## 4. `P51` 复杂度对照（两版 tree 自身的 tracked TypeScript 行数）

| 面 | before (59a0ed7) | after (efb03e0) | 差 |
| --- | --- | --- | --- |
| **产品面**（framework + extensions + entrypoints） | **19287** | **23772** | **+4485（+23%）** |
| 证据面（tests + scripts，非产品代码） | 54806 | 79994 | +25188 |

产品面分层：`extensions/model-cost` 8537 → 10326（+1789，业务 + 接线）、`framework/adapters` 2571 → 3889（+1318，pi 适配器新增/`omp/subagents.ts` 移除）、`framework/modules` 1264 → 2244（+980，新增 `local-access.ts` 本机接入）、`framework/core` 2949 → 3248（+299）、`framework/behaviors` 2070 → 2142（+72）、`framework` 顶层 161 → 158、`entrypoints` 37 → 46、`extensions/{connect-bot,codebase-tools}` 1698 → 1719。

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
- **未逐步归因的项**：(a) 并发序列 draws 的 +2（机制可归属到 P24 新增的每子代理 Round 结束 `announce()`，但未定位到具体哪几次渲染被合并）；(b) 主子会话例 widget 绘制 33 → 18。两者都只涉及前端渲染次数。
- **只覆盖 OMP 侧的"同进程无 IPC"**：pi 的本机接入（管道发布/连接）按其设计存在，其行为由 P14/P16/P42/P56 的分区与真实 pi 冒烟覆盖；本票的记录器只注入 OMP dock 的宿主进程，未对 pi 宿主做同样的外部效果计数。
- **S1 采样不覆盖宿主原生半边**：OMP adapter 的原生事实映射、宿主自己的会话 JSONL/日志、真实终端绘制仍不可比（01 的 `notComparableScenarios` 原样保留）；本票用真实 OMP 宿主覆盖了其中的存储/请求/IPC/空闲部分，但不覆盖真实终端绘制与真实 provider 账户。
- **范围限制**：全部证据仅覆盖 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（未打补丁）、以及指向本机 capture endpoint 的 shipped DeepSeek provider；不推广到其他版本、POSIX、跨用户或真实账户。
- **迁移前 dock 对照的构造**：before 侧是把本票新增的测试文件与记录器复制进 `59a0ed7` 工作树后运行（该文件当时不存在）；两侧使用同一份测试文件与同一份 OMP 18.5.0 安装版本，故计数可比。after 侧表内 `ms`/失败列等噪声项不参与比较。

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
```

**交给人类验收者的材料**：`22-efficiency-after.json`（迁移后工件）、`logs/22-efficiency-comparison.txt`（对照表）、§3/§4 的差异与复杂度摘要、§5 的真实宿主外部效果计数。判断项：统一路径是否带来**明显额外开销**（本票观察到的可比成本差异只有并发序列的一次已结算请求刷新与前端渲染次数）以及**显著复杂度增加**（产品面 +4485 行 / +23%，其中 pi 接线与适配器是新增能力自身）。

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
