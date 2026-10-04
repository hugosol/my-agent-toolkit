# 确定扩展定义、行为组合与 OMP 适配接口

Type: grilling
Labels: wayfinder:grilling
Status: open
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 04, 05

## Question

用什么小而完整的公共接口，把已决定的 State、控制、恢复、指令贡献与基础反馈组织成一个真正使用框架的 codebase-tools 扩展，而不包装或复制整个原生 ExtensionAPI？

需要决定：

- extension definition 的必要声明，以及哪些内容留在共享 TypeScript 逻辑；以 codebase-tools 的完整定义示例检验作者体验，不提前实现其他扩展的配置语言。
- 语义核心、可复用 behaviors、OMP adapter 和扩展 host assembly 的职责与依赖方向。共享业务逻辑不导入宿主类型，框架不依赖具体扩展。
- State 的读与更新面、恢复/持久化/贡献提交的调用顺序、错误传播与初始化失败清理。将前置契约落实为接口，而非留下实现时自行决定的关键语义。
- command toggle、通知与 above-editor 标记如何由 State 驱动；首次加载、恢复、每轮重设、关闭清除和无 UI 路径如何表达。复杂原生 UI 不升格为通用布局语言。
- 开放哪些原生 escape hatch、哪些属于框架管理的历史影响面，以及能实际执行的保护机制与限制。任意进程内 TypeScript 不宣称被沙箱约束。
- 注册顺序、行为冲突和 State 更新竞争的最小确定性规则；不引入无消费者的 scheduler、通用插件总线或空壳 pi adapter。

本票使用 codebase-design、grilling、domain-modeling。允许接口示例作为讨论资产，不提交运行时实现。若需要交互原型才能判断，另建 prototype 决策票，而不把草稿当成已验收实现。
