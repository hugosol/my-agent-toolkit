# 05: 统一 `info | error` 反馈与 `hasUI`

**What to build:** 扩展共享逻辑拿到一条运行时无关的反馈通道，每个通知带 `info | error` 分级：有 UI 时映射为对应严重程度的 UI 通知，无 UI 时落 stderr，**永不进入 model context**。命令 handler 与语义事件 handler 都可用；delivery/invocation 暴露忠实的 `hasUI`，供共享逻辑执行 `main + hasUI` 门槛。既有 toggle 的 enabled/disabled 反馈改走这条通道且文案不变；`directed` 命令不产生框架自动文案；框架内部准入/会话告警通道不合并。

**Delivers:** P16, P17（框架侧）

**Test owner for:** P17（框架侧：delivery/invocation 的 `hasUI` 忠实性；扩展侧门槛见 11、13）

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `info` 与 `error` 在两种运行时都落到位：有 UI → 对应严重程度的 UI 通知；无 UI → stderr；两者都不进 model context
- [ ] 命令 handler 与语义事件 handler 都能发反馈
- [ ] delivery/invocation 的 `hasUI` 忠实反映运行时事实（有/无 UI 两种情形都断言）
- [ ] 既有 toggle 反馈走统一通道，codebase-tools 的 `codeBaseTools enabled/disabled` 文案不变
- [ ] `directed` 命令不产生框架自动文案
- [ ] 框架内部准入/会话告警通道保持独立（不被合并进新通道）
- [ ] F 层测试覆盖以上；`docs/framework-capabilities.md` 同步

**来源:** contract P16、P17；spec §4、故事 34–38/44/45/66；lighthouse 04
