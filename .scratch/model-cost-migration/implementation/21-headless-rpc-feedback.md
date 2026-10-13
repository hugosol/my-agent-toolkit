# 21: 无 UI 同后端与干净 RPC 反馈

**What to build:** 无 UI 仍完成同一记账/保存/测量，业务反馈对操作者可见且不污染 RPC 协议或模型上下文。

**Delivers:** P42, P43, P69

**Blocked by:** 19: holiday 与 clear 的完整周期切换

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 真实 RPC 下保持同一公共观察、usage 记账、round_end 保存、初始化/TTL/headers/estimate 调度，无 widget 或仅绘制格式化。
- [ ] 公共反馈保持 info/warning/error，错误只报一次；UI 余额/额度网络错只在 widget，其他业务错公共反馈，无 UI 送 stderr，不受 enable/扩展数量开关隐藏。
- [ ] 在隔离真实 RPC 触发业务错误后继续发请求，逐帧解析 stdout 控制协议，stdout 不插非协议文本且 stderr 有对应错误。
- [ ] 独立核对真实消费文件、出站请求捕获和 Session 日志，证明后端继续且反馈/合成秘密不进入模型内容或记录；不靠 mock stdout 证明真实 RPC。
- [ ] 覆盖无 UI 命令结果、缺 usage/价格、保存失败/暂停与网络失败；退出旧访问失效，不越过已退役生命周期效果权限。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

自动覆盖、命令与实际运行记录：[`assets/21-headless-rpc-feedback-evidence-2026-10-13.md`](../assets/21-headless-rpc-feedback-evidence-2026-10-13.md)。

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
