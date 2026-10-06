# 04: 确定 State 归属、会话恢复与子代理实时跟随契约: Lighthouse

> Question and discussion: [04: 确定 State 归属、会话恢复与子代理实时跟随契约](../decision/04-state-ownership.md)

## Question

如何仅使用 OMP extension 可获得的身份和生命周期，建立正确的所属主会话关系，使激活值实时跟随、各会话 init 进度独立、持久化向前兼容且多主会话互不串扰？

必须明确：

- State 的拥有者标识、session 与 agent 身份关系、父链/嵌套子代理映射与注册清理；不能仅用 depth 或进程级全局开关推断 owner。
- 主会话切换、resume、分支/树切换时从何处恢复，哪些原行为保留；开关恢复如何传播给已存在的子代理。
- 子代理首次创建、退出/重建、单独恢复、owner 消失或暂不可用时的策略；子代理侧命令与写入权限。不得默认为整份 State 拷贝、创建时快照或共享写入。
- 当前值、持久化映射和 UI 读取之间的职责；State 更新/持久化失败时对命令反馈和后续读取的契约。不得增加破坏旧实现读取的通用存储封装。
- 在不同 owner 并存、开关 off/on 往返和恢复条件下的可观察不变量；独立 init 进度与指令贡献提交的具体接口交给贡献及接口票对齐。

已确定的范围与持久化原则见 [框架架构决策](../../../docs/adr/0002-semantic-extension-framework.md)；具体旧记录格式只引用 [原状态逻辑](../../../../my-omp-toolkit/extensions/codebase-tools/state.ts)。本票决定契约，不实现 owner 注册表或存储模块。

### 追加约束（来自 [05 贡献契约](05-contribution-contract.md)，2026-10-06）

- `codebase-tools:state` 只保留 `{on}`；各会话 init 进度不再由 state 字段承载，而由该会话当前 branch 是否已有 `codebase-tools:init` 推导。
- 恢复契约需支持：主/子会话各自按自身 branch 推导 init 进度；owner 的 on 实时跟随（沿用 01/ADR-0002）；`/tree` 回溯后该 branch 无 init 消息则重新 init。
- 持久化范围已收窄为旧→新单向（放弃新→旧回退）；owner/session 恢复不得依赖 `initInjected` 字段。

## Discussion

### 1. 术语：owner vs parent agent

引入并写入 [GLOSSARY.md](../../../GLOSSARY.md) 的定义：**Owner（所属主会话）** = 对任一会话，沿 parent 链上溯遇到的最近一个 top-level main 会话（main 的 owner 是它自己），它是 owner 作用域 State 值的唯一持有者与写入者；**Parent agent（父代理）** = 直接创建子代理的会话（immediate spawner），自身也可能是子代理，**仅 depth 1 时与 owner 重合**。这纠正了把 owner 等同于直接父代理的混淆。

### 2. State 模型与归属

只有 owner 持有 owner 作用域的 State；首版 codebase-tools 的 State 只有 `{on}`。子代理对 owner State 只读、live-follow（每轮实时读取 owner 当前值），不是整份拷贝、创建时快照或共享写——沿用 ADR-0002。**init 进度不是 State**：按会话自身 branch 是否已有 `codebase-tools:init` 推导，各会话独立，与 `on` 正交（05 已定）。子代理无 `on` 写权限，owner 的 `on` 只能经 owner 会话的显式用户命令变更；子代理不持久化自己的 `{on}`，新实现可读旧子会话 entry 但不作为继承来源。

### 3. 持久化介质与失败契约

介质 = **嵌入 owner 会话 JSONL 的 agent-runtime-owned、non-LLM `custom` entry**（`codebase-tools:state`，只 `{on}`），保留原持久化契约、不引入通用存储封装。失败契约 = **best-effort**：`appendEntry` 是 sync-void，扩展侧 `ReadonlySessionManager` 不暴露 `flush`/`onPersistenceError`，**扩展无法观测落盘失败**；命令反馈与同进程读取以内存当前值为准，重启后按 branch 尽力恢复，不承诺 durability。「持久化 State + branch 纯函数」是恢复语义，不是运行期同步保证。首版不实现「内存 / 文件 / JSONL」配置化三后端，只保留「当前值 vs 持久化映射」seam；配置化延后进 roadmap。

### 4. owner 身份与解析

owner 键 = owner 会话身份 `{kind:"main", sessionId}`（`getSessionFile()` 作可移植 correlate），不使用进程级标签 `"Main"`。解析用 Agent 运行时原生 `ctx.agent.parentId` + 官方注入的 `pi.pi.AgentRegistry`（`get`/`list`）递归到 `kind==="main"`；框架只保留一个 `Map<ownerKey, StateCell>`，不另维护 agent→binding 表。嵌套子代理逐级上溯，最终跟随 root owner。`/tan`（后台切向 fork，无 `before_subagent_spawn`）沿用同一 owner-follow 规则，解析得到则跟随、否则 off。owner 不可解析/不存在 → off + 有通道时一次提示；不读子会话自身 `{on}`。

### 5. 恢复 / 传播 / 清理

一个活动 cell per binding。**会话边界**（`session_start`；`session_switch` new|resume|fork；`session_branch` 新身份）→ 从目标 branch 末条 `codebase-tools:state` seed `on`（无则 off）、退役旧 cell；binding 的 `agent.id` 仍为 `"Main"`、会话身份已变，故必须 refresh。**同一会话存续期** → Map 权威、不重读；`/tree`（同一 sessionId、仅 leaf 变）**不 seed `on`**，只重算 init 进度。传播靠子代理每轮读取 owner cell，无需推送；`/new`、`/resume` 视为旧 owner 关闭（Agent 运行时已在 `session_before_switch` 后 flush 旧会话，扩展无 flush 接口、无需自写）。清理：`session_shutdown` 注销 binding/解析且幂等；revive 的 `session_start` 重新解析 owner（不在 → off）。

### 6. 可观察不变量与已知限制

不变量见下方清单。已知限制：首版仅支持单 main；同进程多 main（ACP/cmux/embedded，或 `/new` 后旧子代理存活）因 `"Main"` 槽被覆盖，native 解析可能取到错误 owner → 可能读到错误 State；不承诺支持，roadmap 跟进（消歧方案 = 父侧 `before_subagent_spawn` 的 `spawnKey→ownerKey` 边）。

---

## Decision

只有 owner（最近 main 祖先会话）持有 `{enabled}` 这一 owner 作用域 State，子代理只读、每轮实时跟随且不可写；State 以 owner 会话 JSONL 的 `codebase-tools:state` 为持久介质（best-effort，扩展不可观测落盘失败）；owner 解析用原生 `parentId` + `pi.pi.AgentRegistry`，框架只维护一个活动 `Map<ownerKey, StateCell>`，在会话边界从目标 branch seed、界内 Map 权威、`/tree` 不刷新 `enabled`；init 进度按各自 branch 独立推导；首版只支持单 main，多 main 可能解析错误，留待 roadmap。（2026-10-07 traverse：键由 `{on}` 改 `{enabled}`，并放弃持久化兼容；见 Addendum。）

## User stories

1. 作为子代理会话，我想要每轮实时跟随所属 owner 的当前 `on`，以便主会话切换后下一轮即生效、无需重启。
2. 作为 owner 主会话，我想要成为激活 State 的唯一写者，以便子代理不能悄悄改变 owner 的意图。
3. 作为用户，我想要 owner 与每个子代理各自按自己的 branch 推导 init 进度，以便 resume 或 `/tree` 在该 branch 缺少 init 贡献时恰好重新 init。
4. 作为用户，我想要 resume/switch 时从目标会话持久化的 state entry 恢复 `on`，以便之前开着的会话恢复后仍然开着（旧→新向前兼容）。
5. 作为用户，我想要 `/tree` 导航不改变 `on`、只重算 init 进度，以便 State 表现为会话全局变量而非 branch 内容的投影。
6. 作为框架维护者，我想要 State 持久化为 owner 会话 JSONL 里的 `codebase-tools:state` custom entry，以便保留原持久化契约、无需数据转换（旧写→新读写）。
7. 作为框架维护者，我想要 State 在会话边界之间是内存中的单一来源，以便持久化失败不会让读取与当前值不一致。
8. 作为框架维护者，我想要 owner 解析复用 Agent 运行时原生的 parent 链/注册表，以便框架只保留一个 Map、不重新实现 Agent 运行时的 agent 图。
9. 作为用户，我想要 owner 缺失/不可解析时降级为 off（有通道时提示）而不是臆造或串扰，以便多会话隔离永不泄露另一个 owner 的 State。
10. 作为框架维护者，我想要首版只支持单 main 并把多 main 限制记录在案，以便未被支持的并发不被静默宣称。

## Preconditions

- 01 已定 owner 关联替代进程全局 `globalOn`；03 已取得 Agent 运行时身份/生命周期实测事实。
- 05 已定 `codebase-tools:state` 只含 `{on}`、init 进度按 branch 推导、旧→新单向。
- ADR-0002 的 live-follow（禁止整份拷贝/创建时快照/共享写）与历史保护已接受。
- OMP 18.5.0 扩展 API 提供 `ctx.agent.parentId`、`ctx.sessionManager.getBranch()`、`appendEntry`，且 `pi.pi` 暴露 `AgentRegistry`。
- 02 的首版支持组合为单个本地 TUI 会话（单 main）。

## Postconditions

- `codebase-tools:state` 只承载 `{on}`；子代理不写它。
- 框架只维护一个活动 `Map<ownerKey, StateCell>`；ownerKey = owner 会话身份。
- 会话边界从目标 branch 末条 state entry seed `on`（无则 off）；同一会话内 Map 权威；`/tree` 不刷新 `on`。
- 子代理 enabled = owner 当前 cell 值；owner 不可解析 → off、无写权。
- `session_shutdown` 清理幂等；revive 重新解析 owner。
- 同进程多 main 的 owner 消歧在首版明确不支持，写入文档并交 roadmap/backlog。
- 配置化 State 持久化后端（内存/文件/JSONL）延后进 roadmap/backlog；首版只实现 JSONL 映射。

## Invariants

- Owner = 最近 main 祖先；parent agent 仅 depth 1 时等于 owner（沿用 [GLOSSARY.md](../../../GLOSSARY.md) 的 **Owner** / **Parent agent** 条目）。
- `on` 属 owner 作用域；子代理从不拥有或写入它。
- init 进度是 branch 派生、各会话独立，与 `on` 正交；`/tree` 只重算 init。
- live following：无整份拷贝、创建时快照或共享写（ADR-0002）。
- 历史保护：只追加，不清理旧消息、不加取消消息。
- 旧→新向前兼容：新实现读旧 `{on}`，不依赖 `initInjected`。
- 单一来源：会话边界 seed 持久值，界内内存 Map 权威。
- 不修改 Agent 运行时源码；只用扩展接口与 `pi.pi` 注入的 SDK escape hatch（后者限定在 OMP adapter）。

---

## Addendum（2026-10-07 traverse 审计）

- 持久化键 `{on}` / `on` 一律读作 **`{enabled}`**；`codebase-tools:state` payload 为 `{enabled: boolean}`。
- 持久化兼容（两向）已放弃：新实现不读旧 `{on}`，旧会话 resume 回落 off；本文件「旧→新向前兼容」相关表述作废（见 [05 Addendum](05-contribution-contract.md)）。
- owner 不可解析 → off、不可 toggle 是硬契约；有通道时的一次提示为可选 best-effort，不属 06 C14 触发。
