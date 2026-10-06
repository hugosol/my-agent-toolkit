# 确定迁移基线、框架能力契约与行为验收边界

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by:
Lighthouse: [01-migration-baseline](../lighthouse/01-migration-baseline.md)

## Question

选择哪个原实现修订作为可逆迁移基线，并如何区分必须保持的业务行为、陈旧描述和既有架构明确要求纠正的行为？

讨论必须覆盖：

- 以原实现、原文档和实际运行证据建立完整行为验收清单：默认关闭、命令切换、init/reminder 时机、提示词资源、标记、隐藏持久化消息、会话/当前分支恢复及子代理行为。明确“启用轮”所指的事件，不混同每次模型请求。
- 两份提示词当前内容相同，而原术语表仍描述 reminder 为 init 的引用。迁移不借机改写提示词，确定采用的实际内容与陈旧说明的处理。
- 原实现的进程级开关不是框架 owner 机制；按 owner 隔离已由架构确定。明确此有意差异的验收边界，以及哪些子代理写入/恢复问题交给后续 State 决策，不能将未决定行为称作兼容。
- 固定需保留的持久化契约来源，不在这里创造通用 schema 或版本迁移；旧新双向往返验证沿用架构要求。
- 区分原测试的业务断言与绑定旧文案/实现的断言，不能以照搬全部测试代替行为验收。

### 起始证据与入口

绘图时原仓库 HEAD 为 `34d7c4061a74a73b478067882cba7956821f3c1d`，是观察值，尚非用户选定的迁移基线；实际工作时核对文件与该修订的关系。

- [原扩展说明](../../../../my-omp-toolkit/extensions/codebase-tools/README.md)
- [原术语](../../../../my-omp-toolkit/extensions/codebase-tools/GLOSSARY.md)
- [原注入决策](../../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md)
- [原扩展工厂](../../../../my-omp-toolkit/extensions/codebase-tools/index.ts)、[状态逻辑](../../../../my-omp-toolkit/extensions/codebase-tools/state.ts)
- [首次提示词](../../../../my-omp-toolkit/extensions/codebase-tools/prompts/init.md)、[后续提示词](../../../../my-omp-toolkit/extensions/codebase-tools/prompts/reminder.md)
- [原测试目录](../../../../my-omp-toolkit/tests/codebase-tools/)

本票锁定迁移契约，不修改原扩展，不实施替代版本。

## 讨论结论

### 1. 交付物重定义（Q6/Q7）

本票的重点契约来源是**框架承诺实现的能力**；codebase-tools 的具体行为是清晰的需求 oracle，只需冻结、不重新设计。因此本票产出两层：

1. **需求 oracle**：codebase-tools @ `34d7c40` 的行为与持久化契约，作为验收标尺。
2. **决策内容**：由它倒推的**框架能力契约清单（C1–C15）**，含每项能力的必须语义、边界与拒绝条件；细节分别在 04–08 落地。

标题相应改为“确定迁移基线、框架能力契约与行为验收边界”。

### 2. 迁移基线（Q1）

锁定 `my-omp-toolkit` 的 `34d7c4061a74a73b478067882cba7956821f3c1d`（当前 HEAD，工作区干净，无 tag）作为可逆迁移基线；连同 dependency lockfile 一起记录来源组合（ADR-0002）。该修订即需求 oracle 的冻结点。

### 3. “启用轮”的事件语义（Q2/Q8）

核实 OMP extension 事件 `before_agent_start`（`extensibility/extensions/types.ts:842`）：*"Fired before an ordinary prompt or an actually dequeued user-containing batch reaches the provider."* 触发点在 `session/agent-session.ts:7327` 的 `#prepareAgentStart`，只有两个调用方——直接提交（`:7513`）与排队含用户消息批次（`:7288`）。工具续轮与同一 run 内的多次 provider 请求**不**重新经过它。

结论：**“启用轮” = 一次 agent-run initiation（用户提交的一轮）**，每用户轮至多注入一次；不与每次模型请求混同。原 `/codebase-tools` 在此钩子只做三件事：决定并返回本轮 instruction contribution、on 时重设 aboveEditor marker、仅 init 被注入时把 `initInjected=true` 写回 state。

### 4. 必须保持的行为 oracle（Q3/Q9）

以下 10 条为 codebase-tools 的消费者可见契约（Q3 大部分已确认；第 5 条按“交付形态”修正）：

1. 默认 off：不注入、无 marker。
2. `/codebase-tools` 每次执行翻转 on/off；写 `codebase-tools:state`；`notify`；on 立即显示 marker，off 清除。
3. 某会话首个启用轮注入 init，并写回 `initInjected=true`。
4. 之后每个启用轮注入 reminder。
5. **交付形态**：`before_agent_start` 返回 message；`customType` = `codebase-tools:init` / `codebase-tools:reminder`；`display:false`；`attribution:"agent"`；随该轮落盘、resume 重放。这不是扩展初始化时的行为。
6. marker：`◈ codeBaseTools`，aboveEditor，每启用轮重设，off 清除。
7. off 语义：只停止注入；不清历史、不注入取消、不重置 `initInjected`。
8. 恢复：`session_start`/`session_switch` 读当前 branch，last entry wins；无 entry=off；`new`/`fork` 因此 off，`resume` 恢复 `{on, initInjected}`；非法数据回落 off。
9. 子代理：实时跟随所属主会话**当前** on（非创建时快照）；各自维护 `initInjected`；on+false→init，on+true→reminder，off→静默。
10. 提示词资源：两文件独立按文本 import，扩展只按时机选用其一；不探测 MCP/LSP，不按子代理工具裁剪。

其中第 5 条的 developer-role 只是原实现的声明；OMP provider 级角色未证实——保留为要求，机制证据归 05/03，不计入“已验证兼容”。

### 5. 贡献通道模型（Q4/Q8）

init 与 reminder 是两个**独立的贡献槽位**，各自有激活条件与内容配置：
- `first-enabled-run`：会话首个启用轮。
- `every-enabled-run`：之后每个启用轮。

槽位/时机、激活条件、内容来源由扩展定义声明。codebase-tools 里两个槽位文本恰好相同是**巧合**，不是合并通道的理由；旧 glossary 的错只在于把 reminder 内容描述成“一行指针”。

### 6. 陈旧描述与提示词内容（Q4）

`prompts/init.md` 与 `prompts/reminder.md` 当前内容完全相同（两行文本），但原 `GLOSSARY.md` 与 `prompts.ts` 注释把 reminder 描述成指向 `【codeBaseTools 路由】` token 的一行指针，属原仓库文档缺陷。迁移以**实际运行内容**为准，**不借迁移改写提示词**；不在本图修原仓库文档（原仓库保持独立）。

### 7. Owner 隔离验收边界（Q5）

- **保持的语义**：子代理实时跟随所属主会话当前 on；各会话 init 进度独立。
- **有意差异（纠正实现，保持语义）**：以 owner 关联替代进程级 `globalOn`；不得再用进程全局近似 owner。
- **移交 04**：owner 身份映射、子代理写权限、owner 消失、child 单独恢复/重建、多主会话隔离、session/branch 恢复细节。
- 上述未决定部分**不得称为“兼容”**。

### 8. 持久化契约来源（Q6）

来源 = 原实现 `state.ts`（customType `codebase-tools:state`、字段 `{on, initInjected}`、last-wins、非布尔回落默认）+ 注入消息身份（`codebase-tools:init` / `-reminder`、`display:false`、`attribution:"agent"`）+ ADR-0001。本票只固定**来源与需保留的标识/字段/恢复语义**，不在此创造通用 schema 或版本迁移。双向往返按 ADR-0002 在同一份真实 session entry 上做（旧写→新读写→旧读写→新读），具体步骤归 07/08。

### 9. 框架能力契约清单（Q9 + 新增）

| # | 框架能力 | codebase-tools 触发需求 | 必须语义边界 | 细化票 |
|---|---|---|---|---|
| C1 | 扩展定义与 Agent 运行时装配 | 命令+状态+贡献+标记+Agent 运行时集成 | 共享逻辑不 import Agent 运行时类型；一 Agent 运行时一薄入口 | 06/07 |
| C2 | State（当前值源） | `on` / `initInjected` | 按扩展、按 owner 作用域；读/更新面分离；默认/类型/恢复 | 04 |
| C3 | Owner 继承 | 子代理跟随主会话 on，init 独立 | 声明式继承关系；实时跟随非快照；会话私有值不继承 | 04 |
| C4 | 持久化与恢复 | `codebase-tools:state`、last-wins、start/switch 恢复 | 存储映射保留原契约；双向可逆；不引入通用 schema/版本 | 04/07/08 |
| C5 | 控制+反馈 | `/codebase-tools` 切换 + notify | 命令切换、状态落盘、反馈由 State 驱动 | 06 |
| C6 | 语义钩子 | session start/switch、每轮 start | 框架定义语义钩子；Agent 运行时 adapter 映射原生事件 | 06/07 |
| C7 | 指令贡献（多槽位） | init 槽 + reminder 槽 | 槽位/时机、激活条件、内容、可见性、角色、保留 | 05 |
| C8 | 提交语义与历史保护 | 追加、不重写历史 | 生成/状态更新/落盘的提交关系；漏注入/重复边界；只追加 | 05 |
| C9 | 角色/权威保证 | developer-role 要求 | 必须语义不可静默降级；不满足则拒绝 | 05/03 |
| C10 | 状态反馈呈现 | `◈ codeBaseTools` aboveEditor | 基本反馈由 State 驱动；复杂布局属扩展 Agent 运行时实现 | 06/07 |
| C11 | 文本资源 | 两个 `.md` 独立 import | 资源加载能力；与 Agent 运行时 capability discovery 分离 | 07 |
| C12 | 部署/发现 | 独立 extension 装载 | 薄入口+共享源码 import+禁双注册 | 07 |
| C13 | 支持集与升级回归 | 明确的 OMP 候选组合 | 只承诺已验证组合；不满足必要语义则拒绝/报告阻碍 | 02/08 |
| C14 | 能力缺失/拒绝的显式反馈通道 | Agent 运行时无法满足必须语义时的提示 | 必须走 Agent 运行时通道显式提示；不得写模型指令或会话历史；传输/去重/触发条件待定 | 新增票（01 后建） |
| C15 | 能力与选项清单文档 | 人类/agent 快速理解能力入口 | 交付一份 md 使用说明作为能力入口索引，细节指向源码 | 规格阶段 |

只含 codebase-tools 实际需要的能力，不预埋其他扩展能力。

### 10. 拒绝而不降级总原则（Q9）

每项能力声明“必须语义”；Agent 运行时不能满足时**拒绝或报告阻碍，不静默降级、不用弱语义替代**。C14 的具体提示方式尚未决定：01 只锁“框架必须提供该反馈能力且走非模型通道”，具体设计由新票承接。

### 11. 测试结构：两个维度、两个目录（Q10）

原测试**可以搬过来作为 codebase-tools 的验收**，但框架在讨论中确立的约束需要**另一份测试**验证框架能力；两者责任不同，test case 放不同目录：

- **扩展验收测试（codebase-tools 维度）**：验证 codebase-tools 的消费者可见行为（上述 10 条 oracle）。搬移时只适配测试 Agent 运行时（`globalOn`/`__resetCodebaseToolsForTests` 等旧机制被 owner 关联替代），不修改行为断言；`smoke-omp.ts` 的真 loader 场景价值归 03 探针与 08 验收矩阵，不作为行为单测保留。
- **框架能力测试（框架维度）**：验证 C1–C15 的必须语义/不变量（owner 继承、贡献提交与历史保护、拒绝/反馈、持久化往返、资源与发现），独立于单个扩展，并作为 Agent 运行时升级回归警报（ADR-0002 第九范围）。

丢弃/重写绑定旧实现的断言：`name === "codeBaseTools"` 源码 pin、依赖 `__resetCodebaseToolsForTests`/模块级 `globalOn` 的机制、widget 精确 `key`/`placement` 字段 pin、测试 harness 内部桩件。永久测试只断言消费者可见行为，不 pin 源码文案/模块形状/测试后门。

## Comments

- 2026-10-05 backtracer 审计：本票 lighthouse 暴露 3 个缺口——C14 能力缺失/拒绝的显式反馈、C15 能力与选项清单文档、扩展验收与框架能力两套测试结构。经用户判断不新建票，改为显式折入既有未解决票：C14+C15 → 06（公共接口/基础反馈/agent-runtime assembly 与公开面文档约束）、两套测试结构 → 08（验收矩阵）。缺口信号已被这些票覆盖，未产生新票。
- 2026-10-06 05 取代：本票 C9 的 developer 必须语义改为 **agent-runtime-qualified capability**——OMP adapter 按 provider 序列化记录实际角色，codebase-tools 在 OMP 显式接受 `user` 交付，其他 Agent 运行时待定（见 05 lighthouse、ADR-0002、agent-runtime-support `context.required-role`）。本票 oracle 第 3 条「首个启用轮写回 `initInjected=true`」被 05 改为 state 只保留 `{on}`、init 进度按 branch 贡献身份推导；持久化双向兼容保留为框架默认，codebase-tools 记显式单向例外（ADR-0002）。本票作为历史记录保留。
