# 08: 确定首版验收矩阵与实施交接门槛: Lighthouse

> Question and discussion: [08: 确定首版验收矩阵与实施交接门槛](../decision/08-acceptance-handoff.md)

## Question

以哪些消费者可见的场景和证据判定首版完整迁移，以及在什么条件下这张地图已经没有实施前待决定的问题，可以进入规格与 implementation 票阶段？

明确验收计划而非提前宣称通过：

- 将迁移基线中的每项行为映射到共享契约场景、真实 OMP 路径和证据类型；分别覆盖主会话、真实内建子代理、多 owner、恢复/分支、失败/拒绝、off/on、持久化往返、UI 与无 UI 条件。
- 对实际消息顺序、角色、历史不变性和工具续轮设计出站/存储观察；mock runner 不冒充 provider、task 或 TUI 证明。
- 测试结构分两套、分目录、分责任：codebase-tools 扩展验收（消费者可见行为，源自 01 的行为 oracle）与框架能力测试（C1–C15 的必须语义），后者同时充当 Agent 运行时升级回归警报；永久测试只保留能捕获消费者可见回归的断言，不锁定提示词措辞、文件布局、转发实现或测试后门；临时探针与最终回归的责任分开。
- 新旧实现同时启用被阻止、旧写→新读写迁移后新实现可持续更新数据，以及共享源真实装载都必须有明确验证场景；新→旧回退已由 [05](../lighthouse/05-contribution-contract.md) 移出范围。
- 首版支持集由维护者根据证据批准，测试通过不自动认证 Agent 运行时升级。如何记录尚未验证与已知不支持、如何触发升级回归检查？
- 能力与选项清单文档存在、可作为人类/agent 的能力入口索引，覆盖框架公开能力入口并指向源码细节。
- 确认所有接口的行为、错误、顺序、环境前提均已决定；不可实现的必要契约仍是阻碍，不以占位代码或缩小测试掩盖。

本票还携带来自 [02](../lighthouse/02-candidate-support.md)、[03](../lighthouse/03-extension-path-probes.md)、[05](../lighthouse/05-contribution-contract.md)、[04](../lighthouse/04-state-ownership.md)、[07](../lighthouse/07-deployment-cutover.md) 的追加约束，逐条保留在 [决策票 body](../decision/08-acceptance-handoff.md)。

## Discussion

### 1. 验收计划产物与两套测试

选独立计划文档 `.scratch/codebase-tools-omp-v1/acceptance-plan.md`：矩阵行 = 10 条 oracle 行为（B1–B10）+ C1–C15 + 负例（N1–N9），列 = 场景/条件、真实路径、证据类型、执行者；本票 body + lighthouse 只记决策，plan 链接自 ticket 并作为 `/to-tickets` 输入。两套测试落 root `tests/codebase-tools/`（扩展验收）与 `tests/framework/`（框架能力 + 升级回归警报）。拒绝把矩阵直接写进 ticket body（不便评审/延续），也拒绝放进 `docs/` 当长期文档（会与长期升级标准漂移）。

### 2. 长期升级标准只覆盖框架能力

长期标准扩展 `docs/agent-runtime-support.md`，只覆盖框架能力（C1–C15）；具体 extension 能力由扩展 test case + 开发结束用户验收负责。拒绝另建第三个长期文档（违反 ADR-0002 单事实单文档），拒绝把长期标准写成同时包含 extension 能力。

### 3. 升级人工验收边界

默认自动（框架套件 + 扩展套件）；当升级触及扩展可见面（marker 渲染、命令、贡献顺序/角色、恢复）时由维护者追加一次人工 TUI 抽查。拒绝每次升级都重复完整人工 TUI（成本），也拒绝完全不抽查（TUI 视觉是自动套件盲区）。

### 4. 升级触发

纯按需：维护者提出候选版本时才 `OMP_TEST_VERSION=<v>` 隔离安装 + 跑框架套件；默认/CI 只跑固定 18.5.0。拒绝定时/CI 自动跑候选（与 07 默认策略冲突、成本）。日常 18.6.1 不固定，作为「未列版本通知一次 + 继续」的真实隔离验收场景；支持声明只写 18.5.0；认证 18.6.1 走升级规则按需触发。

### 5. 矩阵覆盖与负例

正例矩阵 A（B1–B10）逐条映射 10 条 oracle 行为（默认 off、toggle、init、reminder、交付形态/落盘重放、marker 生命周期、off 语义、恢复/分支、子代理实时跟随、资源独立加载）；矩阵 B（C1–C15）逐项必须语义；负例 N1–N9（未列版本通知、必须语义拒绝、落盘不可断言、owner 不可解析降级 off、非法 state 回落、配置冲突显式错误、初始化失败放弃 binding、双实现互斥、`hasUI:false`）。C14 拒绝路径用可注入测试 adapter 真跑，不只验通道存在。

### 6. openai-codex 出站证据

两层：层1 本地 probe（`api=openai-codex-responses`）捕获 OMP 序列化，标注 shape-only；层2 wizard 在隔离 `PI_CODING_AGENT_DIR` 引导 OAuth 或 `auth-broker import`（secret 不进上下文），真实 run `gpt-6-luna` + `providers.openaiWebsockets="off"` + `PI_REQ_DEBUG=1`，录全量请求 JSON。GPT-6 家族默认可能走 WebSocket，`PI_REQ_DEBUG` 只录 SSE；WS 帧无反向代理时记「未独立观察」。凭据/捕获不可得 → unverified，不阻塞、不自动认证。禁止本地 mock 冒充真实送达证据。

### 7. Provider 模型

主 `deepseek/deepseek-flash`（openai-completions，已证 custom 出站 user role；裸别名 = DeepSeek-V4.1-Flash）；辅 `openai-codex/gpt-6-luna`（openai-codex-responses）。两者在 `oh-my-pi` catalog 已核实存在。

### 8. C15 与文档交付

C15 落 `docs/framework-capabilities.md`（列全 `defineExtension` / `ompAdapter` 参数含义、指向源码、不写实现）。新增文档要求：新建 `README.md` 含各文档作用索引 + 升级 runbook（隔离安装 → 框架套件 → 扩展套件 → 触及面 TUI 抽查 → 显式替换）与 `scripts/`。未验证/不支持用 `docs/agent-runtime-support.md` 四状态记录。

### 9. 交接门槛

台账逐项列出 C1–C15 + 公共接口行为/错误/顺序/环境前提，状态 `decided` / `blocked`；blocker 逐条交用户判断：不阻碍 → 随地图交给实施；阻碍 → 新开决策票、地图保持 open；**不要求**验收已执行。地图结束后 `/to-tickets` 依据 plan + lighthouse 产出规格与 implementation 票。

---

## Decision

锁定首版验收矩阵与实施交接门槛：两套测试分目录、每项行为映射到真实 OMP 路径与证据；openai-codex 分两层证据（层2 用 `gpt-6-luna` 真凭据、不可得记 unverified）；长期升级标准只覆盖框架能力、按需触发、触及面人工抽查；显式 blocker 经用户判断后交接到规格与 implementation。

## User stories

1. 作为框架维护者，我想要一份 `acceptance-plan.md` 把 10 条 oracle 行为与 C1–C15 映射到场景/真实路径/证据/执行者，以便 `/to-tickets` 有稳定输入、实施不在验收定义上临时决定。
2. 作为框架维护者，我想要两套测试分目录（`tests/codebase-tools/`、`tests/framework/`），以便消费者可见行为与框架不变量互不掩盖、框架套件同时作升级回归警报。
3. 作为用户，我想要 codebase-tools 的可见行为在真实交互 TUI 验收，以便 marker/notify/命令切换按真实使用面确认。
4. 作为框架维护者，我想要 openai-codex 出站证据分两层（本地 probe 序列化 + `gpt-6-luna` 真凭据真实送达），以便角色/顺序按 provider 路径记录为事实且不被 mock 冒充。
5. 作为用户，我想要用 wizard 在隔离 agent dir 提供 openai-codex 凭据且 secret 不进上下文，以便真实捕获安全可重复。
6. 作为维护者，我想要长期升级标准只覆盖框架能力（`docs/agent-runtime-support.md`），扩展能力由扩展测试 + 开发结束用户验收，以便具体 extension 不成为长期标准的耦合项。
7. 作为维护者，我想要升级触发为按需、默认/CI 只跑固定 18.5.0，以便小版本更新不拖累开发且绿灯不自动认证。
8. 作为维护者，我想要升级触及扩展可见面时追加一次人工 TUI 抽查，以便 TUI 视觉回归不被自动套件盲区漏掉。
9. 作为用户，我想要日常 18.6.1 不固定并作为未列版本验收场景，以便准入分支有真实证据且支持声明只写 18.5.0。
10. 作为框架维护者，我想要 C14 拒绝路径用可注入测试 adapter 真跑，以便「必须语义缺失 → 拒绝」是被验证的能力而非声明。
11. 作为人类或 agent，我想要 `docs/framework-capabilities.md` 列全公共接口参数含义，以便快速找到能力入口而不必读实现。
12. 作为维护者，我想要新建 `README.md` 含文档索引与升级 runbook（脚本 + 流程），以便升级步骤可重复、文档职责一眼可辨。
13. 作为维护者，我想要显式 blocker 逐条经用户判断后才交接，以便地图不被未决问题悄悄带过、也不因可实施性问题卡死。
14. 作为维护者，我想要未验证/已知不支持用统一四状态记录在 `agent-runtime-support.md`，以便支持声明与证据等级不混淆。

## Preconditions

- 01–07 已 resolved，且冻结 oracle/C1–C15、唯一精确支持组合、探针证据、State/贡献契约、公共接口、部署与升级规则。
- 隔离开关可用：`PI_CODING_AGENT_DIR`、`--no-extensions -e`、`-p`；OMP 18.5.0 隔离精确安装可运行。
- [03](../lighthouse/03-extension-path-probes.md) 已证 SSE 出站序列化与 custom 出站 user role；`PI_REQ_DEBUG` 可录 SSE 全量请求 JSON；`openai-codex-responses` 是一等 Api；`openai-codex` 凭据落隔离 `agent.db`，headless 隔离 run 可消费。
- 本地 `oh-my-pi` checkout 停 @9348320；`my-omp-toolkit@34d7c40` 可物化。
- `deepseek-flash` 与 `gpt-6-luna` 在 catalog 中存在。
- 用户愿意运行 wizard 提供 openai-codex 凭据、做交互 TUI 验收与 cutover。

## Postconditions

- `acceptance-plan.md` 固定为验收/交接计划：B1–B10 / C1–C15 / N1–N9、证据方案与执行者分工成立。
- 测试结构固定：`tests/codebase-tools/` + `tests/framework/`。
- openai-codex 层1/层2 方案固定（含 `gpt-6-luna`、`openaiWebsockets="off"`、`PI_REQ_DEBUG`）；不可得记 unverified。
- 长期升级标准归 `docs/agent-runtime-support.md`、只覆盖框架能力、按需触发、触及面人工抽查、不自动认证。
- `docs/framework-capabilities.md`、`README.md`（索引 + runbook）、`scripts/` 为实施交付物。
- 交接门槛成立：blocker 经用户判断后随地图交接；不要求验收已执行；地图结束后由 `/to-tickets` 产出规格与 implementation 票。

## Invariants

- 地图只产决策，不写框架代码、不执行验收；本票完成 ≠ 测试通过或版本获支持。
- 永久测试只断言消费者可见行为/必须语义，不 pin 文案、布局、转发实现、测试后门。
- 真实 provider 证据不得由 mock 冒充；未测路径标 unverified。
- 支持声明是精确版本枚举、维护者显式决定；绿灯只作回归警报。
- 首版单 main；子代理只读实时跟随；state 只写 `{on}`；历史只追加。
- 隔离：不碰全局安装、正式配置或运行中 agent。
- 术语沿用 [GLOSSARY.md](../../../GLOSSARY.md) 与 [ADR-0002](../../../docs/adr/0002-semantic-extension-framework.md)（Agent runtime / Injected prompt / State / owner）。
- 升级标准只覆盖框架能力，具体 extension 能力不入长期标准。
