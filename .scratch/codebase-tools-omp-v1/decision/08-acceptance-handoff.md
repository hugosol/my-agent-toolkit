# 确定首版验收矩阵与实施交接门槛

Type: grilling
Labels: wayfinder:grilling
Status: open
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 02, 06, 07

## Question

以哪些消费者可见的场景和证据判定首版完整迁移，以及在什么条件下这张地图已经没有实施前待决定的问题，可以进入规格与 implementation 票阶段？

明确验收计划而非提前宣称通过：

- 将迁移基线中的每项行为映射到共享契约场景、真实 OMP 路径和证据类型；分别覆盖主会话、真实内建子代理、多 owner、恢复/分支、失败/拒绝、off/on、持久化往返、UI 与无 UI 条件。
- 对实际消息顺序、角色、历史不变性和工具续轮设计出站/存储观察；mock runner 不冒充 provider、task 或 TUI 证明。
- 测试结构分两套、分目录、分责任：codebase-tools 扩展验收（消费者可见行为，源自 01 的行为 oracle）与框架能力测试（C1–C15 的必须语义），后者同时充当宿主升级回归警报；永久测试只保留能捕获消费者可见回归的断言，不锁定提示词措辞、文件布局、转发实现或测试后门；临时探针与最终回归的责任分开。
- 新旧实现同时启用被阻止、旧写→新读写迁移后新实现可持续更新数据，以及共享源真实装载都必须有明确验证场景；新→旧回退已由 [05](../lighthouse/05-contribution-contract.md) 移出范围。
- 首版支持集由维护者根据证据批准，测试通过不自动认证宿主升级。如何记录尚未验证与已知不支持、如何触发升级回归检查？
- 能力与选项清单文档存在、可作为人类/agent 的能力入口索引，覆盖框架公开能力入口并指向源码细节。
- 确认所有接口的行为、错误、顺序、环境前提均已决定；不可实现的必要契约仍是阻碍，不以占位代码或缩小测试掩盖。

### 追加约束（来自 [02 决策](../lighthouse/02-candidate-support.md)，backtracer 2026-10-06）

- 首版支持集是**精确版本枚举**，不是版本范围；“维护者批准”只针对逐版本验证过的组合，绿灯测试不自动认证任何宿主升级。
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
