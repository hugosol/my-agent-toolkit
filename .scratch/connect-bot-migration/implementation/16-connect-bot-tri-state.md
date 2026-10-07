# 16: connect-bot 三值 agent 状态机与生命周期接线

**What to build:** 面板反映真实状态：arm 后按 idle 事实取「空闲/工作中」，`round_start`（main）→「工作中」，`round_end` →「等待用户输入」；稳态下只在**真变化**时 push，而 arm/re-arm 无条件上报一次。三值状态留在扩展自持 owner-scoped 记录，不进框架 State（框架 State 里 connect-bot 只有 `enabled` 一个声明值）。

**Delivers:** P33, P6（三值不进框架 State）

**Test owner for:** P33、P6

**Blocked by:** 11、14、06、07

**Status:** ready-for-agent

- [ ] arm 后按 idle 事实取「空闲/工作中」；arm/re-arm 无条件上报一次状态
- [ ] `round_start`（main）→「工作中」；`round_end` →「等待用户输入」
- [ ] error/abort 等兜底终态不卡在「工作中」；7 类终态中可隔离的 5 类由本票 E 层覆盖（abort 与无 assistant 由 M 层复现）
- [ ] 稳态下只在真变化时 push；心跳不迁移状态、不重复提示
- [ ] 子代理的 round 事件不影响 main 的状态
- [ ] 三值状态保存在扩展自持记录；框架 State 只含 `enabled`，不出现第二个「当前值」
- [ ] E 层测试：初值、两条边沿、真变化才 push、arm/re-arm 无条件上报、终态覆盖

**来源:** contract P6、P33；spec §8/§9、故事 14/48/74/75/76；lighthouse 03、04、06 §4
