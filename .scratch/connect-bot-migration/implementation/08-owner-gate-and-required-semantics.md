# 08: owner 订阅隔离与 `required-semantics` fail-soft

**What to build:** owner 订阅只收到 owner 自己的事件——子代理的 `round_*`/`session_*` 不送达，不驱动 owner 效果；运行时缺少本次新增语义时，声明依赖它的扩展按 `required-semantics` 被显式拒绝（fail-soft：不静默降级成部分能力）。

**Delivers:** P11

**Blocked by:** 06、07

**Status:** ready-for-agent

- [ ] 子代理事件不到达 owner 订阅；owner 只收自己的事件
- [ ] 声明依赖新语义的扩展在缺语义运行时被显式拒绝（binding 失败可读），不是静默降级
- [ ] 未声明依赖的扩展在缺语义运行时不受影响
- [ ] 拒绝经非模型通道报出，且不留半绑定状态（不注册任何命令/marker、不 seed State）
- [ ] F 层测试覆盖：owner 隔离、缺语义拒绝、无依赖扩展不受影响
- [ ] 能力文档同步

**来源:** contract P11；spec §3、故事 25/26；lighthouse 03
