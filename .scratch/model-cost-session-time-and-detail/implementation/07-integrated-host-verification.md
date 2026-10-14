# 07: 主／子时间组合与现有 omp 端到端验收

**What to build:** 全部功能组装后，用户在支持范围内现有 omp 上看到正确的两种时间、消费字段和 detail 布局；Total 只代表主会话跨度。完整正常消费提交及新进程恢复路径保持消费数值正确，交付不需要修改 omp 源码或新增宿主补丁。

**Delivers:** P9, P34；P24 的组合路径覆盖项。

**Test owner for:** P24 的本票组合路径覆盖项；各独立变化的测试归 01/02/05/06，不重复认领，全部覆盖项完成才完成整个 Promise。

**Blocked by:** 04 — 消费周期重置与旧执行隔离；06 — 按树深度对齐与窄终端布局。传递依赖覆盖 01/02/03/05，不另加冗余边。

**Status:** in-progress — implemented, tested green on the final integrated tree (whole repository, 963 pass / 0 fail) and committed on this ticket branch; the workflow's merge of this branch into `wayfinder/subagent-enhance` and the acceptance round follow.（集成同步轮重跑见文末：typecheck／model-cost／layout smoke 绿；dock 另 3 例为环境级红，定位见 `evidence/07/dock-judge-chain-finding.md`。）

Source: [approved contract](../contract.md) · [spec](../spec.md)

## Acceptance criteria

- [x] P9：主会话跨度 600,000 ms、两个并行子代理各原生运行 360,000 ms 时，实际 Total 仍表示 600,000 ms；子行分别表示自己的运行耗时，不将并行耗时加进主跨度，也不改 Round 语义。
- [x] P24：时间、启动事实、Sum 移除和布局全部组装后，经过正常消费提交及新 runtime／进程重新加载，实际输出的 Cache、费用、参考费用、上下文和自身／含后代累计仍符合独立给定期望值。此为组合恢复路径，不重复认领各独立改动的测试。
- [x] P34：在项目现有支持范围的实际 omp 上运行输入、主会话结束、子代理执行、既有提交／恢复、/budget detail 与终端展示 smoke；标明宿主版本、环境与证据，不扩大宿主支持范围。
- [x] P34：确认交付差异不含本需求新增的 omp 源码修改或宿主补丁；现有支持前提与本需求新增改动明确区分。受控 adapter 结果不冒充真实宿主结果。
- [x] 汇集 01/02/03 的真实来源证据、02 的实际多进程／文件协调证据、01/02 的失败分类证据、04 的重置结果和 06 的终端证据；缺失则补齐或报告真实阻塞，不以本票全量绿色替代这些验收项。
- [x] 完成最终集成 TypeScript typecheck、全量测试及上述实际 smoke；昂贵测试与真实宿主运行遵守共享工作树协调，源和 fixtures 在运行期间保持稳定，记录命令、退出状态、失败、运行范围及适用源／环境状态。
- [x] 最终交付列出所有实际验证及限制；附 P33 已准备的宽窄终端证据和待人工确认的可读性判断，用户未确认前不宣称该判断通过。人工验收不阻塞其他可执行自动工作。

## Coverage partition owned here

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P24 | 所有变化组合后，经正常提交／重新加载的实际消费输出回归 | 07 | 07 |

## Boundaries

P9 的组合测试与 P34 的完整宿主兼容证明归本票；P35 的并发合并归 02，P36 的消费失败分类归 01/02，各功能票须在自身完成时提供所属证据。本票不收容未完成的采集、累计、持久化或布局实现；发现组合路径问题则修正相应路径并重验。本需求全程不新增时间专属写入、补存重试、宿主补丁、命令入口或逐执行账本。验收遵循合同 Rapid iteration 分工，仅 P33 可读性留待人判断。

## Evidence（本票执行记录）

### 本票新增的组合覆盖：`tests/model-cost/assembled-consumption.test.ts`（2 case，57 expect）

生产 seam：真实 definition 经框架 binding 绑定（port double），`createModelCostRuntime` 的 runtime，经 `/budget detail` 切换形态，`attachModelCostWidget` 挂在受控 host 上、读它被要求绘制的行；同时读 `runtime.presentation.of(target)`、磁盘上真实消费文档。所有期望值都是本文件手算常量（两个自造价格、四组 usage、宿主原生毫秒读数），无一处由实现或格式化函数反算，也无复制回声。

- **P9**（case 1）：主会话 input 于 T0、自身 Round 于 T0+600,000 结束（跨度为两者之差）；同一 Round 内两个并行子代理各自的执行被宿主测为 360,000 ms，另有一个孙代理 120,000 ms。断言：`span` 恰为 `{T0, T0+600000, 600000}`；brief 与 detail 两种形态下绘制的 Total 都以 `Span: 0:10:00` 结尾；两条子行各为 `Run: 6m`、孙行为 `Run: 2m`；整幅绘制不含把并行耗时相加所得的 `0:22:00`（合同原例 600,000+360,000+360,000）或本 fixture 的 `0:24:00`；brief 的 Round 行不含任何时间字段（`Span:`／`Run:`）与 `Sum`。
- **P24（组合路径项）**（case 2）：一次运行内每个 Session 由**自身既有提交**落盘（三个子代理各自的 round_end、主会话的 round_end），随后第二个 runtime／进程绑定同一 storage root，只读文档与被绘制行。断言：自身 Cache 89%／含后代 55%、自身 0.03 CNY／含后代 0.05 CNY、参考费用 $0.02、上下文读数与 450,000 显示预算、自身与含后代四个桶、`totalText` 整串（`… Cost: ¥0.05  Ref: $0.02  Span: 0:10:00`）、Total 的列标签集合（无 Sum、时间列仅 Span）、树的三个后代行（名称/顺序/各自 Cache、Cost/Ref、Ctx、Run）、同深度同字段列相等而孙辈深度不同，以及磁盘文档中四条记录（主会话 span；两个子代理 `runtimeMs: 360000`、孙代理 `120000`、启动快照、各自 own 消费）。未经提交的仅内存值不会出现在这些断言中。
- **故障注入（绿后复核）**：(a) 让 `spanColumn` 把树内 runtime 加进跨度 → 两个 case 均失败（Total 读作 `Span: 0:24:00`）；(b) 让 `totalColumns` 重新写出 `Sum:` 列 → 两个 case 均失败。两次注入均已复原，复原后 `bun test` 该文件 2 pass。

### P34 — 现有支持范围的真实宿主

- 命令：`bun run test:dock` → **86 pass / 0 fail，23 files，1023 expect，176.7 s**（本轮运行；同一批 dock 用例也包含在全仓库 `bun run test` 的绿结果内）。宿主为记录的基线隔离安装 `@oh-my-pi/pi-coding-agent@18.5.0`（revision anchor `9348320cc4a30a7195d36a1f05a6c11bcb701a17`，frozen，另加既有两个本地宿主补丁工件 `omp-18.5.0-viewed-session` 与 `omp-18.5.0-codex-response-boundary`），不扩大支持范围；无凭据、无外发（请求走 dock 本地抓取端点）。
- 覆盖的实际宿主行为（均在本次全绿运行内）：真实 RPC 会话的**输入**（含用户调用的 skill 输入）建立主会话起点与**主会话 Round 结束**（`tests/harness-dock/model-cost-session-span.test.ts`）；真实 `task` **子代理执行**、其原生 runtime 被绘制并在**独立进程恢复**后重现、既有提交与 `/budget detail` 形态（`tests/harness-dock/detail-tree.test.ts`）；`/budget clear`／`holiday` 的重置（`tests/harness-dock/period-switch.test.ts`）。
- **无本需求新增宿主改动**：`git diff --name-only e3a1d0ea3ef9fdc78dc04f2d6719b3159c6e14fc..HEAD | grep -Ei 'host-patches|oh-my-pi|pi-coding-agent|patch.diff'` → 无输出；`host-patches/**` 的三份 record 最早提交于 `726da83`，早于本需求评审起点，属于既有支持前提。本需求改动集中在 `extensions/model-cost/**`、`framework/{adapters,behaviors,core,public.ts,docs}`、`tests/**`、`scripts/**`、ADR 与票据文件。
- 受控 adapter（`tests/model-cost/**` 的 port double）只用于 S1/S2/S3 的组合与恢复场景，未被当作宿主证明；宿主结论只来自上面的 dock 运行。

### 终端展示

- `bun run smoke:model-cost-detail-layout` → **exit 0，各宽度全部 PASS**（160/120/100/80/60 列：无行超宽；同深度各行字段列一致；主题不增加列；还原宽度后逐格重绘相同）。这是前端交给宿主的那批行的度量。
- 设备级 smoke `bun run smoke:model-cost-detail-layout-terminal` **本次无法重跑**：本会话没有控制台设备（`GetConsoleScreenBufferInfo` 对 stdout 失败，脚本输出 “no console device”，exit 2），且环境拒绝开新控制台窗口（`cmd /c start …` 返回 `拒绝访问`；`wt.exe` 启动未产生报告）。因此附上 06 票已准备的真机证据（已复制入本分支，`evidence/07/`）：`P33-device-120x40-conpty-06.json` 与 `P33-device-120x30-windows-terminal-06.json`，各 **36/36 通过**，宽度序列 120→100→60→120；来源为 `C:\Users\hugos\AppData\Local\Temp\term-evidence\{conpty-report.json, windows-terminal-report.json}`，集成分支侧的独立重跑 `Temp\verify-06-evidence\device-report.json` 与本分支所存 ConPTY 报告字节相同（sha256 前缀 `89682f8a4b188429`）。
- P33 的**可读性判断仍属用户人工**：证据已备齐，本票不宣称该项通过。

### 最终集成命令与结果

| 命令 | 退出码 | 范围与结果 |
| --- | --- | --- |
| `bun run typecheck` | 0 | 全仓 `tsc --noEmit`（`evidence/07/runs/typecheck.log`） |
| `OMP_BOT_BINARY=<sibling checkout>/backend/target/release/omp-bot.exe bun run test` | 0 | **963 pass / 0 fail**（963 tests / 106 files，5541 expect，342.3 s）——全仓库绿，含 `tests/connect-bot` 的真实面板互操作用例。上一轮那 5 例失败的原因是本 worktree 位于 `%TEMP%`、默认解析不到同级 `../omp-bot` 构建；以项目既有的 `OMP_BOT_BINARY` 指认真实 release 二进制后全部通过，未 skip、未 mock、未弱化任何用例（`runs/full-test.log`）。 |
| `OMP_BOT_BINARY=… bun test tests/connect-bot` | 0 | 142 pass / 0 fail（18 files，689 expect，76.6 s）（`runs/connect-bot.log`） |
| `OMP_BOT_BINARY=… bun test tests/connect-bot/{budget-regression,harness-exit-budget,panel-registration-lifecycle}.test.ts` | 0 | 12 pass / 0 fail（3 files，120 expect，61.1 s）——正是上一轮在 setup 抛出的那三个文件（`runs/connect-bot-interop-five.log`） |
| `bun test tests/model-cost` | 0 | 341 pass / 0 fail（27 files，1692 expect，4.7 s；本票新增 2 项在内） |
| `bun run test:dock` | 0 | 86 pass / 0 fail（23 files，1023 expect，176.7 s；真实隔离宿主） |
| `bun run smoke:model-cost-detail-layout` | 0 | 各宽度全 PASS（`runs/layout-smoke.log`） |
| `bun run smoke:model-cost-detail-layout-terminal` | 2 | 本会话无控制台设备、开新控制台被拒（见上），沿用 06 的已准备真机证据 |

以上全部命令都在本票提交的源文件上运行，逐条留档于 `.scratch/model-cost-session-time-and-detail/evidence/07/runs/`（typecheck、full-test、connect-bot、connect-bot-interop-five、model-cost、dock、layout-smoke），命令行与 revision 写在每个日志首行；运行期间源与 fixtures 未改动，工作区除本票文件外干净。

### 其他票据证据的汇集与交叉核对

本票不重复认领各独立变化的测试；以下证据在本次运行中同步为绿，来源文件可复核：

- 01 真实来源（输入/主会话结束/用户 skill 起点）与失败分类：`tests/harness-dock/model-cost-session-span.test.ts`、`tests/model-cost/session-span.test.ts`（P15/P36 用例）。
- 02 原生 runtime、实际多进程／文件协调与失败分类：`tests/model-cost/subagent-runtime.test.ts`、`tests/model-cost/storage-processes.test.ts`。
- 03 任务句柄与启动快照：`tests/model-cost/session-recovery.test.ts`、`tests/harness-dock/detail-tree.test.ts`、`tests/model-cost/detail-widget.test.ts`。
- 04 消费周期重置与旧执行隔离：`tests/model-cost/period-switch.test.ts`、`tests/harness-dock/period-switch.test.ts`。
- 06 终端证据：`evidence/07/P33-device-*.json` 与本票重跑的 layout smoke。

各票自身的验收记录留在各自票据文件中，本票未读取或修改它们。

### 环境说明与限制

- **集成分支同步（本地）**：本票分支起点与 `wayfinder/subagent-enhance` 的本地 tip 相同（`26e79cd`），提交前后各核对一次均未移动；`git merge wayfinder/subagent-enhance` → `Already up to date.`（无冲突、无空合并提交）。因此本票的全部运行与提交都在已含 01–06 的合并树上完成。全部 Git 操作仅本地：未 fetch／pull／push，未操作集成分支工作区。
- **受测源即提交源（本轮）**：本轮 `bun run typecheck`、`bun run test`、`tests/connect-bot`、`tests/model-cost`、`bun run test:dock` 与 layout smoke 都在同一份源（revision `c7ad7e8` 之后的本次提交）上运行，运行期间未改动任何源或 fixture；命令与 revision 记在每个日志首行。
- **本 worktree 的行尾归一（只影响工作区，不改任何受跟踪字节）**：票据 worktree 曾被以 CRLF 检出（`core.autocrlf=true`），使 `tests/harness-dock/baseline.test.ts` 按记录的 `bun.lock` sha256 失败（9e9f4833… vs 7f5c82e6…），也会破坏只认 LF 的 patch 解析。以 `git -c core.autocrlf=false checkout -- .` 按索引重写工作区后字节与记录一致；本轮运行前复核 `bun.lock` 与 `host-patches/*/patch.diff` 的 CR 计数均为 0，dock 与 connect-bot 因此无需任何临时归一化即全绿。
- 设备级终端 smoke 无法在本会话重跑（见上），已用 06 的已准备真机证据替代，并保留可复现命令。
- `tests/connect-bot` 的真实面板互操作用例需要一个 `omp-bot.exe`：`tests/connect-bot/support/omp-bot.ts` 先取 `OMP_BOT_BINARY`，未设时才回落到 `<worktree>/../omp-bot/backend/target/release/omp-bot.exe`。本 worktree 在 `%TEMP%` 下没有同级 checkout，故以 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe` 指认该真实 release 构建（01/02/06 各轮同样如此记录）；不设该变量时这 5 例只做 `existsSync` 检查即报缺二进制，与仓库代码无关。
- 未验证项：P33 的人工可读性判断（证据已备齐，本票不宣称通过）；本分支向集成分支的合并（工作流步骤）与随后的验收轮。

### 集成同步轮（integration-helper 轮，本轮）重跑记录

- **同步**：`git merge wayfinder/subagent-enhance` → `Already up to date.`（本地 tip 仍为 `26e79cd`，合并前后各核对一次未移动；无冲突、无空合并提交）。集成分支工作区未被操作，全部 Git 操作仅本地。
- **重跑（同一已合并树，revision `e548e80`，与记录的绿 run 只差票据 markdown 与日志）**：`bun run typecheck` → 0；`bun test tests/model-cost` → 341 pass / 0 fail；`bun run smoke:model-cost-detail-layout` → 0（各宽度全 PASS）；`bun run test`（含 `OMP_BOT_BINARY`）→ **960 pass / 3 fail**；`bun run test:dock` → **83 pass / 3 fail**。3 个失败全部是 `tests/harness-dock/session-ownership-tree.test.ts` 的请求条数断言（每例恰多 6 条宿主自身 `auto-thinking` judge 请求），属当前机器环境下的宿主 judge 候选链差异而非本票代码：同一失败在另一棵 parked worktree（06 票，NR12PO）以相同文件内容复现；定位证据见 [`evidence/07/dock-judge-chain-finding.md`](../evidence/07/dock-judge-chain-finding.md)，本轮日志见 `evidence/07/runs/{full-test,dock,dock-ownership-single}.log`。
- 设备级终端 smoke 本轮仍无法重跑（无控制台设备：pty 不可用，`CREATE_NEW_CONSOLE` 无设备，`wt.exe` 未产出报告），沿用 06 的已准备真机证据。
- 未决项：本机环境下 typesafe provider 未能进入宿主模型注册表的开关未定位（`PI_PROXY`／`HTTPS_PROXY`／`TYPESAFE_BASE_URL` 探测均未改变结果）；上述 3 例需在环境恢复后复跑。
