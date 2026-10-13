# 17 — 静态 detail 与立即切换入口偏好：自动证据与 P23／P26 H1 材料

Ticket: [`implementation/17-detail-tree-view-preference.md`](../implementation/17-detail-tree-view-preference.md)（P20、P23、P26、P29；seam S1／S2／S5）。
Contract: [P20／P23／P26／P29](../contract.md)；展示范围权威 [08-presentation](../lighthouse/08-presentation.md)／命令范围权威 [07-command-state](../lighthouse/07-command-state.md)；装配 seam 权威 [10-assembly-layout](../lighthouse/10-assembly-layout.md)。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明，也不是人工验收；H1／H2 与允许的条件性 H3 未确认项不记通过。支持基线未变：OMP 18.5.0 / Windows x64 / Bun 1.4.2。

## 1. 本票交付的行为与落点

| 位置 | 内容 |
| --- | --- |
| `extensions/model-cost/shared-logic/presentation/display-preference.ts`（新，shared logic） | **入口展示偏好**：`brief`／`detail` 的进程内存状态、`/budget detail` 的一次翻转、翻转后经既有变更通知发布；切换文案。不含 provider／idle／保存／UI 判断，不落盘。 |
| `extensions/model-cost/definition.ts` | `/budget` 一层 `actions` 声明，动作表只有 `detail`（描述「切换简略／详细展示」）。本票不声明 `holiday`／`clear`，也不留 stub。 |
| `extensions/model-cost/shared-logic/runtime.ts` | 建立该入口的偏好（变更通知走 `accounting.announceChanged()`），把它交给 presenter，并在 `implementation.commands.budget.detail` 实现动作：翻转＋经公共 feedback 反馈当前形式。 |
| `extensions/model-cost/shared-logic/presentation/display.ts` | 显示结果新增 `form`（该目标实际画的形式：主会话＝入口偏好，子代理＝固定 brief）、`round.{current,previous}`（该 Session 自身两轮：目标当前模型结构＋该轮自身 Sum／Cost／Ref）、`agentTree`（主会话的静态代理树行：root／model／session 三类、各自 `depth`）。新增 `fieldsText`（一行自身适用字段）与 `roundText`（一轮自身行），并把「当前模型单套比例」的门控抽到一处 `pairFieldsOf`，供 current 与模型行共用；`totalText`／`currentText` 语义与输出不变。 |
| `extensions/model-cost/shared-logic/request-accounting.ts` | 只读 seam 新增 `ConsumptionView.identities()`：该实例能回答身份的全部实际 Session（文档记录在前、随后才是交付新增），供树形读取一次索引，不再逐层扫全集。 |
| `extensions/model-cost/harnesses/omp/widget.ts` | brief 在 Total 下画 `Round:`／`Prev:`（各自缺边界对时整行不画），detail 在同一位置改画静态树：root 仅名称、模型行 `│  provider / model`（不是代理节点）、子／孙行按直接父缩进（`├─`／`└─`，最后一名用 `└─`）。首行 context 条／Effort 与末行余额行不变。 |
| `extensions/model-cost/GLOSSARY.md`、`GLOSSARY-MAP.md` | 新增领域词条 **Entry display preference（入口展示偏好）** 与 **Agent tree（代理树）**，并更新 map 的 model-cost 行。 |
| 未改 | `framework/**`、`extensions/connect-bot/**`、`extensions/codebase-tools/**`、存储 schema、`config.yaml`、任何 State／marker／owner 机制；未新增命令别名、flags、多层解析或持久偏好。 |

自动覆盖落点：

| 套件 | seam | 用例数 | 覆盖 |
| --- | --- | --- | --- |
| `tests/model-cost/detail-tree.test.ts` | S2（`runtime.presentation.of`）＋S1（真实注册的 `/budget` 命令经 port double 驱动） | 9 | P29 偏好与反馈、无 brief／on／off／focused 路由、入口独立与不持久；P23 树行种类／名称／深度／字段范围／模型行非代理节点／无合计行；P26 子代理固定 brief、自身 Round、主树仍为主树、往返不改记账；P20 偏好＋provider 缓存＋运行期 Round 保留、请求计数不增、工厂只建一次 |
| `tests/model-cost/detail-widget.test.ts` | S5（生产前端 `attachModelCostWidget`＋受控 host 上下文） | 6 | brief 两轮差分与「无边界对不画 Round」；detail 换掉 Round 行、保留同一 Total、缩进正确（含跨目标往返：子代理视图仍为固定 brief、无树行、绘制其自身 Round，返回主会话重画树且子行显示子自己新增消费）；切换立即重绘且未强造 widget（headless／hidden） |
| `tests/harness-dock/detail-tree.test.ts` | S5（冻结 patched artifact＋真实 RPC＋真实 task 委派＋本机 capture endpoint） | 1 | 真实宿主：brief 真有自身 Round 行；`/budget detail` 真把 widget 改成静态树（root＋模型行＋子代理行，逐字期望），Round 行消失、Total 行逐字不变；命令未触发任何 provider 请求；反馈 info；再切回 brief；消费文档未被视图切换改动 |

## 2. 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 主 detail 保留顶部 Total，在 Round 位置显示根名称、根自身 provider/model 分行、子／孙各一条自身累计按直接父缩进；无 Round 行、不展开子模型、不增加合计节点／交互查询 | S5 受控例：`["bar","Total: …","主会话","│  official / model-alpha  Cache: 66%  ¥Cache/In/Out：4:7:89  Sum: 6,020  Cost: ¥0.05","└─ 子代理  Cache: 40%  Sum: 100"]` 逐字相等，且 `some(startsWith("Round:"/"Prev:")) === false`；S5 真实例同一形状（`dock-detail-main` → `│  deepseek / deepseek-flash …` → `└─ <child session id> …`），并断言 Total 行切换前后逐字相同。S2 例断言行表仅 root／model／session 三类、共 8 行、无含后代行（`row.fields?.sum` 序列 `[undefined,6000,750,2,20,100,7,15]`，全树 6,894 不在其中）、`model` 行 depth 全为 1、子代理行不展开其自身模型 |
| 树各行保留适用字段，不缩成仅金额＋token；模型行不是代理节点，异构自造树核对字段范围及名称 | S2 例：行字段逐项为手算字面值（命中率 67／20／60／40／0／50，命中率缺输入时才缺省，`unlisted` 行的 tokens 1/0/0/1），模型行名称 `provider / model` 且带自己的比例（4:7:89 与 10:40:10:40），session 行不带任何单一模型比例；另一例让 harness catalog 给**每个** pair 报价，token-only 与未收录行仍无金额、无比例（门控真的在起效），monetary 行仍取自己 tier 的比例、allowance 行取四项 |
| detail 动作立即切入口内存偏好并反馈，不检查 provider／idle／保存，hidden／headless／busy 也不强制 widget；无 brief／on-off／focused 子命令路由 | S1＋S2 例：`detail` 两次翻转并各反馈一次 info（文案含当前形式且两次不同）；`hasUI:false`、`idle:"busy"`、`idle:"unreported"` 四种状态都翻转成功，`persisted === []`、`markers === []`；`brief`／`detail on`／`on`／`off`／`focused`／`det` 全部只回 error＋help 且偏好不变，空参只回 info help。S5 受控例：headless 下翻转后 widget 帧数仍为 0（不强制创建）；hidden 目标被清空而不绘制，detail 偏好也不会为它造树；切换当帧即重绘（帧数增加） |
| 普通模型／Session／tree／查看变化保留 CLI 业务实例、provider 缓存及 detail；入口独立，重启／reload 回 brief，不持久／不继承偏好 | S2 例（watched，固定时钟＋记录 HTTP）：启动仅 1 次 provider 请求（余额预取），此后另一 Session 的 facts、主会话改名、另一 Session 开轮、跨 Session／跨模型查看与往返**都未新增请求**，持有的余额读数仍是同一个 `12.5`，入口仍为 detail、树 root 名称已随宿主改名更新、运行期 Round 仍为同一对边界，工厂运行次数为 **1**；另一例用同一 storage root 再绑一个入口实例，新实例答案为 brief（不持久、不继承），前一个实例仍是 detail（入口独立） |
| 子查看切自身 context／实际 Effort／当前模型结构／自身 Round，固定 brief，主树总数和 provider 全局测量不伪造子独享；主 detail→子 brief→主 detail 完整往返不改 Owner／记账 | S2 例：`of(子)` 的 `form === "brief"` 且 `agentTree === undefined`（入口为 detail 也不改这一事实）；`current` 是该子自身当前 pair（130、命中率 33）、`round.current.total` 是它自己那轮 30（token-only 无金额无比例）、`tree.sum` 仍是主树 6,924。往返后 `of(主)` 仍 detail、树仍在且子行显示子自己新增的 130；`view.own("session-main")` 与文档逐字段未变、文档**逐字节**未变、marker 更新为空。S5 受控 widget 例把同一往返画成行：detail 下把视图切到子代理后画出的是该子自己的 brief（`Sum: 6,130`＋`Round:  Cache: 0%  Sum: 30`）且**无任何树行**，切回主会话重画树、子行 `Sum: 130`。Effort／context 取实际目标值由 16 票 S2／S5 覆盖（本票 detail 形态下首行照旧画 context 条与 Effort，S5 受控例已断言） |
| 本票拥有 P20／P23／P26／P29 全部自动行为覆盖，用请求计数、偏好和字段对照证明实例／缓存保留；实际隔离操作准备 P23／P26 H1 期望树、缩进、往返与可获得视觉证据 | 见上四行与第 1 节表；请求计数＝`sent`（watched 例）与 capture `requests()`（真实例），偏好＝`form`＋反馈文案，字段对照＝`view.own`／文档记录 vs 行字段；P23 期望树与缩进在第 5 节，真实宿主可获得视觉证据由 `tests/harness-dock/detail-tree.test.ts` 断言（逐字） |
| 通过批准的生产公共 seam 观察行为，预期来自合同／规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | S2/S1 例只经 `createModelCostRuntime` ＋ framework 公共绑定（`portDouble`）与真实注册的命令；S5 受控例只经生产前端 `attachModelCostWidget` 与受控 host；S5 真实例只经真实 loader/RPC、`set_session_name`／`/budget detail` 与 capture endpoint。期望全部来自规格（450K、?、两币种不混、树范围）或本文手算数字（6,020／6,120／6,894／6,914／6,924／4:7:89／10:40:10:40／0:20:80／¥0.0050 等）；永久用例只打本机 capture endpoint 或纯内存，无真实网络 |
| 使用隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作 | S5 真实例用 `.cache/omp-baseline/18.5.0-viewed-session`（01 票冻结 patch artifact，哈希校验通过才运行）＋ `createRunRoot` 的独立 agent state／`--session-dir`／work／capture／user-home；扩展 `~/cost-archive` 落在 run root 的 user-home；`models.yml` 只写 run 自己的 agent state。失败带实际 widget 文本与 session 诊断，无秘密、无正式环境路径；未触碰正式 OMP、未重启、未改配置、未发送验证命令 |

## 3. 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost/detail-tree.test.ts` | 9 pass / 0 fail（116 expect，65ms） |
| `bun test tests/model-cost/detail-widget.test.ts` | 6 pass / 0 fail（20 expect，55ms） |
| `bun test tests/harness-dock/detail-tree.test.ts` | 1 pass / 0 fail（21 expect，2.63s）——一次真实 RPC run：主会话真实 `task` 委派、子会话真实 `yield`，2 个模型请求打到本机 capture endpoint |
| `bun test tests/model-cost` | 201 pass / 0 fail（17 文件，2.5s） |
| `bun test tests/framework` | 374 pass / 0 fail（31 文件，39.6s） |
| `bun test tests/model-cost tests/framework` | 575 pass / 0 fail（48 文件，43.2s；含 07／08／09／11／16 既有各套件，无回归） |
| `bun run typecheck`（`tsc --noEmit`） | 无输出（exit 0） |
| `bun test tests/harness-dock`（全目录，两次） | 第一次 **58 pass / 3 fail**（97.7s）、第二次 **59 pass / 2 fail**（61 用例，99.4s）。第二次的 2 处失败均为 08 票已记录的既有失败（`baseline record > the checkout is at the recorded revision anchor`、`> the run artifact stays byte-identical to the anchor…`，即 sibling `oh-my-pi` checkout 前移导致的锚点比对，与本票文件无关）。第一次多出的 `model-cost-balance.test.ts` P53 哨兵例 `ENOENT` 系 17 个真实宿主进程并发下的环境性失败：**单文件复跑 6 pass / 0 fail（19.7s）** |

> 全目录并行数字只作诊断；本票相关的三套件均已单文件全绿，且 `tests/harness-dock/detail-tree.test.ts` 在本票最后一次生产源码改动后复跑仍 1 pass。

## 4. 反向注入验证（跑完即恢复；生产源码已用逐字节比对确认回到注入前）

| 注入 | 结果 | 恢复 |
| --- | --- | --- |
| `display-preference.ts` 的 `toggle()` 不再调用 `onChange()`（偏好翻转但不通知） | `detail-widget.test.ts` 的「切换立即重绘」失败（`frames()` 仍为 4，期望 > 4） | `cp` 备份回写后 `cmp` 逐字节相同（RESTORED-IDENTICAL），套件复跑 5 pass |
| `display.ts` 的 `current` 不再按 pair 门控（改回不分类地读金额／比例） | 该注入未单独执行：token-only／未收录行的门控由 `detail-tree.test.ts` 的 `EVERY_PAIR_USD` 例直接证伪——若门控失效，该两行会拿到 harness 报价的比例，断言即失败 | — |

可区分性说明（无需注入即可判定）：子行若用含后代累计会得到 100+7＝107（断言 100 失败）；若新增合计节点则行数与种类断言失败；若模型行被当作代理节点则 session 行集合断言失败；若 preview 的 Round 行在 detail 里保留，逐字数组与 `startsWith` 断言同时失败；若视图切换写入文档，逐字节比较失败；若 provider 缓存被重建，请求计数与余额读数断言失败；若业务实例被重建，`factoryRuns()` 断言失败。

## 5. P23／P26 H1 材料（人工确认用；**未执行**）

自动部分（树行字段范围、名称、深度、切换帧、往返不改记账、真实宿主逐字树行）已由第 1 节三套件覆盖。下面只留必须由人在真实 TUI／真实焦点切换上确认的一步。

**冻结 artifact。** `.cache/omp-baseline/18.5.0-viewed-session`（gitignored）：基线 `@oh-my-pi/pi-coding-agent@18.5.0`，checkout `9348320cc4a30a7195d36a1f05a6c11bcb701a17`；`patch.diff` 与每个文件的 post-patch 哈希记在 [`host-patches/omp-18.5.0-viewed-session/record.json`](../../../host-patches/omp-18.5.0-viewed-session/record.json)，哈希不符则拒绝运行。重新物化：

```
bun -e 'import { ensureViewedSessionHarness } from "./tests/harness-dock/viewed-session-harness";
        const h = await ensureViewedSessionHarness(); console.log(h.cliPath)'
```

**可获得视觉证据（本机已跑，无需重建）：** `bun test tests/harness-dock/detail-tree.test.ts` 会真起一次隔离宿主并逐字断言 widget 内容。该 run 的观察结果（值取自该 run 自己保存的文档，`Main` 6,000 tokens／`Cost: ¥0.01`，子会话 3,000／`¥0.0050`，整树 9,000／`¥0.02`）：

```
[░░░░░░░░░░░░░░░░░░░░   0% (2,000/450.0K)]  Effort: high
Total:  Cache: 50%  ¥Cache/In/Out：0:20:80  Sum: 9,000  Cost: ¥0.02
dock-detail-main
│  deepseek / deepseek-flash  Cache: 50%  ¥Cache/In/Out：0:20:80  Sum: 6,000  Cost: ¥0.01
└─ <子会话自身 id（宿主未报该子代理名称）>  Cache: 50%  Sum: 3,000  Cost: ¥0.0050
```

`/budget detail` 前的 brief 同一 run 内为 `context 条  Effort:` ＋ `Total: …` ＋ `Prev:  Cache: 0%  ¥Cache/In/Out：0:20:80  Sum: 20  Cost: ¥0.0001`（框架自身合成的那一轮的结束差分）；再切一次回到同一形状。真实 RPC 宿主没有独立视图，因此**主／子不同目标的真实 TUI 焦点切换不在本环境内**，属未验证项。

**切换步骤（交互 TUI，隔离环境）。**

1. 建 run root：`agent-state/`、`sessions/`、`work/`；清空解析偏移量（`OMP_PROFILE`／`PI_PROFILE`／`OMPCODE`／`PI_CONFIG_FILES`／`XDG_*`／`PI_CODING_AGENT_DIR`／`OMP_AUTH_BROKER_*`），设 `PI_CODING_AGENT_DIR=<run>/agent-state`。
2. 用本仓 model-cost 入口启动：`bun <prefix>/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts --session-dir <run>/sessions --cwd <run>/work -e <repo>/entrypoints/omp/model-cost.ts --model <一个 DeepSeek 模型>`。
3. 先与主会话交互一两轮（产生 Total 与 Round 行），**记住此刻 `Total:` 行整行文本**。
4. 输入 `/budget detail`：顶部 context 条与 `Total:` 行应**逐字不变**；其下应换成 root 名称行、`│  provider / model …` 模型行、以及每个子／孙各一行 `├─ `/`└─ ` 行；**不应再有 `Round:`／`Prev:` 行**；`model` 行不能看起来像代理节点（同一层级缩进但用 `│  ` 而非连接符）。
5. 让主会话 spawn 一个子代理（真实 task），再在 TUI 里用 focus 手势把视图切到该子代理：应显示**子代理自己的** Effort／context 条／当前模型结构与其**自身** Round，且**不再有树**（固定 brief）；整树 `Sum`／`Cost`／`Ref` 仍为主会话＋全部后代，余额／额度等 provider 全局测量不变成该子独享。
6. 切回主会话：应重新是 detail 形态（树＋同一 Total），说明入口偏好被保留且往返没有改变 Owner／记账。
7. 在子代理视图下再输入 `/budget detail`：只是翻转入口偏好（返回主会话时才看到 detail），子代理视图不变。
8. 重启该 CLI：应回到 brief（Round 行在，树不在）。

**期望值从哪来。** 与自动结果逐项对照：根名称＝宿主会话名（第 4 步可见）；模型行名称＝`provider / model`；每行 Sum 应等于该实际 Session 自身累计（子代理行不等于整树 Sum）；子行缩进深度＝直接父层级；`Round:`／`Prev:` 行与 `view.roundTotals` 的差分一致（当前轮＝自身累计−开始快照，上一轮＝结束−开始）；`totalText` 的 Cache／比例恒取**所查看 Session 当前模型**而 Sum／Cost／Ref 恒取主树。受控对照入口（已在仓库内）：

- 受控事实 adapter：`bun test tests/model-cost/detail-widget.test.ts`（brief↔detail 形态与逐字行）
- S2 数据 seam：`bun test tests/model-cost/detail-tree.test.ts`（树行字段、偏好、往返、请求计数）
- 真实宿主：`bun test tests/harness-dock/detail-tree.test.ts`

**本环境未覆盖的部分（H1 之所以仍需人工）。** 上面真实运行是 RPC（headless）宿主：没有独立视图、没有 focus 手势、没有 TUI 的字体／颜色／窄宽布局。主／子视图切换与「只给值着色」「窄宽降级」同属视觉，由 20 票的 P67 H1 收口；本票只证值、行与形态。

**结论：P23／P26 的 H1 未验证——需用户确认。** 未确认不记通过。

## 6. P58／P52 中本票的具名责任

本票不承接 P58（消费者迁移）与 P52（持久文档 schema）的实现责任，也未触碰其任何生产文件或调用方：

- **P52**：本票未新增文档字段、未改 `schemaVersion`／`periodId`／`harnesses.<h>.sessions` 形状，也未新增保存触发。证据：S2 用例断言一次「主 detail→子 brief→主 detail」往返后消费文档**逐字节不变**；真实宿用例断言两次 `/budget detail` 前后文档中的 Session 记录完全相同。独立 schema 检查仍由 06／24 票持有，本票未使其失效。
- **P58**：本票不修改 `framework/**`、`extensions/connect-bot/**`、`extensions/codebase-tools/**`、配置或宿主补丁，不改变任何消费者可见协议、State、prompt、历史或效果；`/budget` 的 `actions` 路由本身由 02 票交付并被连接复用。因此本票不存在需要迁移的调用方，也不存在被本票改变的行为。相关回归由 22／23 票持有（本会话 `bun test tests/model-cost tests/framework` 573 pass 无回归可作旁证）。

## 7. 平台事实与已知限制（**未验证项**）

- **真实 TUI 焦点切换未跑**：见第 5 节末段（RPC 宿主无独立视图）。受控事实 adapter 与 S2 已给出取值规则的确定性证据，真实焦点路径待人工。
- **`Round:`／`Prev:` 两个标签是本票的展示措辞**：lighthouse 只规定「原 Turn 行改名 Round」与「当前／上一 Round」，未固定双行标签；本票取 `Round:`（开放中的那一轮）与 `Prev:`（最后一轮结束快照−开始快照）。旧视觉最终口径由 20 票 P67 H1 确认，未确认不记通过。
- **仅有零输入的范围显示 `Cache: 0%`**：沿用 11 票已交付的文本格式（缺 `cacheHitRate` 时文本层写 0%），树行与 Round 行同样复用该规则，未在本票擅自改动；「未知命中率怎么显示」仍属 11 票文本格式与 20 票视觉范围。
- **树行的模型行对 `hidden` pair 仍会显示 token（无金额、无比例）**：本票按「不因当前展示模式过滤已获得且应计入的其他模型消费」如实列出 root 自身已记录的 pair，并按该 pair 模式门控金额；没有金额口径的 pair 绝不显示金额或比例。该取舍在 S2 用例中以 `EVERY_PAIR_USD`（harness 给每个 pair 报价）固定为可证伪的断言。
- **真实子代理名称**：真实宿主对该子代理不上报名称，树行按既定规则以其自身 Session id 显示（名称是展示数据，不是身份），与 09 票记录一致。
- **本票 P20／P23／P26／P29 的条件性 H3**：仅当真实 OMP 脚本多次失败或成本明显过高时才转人工；`tests/harness-dock/detail-tree.test.ts` 一次通过（2.7s，无重试），因此**没有需要转交的具体 H3 场景**（无则无）。H2 本票不持有。
- **`README.md` 仍不列 model-cost**：其 Context／Document index 表只有 framework／connect-bot／codeBaseTools，也没有 `tests/model-cost/` 行；这是本次迁移实施前的既有状态（不由本票引入），发布与索引更新归切换／交接票（24／25）持有。本票只更新了 model-cost 自己的 GLOSSARY 与 `GLOSSARY-MAP.md`。
- **正式 OMP 环境未触碰**：全部运行在 `.cache/omp-baseline/18.5.0-viewed-session` 与临时 run root 内；未重启、未改配置、未对当前调度实例执行验证命令。
