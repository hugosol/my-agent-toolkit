# framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？

Type: grilling
Status: open
Assignee:
Blocked by: 04
Prerequisites: [账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

用户已要求请求 API 成为 framework 的 harness-independent 通用能力。确定其最小且有深度的 interface：request/response、timeout/取消、请求级代理与认证输入、错误结果、生命周期和注入 seam；DeepSeek 5s／Codex 10s 是业务预算还是通用默认？不凭空新增重试、telemetry 或任意验证。

如何支持 Codex 宿主 usage provider 的 fetch 注入，既不泄漏 OMP 类型，也不重复实现同一机制？connect-bot 现有 PushTransport 是否需要迁移到此实现以避免双轨，哪些只是业务封装？审查并同步 backlog 中 HTTP 扩展自有旧方向与架构契约，确认不是仅把 fetch 包一层的浅接口。
