# 09 — 实际 Session 自身归属与父树汇总：自动证据与真实贯通

Ticket: [`implementation/09-session-ownership-tree.md`](../implementation/09-session-ownership-tree.md)（P12、P13、P24，seam S1／S2／S5）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明，也不是人工验收；H1／H2 与允许的条件性 H3 未确认项不记通过（本票三条承诺的 Coverage 只含自动项与条件性 H3，无 H1／H2；见末节）。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`extensions/model-cost/shared-logic/request-accounting.ts`](../../../extensions/model-cost/shared-logic/request-accounting.ts) | 只读 seam 新增两个派生结果：`ConsumptionView.identity(sessionId)`（该实际 Session 最新名称＋可靠直接父，取宿主最近报告值、缺失由已加载记录补齐，无任何事实时为 `undefined`）、`ConsumptionView.inclusiveTotals(sessionId)`（该 Session 自身＋全部后代自身，各一份一次；按直接父关系建索引后遍历子树，重复入集即不再入，故记录碰巧成环也终止在每份真实贡献）。`remember` 改为只保留宿主报告过的事实：不可取得的名称／父既不覆盖已知值也不猜；**已持有身份发生变化时立即 `announce`**（首次获知不算变化，携带该事实的请求自身结果照常通知），改名随下次正常保存落盘、不单独写文件。`save` 写出的记录取合并后的身份。模块头文档同步 |
| [`extensions/model-cost/harnesses/omp.ts`](../../../extensions/model-cost/harnesses/omp.ts) | **装配缺陷修复**：`ompAdapter(MODEL_COST, …)` 原来在导出工厂函数体内创建，即每个 binding（每个 Session／子代理）都新建 adapter 与业务 runtime；改为模块加载时创建一次、`export default` 只把它接到当前 `pi`。framework 适配器与绑定都按“同一 implementation 供所有 binding 复用”设计，只有 Session 自身是 Owner 的那个 binding 会跑初始化——按 binding 新建的 runtime 因此永远没有 baseline，子代理的请求**一条都不记账**（真实宿主用例见下）。修复后主／子／孙共用一个 runtime 与一份累计 |
| [`tests/model-cost/session-ownership-tree.test.ts`](../../../tests/model-cost/session-ownership-tree.test.ts) | 新增 S2 套件 7 例（P12 ×3、P13 ×2、P24 ×2）；自造 `ModelPricingData`（币种 `XTS`、α＝{2,0.5,8}、β＝{10,1,20}、一个 token-only provider），期望全部手算／字面值；主会话与子代理的 delivery 分别按真实解析结果用 `owner`／`inherited`（同一 owner key），因此“按 Owner 记账”一定会被这些用例抓住 |
| [`tests/harness-dock/session-ownership-tree.test.ts`](../../../tests/harness-dock/session-ownership-tree.test.ts) | 新增 S5 隔离宿主套件 2 例：真实委派运行（主→子→孙，宿主自己的 task／yield 工具）与真实“显示 Session 切换”；断言读真实落盘 `consumption.json` 与框架自己派发的身份／父事实 |
| 未改 | `consumption-document.ts`（schema 未动，无新字段）、`consumption-store.ts`、`runtime.ts`、`request-price.ts`、`model-data.ts`、framework 任何模块、GLOSSARY 与 ADR（本票只是落实 [ADR-0004](../../../docs/adr/0004-model-cost-aggregate-accounting.md) 已定的自身聚合／父 Session 汇总与既有词汇，未产生新领域术语） |

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 唯一消费源为 harness＋实际 Session×provider×model 自身聚合；不按 Owner、当前查看目标、名称或报告层级入账，task／orchestration 报告不再计费 | `session-ownership-tree.test.ts`（S2）三例：①**按 Owner 不成立**——三个实际 Session 的请求都交付在同一个 owner key 线（主 `owner`、子／孙 `inherited`），各自桶分别只有己方请求（主 `official/model-alpha` alpha 桶 {2,4,5,3}＋0.00003；子 `go-provider/model-alpha` 只 token 无金额 {2,4,5,3}；孙 `official/model-beta` {1,2,0,2}＋0.000052），他人模型不出现在别家桶、未发起请求的 Session 无桶，且**父 Round 结束时落盘文档只有父自己的记录**（`sessions.map(id)` 恰为 `[主]`）；②**在途切查看**——两个 Session 各有一个 Turn 在途，其间读取第三个 Session 的 `identity`／`inclusiveTotals`，两笔响应仍各进自己桶；③**报告不入账**——子 Session 的 `session_start`／`session_end` 与两 Session 的 Round 两端只产生零桶、零文档，随后子的一笔真实请求恰好加一次。S5 侧：真实委派运行里主／子／孙三条记录都在，子代理的记录存在本身即证明记账组不是 Owner 组（owner-scope 会完全漏掉子代理）；运行中零条 notice（无一笔被当作“跳过”） |
| 保存可靠直接父关系，沿父链汇总每份自身贡献一次；不从父总数反推子贡献，不要求父先保存或造占位父 | `session-ownership-tree.test.ts`（S2）P13 两例：①运行时树——先交付孙／子／次子的请求，**父此时尚无任何记录、也从未保存**，`inclusiveTotals(主)` 仍等于四个成员各自桶之和（alpha {4,8,10,6}＋0.00006、beta {2,4,0,4}＋0.000104、token-only {2,4,5,3} 无金额），`inclusiveTotals(子A)` 只含子A＋孙，`inclusiveTotals(次子)` 只含自己，`inclusiveTotals(另一个主)` 只有自己且有意的与前者不同；`own()` 保持各自自身不变。②恢复树——四条已保存记录（主／子／孙／无关主）按各记录自身值相加，孙的贡献进主的树而无关主的 9 元不进；③S5 真实运行三条记录的 `parent` 恰为框架自己报告的直接父（主 `null`、子=主 id、孙=子 id），三者共享同一 owner 线却互不合并 |
| 构造异构主／子／孙／兄弟且整树与自身预期故意不同的数据，独立手算 token／Cost／Ref，验证在途切查看仍进入原发起桶 | 同上两例：数据是异构的（两个 monetary 档＋一个 token-only provider＋一个与树无关的主会话），全实例自身累计之和 ≠ `inclusiveTotals(主)`（无关主的 alpha 桶刻意与主相同金额，因此“把所有 Session 加起来”会被抓住）；Ref 由带 `referenceCostUsd: 0.25` 的已加载子记录提供，树内只出现一次且不被别的记录抹成 0；所有 token／金额／Ref 期望都在用例里手算或字面写出。在途切查看见 P12 第②例。S5 侧五个真实请求的四类桶由端点 wire 数字手推（prompt 10 含 cacheRead 3、completion 7），主 2×、子 2×、孙 1× |
| 名称按实际身份持续更新，包括未查看子／孙；不可取得不猜名称或覆盖已知名称；内存／展示即时变化，只在下次正常消费保存写文件，不额外触发保存 | `session-ownership-tree.test.ts`（S2）两例：①**未查看子改名**——视图本身按 Session 读取，不存在“当前查看目标”这一输入；子首次交付名称“子代理A”，随后一次同 id 交付携带“子代理A-改名”，`identity` 立即返回新名、订阅者恰收到 1 次通知、`own` 未变；此刻**文件甚至不存在**（改名不触发保存）；随后子自己的 Round 结束保存，记录为同一 `id`＋`saveVersion: 1`＋新名＋真实父。②**不可取得**——宿主报不出名称的交付（`unavailable: ["session name"]`）不覆盖已加载记录里的名称（不会退化成 session id）、下一次保存仍写该名；从无名称的 Session 以自身 id 展示且不会被凭空写成记录；从未听闻的 Session `identity` 为 `undefined`。S5 侧：主会话名称来自宿主自己的 `set_session_name` 命令，子／孙（宿主未报告名称）记录里就是各自可区分的 Session id |
| 通过 S1 身份／直接父事实、S2 展示和真实保存读回验证；隔离宿主脚本覆盖实际代理关系与查看切换，不将 Owner 过滤再次套在记账组 | S5 两例：①**实际代理关系**——真实 RPC 会话经宿主 task 工具委派出真子会话、子再委派出孙；round 观察 fixture 报出三个 Session 与各自直接父，落盘文档三条记录与之一致，token 分别 2×／2×／1×（子代理未被并进父、也未重复计）；②**查看切换**——宿主 `new_session` 实际换显示 Session 并 `set_session_name` 后再对话（其自身记录 parent `null`、1 笔），此前三条记录 `id`＋`saveVersion` 逐字不变；再 `switch_session` 回第一个 Session 自己的文件并继续对话，主记录变成同一 id 的下一版本且累计 3 笔，子 2 笔、孙 1 笔不变，全程 7 次真实出站全部归入原发起 Session。S1 侧的身份／父事实由 dock 的 round fixture 逐条报出（framework 事实本身的完整覆盖属 05） |
| 通过批准的生产公共 seam 观察行为，预期来自合同／规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | S2 用例只经生产 runtime＋框架公共绑定（`bindAccounting`）读取 `runtime.view` 与落盘文档，无私有字段；期望全部手算／字面值，未调用被测实现生成期望。S5 是隔离 smoke（真实宿主＋本机捕获端点），其金额不断言真实单价，只断言 `typeof costCny === "number"`（避免把频繁业务常量钉进永久 test）；永久 test 不访问网络 |
| 使用隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备 | dock 每例都用记录基线安装 `.cache/omp-baseline/18.5.0`＋独立 run root：agent state（含 `models.yml` 把内置 `deepseek` 改道到本机捕获端点）／`--session-dir`／work／capture／user-home 全在 `mkdtemp` 下，扩展的 `~/cost-archive` 落在 run root 的 user-home 里（失败信息可见实际文档路径为 `…\omp-dock-…\user-home\.omp\cost-archive\consumption.json`），正式 OMP 无任何写入。异步保存用“等期望内容”而非固定时长（Round 结束在宿主下一任务派发）；S2 侧保存失败／拒绝提示沿用 07 的用例。脱敏：证据只含匿名 UUID 会话 id、自造名称与端点 wire 数字，不含秘密或真实账号资料 |

## 真实宿主上发现的缺陷（本票内修复）

**旧装配每 binding 新建业务 runtime，子代理消费完全不入账。** 首次运行 dock 用例时（装配修复前）：

```text
error: no consumption document the case expects was published at C:\Users\hugos\AppData\Local\Temp\omp-dock-ownership-tree-delegation-…\consumption.json:
{"schemaVersion":1,…,"harnesses":{"omp":{"sessions":[{"id":"01a132d4-36c1-…","name":"dock-tree-main","parent":null,"saveVersion":1,
"own":{"deepseek":{"deepseek-flash":{"tokens":{"input":14,"cacheRead":6,"cacheWrite":0,"output":14},"costCny":0.00014024}}}}]}}}
```

即：只出现主会话一条记录（自身 2 笔请求），子／孙各自 Round 已结束却没有记录，也没有任何 notice（既非“跳过”也非“写失败”）。原因是被记的 `round_end` 走到的那个 runtime 从未初始化过：framework 只在“自身是 Owner 的 Session”节点跑一次初始化（`framework/behaviors/lifecycle.ts`），而按 binding 新建的 runtime 各自持有一份从未加载的 store，于是 `turnStarted` 因无 baseline 直接返回、`turnSettled` 找不到锚点、`roundEnded` 取不到 ledger，全程静默。把 `ompAdapter(MODEL_COST, …)` 提到模块加载时创建一次后同一用例通过（见注入表最后一行）。

## 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost/session-ownership-tree.test.ts` | 7 pass / 0 fail（43 expect；S2：归属 3、树汇总 2、名称 2） |
| `bun test tests/model-cost` | 83 pass / 0 fail（7 文件，2.2s；含 07 的 22 例与 08 的 9 例，无回归） |
| `bun test tests/framework` | 365 pass / 0 fail（31 文件，39.4s） |
| `bun test tests/harness-dock/session-ownership-tree.test.ts` | 2 pass / 0 fail（6.1s，真实隔离 OMP，5＋7 次真实出站均打到本机捕获端点） |
| `bun test tests/harness-dock` | 34 pass / 2 fail（36 例 10 文件 40.2s）；2 个失败为既存环境项 `baseline.test.ts`（本机 `oh-my-pi` 检出／artifact 与记录锚点不再逐字一致），与 07／08 记录的同一组一致 |
| `bun run typecheck` | 无输出（exit 0） |
| `bun test`（全仓） | **648 pass / 4 fail**（652 例 74 文件 179.3s）；4 个失败全部是既存环境项，与 07／08 记录的同一组一致：`tests/connect-bot/panel-registration-lifecycle.test.ts`「the protocol the actual omp-bot panel receives is the frozen one (P23)」（20236ms 超时）与 `tests/connect-bot/no-panel-expiry.test.ts`「an unregister that never arrives leaves the row to the panel's own window (P25)」（15021ms 超时）——两者都需要本机 127.0.0.1:8787 的真实 omp-bot 面板，本机未运行；`tests/harness-dock/baseline.test.ts` 两例（本机 `oh-my-pi` 检出／artifact 与记录锚点不再逐字一致）。本票新增两个文件 9 例，零新增失败（07／08 记录的基线为 639 pass / 4 fail） |

## 本轮注入验证（跑完即恢复，仓库内无注入残留）

每次注入后运行 `tests/model-cost/session-ownership-tree.test.ts`，确认能变红；随后恢复并确认再次 7 pass。残留检查 `grep -rn "TEMPDIAG\|TEMP DIAGNOSTIC\|DEBUGINJECT\|false &&" extensions/ tests/` 只命中 `tests/harness-dock/session-driver.test.ts:126` 的既有 `message.display === false &&`，本票注入与临时诊断均无残留。

| 注入 | 结果 |
| --- | --- |
| `identityOf` 的名称不回落已加载记录（`remember` 用 `sessionId` 兜底，即修复前行为） | P24 第②例失败（不可取得的名称把已知名覆盖成 session id） |
| `remember` 在身份变化时不再 `announce` | P24 第①例失败（改名通知计数 0≠1） |
| `inclusiveTotalsOf` 起点改为“全部已知 Session” | P13 两例都失败（无关主会话被并入树） |
| `turnSettled` 用 `reported` 里的第一个 Session 记账（“当前会话/最近会话”式错配） | 7 例中 4 例失败 |
| `turnSettled` 用 `delivery.owner.key` 记账（忠实模拟“按 Owner 入账”） | 7 例中 6 例失败（另 1 error） |
| （S5）model-cost 装配回到每个 binding 新建 adapter | dock 第①例失败（文档只出现主会话一条记录，20s 等待超时）—— 见上节真实观察 |

## P52／P58 中本票的具名责任

- **P52**（Session 半边；完整 P52 测试 owner 为 24）：本票**未改** `consumption-document.ts` 与任何保存字段——落盘记录仍是 `{id,name,parent,saveVersion,own}`，`name`／`parent` 仍是 schema 已有的展示数据与直接父，没有新字段、账本、账号键或权威总数。`identity` 与 `inclusiveTotals` 纯运行期派生，不落盘（树与名称合并值都不进文档，文档里也看不到任何含后代合计）。改名只在“下次正常消费保存”时随记录写出，因此不新增任何保存触发。
- **P58**（消费者迁移；完整 owner 为 22／23／24）：扩展自身的 S2 只读 seam 新增两个成员（加法变更），当前唯一消费者是本扩展的测试套件（`grep` 全仓只有 `tests/model-cost/*` 读 `runtime.view`；生产前端属 16／17 尚未实现），无需迁移任何调用方，07／08 的既有用例逐字不变地通过。装配改动是 model-cost 扩展内部：入口仍是“薄重导出＋一个默认工厂”，framework 公共绑定契约与其它扩展未改（connect-bot 的装配按自身 per-binding 业务对象另议，不在本票）。全仓运行见下节，未新增旧生产双轨。

## 平台事实与已知限制

- **隔离运行的系统提示来自隔离安装本身**：捕获到的请求体携带 harness 自带的默认系统提示（其文案与基线安装 `.cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/prompts/system/system-prompt.md` 一致），不涉及正式 OMP 配置读取；断言只依赖端点 wire 数字与扩展落盘的文档。
- **dock 无法脚本化“在途切查看的 TUI focus”**：headless RPC 只有宿主自己的 `new_session`／`switch_session`（本票用它换显示 Session 并在其间与之后真实对话）。真人在真正在途时切到子代理的视觉／交互最终效果属 H1（P26／P27／P67 持有），本票不为它伪造证据；S2 用“在途读第三个 Session”的等价事实覆盖同一规则。
- **子代理的模型与主会话相同**：dock 里宿主用 task 工具派生的子会话跑在同一隔离 fixture 模型上，所以“异构模型”这一维由 S2 套件（自造数据）覆盖，真实宿主只证明“实际会话身份／父关系／各自归属”这一维。
- **金额不钉真实单价**：dock 只断言 `costCny` 是数字（DeepSeek 渠道确有金额口径），不给真实价格数值；真实名单／价格由 07 的维护 smoke（`bun run smoke:model-cost-data`）与规格独立核对。

## 未验证／待人工

- 本票 acceptance criteria 的复选框与 `closed` 状态留待维护者确认；实现与自动化检查已按上表完成。
- 三条承诺的 Coverage 只含自动项与**条件性** H3（“仅本条真实 OMP 脚本多次失败或成本明显过高才可转人工”）。本票新增的真实宿主用例在本会话共运行 7 次：装配缺陷修复前 4 次如实变红（现象见上节，其中 3 轮临时诊断用于定位，缺陷已同票修复），修复后 3 次全部通过；因此**没有**需要转人工的 H3 项。也没有 H1（真实 TUI 视觉）／H2（真实 DeepSeek／Codex 网络）项——子代理查看视觉、Total 字段范围、detail 静态树分别由 16／17 等工单持有。
- 未做：真实 DeepSeek 服务上的金额对照（单价来源是维护文档，非本票账单）、其他操作系统、pi adapter、跨进程共享根下的多 Session 归属（属 06／24 的并发验证范围）。

## 独立 retry 追补：名称随实际身份即时更新（未查看子／孙改名）的生产事实链路

首轮只证明了运行时 `remember`／`identity`／订阅语义（S2 单元）与真实宿主上的“实际代理关系／各自归属”，真实子／孙在 dock 里根本没有名称（记录里是 session id），因此“未查看会话改名后按身份持续更新、不等下一个 Turn／Session 边界”这条**生产观察链路**没有实测。本 retry 只补这一条，不重开已完成的其它验收项。

**新增的生产桥（S1 seam，最小必要）：** 宿主自身在会话被改名时就会通知——`ctx.sessionManager.onSessionNameChanged(cb)`（`SessionManager` 的公开方法，见 `session-manager.ts#L3217`，通知循环在 `setSessionName` 内）。`framework/adapters/omp.ts` 现在在每个会话上下文里按 SessionManager 订阅它一次，并在其中**就地**投递一个新语义事件 `session_facts`。`framework/core/protocol.ts` 把它加为 session 轴的第三个成员：它不是边界——`framework/behaviors/session-events.ts` 对它**跳过框架自身行为**（不 reconcile、不 seed／retire、不发布 marker area），只派发给声明了该 kind 的订阅组。`extensions/model-cost` 侧 `runtime.ts` 增加 `session_facts: accounting.sessionFacts(delivery.session)`，`request-accounting.ts` 增加 `sessionFacts(session)`（只 `remember`；不消费、不落盘）。

**为什么不是别的做法：** 不新增“重发 session_start”之类的伪边界（那会重新 seed State，正是本票要排除的行为），也不把桥放进扩展自己的 assembly（那样事实输入就不再由公共 adapter 变换，测试 adapter 也观察不到）。

| 本轮新增／改动的落点 | 内容 |
| --- | --- |
| `framework/core/protocol.ts` | `SessionEvent` 增加 `{ kind: "session_facts" }`（文档写明它不是 transition／boundary、不 reconcile、不发布 marker）；`SemanticEventDeliveryMap` 增加对应项；`SemanticEventHandlers` 文档写明该 kind 只走订阅 |
| `framework/behaviors/session-events.ts` | 该 kind 跳过 `state.reconcile`，其余照常派发 |
| `framework/behaviors/subscriptions.ts` | `SESSION_EVENT_KINDS` 纳入该 kind（全仓无其它使用点） |
| `framework/adapters/omp.ts` | `OmpSessionContext.sessionManager` 增加可选 `onSessionNameChanged?`；`onSession` 内在 `session_start`／`session_switch`／`session_branch` 上按 manager 订阅一次（WeakSet 去重），回调投递 `session_facts`；未上报该事实的宿主不投递（名称仍按其它 delivery 读取） |
| `extensions/model-cost/shared-logic/{runtime,request-accounting}.ts` | 订阅该 kind → `sessionFacts` → `remember`（与 turn／round delivery 同一份身份记忆，无新保存路径） |
| `tests/framework/session.test.ts` | 原生映射新用例 2 例（double 增加 `onSessionNameChanged` 与 `renameSession`、`factsObserved`）：改名 ⇒ 一次 `session_facts`（带该会话 id／父／最新名）＋**零**次事件日志＋**零**次 marker 重发；宿主不上报该通知时零投递且边界照常 reconcile |
| `tests/framework/session-events.test.ts` | 框架行为新用例 1 例：`session_facts` 到达订阅者，且不 reconcile（seeded true 未被重置、area 未重发） |
| `tests/model-cost/session-ownership-tree.test.ts` | P24 改名用例改为**经 `session_facts` 投递**触发（原来是借一次 turn_start），期望不变：identity 立即变、订阅恰 1 次、own 不变、此刻文件不存在、下一正常保存写新名 |
| `tests/harness-dock/{session-ownership-tree.test.ts,fixtures/session-rename,fixtures/session-facts-probe}` | 真实宿主新用例：见下 |

**真实宿主用例（S5）：** 主→子→孙真实委派照旧；新增 `session-rename` fixture 在**未查看**的子／孙各自一次模型响应边界（`after_provider_response`，即该 Turn 仍在途）调用宿主自己的 `setSessionName`（`/rename` 与 RPC `set_session_name` 走的是同一方法）；`session-facts-probe` fixture 通过生产公共订阅（`session_facts`）把每条投递写到 stderr。断言全部来自 stderr 行序与落盘文档：

- 改名**就地**上报：`session_facts`（新名＋真实直接父）出现在“请求改名的行”之后、该会话自己 `round_end` 之前，且两者之间**该会话没有任何 Turn／Round 边**——即更新不等下一个边界；
- 消费不变：真实出站仍 5 次、无任何 notice（改名既不产生请求也不被当作跳过）；
- 文件／保存次数不变：主／子／孙各只有 `saveVersion: 1`（若改名触发过一次保存，该会话就会是第 2 版），而记录里的名称就是改名后的名字——即“只在下次正常消费保存写文件”；
- 只有子／孙被改名（fixture 从不碰主会话），主会话记录名仍是宿主命令设的 `dock-tree-main`、父为 `null`；三者的父链与各自 token 数与前两个用例一致。

**本轮实际命令与结果**

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 无输出（exit 0） |
| `bun test tests/framework/session.test.ts tests/framework/session-events.test.ts tests/framework/subscription-scope.test.ts tests/model-cost` | **119 pass / 0 fail**（10 文件，373 expect） |
| `bun test tests/harness-dock/session-ownership-tree.test.ts` | **3 pass / 0 fail**（65 expect，9.5s；含新用例，真实隔离 OMP） |

**注入验证（跑完即恢复）**

| 注入 | 结果 |
| --- | --- |
| 适配器不再订阅 `onSessionNameChanged`（桥移除） | `tests/framework/session.test.ts` 新用例红（`factsObserved` 为 `[]`）；**真实宿主**用例同步红（三条 `session_facts` 全无） |
| （首轮同表）`remember` 身份变化不 announce ／ 名称回落 session id ／ inclusiveTotals 起点错误 ／ 按 Owner 或“最近会话”记账 | 见上节注入表，均能变红 |

**Seam 边界（如实说明）：** 扩展的内存视图（`view.identity`／`subscribe`）只能经 S2——本扩展的只读展示 Interface——读取，而它的生产前端属 16／17，尚未实现；隔离宿主的 S5 入口因此读不到**另一个扩展的进程内内存**。所以本条链路的证据分工是：真实宿主证明“改名事实就地到达生产订阅、消费与文件／保存次数不变、下一正常保存写名”（S1＋S5＋真实保存读回），S2 套件证明“该投递 ⇒ identity／订阅立即更新”（S2）。这不是降低标准，而是本票 criterion 与合同 S1／S2／S5 的既定分工；真实 TUI 上未查看子代理改名的视觉呈现属 H1（16／17 持有）。

**仍未验证：** 真实 TUI／视觉（H1，16／17）；真实 provider 网络（H2，07／12 持有）；本机既存环境失败的 4 项（`baseline.test.ts` 锚点与本机 `oh-my-pi` 检出、两条需要本机 127.0.0.1:8787 面板）与本轮无关，见上节。
