# 18 — Viewed session 的唯一 Marker area：自动证据与 P27 H1 材料

日期：2026-10-13。本文件是该票的**自动结果记录 + 待人工确认材料**，不是通过结论：H1/H2 在用户确认前不算通过。

## 交付行为（S1 公共 seam）

- `HarnessPort.viewedSession?: ViewedSessionPort`（`framework/core/protocol.ts`）：adapter 提供的只读“当前显示会话”读＋通知对。`read()` 每次重读（`undefined` = 该宿主没有出口；`unresolved` = 出口存在但 owner 不可得）；`subscribe(listener)` 交付该次变更的 marker transport。
- 每次 marker 发布都投影“席位”（`framework/behaviors/marker.ts`）：有出口则席位为宿主显示的会话，否则回退到该 delivery 自身位置；每行用既有 per-field 继承读（`stateValueFor`）——follow 读 Owner 当前值，none 读声明默认。
- **一个扩展在多个 session 各注册一次**（真实 loader 为每个 session 的 runner 各求值一次扩展模块图，各 binding 各持一份 State）：area 按 id 保留这些注册，席位由**服务于该席位 Owner 的 store** 回答（`StateStore.serves`，见下），因此查看另一 session 的 binding 既不能清空 region，也不能拿另一个 Owner 的值作答；已结束/退役的 Owner 仍归服务它的那个 store，读到声明默认（这才是正确的清空），不会被更早的同名注册占位。
- OMP adapter（`framework/adapters/omp.ts`）：把 `ctx.getViewedSession()` 事实解析为同一 `OwnerReference`（sessionId 身份，sub 经 AgentRegistry 上溯到 main；名字不作身份），出口缺失＝`undefined`，事实不可得＝`unresolved`（诚实清空）；订阅随最后一个 listener 释放。
- 绑定（`framework/behaviors/binding.ts`）：定义声明 marker 时注册一次；view 变更重新投影；绑定结束时释放订阅。
- 投影判定的 store 事实（`framework/core/state.ts`）：`serves(ownerKey)` —— 该 store reconcile 过该 Owner 的边界或写过它的 cell；Owner 退出后仍保留（值已随 cell 退役，服务它的 store 读出声明默认）。

## 重试根因（原 report 的“子 publication 清空 region”）

真实宿主上，delegation 会为子 session 建自己的 ExtensionRunner，loader 重新求值同一扩展图 → 子 session 的 binding 以**同一扩展 id**、**自己的 StateStore** 向进程唯一 area 注册。原实现按 id“后注册者覆盖”：于是 Owner 会话随后的每一次发布都用**子 store** 投影 Owner 席位 —— 子 store 从未 serve 过 Owner key，读到的都是声明默认 → `lines=[]` → widget 被清空（帧序列 `[OWNER…, undefined…]`）。子会话迟到的事实变更通知之后才短暂出现 `["◈ followMarker"]`，因此当时把该断言删掉是**弱化期望**，不是解释。

真实 host 上的 trace（临时诊断，诊断后已移除）证实：

- 子 runner 确有第二次 `register id=marker-follow-probe`；其 ctx `agent=dock-marker-child/sub`、`hasUI=false`。
- 覆盖发生后，`agent=Main/main hasUI=true` 的发布逐个变成 `lines=[]`；修好后 Main 的发布恒为两行，而子 ctx 自身发布（无 UI，不产帧）投影出 `["◈ followMarker"]`——follow 读 Owner 当前值、none 读声明默认。

结论：这是真实 projection/state/owner-fact 时序缺口，不是 double 排除的“投影逻辑错误”，也不是可接受的降级。

## 修复范围（red → green）

- `framework/behaviors/marker.ts`：area 按 id 保存各 binding 的注册（同 store 重复注册就地替换）；席位由“最新一个 serve 该 Owner 的注册”回答；`shows(id, seat)` 让 view-change/run 守卫改用 area 自身的渲染判定，而不是某一份 binding store。
- `framework/core/state.ts`：新增 `serves(ownerKey)`（reconcile 边界或写 cell 即算 served，退役后保留），`reconcile`/`#write` 记录。
- `framework/behaviors/binding.ts`：两处调用随签名去掉不再需要的 `state` 实参。
- 文档：`framework/GLOSSARY.md`（Marker area）、`framework/docs/framework-capabilities.md`（marker 段 + State 模块 `serves` 行）。

## 红 → 绿（先失败，再最小实现）

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| red（修复前，先写新用例） | `bun test tests/framework/viewed-marker.test.ts` | 9 pass / **2 fail**：新用例得到 `undefined`（region 被清空），即被删除的 consumer-visible 失败 |
| green（修复后，含第三条用例） | 同上 | 10 pass / 0 fail |
| fault injection | 临时把 `#speaker` 换回“后注册者覆盖”，`bun test tests/framework/viewed-marker.test.ts` | 7 pass / **3 fail**（三条新用例各自失败）；`bun test tests/harness-dock/viewed-marker.test.ts` | **1 fail**：运行结束时 widget 为 `undefined` |
| 还原后 | 两套 | 10 pass / 0 fail；1 pass / 0 fail |

## 自动结果（实跑）

| 命令 | 结果 |
| --- | --- |
| `bun test tests/framework` | 385 pass / 0 fail（含 `viewed-marker.test.ts` 10 pass） |
| `bun test tests/framework tests/model-cost tests/codebase-tools` | 609 pass / 0 fail |
| `bun test tests/harness-dock/viewed-session.test.ts tests/harness-dock/viewed-session-host.test.ts tests/harness-dock/viewed-marker.test.ts tests/harness-dock/viewed-session-total.test.ts` | 14 pass / 0 fail |
| `bun test tests/harness-dock/viewed-marker.test.ts` | 1 pass / 0 fail（冻结 patched host + RPC + 真实 task 工具子会话） |
| `bun test tests/framework tests/model-cost tests/codebase-tools tests/harness-dock` | 第 1 次 668 pass / 4 fail，第 2 次 670 pass / **2 fail**；两次都失败的只有 `tests/harness-dock/baseline.test.ts` 的 checkout anchor 两条，与改动前 `.cache/full-suite-13.log`（729 tests / 4 fail）中逐字相同，属既有环境/工件漂移；第 1 次多出的 `model-cost-balance.test.ts` 锁目录 ENOENT 属该 suite 自身临时目录竞态，复跑未再出现 |
| `bun test tests/connect-bot` | 141 pass / 3 fail：前两条与改动前 `.cache/full-suite-13.log` 逐字相同（真实 omp-bot 面板 upsert 与 30s 窗口等待）；第三条 `request-timeout.test.ts` 的 budget 生命周期在并发负载下失败，**单跑该文件 10 pass / 0 fail**，属该 suite 自身计时抖动，与 marker 投影/State 无关 |
| `bun run typecheck` | exit 0（clean） |

`tests/framework/viewed-marker.test.ts` 新增的三条（S1 seam）：

1. 子 session 的 binding 注册后，Owner 会话自身的发布**必须仍发生且仍渲染两行**（不是被清空）。
2. 子 session 自身的 run 投影**on-screen 席位**：`["◈ followMarker"]`，而不是它自己空 store 的 `[]`。
3. 同进程两个 main session 各绑同一扩展时，各自区域只显示自己 Owner 的值（后绑定者不得替另一 session 作答）。

`tests/harness-dock/viewed-marker.test.ts`（S5）新增断言：

- 视图内 widget 最终渲染＝Owner 两行；且 `afterArming` 之后**没有任何一次清空**（`lines === undefined`）。
- 该观察用 `get_state` 往返做屏障（host 单 stdout 有序），并在 delegation 后再跑一次 Owner prompt，使断言针对“子 binding 已绑定之后的 Owner 渲染”，避免只看到已到达的帧。
- widget 帧的 lines 用 `markerLines()` 校验（host 把清空编码为缺省属性；旧代码的 `as` 断言会把它读成合法数组）。

## 未决（诚实记录，未记通过）

- RPC 宿主只报每个 session 自身的事实，没有独立 focus：**子席位（follow-only 单行）在真实 RPC widget 上不可观测**（子会话 `hasUI=false`，其 ctx 发布不产帧）。子席位投影由 S1 seam 用例覆盖；真实交互 focus 属 H1。
- 未在真实交互 TUI 上运行 focus/失效回落（H1 材料见下），真实视觉仍待人工确认。

## P27 H1 材料（真实交互视觉，待人工）

State 场景：两个 marker fixture（`tests/harness-dock/fixtures/viewed-marker-follow` = `inheritance: "follow"`，文本 `◈ followMarker`；`viewed-marker-none` = `inheritance: "none"`，文本 `◐ noneMarker`）。在 Owner 会话各自运行 `/marker-follow-toggle`、`/marker-none-toggle` 后：

1. 主视图期望标记（按 id 排序）：`◈ followMarker`、`◐ noneMarker` 两行，位于既有 `aboveEditor` 的 framework 唯一 widget。
2. 聚焦一个子代理后：只剩 `◈ followMarker`（follow 读 Owner 当前值），`◐ noneMarker` 不出现（声明默认）；位置、行序、widget 身份不变，无第二个 marker 区。
3. 子视图下于主会话关掉 follow 扩展：子视图随之少掉该行（实时读 Owner 当前值，非切换时快照）。
4. 返回主视图：恢复两行；全程主/子会话的记账、Owner、继承与写权限不变（子会话命令不写入）。
5. 目标失效：关闭正被查看的子代理后期望视图回落主会话、标记回到两行。
6. **本次回归点**：delegation 期间/之后，主区域不得被子会话自身发布清空（自动层已用 dock 断言固定；人工复核视觉上不出现闪空）。

步骤（隔离，不触碰正式 OMP）：按 `host-patches/omp-18.5.0-viewed-session/README.md` 的交互启动方式，以本仓库 `tests/harness-dock` 的 run root 环境变量启动 patched CLI，加载上述两个 fixture，重复 1–6 并记录截图/录屏；真实视觉与颜色/宽度风格由人工确认。
