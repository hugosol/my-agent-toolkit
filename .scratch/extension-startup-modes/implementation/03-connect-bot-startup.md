# 03: connect-bot 非阻塞自动登记成功路径

**What to build:** 用户在 OMP 中选择 connect-bot 手动或自动入口。常规手动启动不登记；自动启动复用原命令的业务启用操作，无需命令便尝试接入面板。登记未完成时实际 State 保持关闭，agent 的首个模型请求仍可发出；有效登记成功后才开启并运行原 heartbeat、状态报告和控制行为。

**Delivers:** P15, P16, P17, P18；P2, P3, P4, P26, P33 的 connect-bot 分区。

**Test owner for:** P2, P3, P4, P26, P33 的 connect-bot 分区；codebase-tools 分区由 01 编写测试，全部分区满足后对应 promise 才完成。

**Blocked by:** 01: codebase-tools 双模式首次启动（依赖其公共启动装配能力，不依赖 codebase-tools 历史恢复）。

**Status:** ready-for-agent

依据：[已批准契约](../contract.md)、[Spec](../spec.md)。

- [ ] 原 OMP 手动入口保持可加载和可操作，新增独立自动入口；不扩展 connect-bot 的 pi 支持。
- [ ] 通过同一 framework 公共启动能力消费入口静态选择的配置，不复制启动 runtime、登记业务或 harness 装配；framework 不依赖 connect-bot 业务类型，shared-logic 不依赖原生宿主上下文。
- [ ] 常规手动启动后继续驱动运行与受控时间，无 register、heartbeat 或错误开启效果；不只检查启动瞬间。
- [ ] 自动入口无命令触发首次登记尝试，不以模块导入或请求入队代表业务已开启。
- [ ] 在相同历史与宿主条件下，两入口分别给定明确 true/false 配置，对独立预期核对登记与关闭行为，而非仅比较两边相等。使用常规宿主参数，不新增配置档参数或环境覆盖。
- [ ] 命令与自动启用遵循同一独立面板协议预期；成功后 heartbeat、状态报告、反馈以及原有开启／关闭命令继续有效。隔离真实面板记录与读侧证明互操作，不以客户端调用次数替代。
- [ ] 明确保持登记响应未完成，同时由独立模型 capture 端点确认真实首个模型请求已到达；短超时、入队日志或最终成功均不能替代此证据。
- [ ] 按未完成、拒绝、有效成功的受控顺序观察 marker 交付和协议效果；有效成功前实际 State 关闭。隔离真实面板读侧承担登记确认。
- [ ] 重复相关会话观察并驱动首轮及后续模型请求，不产生额外自动登记；人工重复 directed 调用保持原语义，不增加命令去重或自动重试。
- [ ] 登记通过既有非阻塞队列触发，不新增登记完成屏障、通用后台任务队列或生产调试入口，不把登记挂入原 initialize 等待链。
- [ ] 为 P18 准备 OMP 隔离启动命令、可控场景、终端截图或录制以及成功前后的时间顺序证据。仅实际终端 marker 显示留给用户确认，不能提前标为通过。
- [ ] 完成受影响用例、所属分区、公共 API 受影响消费者、真实 OMP 与隔离面板验证；TypeScript 变更执行类型检查及相关静态检查。记录执行证据与限制，遵守共享工作树协调规则并更新对应说明。

## 跨票覆盖分区

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P2 | codebase-tools：pi、OMP 原手动入口及原有操作 | 01 | 01 |
| P2 | connect-bot：OMP 原手动入口及原有操作 | 03 | 03 |
| P3 | codebase-tools：无命令启动与首轮贡献 | 01 | 01 |
| P3 | connect-bot：无命令启动与登记尝试 | 03 | 03 |
| P4 | codebase-tools：两入口显式 true/false 的独立预期 | 01 | 01 |
| P4 | connect-bot：两入口显式 true/false 的独立预期 | 03 | 03 |
| P26 | codebase-tools：重复观察和首轮请求不重做启动应用，不覆盖后续命令选择 | 01 | 01 |
| P26 | connect-bot：不额外自动登记，人工重复 directed 调用不被去重 | 03 | 03 |
| P33 | codebase-tools：常规宿主参数下由显式入口静态选择配置 | 01 | 01 |
| P33 | connect-bot：常规宿主参数下由显式入口静态选择配置 | 03 | 03 |
