# 01: 冻结迁移前代表性效率基线

**What to build:** 在共同生产路径改变之前冻结可复现的前后对照基点，使后续效率判断有真实旧实现证据，而不是事后推测。

**Delivers:** enabling: unblocks P51

**Blocked by:** None (can start immediately)。

**Status:** in-progress — 实现与本轮集成验收已在票据分支完成（全仓回归在归一检出下 983 pass / 0 fail）；尚未合入 `pi-adapter`。

## Acceptance criteria

- [ ] 固定主请求、多 Turn、主子并发、保存、只读刷新、健康空闲及处置的代表性序列；记录适用旧实现的读取、锁、发布、请求和事件成本及采样方法。
- [ ] 为尚无 pi 完整路径的场景明确标记基线不可比，不编造旧 pi 数值；保存可重新运行的隔离入口、工件和环境条件。
- [ ] 说明现有业务/接线复杂度与根专属效果数量，交给 22 使用；不新增常驻遥测或庞大基准系统。
- [ ] 基线冻结前不得修改会改变本次被测旧生产行为的路径；其他票可先进行隔离场景准备，生产修改按阻塞边执行。
- [ ] 通过实际运行采样序列得到基线输出，记录命令和结果；仅规划待测项目不满足本票验收。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- 集成同步（本轮由集成 helper 执行，起点与终点同为 `2db98f4210114f72a705603a1a3b83db0da58b76`）：本票分支 HEAD 与集成分支 `pi-adapter` 的当前 tip 是同一个提交（宿主已把集成提交合回本分支），`git diff HEAD pi-adapter` 为空、无 `MERGE_HEAD`、无冲突标记、`git status` 干净，故无冲突可解、无需修复提交。`git diff --stat 59a0ed7 HEAD` 仍是本票的 5 个文件（`scripts/efficiency-baseline.ts` 1716 行、`scripts/support/efficiency-baseline-fs-instrument.ts` 230 行、`package.json` 1 行、两份证据文件），与实现报告逐项一致。集成工作区（`E:/Developer/myhub/my-agent-toolkit`）未被操作；未切换分支、未新建 worktree、未 reset、未丢弃任何提交。
- 本轮集成验收（同一 HEAD，工作树只有本票改动）：`bun run typecheck` → exit 0（无诊断）；`bun run test` → 936 pass / 18 fail（106 files）。18 例全部是本机检出／布局前置项，与本票改动无关：12 例由本机 `core.autocrlf=true` 把 `host-patches/**/patch.diff` 与 `bun.lock` 检出成 CRLF 引起（10 个 dock 文件在 fixture 装载期即报 `…/patch.diff touches no file`，`baseline.test.ts` 与 `session-driver.test.ts` 因录制 sha256 针对已提交的 LF blob 而失败）；5 例是 `tests/connect-bot/` 的真实面板 interop（本 worktree 位于 `%TEMP%`，其默认同级路径 `../omp-bot/backend/target/release/omp-bot.exe` 在该布局下不存在）；另 1 例 `model-cost-session-span.test.ts` 的锁目录断言是全量并行负载下的 flake（在 CRLF 检出上单独重跑 3 pass / 0 fail，10.88 s）。
- 归一后的全仓回归（两份 `patch.diff` 与 `bun.lock` 逐行去 CR，去 CR 后的 sha256 与 `git show HEAD:<path>` 逐一相同；并设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：`bun run test` 连跑两次 —— 第 1 次 982 pass / 1 fail（983 tests，106 files，392.14 s），唯一失败是 `session-recovery.test.ts` 的 P16/P18 重启续算案例在 20 s 保存期限内没等到文档；第 2 次 **983 pass / 0 fail**（106 files，5633 expect，320.96 s，exit 0）。那次失败的文件单独重跑为 4 pass / 0 fail（11.08 s），属并行负载下的实时期限 flake，与本票及本次同步无关。
- 两次运行所用的三份文件在运行结束后已按字节恢复原始 CRLF 检出状态（sha256 与运行前逐一相同，`git status` 空、`git diff` 为空），未提交任何环境改动、未改动任何被录制的仓库内容，也未新增常驻遥测或基准设施。
- 未验证／限制：真实 OMP/pi 宿主、真实 provider 与终端绘制仍按本票证据 §4／§6 的不可比列表处理，本票不提供 pi 数值；上述归一属本机检出条件而非仓库内容，故不入库；本票在合入 `pi-adapter` 前保持 `in-progress`。
