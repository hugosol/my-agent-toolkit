# 23: codebase-tools 统一接线与历史保护

**What to build:** codebase-tools 使用新的公共接线保持 prompt、历史保护、激活 State 和子代理继承，不为简单扩展复制 model-cost 内部结构。

**Delivers:** P58（P58 的 codebase-tools 覆盖）

**Test owner for:** P58（codebase-tools coverage partition；P58 整体由 22 与 23 共同完成）

**Blocked by:** 05: 逐实际 Session 的 Turn 事实交付

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 02 已原子迁移公共契约，本票完成剩余语义接入；保留原命令行为、prompt、历史保护和激活 State，不改变既有业务契约。
- [ ] follow 仍 live 读取 Owner 当前值、none 使用默认，子不获写权限；真实主/子请求验证 prompt 与历史顺序，marker 统一出口由 18 持有。
- [ ] 使用生产公共入口与真实 loader/RPC/出站及 Session 记录验证，不保留旧 owner-only blanket gate 或测试专属 dispatch。
- [ ] 本票拥有 P58 的 codebase-tools 覆盖与 tests：prompt/历史保护/State/follow-none/原命令行为；保留有效场景，删内部转发或旧类型形状断言，不重钉旧内部预期。
- [ ] P58 仅在 22 与本票都完成后整体完成，本票不重复认领 connect-bot tests，也不迁移 framework 内部私有组装接口给扩展使用。
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
