# 01: codebase-tools 双模式首次启动

**What to build:** 用户在 pi 或 OMP 中通过显式入口选择 codebase-tools 手动模式或自动启动模式。两种模式共享 framework 公共装配与启动规则，由入口静态选择启动配置；无历史时常规手动关闭、常规自动开启。启动同步设置明确目标，使首个模型请求已包含应有贡献，而不是执行一次 toggle。启动后仍可使用原命令，重复观察不会重新应用启动默认值。

**Delivers:** P8, P10, P11, P12, P36；P2, P3, P4, P26, P33 的 codebase-tools 分区。

**Test owner for:** P2, P3, P4, P26, P33 的 codebase-tools 分区；connect-bot 分区由 03 编写测试，全部分区满足后对应 promise 才完成。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

依据：[已批准契约](../contract.md)、[Spec](../spec.md)。

- [ ] 保留原手动入口；在 codebase-tools 原支持的 pi、OMP 组合中真实加载并执行原命令，不扩大其他 extension 的支持范围。
- [ ] 自动入口无需命令触发首次启用；常规宿主加载参数即可选择模式，不新增运行时配置档参数或环境覆盖。
- [ ] 两模式复用 extension 定义、公共 adapter 装配和同一启动规则。纯声明 State 消费者无需增加空业务初始化函数；不新建独立启动 runtime，不改变 initialize 等待含义。
- [ ] 无有效历史时，常规手动 false、常规自动 true；分别核对贡献、marker 交付和对应 State 效果。相同历史与宿主条件下，两入口分别给定明确 true/false，按独立预期核对，不仅比较两边相等。
- [ ] 启动应用明确目标而非模拟命令或 toggle；历史 true、目标 true 的场景仍开启，实际贡献存在。
- [ ] 捕获真实首个模型请求，确认同步 State 设置已发生且该请求包含应有贡献；事后 marker 不能替代此证据。
- [ ] 启动后原命令仍能开启、关闭；核对贡献、marker 交付与原有持久化效果。
- [ ] 启动后通过命令改变选择，再重复相关会话观察并发出模型请求；确认启动目标不会重新覆盖命令选择，也不产生额外启动写入。仅重复设置 true 后仍为 true 不足以证明一次性应用。
- [ ] 无历史、常规手动关闭且没有启用或命令操作时，退出后无新增 State 载荷；允许宿主写入正常的其他会话记录。
- [ ] 通过契约 S1 公共装配 interface 和 S2 真实 harness 验证，不新增私有 State 调试口、测试专用生产启动入口或源码文本断言。
- [ ] 为 P8 准备 OMP/pi 隔离启动命令、场景清单、终端截图或录制与自动结果。只将 marker 实际显示判断交给用户；未确认前保持未验证，不暂停其余可执行工作。
- [ ] 完成受影响用例、所属分区及公共 API 受影响消费者检查；TypeScript 变更执行类型检查和相关 authoring/integration 静态检查，真实 harness 验证独立记录。遵守共享工作树测试协调规则，并更新本票行为对应的必要说明。

## 跨票覆盖分区

下表项目的实现与测试均由本票负责；其余消费者项目由 03 负责，完整分区见对应票。

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P2 | codebase-tools：pi、OMP 原手动入口及原有操作 | 01 | 01 |
| P3 | codebase-tools：无命令启动与首轮贡献 | 01 | 01 |
| P4 | codebase-tools：两入口显式 true/false 的独立预期 | 01 | 01 |
| P26 | codebase-tools：重复观察和首轮请求不重做启动应用，不覆盖后续命令选择 | 01 | 01 |
| P33 | codebase-tools：常规宿主参数下由显式入口静态选择配置 | 01 | 01 |
