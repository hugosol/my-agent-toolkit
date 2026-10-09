# 旧计价累加与逐 Turn 留存粒度调查

## 源码事实

只读 E:/Developer/myhub/my-omp-toolkit/extensions/model-cost 的当前源码，未冻结正式迁移 revision。

- turn-cost.ts 的 TurnCostState 只有 activeTier、activePeriod、turnCost；anchorRequest 替换当前价格锚点，addMessageCost 按该锚点计算本响应费用并立即累加，finishTurn 取出累计后清空这三个字段。没有逐请求数组或历史 Turn 账本。
- index.ts 在 before_provider_request 锚价，在 assistant message_end 累加，在原生 agent_end 取出费用并调用 daily.recordTurnCost。
- daily-tracker.ts 的 DailyData 保存周期累计及 sessions；recordTurnCost 在锁内重读，用 session token 基线差分与本次费用更新累计并发布文档，不保留每份模型请求／响应记录。
- 这些事实说明旧实现的记录粒度；不从代码反推作者全部历史意图，也不声称旧实现满足本次讨论新增的全部归属／恢复要求。

## 已运行的纯函数 smoke

2026-10-09，Bun 直接调用旧 createTurnCostState／anchorRequest／addMessageCost／finishTurn 和 resolvePriceTier／rmbCost。两次 deepseek-v4-pro 请求各有 100 万非缓存 input token，output=0；请求时刻为北京时间工作日 09:00 和 20:00。

```json
{"requestCosts":[9,4.5],"accumulated":13.5,"repricedAtEnd":9,"retainedState":{"activeTier":null,"activePeriod":null,"turnCost":0},"persistedRequestRecords":0,"scope":"pure old accounting functions only; no ledger, file writes or provider bill verification"}
```

断言分别检查两份费用、累计、错误地以结束时谷价重算所得 9 元，以及累加器只有三个既有字段。未创建 Turn 明细、写统计文件、发网络请求或验证 provider 实际扣款；没有建立永久测试。

**证明范围**：此正常串行跨峰谷场景，按请求锚价、逐响应计算并累加即可得到 13.5 元，不需要长期逐 Turn 留存。不能据此证明取消、重复观测、崩溃、跨进程或子代理历史全部正确。

## 待评估，而非已批准方案

必须分开讨论：逐响应计价、运行期请求关联／去重、持久化聚合检查点、长期逐 Turn 明细。完整明细不能补出宿主从未暴露的重试或 usage，也不自动提供原子性、幂等和崩溃恢复。

候选是聚合为主、仅保留必要的在途／去重／Round 索引、或完整逐 Turn 历史；各自是否满足历史查询、迟到补齐、多代理、账户并发及退出恢复，需要具体代码／数据流验证。用户要求重新评估此前记录粒度方向，不等于已选择其中任何方案或自动删除其他已确认功能。
