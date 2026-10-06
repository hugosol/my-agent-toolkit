# 确定共享源码装载与旧→新单向迁移切换方案

Type: grilling
Labels: wayfinder:grilling
Status: open
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 03, 06

## Question

如何将本仓库的共享框架和 codebase-tools 装入已选择的 OMP 环境，明确版本与依赖组合，并保证从原实现到替代实现可以不转换数据地单向迁移、且两者不同时启用？

必须决定：

- 遵循 ADR 的 framework/extensions/entrypoints 组织，宿主只发现 OMP 薄入口；具体装载配置、路径与依赖解析方式。资源 import 与宿主 capability discovery 不混同。
- 安装/选择哪一份扩展、如何防止双重注册和旧新同时启用；不要求原仓库引用框架或维护迁移指针。
- 重启的生效边界，模块缓存和活动子代理对切换的影响；使用已取得的运行证据，不假设热重载等价进程重启。代码热重载已由 [02](../lighthouse/02-candidate-support.md) 延后到框架 backlog，本票不承诺 reload，只界定 restart 语义。
- 固定原实现修订、替代仓库修订、依赖 lockfile 与宿主组合的方式。
- 同一份实际存储的“旧写→新读写”单向验证步骤及观察点，覆盖开关、init 进度（新实现按 branch 消息身份推导，不再写 `initInjected`）、会话/分支续用；新→旧回退已由 [05](../lighthouse/05-contribution-contract.md) 明确移出范围；不把 JSON 外形、备份恢复或一次性导入当作迁移证明。
- 用户执行哪些安装/配置动作，agent 可以在隔离环境执行哪些动作；不能在规划期间改动正式宿主配置或源码。

### 追加约束（来自 [02 决策](../lighthouse/02-candidate-support.md)，backtracer 2026-10-06）

- 固定的宿主组合就是 02 的唯一支持组合：本地源码 `@oh-my-pi/pi-coding-agent@9348320`（=18.5.0，Windows x64 + Bun 1.4.2）；是精确版本，不是范围。
- 切换方案只承诺 restart 语义；reload 已由 02 延后（见框架 backlog），不得在装载/切换决策里重新引入热重载假设。

本票产出部署与切换决策，不执行生产切换；最终端到端证明在替代实现完成后取得。

### 追加约束（来自 [03 探针](../lighthouse/03-extension-path-probes.md)，backtracer 2026-10-06）

- 03 实测：候选 `@9348320` 的本地源码 checkout **不能直接跑完整会话**——native addon（`pi_natives`）未构建，失败于装载期；`cli.ts --version` 可用不代表可运行。
- 因此本票必须明确并记录“让 02 冻结的基线可运行”的方式：先构建 natives（`bun --cwd=packages/natives run build`，host 走 Cargo/N-API，不需 bazel），还是以隔离精确安装 `@oh-my-pi/pi-coding-agent@18.5.0`（03 已证其关键源文件与 checkout 逐字节一致）作为运行/验收宿主；并说明与 02 “基线=本地源码 checkout”的关系，二者不可含糊并存。
- 防双注册、restart 语义与修订/lockfile 固定均需在选定上述运行宿主后落实。

### 追加约束（来自 [05 贡献契约](../lighthouse/05-contribution-contract.md)，2026-10-06）

- 持久化契约收窄：`codebase-tools:state` 新写只含 `{on}`，不再写 `initInjected`；旧→新向前兼容（新读旧 `{on}` + 按对话推导进度），新→旧回退不再保证。
- 切换方案只需保证旧→新不丢业务数据、两实现不同时启用；不要求同一份存储上旧实现继续更新新实现写下的数据。
- 贡献 wire 角色由 provider 历史序列化决定，部署方案无需为角色做门控；08 记录各路径实测角色。
