# 19: 峰谷边界无副作用重绘

**What to build:** 峰谷边界只更新当前 UI 的时间相关展示，不发网络请求、不记账、不写盘，每个 UI 只保留一个单次等待且释放时取消。

**Delivers:** P45, P57（P57 仅交付本票分区；不单独完成整个 P57）

**Test owner for:** P57（仅下方 coverage partition 指定条目）。

**Blocked by:** [18：两端原生展示与实时 context](18-native-presentation.md)

**Status:** in-progress — 实现已随集成提交 `1ccc44300ef99d7d9f73569aa59f9f60a8895fd9` 合入 `pi-adapter`，宿主已把该提交合回本分支，故本分支 HEAD 即该提交（与 `pi-adapter` 同 tree）；本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` 1187 pass / 0 fail / exit 0），本轮无源码修复。证据：`../evidence/19-season-boundary.md`（集成同步与合并后回归见其 §7，未覆盖项见其 §6 与 §7 的更正）。

## Acceptance criteria

- [x] 受控时钟与真实 UI 生命周期覆盖边界含端点、阻塞后重算、holiday、无 UI、主子及处置；不重放错过边界。
- [x] OMP 使用宿主管理 timer，pi 自持并清理；子侧和无 UI 不建等待，重绘不读文件或改变权威累计。
- [x] 本票拥有 P57 的边界重绘项：独立比较网络、记账、文件发布计数与文件前后内容，另核对同一 UI 同时只有一个等待。
- [x] **P45 完整 Coverage（S2、S3）**：可控时钟与真实 UI 生命周期覆盖边界包含端点、阻塞后重算、holiday、无 UI、主子和处置；独立观察请求/文件不变，一个 UI 仅一等待，子侧不另建。

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

- **集成同步（本轮由集成 helper 执行；本票末提交 `d060b8d`，结果 HEAD `1ccc44300ef99d7d9f73569aa59f9f60a8895fd9`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交合回本分支，故本分支 HEAD 即 `1ccc443`，且 `git rev-parse HEAD pi-adapter` 同为该提交、两侧 tree 同为 `a76b095a01425e1417ce1e5a565f1543df131efd`（`git diff --stat pi-adapter HEAD` 空）。`git ls-files -u` 0 条未合并路径，本 worktree 的 gitdir 内没有 `MERGE_HEAD`／rebase／cherry-pick 状态。合入内容逐项核对：`git diff --stat 140a88c HEAD`（= 22 files / 818 insertions / 77 deletions）与 `git diff --stat df00a19 d060b8d` **逐项相同**，且 `git diff d060b8d HEAD -- extensions framework tests scripts entrypoints package.json tsconfig.json` 为空 —— 本票 22 个文件在合入树里的字节与本票分支逐一相同。
- **本轮集成验收（HEAD `1ccc443`）**：`bun run typecheck` → exit 0。按检出原样 `bun run test` → **1141 pass / 17 fail**（126 files / 1158 tests / 6201 expect / 229.92s / exit 1），17 例全为本机检出/布局前置项（5 例缺 `OMP_BOT_BINARY` 默认路径上的面板二进制、10 例 `host-patches/*/patch.diff` 因 CRLF 检出报 `touches no file`、2 例 `bun.lock` 的 LF blob sha 与 CRLF 工作区不符），且全部落在本票**未触碰**的文件（`tests/connect-bot/**`、`tests/harness-dock/**`）上。归一检出（三处文件还原为已提交 LF blob 字节）并设 `OMP_BOT_BINARY` 后 `bun run test` → **1187 pass / 0 fail**（126 files / 6787 expect / 391.09s / **exit 0**；比原样多出的 29 例正是那 10 个 dock 文件在文件级失败后未注册的用例）。两轮 pass 之差（+10）恰为本票新增的 `tests/model-cost/pi-season-boundary.test.ts`，两轮均无一例失败来自本票的文件。日志：`../evidence/logs/19-season-boundary-integration.log`、`…-normalized.log`、`…-typecheck.log`；完整陈述见 [证据 §7](../evidence/19-season-boundary.md)。
- **本轮修复：无源码修复。** 无一条失败由本票合入引入；归一后零失败说明没有失败被这些环境例掩盖，故不改仓库内容。行尾鲁棒解析或 `.gitattributes` 属装配/宿主验证范围（同类记录见 17、18 两轮），不在本票内改动。
- **对证据 §6 的更正**：§6 记的「OMP 真实宿主（dock）回归本 worktree 无法启动」是 CRLF 检出造成的物化前置，不是本票行为的问题 —— 归一检出下 `tests/harness-dock/**` 的 10 个文件在合并后的树上物化、注册并通过。但该通过仍**不构成**峰谷边界等待本身在真实 OMP 宿主上的断言（dock 用例不断言该等待的 arming/取消），本票对该行为的证据仍是可控时钟 + 真实前端/生命周期与 `boundary-timer.test.ts` 的记录式托管 timer。
- **运行后状态**：三处文件按字节恢复原 CRLF 检出状态（sha256 与运行前逐一相同），`git status` 只余本轮记录改动；未操作集成工作区（`E:/Developer/myhub/my-agent-toolkit`）、未切换分支、未新建 worktree、未 reset、未调用 retro，也未自行合入 `pi-adapter`（合入由宿主排队执行）。
- **未因全仓绿而改变的限制**：真实峰谷边界自动重绘未实测（证据 §4.3）、真实 pi TUI 观感（P52）与真实账户（P53）属最终独立门禁/人类验收；`OMP_BOT_BINARY` 指向本机既有 release 构建（`E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`），不是本票构建或安装的产物。
