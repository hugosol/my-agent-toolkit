# 确定共享源码装载与旧新扩展可逆切换方案

Type: grilling
Labels: wayfinder:grilling
Status: open
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 03, 06

## Question

如何将本仓库的共享框架和 codebase-tools 装入已选择的 OMP 环境，明确版本与依赖组合，并保证原实现与替代实现可以不转换数据地互斥切换？

必须决定：

- 遵循 ADR 的 framework/extensions/entrypoints 组织，宿主只发现 OMP 薄入口；具体装载配置、路径与依赖解析方式。资源 import 与宿主 capability discovery 不混同。
- 安装/选择哪一份扩展、如何防止双重注册和旧新同时启用；不要求原仓库引用框架或维护迁移指针。
- 重启与 reload 的生效边界，模块缓存和活动子代理对切换的影响；使用已取得的运行证据，不假设热重载等价进程重启。
- 固定原实现修订、替代仓库修订、依赖 lockfile 与宿主组合的方式。
- 同一份实际存储的“旧写→新读写→旧读写→新读”验证步骤及观察点，覆盖开关与 init 进度、会话/分支续用；不把 JSON 外形、备份恢复或一次性导入当作可逆证明。
- 用户执行哪些安装/配置动作，agent 可以在隔离环境执行哪些动作；不能在规划期间改动正式宿主配置或源码。

本票产出部署与切换决策，不执行生产切换；最终端到端证明在替代实现完成后取得。
