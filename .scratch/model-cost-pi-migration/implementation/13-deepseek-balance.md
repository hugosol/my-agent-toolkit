# 13: DeepSeek 余额认证与刷新闭环

**What to build:** pi 实际装配使用当次认证与已解析地址查询 DeepSeek 余额，沿用初始化、成功 TTL、结算触发与失败保留，不把缺余额显示成零。

**Delivers:** P29

**Blocked by:** [02：pi 基础主会话加载与保存闭环](02-pi-main-session.md)

**Status:** in-progress — 实现已随集成提交 `79325364cb8f1f6a7a5301bc8ef364d735a0f18a` 合入 `pi-adapter`；本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0、全仓 `bun run test` 在归一检出与 `OMP_BOT_BINARY` 下 1007 pass / 0 fail），本轮的同步记录提交尚未合入 `pi-adapter`。

## Acceptance criteria

- [ ] 可控 endpoint 覆盖成功、过期、并发、换认证、失败、无可用认证；每次操作固定当次资料，不持久化认证或新增账号分区。
- [ ] 实际宿主证明 provider access 接线和初始化/请求结算触发；认证不可用时不发送请求，也不伪称查询失败。
- [ ] 不新增固定轮询；失败保留原读数及其时间，成功 TTL 规则不被改写；真实账户核对由 24 负责。
- [ ] **P29 完整 Coverage（S2）**：可控 endpoint 覆盖成功、过期、并发查询、换认证、失败和无可用认证；实际宿主验证接线，余额缺失不伪造零。真实账户侧确认另见 P53。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- 集成同步（本轮由集成 helper 执行，起点即终点 `79325364cb8f1f6a7a5301bc8ef364d735a0f18a`）：宿主已把集成提交合回本票分支（reflog 记 `merge 79325364…: Fast-forward`），本票分支 HEAD 与集成分支 `pi-adapter` 当前 tip 是同一个提交——`git diff HEAD pi-adapter` 为空、无 `MERGE_HEAD`、无冲突标记、`git status` 空，故无冲突可解、无需修复提交。`git diff --stat ae4b779 7932536` 为本票的 4 个文件 672 insertions / 13 deletions（`scripts/pi-model-cost-smoke.ts`、`tests/harness-dock/capture-server.ts`、`tests/model-cost/provider-balance.test.ts`、本票证据文件），与实现报告的文件清单逐项一致；OMP/framework 生产文件零改动。集成工作区（`E:/Developer/myhub/my-agent-toolkit`）未被操作；未切换分支、未新建 worktree、未 reset、未丢弃工作、未调用 retro、未合入集成分支。
- 本轮集成验收（同一 HEAD，工作树只有本票改动，源状态 `7932536`）：`bun run typecheck` → exit 0（无诊断）；`bun run test`（未归一检出）→ 961 pass / 17 fail（107 files / 978，231.14s，exit 1）。17 例全部是本机检出／布局前置项，与本票改动无关，且与上一轮集成记录的前置特征逐项一致：5 例 `tests/connect-bot/` 真实面板 interop 报 `the interop run needs the actual omp-bot panel, but no binary is at C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`（本 worktree 位于 `%TEMP%`，该默认同级路径不存在）；12 例由本机 `core.autocrlf=true` 把 `host-patches/**/patch.diff` 与 `bun.lock` 检出成 CRLF 引起——10 例在 fixture 装载期报 `<patch.diff> touches no file`，1 例 `baseline record > records the lockfiles of this repository and of the behavior oracle` 报 `bun.lock: recorded 9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9 but found 7f5c82e6c1785f675b9183afbb8d5ee2ecf73278018a2d90857a3da7b1788883`，1 例 `controlled session > starts the isolated artifact under a temporary agent state, not the default environment`（`session-driver.test.ts:90` 的 `verifyLockfile`）以同一锁文件行尾原因失败。直接消费本票改动 `capture-server.ts` 的 `tests/harness-dock/model-cost-balance.test.ts` 在此状态下亦通过。
- 归一后的全仓回归：两份 `patch.diff` 与 `bun.lock` 逐行去 CR 后，工作树 sha256 与 `git show HEAD:<path>` 的已提交 LF blob 逐一相同（`4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d` / `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b` / `9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9`）；设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe` 后 `bun run test` → **1007 pass / 0 fail（107 files、5810 expect() calls、476.31s、exit 0）**，含 `tests/harness-dock` 全部 23 个测试文件；两次运行的日志留在 `.cache/test-logs/`（`full-7932536-ascheckedout.log` / `normalized-7932536.log`，未入库）。运行结束后三份文件按字节恢复运行前 CRLF 检出状态（逐文件 sha256 与运行前相同、`git status` 空、`git diff` 空），未提交任何环境改动。
- 本轮无源码修复：全仓回归在归一条件下全绿，未发现本票或本次同步引入的失败，故除本记录外不新增提交、未改动任何产品/测试文件。
- 接线与覆盖检查（读为主）：本票对生产路径零改动——pi 侧 provider access 接线由 02 票交付（`extensions/model-cost/harnesses/pi.ts` 的 `context.providerAccess`、`framework/adapters/pi.ts` 的 `harnessProviderAccess`）；本票唯一触碰的共享文件 `tests/harness-dock/capture-server.ts` 是可选回调 `balance.respond(call)` 的加性改动（未提供该回调时行为逐字不变），`tests/model-cost/provider-balance.test.ts` 的新用例与文件内 `P38 → P29` 编号更正均与契约 `P29` 定义一致（`P38` 现为共同存储根承诺）。
- 未验证／限制（本票归属，交 25 与最终独立门禁）：本票新增的真实宿主 pi 1.2.0 检查（`bun scripts/pi-model-cost-smoke.ts` 的 `phaseBalance`，6 run / 19 checks）不在 `bun test` 范围内，本轮未重跑（实机 smoke 属最终门禁）；真实账户侧核对按契约归 P53（24 票），本轮无付费调用、无真实凭据；pi adapter 的 hermetic（非真实宿主）单测仍未编写（02 票已记录缺口）；本轮只跑全仓 `bun run test`，未另跑本票 smoke 与 `tests/framework` 之外的额外套件；`OMP_BOT_BINARY` 与去 CR 是本机检出／布局条件而非仓库内容，故不入库；仅 Windows x64 与 pi 1.2.0，未推断 POSIX、其他版本、其他 provider 或其他用户环境。
