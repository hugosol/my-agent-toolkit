# 21: Release gate 与人工交接包

**What to build:** 在记录的源/运行时基线上跑全量 `bun run test` 全绿作为 release gate；核对证据集不含非证据项；确认被有意修改的历史约束只在迁移侧产物同步断言、原仓库保持冻结；产出 M 层人工观察清单（步骤 A–M 的操作/观察点/预期）与 run record 交接包，标明哪些已验证、哪些待人工确认。

**Delivers:** P43, P45

**Test owner for:** P43、P45

**Blocked by:** 01、18、19、20

**Status:** ready-for-agent

- [ ] 全量 `bun run test`（framework + codebase-tools + connect-bot extension + harness）在记录基线上全绿
- [ ] typecheck 通过
- [ ] 证据集核对：无 mock 自证、无源码文本断言、无 pty 脚本、无顺带默认值断言、未重复测试框架既有能力
- [ ] 有意修改的历史约束（marker/通知移入框架 marker 区与统一反馈口、`offline`→`off`、缺文件由默认+告警改为 error+不加载）只在迁移侧产物同步断言；原仓库无改动、无红断言残留、无断言被弱化
- [ ] 人工交接包：M 层清单步骤 A–M（含前置、操作、观察点、预期）可直接照做；run record 已填基线并留每步结果与截图/日志位
- [ ] 明确列出尚待人工确认项（真实集成、切换/回退、最终判断）与其已备证据

**来源:** contract P43、P45；spec §12/Testing Decisions、故事 90/91/95/96；lighthouse 06 §7/§8/§10
