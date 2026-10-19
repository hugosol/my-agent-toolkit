# 确定 Feedback、Host facts 与 authoring 契约归属

Type: grilling
Status: resolved
Assignee: unassigned
Blocked by: 01
Parent: ../map.md

## Handoff

- 本票完整决定的唯一权威：[Feedback、Host facts 与 authoring 契约归属 Lighthouse](../lighthouse/04-host-feedback-authoring.md)。用户确认 Q17 的具体文件结构，最终对 Q18 回答「同意，请继续」，授权完成规划发布与追溯，不授权生产重构。
- 共同入口组织规则的旧到新修订已回到 [统一 interface 原则权威](../lighthouse/01-shared-interface-policy.md)；本票只引用，不建立另一份共同政策。State 生命周期与 Prompt / Marker 范围继续引用各自权威。
- 无未回答的本票问题。Command 完整 delivery / 运行时隔离、General 操作及错误、残余工具声明与最终实施矩阵仍由各自决策票负责；设计输入不必已经实现，也不代表验收通过。
- 后续按地图 frontier 开始「确定 Command 扩展交付的收窄与运行时隔离」，先读本票 Lighthouse 及它的其他前置权威，再认领访谈；本会话不开始下一票。
- 理由与拒绝分支：按使用职责区分 Command / Subagent / provider facts，不用来源混装 Host facts；同文件集中实际相关代码，不新增 manager、规则引擎或缓存；通知共享底层而非强制抹平上层封装；统一入口组织方式而非复制目录层数。细节只在 Lighthouse。
- 证据范围：静态契约、LSP 引用及源码调用核对；两种 adapter 共用各自 publishNotice 的代码事实；执行模式 coverage 不是某次实际执行，也不是兼容性通过证明。三级严重度依用户明确要求以当前代码为准，未声称完成其引入历史考证。
- 已按用户要求修订 ADR 严重度及共享输出文字。未改生产代码，未运行行为测试、真实 harness 或完整测试。发布链接、状态及追溯结果见 Comments。

## Question

如何补齐 Feedback / Host facts 的 canonical 声明，并确定 implementation context、初始化交付和 authoring 组合入口的职责，使 Command 与最终入口切换有稳定输入？

- CanAcceptInput、SubagentIntegration、SubagentIntegrationFailure 是否归 Host facts；现有 provider/catalog facts 的查询时点与缺失含义如何保持？
- FeedbackTransport 与框架 NoticeTransport 保持怎样的分工，哪些事实/通道只属于 adapter port？
- Feedback 的现有三级严重度与 ADR 较早的两级表述如何核对历史并明确处理，不借目录迁移默默改行为？
- 依统一原则确定哪些 authoring 类型在 assembly / definition，哪些归 capability；本票不能提前批准尚未由 Command / Prompt / Marker 决定的字段。
- retained owner feedback 与 session_end dispatch feedback 的生命期差异如何在公开契约与验收中保留？
- 不为 hand-over 新建缓存、策略或转发实现；若仍只有 transport，说明其 seam 与两个 adapter 的真实用途。

## Comments

### 已确认并发布

- 本轮访谈及最后的 Q18 确认已发布到本票 Lighthouse；Q15 / Q17 对根入口组织的修订已更新原统一原则权威与原票恢复导航，不改变原票 resolved / unassigned 状态。
- 初轮把所有事实放入 Host facts、把空闲查询放入 Session、强制删除 NoticeTransport、仅加规则文档索引等候选均未成为政策；实际获批分支及确认来源见 Lighthouse。
- 下游票的输入在开始或恢复时读取本票权威；本次不复制结果到它们的 Handoff，也不改变它们的 claim、问题或依赖。
- Backtracer 已对新增权威、修订后的统一原则、State / Prompt-Marker 权威及当前各票 Question / 依赖 / 状态完成 intent、pattern、dependency、peer 与 layer-integrity 追溯：未发现新的无主问题或未裁决冲突，不新增报告或票。共同入口组织的旧到新冲突已有 Q15 / Q17 明确裁决并回原权威修订。
- 信号覆盖：受限实际交付和命令查询由「确定 Command 扩展交付的收窄与运行时隔离」继续完成；General 操作/配置可见错误由「确定 General 操作与内部配置 seam 的隔离」提供；残余工具声明、port、旧入口退役、共享文件与验证矩阵由「确定整合顺序、旧入口退役与验收交接」提供；State 句柄生命周期、Session 既有语义和 Prompt / Marker 范围已有对应权威。前述开放提供者不是已实现或已通过验收的证明。
- Peer 检查：沿用 Session 的单一公开入口和受限对象原则，不要求复制其目录层数；新增 Subagent 声明不产生调度或启动层；通知两个 adapter 已共用各自实际输出。实施及验证仍由既有决策范围交接，没有需要从地图 fog 毕业的新问题。
- Bun 文档发布检查已执行：共检查 13 份文档中的 73 个本地链接，失效 0；本票为 resolved / unassigned。实际 frontier 按序为「确定 Command 扩展交付的收窄与运行时隔离」和「确定 General 操作与内部配置 seam 的隔离」；整合票仍等待这两项。其他开放票未认领、未改写其问题或 Handoff。生产迁移、实际对象/行为与两种 harness 验收不在本次发布验证范围内。
