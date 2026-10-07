# 自定义交互和原生能力可以越过哪些边界

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: resolved
Blocked by: 02

## Question

通知、常驻接入标记和命令反馈如何组合框架能力与扩展自定义交互；扩展直接使用 OMP 原生 API 的入口、职责及约束是什么？

沿用架构已允许原生调用的前提，不另造全量原生 API 包装层。决定接入标记是否使用框架 Marker area、动态反馈需要何种数据，以及扩展专属 UI 与框架区域的边界。明确自定义代码能否以及如何写入框架管理的 State、注册命令、处理事件和持有资源，防止出现第二个当前值或互相覆盖的 UI 所有者。若需要改变 Marker area 等既有契约，必须显式提出变更而非把原生调用视为豁免。无需为不存在的复杂界面预先设计通用 UI。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

---

## 承接输入（来自《接入命令与会话状态由框架和扩展如何共同管理》讨论，2026-10-07，未定稿）

- **文案/通知约束整体重开**：baseline 01 的「全部提示文案保留」不再成立。本票需逐条确认：arm 成功/失败、offline 成功/失败、首次推送失败、自动 disarm、会话切换、未知参数、no-UI 拒绝，分别保留、改写还是删除。
- **命令词形**：`offline` → `off`（不保留别名）。本票确认 `/connect-bot off` 的反馈语义（友好文案 vs 原始超时/非 2xx 码）。
- **持久连接标识**：改用框架统一 marker 区，由 `enabled` 派生。本票决定 marker 文本、与 codebase-tools marker 的共存/排序、发布时机（含 auto-disarm、session-switch 的清除），以及与面板侧 contract P3/P7/边界决定的重新对齐。
- **P5 的 hasUI=false 门槛**（stderr 拒绝、不改状态、不发请求）：决定由框架在 invocation 暴露原生事实（如 `hasUI`），还是由扩展 `runtimes/omp.ts` 自行守卫。
- 约束：不得把改动藏进「原生调用豁免」；若改 Marker area 等既有契约必须显式提出。
- **marker 只对 owner 渲染**：子代理不显示 owner 的连接 marker（框架继承开关默认不继承；来源 [02 lighthouse](../lighthouse/02-command-state-ownership.md)）。
- **marker 刷新的触发源**（来源：[03 lighthouse](../lighthouse/03-lifecycle-effects.md)）：框架在语义 `session_start`/`session_end`（session-switch / 新建 / 结束）刷新 marker 区；本票只需决定 marker 文本与通知，无需重复定义发布时机。

---

## 讨论结果（2026-10-07）

### 1. 统一反馈通道：一个带 severity 的运行时无关接缝

- 选定：框架把扩展可见的用户反馈统一为一个运行时无关接缝，severity 取 `info | error`（按需，不顺带补 warning），注入**命令 handler 与语义事件 handler**；扩展共享 logic 只经它发反馈，不直接调 `ctx.ui.notify`。适配器负责：有 UI 时映射 `ctx.ui.notify(message, level)`，无 UI 时落 stderr。
- 不合并框架内部的 `NoticeTransport.warn`（admission / 会话投递的 warning 通道保持原样）。
- 理由：共享 logic 不 import 原生类型（`import-boundary.test.ts` 不变量）；扩展层行为可用 mock 验证（01 的契约覆盖口径）；原实现 info/error 两档用户可见差异必须保留。
- 否决：扩展在需要 error 时直调原生 `ctx.ui.notify`；把 severity 扩到 `warning` 去顺带统一框架内部提示。

### 2. hasUI 事实与 no-UI 门槛的落点

- 选定：框架在命令 invocation 与语义事件 delivery 上暴露忠实的 `hasUI: boolean`；`main + hasUI` 门槛由扩展共享 logic 执行，拒绝文案经统一反馈口发出（`!hasUI` 时自然落 stderr），不改状态、不发请求。
- 子代理的静默拒绝仍由框架 owner 范围承担（沿用 02/03），不进扩展文案表。
- 否决：框架对所有扩展统一静默拒绝 no-UI 命令；扩展在 OMP 装配层自读 `ctx.hasUI` 决定。

### 3. 扩展直连 OMP 原生能力的 allow-list 与约束

- allow-list（全部关在 `extensions/connect-bot/runtimes/omp.ts`，标 OMP-qualified）：
  - managed timer `ctx.setInterval`（10s 心跳；03 已定 timer 归扩展）；
  - 线上协议需要的原始事实：真实 `sessionId`（`ctx.sessionManager.getSessionId()`）、cwd、model 展示名——作为纯数据交给共享 logic。
- 其余一律走框架：统一反馈口、marker 区、`hasUI`、语义事件与 `canAcceptInput()`、声明值的读/写接缝。
- 禁止：共享 logic import 原生类型；扩展注册原生事件 hook（会重复 03 的框架映射）；共享 logic 直调 `ctx.ui.*`。
- 依据：框架 owner key 是 `mainOwnerKey(sessionId)` 的不透明派生值、框架从不解释（[`framework/adapters/omp.ts:277-296`](../../../framework/adapters/omp.ts)），所以线上协议需要的真实 sessionId 只能在 OMP 侧读取。

### 4. Marker 文本与共存

- marker 文本：`◈ connectBot`；`enabled=true` 才显示，off 时不显示任何内容。
- 摆放、行序（按扩展 id）、发布时机与清除由框架所有（沿用 02/03）；与 codebase-tools 的 `◈ codeBaseTools` 同区共存。

### 5. 文案集合逐条确认

| # | 触发 | 文案 | 等级 | 结论 |
|---|---|---|---|---|
| A | arm 成功 | `已接入 omp-bot 面板（当前 N 个在线会话）` | info | 保留（N 来自 register 回执） |
| B | arm 失败/超时 | `无法连接 omp-bot，未启用；请确认面板已启动` | error | 保留 |
| C | off 且面板可达（含 404 等非 2xx） | `已断开 omp-bot 面板` | info | 保留 |
| D | off 且不可达/超时 | `omp-bot 面板未响应` | error | 保留 |
| E | 本失败段首次推送失败 | `与 omp-bot 面板连接中断；若持续失败将自动断开` | error | 保留 |
| F | 连续 3 次失败自动 disarm | `与 omp-bot 连接中断，已断开；重新执行 /connect-bot 可重连` | error | 保留 |
| G | 会话切换（session_end transferred） | `会话已切换，已断开面板；重新 /connect-bot 可重连` | info | 保留 |
| H | 未知参数 | `未知参数「X」；用法：/connect-bot（接入 omp-bot 面板）或 /connect-bot off（断开）。` | error | **改词形**（原写 `offline`） |
| I | no-UI 拒绝 | `当前模式无 UI，不支持接入面板` | —（!hasUI 落 stderr） | 保留 |
| J | 子代理拒绝 | 静默 | — | 框架 owner 范围，无文案 |

- 附带边界：非 2xx（面板可达）归 C 的成功文案；只有 reject/超时归 D。
- 面板侧 contract P3/P7 里的 `offline` 表述已因 02 的词形决策失效；本次不改面板代码/协议，仅在 spec 里记为扩展侧词形为准。

### 6. 判断树集中为单一纯函数

- 不新增「语义结果」类型：`selectFeedback(input) → { level, message } | undefined` 直接吃现有归一化产物——`readRegisterOutcome()` 的 `{ onlineCount } | undefined`、off 的 `try/catch` → answered/unreachable、`recordFailure()` 的 `FailureAction`——再加 `trigger`、`enabledBefore`、`hasUI`。
- 树内不按数字状态码分支，避免把 02 否决过的 raw-code/文案耦合引回来。
- 树属 connect-bot 共享 logic；框架的 `directed` 命令不自动产生反馈（只有 `toggle` 有框架生成文案），因此不与判断树重复发通知。
- 否决：为判断树新造一套 `receipt | not-receipt | unreachable` 等语义结果类型（无行为、纯改名）。

### 7. 框架 toggle 反馈接入统一通道

- `runCommandToggle` 的 enabled/disabled 反馈改由统一反馈口发出，severity=`info`，文本保持 `codeBaseTools enabled/disabled` 不变；codebase-tools 无需改动（现状已经由 `invocation.notify`→`ctx.ui.notify(info)` 发出，真实 OMP 测试已断言两条文案）。
- 否决：改成中文/`◈ codeBaseTools` 风格文案；新增 per-command 自定义文案声明字段（Notes：不顺带补齐远期能力）。

### 8. auto-disarm 的写入与扩展工作数据归属

- **8a 写入接缝**：把 02 的「handler 拥有写」推广到所有注入 handler（命令 + 语义事件）：框架在每个 handler delivery 上提供同一 State 写接缝（只能写本扩展声明的字段）；扩展在 auto-disarm 分支写 `enabled=false`，框架沿用「每次写后发布 marker」清除 marker。
- **8b 工作数据归属（Q8''）**：扩展工作数据（armed `sessionId`、failure budget、outbox、三值 state）由扩展自持 typed `Map<ownerKey, BotSession>`；arm/off/auto-disarm/session_end 处自建自清；框架只提供 `owner.key` 与语义边界。session_end 时用 delivery 的 `previousOwnerKey` 定位旧记录 → best-effort unregister 旧真实 sessionId → `delete`。
- 否决：框架开设 owner-scoped、memory-only 的 opaque `extra_data` 区（auto-clean 早于扩展清理一步，需 pre-retire 快照 + 泛化 `StateStore` 值类型，或修订 03 投递顺序）；声明式 State 字段泛化（02 §7 已否）。
- 理由：效果数据生命周期归效果所有者，扩展清理动作必须跨过 session_end 边界读旧数据，而「边界即清」早一步；opaque 区会退化成无 schema 的字符串键访问；三值/失败预算实为 arm 周期级，会话级清理只覆盖一半。

---

## Decision

统一扩展反馈为运行时无关、带 `info | error` severity 的框架接缝（命令与语义事件 handler 都可用，无 UI 落 stderr），框架在 delivery 暴露 `hasUI` 由扩展执行 no-UI 门槛；connect-bot 的 marker 文本改为 `◈ connectBot`（enabled 才显示），文案表除 `offline`→`off` 外全部保留并集中在单一 `selectFeedback` 纯函数；扩展直连 OMP 原生能力仅限 `runtimes/omp.ts` 的 managed timer 与真实 sessionId/cwd/model，用户可见交互一律走框架；框架在所有 handler delivery 提供声明值写接缝（auto-disarm 写 `enabled=false`），扩展工作数据由扩展自持 owner-scoped 记录，不引入 State 的 opaque extra_data 区。
