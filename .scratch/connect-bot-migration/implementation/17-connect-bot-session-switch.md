# 17: connect-bot 会话切换、退出清理与句柄复用

**What to build:** 会话切换/分支且 id 变化时：**同步**停本地效果（先于任何 await）→ 经 `session_end` 本次投递的反馈口发切换通知（info）→ 对记录中的旧真实 sessionId best-effort 注销（≤1.5s 超时，本地停止先于远端）→ 删记录；新会话保持未接入。`disposed`（退出/崩溃）只停本地并删记录，不注销、不通知，交面板 30s 过期。同身份导航是彻底 no-op。扩展不注册原生 `session_shutdown` hook；后台 timer/outbox 回调复用 arm 时取得的 owner-scoped 句柄。

**Delivers:** P34, P35, P15, P40（session_end 清记录部分）, P37（切换文案 + 全表收口）

**Test owner for:** P34、P37、P40

**Blocked by:** 09、16

**Status:** ready-for-agent

- [ ] id 变化：同步停本地 timer → 发切换通知 → best-effort 注销旧真实 sessionId（≤1.5s）→ 删记录；新会话未接入
- [ ] 同身份导航（`/reload`、同文件 `/resume`、`/clear`、TUI `/branch`、`/tree`）是 no-op：本地效果不断、无通知
- [ ] `disposed`：只停本地并删记录，不注销、不通知；离线由面板 30s 过期兜底
- [ ] `owner.kind !== "owner"` 时整个清理 no-op
- [ ] 扩展不注册原生 `session_shutdown` hook（由边界测试与本票用例共同保证）
- [ ] 后台 timer/outbox 回调复用 arm 时取得的句柄；句柄失效后迟到回调不重建 State、不重发 marker
- [ ] `selectFeedback` 文案表（A–J，除未知参数 `offline`→`off` 外原文保留）在本票收口为全路径覆盖；不按数字状态码分支
- [ ] E 层测试：切换、同身份 no-op、disposed、句柄失效后的迟到回调、文案全表

**来源:** contract P15、P34、P35、P37、P40；spec §5/§8、故事 21/28/29/30/31/32/33/42/43/77/78；lighthouse 01 修订 2、04、07
