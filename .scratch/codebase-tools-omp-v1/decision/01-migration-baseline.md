# 确定 codebase-tools 的迁移基线与行为验收边界

Type: grilling
Labels: wayfinder:grilling
Status: open
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by:

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
