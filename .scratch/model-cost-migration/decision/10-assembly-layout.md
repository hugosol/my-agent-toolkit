# 确定的新能力与 model-cost 如何组织、声明和装配？

Type: grilling
Status: open
Assignee:
Blocked by: 03, 04, 05, 06, 07, 08, 09
Prerequisites: [framework 如何提供请求、响应、Turn／Run 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)；[/budget 的参数、操作与状态如何在新框架表达？](07-command-state.md)；[动态 widget 属于哪里，如何保证无 UI 也更新业务？](08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](09-refresh-lifecycle.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

将已确认契约映射到现有 framework core／behaviors／adapters 和 extensions/model-cost 的 definition／shared-logic／harnesses／entrypoint。是否需要新的通用能力目录或公共 authoring exports，如何保持原生 import 只在 adapter／extension harnesses？不得建立第二套能力声明、配置或框架。

确定 dependency injection、业务模块拆分、requiredSemantics 与 fail-soft binding、配置路径和消费者迁移职责，冻结源 oracle revision 与依赖来源。现有唯一 boolean State 不应被业务数据冒用。此票产出可实施组织规格，不复制代码、生成空文件或开始实现。
