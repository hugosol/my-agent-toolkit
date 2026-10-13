# 17: 静态 detail 与立即切换入口偏好

**What to build:** 用户立即切换主入口 detail，查看子代理固定 brief，返回恢复主偏好；静态代理树如实展示自身消费且不重建业务缓存。

**Delivers:** P20, P23, P26, P29

**Blocked by:** 16: 主子查看事实与主树 Total

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 主 detail 保留顶部 Total，在 Round 位置显示根名称、根自身 provider/model 分行、子/孙各一条自身累计按直接父缩进；无 Round 行、不展开子模型、不增加合计节点/交互查询。
- [ ] 树各行保留适用字段，不缩成仅金额+token；模型行不是代理节点，异构自造树核对字段范围及名称。
- [ ] detail 动作立即切入口内存偏好并反馈，不检查 provider/idle/保存，hidden/headless/busy 也不强制 widget；无 brief/on-off/focused 子命令路由。
- [ ] 普通模型/Session/tree/查看变化保留 CLI 业务实例、provider 缓存及 detail；入口独立，重启/reload 回 brief，不持久/不继承偏好。
- [ ] 子查看切自身 context/实际 Effort/当前模型结构/自身 Round，固定 brief，主树总数和 provider 全局测量不伪造子独享；主 detail→子 brief→主 detail 完整往返不改 Owner/记账。
- [ ] 本票拥有 P20/P23/P26/P29 全部自动行为覆盖，用请求计数、偏好和字段对照证明实例/缓存保留；实际隔离操作准备 P23/P26 H1 期望树、缩进、往返与可获得视觉证据。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
