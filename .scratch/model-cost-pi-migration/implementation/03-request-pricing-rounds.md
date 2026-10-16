# 03: 请求锚价与原生连续活动完整计费

**What to build:** 用户在跨时段、改模型、目录价变化及工具/重试/压缩/排队继续中，仍按真实请求开始事实自行结算；Round 最终静止后才提交，未知、零、参考费用与无统计口径不混淆。

**Delivers:** P7, P9, P18

**Blocked by:** [02：pi 基础主会话加载与保存闭环](02-pi-main-session.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 使用独立 usage/价格字面量和手算期望，覆盖 holiday、周期边界及请求后配置变化；第三方最终 cost 故意与手算不同，确认从未采用它。
- [ ] 缺 usage、缺价格、可靠零、部分已知、计费/额度/无口径分别验证提示、小计与保存贡献，Codex 参考美元不进入实际消费。
- [ ] 实际 pi 驱动普通请求、工具、自动重试、压缩及原生排队继续；对照公共事件开闭、最终结算与保存时刻，候选后一 task 重检，不以低层结束直接关轮。
- [ ] 后台保活由 09 接续，取消/终态失败由 10 负责；本票完成所有正常本地继续路径，不能用待补分支或永久跳过测试替代。
- [ ] **P7 完整 Coverage（S1、S2、S3）**：独立 usage/价格算例覆盖跨时段、改模型、改目录价、holiday 与周期变化；核对公共请求事实和最终金额。第三方最终 cost 设为与算例不同，仍必须使用自身计算。
- [ ] **P9 完整 Coverage（S1、S2、S3）**：独立输入覆盖缺 usage、缺价格、可靠零、计费/额度/无口径及部分已知；核对跳过提示、各指标小计和持久化贡献，Codex 参考美元不进入实际消费金额。
- [ ] **P18 完整 Coverage（S1、S2、S3）**：实际宿主驱动普通请求及各继续路径，核对公共开闭序列和保存时刻；候选后延后一 task 重检，不以单次低层结束关轮。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **集成同步**（本轮由集成 helper 执行，起点 `f4e4d8f`，终点 `72baa88`）：宿主把集成分支 `pi-adapter` 的 tip `b60e9b8b193e2682d36ae8ffefa669127377662a`（[04] 的集成提交）合回本分支，`scripts/pi-model-cost-smoke.ts` 有 2 处真实冲突，逐处读代码后判定为「两票各自新增、需并存」：
  - **导入块**：保留本票的 `PI_PROMPT_TIMEOUT_MS` / `PiModelDeclaration`，同时保留 [04]/[13] 的 `writePiModels` / `CapturedBalanceCall`。四个符号在合并后的 `tests/harness-dock/pi-session.ts`、`capture-server.ts` 中都已导出，且本文件正文确实各自使用（合并后计数：`writePiModels` 3 处、`CapturedBalanceCall` 2 处、`PI_PROMPT_TIMEOUT_MS` 2 处、`PiModelDeclaration` 2 处），任取一侧都会留下悬空引用或未定义符号。
  - **`openSession` 选项类型**：`entrypoint` 取本票的 `string | readonly string[]`（本票的多 `-e` 装配需要），`extraEnv` 取 [04] 的 `Record<string, string | undefined>`（与合并后 `PiSessionOptions.env` 一致；本票原 `Record<string, string>` 会让 [04] 清除环境变量的用例无法通过类型检查）。合并后该文件是本票 506 insertions 与 [04]/[13] 的 499 insertions 的并集（`git diff --numstat 5ad9af7 72baa88` = 1003 insertions / 14 deletions），两侧独有符号全部在场（本票 `phaseRoundContinuations` / `phaseRequestAnchor` / `phaseReadingSemantics`；[04]/[13] `phaseStorageRoot` / `phaseRefusedConfiguration` / `fileTextsUnder` / `writePiModels` / `CapturedBalanceCall`），无重复顶层声明、无残留冲突标记。两票都改的 `tests/harness-dock/capture-server.ts` 自动合并后同时保留本票的每请求 `CaptureStep.failureStatus`/`answerDelayMs` 与 [04] 的 `CapturedBalanceCall` + `balance.respond` 每调用脚本；其余改动面互不相交（本票只碰 `framework/adapters/pi.ts`、`extensions/model-cost/harnesses/pi/widget.ts`、dock 驱动与 3 个新测试文件）。
- **本轮集成验收**（源状态 = 合并提交 `72baa88`，工作树干净）：`bun run typecheck` → exit 0（无诊断）。`bun run test`（原始 CRLF 检出）→ 986 pass / 17 fail（110 files / 1003 tests / 269.17s / exit 1）。
- **17 例失败的定位（全部本机检出／布局前置项，与本轮合入内容无关，且与 [01]/[02]/[04] 各轮记录的特征逐项一致）**：12 例由本机 `core.autocrlf=true` 的 CRLF 检出引起——10 例在补丁物化期即报 `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff touches no file`（`codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、`model-cost-modes`、`model-cost-persistence`、`viewed-marker`、`viewed-session-host`、`viewed-session-total`、`viewed-session`），`baseline.test.ts`（`bun.lock: recorded 9e9f4833… but found 7f5c82e6…`）与 `session-driver.test.ts`（`verifyLockfile(record.sourceCombination.lockfile).matches` 为 false）各 1 例因录制 sha256 针对已提交的 LF blob、而检出为 CRLF 字节而失败；5 例为 `tests/connect-bot` 的真实面板 interop 在本 `%TEMP%` 布局下找不到同级 `omp-bot.exe`。失败分区与本次合并改动的分区（`tests/model-cost`、`tests/framework`）无一相交。
- **归一后的全仓回归**（两份 `patch.diff` 与 `bun.lock` 去 CR，去 CR 后 sha256 与 `git cat-file blob HEAD:<path>` 逐一相同：`66195465…` / `4ec9ad0d…` / `9e9f4833…`；`OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：`bun run test` → **1032 pass / 0 fail（110 files / 5879 expect() calls / 417.72s / exit 0）**，`tests/harness-dock`、`tests/model-cost`、`tests/framework`、`tests/connect-bot`、`tests/codebase-tools` 全绿。
- **处置**：本轮唯一的落库修复即上述 2 处冲突合并（提交 `72baa88`）；归一条件下全仓回归零失败，未发现本票或本次同步引入的失败，故无其它源码修复、未改动任何产品/测试文件。归一属本机检出／环境条件而非仓库内容，不入库；每次运行结束后三份文件按字节还原（sha256 与运行前逐一相同：`057e01f6…`、`294b3727…`、`7f5c82e6…`），`git status --porcelain` 为空。集成工作区（`E:/Developer/myhub/my-agent-toolkit`）未被操作；未切换分支、未新建 worktree、未 reset、未丢弃工作、未调用 retro、未合入集成分支（交宿主排队合并）。
- **未验证／限制**：实机 `bun scripts/pi-model-cost-smoke.ts`（本票 P7/P9/P18 的真实宿主证据，44 checks）与跨票据整体验收按分工留给最后独立门禁，本轮未重跑；`bun test` 范围外的真实宿主观察仍以本票证据文件为准；POSIX、真实账户、真实 TUI 绘制与跨 pi/OMP 版本仍未验证。归一后的 1032 例中 `tests/harness-dock/session-ownership-tree.test.ts` 本轮为绿——[04] 的集成轮记录过其 3 例在本机 judge 链无 native 候选时会失败（多出宿主自带 judge 请求），该套件是否通过取决于宿主 judge 链的候选来源而非本票内容。
