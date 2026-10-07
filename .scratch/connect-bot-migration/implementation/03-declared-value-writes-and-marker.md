# 03: 声明值写接缝、handler 先于写、marker 框架所有

**What to build:** 任何 handler 投递都拿到「声明值写接缝」：handler 在 State 写入**之前**运行并拥有写，声明只表达字段所有权；每次声明值写入后由框架发布 marker。marker 区的摆放/行序（按扩展 id）/发布/清理由框架所有，扩展只提供文本，marker 由 `enabled` 派生——因此 `enabled=false`（off 或 auto-disarm）后 marker 必须消失。

**Delivers:** P5, P18

**Blocked by:** 02（`directed` 控制类别）

**Status:** ready-for-agent

- [ ] handler 在 State 写入前运行并拥有写；框架不代写、不覆盖、不 dedupe
- [ ] 每次声明值写入后框架发布 marker；写 false 即清除
- [ ] marker 行序按扩展 id；多扩展同区共存互不覆盖；未声明 marker 的扩展不受影响
- [ ] 既有 toggle 路径不回退（声明值写 → marker → 反馈的顺序，以及 codebase-tools 通知文案不变）
- [ ] F 层测试：写 true/false 后 marker 出现/清除、多扩展排序与共存、无 marker 声明为 no-op
- [ ] `docs/framework-capabilities.md` 同步

**来源:** contract P5、P18；spec §2/§4、故事 6/7/8/10/40/41/46；lighthouse 02、04
