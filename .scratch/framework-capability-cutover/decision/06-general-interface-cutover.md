# 确定 General 操作与内部配置 seam 的隔离

Type: grilling
Status: resolved
Assignee: unassigned
Blocked by: 01
Parent: ../map.md

## Handoff

- 完整确认结果的唯一权威：[General 通用模块的最小公开 interface Lighthouse](../lighthouse/06-general-interface-cutover.md)。用户对最终 Q13 回答「同意」，本票全部问题已决定，无待答候选或下一轮访谈。
- 配置只读的旧到新修订已回原 [统一 interface 原则 Lighthouse](../lighthouse/01-shared-interface-policy.md#扩展可见性与实际对象同步收窄) 发布；不在本票另立政策。配置声明及 context 归属继续消费 [authoring 权威](../lighthouse/04-host-feedback-authoring.md)。
- 下一张可认领的是 [确定整合顺序、旧入口退役与验收交接](07-cutover-integration-plan.md)：汇总各已发布权威，决定残余声明/内部 port 归属、真实依赖顺序、验证矩阵、文档更新与最终旧入口退役；本轮不认领或解决该票。
- 关键取舍与拒绝分支：区分 adapter-backed capability 和独立通用模块；General 只作导航，不新增 adapter 或注入对象。三个直接入口不加汇总转发，尽量保持既有实现。冻结配置的推荐已被用户明确拒绝，不是待实施事项；model-cost 自有诊断 helper，不新增 framework 公共工具。
- 只读证据：核对 public、HTTP/文件选项与错误及函数出口、配置读取/缓存/getConfig、ImplementationContext，并搜索真实扩展消费者。core/config 当前直接交付缓存普通对象，未冻结；不把类型只读误写成运行时保护。详细范围与消费者见 Lighthouse 的证据段，实施时需重扫，静态搜索不证明未来零调用。
- Backtracer 已追溯共同原则、authoring、现有 State/Command 隔离要求和地图全部票据覆盖；未发现新增无主问题或待裁决冲突。配置修订有明确批准且限于配置，其他 capability 隔离不变；真实驱动、最小验证 seam 与文档/入口收尾已在整合票现有验证策略和迁移范围内，不另建重复票。
- 原“公开范围确定后再明确验证驱动”的 fog 已由现有整合票拥有，不再作为未指定迷雾重复保存；无新增票，不改其他票的 Question、恢复上下文或 claim。
- 本票仅规划；未修改生产代码，未运行 HTTP/文件/配置行为测试或 harness smoke。文档链接及状态发布核验见 Comments，不替代实施验收。

## Question

HTTP、协调文件更新与 Extension configuration 各自应公开哪些操作/选项/错误，如何让扩展只从 General interface 使用已有深实现？

- HttpRequestOptions、文件更新选项与错误、配置声明/可见错误的 canonical 所有权怎样确定；运行时值使用统一原则的精确入口例外。
- ConfigReader、ConfigSource、readConfig、readConfigDocument、parser/transport 工厂等如何保留为内部 seam？ConfigLoadError 与 ExtensionConfigError 分别由谁观察，不能整体搬出 core/config。
- model-cost 从 core/config 导入 describeValue 用于业务文档诊断，应如何退出该依赖？候选是扩展自有小 helper；不是已批准新增公共工具。
- 区分 Extension configuration 与 Shared configuration；代理表、runtimeDir、pi 子代理配置不因此成为扩展可读的配置 interface。
- 保持 HTTP 代理/超时/错误语义、文件锁内重读/跨进程协调/原子发布/失败分类、配置读取校验时序。不把缓存时序收敛捆绑进本次契约切换。
- 确定真实 HTTP、跨进程文件操作与配置错误的验证方式，不把再导出测试当作行为证明。

## Comments

### 已确认并发布

- Q5 用户确认 capability 与通用模块的区分，并要求「只暴露interface，其他部分没什么变化」；Q6 强调「通用模块的部分尽量不要修改原有的逻辑」；Q7–Q9、Q11 同意相应公开清单、内部 seam、helper 退出、入口组织与验收方向。完整确认来源与规则只存 Lighthouse。
- Q10 用户拒绝配置冻结推荐；Q12 明确展示归属文件 `01-shared-interface-policy.md` 的有限修订，经解释类型只读与运行时防护后，用户回答「不需要运行时防护」。最终 Q13 列出全部范围与发布动作，用户「同意」。共同原则原票状态/assignee 保持不变，只更新其 Lighthouse 和地图索引。
- 已更新 framework 领域词汇的 Framework capability / Framework general module 区分；相关架构文档的目标目录、General 表述与导航更新仍交整合实施计划，不声称已落地。
- Backtracer 的 intent 信号（最小公开操作、配置读取、保留既有逻辑、诊断 helper 退出、消费者迁移和真实验收）由共同原则、authoring 与整合票分别提供前提和出口；pattern 信号（canonical 所有权、普通函数、内部 seam、无兼容转发）与既有权威一致，不机械套用 Session 对象隔离到普通函数模块。dependency/layer/peer 检查无新 gap 或未批准冲突；不修改下游票。
- Bun 发布核验通过：检查地图、本票、共同原则 Lighthouse、General Lighthouse 与 framework 词汇共 5 份文档，37 个本地链接及其片段目标存在；General Lighthouse 必需章节齐全，本票只有一个位于 Question 前的 Handoff，状态为 resolved / unassigned。当前唯一 frontier 为「确定整合顺序、旧入口退役与验收交接」。本次无失败项；该核验不替代生产重构、行为测试或 harness 验收。
