# 05: Owner 生命周期、迟到结果与消费者隔离

**What to build:** 用户在 connect-bot 登记未完成时关闭连接，或离开其 Owner 后，旧登记即使迟到成功也不能复活效果。运行中配置变化及后续会话导航不重新触发启动登记；原有初始化等待、cleanup、子代理接入语义保持不变。组合加载时，connect-bot 的生命周期不污染 codebase-tools。

**Delivers:** P20, P21, P27, P32；P7, P25 的 connect-bot 分区。

**Test owner for:** P7, P25 的 connect-bot 分区；codebase-tools 分区由 02 编写测试，全部分区满足后对应 promise 才完成。

**Blocked by:** 03: connect-bot 非阻塞自动登记成功路径。

**Status:** in-progress

依据：[已批准契约](../contract.md)、[Spec](../spec.md)。本票不依赖 04，迟到有效响应与普通失败／准入路径可分别实现验证。

- [ ] 保持登记响应未完成，先执行 off，再释放有效成功响应；确认没有重新开启、后续 heartbeat 或该次尝试遗留的计时工作。
- [ ] 分别结束或转移 Owner 后释放旧响应，确认无错误开启、后续状态上报及遗留计时工作；即使旧 Owner 后续返回，该旧尝试也不能恢复有效。
- [ ] 保持会话切换、Session disposal 与 Owner 生命周期的既有区别，不为取消旧登记改写其他会话边界语义。
- [ ] 两消费者组合运行，关闭或结束 connect-bot 后，codebase-tools 仍保持其自身贡献和 State；登记、计时器、异步结果不跨 extension 污染。
- [ ] 在无历史影响的独立运行中修改 connect-bot 启动配置，当前 State 和登记效果不被强制改变；下一次独立启动按修改后的明确默认值决定是否尝试登记。不以最终开启作为唯一观察，因为开启还依赖有效登记结果。
- [ ] 首次启动后分别驱动 new、resume、fork 与保持同 Owner 的导航，遵循原会话规则，不重新执行入口启动登记或配置默认值。
- [ ] 在同一场景同时控制原必需初始化与未完成面板登记，确认原 initialize 和子代理接入等待仍有效，而登记不追加等待；不能通过删除原等待来证明非阻塞。
- [ ] 保留原 cleanup／处置行为及所需等待；以受控时间和事件顺序证明没有 Owner 结束后的业务工作，不依赖不受控网络时序。
- [ ] 通过 S1 公共 interface 组织竞争顺序，并完成契约要求的 S2 真实宿主组合与模型请求观察；不增加私有 State 调试口或新的生产后台队列。
- [ ] 完成受影响生命周期用例、所属分区及两个消费者检查；TypeScript 变更执行类型检查和相关静态检查。记录真实运行证据与限制，遵守共享工作树测试协调规则并更新对应说明。

## 跨票覆盖分区

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P7 | codebase-tools：当前运行不强制变化，下次无有效历史启动采用新配置 | 02 | 02 |
| P7 | connect-bot：当前运行不强制变化，下次独立启动采用新配置 | 05 | 05 |
| P25 | codebase-tools：后续 new/resume/fork 与同 Owner 导航 | 02 | 02 |
| P25 | connect-bot：后续 new/resume/fork 与同 Owner 导航 | 05 | 05 |
