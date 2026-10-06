# 确定指令贡献的时机、提交语义与角色保证

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 01, 03
Lighthouse: [05-contribution-contract](../lighthouse/05-contribution-contract.md)

## Question

如何将 codebase-tools 的 init/reminder 表达为框架管理的指令贡献，在候选 OMP 路径上满足原有持久化、位置、可见性和 developer-role 要求，同时不改写历史？

必须明确：

- 一次“启用轮”的语义时钟与 OMP hook 映射；区分 agent-run initiation、工具续轮和单个模型请求。哪次读取激活值，何时选取 init/reminder？
- 贡献生成、State 中 init 进度更新和 Agent 运行时消息落盘之间的提交关系。遇到 hook 重入、准备失败、取消或恢复时，允许/禁止哪些漏注入或重复行为？以实际 Agent 运行时扩展能力为依据，不承诺不存在的事务原语。
- display、attribution、持久化与最终指令角色分别怎样表达和检查；内部 developer 角色不能替代出站协议证据。必要角色不能满足时的拒绝时机与反馈，不得用 system prompt 改写或 user 消息静默替代。
- 新贡献追加后受到相同历史保护；关闭不清理旧消息、不加取消消息。首版不引入 context 过滤、请求级临时贡献或新的业务提示词。
- 单个扩展内多个规则同时满足时如何决议，以及是否需要检测冲突；不可默默依赖 Agent 运行时注册顺序。只设计本次真实需要的组合范围。

已有政策见 [框架架构决策](../../../docs/adr/0002-semantic-extension-framework.md)，原要求见 [原注入决策](../../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md)，已有角色差异见 [Agent 运行时支持记录](../../../docs/agent-runtime-support.md)。本票决定贡献契约，不实现注入引擎。

## 讨论结论（2026-10-06）

### 1. 贡献角色：接受 Agent 运行时 provider 映射，重述为 agent-runtime-qualified capability

- **事实**：`CustomMessagePayload` 只允许 `customType/content/display/details/attribution`（`tui/src/chat/messages.ts:42-44`），没有角色开关；Agent 运行时内部转 LLM 视图把 custom message 文本转成 `developer`（`coding-agent/src/session/messages.ts:936-940`），但出站 wire role 由 provider 决定。
- **候选路径实测/源码**：deepseek 目录项 `supportsDeveloperRole:false`，openai-completions 将 developer 就地改写为 `user`（`ai/src/providers/openai-completions.ts:2384-2386`）；responses 家族（openai-codex-responses）把 user/developer 历史序列化为 `role:"user"`（`ai/src/providers/openai-shared.ts:2088-2096`）；只有 `systemPrompt`（codex `developerMessages`，`openai-codex/request-transformer.ts:427-435`）能拿 developer，而 01/ADR-0001 排除 system-prompt 改写。
- **缓存**：贡献尾部追加、位置稳定；头部 system prompt 不动；角色就地改写不破坏前缀缓存。ADR-0001 的缓存顾虑针对 system-prompt append，不适用。
- **决定**：贡献契约 = 隐藏（`display:false`）+ 持久化 `custom_message` + 尾部追加；交付角色是 agent-runtime-qualified capability，OMP adapter 按 provider 路径记录实际序列化角色给 08 验收，但不作框架启用/拒绝门槛；codebase-tools 在 OMP 接受 deepseek/openai-codex 的 `user` 交付，其他 Agent 运行时待定。
- **影响**：C9 的角色维度重述为 **agent-runtime-qualified capability**——OMP adapter 按 provider 序列化记录实际角色，codebase-tools 在 OMP 显式接受 `user`，其他 Agent 运行时（如 pi）待定；02 的角色拒绝条款据此改为 agent-runtime-qualified；不引入框架级 `requiredRole` 拒绝机制。ADR-0002/agent-runtime-support 已同步。

### 2. 提交与进度：对话为真相，state 只保留 `{on}`

- **事实**：hook 内 `appendEntry` 与 Agent 运行时 commit 落消息无法事务化；Agent 运行时在同一轮因 systemPrompt override 变化会重入 `before_agent_start`（最多 3 次，`agent-session.ts:499,7321-7350`）；pre-commit 取消会留下“进度已写、消息未落盘”。
- **决定**：drop `initInjected`。`codebase-tools:state` 只写/读 `{on}`；init 进度以当前 branch 是否已有槽位贡献身份（`codebase-tools:init`）为准；贡献决策是“持久化 State + branch 内容”的纯函数，hook 内不推进进度。因此同一轮重入天然幂等（branch 事实不变，最终 attempt 提交同一条消息），pre-commit 取消与 `/tree` 回溯都会自然回到 init。
- **持久化范围变化**：codebase-tools 记为显式单向例外——ADR-0002 的框架默认双向兼容保留给其他迁移；本迁移只要求旧→新（新读旧 `{on}` + 按消息推导进度）；新→旧回退时旧 `parseState` 缺 `initInjected` 回落 `false`，会重复注入一次 init。Destination 与 07/08 的往返验收收窄为“旧写→新读写”。
- **不声称**Agent 运行时事务原语；只需保证同一启用轮至多提交一条槽位贡献。

### 3. 规则数：首版一槽位一规则

每个贡献槽位恰好一条规则；codebase-tools 有 init / reminder 两个槽位，各一条；同一槽位配置多条 = 显式配置错误（经 C14 反馈）；多规则同时命中/优先级能力记入 framework backlog，不在首版设计。

### 4. 时钟与 hook 映射

- “启用轮” = 一次 agent-run initiation（`before_agent_start`，每用户轮至多一次）；工具续轮与每次 provider 请求不重触发；命令轮等不触达 provider 的轮不计。
- off → 无贡献；on + 当前 branch 无 init 消息 → init；on + 已有 init 消息 → reminder；子代理按所属 owner 的当前 on + 自身 branch 推导 init 进度。
- 模型/provider 中途变化不影响 `{on}` 与进度（二者与模型无关）；角色是 agent-runtime-qualified，无按模型重检职责；已落盘消息的角色由当次请求的 provider 映射决定，按路径记录。

### 5. 被否决的替代

- 保持 developer 硬要求：会让 deepseek 主路径不可用，且需要改 02 的 provider 集。
- 框架级 `requiredRole` + 拒绝机制：角色不是共同必须语义；期望角色只作 Agent 运行时限定元数据。
- 框架级删除 `context.required-role` 抽象：会废弃其他 Agent 运行时/扩展可能需要的能力，与 map Notes 冲突。
- flag 为进度真相 / 恢复期对齐回写：对话内容更接近 init 语义，`/tree` 回溯下更自洽。
- 首版支持多规则/优先级：过度设计，记 backlog。
