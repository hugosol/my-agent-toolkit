# framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？

Type: grilling
Status: resolved
Assignee: hugos（本会话 agent 协助讨论）
Blocked by: 04
Prerequisites: [账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

Lighthouse: [HTTP 能力决议](../lighthouse/05-http-capability.md)

## Handoff

- 当前恢复点：整票总结获用户「可以，请继续」确认，已发布 [HTTP 能力决议](../lighthouse/05-http-capability.md)。本票无剩余决策问题；规划结案不代表生产实现。
- 确认与证据：[本轮原话及源码／smoke](../assets/http-capability-confirmation-2026-10-12.md)。缺配置直连的旧部分稿已在原 HTTP 权威修订；其他票只消费该权威，不另建副本。
- 原 Question 的 Codex usage provider 注入问题已按三层职责收束：不批准必须保留 native helper，不因复用移动业务；必要复用／接线在装配票的现有 scope 内核对，HTTP 不新增 Codex 专用能力或公开 signal。
- 未采用：另一套 response envelope、要求业务自建 timeout signal、省略预算无限等待、balanceProxy／usageProxy 字段、delivery 注入 HTTP、无消费者的主动取消／SOCKS、重复确认已有归属。相关原因与纠正保留于确认依据，具体政策只在 Lighthouse。
- 证据限度：只运行本机 Bun 1.4.2、loopback 随机端口的正文超时探针；未运行新 HTTP、代理协议、真实账号、固定 OMP 基线、connect-bot 迁移或 UI。
- 下游恢复：刷新票决定剩余调度／晚到响应，装配票落实配置加载／exports／底层实现／原生复用和消费者清理，验收票决定完整场景与证据；均读本权威，不据此视为已完成。
- 下一 ready 问题：本票没有；后续按 tracker frontier 选取，不在本会话结案第二张非 research 票。发布后实际 Bun 校验通过：13 张票的依赖无环、42 个本地链接目标存在、Status／单一 Handoff／Lighthouse 章节／地图与架构导航一致；按编号下一张为 [/budget 的参数、操作与状态如何在新框架表达？](07-command-state.md)，刷新票也已满足全部票级依赖，均未认领。
- 回溯结果：已核对账户访问、行为、消费归属、数据归属和 ADR-0002 的相关前提及全图当前 Question／状态。身份／认证与 native seam 有已决 provider；配置／公共 exports／原生复用／connect-bot 迁移由装配票现有 scope 覆盖，真实网络／协议／正文超时／回归由验收票覆盖，调度／晚到响应由刷新票覆盖。未发现需新开票的意图／层次／peer 缺口或待用户裁定冲突，不改其他票的 Handoff／claim。旧消费者中「HTTP 部分／缺配置直连」交接描述须按原 HTTP 权威的本轮明确修订理解，不作为独立现行政策；未来主动取消需求不能据旧 Question 推定已提供。

## Question

用户已要求请求 API 成为 framework 的 harness-independent 通用能力。确定其最小且有深度的 interface：request/response、timeout/取消、请求级代理与认证输入、错误结果、生命周期和注入 seam；DeepSeek 5s／Codex 10s 是业务预算还是通用默认？不凭空新增重试、telemetry 或任意验证。

如何支持 Codex 宿主 usage provider 的 fetch 注入，既不泄漏 OMP 类型，也不重复实现同一机制？connect-bot 现有 PushTransport 是否需要迁移到此实现以避免双轨，哪些只是业务封装？审查并同步 backlog 中 HTTP 扩展自有旧方向与架构契约，确认不是仅把 fetch 包一层的浅接口。
