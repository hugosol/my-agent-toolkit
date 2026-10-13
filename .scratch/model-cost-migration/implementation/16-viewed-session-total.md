# 16: 主子查看事实与主树 Total

**What to build:** 查看主或子代理时显示该目标真实模型事实与自身结构，但 Total 的主树消费范围保持不变。

**Delivers:** P11, P21, P22

**Blocked by:** 10: Session 恢复、导航与保存失败收口；11: 消费模式、双币种与只读指标；15: 并行初始化、当次鉴权与非阻塞调度

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Effort 取实际生效值而非配置意图，主/子故意不同且不可取显示 ?，只给值着色；context/当前模型事实来自公开 Viewed session。
- [ ] Total 当前模型 Cache/Input/Output/命中率/结构参考取 Viewed session 自身当前 provider/model，不混其他模型或含后代累计。
- [ ] Total Sum/Cost/Ref 仍为原主会话和全部后代全部模型，查看子不丢父/兄弟，费用按各自单位，不因当前模式伪造免费。
- [ ] 主/子/孙/兄弟异构数据通过 S2 和隔离查看操作验证，故意让整树总值与目标自身字段不同；目标切换和同目标事实更新触发重读，不捕获旧 ctx。
- [ ] 准备 P11 H1 实际目标 Effort 场景、冻结 artifact、切换步骤及自动事实对照；主子 brief/detail 往返与偏好完整责任由 17 承担。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通／证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。

## Result (2026-10-13)

生产源码无需改动：显示 seam（`runtime.presentation`）与最小生产前端已按 P11/P21/P22 交付，本票核实其落在 S2／S1＋S5 两条 seam 上，并补齐缺失的自动覆盖与 H1 材料。

- 新增自动覆盖：`tests/model-cost/viewed-session-total.test.ts`（S2，7 例，异构主/子/孙/兄弟）、`tests/model-cost/viewed-session-widget.test.ts`（S5 受控事实 adapter，6 例，目标切换／同目标变化／不借用绑定／旧 ctx 丢弃）、`tests/harness-dock/viewed-session-total.test.ts`（S5 真实冻结 artifact，2 例，实际 Effort 与 `?`）。`bun test tests/model-cost tests/harness-dock/viewed-session-total.test.ts` → 188 pass / 0 fail；`bun run typecheck` → 通过。
- 证据、逐 criterion 支撑、注入验证与 P11 H1 材料：`assets/16-viewed-session-total-evidence-2026-10-13.md`。
- 仍待：P11 H1（真实交互 TUI 的目标 Effort 与子代理切换可见性）需用户确认，未确认不记通过；主子 brief/detail 往返与偏好归 17 票；Effort 着色与视觉格式归 20 票；集成提交由主流程处理。
