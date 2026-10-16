# 01: 正常处置时完成或截断 Round，并保存自身消费

**What to build:** pi 子会话正常处置时，由 framework 确认尚待下一 task 的 settled Round，或将没有 settled 的 open Round 按截断收口，并等待该实际会话自己的保存结果。普通 transferred 或查看位置切换不被误当成终止。

**Delivers:** P27, P28, P33

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 先以真实 pi 后台短寿命场景取得失败证据，再证明修复后 shutdown 返回前自身消费已成功提交；不以第三方完成通知代替保存证据。
- [ ] 已有 settled、尚待延后确认的 Round 在正常处置时完成确认；不依赖下一 macrotask，不加固定 sleep 或额外模型请求。
- [ ] 无 settled 的 open Round 以截断收口；使用独立给定的已知 usage 和测量缺口验证只保存可靠量，公开消费可区分截断，不补成完整耗时或声明任务成功。
- [ ] 在 framework 共同语义中完成收口和可等待 handler 接线，adapter 仅报告真实处置事实；不由 model-cost 另订阅 shutdown 补账。
- [ ] 活动及待自动继续阶段执行 transferred、查看或会话位置切换，不产生多余 round_end、保存或 Idle。
- [ ] 用确定性检查及真实宿主时序记录证明结果；本票完成 P27、P28、P33，完整清理顺序及恰好一次的 P29 验收由 10 负责。

## 契约与验收责任

依据 [已批准契约](../contract.md) 与 [规格](../spec.md)，遵循项目领域词汇、架构决议及测试分层。本票完整拥有 Delivers 所列 promises 的验收用例、测试编写和完成证据；后续票仍须回归受影响测试。验收预期取自契约、独立给定值或算例，不从被测实现重算。

完成时运行所属测试分区及受影响消费者；TypeScript 改动执行 typecheck，宿主接线改动须有对应真实宿主观察。保留命令、结果及相关证据，更新受影响文档。未执行、失败或环境缺失不计通过；不以替身替代契约要求的真实进程、宿主或视觉证据。
