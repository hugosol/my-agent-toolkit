# Framework 统一版本检查与 connect-bot 请求超时配置化

Status: ready-for-agent

Contract: [approved contract](./contract.md)

## Problem Statement

本规格承接已完成并经用户确认的设计讨论，包含两项明确要求的改造。

### Agent 运行时版本检查重复

目前版本检查的代码虽然位于 Semantic extension framework（语义扩展框架），但 Agent 运行时支持版本列表由各扩展装配分别提供，检查在每个扩展的每次 binding 中执行。主会话、子会话重新绑定时可能重复判定；未知版本的通知也不是整个 framework 统一发布，而是各扩展分别处理。

用户希望版本支持属于 framework 的统一责任，而不是每个扩展重复维护、检查和提示。同一进程加载多个扩展时，应共享一次版本判定结果。同时，用户不希望把运行时 API 入口是否存在的动态检查，与依靠脚本、契约测试和真实运行时验证建立的语义兼容性混为一谈。

### Connect-bot 请求等待预算分散且不可配置

目前 connect-bot 的 register 请求最多等待 1000ms，unregister 和后台 push 请求最多等待 1500ms，这些值是代码常量。用户无法通过 Extension configuration（扩展配置）统一调整请求等待时间，也容易将客户端请求超时、客户端连续失败计数与服务端在线判定误认为同一机制。

用户最终要求不是仅将 unregister 改成 1s，而是将 connect-bot 的全部 HTTP 请求统一为一个可配置的请求超时。用户也需要明确：调整这一预算不要求同步调整 omp-bot 服务端参数，且 Panel session registration（面板会话登记）与 Panel session online status（面板会话在线状态）是不同概念。

## Solution

### Framework 统一版本检查

将 Agent 运行时支持基线的版本列表与版本判定责任统一归 framework。每个进程仅判定一次当前 Agent 运行时版本，并将结果共享给所有使用该 framework 的扩展，包括由运行时分别加载的 framework 模块副本。扩展不再自行提供运行时支持版本列表。

保持现有准入政策：支持版本正常运行；未列入支持基线的版本警告后继续。警告由 framework 统一发布，每个主会话一次，而不是每个扩展各自一条。版本判定的进程作用域与警告的主会话作用域相互独立。

保留每次 binding 的轻量必需 API 形状检查，在注册行为前识别当前注入的 API 是否缺少必需入口。该检查不代表语义兼容性已被动态证明；语义兼容性仍通过现有验证流程建立，不在扩展加载时执行行为自测。

### Connect-bot 全请求统一配置超时

在 connect-bot 的扩展配置中新增 `requestTimeoutMs`，随仓库提供的初始值为 `1000`，单位为毫秒。register、unregister，以及后台 heartbeat/state push 全部使用同一配置值。被替代的三套超时常量移除。

沿用既有扩展配置约定：配置文件是唯一来源，framework 在 binding 时读取并验证，修改后重启生效。不额外提供代码默认值、环境覆盖或运行时热更新。

不改变心跳周期、连续失败阈值、请求不重试策略、面板会话登记协议或服务端在线判定规则。omp-bot 不需要修改。统一初始值意味着后台 push 和 unregister 的等待预算都由 1500ms 缩短为 1000ms；这是用户已接受的行为变化，而不是声称与原行为完全等价。

## User Stories

1. As an 扩展使用者, I want 同一 Agent 运行时进程只执行一次 framework 版本判定, so that 加载多个扩展不会重复进行相同的支持版本检查。
2. As an framework 维护者, I want Agent 运行时支持版本统一属于 framework 的支持基线, so that 版本支持策略不会分散到各扩展装配中。
3. As an 扩展维护者, I want 扩展不再提供自己的运行时支持版本列表, so that 扩展只声明自身需要的能力，而不用重复维护框架兼容性信息。
4. As an 扩展使用者, I want 分别加载的 framework 模块副本共享同一版本判定结果, so that 运行时的模块隔离不会让一次检查退化成每个扩展一次。
5. As an 扩展使用者, I want 会话重新绑定和子会话绑定复用进程内已有的版本判定, so that 绑定次数不会增加版本检查次数。
6. As an 扩展使用者, I want 支持基线内的 Agent 运行时版本正常运行且不显示未知版本警告, so that 受支持的环境不会出现无关提示。
7. As an 扩展使用者, I want 未列入支持基线的版本得到 framework 统一警告但仍继续运行, so that 我了解支持状态而不因版本未列入列表就失去扩展功能。
8. As an 主会话使用者, I want 同一主会话只收到一条 framework 未知版本警告, so that 同时使用多个扩展不会制造重复提醒。
9. As an 主会话使用者, I want 另一个主会话仍可得到自身的一次未知版本警告, so that 进程内复用版本判定不会掩盖该会话的支持状态。
10. As an 子代理使用者, I want 子会话不另行发布主会话版本警告, so that 子代理工作不会放大框架通知噪声。
11. As an 扩展使用者, I want 每次 binding 仍检查当前注入的必需 API 入口, so that 缺少必需入口时不会仅凭共享版本结果就错误地注册扩展行为。
12. As an 扩展使用者, I want 缺少必需 API 时沿用 fail-soft 处理, so that 受影响的扩展不留下部分注册，且 Agent 运行时仍可继续运行。
13. As an framework 维护者, I want API 形状检查与语义兼容性验证的职责明确分离, so that 方法存在不会被误当成事件顺序、历史保存等语义已被证明正确。
14. As an 扩展使用者, I want 扩展加载时不运行带副作用的行为自测, so that 兼容性检查不会额外写入会话历史或执行业务行为。
15. As an connect-bot 使用者, I want 通过扩展配置调整统一请求超时, so that 修改等待预算不再需要编辑源代码。
16. As an connect-bot 使用者, I want 超时字段明确以毫秒表示, so that 我能够准确设置请求等待时间而不混淆单位。
17. As an connect-bot 使用者, I want register 使用统一请求超时, so that 接入面板的等待预算服从同一个配置值。
18. As an connect-bot 使用者, I want unregister 使用统一请求超时, so that 断开连接不会再使用另一套硬编码等待预算。
19. As an connect-bot 使用者, I want 后台 heartbeat 和 state push 也使用统一请求超时, so that 全部出站请求只有一个超时配置来源。
20. As an connect-bot 使用者, I want 会话结束或切换路径上的注销请求也遵循统一配置, so that 请求预算不会因触发路径不同而产生例外。
21. As an connect-bot 使用者, I want 随仓库提供的请求超时初始配置为 1000ms, so that 所有请求默认采用已确认的一秒等待预算。
22. As an connect-bot 使用者, I want 缺失或非法的请求超时配置在 binding 时被明确拒绝, so that 扩展不会悄悄采用另一个隐含默认值。
23. As an connect-bot 使用者, I want 修改超时配置后通过重启应用新值, so that 配置生效方式与已有 endpoint 配置一致。
24. As an connect-bot 维护者, I want 原来的分操作超时常量和已失效说明被移除, so that 后续维护只有一个真实的超时来源。
25. As an connect-bot 使用者, I want 调整请求超时不要求同步修改 omp-bot, so that 客户端等待预算可以独立于服务端在线窗口调整。
26. As an 面板使用者, I want unregister 保持删除面板会话登记的语义, so that 显式注销不会被改成仅等待会话离线。
27. As an 面板使用者, I want 未收到 unregister 的会话仍按既有规则判定在线或离线并保留登记, so that 请求超时改造不会偷偷改变面板记录的生命周期。
28. As an connect-bot 使用者, I want 原有心跳周期、连续失败阈值和不重试策略保持不变, so that 统一超时不会扩展为未经确认的连接恢复机制改造。
29. As an connect-bot 使用者, I want 明白客户端超时不证明服务端没有处理请求, so that 我不会把超时反馈错误地理解为服务端登记状态的确定结论。
30. As an connect-bot 使用者, I want 明白较短的后台请求预算可能更容易触发原有失败计数, so that 我能够理解统一为 1000ms 后的真实行为变化。
31. As an connect-bot 使用者, I want 明白请求超时不会延长 Agent 运行时自身的退出预算, so that 配置较长等待时间时不会误以为退出注销必定能够完成。

## Implementation Decisions

### 已确认的版本检查决策

- 版本支持属于 Semantic extension framework，不属于单个 Extension definition（扩展定义）或扩展装配；所有受影响的调用方迁移到 framework 统一基线，移除逐扩展的支持版本列表及其旧调用契约。
- 当前版本的支持列表成员判定每进程一次；该结果必须跨扩展及分别加载的 framework 模块副本共享。每个模块副本各缓存一次不满足本需求。
- 沿用精确版本成员判定，不引入版本范围匹配，不扩大当前 Supported agent-runtime baseline（Agent 运行时支持基线）声明的支持对象或验证状态。
- 支持版本继续准入；未列入支持基线的版本警告后继续；未报告版本时维持既有处理，不另加拒绝或推断版本的机制。
- 版本判定是进程作用域，未知版本通知是 Owner 所对应的主会话作用域。framework 为每个主会话统一发布一次通知，不以扩展显示名或逐扩展支持集拆成多条；子会话不重复发布。
- 维持现有非模型通知渠道；版本警告不进入模型上下文，也不成为持久化会话历史内容。
- 每次 binding 保留针对实际注入 API 的形状检查，不将缺失入口的判断缓存成整个进程的版本结论。具体必需入口仍由当前框架要求和扩展声明的必需能力决定。
- API 形状检查仅识别入口缺失；例如存在事件订阅方法不能证明具体生命周期事件一定触发或顺序正确，存在历史写入方法也不能证明历史保存契约已满足。
- 必需入口缺失仍按既有 fail-soft 方式处理，在注册前拒绝受影响绑定、明确报告且不留下部分注册，不终止 Agent 运行时。
- 语义兼容性仍由维护者依据契约场景和真实 Agent 运行时验证建立；测试通过不自动批准新增支持版本。加载扩展时不执行行为自测。
- 本次责任上移及移除逐扩展版本配置是已确认的接口迁移，不保留旧版本列表作为兼容别名或第二套判定来源。

### 已确认的超时配置决策

- connect-bot 的 Extension configuration 新增 `requestTimeoutMs`。随仓库提供的初始配置值是 `1000`；它是配置中的值，不是缺失配置时的代码回退值。
- 字段表示单次 HTTP 请求的等待预算，单位为毫秒，不仅是建立连接阶段的预算；因此使用请求超时命名，而非连接建立超时命名。
- 字段必须是运行时可接受的合法正整数毫秒值。沿用 binding 前读取和校验、无代码默认值、无回退来源的扩展配置政策；缺失或非法配置不得让扩展以猜测值继续运行。
- register、unregister、后台 heartbeat/state push，以及会话结束或切换路径上的注销请求全部使用该值，不按操作类别保留独立超时。
- 保留当前单次请求超时控制语义，不引入额外重试、指数退避、分阶段计时或新的超时恢复机制。
- 现有三套分操作超时常量及受影响的调用点必须完整迁移；保留未迁移的备用路径不满足统一配置要求。
- 配置在初始化/binding 时生效，进程内保持既有配置语义；修改后需要重启，不增加热更新或命令调节入口。
- 心跳周期仍为 10s，后台推送连续失败阈值仍为 3 次；它不是对同一条 unregister 重试 3 次。成功/失败计数与本地自动停止连接的规则不因配置化而改写。
- omp-bot 的在线窗口仍为 30s、扫描周期仍为 5s。这些服务端参数不与 `requestTimeoutMs` 相乘或同步调整；本改造不修改服务端。
- register/unregister 的请求结构、路由、响应约定及面板记录处理保持不变。服务端处理 unregister 即删除面板会话登记；判为离线本身不会删除登记。
- 客户端请求超时不保证服务端未接收或未处理。若 unregister 未送达，服务端按既有在线规则判离线并保留登记；若已处理而响应未及时返回，客户端仍可能超时。
- 初始统一值会把后台 push 和 unregister 的等待预算从 1500ms 缩短为 1000ms。后台推送可能更容易记为失败并触发原有阈值，此影响已在选择覆盖全部请求时说明并接受。
- 配置请求超时不会延长 Agent 运行时自身的生命周期/退出预算；退出时注销仍是 best-effort，不新增保证送达的承诺或退出预算扩展。

### 留给后续契约阶段的事项

本次已确定责任归属、作用域和字段语义，但没有选择新的模块接口、共享状态存放机制、测试 seams 或 seam 数量。进程级结果如何跨模块副本共享、配置约束如何接入现有校验，以及改动最终承载于哪些接口，由后续 `/to-contract` 在既有结构基础上确定。本规格不要求新增某个特定管理器、注册中心、公开接口或全局 symbol。

## Testing Decisions

- 现有 prior art 包括 framework 的 admission 场景、主会话通知去重与无 UI 时的非模型通知验证，以及重复 framework 模块副本共享行为的验证。它们是调查中已有的相关实践，不代表本规格已选定测试 seam。
- connect-bot 已有接入、断开、后台心跳、会话切换及状态机行为验证；配置机制已有读取、字段类型和非法配置处理的验证实践。应沿用现有行为约定，不能为了统一配置而重新定义原有登记或离线语义。
- 绑定时的 API 形状检查不能替代语义契约测试和真实 Agent 运行时验证；不允许通过在加载时执行行为自测来宣称语义兼容。
- 调查已调用现有请求客户端，使用真实本地 HTTP 服务将响应延迟设为 1200ms：1000ms 预算约在 1000ms 超时，1500ms 预算约在 1202ms 成功收到响应，三次请求均已被服务端接收。这证明等待预算与服务端接收不是同一事实；它不是实际 omp-bot 的延迟测量，也不是改造完成后的验证证据。
- 后续实现需要实际运行发生改变的路径并观察结果；不能仅凭编译成功、配置字段存在或测试通过宣称交付完成。
- 永久测试应验证消费者可观察的行为、边界或失败处理，不新增仅固定常量、检查源码文本或复述配置值的测试。受到本次配置化影响的既有纯数值/实现细节钉值测试，不应简单换成另一个值重新钉住。
- 测试 seams、每个 seam 的承诺、覆盖分配和最终场景清单由 `/to-contract` 决定，本规格不预先指定。

## Out of Scope

- 扩大 Agent 运行时支持基线、增加新运行时、改变未知版本继续运行的政策，或新增版本范围匹配。
- 在扩展加载期间证明完整语义兼容性，或执行带业务/历史写入副作用的行为自测。
- 移除每次 binding 的必需 API 形状检查，或仅合并通知而仍保留逐扩展版本判定。
- 重构与两项需求无关的 State、扩展业务逻辑、Marker area（状态标记区）、指令贡献或生命周期实现。
- 修改 omp-bot 服务端的请求协议、30s 在线窗口、5s 扫描周期或离线记录保留政策。
- 修改心跳周期、连续失败阈值、队列策略，或新增重试、退避、注销确认补偿和保证送达机制。
- 超时配置热更新、环境覆盖、额外命令开关、按请求种类分别配置，以及新建通用网络配置框架。
- 延长 Agent 运行时退出预算，或保证任意较长配置值都能在退出期间耗尽。
- 本次直接实施运行代码、选择测试 seams、生成 contract 或拆分 implementation tickets；本次交付物是已发布规格。

## Further Notes

- 本规格综合用户最终确认的设计，不重新发起采访。此前用户选择“仅完成设计讨论”；本次请求是生成并发布 spec，不构成当前回合修改运行代码的授权。
- 领域用语依据项目 [GLOSSARY](../../GLOSSARY.md)，特别是 Agent runtime、Extension configuration、Owner、Supported agent-runtime baseline、Panel session registration 和 Panel session online status。
- framework 版本支持责任的已确认方向已记录在 [ADR-0002：Supported-agent-runtime compatibility](../../docs/adr/0002-semantic-extension-framework.md#supported-agent-runtime-compatibility)。该 ADR 同时约束 fail-soft、非模型通知、语义验证与显式支持批准。
- unregister 原来的 1500ms 是继承的短时 best-effort 设计预算，调查未发现它必须比 register 多 500ms 的服务端要求或算术推导；本次统一预算是明确的设计变更，而不是服务端协议修复。
- 请求等待预算、后台连续失败计数、面板会话在线状态和面板会话登记分别回答不同问题，不应以“超时 × 次数 = 服务端离线时间”解释它们。
- `Status: ready-for-agent` 按 `/to-spec` 要求标记。下一步是对本规格执行 `/to-contract`，在那里选择 seams 并批准承诺；此状态不表示实现已经完成。
