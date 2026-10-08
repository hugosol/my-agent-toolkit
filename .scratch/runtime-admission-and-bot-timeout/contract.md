# Contract — Framework 统一版本检查与 connect-bot 请求超时配置化

Source: [spec](./spec.md)
Approval: approved — seam selection、六面审视、acceptance mode 三个关卡均已获用户明确确认。
Acceptance mode: Full automation

## Promises

所有 Coverage 均由 agent 完成，包括实现、TDD、约定验收和必要的真实运行验证；无计划中的人工验收例外。以下是覆盖要求，不是构建顺序或执行完成报告。预期结果来自 spec 与独立场景输入，不从被测 implementation 重算。

|#|Promise (one observable result)|Coverage|Source|Seam|
|---|---|---|---|---|
|P1|扩展调用者无需提供运行时支持版本列表即可装配，由 framework 统一决定版本支持。|消费 interface 的类型/调用验证与实际装配；核对全部受影响调用方完成迁移，不保留旧列表契约或第二判定来源。|[stories 2–3；Implementation Decisions](./spec.md#implementation-decisions)|S1|
|P2|同一进程的实际版本成员判定执行一次，其结果跨扩展、分别加载的 framework 模块副本和会话重绑定共享。|隔离进程中经消费 interface 装配两个扩展和独立模块副本，再执行主/子会话重绑定；保留共享判定的事实证据并用实现审查补证实际成员判定次数。真实 Agent 运行时装载验证覆盖模块副本情形。仅有一条通知不是通过证据，不要求新增生产计数器。|[stories 1、4–5](./spec.md#user-stories)|S1|
|P3|没有版本报告时继续且不警告；缺失报告不会被当成进程已经完成受支持版本判定，首次有效报告仍能触发一次实际版本判定。|独立进程先输入未报告版本，再经另一绑定输入明确未列入基线的版本，观察后者继续且主会话获警告；记录无报告阶段不触发支持结论。|[Implementation Decisions](./spec.md#implementation-decisions)；inferred：保留既有无版本处理所必需，六面审视已确认|S1|
|P4|明确位于当前支持基线的版本正常绑定，不发布未知版本警告。|使用支持记录中明确列出的精确版本，观察实际注册和零未知版本通知；不以被测成员判定函数生成预期值。|[story 6；Implementation Decisions](./spec.md#implementation-decisions)|S1|
|P5|未列入基线的版本警告后仍正常绑定，不因版本未列入列表被拒绝。|输入独立指定的未知版本，观察命令/行为仍可使用及 framework 警告；不扩大基线、不引入版本范围匹配。|[story 7](./spec.md#user-stories)|S1|
|P6|同一主会话跨多个扩展、模块副本和重复交付只获得一次 framework 未知版本警告。|同一 Owner 的组合交付、重复绑定和重复会话交付；观察一条 framework 归属的通知而非逐扩展通知，并以真实运行时装载验证补足模块副本场景。|[story 8](./spec.md#user-stories)|S1|
|P7|同进程另一个主会话仍获得自身的一次未知版本警告。|先后向两个不同 Owner 交付主会话事件，独立预期各一次；同时保留 P2 的进程级复用证据，不能为获得第二条警告重新判定版本。|[story 9](./spec.md#user-stories)|S1|
|P8|子会话不会另行发布主会话未知版本警告。|真实拥有者关系的主/子会话交付，观察子会话不增加通知，不能将子会话当作新的 Owner。|[story 10](./spec.md#user-stories)|S1|
|P9|版本警告仅通过既有非模型渠道发布：有交互 UI 时通知，无 UI 时 stderr；不进入模型上下文或持久化会话历史。|UI 与无 UI 交付场景，检查通知/stderr、会话写入和模型输入捕获；真实运行时验证渠道映射。|[Implementation Decisions](./spec.md#implementation-decisions)；[ADR-0002](../../docs/adr/0002-semantic-extension-framework.md#supported-agent-runtime-compatibility)|S1|
|P10|每次 binding 都按该次注入的实际 interface 检查必需入口，不能用进程版本结果替代入口可用性判断。|同进程先完整入口绑定，再以缺少必需入口的另一绑定进入；后者必须被拒绝。以不同扩展实际必需声明观察，不调用私有检查函数作为验收入口。|[story 11](./spec.md#user-stories)|S1|
|P11|必需入口缺失时受影响绑定 fail-soft 拒绝，无部分注册，Agent 运行时仍继续运行。|观察注册记录为空和非模型诊断，并验证其他完整绑定仍可用；对于使用 connect-bot 定义的绑定，确认拒绝期间不启动后台心跳或发出请求。|[story 12](./spec.md#user-stories)；inferred：fail-soft 的必要结果，六面审视已确认|S1|
|P12|加载/绑定时不为验证语义兼容性而执行扩展行为自测。|在未执行命令、未触发业务生命周期前检查业务调用、网络与会话写入记录；结合实现审查，区分正常入口检查与行为探测。测试通过不自动批准新增支持版本。|[stories 13–14；Implementation Decisions](./spec.md#implementation-decisions)|S1|
|P13|随仓库提供的扩展配置以 1000ms 作为统一请求等待预算，单位为毫秒。|使用随仓库提供的配置启动扩展，经真实请求触发观察超时行为；结合非默认配置场景排除代码常量伪装配置。不是只检查配置文本含有 1000。|[stories 16、21](./spec.md#user-stories)|S2|
|P14|缺失或非法 requestTimeoutMs 在 binding 时明确拒绝扩展，不采用代码默认值、环境覆盖或回退来源。|缺失字段、0、负值、小数、非数字、非有限值及超出运行时可接受范围的场景；观察配置诊断、无命令/行为部分注册、无心跳/请求。合法正整数对照能正常运行。具体校验实现不固定。|[story 22；Implementation Decisions](./spec.md#implementation-decisions)；inferred：合法性与拒绝前无副作用的必要结果，六面审视已确认|S2|
|P15|合法配置变化在重启后生效，不在当前进程热更新。|同一进程从 1000 改文件为 2000 后保持原预算；新进程加载 2000 后采用新预算。真实 HTTP 固定响应延迟 1200ms，独立预期旧预算超时、新预算可完成；不得在两个场景间悄悄清除进程状态冒充重启。|[stories 15、23](./spec.md#user-stories)|S2|
|P16|register 的实际等待与结果受统一 requestTimeoutMs 控制。|从 /connect-bot 触发真实 register；固定延迟响应配合 1000/2000 两个配置，在独立进程验证超时与有效成功回执导致的连接结果。只捕获超时参数不是通过证据。|[story 17](./spec.md#user-stories)|S2|
|P17|显式断开的 unregister 实际等待受同一配置控制，并保留先本地断开、尽力注销的行为。|从 /connect-bot off 触发，观察本地连接结果、实际单次请求及超时/完成；配置变化必须改变等待行为，不把服务端是否收到请求等同于客户端结果。|[story 18；Implementation Decisions](./spec.md#implementation-decisions)|S2|
|P18|会话结束与切换路径实际发出的 unregister 同样使用统一配置。|从已连接扩展触发既有会话结束/切换事件，保留请求和等待证据；按既有事件条件判断是否应发送注销，不为了验收额外增加原本不发送的请求。|[story 20；Implementation Decisions](./spec.md#implementation-decisions)|S2|
|P19|后台 heartbeat 与状态上报请求使用统一配置预算，不保留独立的 1500ms 等待预算。|从已加载扩展触发生命周期与定时推送，观察请求超时以及原有失败反馈/连接结果；当前随 heartbeat 携带状态的协议也在覆盖内。使用实际出站请求而非直接调用内部客户端；真实 HTTP 场景补足 adapter 对 abort 的模拟证据。|[story 19](./spec.md#user-stories)|S2|
|P20|单条失败或超时请求不新增即时重试、退避或注销补偿。|服务端接收记录与受控时间场景检查失败后的请求数量；下一次正常心跳是新事件，不是对同一事件的即时重试。覆盖 register、注销及后台请求。|[story 28；Implementation Decisions](./spec.md#implementation-decisions)|S2|
|P21|心跳仍按原有 10s 周期产生，不因请求预算变化而重新解释为超时后的重试周期。|从已连接扩展推进受控时间，检查 10s 定时推送及其取消行为；改变 requestTimeoutMs 后心跳节奏不变。用真实运行记录补足 timer adapter 映射，不仅钉住常量值。|[story 28；Implementation Decisions](./spec.md#implementation-decisions)|S2|
|P22|后台推送仍按原有连续失败规则在第三次失败时停止本地连接，成功仍按既有规则重置计数。|独立指定失败/成功序列，经后台执行观察反馈及连接结果：两次失败未耗尽，第三次连续失败耗尽；中间成功打断连续计数。允许较短预算使同样延迟更易记为失败，不把失败次数解释为 unregister 重试次数。|[stories 28、30；Implementation Decisions](./spec.md#implementation-decisions)|S2|
|P23|HTTP 请求结构、路由、回执及状态上报形态保持既有协议，预算统一不新增一种状态推送或改写队列政策。|从命令/生命周期执行捕获独立规定的事件信封，并与原有协议实例比较；实际 omp-bot 接收验证互操作。对原有队列行为保留已有有效回归覆盖，不为配置化重新定义业务。|[Implementation Decisions、Out of Scope](./spec.md#implementation-decisions)；inferred：维持协议的必要结果|S2|
|P24|服务端实际处理 unregister 时仍直接删除面板会话登记，不以等待离线代替删除。|使用现有 omp-bot 执行连接后注销，从扩展消费 interface 触发并读取面板记录结果；服务端不修改，不能只用 adapter 自己回显“已删除”。|[story 26](./spec.md#user-stories)|S2|
|P25|unregister 未送达时，停止心跳后的面板会话仍按原有在线窗口判离线并保留登记。|实际 omp-bot 上阻止注销送达，观察超过既有 30s 在线窗口及扫描周期后记录离线但仍存在；保留时间与接收记录。不能用客户端失败次数推算服务端状态。|[stories 25、27；Implementation Decisions](./spec.md#implementation-decisions)|S2|
|P26|客户端注销等待超时不被解释为服务端未执行；服务端已处理删除而响应未及时返回的情形仍被正确区分。|用可控制响应时序的 owned dependency adapter 构造“先处理、后延迟响应”场景，记录客户端超时与面板侧删除分别成立；真实 HTTP 证明已接收但客户端超时的情况，P24 覆盖实际服务端删除语义。本行不承诺客户端能查询或确认每次服务端处理结果。|[story 29](./spec.md#user-stories)；六面审视已确认|S2|
|P27|配置较长请求预算不延长 Agent 运行时退出预算，退出注销仍不保证送达。|真实 Agent 运行时退出场景使用长预算与不及时响应的依赖，观察运行时按自己的生命周期结束；报告注销接收证据是否存在，不把缺失证据当作送达。不得新增等待请求耗尽的退出扩展。|[story 31；Implementation Decisions](./spec.md#implementation-decisions)|S2|
|P28|使用说明明确 requestTimeoutMs 的唯一配置来源、毫秒单位、重启生效，以及请求超时不等于面板未处理。|核对交付说明与实际配置消费 interface、P15/P26 的行为证据一致；移除被替代常量和失效说明，不用源码文本断言充当永久行为测试。|[stories 15–16、23–24、29、31](./spec.md#user-stories)|S2|

Coverage 执行约束：

- 消费者与验收跨同一 logical seam；真实运行、确定性 adapter、配置文件及网络捕获是覆盖方式或证据，不各自新增契约 seam。一个承诺不通过分裂成私有 helper seam 加消费 seam 的方式验收。
- 输入版本/会话事实、配置值和延迟场景可由隔离 fixture 控制；不得重新提供逐扩展支持版本列表作为生产或验收入口。测试隔离方式保持 implementation 自由，不新增生产 reset interface。
- 实际请求预算采用现有请求超时语义，不承诺 wall-clock 恰好在第 1000ms 返回。确定性时间用于边界验证，真实网络场景保留时间记录和合理调度误差；不能仅检查 signal 或预算值的转发。
- 基础运行时及 omp-bot 的真实验证必须隔离于用户现有会话/登记；不修改用户已安装运行时配置。实验数据与临时资源在验证后清理。
- 运行时入口形状存在不证明完整语义兼容；跨模块装载和现有语义契约场景仍必须保留真实运行证据。
- 不新增仅验证常量、源码文本或 mock 回显的永久测试。被迁移影响的纯实现钉值测试移除，不换一个值继续钉住。
- Genuine blocker 或缺少证据应如实报告；不得用 stand-in 结果冒充实际 Agent 运行时/omp-bot 验证，不得把未运行的检查标为通过。
- delivering work 由 `/to-tickets` 建立 ticket 到 promise 的引用；本契约不维护 promise 完成状态列。承诺完成取决于交付工作完成及其全部 Coverage 通过。

## Seam decisions

|Seam|Exposes|Hides|Alternatives considered|Reversibility|
|---|---|---|---|---|
|S1 — Framework 扩展装配/绑定 interface|调用者省去版本列表；版本准入结果的进程共享；Owner 作用域通知；实际必需入口缺失的 fail-soft 结果；P1–P12。|版本基线存放形式、判定算法实现、共享状态与通知记录、内部入口检查函数、具体通知措辞。|全部只从真实 Agent 运行时会话入口观察：depth 高，但纯通知不能证明判定次数，证据与失败归因较分散。把判定/通知各立 seam：过低且暴露 implementation。选 S1，将版本策略的验证集中在真实调用者 interface，真实装载作为覆盖。|验证布局高可逆；支持责任、进程/Owner 作用域及错误语义低可逆，但已由 spec 与 ADR 继承。|
|S2 — Connect-bot 加载、命令及生命周期执行 interface|扩展配置输入；命令和既有生命周期触发；请求/反馈/连接结果；owned dependency 的面板登记与在线状态证据；P13–P28。|配置读取函数、校验实现、请求客户端、队列组织、timer implementation、预算取得方式。|单独把 transport interface 当契约 seam：易做确定性检查，但无法证明命令、后台与会话路径实际使用配置。全部只从真实运行时会话入口观察：真实但归因和证据组织成本较高。选 S2，经已加载扩展触发完整路径，transport 留作依赖 adapter。|验证布局高可逆；配置字段、错误处理、资源/退出和请求策略低可逆，均继承已批准 scope。|

已批准布局不新增生产 interface，也不决定私有 interface 的数量。配置、通知输出和面板结果属于上述 interface 的输入/输出，不另设空 seam。

依赖策略：

- **In-process**：版本支持判定、共享结果及通知去重。通过 S1 验证消费者结果及必要交互证据，不暴露内部记录。
- **Local-substitutable**：配置文件、隔离进程/模块装载 fixture 和可控时间。真实文件/隔离目录及受控 timer adapter 支撑确定性覆盖；真实装载与时间记录补足映射证据。
- **Remote but owned**：omp-bot。复用已有 transport interface 的生产 HTTP adapter 与可控测试 adapter；真实 HTTP 等待和实际 omp-bot 记录验证不被 stand-in 取代。
- **True external**：本改造不引入新的第三方远程承诺。不将可控的自有面板误归为不可验证的第三方依赖，也不要求新增模型/provider 行为。

三项六面审视必要推论（P3、P14、P26）及 fail-soft 无部分注册、无额外业务副作用已获确认。它们没有改变 scope，不要求另选内部校验或共享机制。缓存结构、global symbol、额外公开校验字段类型等设计建议未被提升为已批准契约事实。

未建立新 ADR：本次选定的 seam 验证布局高可逆，版本支持责任已有 [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md#supported-agent-runtime-compatibility)；没有新增需要另行记录的低可逆架构取舍。若 implementation 推翻 seam 假设，应先修订本契约，再重开受影响 tickets；满足 ADR 条件时再记录。

## Not yet specified

- **审批阻塞项：无。** seam selection、六面审视和 Full automation 均已确认。
- **留给 implementation / tickets 的自由**：进程共享结果的存放形式；合法数值如何接入既有配置校验；内部 interface 与 adapter 组织；fixture/进程隔离手法及具体测试命名。它们不是待批准的新消费 seam，也不改变上述承诺。
- **Deferred**：未来独立分发不同 framework 版本、热更新、额外 Agent 运行时或新网络操作的承诺，不在本次定义；若未来使既有作用域假设失效，应重新审视契约，不预先切片。

## Out of scope

继承 [spec 的 Out of Scope](./spec.md#out-of-scope)，本契约不增减范围。特别是：不修改 omp-bot、不改心跳/失败阈值/队列及不重试策略、不保证注销送达、不延长退出预算、不增加配置热更新或环境覆盖、不扩大运行时支持基线、不在加载时执行语义行为自测。

## Coverage review

|六面|结论|
|---|---|
|Entry|已覆盖：S1 的扩展装配/绑定；S2 的扩展加载、命令及既有生命周期触发。没有新增 CLI 或消费入口。|
|Data and state|已覆盖：版本基线归属、进程共享与 Owner 去重、配置合法性/唯一来源/重启语义，以及面板登记与在线状态。|
|External dependencies|已覆盖：配置文件、时间、Agent 运行时装载、实际 HTTP 与 owned omp-bot。随机性及新的第三方依赖不适用：本改造不要求它们。|
|Errors and failure|已覆盖：未知/缺失版本、必需入口缺失、非法配置、超时/失败反馈、不重试及客户端/面板结果的不确定性。没有新增错误协议或退出码。|
|Output and observability|已覆盖：UI/stderr 非模型通知、连接反馈、请求捕获和面板记录；不要求新增日志、metrics 或生产计数器。|
|Resources and concurrency|已覆盖：跨模块及重绑定共享、Owner 通知去重、拒绝时无后台/出站副作用、原有心跳/失败规则及退出预算不被延长。没有新增业务并发模型或成本承诺。|

- 每个 promise 均映射到一个 seam；无例外。
- 每个 seam 均承载 promises：S1 为 P1–P12，S2 为 P13–P28；无空 seam。
- Acceptance mode 为 Full automation；human-led coverage 为 none。
- 本报告证明契约覆盖已审视，不证明 implementation 或 Coverage 已执行通过。
