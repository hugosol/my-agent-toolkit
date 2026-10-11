# 账户访问：确认来源与证据边界

本资产记录 2026-10-12 当前 Wayfinder 账户访问会话的可恢复确认源，不代替各 Lighthouse。没有消息链接可用，以下保留用户原话和对应提案含义。没有生产代码、真实凭据或远端请求写入本资产。

## 用户确认

- Q1 三层职责：用户「Q1 同意，这个拆分很好地遵循了我们之前定下的原则」。adapter 接入宿主身份／凭据／地址；framework 小 interface；model-cost 查询 endpoint、parser、窗口业务；HTTP 通用执行。
- 单账号范围：用户「正常使用情况下，codex只会有一个账号」「第一个版本只需要满足这个情况下的需求即可，不需要为以后可能使用多个codex账号过度设计」。对单账号／多账号不支持、保留同账号多会话并发提案回答「同意」。随后明确「当前设计假定deepSeek和codex都各自只有一个账号，不过切换账号的话，应该要能拿到\"当前账号信息\"」。范围是各 provider 单账号、允许前后替换，不是永久固定首次账号。
- DeepSeek 身份 tradeoff：提案说明仅凭 API Key 不能认出平台账号 ID／同账号换 Key；以稳定且不暴露密钥的凭据标识区分统计范围，换 Key 新范围，不合并旧累计／holiday，不删旧数据。用户「Q3 可以接受」。具体标识算法未批准。
- 初始化跨票确认：提案明确 owner 为 `09-refresh-lifecycle.md`：初始化并行查询已配置的 DeepSeek 与 Codex，不依赖当前模型／首次消息；首次模型请求前等待成功、失败或超时；不禁止输入，不阻断模型于查询失败。用户「同意，非常准确」。
- 代理来源：用户要求「框架提供http请求代理能力」「所有框架内codex相关的请求都要经过代理」「能力就可以跟环境变量解耦」。随后在 Q6 明确修订「代理配置缺失回退直连即可，其他都同意」；宿主自行发起的模型／原生 OAuth 请求不自动受 framework 配置控制。
- HTTP 跨票确认：Q7 提案明确 owner 为 `05-http-capability.md`。用户修正「框架提供的是代理开关和选择器，并非要求所有请求都经同一个代理，可以允许多个不同的代理配置，根据每个请求具体情况动态选择」。Q8 由发起方逐请求选择、framework 执行，用户「Q8 正确」。Q9 不将运行时代理失败当配置缺失、无自动直连重试，用户「Q9 是，不应混淆代理配置缺失和运行时代理失效两个场景」。配置位置、schema、协议范围未批准。
- 查询地址：用户「Q5 同意，你的意思是这些地址都写死在代码内部即可，是吧」。随后澄清 DeepSeek 的 base URL 仍读取宿主、仅余额路径及默认值由业务代码持有；Codex endpoint 由业务代码持有，不增加独立 endpoint 配置。最终摘要包含该区别。
- adapter 按需：用户「Q10 adapter功能先按需实现接入，如果没有扩展需要账号管理功能，则无需接入」。不镜像完整 modelRegistry，不主动接入账号管理。
- 局部失败：用户「Q11 同意」。访问资料不可取得仅让相应余额／额度查询失败，其他查询继续，不猜身份／显示零，不改宿主模型推理认证策略。
- 结案边界：用户对 Q12 摘要与发布程序回答「确认」。授权账户访问票结案、修订原账户权威、发布上述 HTTP／初始化部分结果、整理 Handoff／地图并 Backtrace；不授权生产实现或其他决策票结案。

## 源码核对

- 旧 `my-omp-toolkit/extensions/model-cost/index.ts`：`fetchBalance` 通过 resolver 取 API Key 与可用 credentialId、取宿主 base URL，去尾部 `/v1` 后请求 `/user/balance`；无地址时官方默认。`onInit` 注册于 session_start 等事件，await 按当前模型初始化，并非已证明两源同时预取。
- 旧 `chatgpt-usage.ts`：`resolveCodexOAuthAccess` 取账户列表首项并 accessById；`fetchChatGPTUsageSnapshot` 委托 OMP usage provider、注入 fetch，并匹配 5h／7d。旧无代理拒绝／OMP 环境变量依赖是旧事实，不是当前契约。
- 当前 oh-my-pi 源码 `packages/ai/src/auth/oauth.ts`：`accounts` 从本地 pool／affinity 生成账户明细，`accessById` 委托 OAuth resolution，已有代码说明过期 token 可能刷新；不因枚举明细主动请求额度。`OAuthAccountSummary` 含 credentialId、可选 accountId／email／组织及 active。active 不等于逐请求真实身份认证。
- 当前 `auth/types.ts`：API Key credential 没有同等平台账号 ID／email；`model-registry.ts` 的 resolver 可接受 provider／模型及 session 选项。

## 验证限制

发布后运行无落盘 Bun tracker／文档 smoke：检查 13 个发布相关文档、217 个本努力内本地链接及 12 个 heading anchor，断链为 0；13 个决策票依赖图无环，账户访问票 resolved，HTTP／刷新票仍 open 且未认领；frontier 为 HTTP、命令、展示、模型覆盖。第一次脚本使用 require，在 Bun ESM eval 中失败；改为 dynamic import 后上述检查实际通过。该 smoke 验证文档／tracker，不是产品功能测试。

以上是工具返回的源码片段证据，不是 OMP 18.5.0 账号替换、真实 OAuth／账单、代理直连／代理失败、网络延迟或新 framework interface 的运行验证。既有[旧等待探针](old-observer-waiting-smoke.md)仅证明旧回调等待／single-flight，不证明新初始化屏障、两源预取或全部远端功能。没有实际密钥、代理凭据、正式配置或统计文件被读取／修改；仅查询源码和 tracker 文档。
