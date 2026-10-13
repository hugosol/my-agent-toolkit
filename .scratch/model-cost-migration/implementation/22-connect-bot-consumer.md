# 22: connect-bot 统一接线与协议保留

**What to build:** connect-bot 使用统一公共绑定/观察与 HTTP 仍保持原注册协议、活动状态、心跳和 Owner 效果。

**Delivers:** P58（P58 的 connect-bot 覆盖）

**Test owner for:** P58（connect-bot coverage partition；P58 整体由 22 与 23 共同完成）

**Blocked by:** 03: 兑现公共 HTTP 代理和正文超时；05: 逐实际 Session 的 Turn 事实交付

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 02 已原子迁移公共契约，本票完成剩余公共生命周期/Owner 订阅/HTTP 接入；固定直连并沿自身超时，不改变 endpoint/envelope/JSON 协议。
- [ ] 保留注册、心跳、失败预算、working/未见结束 idle/真实结束 awaiting-input 及完成证据；统计截断/reset 不伪造完成。
- [ ] 子事实不能驱主效果，旧访问/清理不重建资源；失去独立职责的 PushTransport 和 assembly fetch 移除，不留兼容副本。
- [ ] 本票拥有 P58 的 connect-bot 覆盖与 tests：真实 loader/RPC/出站捕获验证注册协议、心跳、失败预算、State/Owner 效果；永久远端网络 tests mock，不重钉内部旧形状。
- [ ] P58 仅在本票及 23 都完成后整体完成；本票不认领 codebase-tools tests，24 架构验证不重复认领业务用例。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。

## P58 — coverage partition

| Coverage item | Ticket | Test owner |
|---|---|---|
| connect-bot 注册、心跳、失败预算、State、Owner 效果与活动/完成证据 | 22 | 22 |
| codebase-tools prompt、历史保护、激活 State、follow/none 与原命令行为 | 23 | 23 |

两部分完成后 P58 才整体完成；本票只写所属分区测试。
