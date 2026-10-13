# 11: 消费模式、双币种与只读指标

**What to build:** 各模式展示批准 usage 与费用字段，人民币 Cost 和美元 Ref 不混加，未知与无口径不伪装成免费，预算不限制宿主。

**Delivers:** P7, P8, P9, P10, P25

**Blocked by:** 08: 工具续跑与轻量 Round 累计；09: 实际 Session 自身归属与父树汇总

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 混合 Session 树分别保留 CNY Cost、USD Ref 和 token；Codex Ref 不是订阅实付，不换算混币种，不因当前 token-only/hidden 抹掉其他已知贡献。
- [ ] token-only 仅批准四类 token/命中率/Sum/context/实际 Effort/Session/正常 Round/detail 的适用指标，无自身金额/费用结构/官方峰谷余额/Go 额度/Codex 窗口估计。
- [ ] hidden 不创建用量 widget，不改变模型执行权限；捕获实际宿主执行和 widget 结果，不仅测试分类返回值。
- [ ] 固定显示预算按规格 DeepSeek/Go 450K、Codex 272K；只展示告警，不改变请求、输出、上下文窗口或压缩，不恢复数字/K/0 参数。
- [ ] 费用结构参考占比用对应模型当前价格乘 token 后归一化，DeepSeek 谷价、Codex 对应 catalog 四项；缺价/全零不可用，不借其他模型或历史 Ref 反推，不重价金额。
- [ ] 永久行为 tests 用自造数据和独立金额/比例；隔离出站捕获证明 token-only/hidden/预算不改变执行，S2 与最小生产前端展示可独立观察，不等待最终视觉票才提供模式行为。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
