# 16: 耗时观测缺口与本周期完整性

**What to build:** 取消、失败、缺失结束或崩溃后保留可靠耗时小计及本周期不完整性，后续成功不擦掉缺口，不补离线时间或跨周期回填。

**Delivers:** P26

**Blocked by:** [10：两端终止、晚到与恢复边界](10-terminal-rounds.md)、[11：累计活动耗时与旧值兼容](11-subagent-runtime.md)、[15：整文档归档与有条件周期重置](15-period-reset.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 受控时间与真实终止/恢复覆盖已观察取消失败、缺结束、崩溃恢复、后续成功，核对独立区间小计、未知及可靠零。
- [ ] 读取保存值与新进程展示，确认缺口随本周期累计保留；实际 clear/holiday 后开始新累计，晚到旧周期活动不回填。
- [ ] 保留 11 已验证的旧记录兼容，不将粗估精度变化当历史缺口，不为缺口增加通用 LastGoodValue 框架。
- [ ] **P26 完整 Coverage（S1、S2、S3）**：取消/失败有已知活动、缺结束、崩溃恢复、后续成功和周期重置；区分未知与可靠零，验证缺口不因后续成功消失、不跨周期回填。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **集成同步（本轮由集成 helper 执行；本票实现 tip `71055f1`，结果 HEAD `b6c3003`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交合回本票分支，故本分支 HEAD 即集成提交 `b6c30030875990fc8dec91e996170ad40dd29f02`，其父为 `b749cdb`（前一集成 tip）与 `71055f1`（本票实现提交）。**无冲突可解**：worktree gitdir（`E:/Developer/myhub/my-agent-toolkit/.git/worktrees/hyper-ticket-H0EZLQ`）内没有 `MERGE_HEAD`/rebase/cherry-pick 状态，`framework`/`tests`/`scripts`/`extensions`/`entrypoints` 无冲突标记（`git grep -E "^(<<<<<<<|>>>>>>>|=======$)"` 无命中），`git status` 空，故本轮无冲突修复、未改写历史；集成工作区未被操作，分支未切换，未新建 worktree，未 reset 丢弃工作，未调用 retro。
- **合入内容逐项核对**：`git diff --stat HEAD^1 HEAD` = 4 files / 1421 insertions / 1 deletion，与 `git show --stat 71055f1` 逐项相同——本轮合并只加入本票改动。本票拥有的 `extensions/model-cost/shared-logic/request-accounting.ts`、`tests/model-cost/pi-runtime-gaps.test.ts`、`tests/harness-dock/model-cost-runtime-gap.test.ts` 在 HEAD 上与 `71055f1` 逐字节相同（`git diff 71055f1 HEAD -- extensions tests` 无输出）；集成侧只带入 `.scratch/model-cost-pi-migration/implementation/10-terminal-rounds.md`（ticket 10 的文档行），未改写本票内容。
- **本轮集成验收（HEAD `b6c3003`）**：`bun run typecheck` → exit 0（无诊断）。**原始检出** `bun run test` → **1117 pass / 10 fail**（122 files / 1127 tests / 282.36s / exit 1），10 例全部是补丁物化期即报的 `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff touches no file`（`tests/harness-dock/host-patch-artifact.ts:224`）。
- **归一检出（本机离线事实，未以仓库改动修正，故 0 fail 不读作已被修好）**：本机 `core.autocrlf=true` 把 `bun.lock`（11214 bytes / 83 CRLF 行）与两份 `patch.diff`（27184 / 2257 bytes，599 / 44 CRLF 行）检出成 CRLF，而这些工件按已提交 LF blob 记录 sha256、补丁链又按 LF 行首解析，于是失败。本轮以 `rm` + `git -c core.autocrlf=false checkout --` 还原为 blob 字节：还原后三者 sha256 依次为 `a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6` / `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b` / `4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d`，与 `git cat-file blob HEAD:<path>` 逐一相同，且 `git status` 仍空（autocrlf 的 clean 过滤把 CRLF 工作树字节判为与 blob 相同）。另一处布局前置是本 worktree 位于 `%TEMP%`，connect-bot 真实面板的默认同级路径不存在，本轮设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`。
- **归一后仍有一例失败，定位为既有竞态而非本票／本轮合入**：`bun run test` → **1155 pass / 1 fail**（122 files / 1156 tests / 400.01s / exit 1），唯一失败是 `tests/harness-dock/model-cost-session-span.test.ts:305`（真实宿主保存完成后立即列存储根，`received` 只有 `consumption.json`，缺少它要求的协调锁目录 `consumption.json.lock`）。判定依据：①该锁按每次写入获取/释放（`framework/modules/files.ts` 的 `updateFile` 在 `publish` 之后才 `releaseLock`），保存完成与锁名消失之间存在真实窗口；②该文件、`framework/modules/files.ts`、`extensions/model-cost/shared-logic/consumption-store.ts` 相对上一轮全绿 HEAD `0c8db96` 逐字节未变（`git diff --stat 0c8db96 HEAD -- <三者>` 无输出），故不是本轮合入内容引入；③单独复跑该文件 5 次中 1 次失败（约 20%），同一来源在本轮第 1 次全仓运行中通过。
- **本轮唯一源码修复（提交 `0e86648`）**：把该断言的目录列举改为不计框架自身的协调锁名，保留原有唯一主题（本次运行只留下消费文档——无时间专用文件、无暂存文件、无半写），与 `tests/model-cost/pi-runtime-gaps.test.ts` 的 `rootFiles` 对 `.lock` 的处理一致；不涉及生产行为。修复后同一文件 **8/8 通过**，`bun run typecheck` → exit 0，归一检出下全仓 `bun run test` → **1156 pass / 0 fail**（122 files / 6569 expect() calls / 366.78s / exit 0，日志 `.cache/integrate-16/fulltest-normalized3.log`；分区：harness-dock 24 + model-cost 35 + framework 38 + connect-bot 18 + codebase-tools 7 = 122 文件）。
- **本轮提交**：`0e86648`（上述断言去抖）与随后一条记录本 Comments 的提交，均在当前开发分支上；工作树干净。`pi-adapter` 由宿主维护，本轮未触碰（本轮结束时它已随 ticket 17 前进到 `47a7ff1`）。
- **未覆盖项（保持未验收，交最终独立门禁）**：真实 pi 宿主的活动耗时仍按实现报告 `unverified` 保持未验收（前景子代理会杀死父 pi 进程、后台子进程完全不记账）；`scripts/` 下的 smoke、实机与跨票据整体验收属最终门禁与人类验收。
