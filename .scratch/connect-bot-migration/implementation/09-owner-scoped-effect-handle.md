# 09: owner-scoped 可保留能力句柄与 retire 失效

**What to build:** 后台效果（心跳 timer、出站 flusher）不需要新框架 API：handler 投递提供一个 owner-scoped、可保留的能力句柄（声明值写 + 统一反馈），扩展在 arm 时把它存进自持记录，供 timer/outbox 回调复用。句柄只在 owner 存活期有效——owner retire 后写为 no-op（不重建 State、不重发 marker）、反馈被丢弃；但 `session_end` 的**本次投递**自带仅本次可用的反馈口，扩展仍能发出会话切换通知。句柄不带 `hasUI`。

**Delivers:** P12, P13

**Blocked by:** 03、05、06

**Status:** ready-for-agent

- [ ] handler 投递给出可保留的 owner-scoped 句柄（声明值写 + 统一反馈），不依赖任何原生类型
- [ ] owner retire 后经句柄写为 no-op：不重建 State、不重发 marker
- [ ] owner retire 后经句柄发的反馈被丢弃
- [ ] `session_end` 本次投递的反馈口仍可用（切换通知不因 retire 丢失），且仅本次投递有效
- [ ] 句柄不暴露 `hasUI`（后台回调路径不需要）
- [ ] F 层测试：retire 前写生效；retire 后迟到回调 no-op 且无 marker 重发；`session_end` 通知仍发出、后续投递的反馈口不再可用
- [ ] 能力文档同步

**来源:** contract P12、P13；spec §5、故事 27–30/47；lighthouse 07
