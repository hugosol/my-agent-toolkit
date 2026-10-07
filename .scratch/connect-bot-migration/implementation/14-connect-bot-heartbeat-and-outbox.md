# 14: connect-bot 心跳与出站队列

**What to build:** 接入后每 10s 心跳携带当前状态（面板 keepAlive 的 30s 过期因此成立）；出站队列单 flusher 保序、上限 16、满时丢最旧 heartbeat、不重试；push 超时 ≤1.5s。面板 keepAlive 30s 过期由面板承担，扩展侧不实现任何 30s 逻辑。心跳由 assembly 的原生 managed timer 驱动，共享逻辑不接触原生 timer 类型。

**Delivers:** P30, P32, P39（managed timer 部分）, P26（稳态心跳行为部分）

**Test owner for:** P32、P39（managed timer 部分）

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] 心跳周期 10s 且携带当前状态；未接入或 off 后无心跳
- [ ] 出站队列：单 flusher 保序、上限 16、满时丢最旧 heartbeat、不重试
- [ ] register ≤1s、push/unregister ≤1.5s 超时；全部由 fake timers 驱动，不真等 wall-clock
- [ ] 扩展侧不出现 30s 逻辑（面板过期归面板）
- [ ] managed timer 只在 OMP assembly 取得并注入，共享逻辑不 import 原生类型
- [ ] E 层测试：10s 节奏、队列上限与丢最旧 heartbeat、保序、超时；`docs/agent-runtime-support.md` 同步 managed timer 行

**来源:** contract P30、P32、P39；spec §8、故事 70/73；lighthouse 01、06 §5
