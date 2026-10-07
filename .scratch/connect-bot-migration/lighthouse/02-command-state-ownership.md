# 02: 接入命令与会话状态由框架和扩展如何共同管理: Lighthouse

> Question and discussion: [02: 接入命令与会话状态由框架和扩展如何共同管理](../decision/02-command-state-ownership.md)

## Question

为保留的接入、重注册、断开和工作状态行为，框架应提供哪些命令与 State 能力，哪些转换及业务规则由扩展负责？

明确接入请求成功前后的状态、失败时状态、重复命令的副作用，以及并发命令/迟到回执的有效性边界。区分命令动作与模式设置，不将重新注册简化为 toggle 或无副作用的幂等设置。确定当前值的权威来源、所属会话、临时连接资源与 State 的关系、恢复及子代理策略；现有布尔 State 和继承策略是否需要扩展须基于实际能力核对，不预设所有数据都要进入 State。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

## Discussion

### 1. 命令类别「定向开关」

选了新控制类别，而不是复用 `toggle` 或归入 `mode selection`。理由：GLOSSARY 的 mode selection 明确「重复选择已激活模式不重复转移副作用」，而 connect-bot 重注册**有意重复副作用**（重发 register、清队列、重置失败预算）。被否决：mode selection 特例、复用 toggle、把重注册做成无副作用幂等设置。

### 2. 命令形态与词形

写死「空参=on、`off`=off」，不做 off-word 声明字段、不保留 `offline` 别名。理由：用户判断不存在「自定义不同词语表示 off」的需求，写死最简单。接受代价：`/connect-bot offline` 变为未知参数报错，属破坏性词形变更，需同步面板契约 P3、面板决策 05、baseline 01、README、L1 测试。

### 3. 能力落点与 handler 接缝

框架新增 `directed` 控制类别；HTTP/协议/业务留扩展。definition 保持纯数据（`framework/core/definition.ts:4-8` 的 no-raw-handler 不变量保留），handler 由扩展共享 logic 在 assembly 注入。被否决：在 definition 里挂 handler、扩展绕过框架用 `runtimes/omp.ts` 原生注册。

### 4. 写入权威与动作顺序

`enabled` 的值由动作结果决定，handler 在 State 写入**之前**运行并拥有写；声明只表达字段所有权。理由：offline 的扩展侧过滤必须读调用前的 `enabled`，否则第一次 off 会被自己过滤掉。arm 不设过滤（P2 幂等重连），off 受过滤（未接入 no-op）。并发/迟到回执守卫归扩展。被否决：框架无条件写声明值、框架先写 State 再调 handler。

### 5. State 生命周期 in-memory

`enabled` 用 per-field `persistence: "memory"`：不写 session entry、不从分支 seed、不随 restore 复活；owner 被替换归 default、同身份导航保持。被否决：持久化（会恢复出「已接入但没心跳/没远端注册」的假状态）。

### 6. 连接标识用框架 marker

常驻连接标识由框架统一 marker 区从 `enabled` 派生。文本/摆放/共存/发布时机归 04；框架需新增「每次写 `enabled` 后发布 marker」的路径。被否决：继续用 `ctx.ui.setStatus` footer 作为契约。

### 7. 子代理继承：新增继承开关，默认不继承

框架 State 增加 per-field 继承开关，**默认不继承**；`enabled` 不继承，子代理读 default、不启动效果、不渲染 marker。连带：codebase-tools 需显式声明「可继承」以保留既有子代理跟随行为；`tests/framework/owner-inheritance.test.ts` 与 ADR 0002 §Subagent State inheritance 需更新。被否决：接受 live-follow + 扩展守卫、`enabled` 不进框架 State。

### 8. agent 工作状态留在扩展

三值不进框架 State。理由：无框架消费者、需要泛化非布尔 State 类型 + 事件写接缝 + 继承策略，净增代码；且可能制造第二个当前值。被否决：三值进 State。

### 9. 文案范围外移

文案/通知约束整体重开，由 04 逐条确认；P5 hasUI 门槛也归 04。本票只声明「文案集合不在本票范围」。

---

## Decision

为 connect-bot 新增框架控制类别「定向开关」（写死「空参=on、`off`=off」，重复执行重复动作、幂等由扩展保证）；命令绑定 in-memory、默认不继承的 State 字段 `enabled`，值由扩展 handler 的动作结果决定，handler 在 State 写入前运行并拥有写；连接标识由框架 marker 区从 `enabled` 派生；子代理不继承该字段；agent 工作状态与 HTTP/协议/心跳留在扩展；文案集合与 hasUI 门槛由 04 决定。

## User stories

1. As a connect-bot 用户, I want `/connect-bot` 重复执行时重发 register 而不是 no-op, so that 面板重启后我能立刻重连，不必等约 30 秒自动 disarm。
2. As a connect-bot 用户, I want 用 `/connect-bot off` 断开且不再支持 `offline`, so that 命令表面只有一个词形、不会因别名产生歧义。
3. As a connect-bot 用户, I want 未接入时输入 `off` 是静默 no-op（不发请求、不通知）, so that 不会产生多余网络动作。
4. As a 扩展开发者, I want 框架提供「重复执行重复动作」的定向开关控制类别, so that 我能表达「再执行一次操作」而不被框架去重或短路。
5. As a 扩展开发者, I want 命令能插入自定义 TS, so that register/unregister 的 HTTP 与协议留在扩展里。
6. As a 框架维护者, I want definition 保持纯数据、handler 在 assembly 注入, so that 声明仍可检查、与运行时适配器解耦。
7. As a 扩展开发者, I want `enabled` 的值由动作结果决定, so that register 失败时不会显示「已接入」。
8. As a 扩展开发者, I want handler 在 State 写入前运行并拥有写, so that offline 过滤读的是调用前的 `enabled`。
9. As a 扩展开发者, I want 框架不去重、不串行化命令, so that 并发/迟到回执的守卫留在扩展业务逻辑。
10. As a connect-bot 用户, I want 连接状态由框架 marker 常驻显示并从 `enabled` 派生, so that 我一眼能看出是否已连接。
11. As a 框架维护者, I want per-field `persistence: "memory"`, so that 连接状态不写 session entry、不随 restore 复活。
12. As a 框架维护者, I want per-field 继承开关默认不继承, so that 子代理不会继承连接状态、不会发心跳/注册、不会显示 owner 的 marker。
13. As a codebase-tools 维护者, I want 显式声明「可继承」, so that 既有的「子代理跟随 main 激活值」行为被保留且可见。
14. As a 迁移实施者, I want agent 工作状态留在扩展业务逻辑, so that 框架 State 不被过度泛化。
15. As a 迁移实施者, I want 文案与 hasUI 门槛由 04 逐条确认, so that 大量用户可见变更得到显式裁定。

## Preconditions

- 01 已 resolved（行为基线冻结）；本票对其词形与「全部文案保留」条款做了修订。
- 框架 v1 现状：命令只有 toggle、State 单 boolean/owner-scoped/session-entry 持久化、无持续效果、无 per-field 继承策略（`framework/core/`、ADR 0002）。本票决策依赖这些现状并对其做 additive 扩展。
- 面板侧契约（`archive-docs/omp-bot/omp-connect-bot/contract.md` P1–P11 与边界决定）是固定外部输入；P3/P7/offline 边界决定与本票的词形/文案存在张力，须由 04/spec 重新对齐。
- `my-omp-toolkit` 开发期冻结；`archive-docs` 为历史归档，均不在本票修改范围。
- 04《自定义交互和原生能力可以越过哪些边界》`Blocked by: 02`，本票收口后解锁。

## Postconditions

- 04 承接：文案/通知集合逐条确认、marker 文本/摆放/共存/发布时机、`/connect-bot off` 的反馈、hasUI=false 门槛、面板侧 P3/P7 重新对齐。
- 03 承接：心跳/队列/资源释放的归属，以及通则「持续效果只对 owner 会话启动」。
- 框架获得 additive 能力：`directed` 控制类别、assembly 注入的 handler 接缝（definition 仍纯数据）、per-field `persistence`、per-field 继承开关（默认不继承）、handler 的 State 写接缝、每次 `enabled` 写入后发布 marker。
- codebase-tools 需显式声明「可继承」；`tests/framework/owner-inheritance.test.ts` 与 ADR 0002 §Subagent State inheritance 需对应更新。
- 01 的「全部提示文案保留」与 `offline` 词形被本票显式修订（已写入 01 的修订节）。
- 06《用什么证据证明迁移等价且框架边界成立》的验收范围需覆盖新框架能力（directed、memory persistence、继承开关、marker 发布）。

## Invariants

- 三轴正交永不合并：接入状态（已接入/未接入）≠ agent 工作状态（工作/等待/空闲）≠ 面板 keepAlive（在线/离线）。
- 框架 State 是框架管理值的单一当前值来源；`enabled` 不出现第二个副本；agent 三值不进 State、不做镜像。
- 子代理永不注册、不上报、不发心跳、不显示 owner 的连接 marker。
- arm 不设 `enabled` 过滤（重复 arm 重发 register）；off 受过滤且本地先断。
- definition 保持纯数据，`framework/core|behaviors` 与扩展共享 logic 不 import 原生运行时类型（对齐 `tests/framework/import-boundary.test.ts`）。
- 面板 HTTP 协议与端点不变（`/api/sessions/events`、`{sessionId,kind,data}`、`{proxy:false}`、404/非 2xx 语义）；本次只改扩展侧词形与文案。
- 框架公开接口只做 additive 变更（ADR 0002）。
- 新增控制类别与 State 策略沿用框架现有模式：纯数据声明 + adapter binding + 行为模块不命名原生 API（对齐 `framework/behaviors/control.ts` 与 `framework/core/state.ts`）。
- **控制类别 × 持久化 × 继承是 per-field 的正交轴**：`toggle`/`directed` 决定命令如何改 State；`session-entry`/`memory` 决定值是否持久化/恢复；`follow`/`none` 决定子代理是否跟随。三者可自由组合（codebase-tools = toggle+session-entry+follow；connect-bot = directed+memory+none）。框架的控制行为（`runCommandToggle`/directed）与会话行为（`reconcileSession`）都必须按字段策略分支：只持久化/只 seed `session-entry` 字段，memory 字段不写 session entry、不从分支 seed、owner 被替换才归 default。持久化的值 ≠ 效果仍在运行（恢复需 reconciliation，归 03；对齐 ADR 0002 §State and recovery seam）。
