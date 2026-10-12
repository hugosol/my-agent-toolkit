# 确定的新能力与 model-cost 如何组织、声明和装配？

Type: grilling
Status: resolved
Assignee:
Blocked by: 03, 04, 05, 06, 07, 08, 09, 12, 13
Prerequisites: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)；[/budget 的参数、操作与状态如何在新框架表达？](07-command-state.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](09-refresh-lifecycle.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](13-model-catalog-policy.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Lighthouse: [完整组织与装配决议](../lighthouse/10-assembly-layout.md)

## Handoff

- 用户 Q19「确认」授权整票发布；全部规划范围已确认，Lighthouse／原政策修订／Backtracer／发布导航完成。本票 resolved、claim 已释放；没有待继续 grilling 的候选，不把宿主补丁／代码实现未完成当架构问题未决。
- 结果只在 [装配权威](../lighthouse/10-assembly-layout.md)；[本轮确认链与证据](../assets/assembly-confirmation-2026-10-13.md)保存 Q1–Q19 与旧→新。运行时兼容性检查的批准修订在 [support 原主题](../../../framework/docs/harness-support.md#independent-compatibility-verification)，架构修订在 [ADR-0002](../../../docs/adr/0002-semantic-extension-framework.md#model-cost-assembly-revision)。
- 已整合全部 legacy handoff／resume 输入；[发布前完整历史](../assets/assembly-before-publication-2026-10-13.md)保存本票旧 Question／Handoff／Comments、局部 Lighthouse 与相关文档全文。旧“等待前置”“单执行者检测”“Round schema 未决”“退出排空”恢复点不再生效；唯一行为／数据／存储／观察等权威继续约束实现。
- 决策理由：新增 harness 时明确代码位置；Deep Module 隐藏顺序与内部组合；初始化／完整生命周期归 framework；Owner 效果隔离不是所有 extension 的观察限制；共享后端 Seam 减少前端业务测试压力，但不取消原生／视觉验证。
- 拒绝／替代：宿主专属 widget 混装配、业务混 adapter、native helper／旧传输桥接、第二套配置／State／注册系统、逐 handler 能力开关、全 Session 异步保存屏障、复杂动态准入及启动 shape／版本检查、报告门禁、私有焦点／UI 文本、真实常量测试快照与旧生产兼容路径。原来源、独特理由和证据在确认资产／链接历史，原功能保留范围未因此缩减。
- 已确认的实施前置：可靠 OMP 公开 Viewed session 快照与变化出口先行，再 adapter 与公共 marker／前端接线；基线未自动升级。最终 patched revision／版本与完整独立验证、凭据／用户交互、切换／回退是 [什么证据才算完整迁移，如何安全验收并切换？](11-acceptance-cutover.md) 的未答范围，不替其审批，也不改其 status／assignee／Handoff。
- 源 oracle fd3b507f99d11f8a68b63446c45aa911f0ee5c84 已冻结，检查时原工作区干净。新契约优先；运行不跨仓库 import。业务数据不进 boolean State，storageDir 字段局部解析消费存储原主题；同 Session 双执行者按存储 Q26，不新建租约或检测。
- 下一 ready 工作：[什么证据才算完整迁移，如何安全验收并切换？](11-acceptance-cutover.md)。其旧等待提示须在开始时对照实际已发布前置重新计算，不能依旧 Handoff 把已收口的装配误作未决；本会话不认领或解决第二张 HITL 票。
- Backtracer 已完成：逐项抽取本轮九条 user stories、公共入口／native seam／State／scope／测试对称不变量及加载／保存／验证依赖。业务／身份与父子来源由行为、归属、观察、数据提供；传输／持久化由 HTTP／存储提供；首请求与旧结果寿命由认证／刷新／数据提供；视图／marker 与测试意图由展示及验收提供；模型数据由模型票提供。架构原政策已获明确旧→新修订，无待裁决上游冲突。公开宿主出口是已确认实施前置，最终版本／独立报告／消费者回归由验收原 Question 覆盖，不是新增未覆盖决策；不因未实施重开前置票，不写重复 trace 报告、不增重复票或改下游恢复点。
- 最终文档导航 smoke 实际通过：8 个变更文档中的 60 条新增／改变本地链接及 18 个标题锚点有效；工作票只有一个 Handoff 且位于 Question 前，全部前置 resolved，本票 resolved／claim 已释放；实际 frontier 唯一为验收票，仍 open／未认领。旧历史引用按原位置保留，不宣称全仓旧链接已修复。首次内联脚本有语法问题，长命令尝试受 Windows 长度限制；改用自动删除的临时 Bun 脚本后通过，没有永久测试／脚本残留。
- 证据限度：只读源码／图／旧测试入口与 git oracle 事实及文档 smoke；没有运行新实现、真实远端、完整 TUI 或多进程文件验收。既有 18.9.2 controller fixture 探针不是公开出口／18.5.0 支持证明。

## Question

将已确认契约映射到 framework core／behaviors／modules／adapters 与 extensions/model-cost 的 definition／shared-logic／宿主专属实现／薄装配入口／entrypoint。确定小公共 authoring Interface、依赖注入与创建顺序、按范围观察、初始化／恢复／销毁及展示 Seam，保持原生 import 只在既有 adapter／extension harnesses，不建立第二套能力声明、配置或 framework。

确定业务 Module、配置路径、公共 exports、独立验证与开发期必需契约描述的职责、消费者完整迁移与测试回归；冻结源 oracle revision 与依赖来源。既有 boolean State 不冒用为业务容器。此票输出可实施组织规格，不生成空文件或实施生产迁移；宿主公开出口工作、最终支持版本、完整验收与切换按已定前置和验收票继续。

## Comments

本轮逐项确认至 Q19。初始 Q5 的运行时能力准入、Q10 的 UI／headless 动态准入及 Q10a 的轻量启动 guard 建议均被用户的独立验证方案显式替代；当前政策不存在两套并行答案。Q15 后按实际能力选择 Interface，不把所有能力变成读写状态总线。

保留现有消费／命令／展示／刷新／模型规则，新增源码组织与接线取舍；普通切换不销毁 CLI 后端，响应按真实身份记账，Round 保存承接结果而不设置全局屏障，命令仍等真实完成。消费者重构复用有效行为场景，特别保留 connect-bot Owner 隔离，同时撤销 blanket 子代理观察禁令。

事实资产链接与完整旧探索均由上述 Handoff 导航，本文不复制政策或历史大段。未修改其他工作票的恢复上下文或 claim。
