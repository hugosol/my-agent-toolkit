# 动态 widget 属于哪里，如何保证无 UI 也更新业务？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 03
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Run 与模型事实观测？](03-observation-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

明确动态多行进度条、窗口节奏、费用／余额告警色、Effort 着色、分段条与宽度降级归 extension harness presentation，还是本次抽出 framework 通用展示 capability？现有 marker area 只是框架统一的单行激活标记，不应强塞复杂 widget。

确定 shared logic 提供什么已对齐的展示模型，native renderer 只读取与布局／主题，不在 render 改 lastContextTokens、请求 API、创建 timer 或落盘。无 UI／RPC 路径仍更新业务与持久化；账户故障保持 widget-only 旧要求与无 UI 可观察性的关系要用户确认。输出具体视觉及 headless 验收场景。
