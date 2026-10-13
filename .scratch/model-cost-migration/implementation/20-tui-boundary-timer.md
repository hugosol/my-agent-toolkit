# 20: 完整 TUI 与单一峰谷边界 timer

**What to build:** 用户在全部适用模式和主子查看下获得批准视觉与告警，峰谷到点由唯一 timer 更新当前视图而不改账或发查询。

**Delivers:** P41, P67

**Blocked by:** 18: Viewed session 的唯一 Marker area；19: holiday 与 clear 的完整周期切换

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 保留原布局/字体/色彩/context 条/Effort 值着色/峰谷 holiday、余额 <10/<5 元告警，以及 ≤20 元 fine、>20 元 coarse 的 Accrued/Session 分段条。
- [ ] 保留 Codex 20 格节奏、quota/time%、倒计时/绝对 reset，5h 分钟/7d 小时精度，未知/过期/无效 reset 及窄宽降级；统一 CacheR/CacheW、Total/Round 与适用金额单位。
- [ ] 每 CLI UI 仅一个下一峰谷边界一次性 timeout，含端点后通知并按实际时间安排未来边界；切目标不各自 arm，休眠/阻塞后纠正，销毁清理，headless 无绘制 timer。
- [ ] render 只读同一权威结果，无网络/保存/timer/计价修改；timer 不发网络/写文件/改费用，前端只负责原生主题/布局/宽度。
- [ ] 自动验证对应字段、金额单位、告警阈值和降级内容；受控时钟证明单 timer/当前目标/销毁，不能以正确数字代替视觉保留。
- [ ] 本票准备 P41/P67 H1 全部适用模式、主子 brief/detail 和宽窄场景的精确 artifact、隔离步骤、预期、自动结果及可获得截图/录屏；冻结旧 source oracle 仅作授权对照，复用前检查许可证。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
