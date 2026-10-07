# 20: 原生边界、additive-only 与 ADR 0002 一致性

**What to build:** 原生边界有 ADR 级执行契约且被机械执行：逃生舱固定为框架适配层与扩展的 runtime 目录；共享源不 import 原生类型、不注册原生 hook；公开接口只做加法，放宽/绕过边界属非加法架构变更、必须在 ADR 0002 显式决策。ADR 0002 与 02/04/07 的已决项一致（含继承表述修正）。

**Delivers:** P1, P22

**Test owner for:** P1、P22

**Blocked by:** 02、03、04、05、06、07、08、09、10、11、12、13、14、15、16、17、18（全部实施票）

**Status:** ready-for-agent

- [ ] 机械边界测试覆盖本次全部新增模块后保持绿：共享源无原生 import、无指向逃生舱的相对 import；每个入口只做一次 re-export 且目标落在扩展的 runtime 目录
- [ ] 公开接口的本次变更全部为加法；若出现非加法改动，先在 ADR 0002 决策再落地
- [ ] 共享源 import 图不含 Agent 运行时类型（真实 loader 佐证）
- [ ] ADR 0002 记录三件事：逃生舱两处、测试作为执行点、放宽/绕过属非加法变更
- [ ] ADR 0002 与 02/04/07 已决项一致（含 subagent State inheritance 表述修正）
- [ ] 文档明确「测试通过」不等于边界成立：边界是词法、尽力而为、原则权威

**来源:** contract P1、P22；spec §1/§7、故事 57–61；lighthouse 08
