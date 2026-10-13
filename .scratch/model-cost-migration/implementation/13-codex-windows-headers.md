# 13: Codex 响应 headers 与独立额度窗口

**What to build:** Codex 额度按实际报告时长识别并独立更新，运行期仅响应 headers 更新，不通过额外 API 补窗口。

**Delivers:** P39, P65

**Blocked by:** 03: 兑现公共 HTTP 代理和正文超时；05: 逐实际 Session 的 Turn 事实交付

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 初始化 API 和响应 headers 使用同一业务 parser，API 仅启动使用；初始化选命名 codex 代理、10000ms 业务预算，地址/headers 由业务持有，不借推理 base URL。
- [ ] 按报告时长沿 ±5% 识别 5h/7d，不固定 primary/secondary；有效单窗口独立更新，缺失保留原成功值和原时间，没有则不可用。
- [ ] 未知/过期/无效 reset 使用独立预期，headers 按接收序处理，不建立绝对时序系统。
- [ ] 运行期无 API TTL/兜底/轮询/切换额外查询；mock 与出站捕获验证位置交换、单窗、缺失和更新次数，真实 adapter 接入使用正常 Turn headers。
- [ ] 准备 P39/P65 H2 的脱敏来源、窗口结果或跳过原因与正常使用观察步骤；发现 API、mock 或 RPC 不认证真实额度效果。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
