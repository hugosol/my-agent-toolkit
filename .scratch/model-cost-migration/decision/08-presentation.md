# 动态 widget 如何分层，无 UI 时哪些业务仍需更新？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 03, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)限定 Session 为适用账户当前周期内跨 Round 的累计、Round 为其中该轮；clear 后 resume 不显示旧周期总数或重估宿主历史。旧归档仅保留可查文件，不默认新增归档 UI／查询命令。
- UI 读取 shared logic 的自身／子代理合计／整体视图，布局和默认展开未定；只保存最近轮、恢复明确叫最近 Round，tree 后该位置轮数值不可用，不显示成零。混账户周期、clear 跨开放 Round 的描述需和观察票一致，不伪造新轮。
- 缺 usage／价格只提示／跳过相应指标，不保持缺失计数或持续完整性标记；有 usage 缺价仍累计 token，失败／取消有可靠 usage 仍累计。提示位置、headless 可观察性仍由本票决定。
- 固定 DeepSeek 450K／Codex 272K 预算显示／告警保留，修改入口移除；入口 detail 切会话／tree 保留、重载 brief。renderer 不维护第二套权威累计或副作用。

## Handoff from storage Q6

[存储局部决议](../lighthouse/06-local-storage.md#q6普通-round_end-保存失败不打断主流程)已确认普通 round_end 保存失败报告而不阻断主流程、不回滚内存、不假报成功；本票决定 UI／headless 反馈承载，不将该策略扩展到 clear 或 estimate。

## Handoff from storage Q10 / Q12

[存储局部决议](../lighthouse/06-local-storage.md)Q12 确认同版本不同内容须报告明确冲突、不假报保存成功；普通 round_end 不因此中止主流程。超时失败沿 Q6 承载，Q10 不是中止代理或文件更新总耗时保证。

## Question

明确动态多行进度条、窗口节奏、费用／余额告警色、Effort 着色、分段条与宽度降级归 extension harness presentation，还是本次抽出 framework 通用展示 capability？现有 marker area 只是框架统一的单行激活标记，不应强塞复杂 widget。

确定 shared logic 提供什么已对齐的展示模型，native renderer 只读取与布局／主题，不在 render 改 lastContextTokens、请求 API、创建 timer 或落盘。明确无 UI／RPC 时必须保留的记账与持久化行为、远端刷新与展示计算是否运行；账户故障保持 widget-only 旧要求与无 UI 可观察性的关系要用户确认。输出具体视觉及 headless 验收场景。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q9/Q10 要求保留双窗口节奏／重置展示、ratio／left、累计与 session 分段条、费用／余额告警、widget-only 请求错误和命令反馈的现状基线；本票承接视觉、宽度降级、标签及无 UI 可观察性取舍，改变需用户确认。新 Turn 是一次 LLM 请求／响应，不含工具执行；Round totals／Session totals 与“旧的 Turn”分开，最终 UI 标签在本票决定。更新由事件触发，结果更新后检查 UI 是否需要渲染，需要则请求一次刷新；无 UI 时是否刷新远端数据尚未决定，原 Question 中的无 UI 更新要求不得视为已经获批的完整策略。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：在适用账户当前周期中能清楚区分主会话自身（排除全部子代理）、每个子代理自身／含后代、主会话含后代的消费；异构子代理和切换前模型不能被当前模式过滤掉源记录。
- 待决定：这些统计以何种视觉和查询入口呈现，本周期聚合与当前 provider 余额／额度如何并列或筛选？保留逐代理聚合查询，不默认加入历史 Turn／Round 明细或归档查询 UI。
- 金额只汇总计费渠道；Codex 美元仅参考，不能进入消费金额总计。未知／额度消费／无统计口径保留领域区别，不标成免费；运行时不维护缺失计数或持续完整性标记，缺 usage／适用价格仅提示／跳过相应指标，有 usage 缺价仍保留 token。具体提示承载与 headless 策略未定。
- 历史消费归属决议曾要求 tree 历史 Round 查询；该要求已由[数据讨论的当前有效决定](12-state-data-contract.md)明确收窄：只保存最近 Round 开始／结束快照，不保留历史 Round 列表；/tree 后 Round 数值隐藏或不可用，Session 累计不回滚，恢复快照明确称为最近 Round，不能冒充当前位置。旧 Lighthouse 当前正文已按用户要求同步，原版保留历史快照；正式数据 Lighthouse 已记录修订。上下文、账户、消费正交，不能累加子代理上下文作主会话预算。无 UI 的具体交互与刷新仍待本票和调度票决定。

## Handoff from state-data discussion

- 用户明确要求 UI 体现主会话自身消耗与子代理消耗区别；按实际会话独立聚合，不从父 Round 总数推算。详细语义及最新决定以[数据讨论](12-state-data-contract.md)为准，此处仅索引需求。
- 本票后续决定主会话自身／子代理汇总／整体合计的布局、逐子代理展开方式及窄宽降级；这次确认不等于布局已批准或 UI 已实现。
- 数据讨论已明确简化缺失事实处理：缺 usage 或计费所需价格时只打印提示并跳过相应指标，不维护缺失计数／持续完整性标记／补账记录。领域文档保留未知、无统计口径等概念供分析，不能因此要求 UI 实现完整状态模型；具体承载提示方式待本票确认。最新替代范围以数据票为准，前部旧交接的持续完整性要求不能覆盖该修订。

