# 18: 两端原生展示与实时 context

**What to build:** 两端原生绘制相同业务内容，在 brief/detail、代理树与适用宽度保留全部统计；context 来自所属会话公开当前读数，pi 不跟随 inspector，OMP 保留 Viewed 路径。

**Delivers:** P43, P44, P46

**Blocked by:** [08：一次记账与直接父 Session 汇总](08-session-accounting.md)、[11：累计活动耗时与旧值兼容](11-subagent-runtime.md)、[12：主会话 Session span 墙钟语义](12-session-span.md)、[13：DeepSeek 余额认证与刷新闭环](13-deepseek-balance.md)、[14：Codex 双窗口与独立比例估计](14-codex-allowance.md)、[16：耗时观测缺口与本周期完整性](16-runtime-gaps.md)、[17：budget 动作与入口展示偏好](17-budget-actions.md)

**Status:** in-progress — 实现已随集成提交 `df00a19c950d115846fe9d2f632d438eaa019ff3` 合入 `pi-adapter`；本轮集成验收在该提交上完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 的合入树全仓 `bun run test` → 1177 pass / 0 fail / exit 0）。票据自身的真实宿主、真实 TUI 与 OMP 消费端验收仍未完成，见实现报告与下方 Comments。

## Acceptance criteria

- [ ] 独立业务样例核对代理树、费用结构、预算条、Accrued、未知/不完整提示及 component/lines，两端实际运行，不要求像素相同。
- [ ] context 与独立公开读数及其模型对照，覆盖 null、无显示预算和窗口故意不同于固定预算；不从累计推导，不落消费文档。
- [ ] 树按直接父缩进及各深度独立对齐，名称回退、可靠启动快照与自身累计保持正确，不新增父 Round 子消费。
- [ ] 实际适用查看/切换核对目标统计、context 和 Owner 不被改写；pi inspector 不切显示目标，OMP 保留可靠 Viewed；未覆盖真实切换不泛化支持。
- [ ] 内容与布局自动检查随本票完成；真实正常/窄宽度观感由 23 取得人类确认。
- [ ] **P43 完整 Coverage（S2）**：同一独立业务样例核对 brief/detail、代理树、费用结构、预算条、Accrued、未知/不完整提示，分别运行 component/lines 和适用宽度；不要求像素一致。人类可读性见 P52。
- [ ] **P44 完整 Coverage（S2、S3）**：与独立公开 context 读数及其模型对照；null 未知、模式无预算无字段、当前窗口故意不同于显示预算，核对未从累计推导且不落消费文档。
- [ ] **P46 完整 Coverage（S1、S2）**：分别运行适用查看/切换场景，核对目标自身 context/统计与 Owner 不被改写；不按来源或名称推断 Viewed。未覆盖的真实会话切换不得泛化认证。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **集成同步（本轮由集成 helper 执行；本票实现提交 `acd18d2`，结果 HEAD `df00a19c950d115846fe9d2f632d438eaa019ff3`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交合回本分支，故本分支 HEAD 即 `df00a19`，且与 `pi-adapter` 同一提交、同一 tree（`8a69ece0aa0fd26192b23fb5bd0c1494b0015945`）。`df00a19` 的父为 `1c543d6`（合并前集成 tip）与 `acd18d2`（本票实现提交，父为 `506a445`＝17 轮集成 tip）。**无冲突可解**：`git ls-files -u` 0 条，gitdir 内无 `MERGE_HEAD`／rebase／cherry-pick 状态。**合入内容逐项核对**：`git diff --stat 1c543d6 HEAD` 与 `git diff --stat 506a445 acd18d2` 逐项相同（6 files / 1995 insertions / 76 deletions），反方向只剩其他轮次记录与 `tests/harness-dock/model-cost-session-span.test.ts`（7 行，来自 16 轮去抖），本票 6 个文件字节未变。
- **本轮集成验收（HEAD `df00a19`）**：`bun run typecheck` → exit 0。按检出原样 `bun run test` → **1131 pass / 17 fail**（125 files / 1148 tests / 246.00s / exit 1），17 例全为本机环境前置项：5 例缺 `OMP_BOT_BINARY`（默认同级 `…\Temp\omp-bot\…\omp-bot.exe` 不存在）、10 例 CRLF 检出使 `host-patches/*/patch.diff` 判为「touches no file」、2 例 `bun.lock` 按 LF blob 录制（工作区为 CRLF 检出）。归一这三处工作区字节并设 `OMP_BOT_BINARY` 后 `bun run test` → **1177 pass / 0 fail**（125 files / 6740 expect() calls / 408.19s / exit 0）；多出的 29 例正是 10 个 dock 文件在文件级失败后未注册的用例，与 17 轮一致。四个隔离前缀（`.cache/omp-baseline/18.5.0` 及其三个补丁工件）在该轮物化并校验通过。
- **本轮修复：无源码修复。** 无一条失败由本票合入引入：本票 6 个文件与全部失败文件（`tests/connect-bot/**`、`tests/harness-dock/**`）交集为空；归一后零失败说明没有失败被环境例掩盖，故不改仓库内容。本票的进程内消费者 `tests/model-cost` 全分区（含本票新增 `pi-presentation` 12 例与 `pi-session-context` 3 例）在归一后的全仓运行中全绿。本轮提交只有 `evidence/18-native-presentation.md`、本文件与三份日志。
- **运行后状态**：三处归一文件按字节恢复原 CRLF 检出（`bun.lock` `e7ed487b…`、`viewed-session` `057e01f6…`、`codex-response-boundary` `294b3727…`），`git status` 只余本轮记录改动；未操作集成工作区、未切换分支、未新建 worktree、未 reset、未调用 retro，也未自行合入 `pi-adapter`。
- **未因全仓绿而改变的限制**：P43/P44/P46 的真实宿主半、真实 pi TUI component 形态与 OMP 消费端回归、docs 更新、fault-injection 复核与 `scripts/pi-native-presentation-smoke.ts` 均未在本轮完成（属实现与最终独立门禁）；实现报告记录的「装配级夹具在 `pi-session-context.test.ts` 中看不到 identity／period 记录」这一未定性发现原样保留，本票不得据此判为通过。
