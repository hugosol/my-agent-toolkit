# framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？：Lighthouse

> Question and discussion: [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)
>
> 2026-10-12 整票确认；[确认原话、被拒提案与源码／smoke 限度](../assets/http-capability-confirmation-2026-10-12.md)。本权威取代先前代理部分稿，尤其是显式选择代理时的缺配置回退规则。规划结案，不是生产实现或支持基线认证。

## Question

确定 harness-independent HTTP 的最小 request／response interface、认证输入、代理配置／选择、超时与错误语义、调用和测试 seam，以及 model-cost／connect-bot 的统一传输责任；不把 provider 业务或宿主自身网络搬进通用 HTTP。

## Discussion

### 通用传输与配置脱离宿主环境变量

framework 拥有通用 HTTP 传输和代理配置／执行；不以 PI_PROXY_*、HTTPS_PROXY 或其他宿主环境变量作为隐式兜底，不修改全局代理环境。业务决定 endpoint、method、headers、body、代理选择与预算。module 的深度来自统一代理解析、逐请求选择、超时执行和底层平台差异；删掉它，这些职责会重新散落在调用方，不靠新增结果格式、缓存或 provider 方法变深。

此前 HTTP extension 自有方向已被明确替代；当前接口与规则集中在本权威。具体源码组织和生产接线由装配票收口，不建立第二套 framework／YAML 解析系统。

### 小 interface 与直接响应

shared logic 直接导入 framework 公共 HTTP module，通过一个 request(url, options) 调用；沿现有 framework/public.ts 公共入口发布，不在 handler delivery 上再传 HTTP 能力。HTTP 不是 Owner／Session State，不新增会话绑定或生命周期取消保证；底层测试注入 seam 留 module 内，业务测试不必修改全局 fetch。

调用方按需提供 method、headers、body、timeoutMs、proxy；method 省略为 GET。认证以调用方准备的 headers 等请求数据传入，不增认证管理、自动 Bearer header、JSON 序列化或 getJSON／postJSON／余额／额度便捷方法。直接返回原生响应，调用方读取 status／ok／headers 和正文，不转换为另一套结果 envelope。

收到非 2xx 响应也正常返回 response，由业务解释。传输失败或超时使请求 reject；响应头已返回后，正文读取失败或 JSON 解析失败由相应 .text()／.json() reject。framework 不把失败变为 null、零余额／额度或 success/error 业务结果。

### 多个代理与逐请求选择

request 的 proxy:false 表示明确直连，省略也直连；字符串表示选取已配置的代理名。shared logic 每次决定选择，framework 查找配置并执行；不把 model-cost provider 路由内置到 framework，不新增 balanceProxy／usageProxy 业务配置字段或一层统一路由封装。connect-bot 继续明确传 false。

多个代理在 framework/config.yaml 的 http.proxies 中定义，代理名映射到含 url 的条目；URL 表达协议、地址与端口。http.defaultTimeoutMs 也在该共享配置中。复用 framework/core/config.ts 的现有读取／解析机制，补足所需结构支持；不再创建平行 YAML 解析系统。修改重启生效，不新增热更新。以下仅示例配置形状，不是新增生产文件或实际地址：

```yaml
http:
  defaultTimeoutMs: 30000
  proxies:
    codex:
      url: "http://127.0.0.1:7890"
```

本次支持 HTTP／HTTPS 代理；它们描述与代理的连接协议，不限制目标 URL 是 HTTP 还是 HTTPS。当前无 SOCKS 消费者，不预建 SOCKS 支持、测速、轮换或故障转移。协议及底层实现必须由装配／验收兑现，不因写出 URL 就宣称已支持。

### 配置缺失与运行失败：显式代理选择不回退直连

当前规则：

- proxy:false／省略：直连。共享配置文件不存在时，未显式选代理的请求仍可直连并采用内置默认超时。
- 显式指定代理名：共享配置文件不存在、没有代理表、条目不存在、选中 URL 非法、配置不能解析／读取，都报配置错误，不静默直连。
- 选中有效代理后连接失败／超时：传播本次运行失败，不自动直连重发，不增加第二次网络尝试。
- 非法配置值不静默替换为默认值；不自动修改配置或接管 harness 自身网络。

批准修订：此前 [账户访问会话](../assets/provider-access-confirmation-2026-10-12.md)确认的「代理配置缺失回退直连即可」已被本票 Q10 原话「请求选择了代理，但共享配置文件不存在，或没有代理配置表，报配置错误，不直连，其他几项同意」替代，并经整票总结确认。原因是显式选择必须被兑现，不能把未配置／拼错／损坏当作换路径的许可。此前政策仅作被替代历史，不作为并行现行规则。

### 超时预算与按需取消

公共 interface 用 timeoutMs，让业务直接表达预算，framework 内部利用底层超时／取消机制执行，不要求调用方手动创建 timeout signal。优先级：本次请求 timeoutMs → 共享配置 http.defaultTimeoutMs → 内置 30000ms；时间为有效正整数毫秒，0 不关闭超时，非法值不静默回退。配置可覆盖兜底，业务可覆盖配置，不把一个数值硬性用于所有消费者。

DeepSeek 5 秒／Codex 10 秒是业务预算而非 framework 默认；connect-bot 继续使用自身 requestTimeoutMs 配置。本轮结案不擅自改其业务数值。超时沿用旧 fetch signal 行为，覆盖等待响应及正文读取，响应头返回不解除；完整正文取得后的业务计算不计入 HTTP 超时。

先前「省略 timeoutMs 不设超时」的提案已由 Q11「省略时应当添加一个默认超时时间，防止程序无限等待」拒绝，Q13 确认 30 秒及可配置覆盖。先前要求调用方创建 timeout signal 的提案也被用户以复杂度拒绝；超时执行细节留内部。

调查当前消费者没有实际主动取消在途 HTTP 的调用需求；旧 Codex 注入的 signal 是超时输入，类型支持 signal 不是新功能的理由。本次公共 request 不提供主动取消 signal／controller／自建 token。若刷新票以后确认具体主动取消需求，先明确增补本权威，不预先承诺存在该能力；存储等待阶段取消是另一 module 的契约，不受本取舍撤销。

### 请求范围、adapter 与 Codex 原生 helper

[账户访问决议](04-provider-access.md)已确定：framework adapter 按需提供宿主当前身份／可用凭据／provider 地址，隐藏 authStorage／modelRegistry 和 OAuth 维护，shared logic 不取得 OMP 原生对象。model-cost 的主动 DeepSeek／Codex 查询全部走 framework HTTP，由 shared logic 准备地址、认证、proxy 和 timeoutMs；endpoint／请求与响应解释／header parser／窗口选择／额度估计／业务失败解释尽量留 shared logic。

旧 openaiCodexUsageProvider 和 parseCodexRateLimitHeaders 是旧代码使用的原生 helper，不因来自 OMP 包就自动成为 framework 能力；本票未批准必须保留 usage provider，也不为其预建第二套 fetch interface。必要代码复用或注入桥接必须服从上述职责，在装配票核对，不能把业务移回 adapter／HTTP，也不能让直接查询绕过统一传输或泄漏 OMP 类型。response 原生返回保留必要 fetch 风格接入条件，不创建额外业务格式。

harness 自己发出的模型推理／原生 OAuth 更新不自动受此代理配置控制；adapter 委托这些操作时遵循宿主自身网络机制，不能宣称接管。是否经过 adapter 不是判断网络归属的依据，实际执行传输者才是。观察模型响应头仅获取事实，不另发查询；业务解析不成为 framework 通用协议。

### connect-bot 统一传输而非改变业务

当前 connect-bot 使用 framework 命令／State／配置／生命周期，但 HTTP 是自己定义 PushTransport、OMP assembly 注入 globalThis.fetch。本次统一其底层传输到 framework HTTP，避免双轨；PushTransport 若失去独立职责则移除，而非永久叠层。

保留 pushEvent 的 endpoint 路径、envelope、JSON 序列化及注册回执解释，仍明确直连、采用自身请求超时；不顺带改 heartbeat、失败预算、状态机或会话协议。源码／公共 exports／测试 seam 的具体清理交装配与图外实施。

## Decision

framework 提供可直接导入的单一 request interface，统一代理选择／配置、可覆盖的有限超时和底层传输，直接返回原生响应。model-cost 与 connect-bot 的主动 HTTP 统一接入，凭据事实由 adapter 提供、provider 业务留 shared logic；显式代理选择缺配置失败，不接管宿主自身网络，也不预建主动取消或无消费者功能。

## User stories

1. As a extension 开发者, I want 通用传输与代理不依赖 OMP 环境变量, so that 接入其他 harness 不必模拟宿主代理约定。
2. As a extension 开发者, I want shared logic 直接调用 request 并逐请求选代理, so that 不同业务不用共用路由或传递无必要的 delivery 能力。
3. As a 用户, I want 显式选择代理后缺失或非法配置失败且运行失败不直连重试, so that 网络路径不会被静默改变。
4. As a 用户, I want 可配置默认有限超时且业务预算优先, so that 未设预算的请求不无限等待且原业务时间不被统一值覆盖。
5. As a 开发者, I want 原生 response 与失败语义保留, so that 调用方直接解析而不维护另一套结果格式。
6. As a 维护者, I want model-cost 和 connect-bot 统一传输且保留业务协议, so that 修复代理／传输只改一处而不改变既有业务状态机。
7. As a 开发者, I want adapter 只映射所需宿主资料、业务留 shared logic, so that 其他 harness 能复用业务而不泄漏 OMP 类型。
8. As a 维护者, I want 明确 framework 请求与宿主自身网络的范围, so that 代理保证可验证且不会虚称已控制 OAuth 或模型推理。

## Preconditions

- [账户访问](04-provider-access.md)、[消费归属](02-accounting-ownership.md)及[数据归属](12-state-data-contract.md)提供访问资料、单账号支持、身份和业务职责；秘密不写入日志／tracker／统计。
- framework/core/config.ts、framework/public.ts 与 [ADR-0002](../../../docs/adr/0002-semantic-extension-framework.md)继续作为配置／公共接口／native import seam 的组织基础；HTTP module 和嵌套配置支持尚未实现。
- 现有源码和本机 Bun 1.4.2 局部 smoke 支持旧正文超时行为；不代表固定 OMP 18.5.0 下的新能力已验收。
- [刷新决策](../decision/09-refresh-lifecycle.md)、[装配](../decision/10-assembly-layout.md)与[验收](../decision/11-acceptance-cutover.md)仍承担各自未决 scope，HTTP 结案不使其自动完成。

## Postconditions

- 刷新决策可以基于明确预算／默认及本次无主动取消的 interface 继续决定调度、single-flight、晚到读数、timer、退出及 headless；若提出必要新取消需求须显式修订，不能假定本能力已有。
- 装配决策消费 direct-import request、共享配置和三层职责，落实嵌套校验／路径解析／配置加载、底层代理／超时实现、原生 helper 复用与接线、connect-bot 清理及内部测试 seam；不重问已定接口或复制本权威规则。
- 验收决策覆盖直连／省略、多代理、显式缺配置／非法配置、运行失败无重发、超时优先级／默认／正文阶段、非 2xx 和解析失败、HTTP／HTTPS 代理、真实两源查询及 connect-bot 协议回归；不将宿主独立网络计为已控制。
- 本票全范围已决定；没有创建生产配置、实现 HTTP 或执行正式账号／迁移操作。具体场景与完成标准仍由验收票决定。

## Invariants

- 每项政策唯一权威在本 Lighthouse；消费者链接当前结果，不另存代理／超时副本或恢复被替代规则。
- 对齐现有配置 module 与 framework 公共入口；不建立平行 YAML／声明体系，不把 OMP native 类型带入 shared logic。
- model-cost 请求业务、header parser、窗口／估计／错误解释留 shared logic；HTTP 不拥有账号管理、provider 路由、业务缓存或刷新调度。
- proxy:false／省略明确直连；显式选择必须兑现或失败，缺配置和运行失败均不默换路径。
- 超时执行在内部、预算有限且可覆盖，响应头返回不解除正文阶段约束；不新增公共主动取消。
- 不增加自动重试、telemetry、测速、轮换、热更新、SOCKS 或接管宿主自身网络的保证。
- 规划确认、源码查阅和本机 timeout smoke 与生产实现／协议验证／固定基线支持分别记录。
