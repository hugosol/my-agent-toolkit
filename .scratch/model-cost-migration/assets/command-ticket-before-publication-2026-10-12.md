# 命令票本轮发布前恢复上下文

此快照只保留旧交接及独有理由；最新批准规则以原 Lighthouse 为准。账号分区／定点 clear 等被本轮修订的旧文字不再是当前要求。

# /budget 的参数、操作与状态如何在新框架表达？

Type: grilling
Status: claimed
Assignee: hugos（本会话 agent 协助讨论）
Blocked by: 01, 06, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- 最终行为见[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)：只提供账户级 clear，不提供会话树级 clear；先归档，再重置目标账户周期并关闭 holiday，空消费也能通过 clear 结束 holiday。旧树级与不清 holiday 的建议不再有效。
- 数字／K／0 预算修改取消；detail／holiday／clear 保留。detail 入口内存，切会话／tree 保留，重载回 brief；不清 Codex estimate、已有归档、其他账户或 detail。本票仍需决定命令名、模式限制、成功／失败反馈及原子操作映射。
- 单一 DeepSeek 运行会话是已使用的推演条件，不是已批准检测／拒绝策略；若需要限制其他活动会话，必须在本票带实际路径作新决定。

## Handoff from clear reset decision

来源：[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)。只保留账户级 clear：归档目标账户全部会话的已成功保存活动聚合，重置累计并关闭该账户 holiday；空消费也可结束 holiday。不提供会话树级 clear，不清其他账户、旧归档、Codex estimate 或入口 detail。clear 前在途消费丢弃，之后旧子新请求正常统计；不取消真实执行或改 framework 生命周期。

Session／Round 累计限于适用账户当前周期；resume 只恢复已保存活动聚合，不扫描历史消息重估或合并旧归档，不维护跨周期 Session 总数。归档／reset／关闭 holiday 的一致成功／失败、跨进程旧缓存不复活、混账户关系保留与运行条件仍待决定；单一 DeepSeek 活动会话仅是讨论假设，不取消多会话支持。旧范围／交接文字见[同步前历史快照](../assets/contract-history-before-sync.md)，不再作为当前要求。

## Handoff from storage Q8 / Q9

[存储局部决议](../lighthouse/06-local-storage.md)Q8 确认周期标识拒绝 clear 前旧提交，Q9 确认取权限前有限等待／可取消、更新开始后等待实际结果；本票据此决定命令反馈，不把普通 round_end 的 Q6 失败策略直接套给 clear／holiday。归档、重置、关闭 holiday 的一致成功与恢复仍待存储票。

## Handoff from storage Q13 / Q14

[存储局部决议](../lighthouse/06-local-storage.md)Q13 已确认先发布归档，再原子发布目标账户新周期／累计重置／holiday 关闭；归档失败不重置，重置未提交报告失败，不自动重试／补做，允许残留本次备份但不合并恢复。活动文件确实提交才算 clear 成功；本票承接反馈，归档输入／关系保留及实际平台实现仍待存储票。

## Handoff from storage Q15

[存储局部决议](../lighthouse/06-local-storage.md)Q15 已确认 clear 只归档协调范围内最新已成功保存的活动聚合，不收集任何进程未落盘内存、不触发强制保存或 Round 排空。已完成响应但未保存的消费也丢弃，不进入新周期、不补账；这是明确收窄旧“全部已知”范围，反馈遵循 Q13，不取消其他账户／estimate 保护。

## Question

用户已在[数据讨论](12-state-data-contract.md)明确移除修改预算功能，不再迁移数字／K／0 参数。确定保留的 detail、holiday、clear 的完整命令操作、命令名、模式限制、失败反馈和存活范围；不因保留旧 /budget 名称而恢复已移除的数字设置。框架当前仅 toggle/directed 与一个 boolean activation 字段，不能借 unrecognized 回调伪装完整 action 接口。

选择所需通用命令类别进入 framework，还是保留扩展原生命令集成；detail 与统计业务数据由 model-cost shared logic 管理，不为本次升级通用业务 State。detail 已确认是交互入口级内存偏好，同一入口普通会话切换／tree 保留、重载／重启恢复 brief，独立入口互不影响；holiday 跨会话／进程持久化；clear 不清 Codex estimate——确认这些业务规则如何映射。反馈现有仅 info/error，而旧命令含 warning，需有明确处理，不默默降级。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 最初确认需求基线；后续数据决议已移除数字／K／0，仅保留 detail、holiday、账户级 clear／归档和反馈。本票逐项决定完整语法、模式适用范围、状态寿命、反馈及失败边界；clear 默认仍是 DeepSeek 归档／新周期／清 holiday，不清 Codex estimate。任何偏离基线的取舍必须显式记录并经用户确认。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：Session 已发生消费不因 tree、改消息或 fork 回滚；账户金额只累计计费渠道，额度消费和无统计口径不属于金额清零后可当免费的一组记录。
- 待决定：账户级 clear 的实际目标账户选择、原子归档／新周期及命令反馈如何映射？不另造会话历史账本或会话级 clear。多会话并发、正在执行或迟到请求、账户切换与 clear 交错时，操作影响哪一周期与哪些视图？保留已确认的 clear 不清 Codex estimate 基线，任何改变需显式确认。
