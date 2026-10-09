# 旧 model-cost：clear、resume、Total 与 Accrued 的关系

## 源码事实

核对本地旧仓库当前源码，未冻结迁移 revision：

- [index.ts](../../../../my-omp-toolkit/extensions/model-cost/index.ts):540–559：clear 调用 daily.archive，另关闭 holiday；不修改宿主会话历史，也没有清空 turnCost 的动作。
- [daily-tracker.ts](../../../../my-omp-toolkit/extensions/model-cost/daily-tracker.ts):180–218：archive 归档整个共享 deepseek-cost.json 的累计与全部 session 行，随后发布零累计、空 sessions 的新文档。旧文件没有可靠账户 namespace；它是共享 DeepSeek 周期重置，不是仅当前会话重置，也不能称为已实现严格多账户隔离。
- index.ts:620–658：恢复／切换初始化读取 getUsageStatistics，重置运行期 turnCost；DeepSeek 模式调用 ensureSession。daily-tracker.ts:221–243：缺失会话行以当前宿主累计 token 建立基线、cost=0，不按当前模型／费率把历史费用补写回来。
- index.ts:247–342：widget 的 Total 来自宿主会话统计，并按当前或活动锚点 tier 调用 buildStatusLine；Accrued 来自 dailyData.totalCost。这是两个不同口径。恢复后的历史 token 可在 Total 中按当前单一 tier 重新显示费用，不代表进入持久化累计。
- daily-tracker.ts:250–291 与 index.ts:717–801：后续结束时持久化的是会话 token 基线增量及传入的本次 turnCost；turnCost 来自逐响应请求锚价累加，不由总 token 乘当前价计算。clear 后不恢复直接续跑与 clear→resume 是不同路径，不能泛化为所有 clear 都会清空旧在途费用。

## 实际 smoke

Bun 运行真实旧 createDailyTracker、archive 的文件读写以及 buildStatusLine／resolvePriceTier；将 node:os.homedir 替换为临时目录，原生锁通过既有 test seam 替换为串行执行。不是完整 harness resume／命令／TUI，也不证明并发、远端余额或 provider 账单。临时目录 finally 删除，探针源码运行后删除。

1. M 的宿主历史 input 基线为 100 万；增加到 200 万，传入锚价费用 9 元。
2. 另一个不运行的会话 OTHER 累计 4.5 元。共享周期共 13.5 元。
3. archive 后，归档含 M 与 OTHER 两行、13.5 元；新活动文档为零。
4. 新 tracker 模拟 resume，以 M 宿主历史 200 万 input 调用 ensureSession：sessionCost=0、周期 cost=0、lastInput=200 万；OTHER 不在新周期中。
5. 同一历史 200 万 input 调用真实旧 Total 格式化、当前 pro 谷价：显示 9 元。但没有因此更新文件。
6. M 新请求后宿主累计升到 300 万，传入新锚价费用 4.5 元：新周期 token=100 万、cost=4.5 元，旧历史未重复收费。

实际输出：

```json
{"beforeClear":{"cost":13.5,"sessions":["M","OTHER"]},"archive":{"cost":13.5,"sessions":["M","OTHER"]},"afterClearResume":{"cost":0,"tokenBaseline":2000000,"sessionCost":0},"oldTotalDisplay":"Cache:   0%  ￥Cache/In/Out：0:100:0  Sum: 2,000.0K  Cost:      ¥9.00","afterNewResponse":{"cost":4.5,"tokens":1000000}}
```

## 对新方案的含义（不是新批准决策）

- 持久化是介质，清除作用域由删哪些记录决定；删除当前会话树记录不等于删除账户所有会话贡献。
- 没有其他正在运行的会话，不代表不存在其他已保存的会话累计；账户级重置也会影响这些会话将来 resume。
- 新方案通常 resume 恢复已成功保存聚合，并非每次恢复从零。clear 成功删除相应活动聚合后才从零继续；归档不会自动并回活动累计。
- 旧／新重要差异是新业务累计不按恢复时当前模型／费率重估历史 token；不能误称旧持久化累计会在 resume 时按单一模型重写历史费用。
