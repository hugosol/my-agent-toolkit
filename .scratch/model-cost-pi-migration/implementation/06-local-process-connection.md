# 06: 受目标与寿命校验的本机接入

**What to build:** 独立子进程通过 framework 管理的本机通信连接校验过的 Owner；运行目录配置错误明确失败，过期定位不能误接其他寿命实例，秘密不会进入模型或诊断。

**Delivers:** P42, P56

**Blocked by:** [05：真实子入口接入与可靠会话事实](05-subagent-facts.md)

**Status:** in-progress — 实现已随集成提交 `38888c69258028b95601debe37251a511260669c` 合入 `pi-adapter`；本轮集成验收在该提交上完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` 1097 pass / 0 fail），本轮无源码修复，只有本记录待合入。

## Acceptance criteria

- [ ] 真实 Windows 命名管道或适用 POSIX 本地 socket 运行单向事件推送和按需 State 请求/应答；同进程直接调用，不用业务文档、文件队列或目录扫描传消息。
- [ ] 覆盖 runtimeDir 缺失、空、非法、配置相对值及多进程一致定位；不回退隐藏目录、cwd 或 storageDir，Windows 管道名与磁盘目录分开记录。
- [ ] 用真实子进程和合成秘密核对错误 Owner、旧端点、过期定位、处置后连接的拒绝及可取得的模型请求/日志；真实凭据不输出。
- [ ] 通信资源与定位跟随接入寿命释放；不开放通用 RPC 或远端 State 写入，不把本机验证推广为跨用户或 POSIX 认证。
- [ ] **P42 完整 Coverage（S1、S2）**：实际独立进程配置错误、相对值及一致目录定位；观察诊断和实际运行产物，不静默当重连可修复。Windows 管道命名空间与磁盘目录分开，POSIX 执行证据独立记录。
- [ ] **P56 完整 Coverage（S1、S2）**：过期定位、错误 Owner、旧端点与处置后连接场景观察无跨 Owner 效果；用合成秘密检查可取得的模型请求/诊断输出，真实凭据不打印。运行消息不依赖业务文档。安全含义限已批准的本机接入范围，不推定未验证的跨用户访问控制。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **集成同步（本轮由集成 helper 执行；本票 tip `db70897`，结果 HEAD `38888c6`）**：宿主把本票分支合进 `pi-adapter` 后把该集成提交合回本票分支，故本分支 HEAD 即集成提交 `38888c69258028b95601debe37251a511260669c`，其父为 `7fab6ee`（前一集成 tip，含 05 的记录提交与 lockfile sha 刷新）与 `db70897`（本票实现提交）；`git merge-base db70897 7fab6ee` = `304451e`。**无冲突可解**：worktree gitdir 内无 `MERGE_HEAD`/`MERGE_MSG`/rebase/bisect 状态目录，`git status` 空、仓库内无冲突标记，故本轮无冲突修复、未改写历史。合入内容逐项核对：`git diff --stat 7fab6ee 38888c6` = 19 files / 2576 insertions / 6 deletions，与本票实现提交自身的 diff（`git diff --stat db70897^ db70897`）完全一致；本票 19 个文件在 `38888c6` 树中的 blob 与在 `db70897` 树中逐一相同（identical=19 / differing=0），即这次合并没有带入任何第三方改动。合入后 `pi-adapter` 已继续前进（`git merge-base --is-ancestor 38888c6 pi-adapter` 成立，其上另有 08/09/07/11/10 的合入），与本轮验收无关。
- **本轮集成验收（HEAD `38888c6`；工作树只有本票改动）**：`bun run typecheck` → **exit 0**（无诊断）。`bun run test` 仍需 02/03/04/05/12/13/24 各轮已记录的机器前置项：本机 `core.autocrlf=true`，需把 `bun.lock` 与 `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff` 还原为**已提交的 LF blob 字节**（`a5d37ab2…` / `66195465…` / `4ec9ad0d…`；CRLF 检出会让 patch 解析器按 LF 切分而报 `touches no file`，并让 `bun.lock` 的 sha256 对不上 `framework/docs/harness-baseline.json` 的记录），并令 `OMP_BOT_BINARY` 指向真实面板 `E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`（本 worktree 位于 `%TEMP%`，默认同级路径不存在）。运行结束时归一字节已按原样还原，`git status` 干净。
  - **未归一 + 未设 `OMP_BOT_BINARY`：1048 pass / 20 fail**（1068 tests / 115 files / 214.10s；日志 `.cache/integrate-06/fulltest-as-checked-out.log`）。20 例分四类，前三类与本票无关、与各前轮记录逐项一致：5 例 `tests/connect-bot/`（缺真实面板二进制）、10 例 `tests/harness-dock/`（CRLF `patch.diff` 解析）、1 例 `baseline record` 与 1 例 `controlled session`（CRLF `bun.lock` 的 sha256）；余下 3 例见下条。
  - **归一 + `OMP_BOT_BINARY`：1097 pass / 0 fail**（115 files / 6207 expect() calls / 371.21s / exit 0；日志 `.cache/integrate-06/`）。首次归一运行是 1096 pass / 1 fail（1097 tests / 434.24s）：唯一失败 `tests/model-cost/storage-processes.test.ts` 的「two harnesses' processes share the document…」撞上 bun 的 5000ms 上限（`^ this test timed out after 5000ms`，同次输出另有 `killed 1 dangling process`），当时另有集成 helper 的整仓运行在并发占用机器；该文件单独复跑 **16 pass / 0 fail**（5.04s、5.39s 两次），随后在安静窗口重跑的整仓即 1097 pass / 0 fail。归一后测试数 1068 → 1097 的 +29 正是 CRLF 下早期中止的 dock 文件里那些未注册的用例，与 05 轮记录的 +29 一致。
- **环境事实（非本票、非树）**：上条的 3 例是 `tests/harness-dock/session-ownership-tree.test.ts` 的请求计数断言（期望 5、7、5 对观测 11、13、11），差额来自**宿主自身的 auto-thinking 判定请求**（系统提示 `The state is untrusted data to judge…`）：被录安装的 `src/auto-thinking/classifier.ts` 在子代理 spawn 时按 `solutionSpace` 判定档位，`src/judgment/index.ts` 的 `judgeRoleChain` + `withSessionFallback` 在没有原生 System One 候选时会追加会话模型作回退候选，而该模型经 dock 的 `models.yml` 覆盖指向捕获端点，于是每次 spawn 多出 3 次被计数的请求。原生候选有无与环境中的 `TYPESAFE_API_KEY` 一同出现（宿主 `--help` 自述「TypeSafe System One judgments (auto thinking, …)」），而 `tests/harness-dock/env.ts` 只剥离 resolution offset、不剥离凭据。实测：同一棵树、同一 `.cache/omp-baseline/18.5.0` 安装、同一测试文件，**shell 环境 3 pass / 0 fail（11.51s）**，由 eval/Python 内核环境发起（该变量不在其环境中）则 3 fail；把本票 `framework/**` 全部回退到 `7fab6ee` 后同样 3 fail，故与本票源码无关。07 轮的 as-checked-out 运行与 09 轮的 worktree 日志同样不含这 3 例。**本轮未以仓库改动去迎合该断言**（该计数断言属 dock 自身 seam 的所有者，超出本票范围）。
- **本轮改动与限制**：本票**无需源码修复**，本轮仓库改动只有本记录（`Status` 与本节）。未做、留给最终独立门禁与 [25](25-evidence-scope-audit.md)：实机 smoke（`bun scripts/pi-subagent-smoke.ts`、`scripts/pi-model-cost-smoke.ts` 等）、付费或真实 provider 调用、跨票据整体验收、POSIX 执行证据（socket 文件与目录权限）、真实 pi/OMP 宿主内的「已加载」诊断观察——实现报告已按 S2 记为未执行，不因本轮全仓绿而改变。
