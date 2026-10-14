# 05: 移除 Sum，保留消费字段语义

**What to build:** 用户在 brief／detail 的 Total、Round、主会话 model 行及所有相关 descendant 行不再看到 Sum；其余消费字段保留原有意义和数值，Round 不新增时间列。

**Delivers:** P23, P25；P24 的字段精简覆盖项。

**Test owner for:** P24 的本票覆盖项；其他变化与组合路径由 01/02/06/07 各自负责，全部覆盖项完成才完成整个 Promise。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Source: [approved contract](../contract.md) · [spec](../spec.md)

## Acceptance criteria

- [ ] P23：检查实际 widget 的 brief／detail、多种既有展示模式、Total、Round、主会话 provider/model 行和所有 descendant 行，用户可见字段集均无 Sum；验证字段而非整行固定空格。
- [ ] P25：实际 brief Round 输出不新增时间字段，不把 Total 主时间或子耗时放入 Round。
- [ ] P24：用独立给定的 Cache、费用、参考费用、上下文及直接／含后代累计期望值，证明字段移除没有重定义消费算法或改变保留数值；覆盖相关模式及 model／descendant 行。
- [ ] 不因隐藏 Sum 而无条件删除其他保留字段仍依赖的内部计算，不把费用与时间互换，不改变消费归属或存储格式。
- [ ] 完成所属输出测试分区与受影响消费者、TypeScript typecheck、实际 widget smoke；验证受影响显示表面，不仅检查源代码是否含 Sum 字符串。

## Coverage partition owned here

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P24 | 移除 Sum 后各模式保留字段的业务数值不变 | 05 | 05 |

## Boundaries

使用现有 S2 输出 seam。字段选择由 model-cost shared logic 决定，主题与终端布局在宿主绘制层；不改 omp 或新增补丁，不新增命令、聚合节点或查询 UI。时间功能由 01/02 交付，最终子代理列宽及窄屏布局由 06 交付；本票可独立完成。
