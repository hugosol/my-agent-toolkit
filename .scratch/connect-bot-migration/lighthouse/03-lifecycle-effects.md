# 03: 生命周期映射与持续上报由哪一层负责: Lighthouse

> Question and discussion: [03: 生命周期映射与持续上报由哪一层负责](../decision/03-lifecycle-effects.md)

## Question

工作状态事件、心跳、有界上报队列与资源释放中，哪些属于框架语义钩子或持续任务契约，哪些是 connect-bot 业务，哪些需要扩展内的 OMP 专属集成？

明确开始工作、正常轮次结束、继续执行与异常终态的语义边界，以及会话身份变化、同身份事件、停止接入和退出的处理。区分停止本地资源与远端注销，保留由面板过期处理退出的业务要求。决定失败计数、顺序、超时和迟到结果影响哪些会话/接入周期；框架若承诺生命周期语义，由框架适配层承担映射，不能在扩展中重复实现同一契约。OMP 专属能力须明确标注，不推断 pi 等价。

本票据只形成决策，不实施代码。

## 承接约束

- （来源：[01 lighthouse](./01-behavior-baseline.md)）keepAlive（在线/离线）由**面板**按心跳过期派生（`ONLINE_WINDOW = 30s`）；扩展侧不得实现过期判定，只负责心跳间隔（10s）。原实现刻意不 hook `session_shutdown`，退出/崩溃后的离线可见性完全交给面板。
- （来源：[02 lighthouse](./02-command-state-ownership.md)）**持续效果只对 owner 会话启动**：`enabled` 不继承到子代理；自动 disarm / session-switch 改变 `enabled` 时，效果与 marker 必须随之停止/清除。

## Discussion

### 1. 归属：框架接管语义，扩展接管效果体

框架定义运行时无关的语义生命周期模型（阶段事件及其含义）+ adapter 映射契约（原生事件 → 语义事件）；扩展保留心跳 timer、outbox、失败预算、HTTP 与三值业务状态，只订阅语义事件、不碰原生事件。**被否决**：因「当前只有 connect-bot 一个消费者」把效果生命周期留给扩展（违反地图 Notes「按语义契约判断，不按使用者数量判断」）；以及「框架只做代码简化、不做语义抽象」。

### 2. 模型形态：离散、边沿触发的语义事件

事件 = **转换**（边沿触发）；active/idle 是独立**查询**，不是事件 payload。已经 idle 时不再发 `round_end`。**被否决**：框架维护阶段状态机（接口更大，还需定义 phase 生命周期与恢复后对齐）。

### 3. 会话轴：`session_start` / `session_end` 对称一对

| 事件 | 含义 | reason | 框架行为 | 扩展 |
|---|---|---|---|---|
| `session_start` | 某 session 成为 current owner | `initial\|new\|resume\|fork` | seed State + 刷新 marker | 可选订阅 |
| `session_end` | current owner 不再 current | `transferred\|disposed` | retire State + 清 marker | 停本地效果；transferred 时 best-effort unregister 旧 id |

- switch/branch/fork = `session_end(transferred)` + `session_start(new)`；同身份导航（`/tree`、`/clear`）= 不发事件。判据 = owner key 是否变化（对齐参照实现 `isSessionSwitched`）。
- 原生映射：OMP `session_switch`/`session_branch`/`session_shutdown`；pi `session_start(reason)`/`session_before_switch`/`session_before_fork`/`session_shutdown`。OMP 的 `session_start` 不能当每转换边界（host-init、无 reason、子代理也触发）。
- **修订 01**：「扩展刻意不 hook `session_shutdown`」→ **框架**提供 `session_end` 语义（扩展不直接 hook 原生事件）；离线时机不变（停心跳后仍由面板 30s 过期）。
- **补 02 缺口**：02 要求 session-switch 清 marker，而现状只在 run initiation / 命令 transition 发布 marker → `session_start`/`session_end` 必须刷新 marker 区。

### 4. 运行轴：`Round`（user-prompt 级活动段）

`Round`：从进入工作到 quiescence（无剩余自动工作、等待用户）的一段活动；可包含多个 model-response turn 与多个底层 run。

- `round_start`（边沿）→ running；
- `round_end`（边沿，quiescence，**无 payload**）→ awaiting-input。
- 自动续跑 / queued drain 留在 round 内部 → 不发 `round_end`；error/abort 也发 `round_end`（agent 回到等待），异常终态由此定义。
- v1 **不暴露** model-response 级 `turn_*`（ADR 0002：按需求扩展）。
- **被否决**：用 `turn_start`/`turn_end` 表达 running/awaiting —— 两个 runtime 的 turn = 一次 model-response cycle，一次 prompt 触发 N 次，会在工具循环中间翻转。
- **被否决**：`round_end` 带 `outcome` —— 各 runtime 来源不一致（pi `turn_end.outcome` 有、`agent_settled` 无；OMP 无字段、只能从最后 assistant message `stopReason` 推导），不把 runtime 不一致元素耦进事件。

### 5. 独立查询 `canAcceptInput()`

- = `isIdle()`；与事件独立，用于 arm 初值。
- 两 runtime 都有 `isIdle()`；OMP 另有 `getAsyncJobSnapshot()`（OMP-qualified），pi 无。
- adapter 内部用这些事实决定是否发 `round_end`：OMP `agent_end(willContinue≠true)` + `isIdle()` + 无 running async job + 无 pending messages；pi `agent_settled`。

### 6. stop 的触发源与本地/远端区分

- `enabled=false`（显式 off / auto-disarm）→ 扩展内部停效果（仅 off 远端 unregister；auto-disarm 不发）。
- `session_end(transferred)` → 停本地 + best-effort unregister 旧 id；`session_end(disposed)` → 只本地停，交面板 30s 过期。
- 本地资源停止永远先于远端注销。

### 7. owner-gate（默认）

- owner 订阅只收 owner 自己的事件；subagent 的 `round_*`/`session_*` **不送达** owner 订阅。
- OMP adapter 用 `ctx.agent.kind` 实现；pi 无 agent 身份 → 标 **OMP-qualified**（未集成、不推断等价）。
- 对齐既有 `reconcileSession` 的非 owner no-op。

### 8. 失败计数 / 顺序 / 超时 / 迟到结果

- 全部留扩展，作用域 = owner 会话的一次接入周期（arm→disarm）；框架不介入。
- 依据：与面板协议/端点强绑定；01 已把 heartbeat 10s、连续失败 3 次、register 1s / push+unregister 1.5s、单 flusher/上限 16/丢最旧 heartbeat/不重试保留为扩展层契约。

### 9. 分发与 adapter 契约

- 分发顺序：框架行为先（session/State/marker），扩展 handler 后；错误互相隔离。
- typed 语义 handler 由扩展共享 logic 在 assembly 注入，definition 仍纯数据（「no raw handler」不变量保留：注入的是语义 handler，非原生 handler）。
- adapter 负责把原生事件合成为语义事件；缺少必需语义 → 现有 `required-semantics` fail-soft。
- OMP-qualified 能力须标注：managed timer、async job snapshot、agent identity / 子代理 gate、`session_stop`/`willContinue` 形状。

---

## Decision

框架新增运行时无关的**语义生命周期模型**：会话轴 `session_start` / `session_end`（对称一对，带 reason），运行轴 `round_start` / `round_end`（`Round` = user-prompt 级活动段，`round_end` 在 quiescence 无 payload），配独立查询 `canAcceptInput()`；框架行为与扩展 handler 按「框架先、扩展后」分发，adapter 把 OMP/pi 原生事件合成为语义事件、缺语义按 `required-semantics` fail-soft；心跳 timer、outbox、失败预算、HTTP 与三值工作状态仍归扩展，扩展只消费语义事件；owner 订阅默认只收 owner 自身事件（子代理不送达，标 OMP-qualified）。

## User stories

1. As an extension developer, I want 框架定义运行时无关的 `session_*`/`round_*` 语义事件, so that 一套共享逻辑管理各阶段而不必读各 runtime 源码。
2. As an extension developer, I want adapter 合成原生→语义事件, so that 我的逻辑永不命名原生事件。
3. As an extension developer, I want `round_end` 只在真正 quiescence 触发, so that 工具循环/自动续跑不会中途把 server 翻成「等待输入」。
4. As an extension developer, I want `canAcceptInput()` 作为独立查询, so that arm 初值不依赖事件 payload。
5. As a connect-bot 用户, I want 面板在 agent 真正结束/开始时切到「等待输入」/「运行中」, so that 面板反映真实状态。
6. As a connect-bot 用户, I want 会话切换时停旧会话上报并注销旧 id, so that 心跳不会泄漏进新会话。
7. As a connect-bot 用户, I want 退出/崩溃交面板 30s 过期, so that 扩展保持单向只读桥。
8. As a framework 维护者, I want 框架行为先于扩展 handler 分发, so that 扩展逻辑运行时 State 已一致。
9. As a framework 维护者, I want session 边界刷新 marker, so that 切换后不显示陈旧 marker。
10. As a framework 维护者, I want owner-gate 默认, so that 子代理事件不驱动 owner 效果。
11. As a framework 维护者, I want 缺语义 fail-soft, so that 不支持的 runtime 拒绝能力而非静默降级。
12. As an extension developer, I want 效果体留在扩展, so that 框架不需要知道面板协议。
13. As a framework 维护者, I want OMP-qualified 能力显式标注, so that 不推断 pi 等价。

## Preconditions

- 01、02 已 resolved；02 的 `enabled`（in-memory、不继承、handler 拥有写）与 directed 命令成立。
- 框架 v1 现状：只有 `onSession`/`onRunInitiation`；`SessionPosition = start|switch|branch|tree`；marker 只在 run initiation 与命令 transition 发布。
- OMP 支持基线 18.5.0；pi 未实现、不宣称支持。
- 面板是固定外部契约；离线由面板 30s 过期。
- 04 负责文案/通知与 marker 文本；05 负责配置。

## Postconditions

- 框架获得：`session_start`/`session_end`、`round_start`/`round_end`、`canAcceptInput()`、扩展可见的 typed handler 注入、owner-gate、框架优先分发、session 边界刷新 marker。
- adapter 获得按 runtime 的映射契约（含 OMP 合成 quiescence 的规则）。
- 04/05 不受影响（04 的 marker 文本由新的边界刷新触发）。
- 06 验收须覆盖新语义事件、owner-gate、marker 刷新、round 边界。
- 01 的修订记录在案；ADR 0002 增补；GLOSSARY 新增 `Round` 与 `Semantic lifecycle event`。

## Invariants

- 事件是边沿触发的转换；idle 是查询，永不作为 payload 字段。
- `round_end` 无 payload；事件中不出现 runtime 相关元素（如 `outcome`）。
- 三轴正交永不合并：接入状态 ≠ agent 工作状态 ≠ 面板 keepAlive。
- 效果体（timer/outbox/HTTP/失败预算/三值）留在扩展；框架只发语义事件。
- owner 订阅只收 owner 自己的事件。
- 本地资源停止先于远端注销。
- definition 保持纯数据；注入的是 typed 语义 handler，绝非原生 handler。
- adapter 是唯一命名原生 API 的模块（对齐 `tests/framework/import-boundary.test.ts`）。
- 框架公开接口只做 additive 变更（ADR 0002）；错误/中止也产生 `round_end`。

## 修订（2026-10-07，由《后台效果与 session_end 清理如何取得框架能力与 owner 事实》触发）

- **Invariants 作用域修订**：原「adapter 是唯一命名原生 API 的模块」限定为与 `tests/framework/import-boundary.test.ts` 实际规则一致——**框架共享源（framework core/behaviors/definition）与扩展非 `runtimes/` 模块不命名/不导入原生 API；原生访问只允许出现在 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`**（该测试的 `ESCAPE_HATCH` 已如此编码）。旧措辞写于 04 之前，属 stale。
- **session_end 的 owner 事实补全**：`session_end(transferred|disposed)` 以 `owner.key` 给出**正在结束**的 owner；`previousOwnerKey` 在 session_end/session_start 拆分后冗余，从语义投递移除（详见 07 lighthouse）。
- 其余 Decision、User stories、Preconditions、Postconditions、Invariants 不变。
