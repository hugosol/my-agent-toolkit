# 08: 一次记账与直接父 Session 汇总

**What to build:** 主子重复观察、并发与续跑时每个已观察请求只累计一次，子消费仅沿真实直接父 Session 链汇总，父 Round 不吸收子消费，当前树不挂入无关会话。

**Delivers:** P8, P10, P40

**Blocked by:** [05：真实子入口接入与可靠会话事实](05-subagent-facts.md)

**Status:** ready-for-human（真实宿主缺口待权威决定；实现已随集成提交 `19cc4abfc385f03a882a67acc06e6ed0a0f91335` 合入 `pi-adapter`，本轮集成验收在该提交上完成且无源码修复，本记录提交尚未合入 `pi-adapter`）

## Acceptance criteria

- [ ] 独立列出主子、嵌套、并发、多 Turn、工具继续、跨父轮续跑及晚到请求的身份与金额；对照各自 Round、自身/含后代 Session、保存与新进程恢复。
- [ ] 重复事件跨 round 交付，组合根观察、子自身记账与文档同步；去重标记留到观察实例销毁而不在 round_end 清空或落盘。
- [ ] 同文档混放另一根和另一 harness，核对真实后代、直接父缩进、名称回退与自身值；含后代合计是视图而不是第二笔消费。
- [ ] 范围仅为已观察请求一次准入；不新增持久化请求账本、离线补账或崩溃不丢账保证。
- [ ] **P8 完整 Coverage（S1、S2、S3）**：主子、嵌套、并发、续跑及重复事件组合；跨 round 重复交付仍不能重计。合并后读取保存值和新进程恢复值。覆盖范围受本节一次记账约定约束。
- [ ] **P10 完整 Coverage（S1、S2、S3）**：多 Turn、工具继续、子会话跨父轮续跑和晚到结果；独立列出各请求所属会话与金额，核对自身/含后代 Session 和父子各自 Round。
- [ ] **P40 完整 Coverage（S1、S2、S3）**：当前树、另一根及另一 harness 的独立记录混放；核对直接父缩进、自身/含后代值及名称回退，不挂入无关会话。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## 执行记录（08，首轮）

**已交付**：`tests/model-cost/pi-session-accounting.test.ts`（7 例，S1/S2/S3，全绿）、`scripts/pi-session-accounting.ts`（真实宿主记录）、`evidence/08-session-accounting.md`（完整证据）。`bun test tests/model-cost` = 401 pass / 0 fail；`bun test tests/framework` = 430 pass / 0 fail；`bun run typecheck` 无输出。本票未改 `extensions/**` 与 `framework/**`。

**状态 `ready-for-human` 的原因（真实宿主缺口，需权威决定，不静默补丁）**：pi 上的一次真实后台委派里，子进程**确实加载了本扩展**（provider 自己的启动证据 `launchResolvedExtensions.required=["model-cost"]`）并**确实跑了一次请求**（端点计数、子会话文件、运行元数据三方一致），但子会话**自己的消费从未落进共享文档**：`framework/behaviors/binding.ts:315` 只在 `owner.kind === "owner"` 的会话开始上初始化扩展，而子进程里唯一的会话其 owner 是跨进程解析出的根会话（`inherited`），因此初始化（进而记账周期）不发生。这使 P8/P10 覆盖里的"子自身记账 + 文档同步"这一半在跨进程（后台）委派上完全没有兑现。修法属于公共生命周期语义或 spec §6 的跨进程观察推送（[06] 本机通信），都会影响 OMP 与其它消费者（P50），按票据约束带回权威决定；`scripts/pi-session-accounting.ts` 的该条期望在决定落定前保持 FAIL（未验收）。

## Comments

- **集成同步（本轮由集成 helper 执行；本票 tip `77d9de4`，结果 HEAD `19cc4ab`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交合回本票分支，故本分支 HEAD 即集成提交 `19cc4abfc385f03a882a67acc06e6ed0a0f91335`，其父为 `38888c6`（前一集成 tip，05 合并之后）与 `77d9de4`（本票实现提交）。**无冲突可解**：worktree gitdir 内没有 `MERGE_HEAD`/`MERGE_MSG`/rebase/cherry-pick 状态目录，全仓无冲突标记（`git grep -E "^(<<<<<<<|>>>>>>>|=======$)"` 无命中），`git status` 空，故本轮无冲突修复、未改写历史。**合入内容逐项核对**：`git diff --stat HEAD^1 HEAD` = 4 files / 1959 insertions / 1 deletion，正好是本票四个文件（`tests/model-cost/pi-session-accounting.test.ts` 1157、`scripts/pi-session-accounting.ts` 687、`evidence/08-session-accounting.md` 108、本票实现文件 8），且与本票 tip `77d9de4` 逐字节相同（`git diff --name-only 77d9de4 HEAD -- <本票四文件>` 为空），合并没有回退任何一侧。集成工作区（`E:/Developer/myhub/my-agent-toolkit`）未被操作；未切换分支、未新建 worktree、未 reset、未丢弃工作、未调用 retro、未合入集成分支。
- **同步后集成分支又前进**：`pi-adapter` 现为 `8a631cb`（[09](09-background-rounds.md) 后台 Round 那条线的 `bd43a07`、`f2f2484` 与其合并提交），改动集中在 `framework/adapters/pi.ts`、`framework/adapters/pi/{nicobailon,round}.ts`、`framework/docs/harness-support.md`、`tests/framework/*`、`scripts/pi-background-round-smoke.ts`；与本票四个文件无交集（`git diff --stat 19cc4ab..pi-adapter -- <本票文件>` 只含 `evidence/09-background-rounds.md`），故把本记录提交合入该 tip 不预期冲突。
- **本轮集成验收（源状态 `19cc4ab`，工作树只有本票改动）**：`bun run typecheck` → exit 0（无诊断）。`bun run test`（本机原始 CRLF 检出、未设 `OMP_BOT_BINARY`）→ **1058 pass / 17 fail**（116 files / 1075 tests / 5675 expect() calls / 220.74s / exit 1；日志 `.cache/integrate-08/fulltest-as-checked-out.log`）。17 例全部是本机检出／布局前置项，与本票合入内容无关，且与 [05](05-subagent-facts.md)/[24](24-provider-account-acceptance.md) 各轮记录同类：
  - **5 例**是 `tests/connect-bot/` 的真实面板 interop：本 worktree 位于 `%TEMP%`，其默认同级 `omp-bot.exe` 路径不存在（`C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`），报 `the interop run needs the actual omp-bot panel, but no binary is at …`（P23 冻结协议、P24 删除行、P25 窗口、P26 客户端超时、P27 exit budget）。
  - **12 例**是本机 `core.autocrlf=true` 的行尾检出：10 例 `tests/harness-dock/`（`codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、`model-cost-modes`、`model-cost-persistence`、`viewed-marker`、`viewed-session-host`、`viewed-session-total`、`viewed-session`）在补丁物化期报 `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff touches no file`（`tests/harness-dock/host-patch-artifact.ts:223` 的 `patchTouchedFiles` 按 `\n` 切行，行尾 CR 使 `diff --git` 头一个都匹配不上）；另 2 例是 `baseline.test.ts` 与 `session-driver.test.ts` 的同一处锁文件校验：记录值 `a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6` 逐字节等于 `git cat-file blob HEAD:bun.lock` 的已提交 LF 字节，而工作树文件是**同一内容**的 CRLF 检出（`git cat-file blob HEAD:bun.lock | sed 's/$/\r/' | sha256sum` = 工作树 `e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`，逐一相同；`git ls-files --eol bun.lock` = `i/lf w/crlf`），即行尾前置项而非记录失配——本票合入未改 `bun.lock`（`git log -3 -- bun.lock` 最近一次仍是 05 的 `2928430`）。
- **本轮无源码修复**：归一后再无失败，说明上述 17 例之外没有被其它失败掩盖的问题；本票自身分区 `bun test tests/model-cost/pi-session-accounting.test.ts` → **7 pass / 0 fail（exit 0）**，并含在下面的全仓绿里。故本轮只提交本记录，工作树干净。
- **归一后的全仓回归**（三份文件还原为已提交 LF blob 字节——`a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6`（`bun.lock`）/ `4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d`（codex-response-boundary）/ `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b`（viewed-session）——并设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：**1104 pass / 0 fail**（116 files / 6260 expect() calls / 397.05s / exit 0），`tests/harness-dock`、`tests/connect-bot`、`tests/model-cost`、`tests/framework`、`tests/codebase-tools` 全绿；日志 `.cache/integrate-08/fulltest-normalized.log`。该 0 fail 同时说明未归一运行少计的 29 例（1075 → 1104）正是那 17 例在文件级失败后未计入的用例。运行结束后三份文件按字节恢复运行前状态（sha256 与运行前逐一相同：`e7ed487b216f…` / `294b37277539…` / `057e01f615c7…`，`git ls-files --eol` 复现 `i/lf w/crlf`），`git status` 空，未提交任何环境改动。
- **未验证／限制（交最终独立门禁与 [25](25-evidence-scope-audit.md)）**：本机 `core.autocrlf=true` 的 CRLF 检出与 `%TEMP%` 布局下的 `omp-bot.exe` 默认路径仍是本机环境事实，未以仓库改动修正（按 [04](04-shared-storage.md)/[24](24-provider-account-acceptance.md) 记录，`.gitattributes` 或按行尾鲁棒的解析属装配/宿主验证票）；本轮按分工未跑本票真实宿主脚本（`bun scripts/pi-session-accounting.ts`）、未跑任何付费调用、未做跨票据整体验收——实机 smoke 与整体验收属最终门禁。实现轮记录的真实宿主缺口（`framework/behaviors/binding.ts:315` 只在 `owner.kind === "owner"` 上初始化，跨进程委派的子消费不落账）**仍原样成立**，本票仍为 `ready-for-human`，本轮全仓绿不得读作该缺口已通过。
