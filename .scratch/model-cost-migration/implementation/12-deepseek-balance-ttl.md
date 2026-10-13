# 12: DeepSeek 余额成功 TTL 与在途合并

**What to build:** DeepSeek usage 可后台刷新余额，成功读数决定 TTL，失败保留上次可靠值且不产生自动查询风暴。

**Delivers:** P38

**Blocked by:** 03: 兑现公共 HTTP 代理和正文超时；07: 请求锚价与可靠 usage 记账

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 按真实请求 provider 的 usage 触发检查成功 TTL，默认 30000ms，沿既有扩展 YAML 机制可配置；过期无在途才查，不因到点/活动开始/终轮/切换查。
- [ ] 同实例触发合并在途，完成后不补发；成功更新读数与时间，失败保留旧值和旧时间，不冷却/重试，后续 usage 可重新尝试。
- [ ] 余额通过公共 HTTP 直连，业务预算 5000ms；按当次宿主凭据/base URL 去末尾 /v1 后余额路径，缺地址用批准默认，不借其他凭据。
- [ ] 通过生产业务 S2 结果/变化订阅及公共依赖受控时间验证成功 TTL 端点、在途合并与失败时间，永久网络 tests mock，捕获次数证明无轮询/补发。
- [ ] 准备 P38 的 H2 脱敏余额结果或跳过原因及正常 usage 观察方法；真实最终效果仍待用户，不读取真实秘密进入对话。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
