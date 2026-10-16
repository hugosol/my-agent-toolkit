# 25：最终证据与兼容范围审计（P54）

**Status:** implemented（本票实现 = 本轮真实验证 + 本文汇总记录 + [`framework/docs/harness-support.md`](../../../framework/docs/harness-support.md)
的「pi model-cost migration evidence」一节；无生产代码改动。实现已随集成提交 `e45a9ffcbb071ea18d937c660dab38cf5f8e2db6`
合入 `pi-adapter`，宿主已把该提交合回本分支（故本分支 HEAD 即该提交、与 `pi-adapter` 同 tree，见 §10）；
本轮集成验收在同一 HEAD 完成，`bun run typecheck` 与全仓 `bun run test` 均 exit 0、无源码修复。
**整体迁移仍未完成**：P51/P52/P53 的人类确认未到，
且下文 §8 列出的未通过真实路径仍未通过。）

**本文件是本票交付的记录**：逐票汇总已产生的真实运行（源、版本/工件、OMP 补丁条件、环境、命令、结果、未覆盖项），
核对 P1–P57 与 P57 分区的归属与证据，给出明确的未验收清单，并把固定版本/工件/补丁条件/未验收项落到持久记录。
本文件不改承诺、不改 seam，不替 22/23/24 签字，也不把任何未执行项写成通过。

## 0. 本票交付与范围

| 项 | 内容 |
| --- | --- |
| P54 Coverage（S1、S2、S3） | 每次真实验证附版本/工件及 OMP 补丁条件、命令/结果/未覆盖项；固定 pi/nicobailon；不混用源码行号或研究实测作为新集成通过；不推广未来版本、POSIX、跨用户或全 provider 支持；不新增启动报告门控。 |
| 本票新增文件 | 本文件、`evidence/logs/25-*.log`（10 份本轮运行日志）、`framework/docs/harness-support.md` 的「pi model-cost migration evidence」一节与三处表格行更新。 |
| 生产代码改动 | **无**。`git diff 39fdc3d -- framework/ extensions/ entrypoints/ tests/ scripts/` 与 `git diff 39fdc3d -- package.json bun.lock` 均为空。 |
| 启动门控 | 未新增任何启动期版本/能力检查：本轮的改动只有文档与记录，框架既不声明支持版本也不在绑定时判断能力面（策略见 harness-support.md 的 [Meaning of the support list](../../../framework/docs/harness-support.md#meaning-of-the-support-list)）。 |

## 1. 固定来源、工件、环境与补丁条件（逐次核对用的基准）

| 项 | 记录值 |
| --- | --- |
| 被测源 | 分支 `hyper/model-cost-pi-migration/25-evidence-scope-audit-320c62-411dc288ea83`，HEAD `39fdc3dab2f19a67f54b096f4164e8ddcc7faaa1`（= 21 合并后的 `pi-adapter` 树），工作树除 `.cache/` 与三处行尾归一外干净。相对 21 的验证基点 `8c86378`，本树只多出 `tests/harness-dock/consumer-regression.test.ts` 与记录文件（`git diff --stat 8c86378 HEAD -- scripts/ framework/ extensions/ entrypoints/ tests/` 只有那一个测试文件），其余源码与 21 的记录同源。 |
| pi 宿主 | 已安装 `@earendil-works/pi-coding-agent@1.2.0`；实际工件 `D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`（经 `pi.cmd` shim 解析），以 `node` v24.18.0 运行。 |
| 第三方工件 | `pi-subagents@0.78.0`（nicobailon）= 本仓库 `package.json` 的固定依赖，工件在 `node_modules/pi-subagents`；`bun.lock` 记录其 tarball 与 integrity `sha512-AsOvPL1xaVFV4bqIlheQKNI2LmAoiAKTPXXxi39/BsWJTdMJIqAkZJ3iLi6bTsh2PZHG7Ur08b7VJOtgAMIAig==`（与 [07 预检环境](../research/07-runtime-validation/preflight-environment.json) 的记录一致）。研究期的源码 pin（`a4c8ced6…`）只是决策参考，**不是**本迁移通过的证据。 |
| 平台与工具 | Windows x64（`10.0.26200`）、Bun 1.4.2、Node v24.18.0。 |
| OMP 工件与补丁条件 | 隔离精确安装 `.cache/omp-baseline/18.5.0`（revision anchor `9348320cc4a30a7195d36a1f05a6c11bcb701a17`）与仓库内冻结补丁工件 `host-patches/omp-18.5.0-viewed-session`、`host-patches/omp-18.5.0-codex-response-boundary`、二者的组合形态。**pi 路径不需要任何宿主补丁**；本轮未改动 `host-patches/**`、`framework/docs/harness-baseline.json`。 |
| 本机检出前置（既有环境事实，非仓库内容） | `core.autocrlf=true` 把 `bun.lock` 与两份 `patch.diff` 检出为 CRLF；本轮按各前轮做法把这三份文件还原为已提交 LF blob 字节后运行（`bun.lock` `a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6`、viewed-session `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b`、codex-response-boundary `4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d`，三者与 `git cat-file blob HEAD:<path>` 逐一相等），并设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`（本机既有 release 构建，非本票产物）。运行结束后按字节恢复为运行前的 CRLF 检出状态。 |
| 隔离 | 每个真实运行一个临时 run root（agent state、session dir、work dir、capture/user home）；pi 显式 `--mode rpc --no-extensions -e <入口> --no-mcp`。默认全局安装、正式配置与运行中的 agent 未被触碰。 |

## 2. 本票自己执行的真实验证（本轮，源状态 = §1 的 HEAD，工作树无源码改动）

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 依赖装入（`bun.lock` 字节不变） | — |
| `bun run typecheck` | 0 | 无诊断 | `logs/25-typecheck.log` |
| `bun run test`（归一检出 + `OMP_BOT_BINARY`） | 0 | **1200 pass / 0 fail**，6897 expect()，128 文件，475.18s | `logs/25-fulltest-normalized.log` |
| `bun scripts/pi-model-cost-smoke.ts`（真实 pi 1.2.0） | 0 | **100 checks passed, none failed**，28 个隔离 run | `logs/25-smoke-pi-model-cost.log` |
| `bun scripts/pi-subagent-smoke.ts`（真实 pi + 固定提供方） | 0 | **20 observations held**；后台阶段一条 note：被委派子会话自己的进程没有落盘（见 §8.3） | `logs/25-smoke-pi-subagent.log` |
| `bun scripts/pi-background-round-smoke.ts` | 0 | **13 observations held** | `logs/25-smoke-pi-background.log` |
| `bun scripts/pi-terminal-round-smoke.ts` | 0 | **17 observations held** | `logs/25-smoke-pi-terminal.log` |
| `bun scripts/pi-session-accounting.ts` | **1** | 12 observations held，**6 required facts missing**（跨进程后台子会话自身记账未落盘；两次运行同形） | `logs/25-smoke-pi-session-accounting.log`、`logs/25-smoke-pi-session-accounting-keep.log` |
| `bun run verify:omp-candidate` | 0 | 隔离 18.5.0 上 `tests/framework` **481 pass / 0 fail**；结果记录 `.cache/omp-baseline/18.5.0/candidate-verification.json`：`baseCommit=39fdc3d…`、`dirty=false`、`changedPaths=[]`、`workingTreeDigest=44657c48e2991b2f835f6466f454956ee06393fb4060028a4dd3ccd3b82e86b3`、两份 lockfile 哈希均匹配、`regressionAlarm=green`、`certification=none` | `logs/25-verify-omp-candidate.log` |
| `bun run verify:provider-account` | 0 | **1 observed, 1 blocked, 0 failed**：真实 DeepSeek 账户自身 CNY 总额与该扩展绘制行同一瞬间一致（`drawn 💰 Balance: ¥176.65`，账户 19:49:51.503+08:00 答 176.65；凭据只有指纹 `sha256:5b50a042915c`）；Codex 场景 **BLOCKED**（两个凭据存储都没有可用的 `openai-codex` 凭据）。**无模型请求、无付费调用**，报告在 `.cache/provider-account/readings-2026-10-16T11-49-50-525Z.json` | `logs/25-verify-provider-account.log` |

两次 `pi-session-accounting` 与 `--keep` 复跑都停在同一组 6 项（根记录 `deepseek-flash` 3 次请求 / `0.0054` CNY、
子会话自己的记录 `{}`、文档里没有第二条会话、恢复进程画不出子行），即该缺口在最终源状态上可复现，不是单次抖动。

## 3. 逐票真实运行记录汇总（源、工件、环境、命令、结果、未覆盖项）

下表的「源状态」「环境/工件」按各票自己的记录照录（各票运行时的集成分支基点不同），「命令 → 结果」只记该票记录中
可执行入口的实际结果；未覆盖项照录，不改写。各票的完整记录在本文档 §7 的引用位置。

| 票（承诺） | 源状态 | 环境 / 工件 / 补丁条件 | 入口 → 结果 | 未覆盖项（该票自己记录） |
| --- | --- | --- | --- | --- |
| [01](../implementation/01-efficiency-baseline.md)（基线，解锁 P51） | `59a0ed7` + 本票新增文件 | win32/x64、bun 1.4.2、node 24.x；**无宿主、无补丁、无网络**（provider 为 loopback 记录式端点） | `bun run typecheck` → 0；`bun run baseline:efficiency` → 7 序列不变量全成立；重跑逐列一致（只有 `fail` 与 `ms` 波动） | 真实 OMP/pi 宿主、真实 provider、真实终端；六个 `notComparableScenarios` 明确列出 |
| [02](../implementation/02-pi-main-session.md)（P1、P2、P41、P55） | `be96759` → 集成交 `5ad9af7` | pi 1.2.0（工件如上）、OMP 侧未改；`bun install --frozen-lockfile` | 真实宿主 `pi-model-cost-smoke`（当时 25 checks，本轮同入口 100 checks）→ 0；`tests/framework tests/model-cost` 731 pass / 0 fail；`pi-codebase-tools-smoke` 在「会话干净退出」上以既有 `exit 9 / UV_HANDLE_CLOSING` 失败（未改动 HEAD 上逐字复现） | pi 主会话映射无 hermetic 单测；未跑 dock；TUI/季节边界/子代理耗时未验证；capture 端点不是账户事实 |
| [03](../implementation/03-request-pricing-rounds.md)（P7、P9、P18） | `5ad9af7` | pi 1.2.0、node 24.18.0、capture 端点；无凭据、无付费 | `tests/framework tests/model-cost` 756 pass / 0 fail；`tests/codebase-tools` 24 pass；dock 受影响 2 文件 6 pass；`pi-model-cost-smoke` 44 checks ×2 次；故障注入各命中 | pi 压缩摘要调用不在 Turn 轴上；真实峰谷时段未驱动；缺价/token-only 未在真实宿主驱动；dock 分区 12 例 CRLF 前置失败（本轮已消除，见 §2） |
| [04](../implementation/04-shared-storage.md)（P32–P34、P38、P39；P57 的 P33） | `be96759` | win32/x64、bun 1.4.2、node 24.x；**无宿主、无补丁、无凭据**；全部为本机文件系统与真实独立进程 | `tests/model-cost` 376 pass、`tests/framework` 378 pass；真实多进程调用计数（4 进程并发 → `saved×2/conflict×1/stale-version×1`，拒绝项发布数 0）、只读同步 1 读 0 锁 0 发布、字节对照；7 条故障注入各自命中 | POSIX 的 rename 拒绝注入不成立；`synchronize()` 的生产触发接线不在本票；未跑真实 OMP 宿主；跨用户/ACL 未验证；§4 的一处口径判断点上报 |
| [05](../implementation/05-subagent-facts.md)（P3、P11–P13） | `2928430` | pi 1.2.0、`pi-subagents@0.78.0`、capture 端点、node 24.18.0 | `pi-session-facts`+`pi-subagent-integration` 30 pass；`tests/framework` 429、`tests/model-cost` 380；3 次真实探针（提供方两种陈述、真实前台委派、提供方自己的 `effective=[runtime, model-cost]`）；5 条故障注入 | 前台委派的子会话事实当时被父进程 ctx 失效崩溃阻断（20 已修，本轮 §2 的 `pi-subagent-smoke` 前台阶段全过）；嵌套/后台/续跑/取消/fork/进程替换未跑完；`none` 的「工件不存在」形态未构造；POSIX |
| [06](../implementation/06-local-process-connection.md)（P42、P56） | `304451e` | win32/x64、bun 1.4.2；**无宿主补丁、无凭据、无模型请求** | `local-access` 21 pass；`tests/framework` 451、`tests/model-cost` 394、`tests/codebase-tools` 24；真实子进程 + 真实命名管道；13 条故障注入（2 条如实记为不可观察） | 真实宿主加载面当时未执行（CRLF 物化前置；19/20 轮已更正该前置）；POSIX socket 分支未运行；跨用户/DACL、句柄继承未测 |
| [07](../implementation/07-owner-state.md)（P14–P17；P57 的 P17） | `38888c6` | win32/x64、bun 1.4.2；无补丁、无凭据、不触网 | `tests/framework` 466 pass（含 `owner-follow` 12 + `owner-follow-processes` 3，两个真实进程）；消费分区合跑 555 pass / 5 fail（缺真实 omp-bot 二进制，环境性）；8 条故障注入 | 真实 pi 进程内的 follow 路径未执行；POSIX 未执行；5 条 connect-bot 失败不认领为通过 |
| [08](../implementation/08-session-accounting.md)（P8、P10、P40） | `304451e` | pi 1.2.0、`pi-subagents@0.78.0`、capture 端点 | `pi-session-accounting` 7 pass；`tests/model-cost` 401、`tests/framework` 430；真实后台委派：**11 held / 7 missing**（子会话自己的记录从未落盘），并给出机制与「回到权威」的两条路线 | 跨进程子消费落账（**本轮复现仍缺 6 项，见 §8.3**）；前台委派真实路径当时被 ctx 失效阻断（20 已修）；嵌套/取消/失败/晚到的真实宿主未驱动；POSIX |
| [09](../implementation/09-background-rounds.md)（P19、P20） | `304451e` | pi 1.2.0、`pi-subagents@0.78.0`（其 `pi-web-session-liveness.js`）、node 24.18.0 | `pi-background-rounds` 12 pass；`tests/framework` 442、`tests/model-cost` 394；真实宿主 `pi-background-round-smoke` 13 项；6 条故障注入 | 提供方唤醒期限「到期不保活」的真实路径（由研究侧注入时钟覆盖）；真实耐久定时任务未登记；前台委派当时受阻；被委派会话自己的消费未出现（note） |
| [10](../implementation/10-terminal-rounds.md)（P21–P23） | `8a631cb` | pi 1.2.0、`pi-subagents@0.78.0`；OMP 侧用 dock 隔离安装 | `tests/framework` 482、`tests/model-cost` 405、dock `round-facts` 2 pass、`tests/connect-bot` 137 pass / 5 fail（面板二进制缺失）；真实宿主 `pi-terminal-round-smoke` 17 项；1 条公共合成注入致 12 例失败 | OMP 真实宿主的取消/终态失败路径未驱动；UI/RPC 的 `hasUI` 条件不泛化；被委派子会话自己的记录仍缺（同 08）；POSIX |
| [11](../implementation/11-subagent-runtime.md)（P24、P25、P27） | 集成交 `0c8db96` | win32/x64、bun 1.4.2 | **无 `evidence/11-*.md`**；记录见该票 Comments：合入逐项核对、`bun run typecheck` 0、归一后全仓 `bun run test` **1110 pass / 0 fail**、`subagent-runtime` 10 pass | 真实 pi 宿主的活动耗时、真实 OMP 后台/独立进程子会话、活动跨周期边界**保持未验收**（记录指向一份位于本仓库工作区之外的实现报告）；`efficiency-baseline` 入口当时未重跑 |
| [12](../implementation/12-session-span.md)（P28） | `3016296` + 修复 `75a1522` | 同上 | **无 `evidence/12-*.md`**；记录见该票 Comments：全仓 1037 pass / 0 fail（归一，两次）、`pi-session-span` 4 pass | **无真实宿主证据**（未给 smoke 增加本票 phase）；重置段由 `period-switch.test.ts` 覆盖；一处未判定的观察（外部改写 `periodId` 后下一轮报 `saved` 而非 `stale-period`）留交最终门禁 |
| [13](../implementation/13-deepseek-balance.md)（P29） | `5ad9af7` | pi 1.2.0、capture 端点（合成凭据）；无真实凭据 | `provider-balance` 13 pass + 1 条故障注入命中；`pi-model-cost-smoke` 44 checks（含本票 19 项）；dock 余额分区 6 pass | 真实账户事实（属 P53）；真实宿主内换凭据不可生产（由 S2 用例 + 注入覆盖）；30s 真实 TTL 未等待；pi adapter 无 hermetic 单测 |
| [14](../implementation/14-codex-allowance.md)（P30、P31） | `2ea7fee` | pi 1.2.0、`openai-codex` 指向 capture 端点、run 自己的 `auth.json`；无真实凭据 | `tests/model-cost` 377、`tests/framework` 378；`pi-model-cost-smoke` 43 checks（本票 18 项：窗口按长度、独立更新、配对比例、限频、失败不赚 TTL、跨进程续测、重置不动估计）；1 条新用例 + 注入对照 | 真实账户侧（P53）；POSIX/其他版本；当时 dock 分区 CRLF 前置（19/20 轮已更正）；真实 15s TTL 边界未等待 |
| [15](../implementation/15-period-reset.md)（P35–P37） | `5581010` | pi 1.2.0、capture 端点；pi 路径无宿主补丁 | `pi-period-reset` 15 pass；`tests/model-cost` 415、`tests/framework` 481；`pi-model-cost-smoke` 97 checks；真实宿主 Phase 6/10 覆盖；红→绿证据（`canAcceptInput` 缺失事实） | 边界余额读的是 capture 端点；「活动未知/忙碌」在真实 pi 上不可生产（只由进程内套件覆盖）；POSIX 的发布失败注入未运行；真实 30000ms TTL 未等待；另修好一处既有 smoke 竞态 |
| [16](../implementation/16-runtime-gaps.md)（P26） | `5581010` | OMP 真实宿主 = 隔离 18.5.0（无补丁）+ capture 端点；pi 侧不驱动真实宿主 | `tests/model-cost` 422（含新 7 例）；`tests/harness-dock/model-cost-runtime-gap` 1 pass（带活动死亡不加账、下一进程继续）；7 条故障注入；修 1 处诊断文案缺陷 | 真实宿主构造不出「无法测量的区间」（缺口标记由受控时钟用例承担）；pi 真实路径被 05/08 记录的宿主事实阻挡；POSIX；另记一条宿主事实（跨 cwd 的 `switch_session` 被 `SESSION_CWD_CHANGE_REJECTED` 拒绝） |
| [17](../implementation/17-budget-actions.md)（P4–P6、P47；P57 的 P4） | `5581010` | pi 1.2.0、固定提供方（`subagents:rpc:v1:ready` 驱动接入结论） | `tests/model-cost tests/framework/actions-routing` 434 pass；dock 11 pass；`pi-model-cost-smoke` **100 checks**；`pi-session-accounting` exit 1（12 held / 6 missing，与 08 同一组） | 真实 pi 的 `/reload` 未驱动；该 6 条 FAIL 不认领；未核对真实账户；TUI 观感属 P52 |
| [18](../implementation/18-native-presentation.md)（P43、P44、P46） | 集成交 `df00a19` | pi 1.2.0（真实宿主半未跑）、OMP dock 在归一检出下与 17 轮同形 | 新增 `pi-presentation` 12 例 + `pi-session-context` 3 例；归一后全仓 1177 pass / 0 fail | **票据自身的真实宿主半、真实 pi TUI 的 component 形态、OMP 消费端回归、docs 更新、fault-injection 复核与 `scripts/pi-native-presentation-smoke.ts` 均未完成**；一处未定性发现（装配级夹具看不到 identity/period 记录）原样保留 → P43/P44/P46 只算部分交付（见 §4） |
| [19](../implementation/19-season-boundary.md)（P45；P57 的 P45） | `df00a19` + `067c8fa`/`d060b8d` | pi 1.2.0、`boundary-timer` 自持单次等待（真实宿主实测 `ctx.setTimeout/clearTimer` 为 `undefined`） | `pi-season-boundary` 10 pass、`boundary-timer` 9 pass；`tests/model-cost` 453、`tests/framework` 481；`pi-model-cost-smoke` 100 checks；负向证据（请求 0、读数逐字段不变、条目+字节+mtime 不变、同 UI 只 1 个等待）；2 条注入 | 真实钟面上的峰谷边界未实测；当时 dock 前置（已更正）；「只有发布 UI 的 binding 才登记」这一标注依赖宿主事实，未新增推断路径；P52/P53 属外部 |
| [20](../implementation/20-assembly-lifecycle.md)（P48、P49；P57 的 P48/P49） | `1ccc443` + `d6d72d4` | pi 1.2.0、`pi-subagents@0.78.0`、capture 端点 | `pi-assembly-lifecycle` 10 pass；`tests/model-cost` 463、`tests/framework` 481；真实宿主：**前台委派全过**（子会话自己的消费按自身身份保存、整进程余额查询 1 次、`stale-extension-context` 计数 0、进程自行退出）；3 条注入各自命中 | **独立子进程（detached）形态未取得真实证据**（该 dock 的后台 runner 在本机未走到模型请求）；`/reload` 真实路径未驱动；child 实例自己的 cleanup 未单独验证；POSIX |
| [21](../implementation/21-consumer-regression.md)（P50） | `8c86378` + 本票新增测试 | OMP = 隔离 18.5.0 + 两个本机补丁；真实 `omp-bot.exe` | 新增 `consumer-regression` 3 pass；分区：framework 481、model-cost 463、connect-bot 142、codebase-tools 24、dock 90；归一后全仓 **1200 pass / 0 fail**（两次中第 2 次）；`pi-model-cost-smoke` 100 checks；`verify-omp-candidate` 0 | 第 1 次全仓的 2 例时序敏感（后续消失、单独重跑绿）；`pi-codebase-tools-smoke` 既有 EOF 失败；P51/P52/P53 属人类；平台范围 |
| [22](../implementation/22-efficiency-acceptance.md)（P51；P57 的 P51） | — | — | **本轮审计时该票尚未产生记录**（其 Agent 侧对照与人工结论归该票） | P51 人工判断未到 |
| [23](../implementation/23-tui-acceptance.md)（P52） | — | — | **本轮审计时该票尚未产生记录** | P52 人工判断未到 |
| [24](../implementation/24-provider-account-acceptance.md)（P53） | 集成分支 `3dd3dc1` | pi 1.2.0、机器自身 `deepseek` 凭据（只读、只留指纹）；无付费调用 | `typecheck` 0；`tests/model-cost` 390；`pi-model-cost-smoke` 81 checks；`provider-account-reading` 9 pass；真实账户路径 3 次（`¥254.30` / `¥253.91` / `¥252.95`，各带时刻与绘制行对照） | Codex 户头缺凭据 = 明确阻塞；付费调用未授权；平台/版本范围；人类账户侧核对未完成 |

## 4. P1–P57 归属与证据（有证据或明确缺口）

「证据」列给可核对入口（测试文件 / 脚本 / 记录）。「状态」只区分：**已交付且有真实路径记录**、**部分**（有自动或进程内证据、
真实宿主半缺失）、**待人类**、**缺口**。

| 承诺 | 交付票 | 证据 | 状态 |
| --- | --- | --- | --- |
| P1 | 02 | `pi-model-cost-smoke`（真实加载 + 请求 + 保存 + 新进程读回）；`tests/model-cost`/`framework` | 已交付 |
| P2 | 02、17 | `pi-model-cost-smoke` Phase 2（无子代理模式的实际运行、命令、provider 功能） | 已交付 |
| P3 | 05 | `tests/framework/pi-subagent-integration.test.ts` + `pi-subagent-smoke`（无提供方 / 被拒登记 / 真实委派） | 已交付 |
| P4、P5、P6、P47 | 17 | `tests/model-cost/pi-budget-actions.test.ts`（6 例）+ `pi-model-cost-smoke` Phase 2/11 | 已交付 |
| P7、P9、P18 | 03 | `tests/framework/pi-turn-mapping.test.ts`、`pi-round-mapping.test.ts`、`tests/model-cost/request-accounting.test.ts` + smoke 的四个连续路径与读数场景 | 已交付 |
| P8、P10、P40 | 08 | `tests/model-cost/pi-session-accounting.test.ts`（7 例）+ 共享树/恢复用例；真实宿主 `pi-session-accounting` | **部分**：主子（同进程）与文档级规则已交付；**跨进程（detached 后台子会话）自身记账未通过**（§8.3） |
| P11、P12、P13 | 05（前台真实路径另由 20 补齐） | `tests/framework/pi-session-facts.test.ts`（18 例）+ `pi-subagent-smoke` 真实前台委派的提供方自证 | 已交付 |
| P14、P15、P16、P17 | 07 | `owner-follow.test.ts`（12）+ `owner-follow-processes.test.ts`（3，真实双进程） | 已交付（真实 pi 进程内 follow 未单独驱动） |
| P19、P20 | 09 | `tests/framework/pi-background-rounds.test.ts`（12）+ `pi-background-round-smoke`（13 项） | 已交付 |
| P21、P22、P23 | 10 | `round-events.test.ts` + 两台适配的 `round` 用例 + `pi-terminal-rounds.test.ts`（4）+ `pi-terminal-round-smoke`（17 项） | 已交付（OMP 侧取消/失败真实路径未驱动） |
| P24、P25、P27 | 11 | `tests/model-cost/subagent-runtime.test.ts` + 全仓回归记录（该票 Comments） | **部分**：无 `evidence/11-*.md`，真实宿主耗时路径未验收 |
| P26 | 16 | `pi-runtime-gaps.test.ts`（7）+ `tests/harness-dock/model-cost-runtime-gap.test.ts`（1，真实宿主崩溃/恢复） | 已交付（真实宿主构造不出缺口本身） |
| P28 | 12 | `pi-session-span.test.ts`（4）+ `period-switch.test.ts`（重置段） | **部分**：无 `evidence/12-*.md`、无真实宿主证据 |
| P29 | 13 | `provider-balance.test.ts`（13）+ smoke 余额阶段（19 项） | 已交付 |
| P30、P31 | 14 | `codex-quota.test.ts`（16）、`codex-estimate.test.ts` + smoke Codex 阶段（18 项） | 已交付 |
| P32、P33、P34 | 04 | `storage-processes.test.ts`、`shared-storage-refresh.test.ts`、`consumption-store.test.ts` + 7 条注入 | 已交付 |
| P35、P36、P37 | 15 | `pi-period-reset.test.ts`（15）+ smoke Phase 6/10 | 已交付 |
| P38、P39 | 04 | `display.test.ts`、`storage-processes.test.ts`、`consumption-store.test.ts` + 1 条注入（P38） | 已交付 |
| P41、P55 | 02 | smoke 的三种 `storageDir` 解释与非法配置；21 的跨消费者回归 + 实现审查 | 已交付（P55 的「同一要求」由同一 definition/配置校验 + 消费面复核支撑，不以复制文本断言） |
| P42、P56 | 06 | `local-access.test.ts`（21，真实子进程/命名管道）+ 13 条注入 | 已交付（真实宿主加载面未跑；POSIX/跨用户不声称） |
| P43、P44、P46 | 18 | `pi-presentation.test.ts`（12）、`pi-session-context.test.ts`（3）+ 归一后全仓绿 | **部分**：真实宿主半、真实 TUI、OMP 消费端、docs 更新、注入复核与专属 smoke 未完成 |
| P45 | 19 | `pi-season-boundary.test.ts`（10）+ `boundary-timer.test.ts`（9）+ 负向证据 | 已交付（真实钟面边界未实测） |
| P48、P49 | 20 | `pi-assembly-lifecycle.test.ts`（10）+ 真实前台委派全过 + 3 条注入 | **部分**：独立子进程形态未取得真实证据；`/reload` 未驱动 |
| P50 | 21 | `consumer-regression.test.ts`（3）+ 五个分区 + 真实宿主（OMP dock、connect-bot 面板、codebase-tools） | 已交付（附两处既有失败/时序说明） |
| P51 | 22 | 基点 = `01-efficiency-baseline.json`；对照与复杂度材料由 22 产生 | **待人类**（22 记录未产生） |
| P52 | 23 | 固定场景与宽度输出由 23 产生 | **待人类**（23 记录未产生） |
| P53 | 24 | `evidence/24-*.md` §4/§6（DeepSeek 真实读数 3 次；Codex 阻塞） | **部分 + 待人类**：Agent 侧真实路径已执行，账户侧核对未确认，Codex 缺凭据 |
| P54 | 25 | 本文件 + `harness-support.md` 的 pi model-cost migration evidence | 已交付 |
| P55 | 02 | 见上 | 已交付 |
| P57 | 分区见 §5 | — | **未整体完成**（P51 项待 22） |

## 5. P57 分区（7 项）

| Coverage item | 负责票 | 交付形式与负向证据 | 状态 |
| --- | --- | --- | --- |
| P4：无子代理 detail 提前返回 | 17 | 通知文本 + 偏好前后 + provider 出站计数 + 存储根文件前后（无重绘帧）；真实宿主 Phase 2 | 已交付 |
| P17：观察不扩大写权或 Owner 效果权限 | 07 | 子侧写尝试无效、`persisted`/`feedback`/marker 发布计数、Owner 命令仍写盘 | 已交付 |
| P33：只读刷新不提交在途消费 | 04 | 真实进程的**调用次数**（读 2 / 发布 0 / 锁 0）+ 前后字节对照；无仪器即失败的自查 | 已交付 |
| P45：峰谷重绘无请求/记账/写盘 | 19 | 请求计数 0、读数逐字段不变、条目+字节+mtime 不变；敏感性对照（后续真实写入会被看见） | 已交付 |
| P48：共享准备、工厂及根专属效果不重复 | 20 | 工厂刚跑完 0 请求/无存储根/0 帧；owner 一对预取而子实例 0；注入后立即多出请求 | 已交付（独立子进程形态的真实半缺失） |
| P49：处置后旧资源不再产生效果 | 20 | 处置后迟到回答不产生帧、不写盘，`synchronize()` 为 `closed`；登记 1→0 | 已交付 |
| P51：禁止的重复工作和健康空闲轮询不新增 | 22 | 基点已冻结（01）；对照与判断由 22 与人类完成 | **未完成** |

## 6. 人类验收：引用 22/23/24 的原记录，不代签

| 人类项 | 原记录位置 | 本轮审计时的状态 |
| --- | --- | --- |
| P51 效率/复杂度最终判断 | [22](../implementation/22-efficiency-acceptance.md)（其对照工件与结论记录；基点 = [`01-efficiency-baseline.json`](01-efficiency-baseline.json) 与 [`01-efficiency-baseline.md`](01-efficiency-baseline.md)） | 未到达；本票不代判 |
| P52 真实 TUI 正常/窄宽度观感 | [23](../implementation/23-tui-acceptance.md)（其固定场景、宽度输出、截图/录屏） | 未到达；本票不代判 |
| P53 真实账户侧核对 | [24 证据](24-provider-account-acceptance.md) §5 对照材料与 §6 人类清单（§4.1 三次真实读数；Codex 阻塞与登录命令在 §4.3） | 未确认；本轮另执行了一次同路径真实读数（§2 末行）供核对，仍不代替用户判断 |

## 7. 兼容范围与结论边界（P54 的范围约束）

- 本记录与 `harness-support.md` 的结论只覆盖 §1 记录的源、版本/工件、环境与已执行路径。**不自动推广**到未来版本、
  其他 pi/OMP 版本、POSIX、跨用户或该迁移未触及的 provider 路径。
- 研究期的实测、源码行号与候选报告**不作为**本迁移集成通过的证据；本文出现的源码位置只用于说明机制（例如 08 的
  owner 初始化门控在 `framework/behaviors/binding.ts:315` 仍在），与任何"通过"结论分开。
- 真实账户侧只有 [24 证据](24-provider-account-acceptance.md) §5.1 第 1 行与本轮 §2 的 `verify:provider-account` 输出算
  账户事实；协议/端点模拟、RPC 输出与 fixture 文书都不算。
- 不新增启动版本报告门控：本轮改动只有文档与记录，正常启动不读本记录、不判断能力形状（与 harness-support.md 的
  独立验证策略一致）。
- 完成测试不等于独立兼容认证，也不等于交付关联的承诺已全部验收；本文件不宣称总体完成、不关闭任何未完成验收项。

## 8. 未完成 / 未验收清单（明确发布）

1. **人类确认（3 项）**：P51（22）、P52（23）、P53（24 的账户侧）各自的人类结论未到；P53 的 Codex 场景另有凭据阻塞。
2. **票据自身的真实宿主半缺失（1 项）**：18 的 P43/P44/P46 真实宿主半、真实 pi TUI component 形态、OMP 消费端回归、
   docs 更新、fault-injection 复核与专属 smoke 未完成（该票记录只含集成门禁）。这是**可执行但未执行**的自动/真实宿主工作，
   不是人类判断项，本票据此列为未完成。
3. **跨进程后台子会话的自身记账（P8/P10 的真实路径）**：`bun scripts/pi-session-accounting.ts` 在最终源状态上
   **exit 1 / 12 observations held / 6 required facts missing**（相同形态两次复现）：子进程确实加载了扩展并跑了自己的请求，
   但存储根里没有该会话的记录，因此其金额、直接父与树行都缺。同进程（前台委派）形态已保存（20 的修复，本轮
   `pi-subagent-smoke` 前台阶段全过）。该缺口由 08 记录并已「带回权威」，20 的部分修复未覆盖 detached 形态；
   本票只如实报告，不做静默降级，也不把它写成通过。
4. **无 `evidence/*.md` 的两票**：11（P24/P25/P27）与 12（P28）只有票据 Comments 中的运行记录（含归一后全仓回归），
   且 12 明确无真实宿主证据；两份实现报告位于本仓库工作区之外，本轮无法据此核对细节。
5. **真实宿主未能覆盖的行为**：峰谷边界按真实钟面自动重绘（19）；pi 的 `/reload`（17、20）；detached 后台委派的
   "不重复根侧效果"（20）；OMP 上的取消/终态失败真实路径（10）；P43/P44 的真实宿主半（18）。
6. **平台与版本范围**：所有真实运行都在 Windows x64；POSIX、其他版本、其他用户与更广 provider 均未验证（各票一致记录）。
7. **既有失败/时序项（不因本轮全仓绿而消失）**：`bun scripts/pi-codebase-tools-smoke.ts` 在 node 24 上仍以
   `exit 9 / UV_HANDLE_CLOSING` 结束（21 记录，本机无 Node 22.19.0 可换）；21 第 1 次全仓的 2 例时序敏感失败
   （`pi-period-reset`、`session-span`）单独重跑绿；`core.autocrlf=true` 检出与 `%TEMP%` 下的 `omp-bot.exe` 默认路径
   仍是本机环境前置（未以仓库改动修正）。
8. **付费与凭据**：本轮无付费调用；真实 DeepSeek 读数是一次只读余额查询（无模型请求），Codex 缺凭据为阻塞；
   正式安装、切换、清理用户数据均未执行。

## 9. 结论

- **已建立（限定在 §1 的组合与已执行路径上）**：pi 1.2.0 + `pi-subagents@0.78.0` 上 model-cost 的加载/计费/保存/命令/
  展示/子代理接入/Round 语义/provider 接线与共享存储行为，在 §2 的入口上得到可复现的真实宿主结果；OMP 侧同一源树的
  隔离 18.5.0 基线与全仓回归为绿；真实 DeepSeek 账户读数与绘制一致。
- **未建立**：§8 的全部条目。据此，本次迁移**不得**宣称总体完成、不得据本记录关闭任何未完成验收票；人类验收（P51/P52/P53）
  与 §8.2/§8.3 的可执行缺口都还在。
- **持久记录**：固定版本、工件、补丁条件与未验收项已写入
  [`framework/docs/harness-support.md`](../../../framework/docs/harness-support.md) 的「pi model-cost migration evidence」；
  后续只需针对变化的事实重新核验（story 58）。

## 10. 集成同步与合并后全仓回归（本轮集成验收）

**同步状态**：宿主已把集成提交 `e45a9ffcbb071ea18d937c660dab38cf5f8e2db6` merge 回本票开发分支，故本分支 HEAD 即该提交：
`git rev-parse HEAD pi-adapter` 同为 `e45a9ff…`、`git rev-list --left-right --count pi-adapter...HEAD` = `0 0`、
`git diff --stat pi-adapter HEAD` 为空（两侧同 tree）。提交关系：`e45a9ff` 的父为 `a6f1c6a`（合并前的集成 tip）
与 `a230648`（本票末提交，父 `39fdc3d`）。

**无冲突可解**：`git ls-files -u` 0 条未合并路径；本 worktree 的 gitdir
（`E:/Developer/myhub/my-agent-toolkit/.git/worktrees/hyper-ticket-JCfW4W`）内没有 `MERGE_HEAD`、`rebase-merge`
或 cherry-pick 状态。

**合入内容逐项核对**：`git diff --name-status a6f1c6a HEAD` 与本票自身的 `git diff --name-status 39fdc3d a230648`
**逐项相同**（同为 13 个路径：新增 `evidence/25-evidence-scope-audit.md` 与 `evidence/logs/25-*.log` 十份、修改
`implementation/25-evidence-scope-audit.md` 与 `framework/docs/harness-support.md`）；且
`git diff --stat a230648 HEAD -- extensions framework tests scripts entrypoints package.json tsconfig.json bun.lock host-patches`
**为空** —— 合入树里全部被测源码/夹具/依赖清单的字节与本票实现提交 `a230648` 逐一相同，本票实现没有在合入时被改写。

**检出与环境**：三处行尾敏感文件按各前轮做法归一到已提交 LF blob 字节后运行（`bun.lock` `a5d37ab2…`、
viewed-session `66195465…`、codex-response-boundary `4ec9ad0d…`，CR 字节均为 0，与 `git cat-file blob HEAD:<path>`
逐一相等），运行结束按字节恢复为运行前的 CRLF 检出（`e7ed487b…` / `057e01f6…` / `294b3727…`，与本轮开始前逐一相同）。
`bun install --frozen-lockfile` exit 0（`Checked 13 installs across 33 packages (no changes)`，`bun.lock` 字节不变）。
`%TEMP%` 下 `tests/connect-bot/support/omp-bot.ts` 的默认同级路径不存在，真实面板二进制以
`OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe` 显式给名（本机既有 release 构建，
非本票产物）。环境：win32 `10.0.26200` / x64 / Bun 1.4.2 / Node v24.18.0。运行期间与 23 的集成会话约定错开
（其全仓运行推迟到本轮结束后），减少真实宿主时序用例的满载干扰。

**全仓回归（`bun run test`，同一 HEAD 与同一环境，一次运行）**：

| 命令 | 退出 | 结果 | 日志 |
| --- | --- | --- | --- |
| `bun run typecheck` | 0 | 无诊断（`$ tsc --noEmit`） | `logs/25-integration-typecheck.log` |
| `bun run test`（`OMP_BOT_BINARY` + 归一检出） | 0 | **1200 pass / 0 fail**，6897 expect()，128 文件，409.21s | `logs/25-integration-fulltest.log` |

计数与本票实现轮在同一源上的归一全仓运行（§2：1200 pass / 6897 expect() / 128 文件）一致，即合入没有改变可观察结果。

**本轮修复：无源码修复。** 全仓一次通过、没有可归因于合入的失败；本轮改动只有本记录、实现文件的状态行与两份日志。

**环境观察（非仓库内容）**：本轮期间共享仓库配置 `E:/Developer/myhub/my-agent-toolkit/.git/config` 曾短暂带有无效值
`core.autocrlf = core.eol`（mtime `19:53:10`），使需要解析该布尔的 git 命令直接 fatal
（`fatal: bad boolean config value 'core.eol' for 'core.autocrlf'`；实测影响 `git status --porcelain`、`git ls-files`、
`git cat-file blob <rev>:<path>`，而 `rev-parse`/`log`/`diff`/`show` 仍可用）。该值自 `19:54:32` 起回到
`core.autocrlf=true` 并保持稳定，本轮验收运行即在该值下进行，其后各项核对与提交也以同一值执行。这不是仓库改动，
也不是本票产物，如实记录供最终门禁参考。

**运行后状态**：工作区只余本轮记录（本文件、实现文件状态行、两份日志）；运行期间被测源码与夹具未改。
本轮未操作集成工作区（`E:/Developer/myhub/my-agent-toolkit`）、未切换分支、未新建 worktree、未 reset、未调用 retro，
也未自行合入 `pi-adapter`（返回后由宿主排队合并）。

**本轮通过不改变 §8**：全仓绿只说明合入没有破坏任何已执行检查；§8 的未验收清单（人类确认、18 的真实宿主半、
P8/P10 的 detached 记账、无 `evidence/*.md` 的两票、未覆盖的真实宿主行为、平台/版本范围、既有失败/时序项、付费与凭据）
原样保留，本文件仍不宣称总体完成、不关闭任何未完成验收票。
