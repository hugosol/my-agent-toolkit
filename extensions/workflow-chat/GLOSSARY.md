# Workflow Chat

Map 运行中的管理者与节点执行者角色。manager-chat 与 node-chat 分别面向承担对应角色的 Session；角色不是新的 Chat 种类。

## Language

**Run（运行）**:
一张 Map 的一次独立运行，持有本次管理者配置、要求、真实 Chat 关联与运行事实；含义沿用 herdr-bot 的 Run，不等于会话的一轮活动。
_Avoid_: Round, Chat, Map, Bot 实例

**管理者（Manager）**:
一个 Run 中负责选择流程动作、核实交接并显式推进运行的角色，由该 Run 关联的管理者 Chat 承担；它不是 Map 中的业务 node。
_Avoid_: 管理 Bot, 管理节点, 后台自动调度器

**节点执行者（Node executor）**:
承担某个 node 一次具体执行的 Chat 角色，负责执行工作与报告交接结果；它不是静态 node 定义，也不拥有流程状态操作权。
_Avoid_: node 定义, Task, Bot

**交接完成（Completed）**:
管理者显式确认节点工作可交接、满足下游依赖的运行事实，不表示报告刚被提交、对话停轮或 Chat 已退出。
_Avoid_: 报告已保存, Round 结束, Chat 退出
