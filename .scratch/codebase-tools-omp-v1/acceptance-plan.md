# 首版验收矩阵与实施交接门槛

> 状态：已确定（2026-10-07 用户确认）。作为 [确定首版验收矩阵与实施交接门槛](decision/08-acceptance-handoff.md) 的决策附件。
> 本文件是验收与交接**计划**：不代表任何测试已通过、替代扩展已存在、或发行版已获支持。

## 0. 目的

把迁移基线的每项行为映射到消费者可见场景、真实 OMP 路径与证据类型，并给出从本图进入规格 / implementation 票的交接门槛。地图终点是决策记录，验收执行属于 implementation 阶段。

## 1. 固定前提（已 resolved 决策）

- 支持组合：精确 `@oh-my-pi/pi-coding-agent@18.5.0`；修订锚点本地 checkout `9348320`；运行/验收产物 = 隔离精确安装 `@18.5.0`；Windows x64 + Bun 1.4.2。
- provider 代表：`deepseek/deepseek-flash`（主，`openai-completions`，已证 custom 出站 user role；裸别名 = DeepSeek-V4.1-Flash）、`openai-codex/gpt-6-luna`（辅，`openai-codex-responses`，层1 待跑、层2 待真凭据）。
- 隔离：temp `PI_CODING_AGENT_DIR`（凭据落 `<dir>/agent.db`）+ `--no-extensions -e E:/Developer/myhub/my-agent-toolkit/entrypoints/omp` + 受控会话；清掉 `OMP_PROFILE`、`XDG_DATA_HOME`、外部 auth-broker，避免解析偏移。
- State：仅 owner（首版单 main）持有 `{enabled}`；子代理只读实时跟随；`/tree` 只重算 init、不改 `enabled`；落盘 best-effort 不可由扩展断言。
- 贡献：隐藏持久 `custom_message`、尾部追加、`display:false`、`attribution:"agent"`、identity `codebase-tools:init` / `-reminder`；state 只写 `{enabled}`。
- 装载：`entrypoints/omp`；防双注册 = 装载来源互斥（不按名去重）。
- 升级：绿灯不自动认证；维护者显式替换单一支持版本；代码热重载不在首版。

## 2. 两套测试

| 套件 | 目录 | 责任 | 运行时机 |
|---|---|---|---|
| 扩展验收（codebase-tools 消费者可见行为） | `tests/codebase-tools/` | 10 条 oracle + 迁移/切换冒烟 | 开发验收 + 永久回归 |
| 框架能力（C1–C15 必须语义） | `tests/framework/` | C1–C15 不变量、准入/拒绝、历史保护、owner 继承 | 永久 + 候选版本「基本验证」 |

原则：永久测试只断言消费者可见行为 / 必须语义，不 pin 提示词文案、文件布局、转发实现、测试后门；临时探针（`assets/03/`）不当永久回归；mock 不冒充 provider / task / TUI 证据。

## 3. 验收矩阵 A：codebase-tools 消费者可见行为

| ID | 场景 / 条件 | 真实路径 | 证据类型 | 执行者 | 通过判据 |
|---|---|---|---|---|---|
| B1 | 干净会话加载，未 toggle（默认 off） | 主会话 | session JSONL + 出站 | agent | 无贡献、无 marker、出站无 init/reminder |
| B2 | `/codebase-tools` 执行两次 | 主会话 | JSONL state + TUI notify/marker | 用户 | 启用写 `{enabled:true}` + notify `codeBaseTools enabled` + marker 显示；关闭写 `{enabled:false}` + notify `codeBaseTools disabled` + marker 清除 |
| B3 | on 后首个启用轮 | 主会话 | JSONL `custom_message` `codebase-tools:init` + 出站 | agent | 恰好一条 init，`display:false`，`attribution:"agent"`，尾部追加 |
| B4 | 之后每个启用轮 | 主会话 | JSONL `codebase-tools:reminder` + 出站 | agent | 恰好一条 reminder，不被 init 进度干扰 |
| B5 | 注入轮后检查落盘 + resume 重放 | 主会话 + resume | JSONL 形状 + resume 后出站 | agent | customType/可见性/归属/位置正确；随轮落盘，resume 后历史重放仍含该消息 |
| B6 | marker 生命周期 | TUI | TUI 观察 | 用户 | 每启用轮重设；off 清除；`hasUI:false` 整体 no-op |
| B7 | off 后再启用轮 | 主会话 | JSONL + 出站 | agent | off 轮无注入；历史/进度不被清除；再 on 走 reminder（进度保留） |
| B8 | resume / new / fork / `/tree` | 主会话 + 分支 | JSONL branch last-wins | agent | resume 恢复 `{enabled}`；无 entry/非法数据（含旧 `{on}`）→ off；new/fork → off；`/tree` 只重算 init 进度、不改 `enabled` |
| B9 | 内建子代理，main toggle 前后各跑子代理轮 | 真实内建子代理（非 mock） | 子代理 JSONL + 出站 | agent | 实时跟随 owner 当前 `enabled`（非创建快照）；各自 init 进度；`enabled`+无 init→init，`enabled`+有 init→reminder，off→静默 |
| B10 | 两 prompt 资源独立加载 | 装载 | 源 / 测试 | agent | 两个 `.md` 独立按文本 import；不探测 MCP/LSP、不按子代理工具裁剪 |
| B11 | 同一轮重入 / pre-commit 取消后重试 | 主会话 | JSONL custom_message | agent | 同一启用轮 `before_agent_start` 重入不重复注入；取消后 branch 无 init → 重新 init |

## 4. 验收矩阵 B：框架能力 C1–C15

| ID | 能力 | 场景 / 真实路径 | 证据 | 通过判据 |
|---|---|---|---|---|
| C1 | 扩展定义与装配 | 静态 import 边界 + `entrypoints/omp` 真实装载 | import graph / 启动 | shared core/behaviors 不 import Agent 运行时类型；薄入口只 re-export |
| C2 | State | 主会话 + 子代理 | JSONL + 测试 | 按扩展、按 owner 作用域；读/更新面分离；默认 false；非法回落 off |
| C3 | Owner 继承 | 真实内建子代理 | 子代理 JSONL + 出站 | 实时跟随非快照；会话私有值（init 进度）不继承；子代理无写面 |
| C4 | 持久化与恢复 | resume / switch / 分支 | JSONL | 只读写 `{enabled}`；last-wins；从目标 branch seed；不读旧 `{on}`（兼容已放弃） |
| C5 | 控制 + 反馈 | 主会话 + headless | JSONL + TUI + stderr | 命令转移 → 落盘 → marker/notify 顺序确定；无 UI 不崩 |
| C6 | 语义钩子 | 主会话 | 出站请求计数 | session start/switch 与 before_agent_start 映射；每用户轮一次，工具续轮/多模型请求不重触发 |
| C7 | 指令贡献（多槽位） | 主/子代理 | JSONL customType | `tag` 身份 + strategy；init/reminder 独立；一槽位一规则，多规则显式错误 |
| C8 | 提交语义与历史保护 | 主会话 | 出站捕获 diff + JSONL | 只追加、不重写/重排既有条目；隐藏、尾部；resume 重放 |
| C9 | 角色 / 权威 | deepseek + openai-codex 两路径 | 出站捕获 | 角色按 provider 路径**记录为事实**、不作门槛；未测标 unverified |
| C10 | 状态反馈呈现 | TUI + headless | TUI 观察 | 框架统一区、按 `id` 稳定排序、生命周期由 State 驱动、无 UI no-op |
| C11 | 文本资源 | 装载 | 装载证据 | 资源 import 与 Agent 运行时 capability discovery 分离 |
| C12 | 部署 / 发现 | 真实装载 | 启动行为 | 只发现 `entrypoints/omp` 一个实现；外置源码与裸依赖解析成功 |
| C13 | 支持集与升级回归 | 18.5.0 + 未列版本 | 测试 + TUI | 精确版本枚举；未列版本一次通知后继续；必须语义缺失则拒绝 |
| C14 | 能力缺失 / 拒绝反馈 | 隔离 + 可注入测试 adapter | 测试 + UI/stderr | 两触发不混同；无 UI 走 stderr；去重 = 每 main 会话一次；拒绝路径真跑 |
| C15 | 能力与选项清单文档 | `docs/framework-capabilities.md` | 文档审阅 | 列全 `defineExtension` / `ompAdapter` 参数含义、指向源码，不写实现 |

## 5. 失败与拒绝场景

| # | 场景 | 证据 / 通道 | 通过判据 |
|---|---|---|---|
| N1 | 未列版本 | `ctx.ui.notify(warning)` / 无 UI stderr 一行 | 每 main 会话一次；随后继续运行；不声明支持 |
| N2 | 必须语义不满足 | C14 拒绝通道 | 显式拒绝该能力；由可注入测试 adapter 真跑，不静默降级 |
| N3 | 持久化落盘失败 | — | 记「不可由扩展断言」，不得当通过证据 |
| N4 | 子代理 owner 不可解析 / 单独恢复 | 子代理行为 | 降级 off 且不可 toggle；有通道时提示为可选 best-effort |
| N5 | 非法 / 未知 state 数据 | JSONL 读取 | 回落默认 off |
| N6 | 配置冲突（同名命令 / 同字段双写者 / 同槽位多规则） | 启动错误 | 显式配置错误，不静默取其一 |
| N7 | 初始化失败 | 装载行为 | 放弃 binding，不留部分注册 |
| N8 | 两实现同时启用 | 装载来源 | 被来源互斥阻止；不用 `disabledExtensions` / 名称去重 |
| N9 | `hasUI:false` | TUI / headless | marker 整体 no-op；通知走 stderr |
| N10 | 同进程多 main（ACP/cmux/embedded，或 `/new` 后旧子代理存活） | owner 解析 | 不在支持集；按 04 已知限制可能解析到错误 owner，不得作为通过证据 |

> N1 与 N2 是两个独立轴：未列版本不豁免必须语义；N2（必须语义不满足 → 拒绝）优先于 N1 的「继续运行」。C14 两触发与优先级见 [06 lighthouse](../lighthouse/06-framework-interface.md) §5 与 Comments。

## 6. openai-codex 出站证据（两层）

- **层1「OMP 序列化」**：本地 probe，`api="openai-codex-responses"`（复用 03 `provider-ext` 手法；先例 `packages/ai/test/openai-codex-stream.test.ts`）→ 捕获 OMP 生成的请求 JSON。判据：custom 贡献的角色 / 顺序 / 位置 / 工具续轮；标注 **shape-only，不证明真实 provider 接受**。
- **层2「真实送达」**：wizard 在隔离 `PI_CODING_AGENT_DIR` 引导 `omp login openai-codex`（浏览器 OAuth）或 `omp auth-broker import`（凭据落隔离 `agent.db`，secret 不进上下文）→ 真实 run 模型 **`gpt-6-luna`** + `providers.openaiWebsockets="off"` + `PI_REQ_DEBUG=1`（CWD = 隔离捕获目录）→ `rr-session-N.json` 全量请求 JSON + session JSONL。判据：真实 chatgpt.com 往返 + 出站 role/order。
- **WS 备注**：GPT-6 家族默认可能走 WebSocket，`PI_REQ_DEBUG` 只录 SSE；若需独立观察 WS 帧，用 `models.yml` / `registerProvider` 覆盖 baseUrl（非官方 URL 跳过 zstd）到本地反向代理 front `chatgpt.com`；否则 WS 帧记「未独立观察」。
- **不可得时**：凭据或捕获不可得 → 在矩阵与 `docs/agent-runtime-support.md` 记 **unverified**，不阻塞首版、不自动认证；禁止用本地 mock 冒充真实送达。

## 7. 持久化兼容：已放弃（2026-10-07 traverse）

用户显式放弃持久化兼容（旧→新与新→旧都不保证）。不执行旧实现物化、旧写→新读写验证或 `/tree` 迁移回溯，也不要求 JSONL 形状兼容。state 唯一键 = `{enabled}`；验证收窄为新实现自洽（新写 `{enabled}` → 重启/resume 读回 `{enabled}`）。旧 `{on}` 数据不读、旧会话回落 off。见 [05 lighthouse](lighthouse/05-contribution-contract.md) Addendum。

## 8. 部署、防双注册与 cutover 冒烟

- 开发/验收：`omp --no-extensions -e <entrypoints/omp>` + 干净会话 / temp agent state。
- N8：新旧实现绝不同进程同时发现；靠装载来源互斥。
- cutover（验收通过后由用户执行）：删除 `my-omp-toolkit/extensions/codebase-tools` + `config.yml` 加 `entrypoints/omp` 目录条目 + 重启；cutover 后冒烟一次。
- 失败则默认环境与旧实现完好；只承诺整进程重启生效。

## 9. Agent runtime 升级标准与触发

- **长期标准归框架能力**，写进 `docs/agent-runtime-support.md`；扩展能力不在长期标准内，由 `tests/codebase-tools/` + 开发结束用户验收验证。
- **触发**：纯按需 —— 维护者提出候选版本时才跑；默认/CI 只跑已固定 18.5.0。
- **候选「基本验证」**：`OMP_TEST_VERSION=<v>` 在隔离前缀精确安装 + 跑 `tests/framework/`（C1–C15）= 回归警报。
- **扩展回归**：`tests/codebase-tools/` 永久跑。
- **人工 TUI 抽查**：当升级触及扩展可见面（marker 渲染、命令、贡献顺序/角色、恢复）时由维护者追加一次（默认自动）。
- **显式替换**：候选套件 + 抽查通过 → 维护者改 `supportedVersions` + `docs/agent-runtime-support.md` + 重启；绿灯不自动认证。
- 日常 `omp 18.6.1` 不固定，作为「未列版本通知一次 + 继续」的真实隔离验收场景；认证 18.6.1 走上述升级规则按需触发。

## 10. 未验证 / 已知不支持的记录

`docs/agent-runtime-support.md` 用统一状态：`verified-supported` / `verified-unlisted` / `unverified` / `unsupported`，每条带证据与条件；未验证不得当通过证据，不自动扩大支持声明。

## 11. 文档交付

| 产物 | 位置 | 内容 |
|---|---|---|
| README 文档索引 + 升级 runbook | `README.md`（当前不存在，需创建） | 每个文档作用一览；候选版本隔离安装、跑套件、抽查、显式替换的流程与脚本 |
| 升级脚本 | `scripts/`（实施期产出） | 例如 `verify-omp-candidate`（隔离安装 + 跑框架套件）与结果记录 |
| C15 能力与选项清单 | `docs/framework-capabilities.md` | 列全 `defineExtension` / `ompAdapter` 参数含义、指向源码 |
| 版本支持与证据 | `docs/agent-runtime-support.md` | 支持集、证据分级、升级标准、未验证记录 |

## 12. 交接门槛与台账

### 12.1 台账（2026-10-07）

状态 = `decided`（决策已锁定，实施据此执行）或 `blocked`（存在未决的 implementation-blocking 事项）。本台账逐项复核 C1–C15 与公共接口的行为 / 错误 / 顺序 / 环境前提，全部 `decided`，无 `blocked` 项。

| ID | 事项 | 行为 / 错误 / 顺序 / 环境前提（要点） | 依据 | 状态 |
|---|---|---|---|---|
| C1 | 扩展定义与装配 | `entrypoints/omp` 薄入口只 re-export；shared core/behaviors 不 import Agent 运行时类型；显式装配，不改 Agent 源码 | 《确定扩展定义、行为组合与 OMP 适配接口》 | decided |
| C2 | State | 按扩展、按 owner 作用域；读/更新面分离；默认 off；非法数据回落 off；子代理只读 | 《确定 State 归属、会话恢复与子代理实时跟随契约》《确定扩展定义、行为组合与 OMP 适配接口》 | decided |
| C3 | Owner 继承 | owner = 最近 main 祖先；子代理实时跟随非快照；会话私有值（init 进度）不继承；子代理无写面；owner 不可解析 → off 且不可 toggle | 《确定 State 归属、会话恢复与子代理实时跟随契约》 | decided |
| C4 | 持久化与恢复 | `codebase-tools:state` 落 owner 会话 JSONL；只读写 `{enabled}`、不读旧 `{on}`（兼容已放弃）；last-wins；从目标 branch seed；`/tree` 只重算 init、不改 `enabled`；落盘 best-effort 不可由扩展断言 | 《确定 State 归属、会话恢复与子代理实时跟随契约》《确定共享源码装载与实现切换方案》 | decided |
| C5 | 控制 + 反馈 | 命令转移 → 落盘 → marker/notify 顺序确定；`hasUI:false` 不崩、走 stderr | 《确定扩展定义、行为组合与 OMP 适配接口》 | decided |
| C6 | 语义钩子 | session start/switch 与 `before_agent_start` 映射；每用户轮一次；工具续轮 / 多模型请求不重触发 | 《确定扩展定义、行为组合与 OMP 适配接口》《取得不修改 Agent 运行时的 OMP 扩展路径运行证据》 | decided |
| C7 | 指令贡献（多槽位） | `tag` 身份 + strategy；init/reminder 两独立槽位；一槽位一规则，多规则显式错误；隐藏持久 `custom_message` 尾部追加 | 《确定指令贡献的时机、提交语义与角色保证》《确定扩展定义、行为组合与 OMP 适配接口》 | decided |
| C8 | 提交语义与历史保护 | 只追加、不重写 / 不重排既有条目；隐藏、尾部；resume 重放保留 | 《确定指令贡献的时机、提交语义与角色保证》《取得不修改 Agent 运行时的 OMP 扩展路径运行证据》 | decided |
| C9 | 角色 / 权威 | 按 provider 路径记录实际序列化角色为事实，不作启用 / 拒绝门槛；未测路径标 unverified | 《确定指令贡献的时机、提交语义与角色保证》 | decided |
| C10 | 状态反馈呈现 | 框架统一区、按 `id` 稳定排序、生命周期由 State 驱动、无 UI no-op | 《确定扩展定义、行为组合与 OMP 适配接口》 | decided |
| C11 | 文本资源 | 资源 import 与 Agent 运行时 capability discovery 分离；两个 prompt 独立按文本加载 | 《确定扩展定义、行为组合与 OMP 适配接口》《确定首版验收矩阵与实施交接门槛》 | decided |
| C12 | 部署 / 发现 | 只发现 `entrypoints/omp` 一个实现；外置源码与裸依赖解析成功；防双注册靠装载来源互斥 | 《确定共享源码装载与实现切换方案》 | decided |
| C13 | 支持集与升级回归 | 精确版本枚举 18.5.0；未列版本每 main 会话通知一次后继续；必须语义缺失则拒绝；升级按需 + 触及面人工抽查 | 《选择首版 OMP 候选运行组合与支持准入规则》《确定共享源码装载与实现切换方案》《确定首版验收矩阵与实施交接门槛》 | decided |
| C14 | 能力缺失 / 拒绝反馈 | 未列版本与必须语义缺失两触发不混同；必须语义缺失 → 显式拒绝、放弃 binding、不留部分注册；无 UI 走 stderr；可注入 adapter 真跑拒绝路径 | 《确定迁移基线、框架能力契约与行为验收边界》《确定扩展定义、行为组合与 OMP 适配接口》《确定首版验收矩阵与实施交接门槛》 | decided |
| C15 | 能力与选项清单文档 | `docs/framework-capabilities.md` 列全 `defineExtension` / `ompAdapter` 参数含义、指向源码、不写实现 | 《确定扩展定义、行为组合与 OMP 适配接口》《确定首版验收矩阵与实施交接门槛》 | decided |
| P1 | `defineExtension` 接口 | v1 仅 `commandToggle`；`id` / 标签 / 槽位 / strategy / state 契约固定；受约束纯 TS 后门与其他 control kind 延后 | 《确定扩展定义、行为组合与 OMP 适配接口》 | decided |
| P2 | `ompAdapter` 接口 | `ompAdapter(definition, {supportedVersions})`；发现 / 装配 / 拒绝顺序固定；不按名去重 | 《确定扩展定义、行为组合与 OMP 适配接口》《确定共享源码装载与实现切换方案》 | decided |
| P3 | 版本准入与拒绝优先级 | 未列版本：通知一次 + 继续；必须语义缺失：拒绝优先于继续；通知去重 = 每 main 会话一次 | 《选择首版 OMP 候选运行组合与支持准入规则》《确定扩展定义、行为组合与 OMP 适配接口》 | decided |
| P4 | 公共接口错误 / 配置冲突 | 同名命令 / 同字段双写者 / 同槽位多规则 → 启动显式配置错误；初始化失败 → 放弃 binding，不留部分注册 | 《确定扩展定义、行为组合与 OMP 适配接口》 | decided |

> 未列入 `blocked` 的事项说明：openai-codex 层 2 真凭据证据、18.6.1 认证、两套测试、文档产物均为 implementation 阶段执行项，已有明确处理规则（unverified / 按需触发 / `/to-tickets`）；不构成未决的 implementation-blocking 决策。

- **blocker 处理**：每条 `blocked` 提交用户判断；用户认为不阻碍实现 → 可作为显式阻塞项随地图交给实施；用户认为阻碍 → 新增决策票，地图保持 open。当前无 `blocked` 行。
- **退出条件**：台账无未决的 implementation-blocking 项；本计划与文档交付已明确；**不要求**验收已执行或已通过。
- **下一步**：`/to-tickets` 依据本计划与 lighthouse 产出规格与 implementation 票。

## 13. 执行者分工

- **agent（隔离可做）**：隔离安装、探针、层1 捕获、框架套件、扩展套件、迁移自动化步骤、文档撰写。
- **用户**：wizard 提供 openai-codex 凭据、交互 TUI 验收、cutover、blocker 判断、最终支持版本显式替换。
