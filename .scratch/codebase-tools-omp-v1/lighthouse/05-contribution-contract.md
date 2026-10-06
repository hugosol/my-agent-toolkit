# 05: 确定指令贡献的时机、提交语义与角色保证: Lighthouse

> Question and discussion: [05: 确定指令贡献的时机、提交语义与角色保证](../decision/05-contribution-contract.md)

## Question

如何将 codebase-tools 的 init/reminder 表达为框架管理的指令贡献，在候选 OMP 路径上满足原有持久化、位置、可见性和 developer-role 要求，同时不改写历史？

必须明确：

- 一次“启用轮”的语义时钟与 OMP hook 映射；区分 agent-run initiation、工具续轮和单个模型请求。哪次读取激活值，何时选取 init/reminder？
- 贡献生成、State 中 init 进度更新和宿主消息落盘之间的提交关系。遇到 hook 重入、准备失败、取消或恢复时，允许/禁止哪些漏注入或重复行为？以实际宿主扩展能力为依据，不承诺不存在的事务原语。
- display、attribution、持久化与最终指令角色分别怎样表达和检查；内部 developer 角色不能替代出站协议证据。必要角色不能满足时的拒绝时机与反馈，不得用 system prompt 改写或 user 消息静默替代。
- 新贡献追加后受到相同历史保护；关闭不清理旧消息、不加取消消息。首版不引入 context 过滤、请求级临时贡献或新的业务提示词。
- 单个扩展内多个规则同时满足时如何决议，以及是否需要检测冲突；不可默默依赖宿主注册顺序。只设计本次真实需要的组合范围。

## Discussion

### 1. 贡献角色：host-qualified capability，OMP 显式例外

`CustomMessagePayload` 只允许 `customType/content/display/details/attribution`（`tui/src/chat/messages.ts:42-44`），没有角色开关。宿主内部转 LLM 视图会把 custom message 文本转成 `developer`（`coding-agent/src/session/messages.ts:936-940`），但出站 wire role 由 provider 决定：deepseek 目录项 `supportsDeveloperRole:false`，openai-completions 将 developer 就地改写成 `user`（`ai/src/providers/openai-completions.ts:2384-2386`）；responses 家族（openai-codex-responses）把 user/developer 历史一律序列化为 `role:"user"`（`ai/src/providers/openai-shared.ts:2088-2096`）；只有 `systemPrompt`（codex `developerMessages`，`openai-codex/request-transformer.ts:427-435`）能拿 developer，而 01/ADR-0001 排除 system-prompt 改写。

贡献尾部追加、位置稳定，头部 system prompt 不动，角色就地改写不破坏前缀缓存；ADR-0001 的缓存顾虑只针对 system-prompt append。**决定**：贡献契约 = 隐藏（`display:false`）+ 持久化 `custom_message` + 尾部追加；交付角色是 **host-qualified capability**——OMP adapter 按 provider 路径记录实际序列化角色（deepseek/openai-codex custom message = `user`），codebase-tools 在 OMP 显式接受该交付，其他宿主（如 pi）的角色/权威抽象保持未决；框架共同契约不含 developer 必须语义，也不提供跨宿主 developer 保证。**否决**：框架级删除 `context.required-role` 抽象（会废弃其他宿主/扩展可能需要的能力，与 map Notes 冲突）；保持 developer 硬要求（会让 deepseek 主路径不可用、需改 02 provider 集）；框架级 `requiredRole` + 拒绝机制（角色不是共同必须语义，期望角色只作宿主限定元数据）。

### 2. 提交与进度：对话为真相，state 只保留 `{on}`

hook 内 `appendEntry` 与宿主 commit 落消息无法事务化；宿主在同一轮因 systemPrompt override 变化会重入 `before_agent_start`（最多 3 次，`agent-session.ts:499,7321-7350`）；pre-commit 取消会留下“进度已写、消息未落盘”。**决定**：drop `initInjected`；`codebase-tools:state` 只写/读 `{on}`；init 进度以当前 branch 是否已有槽位贡献身份（`codebase-tools:init`）为准；贡献决策是“持久化 State + branch 内容”的纯函数，hook 内不推进进度。因此同一轮重入天然幂等（branch 事实不变，最终 attempt 提交同一条消息），pre-commit 取消与 `/tree` 回溯都会自然回到 init。**范围变更**：codebase-tools 记为显式单向例外——ADR-0002 的框架默认双向兼容保留给其他迁移，本迁移只要求旧→新（新读旧 `{on}` + 按消息推导进度）；新→旧回退时旧 `parseState` 缺 `initInjected` 回落 `false`，会重复注入一次 init。Destination 与 07/08 的往返验收相应收窄为“旧写→新读写”。**否决**：flag 为进度真相 / 恢复期对齐回写（`/tree` 回溯下不自洽）；延后到 `agent_start` 写 flag。

### 3. 规则数：首版一槽位一规则

每个贡献槽位恰好一条规则；codebase-tools 的 init / reminder 各一条；同一槽位配置多条 = 显式配置错误（经 C14 反馈）；多规则同时命中/优先级能力记入 framework backlog，不在首版设计。ADR-0002 的“不得按宿主注册顺序隐式选择”由此满足。

### 4. 时钟与 hook 映射

“启用轮” = 一次 agent-run initiation（`before_agent_start`，每用户轮至多一次）；工具续轮与每次 provider 请求不重触发；命令轮等不触达 provider 的轮不计。off → 无贡献；on + 当前 branch 无 init 消息 → init；on + 已有 init 消息 → reminder；子代理按所属 owner 的当前 on + 自身 branch 推导 init 进度。模型/provider 中途变化不影响 `{on}` 与进度（二者与模型无关）；角色是 host-qualified，故无按模型重检职责；已落盘消息的角色由当次请求的 provider 映射决定，按路径记录。

---

## Decision

贡献契约 = 隐藏（`display:false`）+ 持久化 `custom_message` + 尾部追加；交付角色是 host-qualified capability——OMP adapter 按 provider 路径记录实际角色，codebase-tools 显式接受 `user`，其他宿主待定，不作框架启用门槛；init 进度以当前 branch 是否已有槽位贡献身份为准，`state` 只保留 `{on}`；首版每个贡献槽位恰好一条规则；持久化保留 ADR-0002 双向默认，codebase-tools 记为显式旧→新单向例外。

## User stories

1. 作为用户，我想要注入的提示词在 TUI 不可见但持久化进历史，以便 resume 时被重放且不占界面。
2. 作为扩展作者，我想要贡献决策只依赖已持久化的 State 与当前 branch 内容，以便 hook 重入、pre-commit 取消和 `/tree` 回溯下不会漏注入或重复注入。
3. 作为框架维护者，我想要 init 进度由“当前 branch 是否已有该槽位贡献身份”推导，以便回退删除消息后语义自洽。
4. 作为用户，我想要 state 只持久化 `{on}` 这个会话级开关，以便不必为 init 维护第二个冗余标志。
5. 作为框架维护者，我想要首版每个槽位恰好一条规则、多命中显式报错，以便不依赖宿主注册顺序。
6. 作为框架维护者，我想要把贡献交付角色做成 host-qualified capability 并按 provider 路径记录实际 wire 角色，以便支持声明不把内部 developer 角色当成跨宿主出站权威。
7. 作为用户，我想要旧实现写下的数据能被新实现继续读写（旧写→新读写），以便迁移不丢业务数据。
8. 作为维护者，我想要“新→旧回退兼容”作为 codebase-tools 的显式例外被排除，以便不再为旧实现回读 `initInjected` 维护兼容投影，同时不改变框架对其他迁移的双向默认。

## Preconditions

- 01 的贡献槽位模型（first-enabled-run / every-enabled-run）与 03 的 hook 事实仍成立。
- 04 提供 owner 关联与恢复契约：子代理按 owner 的当前 on、各自 branch 推导进度。
- OMP 候选 18.5.0 的 `before_agent_start` / `custom_message` / provider 映射行为如 03 与源码证据。
- 用户明确接受：codebase-tools 的新→旧回退不保证；回退旧实现会重复注入一次 init（ADR-0002 框架双向默认不变）。
- 其他宿主的贡献角色/权威语义保持未决，首版不承诺。

## Postconditions

- `codebase-tools:state` 只需 `{on}`；不再写 `initInjected`；init 进度按 branch 消息身份推导。
- 贡献决策是 State + branch 的纯函数；同一启用轮至多一条槽位贡献；重入/取消/`/tree` 回溯语义明确。
- 首版每槽位恰好一条规则；多规则/优先级进 framework backlog。
- provider wire 角色作为 host-qualified capability 按路径记录为 08 验收事实，不作框架启用门槛；其他宿主待定。
- ADR-0002 框架默认双向兼容保留；codebase-tools 记显式旧→新单向例外，07/08 验收相应收窄。
- ADR-0002、host-support `context.required-role`、01/02 Comments 已同步本决策；原仓库 ADR-0001 保持不动。

## Invariants

- 历史保护：只追加，不清理/不加取消消息（沿用 01/ADR-0002）。
- 贡献隐藏性：`display:false`，TUI 不渲染，内容进历史。
- 贡献尾部追加，system prompt 不改写（沿用 ADR-0001 理由）。
- 不声称宿主事务原语；只约定同一启用轮至多一次注入。
- 沿用宿主官方术语与 01 的槽位命名（first-enabled-run / every-enabled-run）。
- 旧→新向前兼容：新实现读旧 `{on}` 并以对话内容推导进度。
- C9 的角色维度重述为 host-qualified capability；ADR-0002 双向持久化默认不变、codebase-tools 为例外；ADR-0002/host-support 已同步，下游以本 lighthouse 为准。
