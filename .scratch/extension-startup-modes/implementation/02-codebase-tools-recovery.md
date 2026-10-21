# 02: codebase-tools 历史恢复与跨模式持久化

**What to build:** 用户启动恢复 codebase-tools 会话时，已保存的有效 true/false 优先于配置默认值；无有效历史才使用默认值。自动开启沿用既有 session-entry 写入，正常保存后用手动入口恢复仍开启。运行中修改配置或导航会话不会重新施加入口默认值，既有注入进度和历史消息保持不变。

**Delivers:** P9, P13, P35；P7, P24, P25 的 codebase-tools 分区。

**Test owner for:** P7, P24, P25 的 codebase-tools 分区；P7/P25 的 connect-bot 测试由 05 负责，P24 的 connect-bot 测试由 04 负责。全部分区满足后对应 promise 才完成。

**Blocked by:** 01: codebase-tools 双模式首次启动。

**Status:** ready-for-agent

依据：[已批准契约](../contract.md)、[Spec](../spec.md)。

- [ ] 覆盖有效历史 true/false 与配置默认 true/false 的四种组合，核对首轮贡献及历史值没有被默认值错误覆盖；明确区分无记录与历史 false。
- [ ] 使用独立进程启动恢复有／无有效历史的会话，分别按历史优先／默认值回退规则观察，不能将启动恢复误判为运行中导航。
- [ ] 无历史会话从自动入口无命令开启，沿用原 session-entry 载荷记录 true；正常保存后独立进程通过手动入口恢复，捕获首轮开启贡献。
- [ ] 不增加记录格式、事务、重试、全局偏好或崩溃可靠性保证；沿用既有尽力持久化语义。
- [ ] 恢复已有贡献的会话，按原注入规则观察后续请求；独立核对旧消息保留、已有进度不重置，不重复注入不应重复的内容。
- [ ] 在没有历史干扰的运行中修改启动配置，当前 State 和贡献不被强制改变；下一次独立启动使用无有效历史的隔离场景，确认采用修改后的明确默认值。不得让历史优先掩盖配置是否生效。
- [ ] 首次启动后分别执行 new、resume、fork 及保持同 Owner 的导航，结果遵循原会话边界与恢复规则，不重新执行入口默认值。
- [ ] 测试经公共 interface 观察贡献、marker 交付、持久化及真实进程恢复，不以私有 State 或计算出的恢复目标代替用户可见效果。
- [ ] 为 P9 准备 OMP/pi 可恢复的隔离会话、启动命令、终端截图或录制和自动结果。仅实际终端 marker 显示留给用户确认；其余实现和自动检查须先完成。
- [ ] 完成受影响用例、所属分区、受影响消费者及真实恢复场景验证；TypeScript 变更执行类型检查与相关静态检查。记录命令、结果及限制，遵守测试协调规则并更新对应说明。

## 跨票覆盖分区

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P7 | codebase-tools：当前运行不强制变化，下次无有效历史启动采用新配置 | 02 | 02 |
| P7 | connect-bot：当前运行不强制变化，下次独立启动采用新配置 | 05 | 05 |
| P24 | codebase-tools：独立进程启动恢复，有／无有效历史 | 02 | 02 |
| P24 | connect-bot：独立进程启动恢复，旧载荷不能替代新登记 | 04 | 04 |
| P25 | codebase-tools：后续 new/resume/fork 与同 Owner 导航 | 02 | 02 |
| P25 | connect-bot：后续 new/resume/fork 与同 Owner 导航 | 05 | 05 |
