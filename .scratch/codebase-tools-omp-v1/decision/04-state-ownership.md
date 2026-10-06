# 确定 State 归属、会话恢复与子代理实时跟随契约

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 01, 03
Lighthouse: [04-state-ownership](../lighthouse/04-state-ownership.md)

## Question

如何仅使用 OMP extension 可获得的身份和生命周期，建立正确的所属主会话关系，使激活值实时跟随、各会话 init 进度独立、持久化向前兼容且多主会话互不串扰？

必须明确：

- State 的拥有者标识、session 与 agent 身份关系、父链/嵌套子代理映射与注册清理；不能仅用 depth 或进程级全局开关推断 owner。
- 主会话切换、resume、分支/树切换时从何处恢复，哪些原行为保留；开关恢复如何传播给已存在的子代理。
- 子代理首次创建、退出/重建、单独恢复、owner 消失或暂不可用时的策略；子代理侧命令与写入权限。不得默认为整份 State 拷贝、创建时快照或共享写入。
- 当前值、持久化映射和 UI 读取之间的职责；State 更新/持久化失败时对命令反馈和后续读取的契约。不得增加破坏旧实现读取的通用存储封装。
- 在不同 owner 并存、开关 off/on 往返和恢复条件下的可观察不变量；独立 init 进度与指令贡献提交的具体接口交给贡献及接口票对齐。

已确定的范围与持久化原则见 [框架架构决策](../../../docs/adr/0002-semantic-extension-framework.md)；具体旧记录格式只引用 [原状态逻辑](../../../../my-omp-toolkit/extensions/codebase-tools/state.ts)。本票决定契约，不实现 owner 注册表或存储模块。

### 追加约束（来自 [05 贡献契约](../lighthouse/05-contribution-contract.md)，2026-10-06）

- `codebase-tools:state` 只保留 `{on}`；各会话 init 进度不再由 state 字段承载，而由该会话当前 branch 是否已有 `codebase-tools:init` 推导。
- 恢复契约需支持：主/子会话各自按自身 branch 推导 init 进度；owner 的 on 实时跟随（沿用 01/ADR-0002）；`/tree` 回溯后该 branch 无 init 消息则重新 init。
- 持久化范围已收窄为旧→新单向（放弃新→旧回退）；owner/session 恢复不得依赖 `initInjected` 字段。

## Discussion（2026-10-06，grilling + domain-modeling）

### 1. 术语：owner vs parent agent

- **Owner（所属主会话）**：持有 owner 作用域 State 值的会话；对任一会话，owner = 沿 parent 链上溯遇到的最近一个 top-level main 会话（main 的 owner 是它自己）。owner 是该作用域值的唯一持有者与写入者。
- **Parent agent（父代理）**：直接创建子代理的会话（immediate spawner），自身也可能是子代理；只有 depth 1 时与 owner 重合。
- 已写入 [GLOSSARY.md](../../../GLOSSARY.md)。

### 2. State 模型与归属（A 组）

- 只有 owner 持有 owner 作用域的 State；首版 codebase-tools 的 State 只有 `{on}`。
- 子代理对 owner State 只读、**live-follow**（每轮 `before_agent_start` 实时读取 owner 当前值）；不是整份拷贝、不是创建时快照、不是共享写。
- **init 进度不是 State**：按会话自身 branch 是否已有 `codebase-tools:init` 推导，各会话独立，与 `on` 正交。
- 子代理无 `on` 写权限；owner 的 `on` 只能经 owner 会话的显式用户命令变更。
- 子代理不持久化自己的 `{on}`；新实现可读旧子会话 `state` entry，但不作为继承来源。

### 3. 持久化介质与失败契约（B 组）

- 介质 = **嵌入 owner 会话 JSONL 的 host-owned、non-LLM `custom` entry**（`codebase-tools:state`，只 `{on}`）；不引入通用存储封装。
- 失败契约 = **best-effort**：宿主事实为 `appendEntry` sync-void、扩展侧 `ReadonlySessionManager` 不暴露 `flush`/`onPersistenceError`，**扩展无法观测落盘失败**；命令反馈与同进程读取以内存当前值为准；重启后按 branch 尽力恢复，不承诺 durability。
- 首版不实现「内存 / 文件 / JSONL」配置化三后端；保留「当前值 vs 持久化映射」seam，该延后项进 roadmap/backlog。

### 4. owner 身份与解析（C 组）

- owner 键 = owner 会话身份 `{kind:"main", sessionId}`（`getSessionFile()` 作可移植 correlate）；不使用进程级标签 `"Main"`。
- 解析（首版，单 main 支持）：`ctx.agent.parentId`（宿主原生的直接父链）+ 官方注入的 `pi.pi.AgentRegistry`（`get`/`list`）递归到 `kind==="main"`；框架只保留 `Map<ownerKey, StateCell>` 一个 map。
- 嵌套子代理逐级上溯，最终跟随 root owner。
- `/tan`（后台切向 fork，无 `before_subagent_spawn`）：沿用同一 owner-follow 规则；能解析则跟随，否则 off。
- owner 不可解析/不存在 → off + 有通道时一次提示；不读子会话自身 `{on}`。

### 5. 恢复 / 传播 / 清理（D 组）

- 一个活动 cell per binding；`Map<ownerKey, StateCell>` 只保留活动 owner。
- **会话边界**（`session_start`；`session_switch` new|resume|fork；`session_branch` 新身份）→ 从目标 branch 末条 `codebase-tools:state` seed `on`（无则 off），退役旧 cell。binding 的 `agent.id` 仍为 `"Main"`、会话身份变了，故必须 refresh。
- **同一会话存续期** → Map 权威、不重读；`/tree`（同一 sessionId、仅 leaf 变）**不 seed `on`**，只重算 init 进度。
- 传播：子代理每轮读 owner cell，实时跟随；`/new`、`/resume` 视为旧 owner 关闭（宿主已在 `session_before_switch` 后 flush 旧会话；扩展无 flush 接口、无需自写）。
- 清理：`session_shutdown` 注销 binding/解析，**幂等**；revive 的 `session_start` 重新解析 owner（不在 → off）。

### 6. 可观察不变量与已知限制（E 组）

E1–E8 见 [lighthouse](../lighthouse/04-state-ownership.md)。已知限制：首版仅支持单 main；同进程多 main（ACP/cmux/embedded，或 `/new` 后旧子代理存活）因 `"Main"` 槽被覆盖，native 解析可能取到错误 owner → 可能读到错误 State；不承诺支持，roadmap 跟进。

## Decision

只有 owner（最近 main 祖先会话）持有 `{on}` 这一 owner 作用域 State，子代理只读、每轮实时跟随且不可写；State 以 owner 会话 JSONL 的 `codebase-tools:state` 为持久介质（best-effort，扩展不可观测落盘失败）；owner 解析用原生 `parentId` + `pi.pi.AgentRegistry`，框架只维护一个活动 `Map<ownerKey, StateCell>`，在会话边界从目标 branch seed、界内 Map 权威、`/tree` 不刷新 `on`；init 进度按各自 branch 独立推导；首版只支持单 main，多 main 可能解析错误，留待 roadmap。
