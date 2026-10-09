# 账户凭据、provider 地址和代理如何跨 seam 提供？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

确定 framework adapter 提供哪些通用 provider／账户事实和 credential resolution，model-cost 保留哪些 DeepSeek balance／Codex usage endpoint、窗口选择及 parser？旧实现访问 OMP OAuth storage、usage provider、header parser 和 request-scoped proxy，不能直接移入 shared logic。

明确当前模型账户与旧“第一个 Codex 账户”选择是否一致、账户切换隔离、鉴权失败、不兼容 native API、provider base URL、代理配置来源及 Codex 禁止无代理直连的业务要求。不得把 token 写入日志、tracker 或决策文档，不改全局 HTTPS_PROXY。判断如何提供安全且可复用的小接口，避免镜像完整 modelRegistry。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：账户是 provider 计费／额度身份，跨独立会话与进程共享账户范围，不同账户隔离；请求发出后切换不得改变旧请求账户归属。主会话与每个子代理可能使用不同账户。
- 待决定：如何可靠关联实际请求与账户身份，包括多 Codex 账户、credential 更新与账户切换；无法取得可靠身份时如何拒绝或标记不足，不能将未知账户并到共享默认账户。额度成对读数、内存缓存与持久化 estimate 都须有账户身份，不能以 owner／进程／第一个 Codex 账户代替。
