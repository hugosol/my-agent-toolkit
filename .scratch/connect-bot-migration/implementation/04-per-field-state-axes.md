# 04: per-field State 生命周期轴（memory 持久化 + 默认不继承）

**What to build:** State 字段按「控制类别 × 持久化 × 继承」三条 per-field 正交轴独立声明，控制与会话行为都按字段策略分支。connect-bot 的 `enabled` 用 `persistence: "memory"`：不写 session entry、不从分支 seed、owner 被替换归 default、同身份导航保持。继承开关默认 `none`（子代理读声明 default）；codebase-tools 显式声明 `follow`，保留既有「子代理跟随 main 激活值」行为。

**Delivers:** P3, P4

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] 字段可声明 `persistence`（`session-entry` | `memory`，默认 `session-entry`）与继承（`follow` | `none`，默认 `none`）
- [ ] `memory` 字段：不写 session entry、不从分支 payload seed、owner 被替换归 default、同身份导航保持当前值
- [ ] `session-entry` 字段行为不回退：分支/fork 从目标分支条目 seed，switch/resume 取目标会话自身值
- [ ] 未声明 `follow` 的字段在子代理读声明 default；codebase-tools 显式 `follow` 后子代理跟随行为不回退
- [ ] 既有 owner-inheritance 测试按新默认**改写**（不放宽、不删除），并新增 `memory` 反例
- [ ] 组合可共存：两个扩展用不同策略互不干扰，不引入第二份“当前值”权威
- [ ] ADR 0002 的 subagent State inheritance 表述与实现一致
- [ ] `docs/framework-capabilities.md` 同步

**来源:** contract P3、P4；spec §2、故事 11–15；lighthouse 02（含 backtracer 收口）
