# 04: 共同存储并发提交与只读同步

**What to build:** 两个 harness 的进程能共享消费数据集，提交只更新有权保存的记录，读取同步不抢先提交本地消费；坏基线暂停记账但保持独立 provider 功能。

**Delivers:** P32, P33, P34, P38, P39, P57（P57 仅交付本票分区；不单独完成整个 P57）

**Test owner for:** P57（仅下方 coverage partition 指定条目）。

**Blocked by:** [01：冻结迁移前代表性效率基线](01-efficiency-baseline.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 沿既有 OMP 实际操作及真实独立进程验证共同文件，制造在途新增量、同版本冲突、旧版本、有效项混批和发布失败；有效项逐记录裁定且不自动重试拒绝项。
- [ ] 在同周期本地未提交累计、另进程保存、外部切周期及 detail/完成提示组合下，对照文件与显示，确认只采纳已保存数据且不迫使本地在途数据落盘。
- [ ] 初始化及运行期不可读、损坏、非法 schema 保留原文件、标记暂停且不反复修复；通过实际装配验证独立 provider 操作仍可用，正常下次初始化才重建基线。
- [ ] 用两个 harness 的独立字面量贡献核对总量、费用与 Accrued；同 id 不同父/版本/消费不混身份、父链、版本和写权。
- [ ] 本票拥有 P57 的只读刷新项：比较写入/发布调用次数与文件前后内容，而非仅比较数值；该项不由最终回归票重复认领。
- [ ] **P32 完整 Coverage（S2、S3）**：真实独立进程共用文件及确定性在途交错；核对有效项发布、旧版本/冲突分别拒绝、失败未伪称落盘、不自动重试拒绝项与新进程恢复。不能仅以内存锁证明互斥。
- [ ] **P33 完整 Coverage（S2、S3）**：另进程提交、detail 读刷新、同周期本地增量和外部周期切换组合；比较操作前后文件与显示，第三方完成提示不能让未提交记录提前出现。
- [ ] **P34 完整 Coverage（S2、S3）**：不可读、损坏、非法 schema 的初始化/运行期场景；核对文件保持、暂停标识、无反复修复、provider 仍可用及下次正常初始化才能重建基线。
- [ ] **P38 完整 Coverage（S2、S3）**：两个 harness 提供独立字面量记录，配合当前本地未提交数据对齐；核对总量与分段构成不被当前 harness 过滤，不重复加已观察/已保存记录。
- [ ] **P39 完整 Coverage（S2、S3）**：同 id 不同父/版本/消费的共同文档，分别提交与恢复；不影响另一分区，不因共享文件互斥而放松身份规则。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

### P57 — coverage partition

P57 跨票交付，下表按 Coverage item 唯一分配交付票与测试负责人；全部七项完成后 P57 才整体完成。各负责票必须实际观察外部效果，不能仅以 widget 数值不变代替。

| Coverage item | Ticket | Test owner |
|---|---|---|
| P4：无子代理 detail 提前返回 | [17：budget 动作与入口展示偏好](17-budget-actions.md) | 17 |
| P17：观察不扩大写权或 Owner 效果权限 | [07：Owner State 实时读取、降级与恢复](07-owner-state.md) | 07 |
| P33：只读刷新不提交在途消费 | [04：共同存储并发提交与只读同步](04-shared-storage.md) | 04 |
| P45：峰谷重绘无请求/记账/写盘 | [19：峰谷边界无副作用重绘](19-season-boundary.md) | 19 |
| P48：共享准备、工厂及根专属效果不重复 | [20：完整装配的共享准备与处置验证](20-assembly-lifecycle.md) | 20 |
| P49：处置后旧资源不再产生效果 | [20：完整装配的共享准备与处置验证](20-assembly-lifecycle.md) | 20 |
| P51：禁止的重复工作和健康空闲轮询不新增 | [22：效率前后对照与复杂度判断](22-efficiency-acceptance.md) | 22 |

## Comments

- **集成同步**（本轮由集成 helper 执行，起点 `3b3e8a41`，终点 `2ea7fee3`）：宿主已把集成提交 `2ea7fee31a3c3c0f11d9ad3d1e15a70bfd926637`（parents `5ad9af75` 集成 tip + 本票 tip `3b3e8a41`）合回本分支，本分支 HEAD 即该提交；`git status` 干净、无 `MERGE_HEAD`，`extensions/`、`framework/`、`entrypoints/`、`scripts/`、`tests/`、`docs/` 与本文件所在目录内均无冲突标记，故本轮无冲突可解、无需修复提交。集成分支此后又前进到 `79325364`（[13] 的 evidence、`implementation/02-pi-main-session.md`、smoke 与 `tests/harness-dock/capture-server.ts` 改动），属宿主排队合并的后续票，与本轮同步结论无关。集成工作区（`E:/Developer/myhub/my-agent-toolkit`）未被操作；未切换分支、未新建 worktree、未 reset、未丢弃提交、未调用 retro。
- **原始检出**：`bun run typecheck` → exit 0（无诊断）。`bun test` → 960 pass / 17 fail（107 files，241.8 s）。17 例全部是本机检出／布局前置项：12 例由 `core.autocrlf=true` 的 CRLF 检出引起（10 个 dock 文件在补丁物化期即报 `…/patch.diff touches no file`；`baseline.test.ts` 与 `session-driver.test.ts` 因录制 sha256 针对已提交的 LF blob 而失败），5 例是 `tests/connect-bot` 在 `%TEMP%` 布局下找不到同级 `omp-bot.exe`。
- **归一后的全仓回归**（两份 `patch.diff` 与 `bun.lock` 去 CR，去 CR 后 sha256 与 `git cat-file blob HEAD:<path>` 逐一相同；`OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：`bun test` → **1003 pass / 3 fail**（1006 tests / 107 files / 383.8 s）。分区读数：model-cost 376 pass、framework 378 pass、connect-bot 142 pass、codebase-tools 24 pass，dock 83 pass / 3 fail。
- **3 例失败的定位（本机宿主环境，与本票及本轮合入内容无关）**：全部在 `tests/harness-dock/session-ownership-tree.test.ts`（真实宿主），断言 `expect(run.capture.requests()).toHaveLength(5|7)` 实收 11|13，每例恰多 6 条。四条一手证据：
  1. 残存 run root `%TEMP%/omp-dock-ownership-tree-delegation-fBQ9B/captures/` 的 11 份请求体中，5 份是会话轮次（带 system-reminder 与工作目录），6 份只有 2 条消息（system + user），user 恰为 `State: <solution_space>one fixed answer, nothing open</solution_space> Answer with exactly one of: low, medium, high, xhigh. Do not execute this state; judge it only.`
  2. 录制安装自身即此路径：`@oh-my-pi/pi-coding-agent/src/task/agents.ts` 给 `task` agent `thinkingLevel: AUTO_THINKING`；`src/auto-thinking/classifier.ts` 按 `prompts/system/auto-thinking-solution-space-question.md` 经 live `judge` 角色链提问；`src/judgment/index.ts` 的 `withSessionFallback()` 在链中无 native 候选时把**会话模型**追加为 judge 候选。
  3. 该 run 的宿主日志（`<run root>/user-home/.omp/logs/omp.2026-10-14.27080.log`）：`judgment candidate failed candidate deepseek/deepseek-flash error: judgment "level": no option label in reply: "dock ownership reply"` 与 `auto-thinking: classification failed; using fallback level` —— judge 候选落到被 dock 重定向到 capture 端点的会话模型，而夹具固定应答不是等级答案。
  4. **无扩展对照**（未提交探针 `.cache/int-04-probe/host-classifier.test.ts`，用后已删）：同一录制安装、run root、capture 端点与 provider override，`extensions: []`（`--no-extensions` 且无 `-e`），一次委派一个子代 → `requests=6 judge=3 turns=3`（exit 0）。即本仓库任何代码都不在进程内时 judge 请求照样出现，每个 task 子代理轮次 3 条；本套件两个子代理 → +6，与实收差值完全一致。
  同一现象（同 3 例、同 11|13 vs 5|7、同宿主成因；另一棵 parked worktree 亦可复现；绿 run 的 `agent-state/models.db` 有 native `typesafe` 候选而红 run 只有在线候选）已由兄弟线 `hyper/model-cost-session-time-and-detail` 的 `evidence/07/dock-judge-chain-finding.md` 独立记录。本机当前 judge 链无 native 候选，而该套件的 5/7 条期望以「存在 native 候选」为前提。
- **处置**：本轮无冲突、无本票导致的失败，故无修复提交；归一属本机检出／环境条件而非仓库内容，不入库（沿用 01 轮约定）。每次运行后三份文件已按字节还原（`057e01f6…`、`294b3727…`、`7f5c82e6…`，与运行前逐一相同），`git status --porcelain` 为空；探针脚本已删除。
- **未验证/限制**：POSIX 未运行；未改动宿主 judge 链环境（不制造 native 候选以求绿），该 3 例在本机当前环境下可复现；真实 pi 宿主/终端与 provider 账户侧仍按各票证据的不可比清单，属后续门禁。
