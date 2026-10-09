# OMP tree 切换与 Session 聚合累计探针

## 环境与范围

2026-10-09，repo Harness dock 驱动 OMP 18.5.0 隔离 exact install 的真实 RPC CLI、扩展回调、SessionManager 和 navigateTree。临时 session／agent state、本地 OpenAI-compatible SSE endpoint、fixture usage；不访问远端 provider／真实凭据、不改正式配置或统计。

先完成两次请求，通过真实扩展命令 navigateTree(targetId, {summarize:false}) 切到第一次 assistant 响应，再从历史位置发起第三次请求。每阶段通过原生 appendEntry 写入观察快照并由 dock 读回 JSONL。不是只改内存模拟 leaf。导航命令没有触发模型请求，整个场景实际 HTTP 请求数为 3，sessionId 保持同一个，host stderr 为空。

一次性观察扩展只保存四路 token 聚合计数，不保存 Turn 明细。后续补充运行沿用旧 turn-cost／cost-calc 纯函数锚价和累加，保存一个金额总数；探针为三个调用分别使用固定的 DeepSeek pro 峰／谷／峰价格时刻，不宣称 dock 模型实际按 DeepSeek 计费。两次实际运行均成功；最终运行金额与 token 均有断言。

## 运行结果

| 阶段 | 当前路径 assistant 数 | 全会话 assistant 数 | 宿主 Session totalTokens | 扩展 input/output/cacheRead 聚合 | 费用聚合（fixture usage + 旧计价） |
| --- | --- | --- | --- | --- | --- |
| 两次请求后 | 2 | 2 | 60 | 30 / 21 / 9 | 0.0005598 |
| tree 切到第一次响应 | 1 | 2 | 60 | 30 / 21 / 9 | 0.0005598 |
| 在该历史位置发起新请求后 | 2 | 3 | 120 | 60 / 42 / 18 | 0.0013995 |

每次 SSE 的 prompt_tokens=13×请求序号、completion_tokens=7×序号、cached_tokens=3×序号，归一后非缓存 input=10×序号。费用与预期误差小于 1e-12；浮点输出实际为 0.0005598000000000001 和 0.0013995000000000001，不将显示舍入误差称为计价差异。

成功摘要：

```json
{"version":"18.5.0","httpRequests":3,"treeDoesNotRollbackSessionAggregate":true,"newBranchSpendAddedOnce":true,"extensionRetainedTurnRecords":0,"scope":"single actual session; fixture usage; no new framework or persistent account ledger"}
```

## 源码支持

- 隔离基线 SessionManager.getUsageStatistics（session-manager.ts:2961–2963）返回索引 usageSnapshot；索引 insert 在收录 entry 时累加 usage（533–538）。usageSnapshot 返回全索引 usage 的副本（585–587）。
- 索引 setLeaf（566–569）改变 leaf／generation，不重置 usage；branch（3632–3633）调用 setLeaf。实际导航证据表明当前路径缩短，但全会话统计没有回滚。
- 旧 model-cost.onInit（index.ts:620–658）在 session_tree 等事件读取宿主当前累计、重设 previousTotal、清 turnDelta 和价格／当前费用累加器；DeepSeek 调用 ensureSession 更新 token 基线。旧 DailyData 的累计独立于当前显示路径。本探针没有运行完整旧扩展的 DeepSeek 文件／余额路径，不据此声称其所有初始化并发行为正确。

## 最小实现含义（部分已验证、其余待决策）

这个 tree 场景不要求 extension 自己保存每个 Turn：Session 聚合不随当前路径改变；新请求按该次价格增加累计即可。可以利用宿主可靠的全会话 usage 快照提供 token 范围，业务人民币金额仍须累加请求时锚定的费用，不能用当前模型价格重算全部 tokens。

这里只需要区分实际 session 与所选 tree 位置；后者不决定已发生消费的总量。历史 Turn 对应值能否查回不是本探针的目标，不为恢复它引入完整明细账。

## 尚未验证

恢复／重启后金额重建、tree 导航时仍有在途请求、tree 自动总结产生的独立消费、fork 到另一 session、手动删改 entry、子代理与 orchestration 混合 token／费用、多 main／跨进程账户协调、重复回调、取消缺 usage、损坏统计文档与退出排空未在此探针覆盖。不得将宿主 UsageStatistics.cost=0 的 fixture 值解释为业务累计费用，也不把 task 汇总 token 当作已认证的自身消费范围。

探针源码与全部 runRoot 在调查后清理，事实资产保留；没有新增生产实现或永久测试。
