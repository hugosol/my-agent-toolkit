# 24: 真实 provider 账户侧核对

**What to build:** 在获授权的真实宿主/provider 路径准备脱敏账户观察材料，由用户核对 DeepSeek/Codex 实际接入结果，而不把模拟协议或参考价格当账户事实。

**Delivers:** P53

**Blocked by:** [13：DeepSeek 余额认证与刷新闭环](13-deepseek-balance.md)、[14：Codex 双窗口与独立比例估计](14-codex-allowance.md)

**Status:** in-progress（Agent 侧交付完成：自动协议/错误检查已复核，经授权的真实宿主/provider 路径已执行，
材料见 [evidence/24-provider-account-acceptance.md](../evidence/24-provider-account-acceptance.md)；**P53 人类账户侧核对与
Codex 凭据仍待进行**；标签 `closed` 随实现合并推进）

## Acceptance criteria

- [x] 协议和错误自动检查先完成；获得凭据/许可后尽早准备真实宿主/provider 读数、时间、场景、环境及对照材料，不等待效率人工确认。
- [x] 缺凭据、账户、许可或需付费调用时明确报告真实阻塞；不继承研究限额，不打印秘密，不擅自安装/切换正式环境。
- [ ] Agent 完成所有已授权真实路径，账户侧结果由用户核对；不把余额变化当请求费用真值，不要求实际收费等于模型参考价。（Agent 侧已完成 DeepSeek 真实路径；**Codex 缺凭据为明确阻塞**，账户侧核对属人类）
- [x] 最终人类验收仅在全部实现及已分配自动检查完成后进行；此前可以完成全部可执行准备。未执行/未确认项目保持未验收，不用 mock 补签。
- [ ] **P53 完整 Coverage（S2）**：Agent 完成自动协议/错误检查及经授权的真实宿主/provider 路径，准备脱敏读数、时间、场景和对照材料。**人类验收：真实账户侧结果核对**；不把余额变化当请求费用真值，不要求 provider 实际收费等于模型参考价。缺凭据/许可是明确阻塞，付费调用另行授权。（Agent 侧部分完成，人类核对未完成）

## 本轮执行记录

- 新增 `scripts/pi-provider-account-read.ts` + `scripts/support/provider-account-reading.ts` +
  `tests/model-cost/provider-account-reading.test.ts`；`bun run verify:provider-account` 为可运行入口。
- 真实路径：真实 pi 1.2.0 加载 shipped 入口读真实 DeepSeek 账户三次（读数、时间、对照判定与脱敏报告见证据文件）；
  无 prompt、无模型请求、无付费调用；机器真实存储根前后一致；Codex 场景报告明确阻塞（pi 自身无 `openai-codex` 凭据）。
- 证据与未验收项见 [evidence/24-provider-account-acceptance.md](../evidence/24-provider-account-acceptance.md)。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- 集成同步（本轮由集成 helper 执行；本票分支 HEAD = `4509a80d2669530fe11ea4e8664df2e7f2de5b5d`）：宿主把本票分支合进 `pi-adapter`
  后再合回本票分支，该合并提交的父提交为 `3016296`（前一兼容集成 tip）与 `89f910e`（本票 head）。`git diff --stat 3016296 HEAD`
  = 本票 7 个文件 1438 insertions / 6 deletions（`scripts/pi-provider-account-read.ts`、`scripts/support/provider-account-reading.ts`、
  `tests/model-cost/provider-account-reading.test.ts`、`README.md`、`package.json`、本票实现与证据文件），与实现报告的文件清单逐项一致；
  无冲突、无冲突标记、无 `MERGE_HEAD`、`git status` 空，故无冲突可解。集成工作区（`E:/Developer/myhub/my-agent-toolkit`）未被操作；
  未切换分支、未新建 worktree、未 reset、未丢弃工作、未调用 retro、未合入集成分支。
- 同步之后 `pi-adapter` 又前进两个提交（`75a1522`、`1a8eb1a`，合并为 `51b5339`），改动只在 `tests/model-cost/pi-session-span.test.ts`
  与 `implementation/12-session-span.md`——与本票及本轮修复的文件无交集，故本票分支后续合入该 tip 不预期冲突。
- 本轮集成验收（源状态 `4509a80`，工作树只有本票改动）：`bun run typecheck` → exit 0（无诊断）；`bun run test`（本机原始 CRLF 检出）
  → 1000 pass / 17 fail（112 files / 1017 tests，231.99s，exit 1）。17 例全部是本机检出／布局前置项，与本轮合入内容无关，且与
  [01](01-efficiency-baseline.md)/[02](02-pi-main-session.md)/[03](03-request-pricing-rounds.md)/[04](04-shared-storage.md)/[13](13-deepseek-balance.md)
  各轮记录的特征逐项一致：12 例由 `core.autocrlf=true` 把 `host-patches/**/patch.diff` 与 `bun.lock` 检出成 CRLF 引起（10 例在补丁物化期报
  `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff touches no file`；`baseline.test.ts` 报
  `bun.lock: recorded 9e9f4833… but found 7f5c82e6…`，`session-driver.test.ts` 因录制 sha256 针对已提交的 LF blob 而失败）；5 例是
  `tests/connect-bot/` 真实面板 interop 在 `%TEMP%` 布局下找不到默认同级 `omp-bot.exe`。日志 `.cache/integrate-24/fulltest-1.log`。
- 归一后的全仓回归（两份 `patch.diff` 与 `bun.lock` 逐行去 CR，去 CR 后 sha256 与 `git show HEAD:<path>` 的已提交 LF blob 逐一相同——
  `66195465…`（viewed-session）/ `4ec9ad0d…`（codex-response-boundary）/ `9e9f4833…`（`bun.lock`）；并设
  `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：第 1 次 → 1045 pass / 1 fail（112 files / 1046 tests，425.75s）。
  唯一失败**不是本票内容**，是 `tests/harness-dock/detail-tree.test.ts` 的「a resumed process draws the runtime the document already carries
  (P10, P19, P35)」：期望 `1533`、收到 `2000`。该案例由 `ffb8e17` 加入（`implementation/02-subagent-runtime.md` 那条线；`git merge-base
  --is-ancestor ffb8e17 3016296` 为真，即早于本轮合并）。失败原因是断言拿行文本跟文档的精确毫秒比，而显示把越过一秒的运行时长按整秒写
  （`runtimeText(1533)` = `"2s"`，读回 `2000`）——行承载的正是文档保存的数值，被拒的是断言。日志 `.cache/integrate-24/fulltest-normalized.log`。
- 本轮修复（唯一源码改动，仅一处断言）：给该文件加 `statedRuntimeMs`，即文件内既有读取端 `drawnRuntimeMs` 在同一显示形式下的逆；
  断言改为 `expect(drawn).toBe(statedRuntimeMs(savedRuntime))`，并注明行按显示自身单位承载保存值、同一执行被二次累计会写出约两倍的图。
  等价性以一次性脚本核验（`.cache/integrate-24/verify-stated-runtime.ts`，未入库）：4019 个取值上 `drawnRuntimeMs(runtimeText(x)) ===
  statedRuntimeMs(x)` 全部成立、`mismatches: []`，且 `x` 与其二倍不落在同一显示值（`collisions: []`），即该断言仍能识破二次累计。
  单文件复跑 `bun test tests/harness-dock/detail-tree.test.ts` → 3 pass / 0 fail（修复前 12.07s、修复后 10.91s；修复前单跑即通过，
  也说明书全仓下的失败只在子进程执行越过一秒时出现）。
- 修复后的全仓回归：`bun run test` → **1046 pass / 0 fail（112 files、5956 expect() calls、331.48s、exit 0）**，含 `tests/harness-dock`
  全部 23 个测试文件与 `tests/connect-bot` 5 例真实面板 interop；日志 `.cache/integrate-24/fulltest-normalized-2.log`。运行结束后三份被归一
  的文件按字节恢复到运行前的 CRLF 检出状态（逐文件 sha256 与运行前相同、`git ls-files --eol` 复现 `i/lf w/crlf`），工作树只余本轮那一处修复，
  未提交任何环境改动。
- 跨线核对（读为主，兼同侪确认）：本票对生产代码零改动（`git diff --stat 3016296 HEAD` 不含 `extensions/**`、`framework/**`、
  `entrypoints/**`），本轮唯一改动落在 dock 测试；已向可见同侪核对 `tests/harness-dock/detail-tree.test.ts` 的归属，05、12 两条线均答复无重叠
  （12 票另报其源状态 `30162967` 的归一全仓回归为 1037 pass / 0 fail——该案例当时已在树内，只是子进程执行未越过一秒）。
- 未验证／限制（交最终独立门禁与 25 追补）：本机 `core.autocrlf=true` 的检出前置项与 `%TEMP%` 布局下的 `omp-bot.exe` 默认路径仍是本机环境事实，
  未以仓库改动修正（按 04 票记录，`.gitattributes` 或按行尾鲁棒的解析属装配/宿主验证票）；未跑本票 smoke（`bun scripts/pi-provider-account-read.ts`、
  `bun scripts/pi-model-cost-smoke.ts`）与任何付费调用——实机 smoke 与跨票据整体验收属最终门禁；P53 的人类账户侧核对按
  [证据 §6](../evidence/24-provider-account-acceptance.md) 清单仍待用户；仅 Windows x64、bun 1.4.2、pi 1.2.0，未推断 POSIX、其他版本或其他用户环境。
