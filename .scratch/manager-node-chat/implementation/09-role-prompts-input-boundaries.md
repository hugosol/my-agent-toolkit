# 09: 首次启用指引与输入职责

**What to build:** 两个角色首次启用时实际收到各自完整工具指引，同时保留 Task 固定职能、本次工作输入与 extension 工具说明各自职责。通过 S1 交付。

**Delivers:** P26（技术部分）、P27

**Test owner for:** P26 的技术 coverage；H1 汇总归 12。

**Blocked by:** 05：批量派发与故障恢复；06：collect 长等待与报告待办

**Status:** ready-for-agent

依据：[获批契约](../contract.md)及其继承的 spec。仅交付 toolkit，不修改后端、不新增自主重试或第二套状态机。

## Acceptance criteria

- [ ] 捕获实际 omp Prompt 贡献，遵守 first-enabled-run 的既有身份与历史规则，普通重复轮次不重注入，不以切换重置注入记录。
- [ ] manager 指引覆盖全部 action、collect 原因与等待策略、依赖和终态限制、故障核实、recover／retry 区别、人工真实交接、部分效果与不自主重试。
- [ ] node 指引覆盖可交接时报告、产物地址和使用限制、报告不等于完成、允许后续收尾，以及已保存但通知失败不重报。
- [ ] 使用不同标记的 Task 固定文本、本次工作和角色指引核对实际输入；不复制 Bot 文档、完整 Map 或 user_input，不改变后端启动输入组合。
- [ ] Agent 完成指引演练并保留实际注入内容与故障演练证据；受控 provider 证据不能冒充真实模型工作结果。
- [ ] 运行所属分区、对应真实宿主 dock 及 TypeScript typecheck，修正指引后复验。

## P26 coverage partition

| Coverage item | Ticket | Test owner |
| --- | --- | --- |
| 实际注入、首次启用身份／历史规则、普通轮次不重复、两角色完整说明及指引演练证据 | 09 | 09 |
| H1 指引部分的证据汇总、反馈修正与复验 | 12 | 12；用户只作最终使用判断 |

P27 完整测试归本票。P26 在本票技术工作完成后仍不能宣称 H1 已通过；12 汇总唯一 H1，不新增独立人工关卡。
