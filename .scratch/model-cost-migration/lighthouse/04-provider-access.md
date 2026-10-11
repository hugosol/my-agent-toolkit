# 账户凭据、provider 地址和代理如何跨 seam 提供？：Lighthouse

> Question and discussion: [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)
>
> 2026-10-12 整票已确认；[确认原话与源码证据](../assets/provider-access-confirmation-2026-10-12.md)。这是规划结案，不是生产实现或支持基线认证。

## Question

在 model-cost 当前单账号使用范围内，如何以 harness-independent 的小 interface 接入宿主当前身份／凭据／provider 地址，让余额、额度及消费隔离无需直接依赖 OMP 原生对象？HTTP 代理与初始化调度的确认分别由其 owner 持有。

## Discussion

### 三层职责与按需接入

用户 Q1 同意三层拆分，Q10 明确「adapter功能先按需实现接入，如果没有扩展需要账号管理功能，则无需接入」。framework 提供 extension 所需的小 interface；adapter 接入宿主当前已生效的身份、凭据解析及 provider base URL，隐藏 OAuth 更新、credential storage 与原生配置访问。shared logic 不取得 modelRegistry／authStorage 原生对象，也不镜像完整宿主 interface。

model-cost 持有 DeepSeek 余额／Codex 额度 endpoint、请求与响应解释、窗口选择和 parser 等业务。OMP 现成 usage provider／header parser 的存在不是把业务协议归入 framework 的理由；必要 native 桥接遵循 ADR-0002，具体接线由装配决定。framework HTTP 提供通用传输，代理不再由 OMP adapter 的环境变量约定决定。

### 单账号、允许替换与身份取舍

支持范围、原多账户要求的明确收窄，以及 DeepSeek 凭据身份取代平台账号识别的 tradeoff，在原[消费归属权威的账户主题](02-accounting-ownership.md#账户隔离多会话与额度)修订；本票消费该单账号／允许替换结果，不另存身份规则或账号管理政策。

获取资料不能永久绑定首次账号；新操作取得宿主当前已生效的资料，本次操作固定使用该身份与认证资料，后来替换不重解释旧操作。外部修改凭据何时被运行中的宿主加载，依赖宿主 reload／重启机制，不承诺热检测／立即生效。初始化不依赖首次模型调用来发现账号。

所需资料仅包括 provider／统计身份、本次操作可用认证资料、适用的已解析 base URL；不是完整账号列表／选择／增删管理。认证秘密仅用于运行期请求，不写入统计文件、日志或 tracker。DeepSeek 稳定非秘密统计标识的具体构造、跨进程一致性和 native 账号替换映射由装配落实，不凭 local credentialId 冒充 provider 平台账号 ID。

### 业务查询地址

DeepSeek base URL 读取宿主配置；model-cost 沿旧行为去掉末尾 `/v1` 后请求 `/user/balance`，缺少地址时沿用 `https://api.deepseek.com` 官方默认值。余额路径／默认值由业务代码持有，不新增独立余额 endpoint 配置。

Codex 额度 endpoint 与协议由 model-cost 代码持有，不把模型推理 base URL 当额度地址，不新增独立额度 endpoint 覆盖配置。provider／模型官方分类与名单仍归模型覆盖票，本主题不扩大分类。

### 访问失败局部收口

用户 Q11 同意：凭据缺失、OAuth 更新失败或 native 接入不可用时，相应余额／额度查询返回明确失败，不猜账号、不借其他凭据、不把失败显示成零；另一 provider 的查询继续。该失败不阻断模型执行、不改变 harness 自己的模型推理认证策略。提示承载由展示票决定，不新增重试／补账／持续完整性状态。

### 跨票确认的唯一权威

- [HTTP 代理部分决议](05-http-capability.md)：用户在 filename 标识的 owner 下确认独立于宿主环境变量的代理开关／多个配置／逐请求选择，以及配置缺失直连、运行失败不自动直连重试。此前「Codex 禁止无代理直连」已由用户 Q6 显式替代；本票不复制 HTTP 规则。
- [初始化预取部分决议](09-refresh-lifecycle.md)：初始化并行查询已配置的两源，首次模型请求前等待查询成功／失败／超时；不是禁止输入或初始化失败阻断 agent。本票只提供初始化可取得的访问资料。

## Decision

adapter 按 model-cost 的单账号当前访问需求接入宿主身份／凭据／地址，framework 提供小型无原生对象 interface，provider 查询业务留在 model-cost。单账号支持及 DeepSeek 身份 tradeoff 以修订后的消费归属权威为准，传输和初始化时序分别消费其 owner 的部分决议。

## User stories

1. As a 用户, I want 各 provider 单账号且可前后替换, so that 换账号不会永久读启动时账号或混入旧读数。
2. As a 开发者, I want adapter 只接入当前消费者需要的能力, so that 不为可能的多账号管理镜像宿主或增加无消费者的 interface。
3. As a 开发者, I want provider endpoint／parser 留在 shared logic, so that 其他 harness 可以复用业务而不复制 OMP 原生耦合。
4. As a 用户, I want 访问资料在初始化即可取得, so that 第一条模型请求之前能够预取余额和额度。
5. As a 用户, I want provider 查询失败独立收口, so that 一方未登录不会阻断另一方查询或模型执行。
6. As a 用户, I want 密钥只用于认证且统计身份不暴露密钥, so that 统计文件、日志及决策资料不会泄漏凭据。

## Preconditions

- [行为契约](01-behavior-contract.md)、[消费归属](02-accounting-ownership.md)、[数据归属](12-state-data-contract.md)提供保留功能、身份范围与业务聚合；本次单账号／凭据身份修订不取消同账号多会话正确性。
- 宿主在初始化可读取已生效凭据；当前源码显示 OAuth 明细和 API Key resolution 路径，但固定 18.5.0 与真实账号替换尚需验收，不能用当前源码版本代替支持基线。
- HTTP／刷新部分结果已发布，其完整 interface、配置 schema、调度和取消规则仍待 owner 结案；配置缺失与运行失败必须区分。

## Postconditions

- [HTTP 能力决策](../decision/05-http-capability.md)可基于确定的 credential／地址职责和已确认代理原则继续工作，不必等待完整账号管理设计。
- [装配决策](../decision/10-assembly-layout.md)落实最小 interface、稳定不暴露秘密的统计标识、native 当前资料映射、实例与初始化绑定；不新增账号管理或热切换保证。
- [刷新决策](../decision/09-refresh-lifecycle.md)消费初始化可读资料；[展示决策](../decision/08-presentation.md)决定局部失败和账号替换时的读数呈现；[验收决策](../decision/11-acceptance-cutover.md)验证实际路径及秘密不外泄。
- 不实现／认证 pi adapter，不修改正式凭据、宿主配置或生产统计。

## Invariants

- 延续 ADR-0002 的职责测试和 native import seam；shared logic 不导入 OMP native 对象。
- Provider account 的领域含义不被 credentialId 改写；DeepSeek 按凭据划分是本次业务实现取舍，不是所有 provider 的通用定义。
- 账号资料读取、消费归属与 Owner State 独立；不按 agent 名称猜账号，不把未知并入共享默认身份。
- 地址来源和业务路径分开；不把所有 endpoint 或 base URL 一律硬编码，也不新增未批准配置。
- 规划批准不等于稳定标识算法、实际 OAuth、网络性能或新框架链路已验证。
