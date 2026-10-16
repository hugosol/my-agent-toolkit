# 10: 两端终止、晚到与恢复边界

**What to build:** pi 与 OMP 的取消和终态失败在本地原生活动最终结算后结束 Round；晚到追加不重开旧轮，真实新执行才开新轮，恢复不伪造历史完整性。

**Delivers:** P21, P22, P23

**Blocked by:** [09：后台委派与公开保活的 Round 接续](09-background-rounds.md)

**Status:** in-progress — 实现已随集成提交 `c944f9bf814da93ee7470bbf10ca0bc7a9940160`（= `pi-adapter` 当前 tip）合入；本轮集成验收在该提交上完成（`bun run typecheck` exit 0、本票四个 seam 文件 58 pass / 0 fail、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` 1133 pass / 0 fail，119 files），本轮记录提交尚未合入 `pi-adapter`。

## Acceptance criteria

- [ ] 两端实际路径覆盖停止前后、重试中错误、最终失败和后续新活动；结算前不关轮，结算后终止不被后台保活阻挡，不串用旧结局。
- [ ] 取消/失败后分别制造仅追加与真正执行，核对公共序列、父子归属及保存；不额外停止子代理、清队列或主动唤醒。
- [ ] 实际恢复/适用重载及缺结束场景保持截断/未知，恢复仅已保存 Session；缺可靠快照时不猜 Round 零值、不补历史轮明细。
- [ ] UI 与 RPC/headless 路径单独记录，hasUI 条件保证不得泛化；公共合成与 OMP 必要调整随本票交付，不仅在 pi/model-cost 特判。
- [ ] **P21 完整 Coverage（S1、S2、S3）**：两端真实适用路径覆盖停止前后、重试中错误、最终失败及后续新活动；核对不提前结束、不串用旧结局、不为关轮额外停子或清队列。UI/RPC 保证分开记录。
- [ ] **P22 完整 Coverage（S1、S2、S3）**：取消/失败后分别制造追加和真正启动，核对公共序列、父子归属及消费保存，避免将追加事件误作执行。
- [ ] **P23 完整 Coverage（S1、S2、S3）**：真实恢复与缺失结束场景；核对截断/未知结果、恢复 Session 累计及无可靠快照时 Round 不被猜零或补造。不承诺恢复历史轮明细。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **集成同步（本轮由集成 helper 执行；本票 tip `dca3b5c`，结果 HEAD `c944f9b`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交合回本票分支，故本分支 HEAD 即 `c944f9bf814da93ee7470bbf10ca0bc7a9940160`，其父为 `0c8db96`（前一集成 tip，已含 06/07/08/09/11 各线）与 `dca3b5c`（本票实现提交）；`git rev-parse HEAD pi-adapter` 两者同为该提交，`git merge-base dca3b5c 0c8db96` = `8a631cb`（本票起点，09 的集成 tip）。**无冲突可解**：无 `MERGE_HEAD`、`git status` 空、`framework/`+`tests/`+`scripts/` 内无冲突标记，故本轮无冲突修复。
- **合入内容逐项核对**：`git diff --numstat 0c8db96 c944f9b` 恰为本票 17 个文件，与本票实现报告的文件清单一致（`framework/core/protocol.ts` +41/-14、`framework/behaviors/round-events.ts` +27/-3、两台适配的 `round.ts`/`turn.ts`、`framework/docs/harness-support.md` +2/-2、`scripts/pi-terminal-round-smoke.ts` +679、三个框架测试文件、`tests/connect-bot/support/omp-double.ts` +9、两个 dock fixture、`tests/model-cost/pi-terminal-rounds.test.ts` +561、证据文件 +85）。本票自有文件中只有三处同时承载另一侧内容（`framework/core/protocol.ts` +14/-131 = 11 的协议裁剪、`framework/docs/harness-support.md` +7/-5、`tests/framework/support/harness-port-double.ts` +10/-48 = 11 的双多重写）；四个 round/turn 文件与 `round-events.ts` 与实现 tip 逐字节相同，且 `protocol.ts` 中本票的 `RoundSignal.outcome`、`RoundObservation.quiescent()/heldWork()` 与两适配的结局/静止读取在合入后仍在位。首父 diff 只含本票文件，即合入未改动其它票的产物。
- **本轮集成验收（HEAD `c944f9b`）**：`bun run typecheck` → exit 0（无诊断）。本票自身的四个 seam 文件（`tests/framework/round-events.test.ts`、`tests/framework/round.test.ts`、`tests/framework/pi-background-rounds.test.ts`、`tests/model-cost/pi-terminal-rounds.test.ts`）在合入后的树上 **58 pass / 0 fail**（133 expect，99 ms）。`bun run test`（本机 CRLF 检出、未设 `OMP_BOT_BINARY`）→ **1086 pass / 18 fail**（1104 tests，119 files，5771 expect，262.50 s，exit 1；日志 `.cache/global-test-10.log`）；18 例无一条由本票合入引入：5 例 `tests/connect-bot/`（真实 omp-bot 面板二进制在本 worktree 的 `%TEMP%` 同级默认路径缺失）、10 例 `tests/harness-dock/`（`core.autocrlf=true` 把两份 `host-patches/**/patch.diff` 检出成 CRLF，fixture 装载期即报 `touches no file`）、2 例锁文件 sha（`bun.lock` 的 CRLF 检出对已提交 LF blob）、1 例 `tests/harness-dock/model-cost-session-span.test.ts` 的锁目录断言在 119 文件并行负载下的 flake（同条件单独重跑 3 pass / 0 fail ×3，与 [01](01-efficiency-baseline.md) 该例的记录一致）。
- **归一后的全仓回归**（三处工作区文件还原为已提交 LF blob 字节：`bun.lock` = `a5d37ab28396…`、`host-patches/omp-18.5.0-viewed-session/patch.diff` = `66195465cc0c…`、`host-patches/omp-18.5.0-codex-response-boundary/patch.diff` = `4ec9ad0de31b…`，各与 `git cat-file blob HEAD:<path>` 相等；`OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：第 1 次 **1132 pass / 1 fail**（1133 tests，119 files，531.80 s，exit 1；日志 `.cache/integrate-10/fulltest-normalized.log`），唯一失败是 `tests/codebase-tools/outbound-role.test.ts` 的 codex dock 用例在 119 文件并行负载下于 harness 自身 HTTP 层超时（`DockSessionError: timed out after 120000ms waiting for prompt_result for h2`，会话 stderr 为 `[DOMException [TimeoutError]]`），该文件同条件单独重跑 **3 pass / 0 fail ×2**（~7 s）；静默窗口的第 2 次 **1133 pass / 0 fail**（1133 tests，119 files，6358 expect，341.81 s，exit 0；日志 `.cache/integrate-10/fulltest-normalized-2.log`），5 例 `tests/connect-bot/` 真实面板 interop 在 `OMP_BOT_BINARY` 指到下全绿，第 1 次的 codex dock 超时未复现（[07](07-owner-state.md) 的集成轮已确认其最后一次全仓运行早于本轮、无重叠，[06](06-local-process-connection.md)/[11](11-subagent-runtime.md) 两轮当轮只余记录提交）。
- **本轮修复**：**无源码修复** —— 18 例全属本机检出／布局前置项与并行负载 flake，无一条由本票合入引入（首父 diff 亦证明合入只动了本票那 17 个文件），故不改仓库。归一用的三份文件在每次运行结束后已按字节还原为 CRLF 检出态（sha256 与运行前逐一相同、`git status` 空）。唯一改动是本记录。
- **未验证／限制（交最终独立门禁与 [25](25-evidence-scope-audit.md)）**：本轮只跑全仓自动测试与 `typecheck`，未跑实机 smoke（`bun scripts/pi-terminal-round-smoke.ts` 等）、未跑付费调用、未做跨票据整体验收；上述 0 fail 只适用于归一后的字节状态。`core.autocrlf=true` 的 CRLF 检出与 `%TEMP%` 布局下 `omp-bot.exe` 的默认路径仍是本机环境事实，未以仓库改动修正。实现报告 §未验证／未覆盖 的各条（OMP 真实取消/终态路径、真实交互 TUI 观感、跨进程子记账缺口、POSIX）原样成立。
