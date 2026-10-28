# 06: collect 长等待与报告待办

**What to build:** 管理者通过 collect 使用独立长请求预算等待或立即收取后端现场，得到真实返回原因和不含报告正文的待办摘要；阅读不会改变交接待办与报告适用性。通过 S1 及预算相关 S2 观察交付。

**Delivers:** P9、P17、P18

**Blocked by:** 04：管理者现场查询与显式状态动作

**Status:** ready-for-agent

依据：[获批契约](../contract.md)及其继承的 spec。仅交付 toolkit，不修改后端、不新增自主重试或第二套状态机。

## Acceptance criteria

- [ ] collect 使用独立配置的完整请求预算而非普通短预算；以较短后端期限、较长 collect 预算和更短普通预算分别观察等待成功、客户端预算耗尽。
- [ ] 核对后端默认 5400 秒与客户端建议 5460000 毫秒的关系，不声称较大预算保证所有等待成功，不增加自动预算同步。
- [ ] 以独立预期覆盖 paused、completed、notification、no-running、timeout 五种结果，保留快照及不含正文的待办摘要。
- [ ] 覆盖无 running 防空等、有 ready 且仍有 running，不强制 ready 时立即返回，不重造报告正文。
- [ ] 覆盖完成前反复 collect、completed 后报告、旧／新执行报告交错；适用报告标识与待办遵从后端，不因已读清除或把旧报告替换为新执行依据。
- [ ] 验证已保存报告不因辅助通知失败而不可收取；使用隔离后端前置数据准备历史执行，无需以 05 为阻塞。
- [ ] 通过实际工具验证，运行所属分区、对应 dock 和 TypeScript typecheck，更新 collect 预算及待办说明；真正宿主取消检查归 07。

本票独占 P9、P17、P18 的契约测试。
