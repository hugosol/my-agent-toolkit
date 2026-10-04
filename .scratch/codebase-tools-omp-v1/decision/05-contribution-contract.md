# 确定指令贡献的时机、提交语义与角色保证

Type: grilling
Labels: wayfinder:grilling
Status: open
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 01, 03

## Question

如何将 codebase-tools 的 init/reminder 表达为框架管理的指令贡献，在候选 OMP 路径上满足原有持久化、位置、可见性和 developer-role 要求，同时不改写历史？

必须明确：

- 一次“启用轮”的语义时钟与 OMP hook 映射；区分 agent-run initiation、工具续轮和单个模型请求。哪次读取激活值，何时选取 init/reminder？
- 贡献生成、State 中 init 进度更新和宿主消息落盘之间的提交关系。遇到 hook 重入、准备失败、取消或恢复时，允许/禁止哪些漏注入或重复行为？以实际宿主扩展能力为依据，不承诺不存在的事务原语。
- display、attribution、持久化与最终指令角色分别怎样表达和检查；内部 developer 角色不能替代出站协议证据。必要角色不能满足时的拒绝时机与反馈，不得用 system prompt 改写或 user 消息静默替代。
- 新贡献追加后受到相同历史保护；关闭不清理旧消息、不加取消消息。首版不引入 context 过滤、请求级临时贡献或新的业务提示词。
- 单个扩展内多个规则同时满足时如何决议，以及是否需要检测冲突；不可默默依赖宿主注册顺序。只设计本次真实需要的组合范围。

已有政策见 [框架架构决策](../../../docs/adr/0002-semantic-extension-framework.md)，原要求见 [原注入决策](../../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md)，已有角色差异见 [宿主支持记录](../../../docs/host-support.md)。本票决定贡献契约，不实现注入引擎。
