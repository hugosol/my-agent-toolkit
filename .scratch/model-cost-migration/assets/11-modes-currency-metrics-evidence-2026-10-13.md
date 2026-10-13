# 11 — 消费模式、双币种与只读指标：自动证据与真实贯通

Ticket: [`implementation/11-modes-currency-metrics.md`](../implementation/11-modes-currency-metrics.md)（P7、P8、P9、P10、P25，seam S2／S5）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明，也不是人工验收；H1／H2／H3 未确认项不记通过（**本票四条承诺的 Coverage 中 P8／P9／P10 含条件性 H3**，见末节；P7／P25 只有自动项）。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`extensions/model-cost/shared-logic/presentation/display.ts`](../../../extensions/model-cost/shared-logic/presentation/display.ts)（新） | 展示 seam 的只读结果：`mode`（由 maintained data 的精确 provider＋model 决定 monetary／allowance／token-only／hidden）、`current`（该目标自身 provider／model 的字段，**按 mode 门控**：token-only／hidden 不含任何金额与比例）、`tree`（该 Session 所属主树全部 provider／model 的混合汇总，两种币种各一字段、永不相加或换算）、`budget`（固定显示预算＋是否越界）、`effort`（未知 `?`）、`context`。纯计算：`fieldsOf`（作用域字段）、`referenceRatioOf`（该模型当前价格 × token 后归一化，最大余数法）、`displayBudgetOf`（450K／272K／无）。显示文本规则也在 shared logic：`formatTokens／formatCny／formatUsd／amountText／currentText／totalText／budgetBarText` |
| [`extensions/model-cost/shared-logic/model-data.ts`](../../../extensions/model-cost/shared-logic/model-data.ts) | 新增 `dataCatalog(data)`：把原来 runtime 内联的 catalog 闭包提为具名导出，供 framework 的请求锚价快照**与**本票展示的比例查询共用一份（monetary 档回答谷价，其余模式什么也不回答） |
| [`extensions/model-cost/shared-logic/runtime.ts`](../../../extensions/model-cost/shared-logic/runtime.ts) | `ModelCostRuntimeInputs.catalog?`（可选：允许 harness 提供数据之外的 catalog 价格，例如宿主 catalog；缺省即 `dataCatalog(data)`）；`ModelCostRuntime.presentation: ConsumptionPresenter`；`implementation.catalog` 改用同一 catalog。记账仍只吃 `data`／锚价，不因该输入改变任何已算金额 |
| [`extensions/model-cost/harnesses/omp/widget.ts`](../../../extensions/model-cost/harnesses/omp/widget.ts)（新） | OMP 专属最小生产前端：`MODEL_COST_WIDGET_KEY = "z-model-cost"`、`widgetLines(display)`（hidden 返回 `undefined`＝**不创建** widget；其余模式先固定预算条＋实际 Effort，再 Total 行）、`attachModelCostWidget(pi, runtime)`（在 `session_start／session_switch／session_branch` 取原生 ctx、订阅宿主公开 Viewed session 变更、订阅 `runtime.view`，每次重读 `runtime.presentation.of(...)`；`hasUI !== true` 不绘制；返回的 detach 清订阅并清 widget）。目标事实只经宿主公开出口 `ctx.getViewedSession?.()`，不可取得时回落本 Session，绝不猜主会话 |
| [`extensions/model-cost/harnesses/omp.ts`](../../../extensions/model-cost/harnesses/omp.ts) | factory 内保存该进程唯一 runtime，`export default` 在 binding 后接上 widget 前端 |
| [`extensions/model-cost/GLOSSARY.md`](../../../extensions/model-cost/GLOSSARY.md) | 新增领域词 **Display budget（显示预算）**：450K（monetary 与 token-only／Go 同值）／272K（allowance），纯展示、不可配置、不限制请求／输出／上下文窗口／压缩；明确 `_Avoid_: context window, compaction threshold, request limit` |
| [`tests/model-cost/display.test.ts`](../../../tests/model-cost/display.test.ts)（新） | S2 套件 11 例：混合树双币种、token-only／hidden 门控、三种预算与越界边界、DeepSeek 谷价与 Codex catalog 四项比例、非整除百分比的最大余数分配、缺价／全零／catalog 不回答一律不可用且不借他模型或已累计 Ref、Effort 未知。自造 `ModelPricingData`（`XTS`）＋字面金额／比例，期望全部手算，未调用被测实现生成期望 |
| [`tests/harness-dock/model-cost-modes.test.ts`](../../../tests/harness-dock/model-cost-modes.test.ts)（新） | S5 隔离真实宿主套件 4 例：hidden（真模型执行＋零 widget）、token-only（Go provider 由 run 自己的 `models.yml` 定义，展示批准字段且全文无币种）、allowance（272K、无捏造 Cost／Ref）、monetary（450K、已算金额、与未加载扩展的对照请求体逐字一致） |
| 未改 | `consumption-document.ts`（schema 与字段未动）、`consumption-store.ts`、`request-accounting.ts`／`request-price.ts`（锚价与累计算法未动）、framework 任何模块、ADR、其余 tick 文件 |

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 混合 Session 树分别保留 CNY Cost、USD Ref 和 token；Codex Ref 不是订阅实付，不换算混币种，不因当前 token-only／hidden 抹掉其他已知贡献 | `display.test.ts` 第①例：目标自身是 token-only，主树＝主会话（monetary 0.05 CNY＋allowance 0.02 USD）＋子代理（token-only）＋孙（monetary 0.5 CNY），`tree.costCny === 0.55`、`tree.referenceCostUsd === 0.02` 两个字面字段、token {1417,2120,50,3230}／Sum 6817 手算；同一例断言该 token-only 目标自身没有金额与比例——即“当前模式没有抹掉树里其他渠道的已知贡献”。S5 侧 allowance 例断言纯 Codex 会话不出现 `Cost:`／`¥`（不捏造人民币零），monetary 例出现 `Cost: ¥0.0050`（小数期 holiday 谷价手算） |
| token-only 仅批准四类 token／命中率／Sum／context／实际 Effort／Session／正常 Round／detail 的适用指标，无自身金额／费用结构／官方峰谷余额／Go 额度／Codex 窗口估计 | `display.test.ts` 第②③例：`mode === "token-only"` 时 `current` 恰为 tokens＋Sum＋命中率（1000/3000 → 33），即使记录里**写着** `costCny: 9.99`／`referenceCostUsd: 8.88` 也不显示；hidden 同理且连 `budget` 都没有。`ConsumptionDisplay` 结构上不存在余额／额度／窗口字段（这些能力属 12／13／14 票，尚未存在，故“不显示”不靠判断）。S5 token-only 例在真实宿主 widget 全文断言无 `¥`／`$`／`Cache/In/Out` |
| hidden 不创建用量 widget，不改变模型执行权限；捕获实际宿主执行和 widget 结果，不仅测试分类返回值 | S5 第①例：真实 patched 宿主上以未收录 provider／model 运行，`prompt` 状态 `completed`、`agentInvoked: true`、捕获端点实收 1 个请求（模型确实执行），而 `extension_ui_request/setWidget` 中该 key 从未携带过 lines（该 widget 未被创建）。注意它不是恒真：注入验证见下节 |
| 固定显示预算按规格 DeepSeek／Go 450K、Codex 272K；只展示告警，不改变请求、输出、上下文窗口或压缩，不恢复数字／K／0 参数 | `display.test.ts` 第④⑤例：`budgetOf` 以字面 450_000／450_000／272_000／undefined 覆盖 monetary／Go token-only／Codex／hidden，越界边界 449_999／450_000 不越、450_001 越；S5 侧 token-only 与 monetary 显示 `450.0K`、allowance 显示 `272.0K`。不改执行的证据：monetary 例把同一模型、同一端点、同一 prompt 的**未加载 model-cost 扩展**对照运行的捕获请求体与实验运行逐字比较（仅 run 自身的临时工作目录被归一化），两者相等——预算只是显示。无 `/budget <N>K`／`0`／别名入口（本票未新增任何命令参数） |
| 费用结构参考占比用对应模型当前价格乘 token 后归一化，DeepSeek 谷价、Codex 对应 catalog 四项；缺价／全零不可用，不借其他模型或历史 Ref 反推，不重价金额 | `display.test.ts` 第⑥–⑨例：DeepSeek（数据谷价 2/0.5/8 与 1/0.02/4）得 4:32:64；非整除的 3.703/7.407/88.888 经最大余数得 4:7:89（注入验证见下节）；注入的 Codex catalog 价格（input 1／cacheRead 1／cacheWrite 2／output 2）得四项 10:40:10:40（cache write 计入）；tier 缺价与 catalog 不回答都 `referenceRatio === undefined`，同时 token 与已算金额保留；全零作用域不可用；已累计 `referenceCostUsd` 存在而 catalog 不回答时比例仍不可用（比例不从 Ref 反推）；所有比例用例同时断言已算 `costCny` 未变（不重价）。S5 monetary 例另证峰／谷不改变比例（holiday 谷价下同为 `0:20:80`） |
| 永久行为 tests 用自造数据和独立金额／比例；隔离出站捕获证明 token-only／hidden／预算不改变执行，S2 与最小生产前端展示可独立观察，不等待最终视觉票才提供模式行为 | `display.test.ts`（S2）与 `model-cost-modes.test.ts`（S5）都是自造数据＋手算／字面期望；S5 每个模式都断言捕获端点实收请求数与状态（token-only／hidden／allowance／monetary 四例均 1 个真实请求且 `completed`）；S2 的结果与前端渲染的 widget 行可分别在 `runtime.presentation` 与 `setWidget` frames 上独立观察，不需要等 20 票的视觉实现 |
| 通过批准的生产公共 seam 观察行为，预期来自合同／规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | S2 只经 `createModelCostRuntime`＋framework 公共绑定（`portDouble`）读 `runtime.presentation`；S5 只经真实宿主 RPC 操作者入口（`setWidget` frames、capture endpoint、stderr）读行为。期望全部来自规格（450K／272K、谷价、峰段不改变比例）或本文件的手算数字；永久 test 不访问真实网络（全部打到本机 capture endpoint 或纯内存） |
| 使用隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备 | S5 用记录基线 artifact `.cache/omp-baseline/18.5.0-viewed-session`（`ensureViewedSessionHarness`，即 01 票 patched artifact，本轮用其冻结 revision 而非本机正式 OMP）＋ `createRunRoot` 的独立 agent state／`--session-dir`／work／capture／user-home；扩展的 `~/cost-archive` 落在 run root 的 user-home 内；`models.yml`／`config.yml` 只写 run 自己的 agent state。捕获端点为 `127.0.0.1` 本机临时端口，无真实凭据、无真实 provider 访问；断言失败会带实际 widget 文本／状态（如本轮 `Received: "[░░… 0% (2,000/450.0K)] Effort: ?\nTotal: Cache: 50% Sum: 3,000"`），无秘密、无正式环境路径 |

## 真实宿主上发现的事实（实施注意）

- **RPC 模式下 `hasUI === true`**（`--no-ui` 才为 false），所以 `setWidget` 帧在 dock 的普通 RPC 运行里真实出现；本票据此把“hidden 不创建 widget”证成 **没有携带 lines 的帧**，而不是“没有帧”。
- **endpoint 的 wire usage ≠ 框架读数**：capture 端点按 OpenAI 形状发送 `prompt_tokens: 2000` + `prompt_tokens_details.cached_tokens: 1000`，宿主据此报告的非缓存 input 是 **1000**（不是 2000）。本票的 S5 期望按这个事实手推（1000/1000/0/1000 → Sum 3,000、命中率 50%），第一次写错的期望（33%／4,000）被真实运行直接抓出。
- **自造 provider 的 `models.yml` 必须同时给 `apiKey`**：只写 `auth: "none"` 或省略 key 时，宿主在发问前以 `No API key found for opencode-go.` 拒绝，请求根本不出站（捕获 0 个请求）。Go provider 不在内置目录，只能由 run 自己的 `models.yml` 定义（`baseUrl`＋`apiKey`＋`api`＋`models`）。
- **widget 在记账变化时会重读**：`session_start` 时渲染的是 `Sum: 0`，请求 settle（`announce`）后自动变成真实数字——这条链路在真实运行里被观察到，也是 S5 断言读到非零 Sum 的前提。

## 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost/display.test.ts` | 11 pass / 0 fail（43 expect；S2 分组：P7 1、P8 2、P10 2、P25 5、目标事实 1） |
| `bun test tests/harness-dock/model-cost-modes.test.ts` | 4 pass / 0 fail（32 expect，9.5s；四例各 1 个真实请求打到本机捕获端点） |
| `bun test tests/model-cost` | 105 pass / 0 fail（9 文件，2.5s；含 07／08／09 各套件，无回归） |
| `bun test tests/harness-dock/model-cost-accounting.test.ts tests/harness-dock/model-cost-store.test.ts tests/harness-dock/model-cost-modes.test.ts` | 10 pass / 0 fail（20.0s） |
| `bun run smoke:model-cost-data` | 20 passed / 0 failed（数据事实抽查，含 two official ids／five Go ids／allowance provider／档价／峰段） |
| `bun run typecheck`（`tsc --noEmit`） | 无输出（exit 0） |
| `bun test`（全仓） | 本会话启动后未在报告前收到结果（后台运行中）；上一票记录的同仓基线为 648 pass / 4 fail，4 个失败为既存环境项（`baseline.test.ts` 本机 `oh-my-pi` 检出锚点、以及需要本机 127.0.0.1:8787 真实面板的两条 connect-bot 用例），与本票无关 |

## 本轮注入验证（跑完即恢复，仓库内无注入残留）

| 注入 | 结果 |
| --- | --- |
| `referenceRatioOf` 去掉最大余数分配（只取 floor） | P25 的“4:7:89”一例失败（得到 3:7:88），其余整除用例仍过——该例正是唯一能区分两种实现的用例 |
| `widgetLines` 让 hidden 也返回一行 | S5 hidden 例失败（该 key 出现了携带 lines 的帧） |
| （S2 首次红态）`fieldsOf` 不看 `amounts` 门控 | P8 两例失败（token-only／hidden 的 `current.costCny` 得到记录里的 9.99／7.77）；加回门控后转绿 |

## P58／P52 中本票的具名责任

本票不承接 P58（消费者迁移）与 P52（持久文档 schema）的实现责任，行为上未触碰 `consumption-document.ts`／`consumption-store.ts`：S2 用例只读 `runtime.presentation`，落盘 schema 与字段（含 `costCny`／`referenceCostUsd` 两币种字段）沿用 06／07／09 已验版本；S5 用例给 run 写的 baseline 文档就是该 schema 的既有形状（`schemaVersion/periodId/start/holiday/harnesses`），未新增字段。P52 所需“持久文档只含批准 schema”由 06 票的独立检查持有，本票未使其失效。

## 平台事实与已知限制（**未验证项**）

- **Codex 参考金额与 Codex 比例的价源在本次交付中不可达**：规格说“Codex 请求价格从对应 provider／model 的 framework catalog 开始快照取得”“Codex 使用对应 catalog 的 input／cacheRead／cacheWrite／output”。当前 framework 里**唯一**的 catalog 是扩展自己的 `ExtensionImplementation.catalog`（`behaviors/turn-events.ts` 只查它），而扩展数据明确不含 Codex 价格（`docs/model-data-maintenance.md`：金额来自 framework 提供的对应 provider／model catalog 价格，不在本数据内）；宿主侧的模型价格事实（`ctx.models`／`ctx.model.cost`）尚未被 adapter 映射成 framework catalog 价格。因此 **生产运行中纯 Codex 会话目前不会出现 `Ref:`**——本票把它作为“无价格就不捏造”的诚实结果断言（S5 allowance 例：有 272K 预算条、无 `Cost:`／`Ref:`／`¥`），Codex 四项比例的算法本身用注入 catalog 价格在 S2 得到验证。补齐价源属 framework／adapter 的装配接线（未决），本票不自行发明第二价源、不写死真实常量，也未把它静默记成通过。
  - **已过时（superseded，2026-10-13）：该价源缺口已由当前的 adapter 接线关闭，原文按原样保留。** 现在宿主模型价格确由 adapter 映射进 framework catalog：`framework/adapters/omp.ts` 从活动 session context 的 `models`（每百万 token 的美元四桶）取价，`framework/docs/framework-capabilities.md`「The harness's own model prices are a fact the factory receives」一段把它写成公共事实，`framework/core/protocol.ts` 的 catalog 段写明「harness 自己的 catalog 从另一个方向来、由 adapter 映射」。生产贯通证据是 `tests/harness-dock/model-cost-modes.test.ts` 的 allowance 例（真实 patched 宿主、run 自己的 `models.yml` 1/1/2/2 USD／百万 token 对 1000/1000/500/1000，手算 `Ref: $0.0050`；同一文件另有「先 CNY 后切 Codex」一例同时出现 `Cost: ¥0.0055` 与 `Ref: $0.0050`），该文件头自身说明这一半「由生产运行产生，而不是注入 catalog」。本票其余推断与读数（记录时的不可达状态）不作改写。
- **Round 与 detail 行未在本票渲染**：`token-only` 的批准指标清单包含正常轻量 Round 与 detail，本票的 `ConsumptionDisplay` 不含 Round（`runtime.view.roundTotals` 由 08 票交付、`detail` 偏好由 02／17 票持有），故 widget 目前渲染“固定预算条＋Effort”与 Total 行；这是渲染子集，不是把未批准字段显示出来（`current` 的门控仍成立）。
- **真实 TUI／窄宽降级与配色**（H1，20 票）：本票前端是最小生产前端（无颜色、无分段条、无 5h／7d 窗口与余额），视觉由 20 票收口。
- **本票 P8／P9／P10 的条件性 H3**：仅在真实 OMP 脚本多次失败或成本过高时才转人工；本票四个 S5 用例全部一次通过，因此**没有需要转交的具体 H3 场景**（无则无）。H1／H2 本票不持有。
- **正式 OMP 环境未触碰**：全部运行在 `.cache/omp-baseline/18.5.0-viewed-session` 与临时 run root；未重启、未改配置、未执行验证命令于当前调度实例。
