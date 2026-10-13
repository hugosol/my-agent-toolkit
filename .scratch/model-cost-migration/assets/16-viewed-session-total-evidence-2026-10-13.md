# 16 — 主子查看事实与主树 Total：自动证据与 P11 H1 材料

Ticket: [`implementation/16-viewed-session-total.md`](../implementation/16-viewed-session-total.md)（P11、P21、P22；seam S2／S1+S5）。
Contract: [P11／P21／P22](../contract.md)；展示范围权威 [08-presentation](../lighthouse/08-presentation.md#total当前会话模型字段与完整树累计分开)／[10-assembly-layout](../lighthouse/10-assembly-layout.md#public-facts-and-observation-scopes)。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明，也不是人工验收；H1/H2/H3 未确认项不记通过（**P11 含 H1 人工项**，见第 5 节；P21／P22 只有自动项）。支持基线未变：OMP 18.5.0 / Windows x64 / Bun 1.4.2。

## 1. 本票交付的内容与落点

本票的显示行为已由 01（公开 Viewed session 出口）与 11（`runtime.presentation` 展示 seam、最小生产 widget）交付；本票核实该行为真的落在两条 seam 上、补齐缺失的自动覆盖与 H1 材料。**本票没有改动任何生产源码**（三处新增均为测试文件，加本文档）；第 4 节的注入验证临时改过 `display.ts`／`widget.ts`，回写后已逐字节比对确认与注入前相同。工作区里 `framework/**` 等的未提交改动来自其他 ticket，与本票无关。

| 位置 | 内容 |
| --- | --- |
| [`tests/model-cost/viewed-session-total.test.ts`](../../../tests/model-cost/viewed-session-total.test.ts)（新，S2） | 主／子／孙／兄弟四会话异构树（三个模式、两种币种）经**同一生产入口** `runtime.presentation.of(target)` 观察：`current` 只取 Viewed session 自身当前 provider/model，`tree` 恒为原主会话＋全部后代全部模型；五个目标（跨会话、跨同会话两个模型）读出同一棵树；token-only／hidden 目标不抹掉树里的 CNY Cost／USD Ref；目标 Effort 与 context 只来自该目标，未知为 `?` |
| [`tests/model-cost/viewed-session-widget.test.ts`](../../../tests/model-cost/viewed-session-widget.test.ts)（新，S5 受控事实 adapter） | 直接驱动生产前端 `attachModelCostWidget`，用**受控 host**（`getViewedSession()`／`subscribeViewedSessionChanged()` 由用例给出，绑定的本会话故意是另一个模型）观察：目标切换重绘当前模型字段而 Sum／Cost／Ref 不变；同目标事实（model／effort／context）变化重读；出口未给的 Effort 为 `?`、未给的 context 不画 context 条；hidden 目标清掉 widget；`session_switch` 换绑时旧 ctx 的订阅被解除且旧 ctx 的后续发布不再重绘，detach 解除订阅并清 widget；无 UI 不绘制 |
| [`tests/harness-dock/viewed-session-total.test.ts`](../../../tests/harness-dock/viewed-session-total.test.ts)（新，S5 真实宿主） | 冻结 patched artifact 上的真实 RPC 运行：widget 的 `Effort:` 等于宿主自己报告的 `thinkingLevel`（真实生效值，非 `?`），`set_thinking_level` 后同一目标事实变化被重读、**没有新增模型请求**、同一行其余 Total 数字不变；`reasoning: false` 的模型显示 `Effort: ?`；Total 行为该次运行自身记账（Sum 3,000、Cache 50%、`Cost: ¥0.0050`、比例 `0:20:80`） |
| 未改 | `extensions/model-cost/shared-logic/presentation/display.ts`、`extensions/model-cost/harnesses/omp/widget.ts`、`request-accounting.ts`、`consumption-document.ts`、`framework/**`、ADR、其余 ticket 文件；未新增命令、配置项或 State |

## 2. 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| Effort 取实际生效值而非配置意图，主/子故意不同且不可取显示 ?，只给值着色；context/当前模型事实来自公开 Viewed session | 真实宿主 `viewed-session-total.test.ts` 第①例：`shownEffort(session) === await hostLevel(session)`（宿主 `get_state.thinkingLevel`，本机运行得到真实 level 而非 `?`），`set_thinking_level` 到宿主自己列出的另一个 level 后 widget 的 Effort 随之为该值、widget 帧数增加、`capture.requests()` 仍为 1（重读事实而非新 Turn）。S5 受控 `viewed-session-widget.test.ts`：绑定的本会话模型是 `official/model-beta`，出口发的是子代理的 `go-provider/model-alpha` 且无 effort —— widget 显示该子代理自己的 40% 命中率与 `Effort: ?`（若读绑定或配置会得到 0% 命中率的 monetary 结果，可直接区分）；主／子两个目标分别给出 `high`／`low` 互不相同（S2 `viewed-session-total.test.ts` 末例）。`context` 未取得时不画 context 条（不是 0）。**「只给值着色」属视觉**：本票前端是最小生产前端（无颜色），Effort 着色的最终判断归 [20 票](20-tui-boundary-timer.md) 的 P67 H1，本票只证值本身 |
| Total 当前模型 Cache/Input/Output/命中率/结构参考取 Viewed session 自身当前 provider/model，不混其他模型或含后代累计 | S2 第①②③例：看兄弟时 `current` 恰为该兄弟自身 `go-provider/model-alpha` 的 5/5/0/5（Sum 15、命中率 50%），兄弟自己另一个 `plan-provider` 条目、父的两个 pair、孙的 pair 都不在内；`session-sub` 在其 `official/model-beta`（Sum 150、命中率 0、比例 0:50:50）与 `go-provider/model-alpha`（Sum 60、无金额无比例）之间切换只改 `current`、`tree` 完全不变；比例按该目标自己当前模型的价格算（alpha 4:7:89、beta 0:50:50、Codex 四项 11:33:11:45，三者互不相同），已累计金额不重价。故意让整树（Sum 7,112／Cost 0.8／Ref 0.05）与每个目标自身字段不同 |
| Total Sum/Cost/Ref 仍为原主会话和全部后代全部模型，查看子不丢父/兄弟，费用按各自单位，不因当前模式伪造免费 | S2 第④⑤⑥例：看孙时 `tree` 仍是四会话整树（tokens 1582/2145/60/3325、Sum 7,112、Cost 0.8 CNY、Ref 0.05 USD，均手算字面值）；五个目标（主／子／孙／兄弟两个模型）读出同一棵树；token-only 目标自身无金额，树仍同时保留 `costCny` 与 `referenceCostUsd`；hidden 目标同样保留树的两币种且无预算（无伪造免费）。S5 受控 widget 例：目标从主切到子后 Sum／Cost 字面不变（`Sum: 6,100  Cost: ¥0.05`）、只有当前模型部分从 `Cache: 67%  ¥Cache/In/Out：4:7:89` 变为 `Cache: 40%` |
| 主/子/孙/兄弟异构数据通过 S2 和隔离查看操作验证，故意让整树总值与目标自身字段不同；目标切换和同目标事实更新触发重读，不捕获旧 ctx | S2：四会话异构树 + 五个查看目标，`current.sum` 逐个为该目标自己的 6000/150/7/15/130 而 `tree.sum` 恒为 7,112。隔离查看操作（S5 受控事实 adapter）：目标切换（主→子）重绘为新区段；同目标 model／effort／context 变化重读为最新值；`session_switch` 后旧 ctx 的订阅被解除、旧 ctx 再发布不重绘（旧 ctx 未被捕获）；真实宿主上同目标 `thinking_level_changed` 重读亦成立。反向注入验证见第 4 节 |
| 准备 P11 H1 实际目标 Effort 场景、冻结 artifact、切换步骤及自动事实对照；主子 brief/detail 往返与偏好完整责任由 17 承担 | 第 5 节给出完整 H1 材料；17 票持有主子 brief/detail 往返与偏好，本票不认领 detail 树、brief、入口偏好行为（本票前端不渲染 detail／Round） |
| 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | S2 只经 `createModelCostRuntime` ＋ framework 公共绑定（`portDouble`）读 `runtime.presentation`；S5 受控例只经生产前端 `attachModelCostWidget` 与受控 host 上下文读 `setWidget` 帧；S5 真实例只经真实宿主 RPC（`get_state`／`get_available_thinking_levels`／`set_thinking_level`／`setWidget` 帧／capture endpoint）。期望全部来自规格（`?`、450K、两币种不混、树范围）或本文手算数字（7,112／0.8／0.05／6,100／0.00502 等）；所有永久用例只打本机 capture endpoint 或纯内存，无真实网络 |
| 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备 | S5 用记录基线 artifact `.cache/omp-baseline/18.5.0-viewed-session`（`ensureViewedSessionHarness`，即 01 票冻结补丁 artifact，哈希校验通过后才运行）＋ `createRunRoot` 的独立 agent state／`--session-dir`／work／capture／user-home；扩展 `~/cost-archive` 落在 run root 的 user-home；`models.yml`／baseline 文档只写 run 自己的 agent state。未触碰正式 OMP、未重启、未改配置、未发送验证命令；断言失败会带实际 widget 文本，无秘密、无正式环境路径 |

## 3. 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost/viewed-session-total.test.ts` | 7 pass / 0 fail（70 expect，50ms） |
| `bun test tests/model-cost/viewed-session-widget.test.ts` | 6 pass / 0 fail（18 expect，50ms） |
| `bun test tests/harness-dock/viewed-session-total.test.ts` | 2 pass / 0 fail（20 expect，3.7s；两个真实 RPC 运行，各 1 个请求打到本机 capture endpoint） |
| `bun test tests/model-cost tests/harness-dock/viewed-session-total.test.ts` | 188 pass / 0 fail（16 文件，9.5s；含 07／08／09／11 既有各套件，无回归） |
| `bun run typecheck`（`tsc --noEmit`） | 无输出（exit 0） |

## 4. 反向注入验证（跑完即恢复；生产源码已用逐字节比对确认回到注入前）

| 注入 | 结果 |
| --- | --- |
| `display.ts` 的 `current` 去掉 `provider`／`model` 收窄（当前模型不再限定） | `viewed-session-total.test.ts` 4/7 失败（P21 三例 + P22「五个目标同一棵树」），其余仍过 —— 该集合正是唯一能区分两者之处 |
| `display.ts` 的 `tree` 用 `inclusiveTotals(target.sessionId)`（换成所查看子树） | 同文件 3/7 失败（P22 三例全灭） |
| `widget.ts` 改用绑定 ctx 的 `sessionManager`／`model` 而非出口 facts | `viewed-session-widget.test.ts` 3/6 失败（P11「不借用绑定」例、目标切换例、同目标变化例） |
| `widget.ts` 的 `followSession` 不再解除旧 ctx 订阅（保留旧 ctx） | 同文件 1/6 失败，恰为「切换后的 ctx 被丢弃而非保留」一例 |
| 恢复 | `cp` 备份回写后 `cmp` 逐字节相同（RESTORED-IDENTICAL），全部用例复跑 188 pass / 0 fail |

## 5. P11 H1 材料（真实目标 Effort，人工确认用；**未执行**）

P11 的人工项是「真实目标 Effort 可见性」。自动部分（出口真的给出实际生效 Effort、widget 真的读它、未知真的为 `?`、变化真的重读）已由第 1 节两个 S5 套件覆盖；下面只留下必须由人在真实 TUI／真实模型上确认的那一步，材料已就绪，不需要重建。

**冻结 artifact。** `.cache/omp-baseline/18.5.0-viewed-session`（gitignored）：基线 `@oh-my-pi/pi-coding-agent@18.5.0`，checkout `9348320cc4a30a7195d36a1f05a6c11bcb701a17`；`patch.diff` 与每个文件的 post-patch 哈希记在 [`host-patches/omp-18.5.0-viewed-session/record.json`](../../../host-patches/omp-18.5.0-viewed-session/record.json)，哈希不符则拒绝运行。重新物化：

```
bun -e 'import { ensureViewedSessionHarness } from "./tests/harness-dock/viewed-session-harness";
        const h = await ensureViewedSessionHarness(); console.log(h.cliPath)'
```

**切换步骤（交互 TUI，隔离环境）。**

1. 建 run root：`agent-state/`、`sessions/`、`work/`；清空解析偏移量（`OMP_PROFILE`／`PI_PROFILE`／`OMPCODE`／`PI_CONFIG_FILES`／`XDG_*`／`PI_CODING_AGENT_DIR`／`OMP_AUTH_BROKER_*`），设 `PI_CODING_AGENT_DIR=<run>/agent-state`。
2. 用本仓 model-cost 入口启动：`bun <prefix>/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts --session-dir <run>/sessions --cwd <run>/work -e <repo>/entrypoints/omp/model-cost.ts --model <一个 reasoning 模型>`。**必须用 reasoning 模型**（无 thinking level 的模型按设计显示 `?`，见 2 节末例），否则本检查无从区分「实际值」与「不可取得」。
3. 让主会话先有一个上下文读数（随便问一句）——context 条与 Effort 同处一行，没有 context 读数时该行不画（这是既定行为，不是缺陷）。
4. 发一个会 spawn 一个子代理的任务；用 TUI 的 focus 手势把视图切到该子代理。
5. **对照三处都应是子代理自己的值**：状态行／composer 的 effort chip；`Total:` 行的当前模型字段（Cache 命中率与 Cache/In/Out 比例）；context 条。整树 `Sum`／`Cost`／`Ref` 必须**不变**（仍是主会话＋全部后代）。
6. 在子代理上改一次 thinking level（TUI 的 level 切换），Effort 应随之更新，`Sum`／`Cost`／`Ref` 不动。
7. 切回主会话：Effort、当前模型字段、context 都应回到主会话自己的值（不残留子代理的）。

**期望值从哪来。** 与自动结果逐项对照：`Effort` 应等于宿主自己在状态行／`get_state.thinkingLevel` 报的同一值（自动例已证 `shownEffort === hostLevel`，且 `set_thinking_level` 后无新请求）；`Sum`／`Cost`／`Ref` 应与切到子代理前完全相同（自动例已证跨目标不变）；当前模型字段应换成子代理自己的 provider/model（自动例已证 `Cache: 67% ¥Cache/In/Out：4:7:89` → `Cache: 40%` 而 `Sum: 6,100  Cost: ¥0.05` 不变）。

**自动事实对照入口（已在仓库内，无需新建）。**

- 真实宿主读数：`tests/harness-dock/viewed-session-host.test.ts` 的 probe fixture（`tests/harness-dock/fixtures/viewed-session/probe.ts`）把 `ctx.getViewedSession()` 每次交付原样写到 stderr；回答「宿主到底发了什么」。
- 本票的真实宿主 widget 对照：`bun test tests/harness-dock/viewed-session-total.test.ts`。
- 受控对照：`bun test tests/model-cost/viewed-session-total.test.ts tests/model-cost/viewed-session-widget.test.ts`。

**本环境未覆盖的部分（H1 之所以仍需人工）。** 上述真实运行都是 RPC（headless）宿主：那里没有独立视图，`getViewedSession()` 回落为「本会话自身」，因此**主／子不同目标**与**focus 切换**没有被真实 TUI 跑过（01 票 README 同样记录：interactive focus 路径在本环境未运行，属未验证）。子代理视图下的 Effort／当前模型字段与整树 Total 的对照，本票用受控事实 adapter 与 S2 精确证明其取值规则，但「TUI 真的把视图切到子代理、widget 真的随焦点重绘」只能由人工在上面的步骤里确认。Effort **着色**（「只给值着色」）与窄宽降级同属视觉，由 20 票的 P67 H1 覆盖，不在本票范围内。

**结论：P11 的 H1 未验证——需用户确认。** 未确认不记通过。

## 6. P58／P52 中本票的具名责任

本票不承接 P58（消费者迁移）与 P52（持久文档 schema）的实现责任，也未触碰其任何生产文件：S2 用例只读 `runtime.presentation` 与 `runtime.view`，落盘 schema／字段沿用 06／07／09 已验版本；S5 用例给 run 写／读的 baseline 文档就是既有形状（`schemaVersion/periodId/start/holiday/harnesses → id/name/parent/saveVersion/own`），未新增字段、未写入新组织。P52 的独立 schema 检查仍由 06 票持有，本票未使其失效；P58 的消费者回归由 22／23 票持有。

**「未改动生产源码」的核验方式**：本票只新增测试文件与本文档；反向注入验证用的四个补丁全部回写并与备份 `cmp` 逐字节相同（第 4 节末行）。因此本票不存在需要迁移的调用方，也不存在被本票改变的行为。

## 7. 平台事实与已知限制（**未验证项**）

- **主／子不同目标的真实 TUI 切换未跑**：见第 5 节末段（RPC 宿主没有独立视图）。受控事实 adapter 与 S2 已给出取值规则的确定性证据，但真实焦点路径仍待人工。
- **Effort 着色与视觉格式**：本票前端无颜色、无窄宽降级、不渲染 Round／detail（11 票记录的最小生产前端）；视觉由 20 票收口，不是本票通过项。
- **`currentText` 在毫无会话输入时显示 `Cache: 0%`**（`display.current.cacheHitRate` 本身在此时为缺省，见 [11 票证据](11-modes-currency-metrics-evidence-2026-10-13.md)与 `fieldsOf` 注释）：这是显示文本层把「无输入」呈现为零命中率，与「无统计口径不伪造免费」无关（金额字段仍是缺省而非 0）。**本票未把它记为通过，也未在本票擅自改动**：本票的 P21 只规定该字段取自哪个范围；「未知命中率怎么显示」属 11 票已交付的文本格式与 20 票的视觉范围，需由其所有者决定（受控用例把现状固定为字面值 `Cache: 0%`，改动时该断言会失败并提示）。
- **widget 在 outlet 存在但字段缺失时回落绑定 ctx 的 session／model**（`widget.ts` 的 `facts?.x ?? ctx.model?.x`）：这不是「猜主会话」，因为在补丁产生的每种模式下绑定 ctx 与出口指向同一实际 Session —— 有 view source 时 `read()` 总带 provider/model；无 source 时出口回落为该 runner 自身的事实，而该 ctx 的 `model` 就是同一 Session 的模型；未打补丁的宿主则完全没有 outlet，按要求回落本 Session。受控用例覆盖的是「出口给出另一个 Session」这一主路径（此时字段齐备，回落不生效）。
- **本票 P11 的条件性 H3**：仅在真实 OMP 脚本多次失败或成本过高时才转人工；两个 S5 真实用例一次通过（3.7s，无重试），因此**没有需要转交的具体 H3 场景**（无则无）。H2 本票不持有。
- **正式 OMP 环境未触碰**：全部运行在 `.cache/omp-baseline/18.5.0-viewed-session` 与临时 run root 内；未重启、未改配置、未对当前调度实例执行验证命令。
