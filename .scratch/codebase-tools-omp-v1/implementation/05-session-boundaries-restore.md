# 05: 会话边界、恢复与 `/tree`

**What to build:** 会话边界（session start / switch new|resume|fork / branch 新身份）从目标 branch 末条 state entry seed `enabled`（无则 off）并退役旧 cell；同一会话存续期内活动映射权威、不重读持久化。`/tree`（同 sessionId、仅 leaf 变）不 seed `enabled`，只重算 init 进度，使 State 表现为会话全局变量而非 branch 内容投影。非法/未知 state 数据（含旧 `{on}`）一律回落 off。新实现自身往返：新写 `{enabled}` → 重启/resume 读回 `{enabled}`。同时固定语义钩子映射：session start/switch 与「每用户轮一次」的语义钩子分离，为注入与 marker 提供触发点。

**Delivers:** P5、P7、P10；C6（session start/switch 映射部分）

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] resume 恢复激活值；无 entry、非法数据、旧 `{on}` 数据一律回落 off（B8、N5）
- [ ] `new` / `fork` 得到 off；seed 取自目标 branch 末条 state entry，last-wins
- [ ] `/tree` 不改变 `enabled`，只重算 init 进度
- [ ] 同一会话存续期内不重读持久化，界内当前值为权威
- [ ] 新写 `{enabled}` → 重启/resume 读回 `{enabled}`（只验证新实现自洽，不验证旧→新或新→旧兼容）（C4）
- [ ] 边界 seed 原子替换 cell，旧 cell 被退役
