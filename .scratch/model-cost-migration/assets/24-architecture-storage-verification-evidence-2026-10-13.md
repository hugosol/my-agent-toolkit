# 24 — 生产架构清理与完整持久化验证：自动证据与材料准备

Ticket: [`implementation/24-architecture-storage-verification.md`](../implementation/24-architecture-storage-verification.md)（Delivers **P52**、**P68**）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明、不是真实 provider 结果，也不是人工验收。

## 本次改了什么

| 位置 | 内容 |
| --- | --- |
| [`host-patches/omp-18.5.0-viewed-session-codex-response/`](../../../host-patches/omp-18.5.0-viewed-session-codex-response/)（新：`record.json` + `README.md`） | **组合 artifact**：01 的 viewed-session patch 与 13 的 codex-response-boundary patch 在**同一安装**上的一条链。`record.json` 由共享物化器实测写出：两条 patch 的 sha256、全部 **9** 个文件（8＋1）的 pre/post sha256、两条可复现 apply 命令；不是把两份报告合并 |
| [`tests/harness-dock/host-patch-artifact.ts`](../../../tests/harness-dock/host-patch-artifact.ts) | 物化器由「单 patch」推广为「patch 链」：每步自带 patchRoot，逐步读取该步 apply 前的字节、逐步 `git apply`、逐步核对；记录形状统一为 `patches: [...]`（无单/多 patch 双轨） |
| [`tests/harness-dock/combined-host-harness.ts`](../../../tests/harness-dock/combined-host-harness.ts)（新） | 组合 artifact 的名称、record 与 `ensureCombinedHostHarness()`（复用共享物化器，不另建验证框架） |
| [`tests/harness-dock/combined-host-artifact.test.ts`](../../../tests/harness-dock/combined-host-artifact.test.ts)（新，5 例） | 链上每一步 `toEqual` 各自单 patch record 的条目（组合不重钉任何一份 record）；每步 pre-patch 字节等于未打补丁安装自己的字节；物化 host 等于两份 patch 的 post-patch 字节；未打补丁安装两个行为都没有 |
| [`tests/harness-dock/model-cost-persistence.test.ts`](../../../tests/harness-dock/model-cost-persistence.test.ts)（新，4 例） | P52 跨文档合同，在组合 host 的真实 loader／RPC 上：生产写出 → 独立 schema 校验 → 重启恢复 → 归档 → estimate 保护 → 父未先保存；同一进程内两个补丁行为同时在线 |
| [`tests/harness-dock/baseline.ts`](../../../tests/harness-dock/baseline.ts)、[`baseline.test.ts`](../../../tests/harness-dock/baseline.test.ts) | `verifyArtifactByteIdentity` 改为比对**记录 revision 自身的 blob 字节**（`git cat-file blob <commit>:<path>`），新增 `readRevisionFile()`；`readCheckoutCommit()` 可解析任意 ref；anchor 用例改为「checkout 仍携带该 revision、其自身 manifest 声明记录版本、tag 与 commit 同指」，不再要求 sibling HEAD 等于 anchor |
| [`tests/harness-dock/model-cost-balance.test.ts`](../../../tests/harness-dock/model-cost-balance.test.ts) | `storageFiles()` 遍历容忍「原子发布中被 rename 走」的临时文档（ENOENT）；发布落地的那份就是 target，同一遍历会读它 |
| [`tests/framework/import-boundary.test.ts`](../../../tests/framework/import-boundary.test.ts) | 同一模块图告警的**反方向**：`framework/**` 不得导入任何 `extensions/**`（原有 C1 告警保留：共享源码不得导入 harness 包／native 逃生舱只出现在 adapter 与 harness 装配） |
| 既有 artifact 的迁移 | `viewed-session-harness.ts`、`codex-response-harness.ts`、两个单 patch 的 `record.json`、`codex-response-artifact.test.ts`、`viewed-session.test.ts` 迁到链形状：**哈希一字未改**，只改容器与访问点 |

**没有**新增 DI／扫描／注册／配置体系，没有通用业务 State，没有测试专属 seam；组合 artifact 复用既有物化器，P52 用例复用既有 dock（`createRunRoot`／`ControlledSession`／`capture-server`／真实 loader）。

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑（本票用例／已运行检查） |
| --- | --- |
| 本票是 P52 完整验证 owner；06/14/19 贡献活动消费、estimate 和归档生产路径，在全部已实现路径上写完整合同测试，不重复认领各贡献票业务用例 | 见下「P52 覆盖表」；本票用例只做**跨文档**合同，各贡献票业务用例仍在 `tests/model-cost/storage-processes.test.ts`（06）、`codex-estimate.test.ts`（14）、`period-switch.test.ts`（19），未改动也未重复 |
| 通过生产写出、独立 schema 检查及重启恢复核对根/Session/自身四 token 桶/币种/版本、父未先保存、唯一归档拒覆盖与独立 estimate 保护 | `model-cost-persistence.test.ts`：①根（`schemaVersion`/`periodId`/`start`/`holiday`/`harnesses`）②Session（`id`/`name`/`parent`/`saveVersion`/`own`）③自身四桶逐字等于端点脚本 usage 的独立字面（`input`＝报告 `input_tokens` 减 cached）④币种（DeepSeek 货币路径 `costCny > 0`；Codex 额度路径不写 CNY 金额）⑤版本（`saveVersion` 跨重启 +1、四桶按请求数累加）⑥父未先保存（子记录已在盘、父尚未有，且子已写 `parent`）⑦归档唯一且不被覆盖（两次 close → 两个不同名、第一份字节不变；「较早归档不被后续 switch 取代」另有 19 的 S2 用例）⑧estimate 保护（两次 close 前后字节一致） |
| 拒绝新增 Turn/Round 账本、recentRound、历史价格、费用分项、账号键或重复权威 total；consumer-visible 读回保证正确，不用只扫描源码文本代替文档语义 | 独立校验器按**逐层精确键集**读回（未定义键即失败），不搜索已知残留名；三份文档各自有批准形状（活动／归档／estimate），存储根 JSON 文件集合精确等于 `{consumption.json, codex-usage-estimate.json, archives/<name>.json}` — 没有第二份账本文件。**故障注入**（见下）证明该检查对「记录里多一个权威 total」真会失败 |
| 公共调用方复用同一工厂/语义/HTTP/文件路径，framework 不依赖扩展，shared logic 不导入 native，HTTP/文件不依赖 adapter，前端不做业务调度 | 已运行的结构检查（见「结构性检查」）：`framework/**` 导入 `extensions/**` 的 specifier 0 处；`extensions/*/shared-logic/**` 导入 `adapters/`／`harnesses/` 0 处；`framework/modules/*.ts` 导入 `adapters/` 0 处；model-cost／connect-bot 的 harness 装配只导入 adapter（逃生舱）、`framework/public`、扩展自己的 shared-logic 与 node 内建；`import-boundary.test.ts` 的新反方向断言 0 命中 |
| 清理剩余旧生产装配/派发/传输类型和兼容双轨，不新建 DI/扫描/注册/配置体系或通用业务 State；清理不能把之前票留成不可运行半成品 | 已运行：`PushTransport`／`installPushTransport`／`setPushTransportForTest`／`platformTransport`／`blanket` 在 framework/extensions/entrypoints/tests/scripts 共 0 命中；harness 装配里 `events:{`／`actions:{` 仅 1 命中，是当前公共 `SubscriptionGroup`（`scope: "owner", events: {...}`）而非旧装配形状。两个单 patch artifact 的 record／suite 与两个消费者分区在迁移后仍真实运行（见命令表） |
| 执行既有 native import 责任检查和真实公共消费者集成行为，证明现有两消费者仍可用；P58 tests owner 仍为 22/23 | `bun test tests/framework/import-boundary.test.ts` 4 pass（含 C1 原有 3 条）；`bun test tests/connect-bot` 144 pass / 0 fail（真实 loader／RPC／真实 panel，22 的分区）；`bun test tests/codebase-tools` 24 pass / 0 fail（23 的分区）。P58 整体仍归 22／23，本票只跑不改，不重复认领其业务用例，也不为 P58 增加任何人工门禁 |
| P52 检查通过只证明持久合同，P68 检查通过只证明本次责任/统一路径，不替代真实 provider/视觉人工确认或自动扩大支持声明 | 见下「未验证／限度」：H1／H2 仍属原 Coverage 持有票；本票不新增人工项，不提升支持版本（仍 18.5.0），组合 artifact 是本地 artifact、未并入任何上游 checkout |
| 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | 观察面：S5（隔离真实宿主：真实 loader／RPC／stderr／真实存储文件）＋ S2（组合用例的文档语义）。预期全部是本文件自己的字面值或合同条文：端点脚本 usage、两份 Codex 报告的 `(70−10)/(30−20)=6`、边界余额 `12.50`、`usageOfRequests()` 的按请求累加；无一处调用被测实现重算。远端网络（DeepSeek 余额、Codex 额度）全部是 dock 本地 capture endpoint |
| 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作 | 每个用例一个组合前缀 + `createRunRoot`（agent-state／sessions／work／captures）+ `mkdtemp` 的隔离 user-home（`~/`→`.omp/cost-archive`）；provider 覆盖只写运行自己的 `models.yml`；未读写 `~/.omp` 正式配置、未触碰正在运行的 OMP。异步失败：保存／estimate 写入都按「文档内容达到期望」等待并有截止；归档名冲突分支见「未验证／限度」 |

## P52 覆盖表（本票 ownership）

| Coverage item | 贡献票 | 本票的支撑用例 |
| --- | --- | --- |
| 活动文档 schema、Session 自身四桶/币种/版本及父未先保存 | 06 | `model-cost-persistence.test.ts`：①「one root holds the approved activity document and the independent estimate…」（schema＋四桶＋币种＋版本）②「a period close archives the whole file it closes…」（跨 provider 整文件、新周期空、币种）③「a subagent's own record is saved before its parent's…」（父未先保存） |
| 独立 estimate 文档及其重启恢复 | 14 | ①「…and the independent estimate…」（独立文件、批准形状、baseline 即刻落地）③「a later process reads both documents back and continues from them」（重启后从文档 baseline 继续测量并写出 ratio 6；两文档都无不可用基线通知） |
| 唯一归档拒覆盖、reset 保护 estimate | 19 | ②「a period close archives the whole file…」（两次 close：两个不同名、第一份字节不变、第二份归档正是第一次 close 发布的那份空周期；两次 close 前后 estimate 字节一致） |
| 组合恢复、无账本/重复权威总数 | 06、14、19 | ③（同一 storage root 组合恢复：活动文档续版本、estimate 续测量、根文件集合精确）＋ ①②③④ 的精确键集校验与根文件集合（无账本文件、无重复权威 total） |

## 实际运行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 0 errors（每次改动后运行，含 tests 与 scripts） |
| `bun test tests/harness-dock/combined-host-artifact.test.ts` | **5 pass / 0 fail**（45 expect，7.6–28s；首次运行写出 `record.json`） |
| `bun test tests/harness-dock/model-cost-persistence.test.ts` | **4 pass / 0 fail**（85 expect，11.4s） |
| `bun test tests/harness-dock/codex-response-artifact.test.ts tests/harness-dock/viewed-session.test.ts` | **10 pass / 0 fail**（74 expect，0.05s；链形状迁移后两个单 patch artifact 仍按各自 record 校验） |
| `bun test tests/framework/import-boundary.test.ts` | **4 pass / 0 fail**（22 expect） |
| `bun test tests/model-cost` | **266 pass / 0 fail**（1156 expect，22 files，3.1s） |
| `bun test tests/framework` | **386 pass / 0 fail**（2006 expect，32 files，39.1s） |
| `bun test tests/codebase-tools` | **24 pass / 0 fail**（334 expect，7 files，42.7s；23 的分区） |
| `bun test tests/connect-bot` | **144 pass / 0 fail**（712 expect，19 files，76.9s；22 的分区，含真实 panel 与 native-session 边界扫描） |
| `bun test tests/harness-dock` | **79 pass / 0 fail**（864 expect，22 files，130.0s） |
| `bun test`（全仓，第 1 次） | **899 pass / 0 fail**（5072 expect，102 files，294.5s） |
| `bun test`（全仓，第 2 次，稳定性确认） | **899 pass / 0 fail**（5072 expect，102 files，297.7s；同样的 102 个文件、同样的 expect 数，无 ENOENT 竞态复发） |

改动前记录到的失败共 6 项，现在全部消失：两项 baseline anchor 漂移（由本票改为比对记录 revision 对象）、两项 connect-bot panel 历史窗口与一项 native-session 扫描命中 `widget.ts`（由 22 的改动修好，已在工作树；本票只运行其分区并如此记录，不认领其修法）、以及一项 balance 存储根遍历 ENOENT（由本票容忍原子发布的瞬态；随后两次全仓运行均无复发）。

## 结构性检查（非运行时观察，逐条已运行）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| framework 不依赖任何扩展 | `grep -rn "from \"[^\"]*extensions/\|import(\"[^\"]*extensions/" framework/ --include=*.ts \| wc -l` | **0** |
| shared logic 不导入 adapter／harness 装配 | `grep -rn "adapters/\|harnesses/" extensions/*/shared-logic/ --include=*.ts \| wc -l` | **0** |
| HTTP／文件模块不依赖 adapter | `grep -rn "adapters/" framework/modules/*.ts \| wc -l` | **0** |
| 无旧传输／旧装配／blanket gate 双轨 | `grep -rn "PushTransport\|installPushTransport\|setPushTransportForTest\|blanket\|platformTransport" framework extensions entrypoints tests scripts --include=*.ts \| wc -l` | **0** |
| harness 装配里没有旧 `events:`／`actions:` 形状 | `grep -rn "events:\s*{\|actions:\s*{" extensions/*/harnesses/*.ts` | **1**，是当前公共 `SubscriptionGroup`（connect-bot `scope: "owner", events: {...}`） |
| 前端不直接碰存储／文件（业务调度不在前端） | `grep -rn "ConsumptionStore\|updateFile\|readFile\|node:fs" extensions/model-cost/harnesses/ --include=*.ts \| wc -l` | **0** |
| 无重复 native 生命周期（承 21 的待办） | 去注释后全仓扫描 `session_shutdown`（framework／extensions／entrypoints）＋ `grep -n "releasingFrontendOnCleanup\|bound.bound" extensions/model-cost/harnesses/omp.ts` | 代码里只有 `framework/adapters/omp.ts` 一处（native 逃生舱）；model-cost 前端释放**只**经 binding 的唯一 `cleanup`（`releasingFrontendOnCleanup`），且只在 binding 被接纳（`bound.bound`）时挂接。`tests/connect-bot/native-session-boundary.test.ts` 的全仓断言在 connect-bot 分区（144 pass）里通过：连接扩展不再命名任何原生生命周期事件。剩下的 `pi.on("session_start"/"session_switch"/"session_branch")` 是前端**挂接**（把 widget 绑到宿主当前 session 的 ctx），不是第二条拆除路径 |

## 既有源码文字扫描用例的处置

本票按「不重钉旧内部形状」复看既有源码扫描用例，结论是**没有需要删除的残留形状用例**，理由逐条：

- [`tests/framework/import-boundary.test.ts`](../../../tests/framework/import-boundary.test.ts)：C1 模块图告警，**保留**（本票在其上加了反方向断言）；
- [`tests/connect-bot/native-session-boundary.test.ts`](../../../tests/connect-bot/native-session-boundary.test.ts)、[`native-timer-boundary.test.ts`](../../../tests/connect-bot/native-timer-boundary.test.ts)、[`no-panel-expiry.test.ts`](../../../tests/connect-bot/no-panel-expiry.test.ts)：每条都同时断言「扫描有主体」（assembly 里真的有 `session_end`／`ctx.setInterval`／…），并各有一条真实宿主的行为用例守着同一规则；主体仍然存在，不是旧形状的钉子；
- 22 已经删掉其分区里真正过时的形状断言（`init.signal`／`globalThis.fetch` 拦截式断言改成钉在**声明的** `timeoutMs`／`proxy` 上），本票没有重复其工作，也不回改。

## 故障注入（一次性，用来证明断言敏感，已还原）

在 `request-accounting.ts` 的 SessionRecord 构造处临时加入一个多余的权威字段 `total: 21`，再跑本票的 P52 用例：

- 结果：4 例全部失败，失败原因是**独立校验器**给出的 `harnesses.omp.sessions[0] carries keys the approved schema does not name: total`；
- 还原该行后重跑：4 pass / 0 fail。

也就是说该检查不是「扫源码文字」，而是真的在**文档语义**上拒绝新增的权威累计；`total` 只是我随手挑的一个名字，校验器不需要知道被拒绝的字段叫什么。

## 未验证／限度

- **P58 整体**仍归 22／23：本票只运行两个消费者分区（144／24 pass），不重复认领其业务用例，也不为 P58 发明任何无条件人工门禁（P58 只有原条件性 H3）。
- **真实 provider／视觉**：本票所有远端交互都是 dock 本地 capture endpoint 的脚本字面；DeepSeek 余额、Codex 额度的真实效果仍是各自票准备的 H2，TUI 视觉是 H1。本票不新增人工项，也不把「P52／P68 自动检查通过」当成这些人工项的替代。
- **归档名冲突分支**：`publishArchive` 的 `wx` 拒绝（「归档名已被占用，已有归档未被覆盖」）在随机名字下不可达，本会话没有稳定、无副作用地强制该分支（试过用 `bun:test` 的 `mock.module("node:crypto")` 强制同名：它能证明该分支，但模块 mock 在该 runner 里是进程级的，会污染其他 suite 的随机名——`tests/model-cost` 由 3s 变成挂起，故已删除该用例并如实记录）。**被它守护的语义**（较早归档永不被覆盖）已由两处独立观察覆盖：19 的 S2「an earlier archive is never replaced by a later switch」，以及本票在真实宿主上的「两次 close → 第一份字节不变」。
- **estimate 的 ratio 落盘节流**：本票只断言「baseline 即刻落盘」（第一份报告的字面窗口）与「重启后新实例的第一个合格配对立即落盘并给出 ratio 6」；「同一实例内 ratio 最多每分钟写一次」是 14 的 S2 用例（`codex-estimate.test.ts`），本票不重复。
- **07 evidence 的旧限度已被取代**：07 记录过「真实 RPC 会话不派发 `round_end`，隔离真实宿主里保存不可观察」（其 evidence 第 89／99 行）。该观察**不是当前状态**：本票的 `model-cost-persistence.test.ts` 在真实 loader／RPC 会话里等到两次 prompt 各自落盘（`saveVersion >= 2`）并读回四桶，证明保存点现在真实发生（08 的候选复查已实现）。本票不修改 07 的材料，只在自己的材料里如实标注该限度已过时。
- **币种标签**：仓库内不存在 JPY：`grep -rn "JPY\|日元"` 0 命中；维护数据声明 `currency: "CNY"`、`unit: "CNY/百万 token"`（`scripts/model-cost-data-smoke.ts` 校验），显示层 `formatCny`→`¥`、`formatUsd`→`$`（`presentation/display.ts`），本票用例读回的归档文本里 DeepSeek 记录为 `costCny: 0.01004`。Codex 额度路径不写 CNY 金额（本票断言 `costCny` 未定义）。11 的 retry 报告里「Cost: JPY」措辞与仓库内容不符；20 的标签核对仍归 20。
- **支持声明**：组合 artifact 是本地补丁 artifact，未并入任何上游 checkout，支持版本仍记录为 18.5.0（`framework/docs/harness-baseline.json` 未改）；anchor 校验改用记录 revision 对象**不提高**任何版本声明。
- **H1／H2 材料**：仍由原 Coverage 票持有（P11/P23/P26/P27/P36/P38/P39/P41/P65/P66/P67），本票不重建、不改写，也不因计划人工验收暂停已完成的自动工作。
