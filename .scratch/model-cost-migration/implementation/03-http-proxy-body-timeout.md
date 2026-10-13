# 03: 兑现公共 HTTP 代理和正文超时

**What to build:** 调用方显式选择直连或命名代理，获得原生 response 和真实传输/正文失败，不发生偷偷直连或预算外正文等待。

**Delivers:** P54, P55

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 单一公共 request 接收业务 method/headers/body/timeoutMs/proxy；默认 GET，返回原生 response，非 2xx 正常返回，传输/超时及正文读取失败分别 reject，不加业务 envelope/自动 JSON/Bearer 管理。
- [ ] proxy=false 或省略明确直连；命名项来自共享 http.proxies，支持 HTTP/HTTPS 代理连接协议；缺失/非法/不可读配置及代理连接失败绝不直连重发。
- [ ] 不依赖或修改全局代理环境，不接管宿主推理/OAuth 网络，不新增主动取消能力。
- [ ] 超时优先请求值→共享 http.defaultTimeoutMs→30000ms，须正整数，非法值和 0 拒绝；预算覆盖等待响应头及正文读取，不覆盖完整正文后的业务计算。
- [ ] 永久网络 test cases 全用 mock，验证响应、非 2xx、失败和预算语义；隔离本地目标与 HTTP/HTTPS 代理真实 smoke 验证连接协议、路由兑现及无直连重发。
- [ ] 本地延迟响应头/正文 smoke 验证正文预算、非 2xx 返回与读取失败；报告观察结果，不能以参数转发断言代替传输证明。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
