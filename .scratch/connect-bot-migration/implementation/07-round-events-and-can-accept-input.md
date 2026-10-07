# 07: `round_start` / `round_end` 与 `canAcceptInput()`

**What to build:** 运行轴只有两个边沿事件：`round_start` → 工作中；`round_end` 只在真正 quiescence 触发且**无 payload**（自动续跑/queued drain 留在 round 内部；error/abort 也发 `round_end`）。`canAcceptInput()`（= idle）是独立查询，用于 arm 初值，不作为事件 payload——所以 arm 不需要依赖任何事件 payload。

**Delivers:** P8, P9

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] `round_start`/`round_end` 边沿触发；重复或嵌套活动不产生额外边沿
- [ ] `round_end` 只在 quiescence 触发，且投递无 payload
- [ ] error 与 abort 终态同样触发 `round_end`
- [ ] 自动续跑与 queued drain 不产生 round 边界
- [ ] `canAcceptInput()` 是独立查询且等于 idle 事实，不依赖事件 payload
- [ ] 原生合成（开始/结束、继续标志、突发终态）只出现在适配层
- [ ] F 层测试双侧：语义侧边沿与无 payload；原生侧含「error/abort 也发 `round_end`」与「续跑不打断 round」
- [ ] 两份能力文档同步

**来源:** contract P8、P9；spec §3、故事 18/19/20/74；lighthouse 03
