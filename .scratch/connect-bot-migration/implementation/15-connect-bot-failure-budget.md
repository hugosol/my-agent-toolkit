# 15: connect-bot 失败预算与 auto-disarm

**What to build:** 连续 3 次推送失败（≈30s）后自动解除接入并通知，且**不自动重连**；失败段首次失败通知一次、最终 auto-disarm 再通知一次；任一成功推送复位失败计数与首次标志。auto-disarm 经 09 的 owner-scoped 能力句柄写 `enabled=false`，marker 随之清除。

**Delivers:** P31, P37（失败段文案部分）, P36（auto-disarm 清除部分）, P40（auto-disarm 清记录部分）

**Test owner for:** P31

**Blocked by:** 14、09

**Status:** ready-for-agent

- [ ] 连续 3 次失败（≈30s）触发 auto-disarm：本地断开、状态归零、marker 消失、不自动重连
- [ ] 失败段首次失败通知一次；auto-disarm 通知一次；不重复刷屏
- [ ] 任一成功推送复位计数与首次标志（下一段失败重新通知一次）
- [ ] auto-disarm 经 owner-scoped 能力句柄写 `enabled=false`，不直接写框架 State
- [ ] auto-disarm 后自持记录与出站队列清理干净，无残留 timer
- [ ] E 层测试：首次失败通知、第三次失败 auto-disarm、成功复位、通知去重、句柄写入使 marker 清除

**来源:** contract P31、P36、P37、P40；spec §8、故事 71/72；lighthouse 01、04、07；M 层观察清单步骤 H
