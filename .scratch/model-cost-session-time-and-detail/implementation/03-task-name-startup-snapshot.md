# 03: 正确任务名称与不可变启动快照

**What to build:** 用户在子代理 detail 行看到可靠任务命名句柄或明确 Session 名称，以及能够证明的启动实际模型和初始有效思考强度。完整启动事实随既有消费文档保存、恢复，不随后续设置或追加执行改写；未知历史事实如实显示“?”。

**Delivers:** P26, P27, P28, P29；P19, P22 的下列启动事实覆盖项。

**Test owner for:** P19, P22 的本票覆盖项；其余覆盖项由 01/02 负责，全部覆盖项完成才完成整个 Promise。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Source: [approved contract](../contract.md) · [spec](../spec.md)

## Acceptance criteria

- [ ] P26：类别 task、句柄“检索定价”、后续明确 Session 名称“定价核查”时，实际输出采用正确句柄并尊重明确名称。用 scout 等非 task 类别证明修正来源映射／名称选择，而非特判字符串 task。
- [ ] P27：启动 model-A / high 时实际输出对应组合；auto 仅采用可可靠证明的初始有效强度，不能将配置标签或当前设置冒充启动事实。使用受控场景及支持范围内真实 omp 来源证据。
- [ ] P28：后续 model-B / medium、强度调整或同 Session 追加执行后，显示及成功保存的启动快照仍为 model-A / high，不建立多模型／强度组合历史。
- [ ] P29：旧文档没有快照、仅存在当前 model-B / medium 时，无法证明的启动字段显示“?”；部分缺失也逐字段保持未知，不从当前值反推。
- [ ] P19：完整名称、模型标识及可靠启动快照随既有消费提交保存；新 runtime／进程从同一文档恢复完整启动事实，不只保留被缩略的显示文本，也不因快照到达新增专属保存。
- [ ] P22：缺新增启动字段的旧有效文档保留原 tokens、cost、parent 并继续提交；新增事实未知不等于消费文档损坏。
- [ ] 名称仅作为显示数据，不改变实际 Session 身份、直接父关系或消费归属；保留静态 Agent tree 和 descendant 一 Session 一条逻辑记录。
- [ ] 完成所属测试分区、受影响公共事实消费者、TypeScript typecheck、真实 omp 来源及实际 detail／恢复 smoke；受控 adapter 不替代真实宿主证据。

## Coverage partition owned here

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P19 | 新 runtime／进程恢复完整启动模型／有效强度快照 | 03 | 03 |
| P22 | 旧文档缺启动字段，保留有效消费且启动事实未知 | 03 | 03 |

## Boundaries

遵守 S1/S2/S3：framework adapter 提供可靠事实，shared logic 拥有快照和名称业务选择，宿主前端绘制。不猜宿主私有字段或透传完整对象，不改 omp 或新增补丁，不以当前设置补造历史事实。与 01/02 协调公共事实和可选文档字段，不固定内部 schema 字段拼写。实际终端列布局及缩略／续行由 06 交付，本票提供完整数据。
