# 17: budget 动作与入口展示偏好

**What to build:** 实际 budget 命令保留帮助、参数规范化和动作效果；无子代理 detail 提示后立即返回，已成功接入但零子记录可以切 detail，偏好仅入口内存保存。

**Delivers:** P4, P5, P6, P47, P57（P57 仅交付本票分区；不单独完成整个 P57）

**Test owner for:** P57（仅下方 coverage partition 指定条目）。

**Blocked by:** [05：真实子入口接入与可靠会话事实](05-subagent-facts.md)、[15：整文档归档与有条件周期重置](15-period-reset.md)

**Status:** in-progress — 实现已随集成提交 `506a445ad81736798452bce9b53b98a3199d7cb1` 合入 `pi-adapter`；本轮集成验收在该提交上完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` 1162 pass / 0 fail），本轮无源码修复，本记录提交尚未合入 `pi-adapter`。实现侧的真实宿主未覆盖项见 [evidence/17-budget-actions.md](../evidence/17-budget-actions.md) 的「未覆盖 / 未验收」，仍原样成立。

## Acceptance criteria

- [ ] 从实际入口驱动空参数、空白/大小写规范化、非法参数及全部声明动作；非法参数只报帮助错误，不调用动作。
- [ ] 无子代理 detail 前后核对偏好输出、provider 出站次数、写入/发布次数及文件内容；其他动作不受提前返回影响，拥有 P57 的 detail 项。
- [ ] 成功子代理模式零记录仍切主会话 detail；不以子数量代替初始化模式。
- [ ] detail 后普通会话/模型变化保留偏好，真实新进程及适用重载回 brief，子入口固定 brief；偏好不作为 State 或持久化字段。
- [ ] 复用 15 的重置条件与效果，不另写一份动作算法；本票 owns P6 全部命令路由检查，P35–P37 事务/条件测试仍归 15。
- [ ] **P4 完整 Coverage（S2、S3）**：调用前后核对偏好对应输出、provider 请求及存储变化；提前返回不影响其他 budget 动作。
- [ ] **P5 完整 Coverage（S2）**：实际成功接入但零子记录时执行动作，核对主会话 detail；不能按子代理数量拒绝。
- [ ] **P6 完整 Coverage（S2）**：从实际操作 interface 驱动空参数、规范化匹配、非法参数与全部动作；非法参数不触发动作。重置动作的额外条件见 P37。
- [ ] **P47 完整 Coverage（S2、S3）**：detail 后普通切换、子会话自身展示和实际新进程/适用重载；核对无存储或 State 偏好字段，子会话固定 brief。无子代理模式例外按 P4。

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

- **集成同步（本轮由集成 helper 执行；本票实现提交 `480e50b`，结果 HEAD `506a445`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交（`506a445ad81736798452bce9b53b98a3199d7cb1`）合回本分支，故本分支 HEAD 即该集成提交，其父为 `99e9578`（前一集成 tip）与 `480e50b`（本票实现提交），与 `pi-adapter` tip 同一提交。**无冲突可解**：本 worktree 的 gitdir 内无 `MERGE_HEAD`/rebase/cherry-pick 状态，`git ls-files -u` 空，`git status --porcelain` 空；`git diff --stat 99e9578 HEAD` 正好是本票 14 个文件（生产/测试/文档 11 个加本票证据与两份实现日志），且 `git diff 480e50b HEAD` 对本票那 11 个生产/测试/文档文件为空（合并没有改写交付面）。未操作集成工作区、未切换分支、未新建 worktree、未 reset、未调用 retro、未自行合入集成分支。
- **本轮集成验收（HEAD `506a445`）**：`bun run typecheck` → exit 0。`bun run test` 按检出原样 → **1116 pass / 17 fail**（1133 tests / 123 files / 6069 expect() calls / 234.15s / exit 1），17 例全为本机环境前置项（5 例缺 `omp-bot.exe` 的默认同级路径、10 例 CRLF 检出使 `patch.diff` 物化失败、2 例锁文件 sha 按 LF blob 录制），无一落在本票合入的文件上。归一检出（`bun.lock` 与两份 `patch.diff` 还原为已提交 LF 字节，sha256 与 `git cat-file blob HEAD:<path>` 逐一相等）+ `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe` 下 `bun run test` → **1162 pass / 0 fail**（123 files / 6655 expect() calls / 399.16s / exit 0）；归一比原样多出的 29 例正是那 10 个 dock 文件在文件级失败后未注册的用例。
- **本轮修复：无源码修复。** 无一条失败由本票合入引入（本票 14 个文件与全部失败文件 `tests/connect-bot/**`、`tests/harness-dock/**` 交集为空；本票的进程内消费者 `tests/model-cost` 全分区在归一后的全仓运行中全绿，含本票新增 `pi-budget-actions` 的 6 用例与既有 `pi-period-reset`／`pi-session-accounting`／`pi-session-span`／`detail-tree`）；归一后零失败说明没有失败被上述环境例掩盖，故不改仓库内容（`.gitattributes` 或按行尾鲁棒的解析属装配/宿主验证票）。运行后三处文件按字节恢复 CRLF 检出状态，工作树只余本记录与证据/日志改动。
- **未验证／限制**：实现侧 evidence 的「未覆盖 / 未验收（不声称通过）」原样成立——真实 pi 的 `/reload` 未驱动、`scripts/pi-session-accounting.ts` 的 6 条 FAIL 不认领、真实账户侧 provider 事实（P53）与 TUI 可读性（P52）未核对；实机 smoke、跨票据整体验收与 P51/P52/P53 人类验收属最终独立门禁，本轮未执行。
- 详细命令、日志路径与逐条失败归因见 [evidence/17-budget-actions.md](../evidence/17-budget-actions.md) 的「集成同步与合并后全仓回归」。
