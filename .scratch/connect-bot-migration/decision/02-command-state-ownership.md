# 接入命令与会话状态由框架和扩展如何共同管理

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: open
Blocked by: 01

## Question

为保留的接入、重注册、断开和工作状态行为，框架应提供哪些命令与 State 能力，哪些转换及业务规则由扩展负责？

明确接入请求成功前后的状态、失败时状态、重复命令的副作用，以及并发命令/迟到回执的有效性边界。区分命令动作与模式设置，不将重新注册简化为 toggle 或无副作用的幂等设置。确定当前值的权威来源、所属会话、临时连接资源与 State 的关系、恢复及子代理策略；现有布尔 State 和继承策略是否需要扩展须基于实际能力核对，不预设所有数据都要进入 State。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。
