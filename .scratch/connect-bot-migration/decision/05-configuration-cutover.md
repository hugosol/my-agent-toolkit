# 配置、装载与新旧实现切换如何保持兼容

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: open
Blocked by: 01

## Question

共享源码布局下 connect-bot 的配置归属、寻址和错误处理如何确定，用户如何在不同时激活新旧实现的条件下迁入或回退？

核对原 endpoint 配置的整机作用域、默认与缺失提示、无效配置失败、未知键及无 env/CLI 覆盖等行为，判断哪些应沿用、哪些需要明确差异。选择配置位置并说明既有配置如何继续使用；区分配置文件与不持久化的会话接入状态，不凭空引入状态迁移。明确源码布局、依赖与装载选择、重启要求，以及切换时面板旧行的可见结果。沿用架构的新旧实现互斥及原仓库独立原则；不实际更改用户安装配置。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。
