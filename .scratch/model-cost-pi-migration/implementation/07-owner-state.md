# 07: Owner State 实时读取、降级与恢复

**What to build:** 扩展在语义使用点取得 Owner 当前 State，断连时以声明默认值继续，恢复只影响后续操作；观察范围扩大不带来写权或 Owner 效果权限。

**Delivers:** P14, P15, P16, P17, P57（P57 仅交付本票分区；不单独完成整个 P57）

**Test owner for:** P57（仅下方 coverage partition 指定条目）。

**Blocked by:** [06：受目标与寿命校验的本机接入](06-local-process-connection.md)

**Status:** in-progress — 实现已随集成提交 `8b96a54a47219f54b25b39b7899e64b8bcc76853` 合入 `pi-adapter`；本轮集成验收在该提交上完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` 1131 pass / 0 fail），本轮无源码修复，本记录提交尚未合入 `pi-adapter`。真实宿主未覆盖项见 [evidence/07-owner-state.md](../evidence/07-owner-state.md) §5，仍原样成立。

## Acceptance criteria

- [ ] 同进程和真实独立进程在子启动后更新 Owner，核对后续公共消费与同次处理一致快照，不使用启动值或持久化旧值替代。
- [ ] 区分权威 false、失败和 inheritance none；memory 不从旧持久化恢复，默认值不写回 Owner，也不标为成功读取。
- [ ] 制造真实断开/恢复与可控故障，验证有限等待、同目标合并、有上限退避、无操作重放、健康后无持续恢复轮询；可靠失效或处置后不复活。
- [ ] Owner/session 订阅观察同一子事件，分别尝试子侧、失效句柄和 Owner 正常操作；用真实写操作/外部效果计数证明越权无效，拥有 P57 的观察权限项。
- [ ] 迁移受影响共同 State 消费者并运行 OMP 相应回归；恢复任务释放随本票交付。
- [ ] **P14 完整 Coverage（S1）**：同进程和独立进程在子启动后修改 Owner，核对后续公共消费结果；同次语义处理使用一致快照，不用启动或持久化旧值替代。
- [ ] **P15 完整 Coverage（S1）**：区分权威 false、读取失败及 inheritance none；核对可见消费和 Owner 值，memory 字段不从旧持久化值恢复，不宣称默认值是成功读取。
- [ ] **P16 完整 Coverage（S1、S2）**：真实独立进程断开/恢复及可控故障；核对操作次数、后续新值、有限等待、同目标合并和有上限退避。健康后无持续恢复轮询，可靠失效/处置后不复活。
- [ ] **P17 完整 Coverage（S1）**：Owner/session 两种订阅观察同一子事件；尝试子侧或失效句柄越权操作并核对未生效，Owner 正常操作仍成立。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

### P57 — coverage partition

P57 跨票交付，下表按 Coverage item 唯一分配交付票与测试负责人；全部七项完成后 P57 才整体完成。各负责票必须实际观察外部效果，不能仅以 widget 数值不变代替。

| Coverage item | Ticket | Test owner |
|---|---|---|
| P4：无子代理 detail 提前返回 | [17：budget 动作与入口展示偏好](17-budget-actions.md) | 17 |
| P17：观察不扩大写权或 Owner 效果权限 | [07：Owner State 实时读取、降级与恢复](07-owner-state.md) | 07 |
| P33：只读刷新不提交在途消费 | [04：共同存储并发提交与只读同步](04-shared-storage.md) | 04 |
| P45：峰谷重绘无请求/记账/写盘 | [19：峰谷边界无副作用重绘](19-season-boundary.md) | 19 |
| P48：共享准备、工厂及根专属效果不重复 | [20：完整装配的共享准备与处置验证](20-assembly-lifecycle.md) | 20 |
| P49：处置后旧资源不再产生效果 | [20：完整装配的共享准备与处置验证](20-assembly-lifecycle.md) | 20 |
| P51：禁止的重复工作和健康空闲轮询不新增 | [22：效率前后对照与复杂度判断](22-efficiency-acceptance.md) | 22 |

## Comments

- **集成同步（本轮由集成 helper 执行；本票 tip `8969f37`，结果 HEAD `8b96a54`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交合回本票分支，故本分支 HEAD 即集成提交 `8b96a54a47219f54b25b39b7899e64b8bcc76853`，其父为 `a0e5eb8`（前一集成 tip，已含 06/08/09 三条线）与 `8969f37`（本票实现提交）；merge-base 为 `38888c6`（本票起点）。**无冲突可解**：本 worktree 的 gitdir（`E:/Developer/myhub/my-agent-toolkit/.git/worktrees/hyper-ticket-EwXqpz`）内没有 `MERGE_HEAD`/`MERGE_MSG`/`rebase-merge`/`rebase-apply`/`CHERRY_PICK_HEAD`，全仓无冲突标记（`git grep -l -E '^(<<<<<<<|>>>>>>>|=======$)'` 无命中），`git status --porcelain` 空，故本轮无冲突修复、未改写历史、未操作集成工作区/未切换分支/未新建 worktree。
- **合入内容逐项核对**：`git diff --stat 8b96a54^1 8b96a54` = **22 files / 1792 insertions / 57 deletions**，正好是本票那 22 个文件（新增 `framework/core/followed-owners.ts` +197、`tests/framework/owner-follow.test.ts` +660、`owner-follow-processes.test.ts` +217、`tests/framework/support/followed-owner-child.ts` +175、`followed-owner-child-runner.ts` +123；修改 `framework/core/state.ts`、`framework/behaviors/{state-scope,session-events,marker}.ts`、`framework/adapters/pi.ts`、`extensions/codebase-tools/harnesses/pi.ts` 与 `README.md`、`framework/{README,GLOSSARY}.md`、`framework/docs/{framework-capabilities,harness-support}.md`、`tests/framework/support/{harness-port-double,pi-surface-double}.ts` 与本票 evidence 三份），与实现报告的文件清单一致。**两面都改到的只有 3 个文件**（集成侧 08/09 的改动）：`framework/adapters/pi.ts`、`framework/docs/harness-support.md`、`tests/framework/support/pi-surface-double.ts`；**双向 numstat 校验**——对集成侧 `git diff --numstat 8b96a54^1 8b96a54 -- <这 3 个文件>` = `33/12`、`2/2`、`2/0`，与本票分支自身贡献 `git diff --numstat 38888c6 8969f37 -- <同 3 个文件>` 逐一相同（本票改动一字未丢）；对本票侧 `git diff --stat 8969f37 8b96a54 -- <同 3 个文件>` 只有纯增行（`+17`、`1+1-`、`+86`），即集成侧改动只做加法。合并结果里两侧特性同时在场（`followedOwner*` 与 09 的 Round 符号都在 `framework/adapters/pi.ts`）。
- **本轮集成验收（HEAD `8b96a54`，工作树只有本票改动）**：`bun run typecheck` → exit 0（无诊断）。`bun run test`（本机原始 CRLF 检出、未设 `OMP_BOT_BINARY`）→ **1085 pass / 17 fail**（119 files / 1102 tests / 5794 expect() calls / 230.06s / exit 1；日志 `.cache/integrate-07/fulltest-as-checked-out.log`）。17 例无一条由本票合入引入，与 [02](02-pi-main-session.md)/[03](03-request-pricing-rounds.md)/[04](04-shared-storage.md)/[05](05-subagent-facts.md)/[08](08-session-accounting.md)/[09](09-background-rounds.md)/[12](12-session-span.md)/[13](13-deepseek-balance.md)/[24](24-provider-account-acceptance.md) 各轮记录逐项同类：
  - **5 例** `tests/connect-bot/`（`budget-regression`、`harness-exit-budget`、`panel-registration-lifecycle` ×3）报 `the interop run needs the actual omp-bot panel, but no binary is at C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`——本 worktree 位于 `%TEMP%`，`tests/connect-bot/support/omp-bot.ts:82` 的默认同级路径不存在（抛点在 `startOmpBot`，早于任何 State 路径被加载）。
  - **10 例** `tests/harness-dock/`（`codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、`model-cost-modes`、`model-cost-persistence`、`viewed-marker`、`viewed-session-host`、`viewed-session-total`、`viewed-session`）在补丁物化期报 `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff touches no file`（`host-patch-artifact.ts` 的 `patchTouchedFiles` 按 LF 切行，CRLF 检出使 `diff --git` 头匹配不上）。
  - **2 例** `baseline.test.ts` 与 `session-driver.test.ts` 是同一处锁文件校验：记录值 `a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6` 逐字节等于 `HEAD:bun.lock` 的已提交 LF blob，而工作区文件是同一内容的 CRLF 检出（`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`）。
  - 用例数与前一集成 tip 自洽：119 files = [09] 的 117 + 本票两个新测试文件；1102 tests = [09] 的 1087 + 本票 15 例（S1 12 + S2 3）。
- **归一后的全仓回归**（三处工作区文件还原为已提交 LF blob 字节——`bun.lock` `a5d37ab2…`、`viewed-session` `66195465…`、`codex-response-boundary` `4ec9ad0d…`，三份都是 `tr -d '\r'` 后 `sha256sum` 与 `git cat-file blob HEAD:<path>` 逐一相等；并设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：**1131 pass / 0 fail**（119 files / 6379 expect() calls / 344.10s / exit 0），`tests/harness-dock`、`tests/connect-bot`、`tests/model-cost`、`tests/framework`、`tests/codebase-tools` 全绿；日志 `.cache/integrate-07/fulltest-normalized.log`。未归一运行少计的 29 例（1102 → 1131）正是那 10 个 dock 文件在文件级失败后未注册的用例。
  - 应 [06](06-local-process-connection.md) 本轮集成轮之问另取一条可归属读数：`bun test tests/harness-dock/session-ownership-tree.test.ts` → **3 pass / 0 fail**（65 expect / 10.88s；日志 `.cache/integrate-07/ownership-tree.log`），该文件在未归一运行里也不贡献失败，与 [06] 的结论一致——这 3 例在本机能否成立取决于启动环境是否带 `TYPESAFE_API_KEY`：带则 judge 角色链解析到 native 候选、每次 spawn 不追加会话模型为判定候选（断言 `5|7` 成立），不带则每 spawn 多出 3 条判定请求（实收 `11|13`）。本 worktree 的工具 shell 带该变量。
  - 单文件读数：`bun test tests/connect-bot/panel-registration-lifecycle.test.ts`（设 `OMP_BOT_BINARY`）→ **3 pass / 0 fail**（39 expect / 36.83s；日志 `.cache/integrate-07/connect-bot-single.log`）。
- **运行方式的两条环境事实（本轮实测，供后续集成轮复用）**：全仓运行必须在工具自身的 shell 里执行（本机为 Git Bash：`git` = `D:\Program Files\Git\cmd\git.exe`、`bun` = `D:\nvm4w\nodejs\bun.cmd`）。改用 `bash <script>.sh` 会落到 **WSL bash**（`C:\WINDOWS\system32\bash.exe`），此时：(a) 脚本内的 `git` 无法解析本 worktree 的 gitdir（`fatal: not a git repository: /mnt/c/.../E:/Developer/myhub/my-agent-toolkit/.git/worktrees/hyper-ticket-EwXqpz`），`git cat-file blob HEAD:<path> > <path>` 这类重定向于是把目标文件截成 0 字节（本轮第一次归一即如此，该轮作废；三份文件已按字节还原，作废日志留 `.cache/integrate-07/fulltest-attempt1-truncated-normalization.log`）；(b) WSL→Windows 的进程边界不传递 `OMP_BOT_BINARY`（脚本内 `bun -e` 读到 `undefined`），那 5 例 connect-bot 会以默认路径失败、看起来像「本机缺件」（同一条命令在工具 shell 内运行时变量可见、5 例全绿）。归一用 `tr -d '\r'` 并与 blob sha 逐一核对；运行结束后 `git checkout -- <三份文件>` 还原检出态，`sha256sum` 与运行前逐一相同（`e7ed487b…`/`057e01f6…`/`294b3727…`），`git status --porcelain` 空。
- **本轮修复**：**无源码修复** —— 17 例全属本机检出/布局前置项，无一条由本票合入引入，归一后零失败（说明没有失败被上述 17 例掩盖），故不改仓库（按 [04](04-shared-storage.md)/[05](05-subagent-facts.md)/[24](24-provider-account-acceptance.md) 记录，`.gitattributes` 或按行尾鲁棒的解析属装配/宿主验证票，不由本票代改）。唯一改动是本记录。
- **同步后集成分支又前进**：`pi-adapter` 现为 `923fb54739488a6225288e445db1d94acc5ac66a`（[10](10-terminal-rounds.md)/[11](11-subagent-runtime.md)/[06](06-local-process-connection.md) 各轮合并与其记录提交），`git merge-base --is-ancestor 8b96a54 pi-adapter` 为真（本票的集成提交在集成分支线上）。相对 `8b96a54`，本票 22 个文件里有 4 个被后续合并改动：`framework/adapters/pi.ts`（8 行纯删除： [11] 移除 `onSubagentRuntime` 这条执行时长轴，与本票 `follow` 接线无关）、`framework/docs/framework-capabilities.md` 与 `framework/docs/harness-support.md`（[11] 的文档重构）、`tests/framework/support/harness-port-double.ts`（[11] 的 double 重构）。本票交付面在该 tip 上仍在场：`framework/adapters/pi.ts` 仍 import `FollowedAccessReader` 并有 `follow` 绑定（第 13/694/735 行）、`extensions/codebase-tools/harnesses/pi.ts` 仍声明 `childEntry`（第 27 行）、`framework/docs/harness-support.md` 的 `state.subagent-follow` 行仍在（第 205 行，行号因 [11] 的编辑平移）。本记录只与 `.scratch/model-cost-pi-migration/implementation/07-owner-state.md` 相交，把本记录提交合入该 tip 不预期冲突。
- **未验证／限制（交最终独立门禁与 [25](25-evidence-scope-audit.md)）**：本机 `core.autocrlf=true` 的 CRLF 检出与 `%TEMP%` 布局下 `omp-bot.exe` 的默认路径仍是本机环境事实，未以仓库改动修正，故上面的 0 fail 只适用于归一后的字节状态与环境变量。本轮按分工未跑实机 smoke、未跑任何付费调用、未做跨票据整体验收（实机 smoke 与整体验收属最终门禁），也未跑本票「真实 pi 双进程跟随」这条从未落地的真实宿主脚本。实现报告 §未验证／未覆盖 的各条**原样成立、未因本轮全仓绿而改变**：真实 pi 进程加载本装配、由真实 provider spawn 的子会话跨进程跟随 Owner **未运行**（本票跨进程事实来自两个真实独立进程 + 真实命名管道/套接字）；`tests/harness-dock` 的真实宿主路径在本票实现轮未跑；POSIX 未执行（本机 win32）；真实 TUI 观感与 provider 账户侧核对属 [23](23-tui-acceptance.md)/[24](24-provider-account-acceptance.md) 与人类验收；`extensions/codebase-tools/harnesses/pi.ts` 的 `childEntry` 真实宿主加载留给 [21](21-consumer-regression.md)。
