# 07: 后台效果与 session_end 清理如何取得框架能力与 owner 事实: Lighthouse

> Question and discussion: [07: 后台效果与 session_end 清理如何取得框架能力与 owner 事实](../decision/07-effect-callback-capabilities.md)

## Question

来源：backtracer 对《自定义交互和原生能力可以越过哪些边界》的 trace（2026-10-07），两条 Layer gap。

### 1. 后台效果回调如何取得框架能力

04 定了「框架在所有 handler delivery 上提供声明值写接缝」「统一 `info | error` 反馈接缝」「delivery 上的 `hasUI` 事实」。但 connect-bot 的首次推送失败通知、自动 disarm 通知与 `enabled=false` 写入发生在**扩展自持的 10s timer / outbox 回调**里——它不是任何 handler delivery。该回调如何取得：

- per-owner 的声明值写接缝（auto-disarm 写 `enabled=false`，触发 marker 清除）；
- 统一反馈口（E/F 两条 error 通知）；
- `hasUI`（若该路径需要）。

候选形态：

- **(a)** arm 命令 handler 时取得 per-owner 句柄，按 Q8'' 存入扩展自持效果记录，后台回调复用；
- **(b)** 框架提供 owner-resolving 的写/反馈 API，任何回调可直接调用；
- **(c)** 其他。

必须一并明确：句柄在 owner 被 retire 前后的有效性、timer 与 session_end 交错的并发边界。

### 2. session_end 清理所需的 owner 事实来源

04 的 8b 假定用 delivery 的 `previousOwnerKey` 定位扩展自持的旧记录（真实 sessionId 由扩展在 OMP 侧读取并保存）。但 03 与 `framework/core/protocol.ts:74` 只把 `previousOwnerKey` 定义为「本 delivery 替换的 owner key，when this binding served another owner before」，**未点名 `session_end` 是否携带它**，也未排除 `session_end` 的 `owner` 本身就是旧 owner。需钉死：

- `session_end(transferred)` / `session_end(disposed)` 投递里哪个字段给出旧 owner key；
- 扩展如何在该时点读到自持记录、完成 best-effort unregister 旧真实 sessionId（本地资源停止先于远端注销）；
- 对 `session_end(disposed)` 与 owner 未解析时的行为。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

## 承接约束

- （来源：[03 lighthouse](./03-lifecycle-effects.md)）框架行为先于扩展 handler 分发；owner 订阅只收 owner 自身事件；本地资源停止先于远端注销；managed timer 标 OMP-qualified。
- （来源：[04 lighthouse](./04-interaction-native-boundary.md)）统一 `info | error` 反馈接缝（命令 + 语义事件 handler 都可用、无 UI 落 stderr）、delivery 上的 `hasUI`、所有 handler delivery 的声明值写接缝；扩展工作数据由扩展自持 owner-scoped typed 记录；真实 sessionId 只在 `extensions/connect-bot/runtimes/omp.ts` 原生读取。
- **文档级收尾（本票一并裁定）**：
  - GLOSSARY 是否新增「统一反馈/通知通道（含 severity）」正式词条（`Marker area` 已有对等词条）；
  - 03 invariant 「adapter 是唯一命名原生 API 的模块」是否限定为「框架模块内」，以消除与 04 「OMP-qualified 原生集中在扩展 `runtimes/omp.ts`」的字面冲突。
- 本票解锁后为 06 的前置；06 的验收清单需引用本票结论。

## Discussion

### 1. 后台回调取得框架接缝的形态：保留的 owner 能力句柄（选项 a）

选定 **(a)**：handler delivery 提供一个 owner-scoped 能力句柄（声明值写 + 统一反馈），扩展在 arm 时存入自持 `BotSession` 记录，heartbeat/outbox 回调复用同一句柄。不新增 owner-key 解析式框架 API，也不把效果交给框架托管（timer/outbox 依 03 留扩展）。

存活规则（一并钉死）：

- 句柄只在 owner 存活期间有效；框架行为先于扩展 handler，session_end 由框架先 retire。
- retained 句柄在 retire 后失效：写为 no-op（不重建 State、不重发 marker），反馈被丢弃，避免迟到回调写回或发误导通知。
- session_end **本次投递**自带仅本次可用的反馈口，扩展 session_end handler 仍能发 G。
- 扩展在 session_end handler 顶部**同步**停本地 timer（先于任何 await）；扩展自持记录/守卫是第二道防线。

**驳回**：

- **(b) owner-key 解析式 API**：把 `enabled` 变成「有 key 就能写」、掏空 02「handler 拥有写」、新增 owner 查询面。
- **(c) 框架托管效果**：与 03「managed timer / outbox 归扩展」冲突。

### 2. 后台回调路径不需要 `hasUI`

选定：保留句柄只带写接缝与反馈口。`main + hasUI` 门槛是命令期事实（04 §2）；E/F 是已 arm owner 的效果通知，无 UI 时反馈口自身落 stderr，带 `hasUI` 只是死数据。

### 3. session_end 的 owner 事实与清理序列

选定：`session_end(transferred|disposed)` 的 `owner.key` = **正在结束的 owner**（即该投递的 owner 作用域），扩展据此定位自持记录。`previousOwnerKey` 在拆分为 session_end + session_start 后冗余，从语义投递移除（04 §8b 与 user story 15 据此修订）。

序列：

- `transferred`：同步停本地效果 → 经本次投递反馈口发 G（info）→ 对记录中的真实 sessionId best-effort unregister（沿用 1.5s 超时，本地停止先于远端）→ 删记录。
- `disposed`：同步停本地 → 删记录，不注销、不通知，交面板 30s 过期。
- `owner.kind !== "owner"`（inherited/unresolved）：no-op。
- session_end 不写 `enabled`（框架 retire 已回默认、marker 已清）。

### 4. GLOSSARY 新增 `Extension feedback（扩展反馈）` 词条

选定：框架所有、运行时无关的操作员通知通道，带 `info | error`；扩展从命令与语义事件 handler 经它发反馈，框架映射到 UI 通知或无 UI 时的 stderr；永不进入 model context（与 `Marker area` 对等）。

### 5. 03 invariant 作用域改写

选定：把《生命周期映射与持续上报由哪一层负责》的 invariant「adapter 是唯一命名原生 API 的模块」改写为与 [`tests/framework/import-boundary.test.ts`](../../../tests/framework/import-boundary.test.ts) 实际规则一致：**框架共享源（framework core/behaviors/definition）与扩展非 `runtimes/` 模块不命名/不导入原生 API；原生访问只允许出现在 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`**。旧措辞写于 04 之前，属 stale。

### 附带澄清（事实，非决策）

`enabled` 在 session_end 的行为按 persistence 声明区分：connect-bot 为 `persistence: "memory"`（02 §4）→ owner 变更即回 default `false`、新 owner 不从分支 seed；codebase-tools 省略 `state`、用默认持久化字段（写 session entry）→ session 边界从目标分支 payload seed，是否保真属 06 的「codebase-tools 不回退」验收项。本次不改 codebase-tools 行为。

---

## Decision

后台效果回调不新增框架 API：handler delivery 提供可保留的 owner-scoped 能力句柄（声明值写 + 统一反馈），句柄随 owner retire 失效（写 no-op、反馈丢弃），session_end 本次投递自带一次性反馈口；`session_end` 以 `owner.key` 给出正在结束的 owner 并移除冗余的 `previousOwnerKey`，transferred 时先停本地再 best-effort 注销旧真实 sessionId、disposed 只停本地交面板过期；并新增 GLOSSARY `Extension feedback`、把「adapter 是唯一命名原生 API 的模块」改写为 import-boundary 测试的实际规则。

## User stories

1. As a 扩展开发者, I want 后台 timer/outbox 回调复用 arm 时取得的 owner 能力句柄, so that auto-disarm 能写 `enabled=false` 并让 marker 清除、E/F 通知能经统一反馈口发出
2. As a 框架维护者, I want 该句柄随 owner retire 失效, so that 迟到的后台回调不会重建已结束会话的 State 或重发 marker
3. As a connect-bot 用户, I want 切会话后不再收到旧会话的 E/F 通知, so that 不出现与 G 矛盾的误导提示
4. As a 扩展开发者, I want session_end handler 仍能经本次投递的反馈口发 G, so that 切换提示不因 retire 而丢失
5. As a 扩展开发者, I want 后台回调路径不带 `hasUI`, so that 能力面最小、不引入死数据
6. As a 扩展开发者, I want `session_end.owner.key` 直接给出正在结束的 owner, so that 我能查自持记录、先停本地再 best-effort 注销旧真实 sessionId
7. As a 框架维护者, I want 移除冗余的 `previousOwnerKey`, so that 语义投递只有一个 owner 事实、拆分的 session_end/session_start 不产生歧义
8. As a connect-bot 用户, I want disposed（退出/崩溃）只停本地、不通知、交面板 30s 过期, so that 单向上报桥保持不变
9. As a 框架维护者, I want 一个 owner 能力句柄同时承载写与反馈, so that 「handler 拥有写」的授权模型不被 owner-key API 掏空
10. As a 领域维护者, I want GLOSSARY 新增 `Extension feedback` 词条, so that 反馈通道与 `Marker area` 一样有正式术语
11. As a 框架维护者, I want import-boundary invariant 改写为测试实际规则, so that 框架共享源与扩展 `runtimes/` 的边界不再与 04 字面冲突

## Preconditions

- 01/02/03/04/05 已 resolved；本票是 06 的直接前置。
- 02：`enabled` in-memory、默认不继承；handler 先于 State 写运行并拥有写。
- 03：`session_end(transferred|disposed)`、框架先于扩展 handler 分发、本地停止先于远端注销、session 边界刷 marker、效果只对 owner 会话。
- 04：统一 `info|error` 反馈口、所有 handler delivery 的声明值写接缝、扩展自持 owner-scoped 记录、真实 sessionId 只在 `runtimes/omp.ts` 读取、auto-disarm 写 `enabled=false`。
- 代码事实：E/F 产生于 heartbeat/outbox 回调（原 `recordFailure` → `notify-first`/`autoDisarm`）；G 产生于 session 切换 handler；`import-boundary.test.ts` 的逃生舱为 `framework/adapters/**` 与 `extensions/*/runtimes/**`。

## Postconditions

- 框架获得：owner-scoped 可保留能力句柄（声明值写 + 反馈）及其随 retire 失效的语义；session_end 投递以 `owner` 给出结束中的 owner；`previousOwnerKey` 从语义投递移除。
- 04 的 §8b 与 user story 15、03 的 invariant 行据此修订（以「修订」节追加，不重写原文）。
- `GLOSSARY.md` 新增 `Extension feedback`；《生命周期映射与持续上报由哪一层负责》lighthouse 增登记该 invariant 修订。
- connect-bot 不再依赖 `previousOwnerKey`；E/F 走统一反馈口；auto-disarm 的 `enabled=false` 经保留句柄写入并清 marker。
- 06 验收清单须覆盖：auto-disarm 后台写入与 marker 清除、retire 后迟到回调不写回、E/F 经统一反馈口、session_end 清理序列与 disposed/unresolved、上述两项文档项。
- codebase-tools 默认持久化行为不回退（session 边界从目标分支 payload seed）。

## Invariants

- 后台效果回调不获得 owner-key 解析式写/反馈 API；能力只由 delivery 授权、可保留、随 owner retire 失效。
- retained 句柄 retire 后：写为 no-op（不重建 State、不重发 marker），反馈被丢弃；session_end 本次投递的反馈口不在此限。
- `session_end` 的 owner 作用域是**正在结束**的 owner；本地资源停止先于远端注销；disposed 不注销、不通知。
- `enabled` 的写入仍经声明值写接缝完成，「handler 拥有写」不因后台路径改变；`enabled` 仍是唯一进入框架 State 的 connect-bot 声明值。
- 用户可见反馈只走统一反馈口 / model context 之外（对齐 04）。
- 原生 API 只出现在 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`（对齐 `import-boundary.test.ts` 的 ESCAPE_HATCH）。
- 框架公开接口只做 additive 变更（ADR 0002）。
