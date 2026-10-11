# HTTP 能力讨论：确认来源与证据

本记录是 [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)的紧凑确认依据，不是政策权威；当前政策只在 [HTTP Lighthouse](../lighthouse/05-http-capability.md)。本会话没有可引用的持久 transcript URL，以下保留用户原话与所确认提案的范围。

## 用户确认与修订

- Q1 用户：「A，直接处理返回即可，暂时无需多封装一层格式」。选择 fetch 风格，直接返回响应。
- Q2 用户：「同意，时间需要依据业务实际需要配置，不应由framework硬性规定」。业务预算优先；后续 Q11／Q13 为未提供预算时补充默认，不强制业务使用同一数值。
- Q3 用户要求「参考旧extension的实现方式」「希望遵循已有的规则执行」。调查发现旧 signal 保持作用于正文读取；整票总结确认保留此行为。
- Q4 用户要求「应当统一使用framework能力，不应各处各自实现自己的代码」，同时提出浅封装顾虑；Q6 用户：「可以，先限定为这一层」。深度来自共享代理配置／逐请求选择／平台传输，而不是业务结果或便捷方法。
- 初版 Q5 提议调用方自己创建 timeout signal，用户质疑增加复杂度；修正为调用方传 timeoutMs、framework 内部执行后，用户：「可以，这样设计更为直观和优雅」。
- Q7、Q8、Q9 用户分别「同意」：false／省略直连、名字选代理；framework/config.yaml 的 http.proxies URL 表；保持 HTTP response／传输 reject／正文读取或解析 reject 的区分。
- Q10 用户明确修订：「请求选择了代理，但共享配置文件不存在，或没有代理配置表，报配置错误，不直连，其他几项同意」。因此所有显式代理选择的缺失／非法／不可读取配置都失败；取代此前缺配置直连。此前确认来源保留在 [账户访问原话](provider-access-confirmation-2026-10-12.md)，不作为当前要求。
- Q11 用户：「省略时应当添加一个默认超时时间，防止程序无限等待」。Q13 用户「同意」请求 timeoutMs → http.defaultTimeoutMs → 内置 30000ms、有效正整数毫秒、0 不关闭超时、非法值不静默回退的提案。
- Q12 用户：「可以，框架按需实现需求，没有需要socks连接的扩展的话，不需要考虑这种情况」。批准 HTTP／HTTPS 代理，不预建 SOCKS。
- Q14 用户要求调查现有消费者的主动取消需求；未发现实际主动取消路径后，整票总结确认本次公共 interface 不提供 signal。未来具体生命周期需求由刷新票先决定，不预建能力。
- Q15 用户「可以」：一个 request，method 默认 GET，调用方自己准备 headers／body，不增加 JSON／provider 便捷方法。
- Q16 用户：「之前已经确定了request请求会有proxy参数，也就是说，由share-logic层的代码决定每个http请求需要走哪些proxy，暂时没有统一封装的必要」。balanceProxy／usageProxy 配置字段提案撤回，未获批准。
- Q17 提议保留原生 usage provider，用户指出混入已定归属和多项细节。澄清 adapter 提供当前身份／凭据／地址，业务查询／header parser／窗口／估计／失败解释尽量留 shared logic；framework HTTP 不接管宿主自己执行的模型请求／OAuth 更新。用户：「是的，你已经很好地描述了我之前提到的原则。现在请继续grilling」。旧 native helper 不是必须保留的能力或复用决定。
- Q18 用户：「A，用简单设计即可」。shared logic 直接导入 framework 公共 HTTP module，不在 delivery 上传递 HTTP 能力；底层测试注入 seam 留 module 内，不要求修改全局 fetch。
- 最后展示整票契约与接入范围后，用户：「可以，请继续」。这是整票结案与 Lighthouse／Handoff／地图／backtracer 发布授权，不是生产实施授权。

## 源码事实

- [旧 DeepSeek fetchBalance](../../../../my-omp-toolkit/extensions/model-cost/index.ts#L219)：凭据 resolver、provider base 去末尾 /v1、Bearer GET、AbortSignal.timeout(5000)、response.json()；未解除正文阶段 signal。
- [旧 Codex 模块加载与 OAuth 访问](../../../../my-omp-toolkit/extensions/model-cost/chatgpt-usage.ts#L107)：加载 OMP usage provider／header parser／代理工具；resolveCodexOAuthAccess 取宿主当前 OAuth 访问资料。
- [旧 Codex 查询](../../../../my-omp-toolkit/extensions/model-cost/chatgpt-usage.ts#L224)：向 usage provider 注入 capturingFetch，使用宿主代理包装及 10 秒 timeout signal；旧代理前提不是本次最终规则。
- [旧 header parser](../../../../my-omp-toolkit/extensions/model-cost/chatgpt-usage.ts#L726)：解析模型响应头，不发查询。
- [当前 connect-bot panel client](../../../extensions/connect-bot/shared-logic/panel/client.ts#L87)：PushTransport 接收 POST／JSON 字符串／timeout signal／proxy:false；读取 status、text 与注册回执。正文读取／解析异常当前转为 undefined 是业务结果解释，不是通用传输规则。
- [当前 connect-bot OMP assembly](../../../extensions/connect-bot/harnesses/omp.ts#L58)：platformTransport 调 globalThis.fetch，connectBot 安装此传输；当前 HTTP 尚非 framework 公共能力。
- 源目录搜索：旧 model-cost 仅发现 HTTP timeout signal 与认证类型的可选 signal；当前 connect-bot 仅 timeout signal。未发现这两个扩展实际创建 AbortController／调用 abort 的路径；类型能接受 signal 不等于存在主动取消消费者。
- [现有配置 module](../../../framework/core/config.ts#L243)提供 YAML 读取和基本字段校验；代理表结构尚需实施，不应新建平行解析系统。
- 源码查阅涉及本地 sibling checkout，不替代固定 OMP 18.5.0 基线的真实验收。

## 已运行的局部 smoke

Bun 1.4.2 下启动仅绑定 127.0.0.1、随机端口的临时 Bun.serve：立即发送 HTTP 200 和正文开头，600ms 后才补齐 JSON；客户端使用旧式 fetch(url, { signal: AbortSignal.timeout(200) })，随后 response.json()。服务在 finally 中停止，无落盘探针文件、真实凭据或外网请求。

实际输出：

```text
headers 200 1
body rejected TimeoutError 201
```

这仅证明该本机底层写法在已返回响应头后仍会中止正文读取。不证明新 framework HTTP、两种代理协议、30 秒默认及优先级、配置错误、真实 DeepSeek／Codex 查询、native 接线或 connect-bot 回归已实现／验证。
