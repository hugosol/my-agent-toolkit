# 01: 共同上下文观察与首次快照

**What to build:** OMP 与 pi 的会话通过 framework 共同消费 interface 向扩展提供当前上下文及首次接入时已有的当前观察，不必再发生一次状态转换才能读到。adapter 负责原生事实采集，扩展仅消费共同 interface；迁移后移除扩展并行原生采集路径。

**Delivers:** P4, P11, P12

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有所列 promises 的完整 coverage 与验收测试；后续跨进程接线由 03 负责，不将本票实际 OMP、pi 采集与共同消费验证推迟到最终集成。

- [ ] 会话先处于 Working，再建立共同观察订阅；不产生第二次状态转换，仍立即取得 Working 与独立给定的上下文。复用共同活动事实，不在扩展另造 Round 判断。
- [ ] 会话启动、消息结束及宿主可靠执行收敛位置采集 tokens 与采集时对应模型；同一独立给定序列经 OMP、pi 映射产生相同观察。
- [ ] 实际 OMP、pi 运行中，扩展通过共同 interface 取得读数；显示采用对应模型渠道的显示预算，而非宿主 context window。
- [ ] 移除扩展对共同采集所覆盖原生事件的并行订阅，避免重复交付；原生差异保留在 adapter，扩展 shared logic 不依赖原生事件或载体。
- [ ] 按仓库测试规范执行相关确定性测试、所属分区及受影响消费者；TypeScript 变化执行 typecheck，并取得实际宿主与消费表面证据。记录环境、命令、结果及未验证项；未观察不得计为通过。
