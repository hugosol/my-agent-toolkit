# 04: 自定义交互和原生能力可以越过哪些边界: Lighthouse

> Question and discussion: [04: 自定义交互和原生能力可以越过哪些边界](../decision/04-interaction-native-boundary.md)

## Question

通知、常驻接入标记和命令反馈如何组合框架能力与扩展自定义交互；扩展直接使用 OMP 原生 API 的入口、职责及约束是什么？

沿用架构已允许原生调用的前提，不另造全量原生 API 包装层。决定接入标记是否使用框架 Marker area、动态反馈需要何种数据，以及扩展专属 UI 与框架区域的边界。明确自定义代码能否以及如何写入框架管理的 State、注册命令、处理事件和持有资源，防止出现第二个当前值或互相覆盖的 UI 所有者。若需要改变 Marker area 等既有契约，必须显式提出变更而非把原生调用视为豁免。无需为不存在的复杂界面预先设计通用 UI。

## Discussion

### 1. 统一反馈通道

框架新增一个运行时无关、带 `info | error` severity 的扩展反馈接缝，注入命令 handler 与语义事件 handler；适配器在有 UI 时映射 `ctx.ui.notify(message, level)`、无 UI 时落 stderr。扩展共享 logic 不再直调 `ctx.ui.notify`。框架内部的 `NoticeTransport.warn`（admission / 会话投递 warning）不合并。理由：共享 logic 不 import 原生类型、扩展层可用 mock 验证、保留原 info/error 两档。否决：扩展为 error 直调原生；顺带把 severity 扩到 warning 统一内部提示。

### 2. hasUI 事实与 no-UI 门槛

框架在命令 invocation 与事件 delivery 上暴露忠实的 `hasUI: boolean`；`main + hasUI` 门槛由扩展共享 logic 执行，拒绝文案经统一反馈口发出（`!hasUI` 自然落 stderr），不改状态、不发请求。子代理静默拒绝仍归框架 owner 范围。否决：框架统一静默拒绝 no-UI 命令；扩展在 OMP 装配层自读 `ctx.hasUI`。

### 3. 直连 OMP 原生能力的 allow-list

只允许 `extensions/connect-bot/runtimes/omp.ts`（OMP-qualified）使用：managed timer `ctx.setInterval`（10s 心跳）、真实 `sessionId`/cwd/model（作为纯数据交给共享 logic）。其余用户可见交互与生命周期事实一律走框架。禁止共享 logic import 原生类型、注册原生事件 hook、直调 `ctx.ui.*`。依据：owner key 是 `mainOwnerKey(sessionId)` 的不透明派生值，线上协议需要的真实 sessionId 只能 OMP 侧读取。

### 4. Marker 文本与共存

marker 文本 `◈ connectBot`，`enabled=true` 才显示、off 不显示；摆放/行序（按扩展 id）/发布/清除归框架，与 codebase-tools 的 `◈ codeBaseTools` 同区共存。

### 5. 文案集合逐条确认

A–J 十行全部保留，唯一改动是 H 行未知参数提示里的 `offline`→`off`；非 2xx（面板可达）归 C 成功文案，只有 reject/超时归 D；`!hasUI` 走 stderr、子代理静默。面板侧 P3/P7 的 `offline` 表述在 spec 标为失效，不改面板。

### 6. 判断树集中为单一纯函数

`selectFeedback(input) → { level, message } | undefined` 直接吃现有归一化产物（`readRegisterOutcome` 的 `{onlineCount}|undefined`、off 的 try/catch、`recordFailure` 的 `FailureAction`）加 `trigger`/`enabledBefore`/`hasUI`；树内不按数字状态码分支。不新造「语义结果」类型。树属 connect-bot 共享 logic；`directed` 命令不自动反馈，故不重复发通知。

### 7. 框架 toggle 反馈接入统一通道

`runCommandToggle` 的 enabled/disabled 反馈改由统一通道发出（`info`），文本保持 `codeBaseTools enabled/disabled`；codebase-tools 无需改动。否决：改中文/marker 风格文案；新增 per-command 自定义文案声明字段。

### 8. auto-disarm 写入与扩展工作数据归属

所有注入 handler（命令 + 语义事件）都获得同一个「声明值写接缝」，扩展在 auto-disarm 分支写 `enabled=false`，框架写后发布 marker。扩展工作数据（armed sessionId、health、outbox、三值 state）由扩展自持 typed `Map<ownerKey, BotSession>`，在 arm/off/auto-disarm/session_end 自建自清；`session_end` 用 `previousOwnerKey` 定位旧记录做 best-effort unregister。否决框架 opaque `extra_data` 区与声明式 State 字段泛化。理由：效果数据生命周期归效果所有者；「边界即清」比扩展清理早一步；opaque 区退化为无 schema 字符串键；三值/预算实为 arm 周期级。

---

## Decision

统一扩展反馈为运行时无关、带 `info | error` 的框架接缝（命令与语义事件 handler 都可用，无 UI 落 stderr），框架在 delivery 暴露 `hasUI` 由扩展执行 no-UI 门槛；connect-bot 的 marker 文本改为 `◈ connectBot`（enabled 才显示），文案表除 `offline`→`off` 外全部保留并集中在单一 `selectFeedback` 纯函数；扩展直连 OMP 原生能力仅限 `runtimes/omp.ts` 的 managed timer 与真实 sessionId/cwd/model；框架在所有 handler delivery 提供声明值写接缝（auto-disarm 写 `enabled=false`），扩展工作数据由扩展自持 owner-scoped 记录，不引入 State 的 opaque extra_data 区。

## User stories

1. As a connect-bot 用户, I want 命令反馈按 `info`/`error` 分级经同一条框架通道发出, so that 反馈的视觉严重程度与实际情况一致
2. As a 框架维护者, I want 一个运行时无关、带 `info | error` 的扩展反馈接缝, so that 扩展共享 logic 不必 import 原生类型
3. As a 框架维护者, I want 无 UI 时反馈自动落 stderr, so that no-UI 会话仍有可观测的拒绝与失败提示
4. As a 扩展开发者, I want 框架在 invocation/delivery 上暴露忠实的 `hasUI` 事实, so that 扩展共享 logic 能执行 `main + hasUI` 门槛并用 mock 测试
5. As a 扩展开发者, I want 只有 `runtimes/omp.ts` 能直连原生能力, so that 共享 logic 保持运行时无关
6. As a 迁移实施者, I want 真实 sessionId/cwd/model 由 OMP 装配层原生读取并作为纯数据传入, so that 线上协议不依赖框架的不透明 owner key
7. As a connect-bot 用户, I want 已接入时 marker 显示 `◈ connectBot`、off 时消失, so that 我一眼看出连接状态
8. As a 框架维护者, I want marker 的摆放/行序/发布/清除由框架所有, so that 多扩展 marker 共存不互相覆盖
9. As a connect-bot 用户, I want 除 `offline`→`off` 外的全部提示文案保持不变, so that 迁移不引入未授权的用户可见变更
10. As a 扩展开发者, I want 反馈判断树是一个吃既有归一化产物的纯函数, so that 全部反馈路径可用 mock 覆盖
11. As a 框架维护者, I want `directed` 命令不产生框架自动反馈, so that 扩展 handler 的文案不与框架生成文案重复
12. As a codebase-tools 用户, I want enabled/disabled 提示经统一通知通道发出, so that 框架新通知通道对既有扩展零成本生效
13. As a 扩展开发者, I want 框架在所有 handler delivery 提供声明值写接缝, so that auto-disarm 能写 `enabled=false` 并让 marker 清除
14. As a 扩展开发者, I want 扩展自持 owner-scoped 的 typed 效果记录, so that 效果数据与效果生命周期一致、不被框架提前清理
15. As a 扩展开发者, I want `session_end` delivery 提供 `previousOwnerKey`, so that 我能定位旧 sessionId 做 best-effort unregister
16. As a 框架维护者, I want `enabled` 是唯一进入框架 State 的 connect-bot 声明值, so that 不出现第二个「当前值」权威

## Preconditions

- 01（行为基线）已 resolved；其「全部提示文案保留」条款已由 02 修订，本票是文案的最终裁定。
- 02（命令/State 归属）已 resolved：`directed` 命令、in-memory 默认不继承的 `enabled`、框架 marker 区、扩展 handler 在 State 写入前运行并拥有写、子代理不继承。
- 03（生命周期）已 resolved：语义事件、owner-gate、owner 订阅只收 owner 事件、「框架行为先、扩展 handler 后」、`session_start`/`session_end` 刷新 marker、managed timer 标 OMP-qualified。
- 框架 v1 现状：`NoticeTransport.warn` 仅 warning；`CommandInvocation.notify` 仅 info；marker 区框架所有；owner key 是不透明 `mainOwnerKey(sessionId)`；State 写路径只有命令 transition 与 session 边界 seed/retire。
- 面板侧 contract（`archive-docs/omp-bot/omp-connect-bot/contract.md` P3/P5/P7）是固定外部输入，只对齐扩展契约、不改面板代码/协议。
- `my-omp-toolkit` 开发期冻结；真实集成由用户手动验证。
- 8a 依赖框架新增「所有 handler delivery 的声明值写接缝」；1/2 依赖框架新增带 severity 的扩展反馈口与 `hasUI` 事实。

## Postconditions

- 06（验收契约）承接：验收需覆盖 info/error 反馈、no-UI 门槛、marker 文本与 auto-disarm 清除、OMP-qualified 原生 allow-list、文案表逐条、`selectFeedback` 纯函数。
- 框架获得 additive 能力：带 `info | error` 的扩展反馈接缝（命令 + 语义事件 handler）、delivery 上的 `hasUI` 事实、所有 handler 的声明值写接缝。
- `runCommandToggle` 反馈改走统一通道；codebase-tools 无需改 definition，其 enabled/disabled 文本与可观测行为不变。
- `directed` 命令不产生框架自动反馈。
- 01 的文案条款被本票最终收口（H 行 `offline`→`off` 修正）。
- 面板侧 P3/P7 的 `offline` 表述在 spec 中标为失效；不改面板代码/协议。
- 02/03 的既有承诺（marker owner-only、session_end 刷新、owner-gate、session 事件语义）不被本票改变。

## Invariants

- 扩展共享 logic 不 import 原生类型；用户可见交互不经原生 `ctx.ui.*`（对齐 `tests/framework/import-boundary.test.ts` 与 `framework/core/protocol.ts` 的「model context 之外」契约）。
- 反馈只走 model context 之外（UI 通知或 stderr），永不进入注入提示/会话记录/工具输出。
- `enabled` 是唯一进入框架 State 的 connect-bot 声明值；agent 三值、failure budget、armed sessionId 不产生第二个「当前值」副本（对齐 02 的三轴正交）。
- 子代理永不注册、不上报、不发心跳、不显示 owner marker（对齐 02/03）。
- marker 区由框架所有：扩展只提供文本，摆放/行序/发布/清除归框架（对齐 GLOSSARY Marker area）。
- definition 保持纯数据；`directed` 控制类别不自动产生框架反馈（对齐 02）。
- 扩展效果数据的生命周期归扩展，与框架 owner cell 生命周期分离（对齐 03「框架管语义、扩展管效果」）。
- OMP-qualified 原生使用集中在 `extensions/connect-bot/runtimes/omp.ts`，共享逻辑不依赖原生事实（对齐 03 §9 的 OMP-qualified 标注）。
- 框架公开接口只做 additive 变更（对齐 ADR 0002）。

## 修订（2026-10-07，由《后台效果与 session_end 清理如何取得框架能力与 owner 事实》触发）

- **§8b 工作数据定位修订**：原「session_end 时用 delivery 的 `previousOwnerKey` 定位旧记录」改为——`session_end(transferred|disposed)` 的 `owner.key` 即正在结束的 owner，扩展据此查自持记录；`previousOwnerKey` 从语义投递移除。
- **User story 15 修订**：原「`session_end` delivery 提供 `previousOwnerKey`」改为「`session_end` delivery 以 `owner.key` 给出正在结束的 owner」。
- **后台效果回调补全**：所有 handler delivery 的声明值写接缝 + 统一反馈口以可保留的 owner-scoped 能力句柄形式提供，heartbeat/outbox 回调复用；句柄随 owner retire 失效（写 no-op、反馈丢弃），session_end 本次投递自带一次性反馈口（详见 07 lighthouse）。
- 其余 Decision、User stories、Preconditions、Postconditions、Invariants 不变。
