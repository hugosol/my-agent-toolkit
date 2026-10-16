# 12: 主会话 Session span 墙钟语义

**What to build:** 主会话显示本周期首次输入至最近观察 Turn 结束的墙钟跨度，包含空闲间隔而不累计子耗时；恢复、fork 和周期变化保留各自边界。

**Delivers:** P28

**Blocked by:** [03：请求锚价与原生连续活动完整计费](03-request-pricing-rounds.md)、[04：共同存储并发提交与只读同步](04-shared-storage.md)

**Status:** in-progress — 实现已随集成提交 `30162967efb1808735a4b7da5a56f3b6f236fd53` 合入 `pi-adapter`；本轮集成验收在该提交上完成（`bun run typecheck` exit 0、全仓 `bun run test` 在归一检出与 `OMP_BOT_BINARY` 下 1037 pass / 0 fail），本轮的唯一修复（`75a1522`）与本记录提交尚未合入 `pi-adapter`。

## Acceptance criteria

- [ ] 独立时间轴覆盖输入、空闲、工具尾部、同会话恢复、fork 与新周期下一次输入；不把工具结束作为 Turn 结束。
- [ ] 准备两个子代理耗时明显不同于主会话跨度的独立数据，对照输出与恢复，确保三者不互相替代。
- [ ] 无需等待完整子代理耗时或后台终止路线；通过独立文档/受控周期切换验证重置边界，实际 clear/holiday 操作由 15 验证。
- [ ] **P28 完整 Coverage（S1、S2、S3）**：独立时间轴覆盖空闲、工具尾部、同会话恢复、fork 与重置；与两个子代理累计耗时设置明显不同数值，核对不互相替代。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- 集成同步（本轮由集成 helper 执行，起点 `36fd742`，终点 `30162967efb1808735a4b7da5a56f3b6f236fd53`）：宿主把集成分支 `pi-adapter` 合并本票分支所得的集成提交 FF 回本分支（reflog：`merge 30162967…: Fast-forward (no commit created; -m option ignored)`），本分支 HEAD 即该集成提交，故本轮**无冲突可解、无需修复提交**：无 `MERGE_HEAD`、仓库内无冲突标记（`git grep` 三类标记均无命中）、`git status` 空。提交图为 `3016296` = `3dd3dc1`（本分支先前已含 14 票的合并）＋ `36fd742`（本票实现提交）。`git diff --stat 4d1f431 36fd742` 与 `git diff --stat 3dd3dc1 3016296` 都是本票的同一个新文件 682 insertions（`tests/model-cost/pi-session-span.test.ts`），与实现报告的文件清单一致；该文件在实现提交与集成提交中 blob 相同（`afa8ff64f38df188bb090045545830e152d69c60`），OMP/framework 生产文件零改动。集成工作区（`E:/Developer/myhub/my-agent-toolkit`，本轮 `pi-adapter` tip 已前进到 `4509a80`，属后续票）未被操作；未切换分支、未新建 worktree、未 reset、未丢弃工作、未调用 retro、未直接合入集成分支。
- 本轮集成验收（同一 HEAD，源状态 `3016296`）：`bun run typecheck` → exit 0（无诊断）。`bun run test`（未归一检出）→ **991 pass / 17 fail**（111 files / 1008 tests / 5331 expect() calls / 225.94s / exit 1）。17 例全部是本机检出／布局前置项，与本票改动无关，且与 [03](03-request-pricing-rounds.md)/[13](13-deepseek-balance.md) 各轮记录的特征逐项一致：5 例 `tests/connect-bot/`（`budget-regression`、`harness-exit-budget`、`panel-registration-lifecycle` ×3）真实面板 interop 报 `the interop run needs the actual omp-bot panel, but no binary is at C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`（本 worktree 位于 `%TEMP%`，该默认同级路径不存在）；12 例由本机 `core.autocrlf=true` 把 `host-patches/**/patch.diff` 与 `bun.lock` 检出成 CRLF 引起——10 例在夹具装载期报 `…/patch.diff touches no file`（两份补丁对应 `codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、`model-cost-modes`、`model-cost-persistence`、`viewed-marker`、`viewed-session-host`、`viewed-session-total`、`viewed-session`），1 例 `baseline record > records the lockfiles of this repository and of the behavior oracle` 报 `bun.lock: recorded 9e9f4833… but found 7f5c82e6…`，1 例 `controlled session > starts the isolated artifact under a temporary agent state, not the default environment` 在 `verifyLockfile(…).matches` 上同因失败。`tests/model-cost` 分区在本轮全仓运行中零失败，含本票新增文件；未归一运行的用例数（1008）低于归一后的 1037，与 10 个在装载期即失败的 dock 文件未被枚举一致。
- 归一后的全仓回归：两份 `patch.diff` 与 `bun.lock` 逐行去 CR 后，工作树 sha256 与 `git cat-file blob HEAD:<path>` 的已提交 LF blob 逐一相同（`9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9` / `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b` / `4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d`；运行前检出值为 `7f5c82e6…` / `057e01f6…` / `294b3727…`）。设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe` 后 `bun run test` → **1037 pass / 0 fail**（111 files / 5916 expect() calls / 385.60s / exit 0）；完成本轮唯一修复后再以同一归一条件重跑 → **1037 pass / 0 fail**（111 files / 5916 expect() calls / 372.73s / exit 0）。三次运行的日志留在仓库外（`%TEMP%/hyper-int-12-logs/`，未入库）；运行期间源码与 fixture 未被改动，运行结束后三份归一文件按字节恢复运行前的 CRLF 检出状态（sha256 与运行前逐一相同、`git status` 只余本记录的改动），未提交任何环境改动。
- 本轮唯一的源码修复（提交 `75a1522`）：本票新增文件头部的覆盖声明把「新周期下一次输入」列为本文件拥有的用例，但该文件四个用例都不驱动周期变化（全文 `period` 只出现在注释与种子文档的 `periodId` 上）。按票面允许的「受控周期切换验证重置边界」路线，重置边界的实际覆盖在框架公共绑定上：`tests/model-cost/period-switch.test.ts` 的 `a switch clears the period's own time with the consumption it closes` 断言关闭周期的 span 与子代理 runtime 都不进新文档、reload 两者皆无，并断言新周期 span 从其中首次输入起算（`Span: —` → 11:00 输入 → 该 Turn 结束）。故注释改为如实归因到该套件，不再声明本文件拥有重置用例；无行为改动，改后 `bun run typecheck` exit 0、`bun test tests/model-cost/pi-session-span.test.ts` 4 pass / 0 fail / 33 expect() calls，且归一条件下的全仓重跑零失败。除此之外未改动任何产品/测试文件。
- 接线与覆盖检查（读为主）：本票生产路径零改动（`git diff --stat 4d1f431 36fd742` 只有一个新测试文件）。新增文件经 `piAdapter(MODEL_COST, { configBaseDir, factory })` 组合框架真实 pi adapter、扩展真实 definition、由框架已校验配置构造的真实 runtime 与真实前端（`attachModelCostWidget`，其释放并入 framework 的 cleanup），只把 storage root 作为本文件自述的部署事实——这正是实现报告记录的镜像装配，原因是 framework 每进程只读一次扩展配置（`framework/core/config.ts` 的 `validatedConfigs` 按 definition id 缓存），同进程的第二个套件无法经 `modelCostPiHarness` 拿到自己的存储根；本轮 111 文件的全仓运行 0 失败说明该装配在其他套件先绑定 model-cost 的同进程条件下仍然成立。该 seam 的强度（是否应改为独立进程或真实宿主）交最终门禁判断。
- 未验证／限制（本票归属，交 [25](25-evidence-scope-audit.md) 与最终独立门禁）：实现报告已明确本票**未产出真实宿主证据**——没有给 `scripts/pi-model-cost-smoke.ts` 增加本票 phase，因此没有真实 pi 1.2.0 的 submission/`message_end` → 落盘 span、没有真实空闲窗口增长核对，也没有 `evidence/12-session-span.md`；本轮按分工同样未跑实机 smoke（实机 smoke 与跨票据整体验收留最后门禁），故 P28 的 S1/S2/S3 目前止于新增文件、复用的 `period-switch.test.ts` 与全仓 `bun test`。重置段本票无自有用例：周期切换的 pi 侧接线属 [15](15-period-reset.md)，其票据状态仍为 `ready-for-agent`。实现报告另留一处未判定观察——把文档 `periodId` 由外部改写后驱动下一轮，实例报 `saved` 并保留已关闭周期的起始（绘出 `Span: 1:09:00`），未出现预期的 `stale-period` 拒绝；该场景不是生产切换路径（生产切换会丢弃本实例在关闭周期累计的时间，见 `period-switch.test.ts` 的 `a switch drops what this instance accumulated for the closed period, and the next request starts from zero`），本轮未复现也未判定，交最终门禁决定是否属跨进程陈旧周期的真实缺口（P32/P33/P28），其口子事实（framework 的 `nextTask` 是 `setTimeout(0)`、文件协调每 25 ms 轮询）见实现报告的交接段。`OMP_BOT_BINARY` 与去 CR 属本机检出／布局条件而非仓库内容，故不入库；仅 Windows x64 与 bun 1.4.2，未推断 POSIX、其他版本、其他 provider 或其他用户环境。
