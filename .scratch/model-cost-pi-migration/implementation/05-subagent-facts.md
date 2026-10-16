# 05: 真实子入口接入与可靠会话事实

**What to build:** 启用固定 nicobailon 后，子入口由 framework 集中实际加载，主子与嵌套会话的身份、直接父、Owner、名称和可靠启动快照能进入公共交付、统计及保存；接入失败明确诊断。

**Delivers:** P3, P11, P12, P13

**Blocked by:** [03：请求锚价与原生连续活动完整计费](03-request-pricing-rounds.md)、[04：共同存储并发提交与只读同步](04-shared-storage.md)

**Status:** in-progress — 实现已随集成提交 `304451ea6dd104d9ddc30284b72f178a8a5c49f7` 合入 `pi-adapter`；本轮集成验收在该提交上完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` 1076 pass / 0 fail），本轮修复与本记录提交尚未合入 `pi-adapter`。

## Acceptance criteria

- [ ] 固定 pi-subagents 0.78.0，使用公开 registerRequiredChildExtensions；识别、登记、事实转换、订阅和释放集中在 pi adapter 私有接入，不由扩展另建派发。
- [ ] 区分未启用、注册失败、身份不匹配和协议不可用；模式初始化完成后稳定，不按记录数量或自动热发现切换。
- [ ] 实际自主委派、嵌套、同名并发、后台、续跑、取消、历史继承与进程变化，对照独立取得的创建事实；不凭名称、深度、PID、执行句柄或 transcript 猜关系。
- [ ] 真实改名后核对同身份展示和下一次既有提交；新建、未知部分、恢复、fork、后续模型/级别变化不伪造或覆盖启动快照。
- [ ] 本票创建的登记与订阅随所属接入释放，旧句柄无效果；不把基本 cleanup 留给 20。
- [ ] **P3 完整 Coverage（S1、S2）**：区分未启用与注册失败、身份不匹配、协议不可用；观察明确诊断及接入结果，不把失败等同 false 或成功。
- [ ] **P11 完整 Coverage（S1、S2、S3）**：同名不同身份、直接父非 Owner、并发/后台/续跑/取消、历史继承及进程变化；对照实际创建关系与公共交付，不以名称、深度、PID 或执行句柄推断。
- [ ] **P12 完整 Coverage（S1、S2、S3）**：真实改名后核对对应身份的公共事实、展示及下一次既有提交后的记录；不创建新身份、不额外制造消费。
- [ ] **P13 完整 Coverage（S1、S2、S3）**：新建、未知部分、恢复、fork 继承历史、续跑及后续改模型/级别；独立核对启动事实，未知不借当前值，既有快照不覆写，随消费提交保存。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **集成同步（本轮由集成 helper 执行；本票 tip `d34e7f6`，结果 HEAD `304451e`）**：宿主把本票分支合进 `pi-adapter` 后，把该集成提交合回本票分支，故本分支 HEAD 即该集成提交，其父为 `5243da4`（前一集成 tip，已含 12/24 两条线）与 `d34e7f6`（本票实现提交）；本分支与集成分支指向同一提交（`git rev-parse HEAD pi-adapter` 两者相同），`git merge-base d34e7f6 5243da4` = `4d1f431`。**无冲突可解**：无 `MERGE_HEAD`/`MERGE_MSG`/rebase 状态目录（worktree gitdir 内逐一确认）、仓库内无冲突标记、`git status` 空（本票分支唯一的先前 WIP `2928430` 已被 `d34e7f6` 接续，未丢工作），故本轮无冲突修复、未改写历史。
- **合入内容逐项核对**：`git diff --stat 5243da4 304451e` = 21 files / 2690 insertions / 59 deletions，与本票实现报告的文件清单一致（`framework/adapters/pi.ts`、新增 `framework/adapters/pi/session.ts` 与 `framework/adapters/pi/nicobailon.ts`、`framework/core/protocol.ts`、`framework/core/assembly.ts`、`framework/behaviors/{binding,lifecycle}.ts`、`framework/adapters/omp.ts`、`framework/public.ts`、`extensions/model-cost/harnesses/pi.ts`、`tests/framework/{pi-session-facts,pi-subagent-integration}.test.ts`、`tests/framework/support/{pi-session-files,pi-surface-double}.ts`、`tests/harness-dock/fixtures/pi-session-facts/**`、`scripts/pi-subagent-smoke.ts`、`tests/model-cost/support/store-child.ts`、`package.json`/`bun.lock`、本票实现与证据文件）；本票自己的文件在合并树里与本票 tip 逐字节相同（`git diff --name-only d34e7f6 304451e -- <本票文件>` 为空），合并只是叠加 12/24 那两条线，没有回退任何一侧。集成工作区（`E:/Developer/myhub/my-agent-toolkit`）未被操作；未切换分支、未新建 worktree、未 reset、未丢弃工作、未调用 retro、未合入集成分支。
- **本轮集成验收（HEAD `304451e`，工作树只有本票改动）**：`bun run typecheck` → exit 0（无诊断）。`bun run test`（本机原始 CRLF 检出、未设 `OMP_BOT_BINARY`）→ **1030 pass / 17 fail**（114 files / 1047 tests / 5499 expect() calls / 211.29s / exit 1；日志 `.cache/integrate-05/fulltest-as-checked-out.log`）。17 例分两类：
  - **15 例是本机检出／布局前置项**，与本票改动无关，特征与 [02](02-pi-main-session.md)/[03](03-request-pricing-rounds.md)/[04](04-shared-storage.md)/[12](12-session-span.md)/[13](13-deepseek-balance.md)/[24](24-provider-account-acceptance.md) 各轮记录逐项一致：5 例 `tests/connect-bot/`（`budget-regression`、`harness-exit-budget`、`panel-registration-lifecycle` ×3）真实面板 interop 报 `the interop run needs the actual omp-bot panel, but no binary is at C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`（本 worktree 位于 `%TEMP%`，该默认同级路径不存在）；10 例 `tests/harness-dock/`（`codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、`model-cost-modes`、`model-cost-persistence`、`viewed-marker`、`viewed-session-host`、`viewed-session-total`、`viewed-session`）在本机 `core.autocrlf=true` 把 `host-patches/**/patch.diff` 检出成 CRLF（`i/lf w/crlf`）后报 `… touches no file`——已用本仓解析器直接复算：`patchTouchedFiles` 按 `\n` 切行，行尾的 CR 既不匹配 `(.+)`（JS 的 `.` 把 CR 当行终止符）、又使无 `m` 的 `$` 无法落在输入末尾，故 8 个 `diff --git` 头一个都匹配不上（matches 0），属行尾前置项而非本票内容。
  - **2 例是本票合入带来的真实不一致，本轮已修**：`baseline.test.ts`（`bun.lock: recorded 9e9f4833… but found a5d37ab…`）与 `session-driver.test.ts`（`verifyLockfile(record.sourceCombination.lockfile).matches`）。本票固定 `pi-subagents@0.78.0` 时改了 `bun.lock`（提交 `2928430`），而 `framework/docs/harness-baseline.json` 的 `sourceCombination.lockfile.sha256` 仍是 `9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9`——它逐字节等于 `git show 5243da4:bun.lock`（05 之前的锁文件），当前 `HEAD:bun.lock` 的 sha256 是 `a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6`。该两例与行尾无关：工作区 `bun.lock` 本就是 LF（`git ls-files --eol` = `i/lf w/lf`，工作树 sha256 与 blob 相同）。
- **本轮修复（唯一源码改动，一行）**：`framework/docs/harness-baseline.json` 的 `sourceCombination.lockfile.sha256` 刷成 `a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6`（即当前 `bun.lock` 的已提交 LF blob 字节，`git cat-file blob HEAD:bun.lock | sha256sum`），正是该测试自身 `REFRESH_HINT` 指明的「deliberate dependency change 后刷新 sourceCombination/oracle lockfile sha256」程序；oracle 侧（另一仓库的 `bun.lock`）未改、仍匹配。除该文件与本记录外本票分支无其它改动。
- **归一后的全仓回归**（两份 `patch.diff` 还原为已提交 LF blob 字节、`OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`；归一后工作树 sha256 与 `git cat-file blob HEAD:<path>` 逐一相同：`66195465cc0c…`（viewed-session）/ `4ec9ad0de31b…`（codex-response-boundary）/ `a5d37ab28396…`（`bun.lock`））：**1076 pass / 0 fail**（114 files / 6084 expect() calls / 393.34s / exit 0），`tests/harness-dock`、`tests/connect-bot`、`tests/model-cost`、`tests/framework`、`tests/codebase-tools` 全绿；日志 `.cache/integrate-05/fulltest-normalized.log`。该 0 fail 同时证明修复生效且没有失败被行尾前置项掩盖（未归一运行只记到 1047 tests，是因为那 15 例在文件级即失败、其余用例未计入；归一后为 1076 tests）。运行结束后两份被归一的文件按字节恢复运行前的 CRLF 检出（sha256 与运行前逐字节相同：`057e01f615c7…` / `294b37277539…`，`git ls-files --eol` 复现 `i/lf w/crlf`），工作树只余本轮那一处修复，未提交任何环境改动。
- **未验证／限制（交最终独立门禁与 [25](25-evidence-scope-audit.md)）**：本机 `core.autocrlf=true` 的 CRLF 检出与 `%TEMP%` 布局下的 `omp-bot.exe` 默认路径仍是本机环境事实，未以仓库改动修正（按 [04]/[24] 记录，`.gitattributes` 或按行尾鲁棒的解析属装配/宿主验证票）；本轮按分工未跑实机 smoke（`bun scripts/pi-subagent-smoke.ts`）、未跑付费调用、未做跨票据整体验收。实现报告记录的真实宿主阻塞点（默认前台委派在本进程内创建子会话 → 本扩展前端持有失效 ctx 后抛出、父 pi 进程退出，阻断 P11/P12/P13 的子会话公共交付与 smoke 其余阶段）仍原样成立，未因本轮全仓绿而改变。

