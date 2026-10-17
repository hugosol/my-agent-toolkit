# 08: 子会话自行记账，Owner 按成功提示或重连同步

**What to build:** 响应 usage 只由实际执行会话累计并保存；Owner 的远端观察和重连不重复计费或代写。确认提交成功后发送提示，Owner 只读采用消费文件实际内容；丢失提示后，有效重连仍触发只读同步恢复记录。

**Delivers:** P16, P17, P19

**Blocked by:** 05 — 重连恢复快照，失效撤销读数但保留身份。

**Status:** in-progress — 本票实现、测试与证据已完成并提交在本分支（`hyper/framework-subagent-observation/08-local-accounting-owner-sync-a9eed4-e98ea402077c`，基于集成分支 `hyper-tdd` 的 `89ebaa2`）；尚未合入 `hyper-tdd`（合入由宿主排队执行），故不置 `closed`。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P16、P17、P19 全部 coverage 与测试，保持活动消费文档为唯一消费权威，不通过 IPC 累计快照建立第二套账。

- [x] 使用独立给定的两会话 usage 算例核对 Direct session totals 与 Inclusive session totals，每笔请求仅计一次；远端观察、快照和重连不产生重复累计。
- [x] 实际子进程提交证据与 Owner 同步行为共同证明写者归属，Owner 不代写子记录。
- [x] 阻止 Owner 自身消费提交后，子会话保存仍使 Owner 看到新记录；Owner 接收成功提示只读采用文件内容，不采用提示携带的消费累计，不产生写入。
- [x] 失败保存不发送成功提示；成功提示只在确认提交后发生，不把开始保存或停止等待当作成功。
- [x] 丢弃一次成功提交提示，断开再接入；Owner 无自身消费或提交仍能通过只读同步看到文件中的新记录。
- [x] 只读同步复用存储基线与既有失败政策，不变成初始化、强制保存或轮询，不为观察或重连重放 Turn／Round。
- [x] 按仓库测试规范执行计费、存储及受影响消费者分区，TypeScript 变化执行 typecheck；通过真实进程、存储访问／提交证据和实际 Owner 表面验收并记录限制。

## 本票执行记录（2026-10-17，实现完成后交集成复核）

本票补齐的缺口是**提交成功提示的发布与接收**：既有实现已有自身协调提交（`ConsumptionStore.commit`）、
只读同步（`runtime.synchronize`）与 Round 结束按自身身份保存（`save()`），但没有任何一方把「某会话自己的写入
真的落地」告诉服务其 Owner 的进程。

实现：框架新增提交轴（`ObservedSession.commits`/`SessionObservation.commits`、`session_commit` 事件与交付类型、
`SessionObservations.observeCommits`/`recordCommit`、观测帧编解码、`ImplementationContext.recordSessionCommit`
与 binding 的记录＋转交＋派发），model-cost 在确认提交后发提示并把 `session_commit` 接到只读同步
（`save()` 的 `saved`/`unchanged` 分支、`runtime.ts` 的处理器、pi/omp 装配接线），并同步四份文档
（`framework/GLOSSARY.md`、`framework/docs/framework-capabilities.md`、`extensions/model-cost/GLOSSARY.md`、
`extensions/model-cost/README.md`）。

证据与逐项对照：见 [evidence/08-local-accounting-owner-sync-evidence-2026-10-17.md](evidence/08-local-accounting-owner-sync-evidence-2026-10-17.md)
（`bun run typecheck` exit 0；`bun test tests/model-cost` 488 pass / 0 fail；`bun test tests/framework` 573 pass / 0 fail；
六个变异注入逐项变红后还原为绿；真实子进程提交 + 插桩写入证据 + 文件字节比对；`tests/connect-bot` 的 5 个失败
为缺少真实 omp-bot 面板二进制的环境前置，与本票无关）。

未验证：真实宿主 CLI（OMP/pi）与 `tests/harness-dock`、POSIX 载体、其他宿主/提供方版本；提示合并与周期保护属票据 09。

