# 10: 正常处置等待 Round 收口和自身保存

**What to build:** adapter 在可等待的正常会话处置位置报告实际终止事实，由 framework 完成 Round 结束确认或截断，并等待相关异步 handler 和会话自身保存。成功提示在确认保存后发生，之后才释放观察来源、连接和 binding，最后返回 shutdown；已完成部分不重复执行。

**Delivers:** P27, P28, P29

**Blocked by:** 03 — 子进程启动即安全登记并交付当前观察。

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P27–P29 全部 coverage 与测试。复用现有本地保存路径，不依赖 08 的 Owner 刷新才能结算；正常完成路径先独立可验，整体截止和故障结果由 11 交付。

- [ ] 先确认真实 pi 后台短寿命失败场景，再证明已有 settled、尚待下一 task 的 Round 在正常处置时完成确认，并在 shutdown 返回前确认自身提交成功。
- [ ] 修复不增加固定 sleep，不发第二次模型请求来促成保存，不由 adapter 或 model-cost 私自伪造 round_end。
- [ ] 无 settled 的 open Round 在处置时按截断收口；使用独立给定已知 usage 和测量缺口，只保存可靠量，公开消费可区分截断，不补算未知量或完整耗时，不声明任务成功。
- [ ] 以可控制完成的异步 handler 证明完成前不清理；完成后顺序为结束／截断、等待 handler 与保存、确认成功提示、释放来源／连接／binding、返回 shutdown。
- [ ] 已结束或已保存部分恰好一次，延后确认回调与重复处置不重复交付、保存或成功提示；失败不冒报成功。
- [ ] 记录真实宿主提交、退出及诊断顺序。普通 transferred／查看切换仍不强制关轮，不能将 disposed 扩大为离开查看位置。
- [ ] 按仓库测试规范执行 Round、异步订阅、计费及受影响消费者分区，TypeScript 变化执行 typecheck；使用隔离本机兼容端点／存储取得实际 pi 后台与截断证据，不访问操作者真实数据或依赖付费调用。
