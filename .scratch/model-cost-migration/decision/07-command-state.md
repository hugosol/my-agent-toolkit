# /budget 的参数、操作与状态如何在新框架表达？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 06, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

确定 /budget 数字／K／0、detail、holiday、clear 的完整命令操作、模式限制、失败反馈和存活范围。框架当前仅 toggle/directed 与一个 boolean activation 字段，不能借 unrecognized 回调伪装完整 action/parameter 接口。

选择所需通用命令类别进入 framework，还是 budget 为扩展原生命令集成；明确数字预算、detail、holiday、统计基线与 framework State 的关系。数字与 detail 同次加载保留、重启默认；holiday 跨会话／进程持久化；clear 不清 Codex estimate——确认这些业务规则如何映射。反馈现有仅 info/error，而旧命令含 warning，需有明确处理，不默默降级。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q10 将数字／K／0、detail、holiday、clear 及命令反馈确认为需求基线，而非冻结实现。本票逐项决定完整语法、模式适用范围、状态寿命、反馈及失败边界；clear 默认仍是 DeepSeek 归档／新周期／清 holiday，不清 Codex estimate。任何偏离基线的取舍必须显式记录并经用户确认。

