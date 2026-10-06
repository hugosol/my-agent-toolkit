# 确定首版验收矩阵与实施交接门槛

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 02, 06, 07

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

### 追加约束（来自 [02 决策](../lighthouse/02-candidate-support.md)，backtracer 2026-10-06）

- 首版支持集是**精确版本枚举**，不是版本范围；“维护者批准”只针对逐版本验证过的组合，绿灯测试不自动认证任何 Agent 运行时升级。
- 验收矩阵需覆盖 02 的准入政策两个分支：未列版本的一次性用户可见通知 + 继续运行；必须语义不满足时的拒绝。
- 基线固定为本地源码 `@oh-my-pi/pi-coding-agent@9348320`（=18.5.0，Windows x64 + Bun 1.4.2）；provider 代表集为 `deepseek/*`（主）+ `openai-codex/*`（辅）。

本票完成只表示验收与交接计划锁定，不表示替代扩展存在、测试已经通过或发行版已获支持。地图结束后再产出实施规格/implementation 票，不在此把 decision 票改成构建任务。

### 追加约束（来自 [03 探针](../lighthouse/03-extension-path-probes.md)，backtracer 2026-10-06）

- 03 已实测 `deepseek/*` 走的 `openai-completions` 出站线格式（custom 贡献为 user role、位置、持久化与重放）。`openai-codex/*` 走 `openai-codex-responses`，**尚未实测**。
- 验收矩阵必须明确：在无真实 `openai-codex` 凭据/授权时，如何取得或替代该 transport 的出站证据；若无法取得，如何记为未验证而不是通过。
- developer-role 的验收证据必须按 provider 路径分别给出，不得用内部角色或 system prompt 代替出站协议证据（与 C9/02 一致）。**已被 [05](../lighthouse/05-contribution-contract.md) 修订：角色按路径记录为事实，不是必须语义或拒绝门槛。**

### 追加约束（来自 [05 贡献契约](../lighthouse/05-contribution-contract.md)，2026-10-06）

- provider wire 角色按路径记录（deepseek 实测 user、openai-codex 未测），记录为事实；`developer` 不再是必须语义或拒绝门槛（修订 01 C9/02 角色条款）。
- init 进度按当前 branch 是否已有 `codebase-tools:init` 推导：必须覆盖 `/tree` 回溯后重新 init、pre-commit 取消后重试 init、同一轮 `before_agent_start` 重入不重复注入。
- 同一启用轮至多一条槽位贡献；同一槽位多条规则=显式错误（C14 反馈）。
- 持久化往返收窄为旧写→新读写；不再要求旧实现读新数据。

### 追加约束（来自 [04 State 归属决策](../lighthouse/04-state-ownership.md)，2026-10-06）

- 首版仅支持单 main：把验收矩阵的「多 owner」理解为「单 owner + 多个子代理」；同进程多 main（ACP/cmux/embedded，或 `/new` 后旧子代理存活）不在支持集，按 04 记录的已知限制判定为「可能解析到错误 owner」，不得作为通过证据。
- 新增验收项：`/tree` 只重算 init 进度、不改变 `on`；owner 不可解析/单独恢复的子代理降级为 off 且不可 toggle；子代理无 `on` 写权。
- owner `on` 恢复：会话边界从目标 branch 末条 `codebase-tools:state` seed；`resume` 后等于该 branch 末条值，无则 off。
- 持久化 best-effort：扩展无法观测落盘失败，记为「不可由扩展断言」，不得作为通过证据。

### 追加约束（来自 [07 部署与切换决策](../lighthouse/07-deployment-cutover.md)，2026-10-06）

- **运行/验收产物**：验收矩阵必须用隔离精确安装 `@oh-my-pi/pi-coding-agent@18.5.0` 作为运行产物；本地 checkout `9348320` 只是修订/源码锚点（开发期假设二者一致）。不得假定 checkout 可直接跑完整会话（natives 未构建、交互 TUI 硬依赖 addon）。
- **装载与防双注册验证**：开发/验收用 explicit-only `omp --no-extensions -e E:/Developer/myhub/my-agent-toolkit/entrypoints/omp` + 干净会话/temp agent state；永久切换 = 验收通过后用户删除旧 `my-omp-toolkit/extensions/codebase-tools` + `config.yml` 加 `entrypoints/omp` 目录条目 + 重启。矩阵须覆盖「两实现不同时启用」与 cutover 冒烟；不得用扩展名去重/`disabledExtensions` 作为互斥手段（加载层无名称去重）。
- **旧写→新读写迁移验证**（07 §5，须纳入矩阵）：用 `@34d7c40` 临时物化旧实现产生真实旧存储 → 同一份存储不转换、新实现 resume → `on` 恢复、branch 已有 init 走 reminder、新版只写 `{on}`；再重启自洽；`/tree` 回溯重新 init 且 `on` 不变。观察点 = session JSONL 条目序列/形状 + resume/TUI + provider 出站捕获。不得以 JSON 外形/备份/一次性导入当证明；不验证新→旧回退。
- **版本升级规则**：候选版本经运行期参数（env `OMP_TEST_VERSION=<v>`）在隔离前缀精确安装并跑整套框架能力测试（C1–C15）=「基本验证」；默认/CI 只跑已固定版本。绿灯只作回归警报、不自动升级支持声明；人工 TUI 验收通过后维护者显式**替换**单一支持版本（`ompAdapter({supportedVersions})` + `docs/agent-runtime-support.md` + 固定记录），restart 生效。矩阵须明确「基本验证」场景清单与未验证/不支持记录方式、升级回归触发条件。
- **干净环境前提**：旧写与新读都在隔离 temp `PI_CODING_AGENT_DIR` + explicit-only 根 + 受控会话运行；不得改动默认全局安装、正式配置或运行中 agent。
- **待判断（07 未定，归 08）**：用户日常 `omp` 为 18.6.1（未列版本，按 02 通知一次后继续），而验收产物是 18.5.0。矩阵需明确：日常运行版本与已验收组合的差异如何记录，是否要求把日常运行也固定到 18.5.0，以及升级规则何时用于认证 18.6.1。

## 讨论结论

### 交付物

本票锁定首版验收矩阵与实施交接门槛，产出 [acceptance-plan.md](../acceptance-plan.md) 作为决策附件；不执行验收、不写框架代码、不认证发行版。

### 已定事项

1. **验收计划产物**：`.scratch/codebase-tools-omp-v1/acceptance-plan.md`；矩阵行 = 10 条 oracle 行为（B1–B10）+ C1–C15 + 负例（N1–N9），列 = 场景/条件、真实路径、证据类型、执行者；本票 body + lighthouse 只记决策，plan 链接自 ticket 并作为 `/to-tickets` 输入。
2. **两套测试**：`tests/codebase-tools/`（消费者可见行为）+ `tests/framework/`（C1–C15 必须语义，兼升级回归警报）；永久测试不 pin 文案/布局/转发实现/测试后门。
3. **长期升级标准只管框架能力**：扩展 `docs/agent-runtime-support.md`；具体 extension 能力由扩展 test case + 开发结束用户验收负责。
4. **升级人工验收边界**：默认自动（框架套件 + 扩展套件）；升级触及扩展可见面（marker 渲染、命令、贡献顺序/角色、恢复）时由维护者追加一次人工 TUI 抽查。
5. **升级触发**：纯按需，维护者提出候选版本时才 `OMP_TEST_VERSION=<v>` 隔离安装 + 跑框架套件；默认/CI 只跑固定 18.5.0。
6. **日常 18.6.1**：不固定，作为「未列版本通知一次 + 继续」的真实隔离验收场景；支持声明只写 18.5.0；认证 18.6.1 走升级规则按需触发。
7. **Provider 模型**：主 `deepseek/deepseek-flash`（openai-completions，已证 custom 出站 user role；裸别名 = DeepSeek-V4.1-Flash）；辅 `openai-codex/gpt-6-luna`（openai-codex-responses）。
8. **openai-codex 证据两层**：层1 本地 probe（`api=openai-codex-responses`，shape-only）；层2 wizard 在隔离 `PI_CODING_AGENT_DIR` 引导 OAuth/导入（secret 不进上下文）→ 真实 run `gpt-6-luna` + `providers.openaiWebsockets="off"` + `PI_REQ_DEBUG=1`；WS 帧无反向代理时记「未独立观察」；不可得记 unverified；禁止 mock 冒充真实送达。
9. **C14 拒绝路径**：用可注入测试 adapter 真跑「必须语义缺失 → 拒绝」，不只验通道存在。
10. **C15 文档**：`docs/framework-capabilities.md`（列全 `defineExtension` / `ompAdapter` 参数含义、指向源码）。
11. **文档交付**：新建 `README.md` 含文档作用索引 + 升级 runbook（脚本/流程）；实施期产出 `scripts/`。
12. **未验证/不支持记录**：`docs/agent-runtime-support.md` 用 `verified-supported` / `verified-unlisted` / `unverified` / `unsupported` 四状态。
13. **交接门槛**：台账逐项列 C1–C15 + 公共接口行为/错误/顺序/环境前提（decided/blocked）；blocker 逐条交用户判断，不阻碍 → 随地图交给实施；阻碍 → 新开决策票、地图保持 open；不要求验收已执行。

### 被否决 / 移出

- 用本地 mock 冒充 openai-codex 真实送达证据。
- 每次升级都重复完整人工 TUI 验收（改为默认自动、触及面抽查）。
- 定时/CI 自动跑候选套件（改为按需）。
- 把日常 omp 固定到 18.5.0，或现在把 18.6.1 纳入支持集。
- 把长期标准写成同时覆盖具体 extension 能力，或另建第三个长期文档。
- 只验 C14 通道存在而不真跑拒绝路径。

## Decision

锁定首版验收矩阵与实施交接门槛：两套测试分目录、每项行为映射到真实 OMP 路径与证据；openai-codex 分两层证据（层2 用 `gpt-6-luna` 真凭据、不可得记 unverified）；长期升级标准只覆盖框架能力、按需触发、触及面人工抽查；显式 blocker 经用户判断后交接到规格与 implementation。

## Comments

- 2026-10-07 backtracer 报告：跨全图追踪 8 张 resolved 决策票 + 8 份 lighthouse，无 open ticket。唯一开放判断（C14「必须语义不满足 → 拒绝」的可观察粒度）经用户判定为**已有决策覆盖、无需新票**：
  - **未列版本分支**已由 [02 lighthouse](../lighthouse/02-candidate-support.md) §4 + [06 lighthouse](../lighthouse/06-framework-interface.md) §5 定案：每个 main 会话一次 `ctx.ui.notify(..., "warning")`（无 UI → stderr 一行）后继续运行、不声明支持。
  - **必须语义不满足分支**已由 01 C14 + 06 §2 定案：显式拒绝该能力、放弃 binding、不留部分注册、走 C14 通道；OMP 18.5.0 已验证，首版不触发。
  - 其余 backtracer 发现均为 implementation 阶段产出（README/scripts、`docs/framework-capabilities.md`、两套测试、wizard 凭据），由 [acceptance-plan.md](../acceptance-plan.md) 指定并交 `/to-tickets`。
  - 结论：无新决策票；地图范围内雾已清空。
