# 07 — 请求锚价与可靠 usage 记账：自动证据与真实贯通

Ticket: [`implementation/07-request-price-accounting.md`](../implementation/07-request-price-accounting.md)（P1、P2、P4、P5、P6、P59，seam S2／S5）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明，也不是人工验收；H1／H2 与允许的条件性 H3 未确认项不记通过（本票六条承诺的 Coverage 只含自动项与条件性 H3，无 H1／H2；见末节）。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`extensions/model-cost/shared-logic/model-data.ts`](../../../extensions/model-cost/shared-logic/model-data.ts) | 本扩展唯一的数据模块：`MODEL_PRICING_DATA`（精确 provider+Model ID → 模式／计价档、Go 五个 token-only ID、`openai-codex` 额度渠道、pro／flash 谷价、共用峰价系数、北京时区与两个含端点峰段、币种单位）＋ `entryOf`／`classify`／`catalogPriceOf`。没有第二份价格／比例表，不由 YAML 配置，不运行期发现或热更新 |
| [`extensions/model-cost/shared-logic/request-price.ts`](../../../extensions/model-cost/shared-logic/request-price.ts) | 锚价算法（数据作参数注入）：`seasonAt`（北京工作日含端点峰段、周末与 holiday 谷价）与 `requestPriceOf`（按开始瞬间与 holiday 决定 `monetary`／`missing-price`／`no-amount-policy`；峰价＝谷价×数据系数）。本票不再有任何永久用例直接调用这两个 helper |
| [`extensions/model-cost/shared-logic/request-accounting.ts`](../../../extensions/model-cost/shared-logic/request-accounting.ts) | 记账：按身份只计一次的 Turn 累计、四类 token 分开累加、缺 usage／缺价的跳过与提示、每小时一次金额、`ConsumptionView`（只读结果＋变更订阅）与 Round 结束时的快照提交（版本取自本实例自己的上一份快照，Revision 计数防止在途保存回写覆盖新累计） |
| [`extensions/model-cost/shared-logic/runtime.ts`](../../../extensions/model-cost/shared-logic/runtime.ts) | 业务实例扩展：`implementation`（catalog＝数据里的谷价快照、一个逐实际 Session 的订阅组接 turn_start／turn_end／round_end、初始化、清理）、`view`、`initialize`；`data` 是可注入输入，本票的 S2 用例用它注入自造数据 |
| [`extensions/model-cost/harnesses/omp.ts`](../../../extensions/model-cost/harnesses/omp.ts) | 装配新增 `harness: "omp"`（持久身份里的 harness 半边）并返回 runtime 的 implementation |
| 文档 | [`extensions/model-cost/docs/model-data-maintenance.md`](../../../extensions/model-cost/docs/model-data-maintenance.md)：数据来源、更新步骤（第 4 步改指维护 smoke）与禁止事项（P59 的维护文档） |
| 测试 | [`tests/model-cost/request-accounting.test.ts`](../../../tests/model-cost/request-accounting.test.ts)（22，S2 seam：锚价、分类、记账、确认零、缺 usage／缺价、去重／保存／拒绝，全部自造数据）、[`tests/harness-dock/model-cost-accounting.test.ts`](../../../tests/harness-dock/model-cost-accounting.test.ts)（4，真实隔离 OMP） |
| 维护 smoke | [`scripts/model-cost-data-smoke.ts`](../../../scripts/model-cost-data-smoke.ts)＋`package.json` 的 `smoke:model-cost-data`：实际名单／价格／峰段／系数与批准覆盖的隔离核对（维护脚本，不进 `bun test`） |
| 框架公共契约 | ①[`framework/core/protocol.ts`](../../../framework/core/protocol.ts) 的 `FeedbackLevel` 补 `"warning"`（原 `"info" | "error"`）＋[`framework/docs/framework-capabilities.md`](../../../framework/docs/framework-capabilities.md) 相应行：跳过型提示（缺 usage／缺价）需要比“发生了”更严重、又不是“失败”的级别。②本次 retry 修正 Turn usage 的可靠性规则：**读数由它自己的来源确立**——adapter 只在原生事实支持时上报读数，framework 不再按「值为零」否决一个被上报的读数，只在同一 Turn 的流式证据报过非零、因而自相矛盾时把它名为宿主默认 |

本次 retry 对第二个改动迁移的全部调用方：[`framework/adapters/omp.ts`](../../../framework/adapters/omp.ts)（`usageOf`：全零消息 usage → 没有读数，因为该宿主无法区分，证据见下）、[`framework/behaviors/turn-events.ts`](../../../framework/behaviors/turn-events.ts)（`finalUsageOf` 与 `settle` 的判定）、`protocol.ts` 的两处文档、`framework-capabilities.md` 的 usage 规则行、[`tests/framework/turn-facts.test.ts`](../../../tests/framework/turn-facts.test.ts)（05 的那条 all-zero 用例改为「harness 报告的 all-zero 就是确认零」）。

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 经生产公共事实固定 provider/model、开始时间、原周期、holiday 与适用价格/币种/单位；自造数据与独立手算验证峰段含端点、周末/holiday、跨时段与模型切换 | `request-accounting.test.ts` 的锚价与分类两组用例走 S2 生产 seam（生产 runtime＋框架公共绑定），数据全是自造的 `ModelPricingData`（币种 `XTS`、α＝{2,0.5,8}、β＝{10,1,20}、**系数 3**、两个窗口），每条断言都从 `runtime.view.own(<该次请求自己的 session>)` 读金额，期望是手算的 0.00003（谷，=(2·2+4·0.5+3·8)/1e6）与 0.00009（峰，=谷×3）：08:59:59.999 谷、09:00:00.000 峰、11:59:59.999 峰、12:00:00.000 峰（**含端点**）、12:00:00.001 谷、13:59:59.999 谷、14:00:00.000 峰、18:00:00.000 峰、18:00:00.001 谷、00:30 与 23:30 谷；周六 2026-10-17 10:00 与周日 2026-10-18 15:00 整天谷；`holiday: true` 周期的基线文档下 10:00 与 15:00 都是谷价；模型切换在同一峰瞬间取各自档位（β 峰＝0.000252，手算 (2·10+4·1+3·20)·3/1e6）；跨时段沿用既有断言（11:00 开始、13:00 结束仍是峰价）。生产侧：`runtime.ts` 把 catalog 交给 framework 的 `priceOf`，`turn_start` 的事实（provider/model/`startedAt`）与基线文档的周期 `holiday` 是锚点输入 |
| 完成/失败/取消的可靠 input/cacheRead/cacheWrite/output 均入账，缓存与 input 不重复；缺 usage、无法区分真零与宿主默认零时提示跳过，不把跳过当免费 | 三件不同的事实分别证明：**可靠读数**——completed／failed／cancelled 三例都累计（合计 (1·2+1·8)/1e6），四桶按交付值分别累加（input=2、cacheRead=4、cacheWrite=5、output=3，缓存从不并入 input）；**可靠真零**——harness 亲自报告的一条 all-zero 读数经 S1 公共信号到达 S2 后，`view.own` 记录四桶为 0 与 `costCny: 0`、零提示，Round 结束时落盘文档的 `own` 也是这四个零桶与 0 金额（受控公共生产 seam 上的业务语义）；**缺读数／无法区分**——`readings: []` → `view.own === undefined`＋恰好一条 `warning`（含“没有可靠的 usage”）。真实隔离宿主：端点完全不上报 usage、与端点明确上报 all-zero usage，两例都恰好一条同款 warning（该宿主两种输入的 message 事实逐字相同，见下节宿主证据）。framework 侧：一个被上报的读数按其自身值交付，只有同一 Turn 的流式证据报过非零后再报 all-zero 才名为宿主默认（`tests/framework/turn-facts.test.ts` 两例） |
| 缺适用价格只跳过金额、保留 token 并提示；catalog 改变不补算/删除/重估已累计金额；token-only/hidden 不因无金额口径报缺价错误 | `request-accounting.test.ts`：`model-unpriced`（monetary、tier 无价）→ token 入账且无 `costCny`＋一条含“缺适用价格”的 warning；token-only → token 入账、无金额、**零提示**；额度 provider 的任意 ID → token 入账、无金额、零提示；hidden → 完全不记账、零提示。重估保护：种子基线含字面 `costCny: 0.5`／`input: 100`／`saveVersion: 3`，一个请求后落盘为 `0.50003`／`input: 102`／`saveVersion: 4`（旧金额逐字保留，新请求叠加其上，不做任何按当前数据的重算） |
| 同 Session+Turn 重复结束跨 Round 不重计；相同内容新身份独立计入，缺 usage 已处理也不补账；已处理标记保留至实例销毁，旧回调不进入新实例 | `request-accounting.test.ts`：同一 Turn 的 settle 在 round_end／round_start 之后再交付一次 → `view.own` 逐字不变；随后同内容新身份 → 恰好翻倍（input 4／cacheRead 8／costCny 2×）；被跳过（无 usage）的请求之后再来一条带 usage 的同 Turn settle → 仍 `undefined`；实例清理入口（框架在实例结束时调用的同一个 `implementation.cleanup`）之后再交付 Turn 与 Round → 结果与文档都不动 |
| provider+精确模型决定模式，不按前缀/base URL/owned_by/别名模糊匹配；名单／谷价／共同峰价系数集中显式维护，不 YAML 配价、不运行期发现/热更 | `model-data.ts` 是唯一数据源（`definition.ts` 只声明 `storageDir`；`config.yaml` 只有存储根）。S2 用例：`model-alpha-mini`／`model-alph`／`prefix-model-alpha`／`Official`／`other-provider`／`constructor`／`toString` 七对 → `view.own` undefined 且零反馈（原型链上的名字也解析不到条目）；额度渠道按 provider 事实（自造 `plan-provider` 任意 ID）而非 ID 形状。运行期无发现／抓价接线：`model-data.ts` 不 import 任何 HTTP／framework 网络模块，`runtime.ts` 只在启动时读配置 |
| 算法永久 tests 用自造名单/价格证明匹配、锚价与缺失边界；实际白名单/价格与规格独立核对并隔离 smoke，不把频繁业务常量钉进算法 tests | 结构上落实：永久用例（`request-accounting.test.ts`）只用自造 `ModelPricingData`（币种 `XTS`），**没有任何永久 test 命名真实模型 ID、真实单价或真实名单**；真实数据的核对移出永久套件，落在维护 smoke [`scripts/model-cost-data-smoke.ts`](../../../scripts/model-cost-data-smoke.ts)（`bun run smoke:model-cost-data`，20 项核对，随数据编辑一起走）。原 `tests/model-cost/request-price.test.ts`（直接调 `seasonAt`／`requestPriceOf` 内部 helper）与 `tests/model-cost/model-data.test.ts`（把真实名单／价格／窗口钉进永久 test）已删除；维护文档第 4／6 步同步为新落点 |
| 通过 S2 生产只读展示结果及反馈/保存累计验证，不读私有字段；隔离真实 OMP 出站与请求开始事实贯通，预期不调用被测计算重新生成 | `request-accounting.test.ts` 只读 `runtime.view`（`own()`＋`subscribe()`）与落盘文档，不读私有字段；驱动它是既有的 `bindAccounting`（生产 runtime＋框架公共绑定），本票没有新建 test-only controller；保存用例断言 Round 结束时 `harness=omp` 下记录的 `id`／`name`／`parent: null`／`saveVersion` 与逐字 `own`（第二轮为 `saveVersion: 2` 且累计翻倍），确认零那例同样落盘；空消费的 Round 不产生文档（并由下一份真实保存的文档只含消费过的那个 Session 反证）。真实 OMP：`model-cost-accounting.test.ts` 的每次运行都断言捕获端点收到恰好一次真实请求（出站贯通） |
| 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | 业务用例只 import 生产模块与 framework 公共入口；无一处调用被测实现生成期望（金额、季节与分类期望都是手算或字面值）；`tests/model-cost` 与 dock 的模型往返都指向本机捕获端点（无真实服务），无新增网络 test |
| 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备 | dock 用例的 home／agent state（含 `models.yml` provider 改道）／session／work／capture 都在 `mkdtemp` run root 下，正式 OMP 未被读写；provider 改道由隔离 agent 状态的 `models.yml` 提供（`writeProviderOverride`），端点写死在运行期环境变量；保存是异步的，用例在真实文档内容上等待而不是等固定时长。本文件即材料准备 |

## 本次 retry 的两道完成门

### 门 1：可靠真零与宿主默认零分开，且真零真的入账

**宿主证据（真实隔离 OMP，探针已删除，仓库无残留）**：临时 dock fixture 订阅宿主原生 `message_end`，打印 `"usage" in message` 与 `message.usage`；两次真实隔离运行分别让捕获端点**省略 usage chunk**、**明确上报 `input=0/output=0/cacheRead=0`**。两次的输出逐字相同：

```text
[tmp-usage-probe] message_end hasUsage=true usage={"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}} stopReason=stop
notices: ["warning: 本次请求（deepseek/deepseek-flash）没有可靠的 usage 读数，已跳过该次消费统计；跳过不等于免费。"]
```

即：这个宿主对「provider 报的真零」与「它自己的默认零」产生同一事实，**没有可靠来源**，因此 adapter 显式交付「没有读数」（不伪造、不猜零），该请求被提示并跳过。临时 fixture／用例文件已删除（`ls tests/harness-dock` 无 `tmp-*`）。

**业务语义证据（受控公共生产 seam）**：一个来源能确立的零（S1 公共信号里的 `readings: [zero]`，正是任何能自证的 adapter 会交付的事实）经框架公共绑定到生产 runtime 后，被记成确认四桶与适用 0 金额、零提示，并在 Round 结束落盘——`request-accounting.test.ts`「a reading the harness reported as zero is accounted as the confirmed zero it is」。framework 侧不再按值否决被上报的读数（`turn-events.ts`），只有同一 Turn 的流式证据自相矛盾时才判为宿主默认。

### 门 2：永久 tests 只走批准的外部 seam，算法用自造数据；实际名单／价格由隔离维护 smoke 核对

- 永久算法用例全部在 S2（`request-accounting.test.ts`）以自造数据驱动，期望手算；直接测内部 helper 的 `request-price.test.ts` 已删除，算法场景迁到 `runtime.view`＋框架公共绑定这条更新入口。
- 真实名单／价格／峰段／系数不再钉在任何永久 test 里；改由 `scripts/model-cost-data-smoke.ts`（`bun run smoke:model-cost-data`）与批准覆盖隔离核对，随数据编辑一起运行（维护文档第 4／6 步）。

## 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost/request-accounting.test.ts` | 22 pass / 0 fail（70 expect，S2 seam：锚价／分类／记账／确认零／缺 usage／缺价／去重／保存／拒绝） |
| `bun test tests/model-cost` | 67 pass / 0 fail（5 文件，2.3s；含既存 storage 45 例） |
| `bun test tests/framework` | 363 pass / 0 fail（31 文件，39.5s） |
| `bun test tests/framework/turn-facts.test.ts tests/framework/turn.test.ts` | 32 pass / 0 fail |
| `bun test tests/harness-dock/model-cost-accounting.test.ts` | 4 pass / 0 fail（7.3s，真实隔离 OMP，捕获端点无真实网络） |
| `bun test tests/harness-dock` | 30 pass / 2 fail（32 例 8 文件 29.0s）；2 个失败为既存环境项（`baseline.test.ts` 与本地 `../oh-my-pi` 检出／artifact 不再逐字一致），与本票改动无关 |
| `bun run smoke:model-cost-data` | 20 pass / 0 fail（exit 0；数据与批准覆盖的隔离核对） |
| `bun run typecheck` | 无输出（exit 0） |
| `bun test`（全仓） | 639 pass / 4 fail（72 文件 166.7s）；4 个失败全部是既存环境项，与 06 记录的同一组一致：`tests/connect-bot` 两例需要本机 127.0.0.1:8787 的 omp-bot 面板（本机未运行），`tests/harness-dock/baseline.test.ts` 两例是本地 `../oh-my-pi` 检出／artifact 与记录不再逐字一致。本票改动零新增失败 |

## 本轮注入验证（跑完即恢复，仓库内无注入残留）

每次注入后运行受影响的用例，确认能变红；随后恢复并确认再次全绿。`grep -rn "DEBUGINJECT" framework/ extensions/ tests/ scripts/` 无输出。

| 注入 | 结果 |
| --- | --- |
| `finalUsageOf` 恢复「值为零就作废」（`sameUsage(first, ZERO)` → `usage (all-zero reading)`） | `tests/model-cost/request-accounting.test.ts` 的确认零用例与 `tests/framework/turn-facts.test.ts` 的确认零／宿主默认两例共 3 例失败 → 确认零的业务语义确由 framework 规则的修正撑起 |
| OMP adapter `usageOf` 不再对全零消息 usage 返回「没有读数」（`? undefined :` → `? reading :`） | `tests/harness-dock/model-cost-accounting.test.ts` 的「无 usage chunk」与「明确上报 all-zero」两例都失败（它们不再被跳过、也不再产生那条 warning）→ adapter 的不可得判定是承重墙，且两条真实宿主用例都对其敏感 |
| `seasonAt` 峰段右端改为开区间（`<=` → `<`） | `request-accounting.test.ts`「一个工作日的两个峰段两端都闭合」失败（12:00:00.000 与 18:00:00.000 变成谷价）→ 迁移到 S2 后的含端点语义仍被守住 |
| （既有，本票沿用）`addUsage` 把 `cacheRead` 并入 `input` 桶 | `request-accounting.test.ts` 四桶断言失败 → 缓存与 input 不重复被守住 |
| （既有，本票沿用）`classify` 改成前缀／包含匹配 | S2 分类用例失败 → 精确匹配被守住 |

## P52／P58 中本票的具名责任

- **P52**（Session 半边；完整 P52 测试 owner 为 24）：本票的保存路径只写已批准的 schema 与字段——记录仍是 `{id,name,parent,saveVersion,own}`，`own.<provider>.<model>` 仍是四类 token 加适用 `costCny`／`referenceCostUsd`（确认零时 `costCny` 就是 0，不是新字段）；本票**未改** `consumption-document.ts`、未新增任何文档字段、账本、账号键或权威总数；Round 结束的提交只合并本会话自己的记录并保留其他记录与周期。
- **P58**（消费者迁移；完整 owner 为 22／23／24）：本票的公共契约改动两处——`FeedbackLevel` 加宽（加 `warning`，无调用方需要改代码）与 Turn usage 可靠性规则的澄清（调用方已按上表同票迁移：OMP adapter、framework behavior、两处文档、05 的 S1 用例）。全仓运行里 `tests/connect-bot`、`tests/codebase-tools`、`tests/framework` 除既存环境项外全绿，`bun run typecheck` 通过，未新增任何旧生产双轨。

## 平台事实与已知限制

- **真实 RPC 会话不会派发 `round_end`**：`framework/adapters/omp.ts` 在原生 `agent_end` 处用 `quiescent(ctx)` 判定轮次结束，而该处 `ctx.isIdle()` 仍为 `false`（同处 `hasPendingMessages()=false`、`getAsyncJobSnapshot().running=[]`），因此 `round_end` 不派发，Round 结束时提交 `consumption.json` 这一段在隔离真实宿主里**不可观察**（前一次以临时 stderr 探针确认后已全部移除；两次 prompt 后文档都不出现）。规格里“framework 在下一任务轻量复查静止”的结束候选复查在 adapter 中尚未实现。本票按规格保留 `round_end` 为保存点（“不增加逐 Turn 落盘”），并在 S2／S4 seam（框架公共绑定＋真实本地文件）完整验证该保存；真实宿主的这一环等该复查落地后即可观察。这是需要裁决的既有 gap，本票不擅自改 framework 轮次语义。
  - **已过时（superseded，2026-10-13）：本条「保存不可观察／需要裁决」的状态已关闭，观察与读数保持原样。** 24 的组合 host 持久化用例（真实 loader／RPC）观察到两次 prompt 各自落盘（`saveVersion >= 2`）并读回四桶，即结束候选复查已落地、Round 结束的提交在真实宿主可观察；见 [`24-architecture-storage-verification-evidence`](24-architecture-storage-verification-evidence-2026-10-13.md)「未验证／限度」末条（24 亦在此明确「07 evidence 的旧限度已被取代」）。
- **真实宿主无法自证真零**（本票门 1 的证据）：`message.usage` 在「无 usage chunk」与「明确 all-zero」两种输入下逐字相同，OMP 18.5.0 的这条 completions 路径上没有可靠来源。因此真实宿主上的 all-zero 只会是「跳过＋提示」；确认零的业务语义由受控公共生产 seam 证明，不为真实宿主伪造来源。
- **`opencode-go` 的 token-only 真实宿主路径本票未覆盖**：该 provider 的 catalog 模型走 OpenAI responses 协议，而 dock 的捕获端点只兑现 completions 流（前一次实测一次 prompt 触发 22 次可重试失败，每次都被扩展如实记为“没有可靠的 usage”）。token-only 的模式与记账由 S2 seam（`request-accounting.test.ts`）与维护 smoke（`scripts/model-cost-data-smoke.ts`）覆盖；真实宿主那一半留给需要它的工单。
- **`framework/docs/framework-capabilities.md` 的行号锚点**：`protocol.ts` 的行数本次保持逐字不变（两次文档改写一加一减相抵，`wc -l` 前后同为 1075），因此它的锚点相对本票改动前没有漂移；`adapters/omp.ts` 的锚点（`#L789` 等）在本次改动前就已与实际符号不符（`ompAdapter` 实际在 L1067），属于 05 evidence 与 05 retro 已记录的既有缺陷，本票不在此顺手重建（retro 建议改为符号锚，另开工作）。dock 用例经 `writeProviderOverride` 把**内置 provider**（官方 `deepseek`）的模型指到本机捕获端点。
- Windows x64 / Bun 1.4.2：`tests/model-cost` 的保存等待用事件循环让路（`setImmediate`）而非固定睡眠；真实宿主用例按真实时间等待（另一进程）。

## 未验证／待人工

- 本票 acceptance criteria 的复选框与 `closed` 状态留待维护者确认；实现与自动化检查已按上表完成。
- 六条承诺的 Coverage 只含自动项与**条件性** H3（“仅本条真实 OMP 脚本多次失败或成本明显过高才可转人工”）。本票真实 OMP 脚本一次通过，**没有**需要转人工的 H3 项；也没有 H1（真实 TUI 视觉）／H2（真实 DeepSeek／Codex 网络）项——余额、额度、TUI 展示属 11／16／21 等工单。
- 悬而未决：RPC／无 UI 真实会话下 `round_end` 缺失（上一节），`round_end` 保存只在 seam 层验证；缺 evidence 的部分不记通过。
  - **已过时（superseded）：该悬而未决项已关闭。** 24 的组合 host（真实 loader／RPC）持久化用例已等到两次 prompt 各自落盘（`saveVersion >= 2`）并读回四桶 —— 即保存点现在真实发生（08 的结束候选复查已实现）；24 在本票限度上明确记「07 evidence 的旧限度已被取代」，见 [`24-architecture-storage-verification-evidence`](24-architecture-storage-verification-evidence-2026-10-13.md)「未验证／限度」末条。本行与上一节的原有观察、命令与读数按原样保留（未重跑、未改成新结果）。
- 未做：真实 DeepSeek／Go 服务的金额对照（单价依据是维护文档里的官方文档来源，非本票实测账单）、其他操作系统、pi adapter。
