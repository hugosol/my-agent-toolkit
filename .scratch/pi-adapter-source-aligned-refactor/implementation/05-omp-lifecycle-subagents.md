# 05: OMP Session 生命周期与原生子会话接入迁移

**What to build:** OMP 的主会话和实际子会话继续交付正确的 Session、Turn、Round 与相关观察，保留 Parent agent、Owner、状态隔离和释放行为；来源导航体现 OMP 原生机制而非 Pi 第三方协议的镜像。

**Delivers:** P5、P12（OMP）；P10、P13、P14（OMP 生命周期／原生子会话接入路径）

**Test owner for:** P5、P12 的 OMP 用例；P10、P13、P14 的 OMP 生命周期／原生子会话接入独立用例。跨路径组合用例由 09 拥有。

**Blocked by:** 01: 固化迁移清单与重构前验证基线。

**Status:** in-progress

## 边界与覆盖

以本 feature 的 spec／contract 和 01 的分配为准，经 S1／S2 验证。不承接 State 编码、命令、prompt 或 UI 内部迁移；依赖其既有契约而非等待其搬迁。

- [x] 按实际适配的 OMP 原生契约归置完整生命周期和原生 registry 关系读取；不创建空 thirdParty／mixture，不把多个原生事件自动归为跨来源组合。
- [x] 以独立事件事实、身份和顺序预期验证 Session／Turn／Round 与相关观察的开始、结束、转移、取消和终止失败；不要求 Pi 与 OMP 原生事件相等。
- [x] 保持 Parent agent、Session ancestry、Owner、Session observation 的区别及实际身份，主子会话不得错误继承或合并。
- [x] 经公开 assembly 验证多 extension／binding、绑定失败后再绑定、主子会话和 Owner 隔离；不读取私有状态代替消费结果。
- [x] 验证错误、取消、终止及适用超时／等待规则原样传播；不新增重试、延长等待或吞掉失败。
- [x] 验证释放后本路径应停止的交付、回调和外部效果停止，另一个有效 binding 保持运行；不以释放函数被调用替代效果证明。
- [x] 运行真实 OMP 子会话接入，证明适用 child-extension 加载要求及可观察能力保持不变，并通过可控条件验证拒绝路径；不能用注册成功冒充加载成功。
- [x] 保留共享状态和资源生命周期，迁移实际调用方、相关类型和加载支持；删除本职责旧实现和转发路径，更新直接导航，port assembly 不新增语义翻译阶段。

## 验证与交接

迭代运行受影响测试及 TypeScript 类型检查；完成时运行拥有分区、受影响消费方、适用真实 OMP dock／smoke 和终止场景。保留消费可见断言，不为搬迁削弱场景。记录命令、退出状态、源／环境和验证限制；替身、真实加载及结构供给分别记录。现存语义缺陷单独报告并请求范围决策，不顺手修复。共享 assembly 修改按 owner 和执行窗口协调，不添加仅由文件冲突导致的逻辑阻塞。

### 本票实施与验收（2026-10-24）

实现提交：`ecdac58`、`d9af7b5`；共享前置为 03 的 `26588da`（本 worktree cherry-pick 为 `721645d`）。最后验收的源码为 `d9af7b5`，验收期间无源码修改。`Status` 按仓库规则暂留 `in-progress`，独立集成并合入后才能置 `closed`；无待实现事项。

- 原生 extension-runner 多事件协议整体迁入 `native/extensibility/extensions/{lifecycle,session-facts,turn,round}.ts`，不新增解释阶段；原生关系读取与 registry 类型迁入 `native/registry/agent-registry.ts`。Session-entry 类型归入 03 的完整 `native/session/session-manager.ts`，公开 adapter 类型出口不变。旧生命周期／registry 路径已删除，无转发。端口、实际调用方及直接导航同步更新。Viewed-session 映射本体仍由 07 迁移；本票只迁其事实读取依赖。
- **P5 / P13：** `session.test.ts`、`turn.test.ts`、`round.test.ts` 通过公开 assembly 保留开始、结束、转移、重名／同身份导航、工具续接、取消、终止失败、未知 idle／pending／held-work 事实的独立预期；真实 `activity-facts`、`round-facts`、`turn-facts`、`consumer-regression` dock 观察相同宿主上的实际顺序、取消与 provider 终止失败。既有等待规则未增加预算或重试。OMP 的 awaitable `onDisposal` 仍为 unavailable，不伪称验证了 Pi 的十五秒 close-out。
- **P10 / 身份：** `owner-inheritance`、`owner-gate`、`process-mode-reuse`、`session-context-observation` 等现有场景区分 direct Parent、最近 main Owner、每个实际 Session 的读数；`implementation-lifecycle.test.ts` 新增 native label 拒绝后同一 assembly 再绑定成功的实例／身份／交付字面 trace，以及两个 extension／Owner 的独立处置场景。
- **P12：** 真实 `session-ownership-tree` 与 `turn-facts` dock 经 OMP 原生 task 产生 child／grandchild，观察三个实际会话、直接父链、五个请求交错、各自的 Turn／Round 和独立消费记录，证明实际 child extension 加载而非注册调用。OMP 没有 Pi provider 的 required-child-extension 注册／RPC；保持原生 integrated 路径。受控 native loader 拒绝独立断言 `bound:false`、原始失败原因、无交付／效果及后续可重新绑定，不把这种替身证据称为真实子加载证据。
- **P14：** 新增 native assembly 场景在处置前先证明 rename 回调和 host-retained command 确实有消费效果，处置后再次触发两者均无交付／效果，另一个有效 extension binding 继续 rename 和命令效果。真实 `binding-lifecycle`、`consumer-regression` 和消费方 session-switch/startup-lifecycle 场景保留清理、状态及终止证据。

实际命令与结果（均 Bun 1.4.2，win32/x64）：

1. 迁移前 `bun test tests/framework/session.test.ts tests/framework/round.test.ts tests/framework/turn.test.ts tests/framework/owner-inheritance.test.ts tests/framework/implementation-lifecycle.test.ts`：安装锁定依赖后 **97 pass / 0 fail**。初次因缺 `yaml` 在导入阶段失败，不算行为 red；`bun install --frozen-lockfile` exit 0。两条新增保行为测试原有实现已满足，没有人为制造产品失败；拒绝恢复测试最初误把 initialize 排在 session_start 前，读取既有 dispatch 契约后纠正 fixture；曾有一处 OwnerReference 未缩窄的类型错误，已修正。
2. `bun run typecheck`：最终 **exit 0**，authoring 61 files / 4 declarations / 0 diagnostics。最终定向 `bun test tests/framework/definition.test.ts tests/framework/injection.test.ts tests/framework/session.test.ts tests/framework/round.test.ts tests/framework/turn.test.ts tests/framework/owner-inheritance.test.ts tests/framework/implementation-lifecycle.test.ts`：**126 pass / 0 fail**。
3. `bun test tests/framework/session.test.ts tests/framework/round.test.ts tests/framework/turn.test.ts tests/framework/owner-inheritance.test.ts tests/framework/owner-gate.test.ts tests/framework/implementation-lifecycle.test.ts tests/framework/session-context-observation.test.ts tests/framework/process-mode-reuse.test.ts tests/framework/session-activity.test.ts tests/framework/follow-observation-independence.test.ts tests/framework/round-disposal.test.ts tests/framework/close-out-deadline.test.ts`：**151 pass / 0 fail**。
4. `bun test tests/model-cost/foundation/session tests/model-cost/integration/runtime-initialization.test.ts tests/model-cost/integration/observation-notice-frequency.test.ts tests/model-cost/integration/form-observation-independence.test.ts tests/connect-bot/session-switch.test.ts tests/connect-bot/startup-lifecycle.test.ts tests/connect-bot/native-session-boundary.test.ts tests/codebase-tools/subagent-owner.test.ts tests/codebase-tools/session-boundaries.test.ts`：**132 pass / 0 fail**（14 files）。
5. `bun test tests/framework`：**exit 0，660 pass / 0 fail**（57 files，3456 assertions），本 worktree 日志 `.cache/ticket05-framework.log`。
6. `bun test tests/harness-dock/session-ownership-tree.test.ts tests/harness-dock/binding-lifecycle.test.ts tests/harness-dock/consumer-regression.test.ts tests/harness-dock/activity-facts.test.ts tests/harness-dock/round-facts.test.ts tests/harness-dock/turn-facts.test.ts tests/harness-dock/session-recovery.test.ts`：串行 **exit 0，20 pass / 0 fail**（7 files，342 assertions，92.07s），本 worktree 日志 `.cache/ticket05-omp-lifecycle-dock.log`。
7. `bun scripts/check-adapter-integrations.ts --adapter omp --json`：**exit 0**，三个消费方 complete、无 diagnostics；`behaviorTestsRun:false`，仅结构供给证据，不等于运行时支持认证。

真实环境与限制：`OMP_TEST_VERSION` 未设置；实际 artifact 为 exact OMP **18.5.0**，通过本 worktree `.cache/omp-baseline/18.5.0` junction 复用 `E:/Developer/myhub/my-agent-toolkit/.cache/omp-baseline/18.5.0`，未安装或修改宿主／补丁。真实模型响应由 dock 本机 capture endpoint 控制，不证明外部 provider 服务质量或其他版本支持。先收到 integrate01 释放及 02 最初的继续通知后启动运行；Main 修订为 02→03→05→04 的消息在 blocking dock 调用期间送达，因此存在其他 worktree 测试负载重叠的可能，不声称严格静默窗口或性能证据；03 随后释放，05 已直接释放给 04。未执行全仓 suite、Pi 真实接入或 07 的可选补丁/TUI 验收；01 已报告的 consumer Codex outbound-role timeout 与 panel 安全壳失败不在本票定向运行范围，也未改写断言或记为通过。
