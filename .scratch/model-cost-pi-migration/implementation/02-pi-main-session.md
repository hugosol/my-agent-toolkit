# 02: pi 基础主会话加载与保存闭环

**What to build:** 未启用子代理提供方时，用户能通过固定 pi 的实际发现入口加载 model-cost，输入普通请求、执行适用命令并看到统计、provider 功能和保存后的恢复结果；两端复用相同声明与业务规则。

**Delivers:** P1, P2, P41, P55

**Blocked by:** [01：冻结迁移前代表性效率基线](01-efficiency-baseline.md)

**Status:** in-progress — 实现已随集成提交 `5ad9af75bd6385457cc7bb614d92ed7778b9ab42` 合入 `pi-adapter`；本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0、全仓 `bun run test` 在归一检出与 `OMP_BOT_BINARY` 下 983 pass / 0 fail），本轮的同步记录提交尚未合入 `pi-adapter`。

## Acceptance criteria

- [ ] 接通普通输入、请求开始/响应 usage、基础 Round 最终结算与保存；复用现有 shared-logic，不留下假实现或用直接构造业务实例代替实际加载。
- [ ] 隔离配置实际运行 pi 1.2.0 与既有 OMP；覆盖有效/非法配置、普通请求、一个非重置命令、适用 provider 功能、输出及新进程读回。
- [ ] 未启用子提供方不要求第三方注册；正常无子代理模式只描述本入口范围，不声称宿主全局不存在子代理。
- [ ] 保持 storageDir 的绝对、配置相对与特殊 ~/ 规则，未配置位置无写入；切换 harness 不迁移数据。
- [ ] 迁移本票受影响的公共消费者并移除被替代生产接线；不复制业务算法、不保留 shim；请求锚价复杂边界与连续活动完整检查由 03 负责。
- [ ] **P1 完整 Coverage（S2、S3）**：隔离固定版本实际发现并加载入口；执行输入和命令，核对反馈、统计及保存结果，不以直接构造业务实例代替加载证据。
- [ ] **P2 完整 Coverage（S2）**：无提供方实际运行主请求、统计及适用 provider 功能；不得要求不存在的第三方注册或声称宿主全局无子代理。
- [ ] **P41 完整 Coverage（S2、S3）**：绝对、相对、该字段特殊 ~/、不同 cwd/配置位置及新进程改目录；核对解析位置与未配置位置无写入，相同目录为共同数据集、不同目录相互独立。
- [ ] **P55 完整 Coverage（S1、S2）**：两端加载同一要求，检查有效/非法配置与命令效果；必要差异仅为已批准的宿主接入与绘制。公共组织与干净切换通过实现审查配合行为回归，不以复制文本测试证明。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- 集成同步（本轮由集成 helper 执行，起点即终点 `5ad9af75bd6385457cc7bb614d92ed7778b9ab42`）：宿主已把集成提交合回本票分支（reflog 记 `merge 5ad9af75…: Fast-forward`），本票分支 HEAD 与集成分支 `pi-adapter` 当前 tip 是同一个提交——`git diff HEAD pi-adapter` 为空、无 `MERGE_HEAD`、无冲突标记、`git status` 空，故无冲突可解、无需修复提交。`git diff --stat be96759 5ad9af7` 为本票的 12 个文件 2424 insertions / 510 deletions（`framework/adapters/pi.ts`、新增 `framework/adapters/pi/round.ts`、`framework/adapters/pi/turn.ts`、`extensions/model-cost/harnesses/pi.ts`、`extensions/model-cost/harnesses/pi/widget.ts`、`entrypoints/pi/model-cost.ts`、`tests/harness-dock/pi-session.ts`、`tests/harness-dock/fixtures/pi-model-cost/{env,entrypoint}.ts`、`scripts/pi-model-cost-smoke.ts`、`scripts/pi-codebase-tools-smoke.ts`、本票证据文件），与实现报告的文件清单逐项一致；OMP 侧生产文件零改动。集成工作区（`E:/Developer/myhub/my-agent-toolkit`）未被操作；未切换分支、未新建 worktree、未 reset、未丢弃工作、未调用 retro、未合入集成分支。
- 本轮期间集成 tip 的变化（供下一轮同步与最终门禁）：上述同步点 `5ad9af7` 是本票分支与本轮验证的源状态；`pi-adapter` 随后于 14:21:27（本轮运行期间）前进到 `2ea7fee31a3c3c0f11d9ad3d1e15a70bfd926637`，即 `04-shared-storage` 的合并（`c60782d` + `3b3e8a4`，改 `shared-logic/consumption-store.ts`、`runtime.ts`、`presentation/display.ts`、`GLOSSARY.md` 与 `tests/model-cost/*`）。本轮的 `bun run test` 结果因此只适用于 `5ad9af7` 基线的树，不含该票改动；跨票据合并树的整体验收按分工留给最后独立门禁。只读核对（`git merge-tree --write-tree HEAD pi-adapter`，git 2.53.0）返回单一树 `f979884c2a509946075004adef1c7fc1a700d60f`、exit 0，即宿主把本记录合入当前 `pi-adapter` tip 无冲突。
- 同步后的接线检查（读为主）：`entrypoints/pi/model-cost.ts` 9 行、只作默认导出转发，业务装配集中在 `extensions/model-cost/harnesses/pi.ts`；`framework/adapters/pi` 的消费者只有既有 `extensions/codebase-tools/harnesses/pi.ts` 与本票新增的 model-cost pi 装配，仓库内不存在第二份 pi 会话驱动（两条 smoke 脚本同引 `tests/harness-dock/pi-session.ts`），被替代的内嵌驱动是删除而非重导出，未见兼容别名或重复算法。
- 本轮集成验收（同一 HEAD，工作树只有本票改动，源状态 `5ad9af7`）：`bun run typecheck` → exit 0（无诊断）；`bun run test` → 937 pass / 17 fail（106 files / 954，216.49s，exit 1）。17 例全部是本机检出／布局前置项，与本票改动无关，且与上一轮集成记录的前置特征逐项一致：5 例 `tests/connect-bot/` 真实面板 interop 报 `the interop run needs the actual omp-bot panel, but no binary is at C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`（本 worktree 位于 `%TEMP%`，该默认同级路径不存在）；12 例由本机 `core.autocrlf=true` 把 `host-patches/**/patch.diff` 与 `bun.lock` 检出成 CRLF 引起——10 例在 fixture 装载期报 `<patch.diff> touches no file`，1 例 `baseline record > records the lockfiles of this repository and of the behavior oracle` 报 `bun.lock: recorded 9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9 but found 7f5c82e6c1785f675b9183afbb8d5ee2ecf73278018a2d90857a3da7b1788883`，1 例 `controlled session > starts the isolated artifact under a temporary agent state`。
- 归一后的全仓回归：两份 `patch.diff` 与 `bun.lock` 逐行去 CR 后，工作树 sha256 与 `git show HEAD:<path>` 的已提交 LF blob 逐一相同（`4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d` / `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b` / `9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9`）；设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe` 后 `bun run test` → **983 pass / 0 fail（106 files、5637 expect() calls、429.74s、exit 0）**，含 `tests/harness-dock` 全部 23 个测试文件；两次运行的日志留在 `.cache/test-logs/`（`full-5ad9af7.log` / `normalized-5ad9af7.log`，未入库）。运行结束后三份文件按字节恢复运行前 CRLF 检出状态（逐文件 sha256 与运行前相同、`git status` 空、`git diff` 空），未提交任何环境改动。
- 本轮无源码修复：全仓回归在归一条件下全绿，未发现本票或本次同步引入的失败，故除本记录外不新增提交、未改动任何产品/测试文件。
- 未验证／限制（本票归属，交 25 与最终独立门禁）：全仓测试不覆盖本票新增的 pi 主会话映射——`tests/` 下没有针对 `framework/adapters/pi*` 的 hermetic 文件，该映射在本轮的证据只有实现报告里的真实 pi 1.2.0 smoke（`bun scripts/pi-model-cost-smoke.ts`，25 checks）与未改动的 `tests/framework`、`tests/model-cost` 分区；两条 pi smoke 脚本不在 `bun test` 范围内，本轮未重跑（实机 smoke 属最终门禁），其中迁移后的 `bun scripts/pi-codebase-tools-smoke.ts` 在本机「会话干净退出」一项仍按其实现报告所述以既有 `exit 9 / UV_HANDLE_CLOSING` 现象失败；`OMP_BOT_BINARY` 与去 CR 是本机检出／布局条件而非仓库内容，故不入库；`extensions/model-cost/README.md` 与 `framework/docs/harness-support.md` 仍是迁移前描述（实现报告已记为未更新）；pi 的请求级 `tiers` 不参与 `modelPrices` 映射（框架价目无 tier 词汇）；真实账户、真实终端绘制、POSIX 与跨版本仍未验证。
