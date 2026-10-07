# 12: connect-bot 幂等重注册与接入失败

**What to build:** 面板重启后，用户再执行一次 `/connect-bot` 就能立刻重连：已接入时重复执行走**重发注册**而不是 no-op，不新增面板行、不闪烁；注册失败（reject 或超时）时报错并保持未接入，且不留残留定时器或网络动作。

**Delivers:** P24, P25

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] 已接入时重复 `/connect-bot` 重发注册，不先 unregister、不新增行、不闪烁
- [ ] 重发成功回带的在线会话数一致（面板计数不因重复注册增长）
- [ ] arm 失败（reject 或超时 ≤1s）报错、保持未接入、不出现 marker
- [ ] 失败后无残留定时器/网络动作（fake timers 下断言无 pending 网络与心跳）
- [ ] 失败可重试：再次执行 `/connect-bot` 能成功接入
- [ ] E 层测试覆盖以上；不改面板协议

**来源:** contract P24、P25；spec §8、故事 63/64；lighthouse 01
