# 15: 整文档归档与有条件周期重置

**What to build:** 从实际命令入口可靠执行 clear 与首次 holiday 的整文档归档/新周期发布；不满足 DeepSeek、idle 和自身保存收口条件立即拒绝，不延期。

**Delivers:** P35, P36, P37

**Blocked by:** [04：共同存储并发提交与只读同步](04-shared-storage.md)、[10：两端终止、晚到与恢复边界](10-terminal-rounds.md)、[13：DeepSeek 余额认证与刷新闭环](13-deepseek-balance.md)

**Status:** in-progress — 实现已随集成提交 `5581010f5fd5f91276897e766224b7815c44fbf0` 合入 `pi-adapter`；本轮集成验收在该提交上完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` 1148 pass / 0 fail），本轮无源码修复，本记录提交尚未合入 `pi-adapter`。真实宿主未覆盖项见 [evidence/15-period-reset.md](../evidence/15-period-reset.md) 的「未覆盖与限制」，仍原样成立。

## Acceptance criteria

- [x] 混合两个 harness/provider/session 的已保存文档与未提交本地数据，覆盖有效零、并发及归档/发布失败；先归档再发布，失败不声称成功。
- [x] 完整归档、新 period、start/end 和当次独立边界余额一致；失败余额不补缓存/零，不改旧归档、独立 Codex 估计或从归档恢复。
- [x] 普通 clear 为 holiday=false，首次 holiday 直接发布 true，已有 holiday 幂等不重复归档；不做先 clear 再改字段两步发布。
- [x] 逐项验证非 DeepSeek、忙碌、活动未知、自身保存未收口立即拒绝；之后结算不能自动执行被拒动作，入口偏好不改变。
- [x] 旧周期未保存/在途数据不得进入新周期，重置不强制提交其他会话。
- [x] **P35 完整 Coverage（S2、S3）**：两 harness/provider/session 混合文档、有效零、归档/发布失败及并发；核对完整归档、新 period、start/end 边界、可选同次余额、不改旧归档/Codex 估计且不从归档读回。
- [x] **P36 完整 Coverage（S2、S3）**：普通 clear 为 false、首次 holiday 为 true、再次 holiday 幂等；核对归档数量、周期身份及消费，不做先 clear 再改 holiday 的两步发布。
- [x] **P37 完整 Coverage（S1、S2、S3）**：从命令入口覆盖每项拒绝条件及满足条件的成功对照；之后结算不能自动执行先前拒绝动作，入口偏好不受重置影响。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **集成同步（本轮由集成 helper 执行；本票实现提交 `94651a9`，结果 HEAD `5581010`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交（`5581010f5fd5f91276897e766224b7815c44fbf0`）合回本分支，故本分支 HEAD 即该集成提交，其父为 `5aeefe2`（前一集成 tip）与 `94651a9`（本票实现提交），与 `pi-adapter` tip 同一提交。**无冲突可解**：本 worktree 的 gitdir 内无 `MERGE_HEAD`/rebase/cherry-pick 状态，`git ls-files -u` 空，`git status --porcelain` 空；`git diff --stat 5aeefe2 HEAD` 正好是本票 7 个文件，且 `git diff 94651a9 HEAD` 对本票三个生产/测试文件为空（合并没有改写交付面）。未操作集成工作区、未切换分支、未新建 worktree、未 reset、未调用 retro，也未自行合入集成分支。
- **本轮集成验收（HEAD `5581010`）**：`bun run typecheck` → exit 0。`bun run test` 按检出原样 → **1101 pass / 18 fail**（1119 tests / 120 files / 243.47s / exit 1），18 例全为本机环境前置项（5 例缺 `omp-bot.exe` 的默认同级路径、10 例 CRLF 检出使 `patch.diff` 物化失败、2 例锁文件 sha 按 LF blob 录制、1 例真实宿主保存期限），无一落在本票合入的文件上。归一检出（`bun.lock` 与两份 `patch.diff` 还原为已提交 LF 字节，`tr -d '\r' | sha256sum` 与 `git cat-file blob HEAD:<path>` 逐一相等）+ `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe` 下 `bun run test` → 第 1 次 **1147 pass / 1 fail**（唯一失败是 `tests/harness-dock/model-cost-session-span.test.ts` 的锁目录 leftover 断言，该文件单独重跑 3 pass / 0 fail）、第 2 次 **1148 pass / 0 fail**（6475 expect() calls / 366.75s / exit 0）；`tests/model-cost`、`tests/framework`、`tests/harness-dock`、`tests/connect-bot`、`tests/codebase-tools` 两次运行全绿。
- **本轮修复：无源码修复。** 无一条失败由本票合入引入（本票只改了 `framework/adapters/pi.ts`、`scripts/pi-model-cost-smoke.ts`、`tests/model-cost/pi-period-reset.test.ts`，其进程内消费者 `tests/model-cost` 与 dock 的 5 个 pi fixture 两次运行全绿）；归一后零失败说明没有失败被上述环境例掩盖，故不改仓库内容（`.gitattributes` 或按行尾鲁棒的解析属装配/宿主验证票）。运行后三处文件按字节恢复 CRLF 检出状态，工作树只余本记录与证据/日志改动。
- **未验证／限制**：本票 evidence 的「未覆盖与限制（不声称通过）」原样成立——真实 pi 上不可生产的「活动未知/忙碌」只由进程内套件覆盖、边界余额读的是本机 capture endpoint（非真实账户）、POSIX 的发布失败分支未运行；实机 smoke、跨票据整体验收与 P51/P52/P53 人类验收属最终独立门禁，本轮未执行。
- 详细命令、日志路径与逐条失败归因见 [evidence/15-period-reset.md](../evidence/15-period-reset.md) 的「集成同步与合并后全仓回归」。
