# 01: 公开 Viewed session 并冻结隔离宿主

**What to build:** 在隔离 OMP 中通过公共只读出口读取当前查看会话及其变化，冻结可运行的补丁宿主，供实际 Effort 与有效 State 展示接入。

**Delivers:** enabling: unblocks P11, P27

**Blocked by:** None (can start immediately)

**Status:** in-progress

## Acceptance criteria

- [x] 以批准的 OMP 18.5.0（@9348320）支持基础补最小公开出口；如必须换基础版本，提供具体证据请求裁决，不自行升级。
- [x] 公开快照及变化订阅提供实际 Session 身份、名称、必要关系、provider/model、实际 Effort、context 使用/窗口；缺失显式不可取得，不读取私有 controller 或 UI 文本猜值。
- [x] 覆盖目标切换、同目标事实变化、目标失效和解除订阅；查看不改变执行 Session、Owner 或写权限。
- [x] 冻结精确 revision 和可运行 artifact，记录构建/依赖/环境及隔离加载步骤；不预造 revision，不把局部探针当支持认证。
- [x] 复用 Harness dock，在独立安装、配置、工作、Session 和数据根启动实际补丁宿主，观察出口变化与解除后的结果；不驱动正式 OMP。
- [x] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [x] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Comments

实现与自动检查已完成，待集成（提交）与人工复核；H1/H2 的 P11/P27 最终确认仍属用户，本票不认领。

- 出口：`getViewedSession()` / `subscribeViewedSessionChanged()`；快照含 agent 身份与直接父、sessionId、名称、
  provider/model、实际生效 Effort、context 使用/窗口，缺失一律列入 `unavailable`（不猜）。
- artifact：[`host-patches/omp-18.5.0-viewed-session/`](../../../host-patches/omp-18.5.0-viewed-session)（patch.diff
  599 行 8 文件、record.json 冻结 pre/post sha256、README 记录构建/依赖/环境与隔离加载步骤）；
  物化于 `.cache/omp-baseline/18.5.0-viewed-session`，由
  `tests/harness-dock/viewed-session-harness.ts` 校验后复用。基础 revision 未变（18.5.0 @9348320）。
- 证据：`bun test tests/harness-dock/viewed-session.test.ts tests/harness-dock/viewed-session-host.test.ts`
  → 11 pass / 0 fail；真实补丁宿主在隔离前缀 + 临时 run root 下经 dock 驱动，未触摸正式 OMP；
  未打补丁的基线安装作对照报告无出口。故障注入（禁用变化监听后交付数 1→0，恢复后 1）证明断言有效。
- 限制：TUI 聚焦路径已接线并通过模块级用例覆盖，但本环境未运行交互视图——已按 H1 材料准备切换步骤与预期；
  宿主 patch 为本地 artifact，未并入任何上游 checkout，也未升级支持记录。
- 全仓 `bun test`：443 pass / 4 fail，4 项与本票无关（2 项兄弟 checkout 已越过基线 revision 锚点的
  byte-identity 检查，2 项 connect-bot panel 协议/窗口用真实 panel 会话，未修改相关文件）。

## Verification responsibility

本票为 enabling，提供真实公开出口与隔离 artifact，不认领 P11/P27 最终验收。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
