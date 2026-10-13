# 18: Viewed session 的唯一 Marker area

**What to build:** 进程唯一 Marker area 跟随实际查看目标的有效 State，查看只改变展示而不扩大 Owner 权限。

**Delivers:** P27

**Blocked by:** 01: 公开 Viewed session 并冻结隔离宿主；02: 公共工厂生命周期与 actions 路由

**Status:** in-progress

## Acceptance criteria

- [ ] 沿公共 Viewed session 出口投影目标有效 State，follow 读取 Owner 当前值，none 使用声明默认，不复制主全部 marker。
- [ ] 查看/目标失效不改变 Owner、继承或写权限，子事件不获得主会话外部效果权限。
- [ ] 重复模块图仍共享进程唯一 Marker area，位置/行序/widget 身份由 framework 拥有，不新建扩展专属或第二 marker 区。
- [ ] 通过公共事实与实际 UI marker 结果验证主/子切换、follow/none、不可写及进程唯一性，不用内部 StateStore dump。
- [ ] 准备 P27 H1 的 State 场景、期望标记、切换步骤及自动结果；真实视觉仍待人工确认。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
