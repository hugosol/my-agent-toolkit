# 06: 语义会话事件、分发顺序与边界 marker

**What to build:** 框架给出运行时无关的会话轴语义事件：`session_start`（`initial`/`new`/`resume`/`fork`）与 `session_end`（`transferred`/`disposed`）是对称一对；switch/branch/fork 表现为 `session_end(transferred)` + `session_start(new)`；同身份导航不发事件（判据 = owner key 是否变化）。`session_end` 投递以 `owner.key` 给出**正在结束的 owner**，冗余的 `previousOwnerKey` 移除。框架行为（State retirement、marker）先于扩展 handler 分发、错误互相隔离；session 边界刷新 marker 区，切换后不显示陈旧 marker。原生事件到语义事件的合成只发生在适配层，共享逻辑永不命名原生事件。

**Delivers:** P7, P10, P14

**Blocked by:** 03、05

**Status:** ready-for-agent

- [ ] `session_start` 带 reason（`initial`/`new`/`resume`/`fork`）；`session_end` 带 reason（`transferred`/`disposed`）；两者对称成对
- [ ] switch/branch/fork 产生 `session_end(transferred)` 后 `session_start(new)`
- [ ] 同身份导航（`/reload`、同文件 `/resume`、`/clear`、TUI `/branch`、`/tree`）不发事件
- [ ] `session_end` 投递以 `owner.key` 给出正在结束的 owner；`previousOwnerKey` 不再出现在投递中
- [ ] 框架行为先于扩展 handler 执行；扩展 handler 抛错不影响框架行为与其它 handler
- [ ] session 边界发布 marker 区（无陈旧 marker）
- [ ] 原生合成为语义事件只出现在适配层；共享源不出现原生事件名
- [ ] F 层测试双侧覆盖：runtime-neutral double（语义与边界/同身份 no-op）+ OMP 原生 double（`session_switch`/`session_branch`/`session_shutdown` 合成，含 reason 映射）
- [ ] `docs/framework-capabilities.md`、`docs/agent-runtime-support.md` 同步

**来源:** contract P7、P10、P14；spec §3、故事 16/17/21–25/29–33/77；lighthouse 03、07
