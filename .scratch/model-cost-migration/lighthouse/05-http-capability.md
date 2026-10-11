# framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？：Lighthouse

> Question and discussion: [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)
>
> 部分发布：仅代理配置、选择责任和回退原则已确认，来源为[账户访问会话的 filename 定向确认](../assets/provider-access-confirmation-2026-10-12.md)。本票仍 open、未认领，Question、依赖与其他范围不变。没有生产实现。

## Question

确定 framework harness-independent HTTP 的最小 interface、代理／认证／timeout／取消／错误语义、注入 seam 与消费者迁移。此处只发布已确认代理原则，不批准余下 interface 或配置字段。

## Discussion

### 通用传输与配置脱离宿主环境变量

用户要求 framework 提供 HTTP 请求代理能力，配置地址及端口，不假设其他 harness 使用 OMP 的 PI_PROXY 环境变量约定。代理的开关、可用配置和选择由 framework 能力承接；不以 PI_PROXY_* 或其他宿主环境变量作为隐式兜底来源，不修改全局 HTTPS_PROXY。

原 backlog 的 HTTP extension 自有方向在本次迁移中被明确升级为 framework 通用能力；业务 endpoint、parser、查询规则仍归 extension。具体模块／公共 exports／配置入口尚未定型，复用现有配置模块与声明 seam，不新建平行配置系统。

### 多个代理与逐请求选择

用户 Q7 修正的是能力形状，不是批准「所有请求一个共享代理」：允许多个代理配置，根据每次请求具体情况动态选择。用户 Q8 确认由请求发起方选择是否启用代理以及选哪个已配置代理；framework 解析配置并执行。model-cost 可按 provider／操作选择，其他消费者按自己的需要选择。

framework 不内置 model-cost 的 provider 路由业务，不默认引入测速、自动轮换或故障转移；地址／端口之外的必要协议信息、配置位置／schema、选择表达方式和默认值仍属本票未答范围。

### 配置缺失与运行失败的明确区分

旧 model-cost 的「Codex 无代理不查询」及本会话早期强制拒绝提案已被用户 Q6 原话「代理配置缺失回退直连即可，其他都同意」替代。当前允许关闭代理直连；缺少代理配置时可直连。

已配置并选用代理后的连接失败／超时是运行时失败，返回此次请求失败，不自动直连重发。用户 Q9 明确「不应混淆代理配置缺失和运行时代理失效两个场景」。不据此增加重试或第二次网络尝试。配置非法、引用未知选择名等具体错误分类不在本次确认中自行归为缺失，仍由本票收口。

### 请求范围与宿主网络层

framework 自身发起的 Codex 请求使用统一 HTTP 能力及逐请求选择，不由 extension 私下 fetch 绕过；这并非所有 Codex 请求强制代理。harness 自己发出的模型推理／原生 OAuth 更新请求不自动由此配置控制，除非其 native 接入支持所需传输 seam。adapter 委托宿主的 OAuth 更新不能被宣称已接管；接线和验证由装配／验收落实。

## Decision

framework HTTP 提供与宿主环境变量解耦的代理开关、多个代理配置及逐请求选择；发起方决定选择，framework 执行。代理配置缺失允许直连，运行时代理失败不自动直连重试；完整 HTTP／配置／错误 interface 尚未决定。

## User stories

1. As a extension 开发者, I want 通用请求代理配置不依赖 OMP 环境变量, so that 其他 harness 不必模拟同一环境变量约定。
2. As a extension 开发者, I want 每个请求可选择代理或直连, so that 不同请求无需被迫共用一个代理。
3. As a 用户, I want 缺配置与运行失败分开处理, so that 合法直连不会被拒绝且选用的代理失效不会被静默绕过重试。
4. As a 维护者, I want framework 自身请求统一执行但不声称接管宿主网络, so that 代理保证有清楚且可验证的范围。

## Preconditions

- [账户访问决议](04-provider-access.md)提供凭据／身份／地址职责；认证秘密不写日志或统计。
- 现有 framework 配置模块与 ADR-0002 的 shared/native seam 继续适用；共享 HTTP 配置的具体接入尚未实现。
- 本票尚需确认 request／response、timeout／取消、失败 interface、认证输入、配置 schema／协议支持、fetch 注入及 connect-bot 调用方迁移。

## Postconditions

- [装配决策](../decision/10-assembly-layout.md)消费已确认代理原则，具体 exports／注入由完整 HTTP 结果收口。
- [验收决策](../decision/11-acceptance-cutover.md)需区分直连、逐请求不同代理、缺配置及运行失败不重试，不将宿主独立请求算作 framework 已控制。
- 本票未完成，原依赖和其他 unanswered scope 保留；不声称网络路径已经运行。

## Invariants

- 对齐 framework 现有配置模块和 ADR-0002，不建立另一套 YAML／能力声明或把 OMP native 类型带入 shared logic。
- 代理配置不存在与代理运行失败不同；后者不触发自动直连重试。
- Endpoint／业务路由不进入 framework 通用传输规则；动态选择权在请求发起方。
- 不承诺固定超时数值、配置热更新、自动重试、测速、轮换或接管原生模型请求。
