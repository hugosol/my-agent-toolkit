# 动态 widget 如何分层，无 UI 时哪些业务仍需更新？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 03, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

明确动态多行进度条、窗口节奏、费用／余额告警色、Effort 着色、分段条与宽度降级归 extension harness presentation，还是本次抽出 framework 通用展示 capability？现有 marker area 只是框架统一的单行激活标记，不应强塞复杂 widget。

确定 shared logic 提供什么已对齐的展示模型，native renderer 只读取与布局／主题，不在 render 改 lastContextTokens、请求 API、创建 timer 或落盘。明确无 UI／RPC 时必须保留的记账与持久化行为、远端刷新与展示计算是否运行；账户故障保持 widget-only 旧要求与无 UI 可观察性的关系要用户确认。输出具体视觉及 headless 验收场景。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q9/Q10 要求保留双窗口节奏／重置展示、ratio／left、累计与 session 分段条、费用／余额告警、widget-only 请求错误和命令反馈的现状基线；本票承接视觉、宽度降级、标签及无 UI 可观察性取舍，改变需用户确认。新 Turn 是一次 LLM 请求／响应，不含工具执行；Round totals／Session totals 与“旧的 Turn”分开，最终 UI 标签在本票决定。更新由事件触发，结果更新后检查 UI 是否需要渲染，需要则请求一次刷新；无 UI 时是否刷新远端数据尚未决定，原 Question 中的无 UI 更新要求不得视为已经获批的完整策略。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：必须能清楚区分主会话自身（排除全部子代理）、每个子代理自身／含后代、主会话含后代的消费；异构子代理和切换前模型不能被当前模式过滤掉源记录。
- 待决定：这些统计以何种视觉和查询入口呈现，历史金额与当前 provider 的余额／额度如何并列或筛选？不能只做一个无法查看明细的 owner 总数。
- 金额只汇总计费渠道；Codex 美元仅参考，不能进入消费金额总计。未知／额度消费／无统计口径各对金额贡献零，保留可同时存在的性质／完整性标记，不标成免费。token 与金额完整性分别表达。
- tree 选中 Round 的响应时显示该 Round 已实际发生的完整累计（中途 Turn 也不截断），输入边界显示目标路径最近已完成 Round；新输入的新 Round 不覆盖旧 Round。上下文、账户、消费正交，不能累加子代理上下文作主会话预算。无 UI 的具体交互与刷新仍待本票和调度票决定。

