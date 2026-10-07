# 接入命令与会话状态由框架和扩展如何共同管理

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: resolved
Blocked by: 01

## Question

为保留的接入、重注册、断开和工作状态行为，框架应提供哪些命令与 State 能力，哪些转换及业务规则由扩展负责？

明确接入请求成功前后的状态、失败时状态、重复命令的副作用，以及并发命令/迟到回执的有效性边界。区分命令动作与模式设置，不将重新注册简化为 toggle 或无副作用的幂等设置。确定当前值的权威来源、所属会话、临时连接资源与 State 的关系、恢复及子代理策略；现有布尔 State 和继承策略是否需要扩展须基于实际能力核对，不预设所有数据都要进入 State。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

---

## 承接约束（来源：[01 lighthouse](../lighthouse/01-behavior-baseline.md)）

- 「接入状态（已接入/未接入）」与「agent 工作状态（工作中/等待用户输入/空闲）」是**两轴正交、各自独立上报**的值；本票设计命令与 State 能力时不得把它们合并为单一「在线」值。第三条轴 keepAlive（在线/离线）由面板派生，见《生命周期映射与持续上报由哪一层负责》。

---

## 讨论结果（2026-10-07）

### 1. 命令语义：新增控制类别「定向开关（directed switch）」

- 不复用 `toggle`、也不是 `mode selection`：GLOSSARY 的 mode selection 明确「重复选择已激活模式不重复转移副作用」，而 connect-bot 的接入命令**重复执行重复同一动作**（重发 register）。用户最初的「mode selection 特例」提法被否。
- 新类别语义：命令形式显式指名目标态；**重复执行重复动作，框架不做去重/幂等**，幂等由扩展开发者保证。`_Avoid_`：command toggle、mode selection、配置式开关。
- 命令形式**写死**：空参 = on，`off` = off；不保留 `offline` 别名（`/connect-bot offline` 将作为未知参数报错）。词形机制不做成声明字段。
- 命令可携带自定义 TS（HTTP 调用等）。
- 框架仍拒绝未知参数（面板契约 P3 的「未知参数报错且不改状态」保留）。

### 2. 命令能力落点：框架扩展 + 扩展 handler

- 选框架扩展（Q2a）：新增 `directed` 控制类别；HTTP/omp-bot 协议/三轴业务留在扩展。
- definition 保持**纯数据**（`framework/core/definition.ts:4-8` 的「no raw handler」不变量保留）：命令动作只声明 `{type:"directed", name, state, description}`；handler 由扩展共享 logic 在 assembly 时注入。
- 框架提供：命令注册、参数形式（空参/`off`/未知）、invocation、State 读/写接缝、反馈与 marker 发布。
- 扩展提供：register/unregister HTTP、收据解析、三轴状态机、心跳/队列、主会话与 hasUI 门槛、并发/迟到回执守卫。

### 3. `enabled` 的写入权威与动作顺序

- `enabled` 绑定为 State 字段，但**值由动作结果决定**：register 成功→true、失败→false（含已接入时重注册失败回 false）；offline 无论面板可达与否→false。
- **handler 在 State 写入之前运行，并拥有写**：声明只表达「这条命令拥有哪个字段」。这是为了满足旧行为——offline 的扩展侧过滤必须读**调用前**的 `enabled`（先判断、后置 false、再发请求）；若框架先写 State 再调 handler，第一次 off 就会被过滤掉。
- 过滤不对称：off 受 `enabled` 过滤（未接入 no-op：不请求、不通知）；arm **不设过滤**（已接入时仍重发 register，P2 幂等重连）。
- 并发/迟到回执（在途 register、offline 抢在 register 前、迟到回执）由**扩展 handler 负责**；框架不去重、不串行化、不回收在途动作。

### 4. State 生命周期：in-memory（不持久化）

- `enabled` 用第二条 State 生命周期：`persistence: "memory"`（per-field 声明），只存在于进程内、owner 作用域。
- 不写 session entry、不从分支 seed、不随 restore 复活；owner 被替换时归 default；同身份导航（id 不变）保持。
- 依据：ADR 0002 §State and recovery seam 把 value/ownership/storage medium/restore policy/lifecycle effects 视为不同方面；ADR:118 与 backlog:19 早已把 in-memory 列为 State 存储范围/待定项。

### 5. 持久连接标识：框架 marker

- 连接状态的常驻标识改用**框架统一 marker 区**，由 `enabled` 派生（`framework/behaviors/marker.ts` 的 `registerMarker` 读 `activationField`）。
- marker 文本、与 codebase-tools marker 的共存/排序、发布时机（含 auto-disarm、session-switch 的清除）→《自定义交互和原生能力可以越过哪些边界》。
- 框架需新增「每次写 `enabled` 后发布 marker」的路径（当前只在 command transition + run initiation 发布）。

### 6. 子代理与继承策略：新增 per-field 继承开关，默认不继承

- 问题：`ownerReferenceOf` 对 subagent 返回 `inherited`（`framework/adapters/omp.ts:277-296`），`publishMarkerOnRun` 会把 owner 的 marker 渲染到子代理（`framework/behaviors/marker.ts:82-93`）；若扩展按 State 启动心跳，子代理会跟着上报。旧实现所有 hook 以 `ctx.agent.kind === "main"` 守卫、命令拒绝 subagent。
- 决定：框架 State 增加 **per-field 继承开关，默认「不继承」**。`enabled` 不继承：子代理读到 default（false），效果与 marker 都不激活。
- 连带：`/codebase-tools` 需要显式声明「可继承」以保留「子代理跟随 main 激活值」的既有行为；框架现有 `tests/framework/owner-inheritance.test.ts` 的默认假设与 ADR 0002 §Subagent State inheritance 需要对应更新。
- 通则作为 03/04 输入：持续效果只对 owner 会话启动；marker 只对 owner 渲染。

### 7. agent 工作状态：留在扩展

- 三值（工作/等待/空闲）留在扩展业务逻辑，不进入框架 State。
- 理由：框架 State 目前是单 boolean + command/session-boundary 写路径；放入三值要泛化 `StateValue` 类型链、新增事件写接缝、再加继承策略，净增代码；且无框架消费者（marker 只认 `enabled`，面板经扩展 `state` 事件读取）。
- 三值仍由 `agent_start`/`session_stop`/`agent_end` + 自检门驱动，属《生命周期映射与持续上报由哪一层负责》。

### 8. 文案与通知：不在本票范围

- 用户决定文案/通知约束整体重开，由《自定义交互和原生能力可以越过哪些边界》逐条确认（含 `/connect-bot off` 的反馈、非 2xx/超时的原始码 vs 友好文案）。
- 本票只记录：连接状态的持久标识由 marker 承担；`offline` 成功文案的角色待 04 决定。
- P5 的 hasUI=false 拒绝（stderr、不改状态、不发请求）作为 04 输入。

---

## Decision

为 connect-bot 新增框架控制类别「定向开关」：写死「空参=on、`off`=off」，重复执行重复动作（幂等由扩展保证）；命令绑定 in-memory、默认不继承的 State 字段 `enabled`，其值由扩展 handler 的动作结果决定，handler 在 State 写入前运行并拥有写；连接状态的持久标识由框架 marker 区从 `enabled` 派生；子代理不继承该字段；agent 工作状态与 HTTP/协议/心跳等业务留在扩展；文案/通知集合与 hasUI 门槛另由《自定义交互和原生能力可以越过哪些边界》决定。
