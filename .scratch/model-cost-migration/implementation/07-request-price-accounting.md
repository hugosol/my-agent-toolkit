# 07: 请求锚价与可靠 usage 记账

**What to build:** 一次实际模型请求按开始时价格只计入一次可靠 usage；缺失指标明确提示，不伪造免费、不在结束后补账。

**Delivers:** P1, P2, P4, P5, P6, P59

**Blocked by:** 05: 逐实际 Session 的 Turn 事实交付；06: 消费文档安全保存与存储基线

**Status:** in-progress

## Acceptance criteria

- [ ] 经生产公共事实固定实际 provider/model、开始时间、原周期、holiday 和适用价格/币种/单位；使用自造数据和独立手算验证北京工作日 09:00–12:00、14:00–18:00 含端点、周末/holiday、跨时段及模型切换。
- [ ] 完成/失败/取消的可靠 input/cacheRead/cacheWrite/output 均入账，缓存与 input 不重复；缺 usage、无法区分真零与宿主默认零时提示跳过，不把跳过当免费。
- [ ] 缺适用价格只跳过金额、保留 token 并提示；catalog 改变不补算、不删除或重估已累计金额，token-only/hidden 不因无金额口径报缺价错误。
- [ ] 同 Session+Turn 重复结束跨 Round 不重计；相同内容新身份独立计入，缺 usage 已处理也不补账；已处理标记保留至实例销毁，旧回调不进入新实例。
- [ ] provider+精确模型决定模式，不按前缀/base URL/owned_by/别名模糊匹配；实际名单、谷价及共同峰系数依规格集中显式维护，不 YAML 配价、不运行期发现/热更。
- [ ] 算法永久 tests 用自造名单/价格证明匹配、锚价和缺失边界；实际白名单/价格与规格独立核对并隔离 smoke，不把频繁业务常量钉进算法 tests。
- [ ] 通过 S2 生产只读展示结果及反馈/保存累计验证，不读私有字段；隔离真实 OMP 出站与请求开始事实贯通，预期不调用被测计算重新生成。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
