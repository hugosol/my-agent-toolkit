# 14: Codex 成对采样估计与独立保存

**What to build:** 同报告的合格双窗口变化产生 ratio/left，独立 estimate 安全保存并在消费周期重置之外保留。

**Delivers:** P66

**Blocked by:** 04: 安全文件更新与锁恢复；13: Codex 响应 headers 与独立额度窗口

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 只用同次来源报告成对读数，不拼 API/headers 或新旧窗口；5h 增至少 50pp，双窗口均正增且未饱和才形成采样。
- [ ] rollover/过期/时间异常重建 baseline；窗口可独立展示但不代表具备成对采样资格，无估计为 estimating…。
- [ ] baseline 即刻持久，ratio 最多每分钟保存；公共文件协调合并新 baseline 优先、已知 ratio 不降 null，不用消费 totals 分摊账户额度。
- [ ] 使用自造报告序列及独立预期通过 S2 验证边界/状态转换；真实独立 estimate 文件合并和重启读回验证保存，完整跨文档 P52 owner 为 24。
- [ ] 准备 P66 H2 的序列预期、脱敏现有读数及正常观察步骤；不额外消耗额度造样本，无足够真实样本如实待确认。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
