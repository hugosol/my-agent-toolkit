# 自定义交互和原生能力可以越过哪些边界

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: open
Blocked by: 02

## Question

通知、常驻接入标记和命令反馈如何组合框架能力与扩展自定义交互；扩展直接使用 OMP 原生 API 的入口、职责及约束是什么？

沿用架构已允许原生调用的前提，不另造全量原生 API 包装层。决定接入标记是否使用框架 Marker area、动态反馈需要何种数据，以及扩展专属 UI 与框架区域的边界。明确自定义代码能否以及如何写入框架管理的 State、注册命令、处理事件和持有资源，防止出现第二个当前值或互相覆盖的 UI 所有者。若需要改变 Marker area 等既有契约，必须显式提出变更而非把原生调用视为豁免。无需为不存在的复杂界面预先设计通用 UI。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。
