# 09: 后台委派与公开保活的 Round 接续

**What to build:** 前后台委派结果和原生唤醒沿公开保活标准接续父会话原 Round；未来任务登记与订阅本身不保持当前 Round 打开。

**Delivers:** P19, P20

**Blocked by:** [05：真实子入口接入与可靠会话事实](05-subagent-facts.md)

**Status:** in-progress — 实现已随集成提交 `8a631cbef55e67ffc461ece8a4372c364dddedfe` 合入 `pi-adapter`；本轮集成验收在该提交上完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` 1116 pass / 0 fail），本轮记录提交尚未合入 `pi-adapter`。

## Acceptance criteria

- [ ] 真实固定宿主/提供方覆盖前后台、批量结果、正常静止和既有 10 秒唤醒期限标准；父子独立开闭，不由子终态直接结束父轮。
- [ ] 薄装配注入会话后台查询，第三方载荷转换留在 adapter 私有接入；不复制结果队列或构造通用待续义务状态机。
- [ ] 未注册、身份不匹配、失败、查询不可得不能当 false；仍需结束候选与本地静止检查，不新增本地超时关轮。
- [ ] 按批准的调度适用范围核对未来任务、终态历史和 wait subscription 不保活，真正执行按其实际会话处理；不新增 workflow/调度硬要求。
- [ ] 本票直接依赖公共会话事实与基础 Round，不以完整代理树或 Session 汇总完成作为前提。
- [ ] **P19 完整 Coverage（S1、S2、S3）**：真实前/后台委派及批量结果；父子独立开闭，不由子终态直接结束父轮；覆盖既有唤醒超时标准与正常静止组合，保活查询不可得不冒充不活动。
- [ ] **P20 完整 Coverage（S1、S2）**：按选型批准的调度适用范围核对未来任务、终态历史及订阅不保活；真正触发的执行按其会话处理。不新增 workflow/调度硬功能。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **集成同步（本轮由集成 helper 执行；本票 tip `f2f2484`，结果 HEAD `8a631cb`）**：宿主把本票分支合进 `pi-adapter` 后，把该集成提交合回本票分支，故本分支 HEAD 即该集成提交 `8a631cbef55e67ffc461ece8a4372c364dddedfe`，其父为 `19cc4ab`（前一集成 tip，已含 06/08 两条线）与 `f2f2484`（本票实现提交）；本分支与集成分支指向同一提交（`git rev-parse HEAD pi-adapter` 两者相同），`git merge-base f2f2484 19cc4ab` = `304451e`（本票起点）。**无冲突可解**：无 `MERGE_HEAD`、无 `rebase-merge`/`rebase-apply` 状态目录、`git status` 空、`framework/`+`tests/`+`scripts/`+`extensions/`+`entrypoints/` 内无冲突标记，故本轮无冲突修复、未改写历史。
- **合入内容逐项核对**：`git diff --numstat 19cc4ab HEAD` = 本票那 10 个文件（`.scratch/model-cost-pi-migration/evidence/09-background-rounds.md` +81、`framework/adapters/pi.ts` +17、`framework/adapters/pi/nicobailon.ts` +178/-5、`framework/adapters/pi/round.ts` +53/-10、`framework/docs/harness-support.md` +1/-1、`scripts/pi-background-round-smoke.ts` +627、`tests/framework/pi-background-rounds.test.ts` +366、`tests/framework/support/pi-surface-double.ts` +86、`tests/harness-dock/fixtures/pi-background-rounds/{entrypoint,prefix}.ts` +57/+21），与本票实现报告的文件清单一致。两面都改到的只有 `framework/adapters/pi.ts`（集成侧 06 的 local access 装配 +22/-3）与 `tests/framework/support/pi-surface-double.ts`（集成侧 `definition` 选项 +9/-1）；`git diff f2f2484 HEAD` 对 `round.ts`、`nicobailon.ts`、`pi-background-rounds.test.ts`、`pi-background-round-smoke.ts`、本票 fixtures、`harness-support.md`、本票 evidence 为空，即这些文件与实现 tip 逐字节相同。合并结果里 09 注入的 `background: sessionId => integration?.backgroundActivity(sessionId) ?? { state: "clear" }`（`pi.ts` 关轮静止条件）与 06 的 `createOwnerAccessPublisher` 装配同处一份 `pi.ts`，两者都在。
- **本轮集成验收（HEAD `8a631cb`，工作树只有本票改动）**：`bun run typecheck` → exit 0（无诊断）。`bun run test`（本机原始 CRLF 检出、未设 `OMP_BOT_BINARY`）→ **1070 pass / 17 fail**（117 files / 1087 tests / 5708 expect() calls / 227.11s / exit 1；日志 `.cache/integrate-09/fulltest-as-checked-out.log`）。17 例无一条由本票合入引入，分两类：
  - **15 例是本机检出／布局前置项**，特征与 [02](02-pi-main-session.md)/[03](03-request-pricing-rounds.md)/[04](04-shared-storage.md)/[05](05-subagent-facts.md)/[12](12-session-span.md)/[13](13-deepseek-balance.md)/[24](24-provider-account-acceptance.md) 各轮记录逐项一致：5 例 `tests/connect-bot/`（`budget-regression`、`harness-exit-budget`、`panel-registration-lifecycle` ×3）报 `the interop run needs the actual omp-bot panel, but no binary is at C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`（本 worktree 位于 `%TEMP%`，该默认同级路径不存在）；10 例 `tests/harness-dock/`（`codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、`model-cost-modes`、`model-cost-persistence`、`viewed-marker`、`viewed-session`、`viewed-session-host`、`viewed-session-total`）报 `host-patches/.../patch.diff touches no file`（`patchTouchedFiles` 按 LF 切分，而 `core.autocrlf=true` 的检出是 CRLF）。
  - **2 例 `tests/harness-dock/`（`baseline.test.ts`、`session-driver.test.ts`）也是本机行尾前置项，不是记录过期**：报 `bun.lock: recorded a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6 but found e7ed487b…` 与 `verifyLockfile(record.sourceCombination.lockfile).matches` 为 false。记录值 `a5d37ab2…` 就是 `HEAD:bun.lock` 的已提交 LF blob（`git cat-file blob HEAD:bun.lock | sha256sum`），而本 worktree 的 `bun.lock` 是 CRLF 检出：工作区字节 11214 = blob 11131 + 83 行，`working bytes − blob bytes` 恰为行数，`sha256File`/`verifyLockfile` 直接对工作区字节取 sha256。与 [05](05-subagent-facts.md) 该两例的差别只是当时其工作区 `bun.lock` 恰为 LF（那轮是记录真过期，本轮不是）。
- **归一后的全仓回归**（三处工作区文件还原为已提交 LF blob 字节：`bun.lock`、`host-patches/omp-18.5.0-viewed-session/patch.diff`、`host-patches/omp-18.5.0-codex-response-boundary/patch.diff`，各 `sha256sum` 与 `git cat-file blob HEAD:<path>` 相等 = `a5d37ab28396…`/`66195465cc0c…`/`4ec9ad0de31b…`；`OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：**1116 pass / 0 fail**（117 files / 6293 expect() calls / 398.13s / exit 0），`tests/framework`、`tests/model-cost`、`tests/harness-dock`、`tests/connect-bot`、`tests/codebase-tools` 全绿；日志 `.cache/integrate-09/fulltest-normalized.log`。同源状态下另取一次可归属读数：`bun test tests/framework/pi-background-rounds.test.ts` → 12 pass / 0 fail（33 expect，日志 `.cache/integrate-09/ticket-partition.log`），与 §2 记录一致。
- **本轮修复**：**无源码修复** —— 17 例全属本机检出/布局前置项，无一条由本票合入引入，故不改仓库（按 04/05/24 记录，`.gitattributes` 或按行尾鲁棒的解析属装配/宿主验证票，不由本票代改）。唯一改动是本记录。跑完后三处归一的文件已 `git checkout` 还原为检出态，工作区 `git status` 空。
- **未验证／限制（交最终独立门禁与 [25](25-evidence-scope-audit.md)）**：`core.autocrlf=true` 的 CRLF 检出（两份 `patch.diff`、`bun.lock`）与 `%TEMP%` 布局下 `omp-bot.exe` 的默认路径仍是本机环境事实，未以仓库改动修正，故上面的 0 fail 只适用于归一后的字节状态。本轮按分工未跑实机 smoke（`bun scripts/pi-background-round-smoke.ts`、`bun scripts/pi-subagent-smoke.ts`）、未跑付费调用、未做跨票据整体验收。实现报告 §未验证／未覆盖 的各条（提供方唤醒期限到期路径、真实耐久定时任务、前台委派失效 ctx 阻塞、被委派会话自身记账归属、他人主机已发布注册表的后果、POSIX）原样成立，未因本轮全仓绿而改变。
