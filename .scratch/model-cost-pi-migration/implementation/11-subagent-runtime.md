# 11: 累计活动耗时与旧值兼容

**What to build:** 两端按已观察 Working/Round 累计子代理活动耗时，排除活动间 Idle，保存多次活动及仅耗时增长；旧 runtimeMs 原值保留并继续累计。

**Delivers:** P24, P25, P27

**Blocked by:** [04：共同存储并发提交与只读同步](04-shared-storage.md)、[09：后台委派与公开保活的 Round 接续](09-background-rounds.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 用独立受控区间算例及真实宿主活动覆盖模型、工具、委派等待、Idle、续跑和正常结束；不采第三方或旧 OMP 最终 duration。
- [ ] 同周期多次累计、仅耗时增长且金额不变均能提交并由新进程恢复，不只显示最后一次。
- [ ] 独立旧文档覆盖缺值、合法零、已有 runtimeMs 与合法新缺口信息；缺可选字段不判损坏、不一律标不完整，也不凭缺字段证明历史完整。
- [ ] 不新增 execution 时间轴、运行中持续刷新或执行器精确时间要求；已知缺口不被成功覆盖的完整场景由 16 负责，本票不得丢弃已有标记。
- [ ] **P24 完整 Coverage（S1、S2、S3）**：受控时间轴给出独立区间算例，对照 Working/Round 与真实宿主场景；不采第三方最终 duration，不要求准备阶段精确时间，不把精度要求施加到执行器。
- [ ] **P25 完整 Coverage（S2、S3）**：续跑、正常活动结束以及仅耗时增长而费用不变；读回提交和新进程展示，不能只显示最后一次或因费用未增长漏存。
- [ ] **P27 完整 Coverage（S2、S3）**：独立旧文档写入后由新版读/更新/恢复；覆盖缺值、合法零、有 runtimeMs 和已知新缺口。不要求旧读取器理解新字段或旧新混跑。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **集成同步（本轮由集成 helper 执行；本票实现 tip `fea87c7`，结果 HEAD `0c8db96`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交合回本票分支，故本分支 HEAD 即集成提交 `0c8db961263e5dc7b63b9c59437f3b7bd06acd1c`，其父为 `8b96a54`（前一集成 tip，[07](../evidence/07-owner-state.md) 合并之后的树）与 `fea87c7`（本票实现提交）。**无冲突可解**：worktree gitdir 内没有 `MERGE_HEAD`/`MERGE_MSG`/rebase/cherry-pick 状态目录，`framework`/`tests`/`scripts`/`extensions`/`entrypoints` 无冲突标记（`git grep -E "^(<<<<<<<|>>>>>>>|=======$)"` 无命中），`git status` 空，故本轮无冲突修复、未改写历史。
- **合入内容逐项核对**：`git diff --stat HEAD^1 HEAD` = 26 files / 732 insertions / 2018 deletions，与 `git show --stat fea87c7` 逐项相同——本轮合并只加入本票改动，集成侧没有改写本票内容。本票拥有的 `extensions/model-cost/**`（`shared-logic/subagent-runtime.ts`、`consumption-document.ts`、`request-accounting.ts`、`runtime.ts`、`consumption-store.ts`）与 `tests/model-cost/subagent-runtime.test.ts` 在 HEAD 上与 `fea87c7` 逐字节相同（`git diff fea87c7 HEAD -- extensions/model-cost` 无输出；被整文件删除的 `framework/adapters/omp/subagents.ts` 与 `tests/framework/subagent-runtime.test.ts` 在 HEAD 上仍不存在，`framework/core/protocol.ts` 仍存在但其中的 `subagent_runtime` 轴已不在）。两侧都改的只有 4 个文件，且两类改动都在：`framework/adapters/pi.ts`（本票 −8；07 侧 +33/−12）、`framework/docs/framework-capabilities.md`（本票 +6/−84；07 侧 +44/−9）、`framework/docs/harness-support.md`（本票 +5/−3；07 侧 +2/−2）、`tests/framework/support/harness-port-double.ts`（本票 +2/−48；07 侧 +8）。逐字面复核迁移完整性：全仓已无 `onSubagentRuntime` / `deliverSubagentRuntime` / `subagent_runtime` 引用，`framework/docs/harness-support.md` 只剩 `execution.subagent-duration` 那一行的 superseded 记录（同时说明该供给面不再被消费）。
- **本轮集成验收（HEAD `0c8db96`，工作树只有本票改动）**：`bun run typecheck` → exit 0（无诊断）。归一检出（见下一条）后 `bun run test` → **1110 pass / 0 fail**（118 files / 6304 expect() calls / 398.11s / exit 0）；本轮 `tests/` 下全部 118 个测试文件即 `tests/harness-dock` 23 + `tests/model-cost` 32 + `tests/framework` 38 + `tests/connect-bot` 18 + `tests/codebase-tools` 7，日志 `.cache/integrate-11/fulltest-normalized.log`。本票自身分区 `bun test tests/model-cost/subagent-runtime.test.ts` → **10 pass / 0 fail**（66 expect，0.37s）；另单独复跑 [12](12-session-span.md) 一行 dock 文件 `tests/harness-dock/model-cost-session-span.test.ts` → **3 pass / 0 fail**（11.57s，用于排除全并行下该文件 `.lock` 目录断言的负载抖动）。
- **全仓绿的前置（本机检出／布局事实，未以仓库改动修正，故该 0 fail 不读作它们已被修好）**：本 worktree 位于 `%TEMP%`，connect-bot 真实面板的默认同级路径 `C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe` 不存在，本轮按各轮记录设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`；`bun.lock` 的检出字节是 CRLF（11214 bytes / 83 CRLF 行）而已提交 blob 是 LF（11131 bytes / sha256 `a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6`），本轮以 `rm` + `git -c core.autocrlf=false checkout --` 还原为 blob 字节（`git status` 仍空——单纯 `checkout --` 无效：autocrlf 的 clean 过滤把 CRLF 工作副本判成与索引一致，git 不重写该文件）；两份 `host-patches/*/patch.diff` 本 worktree 已是已提交 LF blob 字节（`4ec9ad0de31b0796…` codex-response-boundary / `66195465cc0c56c7…` viewed-session），故本轮 dock 物化没有出现 CRLF 那一类失败。`.gitattributes` 或按行尾鲁棒的解析仍属装配/宿主验证票（同 [04](04-shared-storage.md)/[05](05-subagent-facts.md)/[08](08-session-accounting.md) 的记录）。
- **本轮无源码修复**：归一后再无失败，说明上述前置之外没有被掩盖的问题，故本票分支上本轮唯一改动是本记录，工作树干净。
- **未覆盖项（保持未验收，交最终独立门禁）**：真实 pi 宿主的活动耗时（真实后台子会话按自身 Round 区间累计）、真实 OMP 后台/独立进程子会话、活动跨周期边界等仍按实现报告 `implement-5b43b3aa-af5c-4479-96d8-0ba1f446a8f9.md` 的 `unverified_or_open` 保持未验收；`scripts/efficiency-baseline.ts` 的迁移入口本轮未运行（P51/22 需重录对照）；实机 smoke、付费调用与跨票据整体验收属最终门禁与人类验收。
