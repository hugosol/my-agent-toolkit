# 04：共同存储并发提交与只读同步（记录）

**本文件是本票交付的验证记录**：共同文件的并发提交、逐记录裁定、坏基线暂停、跨 harness 汇总与身份隔离，以及本票新增的「只读同步」入口（读取刷新采纳他人已提交文档）的实测证据。P32/P33/P34/P38/P39 的 Coverage 与 P57 的只读刷新项由本记录及下列测试认领；本文件不改承诺、不改 seam，也不重复认领后续票的条目。

- **入口（可重跑）**：`bun test tests/model-cost`（本票分区：含新增 `tests/model-cost/shared-storage-refresh.test.ts` 与扩写的 `consumption-store.test.ts`、`display.test.ts`、`storage-processes.test.ts`）、`bun run typecheck`、共同契约消费者 `bun test tests/framework`、以及基线入口 `bun run baseline:efficiency`（仪器消费者自查）。
- **源状态**：HEAD = `be96759`（`hyper/model-cost-pi-migration/04-shared-storage-...`，已合入 01）；本票改动未提交前的工作树差异仅为本记录列出的文件（见 §6）。OMP 补丁条件：本票不涉及宿主补丁，也不运行真实宿主；存储面与宿主无关。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2 / node 24.x；`bun install` 一次（该 worktree 原先无依赖）；无网络、无 provider 凭据、无 OMP/pi 安装。所有真实验证均为本机文件系统与真实独立进程。

## 1. 交付的行为（本票实现）

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 只读同步入口 `ConsumptionStore.synchronize()` | `shared-logic/consumption-store.ts` | 只读采纳文件当前文档：不取锁、不建临时文件、不发布；根无文档 → `absent`（保持既有基线，绝不当 fresh）；非本格式 → `unusable`（暂停，文件保持）；**读取本身失败 → `unreadable`（报告、不暂停、保留基线）**；已暂停 → `paused`（不再读文件）；有效文档 → `adopted{periodChanged, changed}`。未加载基线即调用属误用（与 `commit`/`reset` 同规则）。 |
| 周期聚合读取 `ConsumptionStore.periodSessions()` | 同上 | 返回**每个 harness** 的记录（按文档顺序）；harness 分区是身份命名空间，不是周期总量的过滤器。 |
| 运行期同步与对齐 `ModelCostRuntime.synchronize({feedback?})` | `shared-logic/runtime.ts` | 采纳后：换周期 → `periodSwitched()`（关闭周期的本地累计、Round 边界、Session span 一并丢弃，沿用既有 reset 语义）；同周期确有变化 → `announceChanged()`（否则零重绘）；两个基线故障各按原因只陈述一次；`cleanup()` 之后 → `closed`（不读文件、无效果）。 |
| 周期聚合接线 | `runtime.ts` / `presentation/display.ts` | accrued 读数改读 `periodSessions()`；`PeriodDisplaySource.sessions()` 文档改为「每个 harness 的、按文档顺序」。 |
| 术语 | `GLOSSARY.md` | 新增「Read-only synchronization（只读同步）」；Accrued 分段条补明跨 harness 归属。 |

`periodSessions()` 只被周期聚合读数使用；会话树、身份、版本链、ledger 播种仍走 `sessions(harness)`（本票未放松 P39/P40）。

## 2. P32 — 并发提交不覆盖、不丢在途、逐记录裁定

**真实独立进程**（`storage-processes.test.ts`，每个子进程跑生产 runtime + 框架配置读取 + 框架 `updateFile` 与跨进程锁；子进程以 `--preload scripts/support/efficiency-baseline-fs-instrument.ts` 启动，自行报告针对本文档的调用计数）：

- 4 个进程同时提交：2 个新会话（有效）、1 个与磁盘同版本异内容（冲突）、1 个旧版本。结果：`saved×2 / conflict×1 / stale-version×1`；**每个进程的被拒绝项发布数 = 0、被接受项发布数 = 1、读文档次数 = 2**（基线 1 + 协调区内重读 1）——即拒绝项不自动重试、失败不伪称落盘，而这些由**调用次数**而非文件取值证明。文件最终恰好三条被接受记录，被拒快照的版本/名字/金额都不在文件里。
- 并发（`startAt` 对齐）提交 6 个会话、同版本冲突 4 进程、旧版本单进程、空根双进程共享首个周期：全部在既有用例中通过（本次全分区重跑）。
- 在途增量：`consumption-store.test.ts` 一次性提交 4 条（旧版本 + 两条新增 + 被拒会话的下一个版本），逐条返回 `stale-version/saved/saved/saved`，文件正好是被接受的三条。

**发布失败**（win32 独有注入）：父进程持有文档句柄（本平台拒绝对被占用名字做 rename，EPERM → 框架有界重试 6 次后报 `io`）。子进程回答 `{kind:"failed", failure:"io"}`、发布数 0、文件字节不变；释放句柄后**下一个新进程**正常保存同一记录（发布数 1），文件只有这两个记录、根目录只有 `consumption.json`（无锁、无暂存、无半写）。**POSIX 未覆盖**：该注入依赖 win32 对打开句柄的 rename 拒绝，POSIX 下 rename 会成功；见 §5。

## 3. P33 / P57 只读刷新项 — 只采纳已保存、不迫使在途落盘

**真实独立进程 + 调用次数 + 文件前后内容**（`storage-processes.test.ts`）：写进程先提交自己的会话；读进程启动后被父进程用 ready/go 会合点停在「初始化已完成」处，父进程再写入另一进程的提交，读进程随后执行一次 `synchronize()`：

- 回答 `{kind:"adopted", periodChanged:false, changed:true}`，`heldSessions = ["session-written","session-late"]`（采纳可见），通知为空。
- **针对本文档的调用计数 = 读 2（初始化 1 + 同步 1）、发布 0、锁操作 0**；同步后文件与另一进程发布的**字节完全一致**（同一进程的 `fs` 仪器 + 字节对照，而不是只比数值）。
- 计数可信性自查：同一子进程在**不带 preload** 时回答 `not-instrumented`（整条用例失败），带 preload 时才报告计数——零发布不会被「无仪器」冒充。

**装配后的运行期语义**（`shared-storage-refresh.test.ts`，生产 runtime + 真实文件）：

- 另一进程提交的记录在同周期内被采纳后立即出现在 `view.own/identity` 与展示读数里，而本实例**在途**请求（未到 round_end）仍在内存中、文件里没有它；同步前后文件字节一致、通知为空。
- 外部切周期：文档换成新 generation → `periodChanged:true`，本实例的 ledger、Round 边界与 Session span 全部丢弃；随后 round_end **不产生任何写入**（文件保持新周期文档字节不变），关闭周期的消费没有带进新周期。
- 同文档再同步 → `changed:false`，订阅者收到 **0 次**通知（不产生无谓重绘）。
- 完成提示只是提示：同步只采纳文件已保存记录，未保存的会话记录不会因此出现（用例断言文件字节与实例读数两处）。

## 4. P34 — 坏基线暂停、保留文件、不反复修复、provider 不受影响

| 场景 | 实测 |
| --- | --- |
| 初始化：目标不可读（名字处是目录） | `load()` → `unusable`（reason 含「无法读取」）、`pauseReason` 有值、`period()` 空、`commit` → `paused`、名字与目录内容保持（`consumption-store.test.ts`） |
| 初始化：非 JSON / 非本 schema / 旧格式 | 既有用例通过（`consumption-store.test.ts`、`storage-processes.test.ts`：通知含文件路径、文件字节不变、根目录只有 `consumption.json`） |
| 运行期：文档损坏（非 JSON） | `synchronize()` → `unusable` → 暂停；通知只陈述一次；再次同步回答 `paused`（把目标换成目录即可证明**没有再次读文件**）；文件字节保持、无锁无暂存；实例不再拥有任何消费读数（`shared-storage-refresh.test.ts`） |
| 运行期：目标不可读 | `synchronize()` → `unreadable` → 报告（含文件路径）但**不暂停**，既有基线继续可用；目标恢复为文档后下一次同步采纳（同上） |
| provider 仍可用（装配后真实操作） | 暂停之后、成功 TTL 过期时提交一次 `deepseek` 请求：**真实发起一次余额查询**（替代传输上计数），地址按既定规则（base 去尾 `/v1` + `/user/balance`），读数被接受；暂停不因 provider 事实而解除（同上） |
| 下次正常初始化才重建基线 | 既有用例：修好文件后再次 `load()` → 清除暂停并继续提交；本票新增的 `unreadable` 用例证明瞬时可读故障不会提前暂停。|

**口径说明（需人工/主代理复核的一条判断）**：「运行期不可读」在本票实现里区分为两类——文件内容不是本格式（含非 JSON）→ **暂停**；读文件本身抛错（I/O，含瞬时的占用/权限）→ **报告且不暂停**。后者与同一文件的**提交路径既有已批准行为**一致（`session-recovery.test.ts` 的「target that cannot be read」用例：报告 `failed`、基线保留、下一次继续），也避免把一次瞬时读失败升级成只有下一次初始化才能清除的持久故障（research/04-refresh-trigger-facts.md §1.6 的理由 1）。若验收要求「任何运行期读取失败都必须暂停」，则需要修改提交路径的同一分类并迁移其既有断言——本票未做该改动，作为判断点上报。

## 5. P38 / P39 — 跨 harness 汇总与身份隔离

- **S2（展示读数，`display.test.ts`）**：一份两 harness（本 harness + `other-harness`）字面量文档 → `accrued()` = `{totalCny: 0.875, sessionCostsCny: [0.5, 0.25, 0.125]}`（三处手算字面量，顺序即文档顺序）；同一目标自身的树仍只含本 harness 的会话（0.5/1000 tokens）。另有用例：本会话有未提交请求时 accrual 仍等于磁盘已保存值（不重复加、也不提前加），提交落地后同一会话只有一段份额（0.5+0.0105，按双精度容差对照手算值）。
- **S3（真实进程，`storage-processes.test.ts`）**：omp 与 pi 两进程共用一份文档，**同一 session id** 各自持有记录：omp `parent=null, v1`，pi `parent="pi-parent", v9`（另有一条 pi 自己的会话）。三处提交全部 `saved`；文件内两个分区的记录各自保持（含直接父与消费）；随后 omp 进程提交同一 id 的 **v2**（远低于 pi 的 v9）仍 `saved`——版本与身份在分区内判定，pi 分区**逐字段不变**。同一进程报告：`heldSessions = ["session-shared"]`（本分区一条）而 `periodSessions` 排序后 = `["pi-only","session-shared","session-shared"]`（周期读取含两 harness）。
- **S3（store 层，`consumption-store.test.ts`）**：同一 id/两分区下，omp 的版本不会被 pi 的高版本拒绝；pi 同版本同内容为 `unchanged`、同版本异内容为 `conflict`；任一提交只重写自己分区的记录。

## 6. 命令、结果与证据归属

```
$ bun install                                  # 该 worktree 原先无依赖
$ bun run typecheck                            # tsc --noEmit，无输出（通过）
$ bun test tests/model-cost                    # 376 pass / 0 fail（28 files, 1917 expect）
$ bun test tests/framework                     # 378 pass / 0 fail（共同契约消费者；本票未改 framework 源码）
$ bun run baseline:efficiency --label ticket-04-consumer-check
sequence                   events reads pubs locks stage  meta  dirs other  fail   req draws     ms  invariants
main-request                    6     3     1     7      2      1     1     0     6      1     8     24 ok
multi-turn                     14     3     1     7      2      1     1     0     6      1    16      7 ok
main-child-concurrency         24     6     4    28      8      4     1     0    16      1    30     43 ok
save-onto-shared-document       6     3     1     7      2      1     1     0     4      1     8      9 ok
read-only-refresh               6     0     0     0      0      0     0     0     0      1     8      3 ok
healthy-idle                    6     3     1     7      2      1     1     0     6      1     8   3006 ok
disposal                       10     3     1     7      2      1     1     0     6      1     9    508 ok
instrument probe: {"operations":13,"documentReads":2,"documentPublishes":1,"lockOperations":7,"stagingOperations":2,"syncOperations":1}
every invariant held.
```

- 基线入口在本票的仪器扩展（新增导出 `namespaceInstrumented`）之上仍逐条成立；`read-only-refresh` 序列依旧是 0 文件操作、0 请求——本票的周期聚合接线没有给只读路径增加任何 I/O，**01 冻结的读数无需改写**。只读同步本身是新能力，其代价已由本票实测（每次采纳 = 1 次文档读、0 锁、0 发布），交给 [22](22-efficiency-acceptance.md) 做前后对照；基线脚本的 `read-only-refresh` 序列未调用该入口，因此 01 的工件仍是可比基点。
- 真实独立进程的子进程报告（本票新增字段）：`fsOperations{reads,publishes,locks}`、`syncs`（每次同步的回答）、`heldSessions`/`periodSessions`；`instrumented:true` 的计划若未带 preload 则回答 `not-instrumented`（自查，见 §3）。
- 改动文件：`extensions/model-cost/shared-logic/{consumption-store,runtime}.ts`、`presentation/display.ts`、`extensions/model-cost/GLOSSARY.md`、`scripts/support/efficiency-baseline-fs-instrument.ts`（+`namespaceInstrumented`）、`tests/model-cost/{consumption-store,display,storage-processes}.test.ts`、`tests/model-cost/support/store-child.ts`、新增 `tests/model-cost/shared-storage-refresh.test.ts`、`tests/model-cost/support/store-child-runner.ts`（子进程启动器，从 `storage-processes.test.ts` 抽出共用）。
- `tests/model-cost/storage-processes.test.ts` 的既有 `runChild` 抽到 `support/store-child-runner.ts` 后，12 条既有用例逐条重跑通过（含 home 隔离、别名目录、旧版本文档等）。

### 故障注入（每条注入后立即还原并复跑绿）

| 注入 | 结果 |
| --- | --- |
| A：`synchronize()` 采纳后不 `#adopt` | 4 条失败（store 2 条 + 运行期 2 条 P33 用例） |
| B：`synchronize()` 顺手 `updateFile` 重发它刚采纳的文档 | 仅 1 条失败——**真实进程的调用计数用例**（发布 0 → 1）；进程内字节对照没有察觉，正是 P57 要求以调用次数而非取值取证的原因 |
| C：周期变化不再 `periodSwitched()`（只 notify） | 1 条失败：外部切周期用例（关闭周期累计未丢弃、round_end 会把旧数据带进新周期） |
| F：提交忽略 harness 分区（固定写 omp 桶） | 3 条失败（store 2 条 + 真实进程 1 条 P39） |
| G：被拒绝项自动重试一次（回答前多读一次文件） | 1 条失败：真实进程批量用例（读计数 2 → 3） |
| H：任何采纳都丢弃本地累计 | 2 条失败：在途保护用例 |
| P38：周期读数改回按 harness 过滤 | 1 条失败：跨 harness accrual 用例 |

## 7. 未覆盖 / 未验证

1. **POSIX**：发布失败注入是 win32 事实（rename 拒绝被占用名字）；POSIX 上该注入不成立，未验证。跨平台存储行为其余部分（锁目录、原子发布、真实进程并发）在 win32 实测，POSIX 未运行。
2. **触发接线未接入生产**：`runtime.synchronize()` 是能力入口，本票不新增订阅；把「第三方完成提示 / 进程终结点」接成触发点属于实际装配与子代理事实落点（[05](05-subagent-facts.md)、[06](06-local-process-connection.md)、[20](20-assembly-lifecycle.md)）。因此本票的 P33 证据止于「入口 + 装配后运行期语义 + 真实跨进程文件」，不声称 pi 侧事件链已通。同理，`46` 的「无事件可暂显上次结果」仍成立：没有调用方时不存在任何轮询或读盘。
3. **真实 OMP 宿主**：本票不运行真实宿主（存储面与宿主无关）。`tests/harness-dock` 为真实宿主消费者，本次已启动运行，结果另行记录在 §8；如需真实 TUI/终端读数，属 [23](23-tui-acceptance.md)。
4. **provider 真实账户**：本票只验证「暂停不阻断 provider 操作」的协议路径（替代传输计数），真实账户侧核对属 P53 / [24](24-provider-account-acceptance.md)。
5. **写入权限的更广图景**：本票验证「提交只更新本分区记录、跨分区互不影响」；跨用户/跨权限文件系统（只读目录、ACL）未验证。
6. **口径判断点**：§4 的「运行期不可读 → 报告不暂停」见上，需人工/主代理确认是否与验收意图一致。

## 8. 附：dock 消费者运行（本 worktree 受阻，原因与本票无关）

`bun test tests/harness-dock` 本次运行：**45 pass / 12 fail**，全部失败发生在**装配阶段**、且都在同一处：

```
error: C:\...\host-patches\omp-18.5.0-viewed-session\patch.diff touches no file
  at ensurePatchArtifact (tests/harness-dock/host-patch-artifact.ts:224)
  at ensureViewedSessionHarness (...)
```

**原因（独立探针，本票改动无关）**：该 worktree 以 **CRLF** 检出 `host-patches/**/patch.diff`（`core.autocrlf`，仓库无 `.gitattributes`），而 dock 自己的解析器按 `"\n"` 切分、正则 `^diff --git a/(.+?) b/(.+)$` 的行尾残留 `\r`（`.` 不匹配 `\r`）→ 一个文件都匹配不到。同一探针把行尾规范化为 LF 后立刻得到 8 个文件：

```
$ bun .cache/scratch-04/probe4.ts     # 临时探针，未提交
CRLF as checked out: 0 files; LF normalised: 8 files
first LF-file: src/extensibility/extensions/index.ts
```

即：**这不是本票行为导致的失败**（本票未改 `tests/harness-dock/**` 与 `host-patches/**`，失败发生在任何 model-cost 行为运行之前的宿主补丁物化阶段）。它会影响任何在 Windows 上以 CRLF 检出运行 dock 的票，建议由装配/宿主验证票（[20](20-assembly-lifecycle.md)/[21](21-consumer-regression.md)）以 `.gitattributes`（如 `*.diff -text`）或按行尾鲁棒的解析修正，本票不越界修改。真实 OMP 宿主上的存储/展示读数因此在本 worktree **未验证**——但存储面的本票承诺由真实独立进程与真实文件证据覆盖，不以宿主运行替代。
