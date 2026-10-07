# 后台效果与 session_end 清理如何取得框架能力与 owner 事实

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: resolved
Blocked by: 03, 04

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

---

## 承接约束

- （来源：[03 lighthouse](../lighthouse/03-lifecycle-effects.md)）框架行为先于扩展 handler 分发；owner 订阅只收 owner 自身事件；本地资源停止先于远端注销；managed timer 标 OMP-qualified。
- （来源：[04 lighthouse](../lighthouse/04-interaction-native-boundary.md)）统一 `info | error` 反馈接缝（命令 + 语义事件 handler 都可用、无 UI 落 stderr）、delivery 上的 `hasUI`、所有 handler delivery 的声明值写接缝；扩展工作数据由扩展自持 owner-scoped typed 记录；真实 sessionId 只在 `extensions/connect-bot/runtimes/omp.ts` 原生读取。
- **文档级收尾（本票一并裁定）**：
  - GLOSSARY 是否新增「统一反馈/通知通道（含 severity）」正式词条（`Marker area` 已有对等词条）；
  - 03 invariant 「adapter 是唯一命名原生 API 的模块」是否限定为「框架模块内」，以消除与 04 「OMP-qualified 原生集中在扩展 `runtimes/omp.ts`」的字面冲突。
- 本票解锁后为 06 的前置；06 的验收清单需引用本票结论。

---

## 讨论结果（2026-10-07）

### 1. 后台回调取得框架接缝的形态：保留的 owner 能力句柄（选项 a）

- 选定：handler delivery 提供 owner-scoped 能力句柄（声明值写 + 统一反馈），扩展在 arm 时存入自持 `BotSession` 记录；heartbeat/outbox 回调复用同一句柄。不新增 owner-key 解析式框架 API，也不把效果交给框架托管（timer/outbox 依 03 留扩展）。
- 存活规则（一并钉死）：
  - 句柄只在 owner 存活期间有效；框架行为先于扩展 handler，session_end 由框架先 retire。
  - retained 句柄在 retire 后失效：写为 no-op（不重建 State、不重发 marker），反馈被丢弃，避免迟到回调写回或发误导通知。
  - session_end **本次投递**自带仅本次可用的反馈口，扩展 session_end handler 仍能发 G。
  - 扩展在 session_end handler 顶部**同步**停本地 timer（先于任何 await）；扩展自持记录/守卫是第二道防线。
- 驳回：(b) owner-key 解析式 API（把 `enabled` 变成「有 key 就能写」、掏空 02「handler 拥有写」、新增 owner 查询面）；(c) 框架托管效果（与 03 managed timer 归扩展冲突）。

### 2. 后台回调路径不需要 `hasUI`

- 选定：保留句柄只带写接缝与反馈口。`main + hasUI` 门槛是命令期事实（04 §2）；E/F 是已 arm owner 的效果通知，无 UI 时反馈口自身落 stderr。

### 3. session_end 的旧 owner 字段与清理序列

- 选定：`session_end(transferred|disposed)` 的 `owner.key` = **正在结束的 owner**（也是该投递的 owner 作用域）；扩展据此定位自持记录。
- `previousOwnerKey` 在拆分为 session_end + session_start 后冗余 → 从语义投递移除；04 §8b 与 user story 15 据此修订。
- 序列：`transferred` = 同步停本地效果 → 经本次投递反馈口发 G（info）→ 对记录中的真实 sessionId best-effort unregister（沿用 1.5s 超时，本地停止先于远端）→ 删记录；`disposed` = 同步停本地 → 删记录，不注销、不通知，交面板 30s 过期；`owner.kind !== "owner"`（inherited/unresolved）= no-op；session_end 不写 `enabled`。

### 4. GLOSSARY 新增 `Extension feedback（扩展反馈）` 词条

- 选定：框架所有、运行时无关的操作员通知通道，带 `info | error`；扩展从命令与语义事件 handler 经它发反馈，框架映射到 UI 通知或无 UI 时的 stderr；永不进入 model context（与 `Marker area` 对等）。

### 5. 03 invariant 作用域改写

- 选定：把《生命周期映射与持续上报由哪一层负责》的 invariant「adapter 是唯一命名原生 API 的模块」改写为与 `tests/framework/import-boundary.test.ts` 实际规则一致：**框架共享源（framework core/behaviors/definition）与扩展非 `runtimes/` 模块不命名/不导入原生 API；原生访问只允许出现在 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`**。旧措辞写于 04 之前，属 stale。

### 附带澄清（事实，非决策）

- `enabled` 在 session_end 的行为按 persistence 声明区分：connect-bot 为 `persistence: "memory"`（02 §4）→ owner 变更即回 default `false`、新 owner 不从分支 seed；codebase-tools 省略 `state`、用默认持久化字段（写 session entry）→ session 边界从目标分支 payload seed，是否保真属 06 的「codebase-tools 不回退」验收项。本次不改 codebase-tools 行为。