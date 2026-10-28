# manager-chat 与 node-chat 自动角色扩展

Status: ready-for-agent
Label: ready-for-agent

## Problem Statement

herdr-bot 已提供 Map Run 的管理者动作、节点报告和等待收取接口，并按 Task 类型选择 manager-chat 或 node-chat 扩展入口，但 my-agent-toolkit 尚未交付这两个角色扩展。管理者和节点 Session 因而缺少符合后端协议的工具及工具使用指引，不能仅凭后端已完成或入口文件存在宣称角色接入完成。

节点工作目录各不相同，扩展不能依赖当前目录定位服务配置，也不能让模型填写身份来决定 Run 归属。报告保存、辅助通知、节点交接完成与 Chat 停轮是不同事实，错误处理若将它们混为一谈，可能导致重复报告、重复执行或错误推进。collect 的长等待还要求公共 HTTP 支持真正取消请求，包括已经收到响应头但仍在读取正文的阶段；目前公共 HTTP 只有内部超时，没有调用方取消能力。

用户需要只在 my-agent-toolkit 完成两个独立 auto extension 的开发，对接已实现的 herdr-bot，不复制后端状态机、不重新开发后端或界面，也不依赖 connect-bot 的启用状态。

## Solution

提供 manager-chat 与 node-chat 两个独立的 omp 自动角色扩展入口，分别由对应角色 Task 加载到不同 Session。管理者获得 run 和 collect，节点执行者获得 report；两者各有独立声明、自动启用策略和首次启用工具指引，共享必要的协议与配置实现，但不共享会话身份、请求生命周期、内存状态或连接。

扩展通过公共 Session 能力取得原生身份，自动随 HTTP 请求携带，由后端确定 Run、角色及执行归属。业务配置稳定定位服务 endpoint、普通请求预算与 collect 长等待预算，不随 node cwd 改变。请求复用公共 HTTP，补齐调用方取消，并将工具中断和会话结束接入取消链路。

工具保留后端成功、拒绝、逐项失败与部分生效信息，不自主重试、不伪造快照、不把报告当作完成。管理者与节点获得各自可操作的指引，维护者获得独立于临时讨论材料的部署、配置、协议和故障说明。实际装配和真实宿主行为须有证据，受控验证不代替真实对接。

## User Stories

### 角色与装配

1. As a Task 使用者, I want manager 类型 Task 加载独立的 manager-chat 自动入口, so that 管理者获得正确角色能力。
2. As a Task 使用者, I want node 类型 Task 加载独立的 node-chat 自动入口, so that 节点执行者只获得自己的角色能力。
3. As a 扩展维护者, I want 两个角色具有独立 extension ID 和声明, so that 不因共享实现而合并角色或混用状态。
4. As a Session 使用者, I want 已加载的角色扩展按现有自动策略启用, so that 不需要手动命令才能使用工具。
5. As a 扩展维护者, I want 自动发现、装配和启用都被落实, so that 不把入口存在误判为功能可用。
6. As a Session 使用者, I want 角色扩展不依赖 connect-bot 开关, so that 未接入面板上报也能调用运行工具。
7. As a 扩展维护者, I want 同业务目录的两个独立声明得到静态集成检查的正确处理, so that 检查器不会只分析第一个角色或误报合法组织。
8. As a 长期维护者, I want 业务实现、宿主接入和发现入口职责清晰, so that 后端协议不会侵入 framework 或薄入口。

### 身份与配置

9. As a 管理者, I want 工具自动携带当前原生 Session 身份, so that 不必填写 Run 或角色归属。
10. As a 节点执行者, I want report 只要求报告正文, so that 来源、接收者和执行关联由系统确定。
11. As a 运行维护者, I want 无关联、歧义身份和角色越权得到真实拒绝, so that 扩展不按名称、目录或 Task 猜测归属。
12. As a 运行维护者, I want 明确知道 sessionId 不是秘密认证凭据, so that 不把同机信任误认为强认证或沙箱。
13. As a 节点执行者, I want 在不同 zone 工作目录仍读取同一套明确配置, so that 不因 cwd 改变而连错服务。
14. As a 部署维护者, I want 显式配置 endpoint 与请求预算, so that 不依赖后端未提供的配置注入或偶然默认目录。
15. As a 部署维护者, I want collect 使用独立的长等待预算, so that 不被普通短请求预算提前截断。
16. As a 部署维护者, I want 配置错误明确暴露, so that 不通过静默回退掩盖错误服务地址或错误预算。

### 管理者动作

17. As a 管理者, I want run/status 返回当前运行事实、可派发项、阻塞原因和结束条件, so that 能基于后端事实选择下一步。
18. As a 管理者, I want 显式列出多个 node 执行 dispatch 并看到逐项结果, so that 一个目标拒绝或失败不会掩盖其余目标的结果。
19. As a 管理者, I want 后端拒绝依赖未满足或状态不允许的动作时保留拒绝原因和现场, so that 不把旧快照当授权。
20. As a 管理者, I want complete 显式表示可交接并满足下游依赖, so that 不需要等 Chat 退出或另做放行动作。
21. As a 管理者, I want fail 记录执行失败而不隐含暂停或终止 Chat, so that 人类仍可核实现场。
22. As a 管理者, I want reconcile_dispatch 按实际后端协议表达人工核实结果, so that 不通过自填 Chat 身份修补不确定派发。
23. As a 管理者, I want recover 表达对原执行可继续的确认, so that 不把状态恢复误当作新执行。
24. As a 管理者, I want retry 表达对新执行的人工确认并得到真实结果, so that 明确新 Chat 不会撤销旧执行副作用。
25. As a 管理者, I want pause 只阻止新执行且 resume 不自动派发, so that 后续推进仍由显式动作决定。
26. As a 管理者, I want finish 仅在后端确认全部节点完成时结束 Run, so that 不以 Chat 在线状态推断运行完成。
27. As a 管理者, I want 重复动作的已有事实与首次说明得到保留, so that 客户端不另造一套重复操作规则。
28. As a 管理者, I want 每个 action 只暴露其实际必要参数, so that 不发送后端会拒绝的多余字段或允许模型伪造身份。

### 报告与收取

29. As a 节点执行者, I want 在结果可交接时提交地址和使用限制, so that 管理者知道如何核实和使用产物。
30. As a 节点执行者, I want 报告保存与辅助通知结果分别呈现, so that 不会仅因通知失败重复提交报告。
31. As a 节点执行者, I want 清楚 report 不自动完成 node, so that 不把报告成功当作状态推进成功。
32. As a 管理者, I want collect 返回原因、快照和按 node 汇总的报告标识, so that 能处理交接而不重复接收报告正文。
33. As a 管理者, I want 已检查但未完成的交接待办仍被保留, so that 阅读和通知检查不会被误当作完成。
34. As a 管理者, I want 暂停、结束、通知、防空等和到期的返回原因明确区分, so that 能选择派发、核实、恢复或结束而非盲目等待。
35. As a 管理者, I want collect 不依赖 Herdr 辅助通知投递成功, so that 已保存报告仍可处理。
36. As a 管理者, I want 历史报告和当前适用报告保持后端给出的区别, so that 旧执行结果不会被客户端当作新执行依据。
37. As a Session 使用者, I want 工具中断或 Chat 结束真正取消在途等待, so that 不留下无人消费的长请求。
38. As a 管理者, I want 正常到期、主动取消、网络失败和正文读取失败被明确区分, so that 错误不会伪装成正常快照。
39. As a 运行维护者, I want 取消请求不被描述成回滚后端已接受的动作, so that 不错误重做已生效操作。

### 错误、指引与交付

40. As a 管理者, I want HTTP 200 中的逐项失败和历史追加失败清晰可见, so that 不把传输成功当作所有效果成功。
41. As a 管理者, I want 非成功 HTTP 响应中的结构化错误及部分效果得到保留, so that 能核实已启动 Chat 或已提交状态。
42. As a 运行维护者, I want 工具不自动重试状态动作、report 或 collect, so that 不隐藏不确定结果或制造额外副作用。
43. As a 管理者, I want 首次启用时获得完整动作与 collect 指引, so that 不依赖简短工具 description 猜测恢复和交接责任。
44. As a 节点执行者, I want 首次启用时获得报告时机、正文内容和通知失败处理指引, so that 能正确报告而不越权推进流程。
45. As a Task 使用者, I want 固定职能、本次工作输入和扩展工具指引分开提供, so that 不维护相互冲突的提示词副本。
46. As a 人类处理者, I want 指引明确 recover、retry 和人工 complete 的区别, so that 不将恢复、重新执行和真实交接混为一谈。
47. As a 维护者, I want 公共 HTTP 取消能力保持既有消费者行为并支持真实资源清理, so that 新角色接入不会破坏其他扩展。
48. As a 验收者, I want 实际 omp 加载对应角色工具并获得指引, so that 不以静态入口、模拟注册或 Agent 偶然做对代替装配证据。
49. As a 验收者, I want 两个角色与真实后端的调用及取消行为得到验证, so that 不把受控客户端结果冒充实际工具集成。
50. As a 验收者, I want 所有验证声明注明范围和环境限制, so that 后端已完成不会被误报为 toolkit 或整条运行链路已验收。
51. As a 长期维护者, I want 长期文档说明配置、实际协议、角色责任和故障处置, so that 删除临时 spec 与讨论记录后仍能维护和使用扩展。

## Implementation Decisions

### 范围与权威

- 本次仅交付 my-agent-toolkit 侧；用户说明 herdr-bot 开发已经完成，调查已核对其实际接口。该说明与静态核对不是产品运行验收证据。
- manager-chat 与 node-chat 是两个独立的 auto extension 入口，面向不同角色 Session。仅支持 omp，无手动模式；不把两个入口合并为单一角色切换扩展。
- 沿用已批准上游语义：Run 是 Map 的一次运行，node 是静态工作安排；管理者不是业务 node；Completed 是可交接及满足依赖，不是框架 Round 结束、报告提交或 Chat 退出。
- herdr-bot 是身份归属、动作准入、状态、报告适用性、持久化和通知的唯一权威。toolkit 不复制状态机或主动规划执行，不根据本地观察修正后端事实。
- 实际后端实现和长期运行文档决定 wire contract。临时上游 spec 的概念字段不直接当成可发送字段；不修改后端以迁就客户端猜测。
- 上游已有系统级契约作为约束输入，但本 toolkit spec 不替自身提前选择测试 seams 或批准 promises；这些由后续 /to-contract 承担。

### 模块与装配

- 两角色在同一业务目录下各有独立扩展声明、工具指引、角色装配及薄 omp 自动发现入口；共享必要配置、协议与请求处理，不共享 Chat 身份、会话资源或连接。
- manager/node 依赖 common，common 不反向依赖角色；framework 不依赖业务。只有实际职责需要时才建立公共基础模块，不为目录对称制造空层。
- 两角色 ID 分别登记自动启用策略，装配显式选择策略；遵循框架既有启用与历史规则，不每轮强行重开、不为切换重置 Prompt 注入记录。
- 同业务目录多独立 definition ID 要纳入现有静态集成需求分析与检查能力，不接受忽略第二角色、关闭检查或伪造一个共享 ID 的规避方案。具体内部调整留给实施。
- 原生工具接入与会话上下文转换属于宿主边界，协议、错误处理和角色业务不放入发现入口。复用公共能力，不建设通用宿主插件平台或无消费者的通用 Tool 框架。

### 配置与身份

- 两声明显式指定 config.path，装配提供由自身位置确定的稳定 configBaseDir；不按角色 ID 默认推导两个业务配置目录，不依赖 node cwd。
- 业务配置显式提供 endpoint、普通请求预算及独立 collect 请求预算。沿用框架配置加载和错误规则，不新建配置框架、自动 endpoint 发现或环境变量回退机制。具体键名属于后续契约整理，不在此虚构已发布配置 schema。
- 后端当前只装配角色入口，不注入上述配置或等待期限。部署者需使 collect 请求预算大于后端期限；后端默认等待 5400 秒，长期文档建议客户端默认预算为 5460000 毫秒。不存在自动同步后端配置的握手。
- 通过公共 Session/adapter 取得实际原生 sessionId，自动放入请求 JSON；不能用 Owner key、显示名称、cwd、Task 或 Tab 代替，不向模型暴露身份、Run 归属、execution 或接收者参数。
- 后端按每次请求判定身份唯一性和角色权限；请求只接受同机来源，不仅限于字符串 localhost。sessionId 不是秘密，接受既定同机进程冒用风险，不新增 token 或改变既有信任边界。
- 活动期间原生会话切换的自动检测与重新绑定不在首版范围；会话结束与工具取消仍必须清理对应在途请求。

### 工具与实际 HTTP 契约

全部运行工具使用 POST JSON。manager 的 run 工具按 action 映射到 /api/workflow/manager/<action>；collect 调用 /api/workflow/manager/collect；node 的 report 调用 /api/workflow/node/report。每个传输请求额外自动携带 sessionId。

| 工具或 action | 模型业务字段 | 约束及含义 |
| --- | --- | --- |
| run/status | 无 | 读取快照，终态仍可查询 |
| run/dispatch | nodes | 显式 node 标识数组；后端逐项校验并串行落实批次，独立 Chat 可并行工作 |
| run/complete | nodeId、reason | running 或允许人工交接的执行阶段 failed；不伪造报告 |
| run/fail | nodeId、reason | 记录执行阶段失败，不隐含暂停或终止 Chat |
| run/reconcile_dispatch | nodeId、finding、reason | finding 为 uncertain、not_created 或 created；仅核实派发阶段失败 |
| run/recover | nodeId、confirmed、reason | 确认原 Chat 可继续，恢复跟踪，不新建 Chat |
| run/retry | nodeId、confirmed、reason | 确认后创建新执行；不撤销旧副作用，paused 不可调用 |
| run/pause | 无 | 禁止后续新执行，不撤回已接受批次或终止已有 Chat |
| run/resume | 无 | 恢复派发资格，不自动派发 |
| run/finish | 无 | 全部 node completed 后显式结束 |
| collect | 无 | 等待或立即返回原因与最新现场 |
| report | body | 报告正文，其余关联由后端确定 |

- 请求使用后端实际 camelCase 字段与严格 action 参数形状，不发送多余字段或 query 参数。后端未知字段拒绝不是客户端追加宽泛 payload 的许可。
- 与临时 spec 参数描述不同，实际 reconcile_dispatch 不接收模型提交的 Chat 引用：created 分支使用后端已保留的派发效果重新核实原生身份，无法核实则保持失败。按实际协议实现，不新增身份修补入口。
- recover/retry 的 confirmed 是实际接口字段，不能在工具包装中隐式填 true，绕过其人工确认语义。reason 的核实依据由管理者提供；扩展不判断自然语言内容是否足以构成人工确认。
- 通用查询结果含 snapshot、ready、blocked、canFinish、reports 和 pendingReports。pendingReports 是 node 到报告标识的映射；dispatch 增加逐项 results，retry 增加单项 result，状态动作可带 changed、historyError。
- collect 不返回 reports 正文；增加 reason，取值为 paused、completed、notification、no-running、timeout。工具不自行清空待办或推进状态；管理者按标识读取已提供的报告记录或已有详情。
- report 返回 saved、report、notification、diagnostic、guidance，保留保存、辅助投递和诊断的区别。每次提交可生成新报告，不合并为客户端幂等操作。实际后端仅要求 body 为字符串，扩展不凭空添加产物路径业务校验或声称后端拒绝空字符串；指引要求有意义的结果地址和使用限制。
- 旧执行报告可能仍被后端接受，但待办只采用后端确定的当前适用报告；客户端不另造报告适用性规则。
- 不增加角色间发送、联系人查询、广播、接收连接或自动流转工具。

### 错误、取消与资源

- 复用公共 HTTP 实现，扩展公共请求契约以接收调用方取消，贯通工具 AbortSignal 与对应 Session 生命周期；不复制 connect-bot 私有客户端，不仅用提前返回的 Promise 留下后台请求。
- 取消须覆盖连接、等待响应以及正文读取阶段，并清理对应资源。拿到 HTTP 200 响应头不代表 collect 已返回成功，只有完整且可解析的正文才是正常结果。
- 正常后端 timeout、调用方取消、客户端预算耗尽、网络失败、正文传输或解析失败应如实区分。公共错误分类具体形式由后续契约整理，但不能把所有 abort 都称为 timeout。
- 不自主重试任何运行工具；取消、网络失败不保证返回快照，不生成空快照或推断 Run/node 已失败、暂停或未生效。
- HTTP 200 不等于全部业务成功。保留批次逐项失败、historyError、stateCommitted 和已发生外部效果；非 2xx 的结构化错误正文也不能丢弃。
- 状态已提交但历史追加失败不能描述为回滚；报告保存成功但通知失败不能描述为报告未提交。仅通知或诊断失败不得自动重报或提示必须重报。
- 后端已接受的状态动作、dispatch 和 report 不承诺因调用方断线而撤销；collect 断线则释放后端等待资源。工具反馈不把“本地已取消”提升为“后端无副作用”。
- 共享 HTTP 变化须兼顾既有消费者，公共模块保持业务无关，不加入 Run 协议或 connect-bot 依赖。

### Prompt 与长期文档

- 每个角色通过公共 PromptDeclaration 的 first-enabled-run 注入自己的工具指引；工具 description 仅负责工具入口说明，不能替代使用手册。
- Task.prompt 负责固定职能，本次 input 负责工作信息和路径，extension 负责工具指引；扩展不重新拼装后端启动输入、不自动传播 user_input、不注入 Bot 文档或完整 Map。
- 管理者指引覆盖全部 action、collect 返回原因与等待策略、依赖/终态限制、失败核实、recover/retry 区别、人工完成的真实交接责任、部分效果和不重试规则。
- 节点指引覆盖可交接时报告、地址和使用限制、报告不等于完成、允许不影响结果的后续收尾，以及保存成功但投递失败不要重报。
- Herdr 通知仅是辅助输入提交，不承诺严格顺序、已阅读、打断 collect、强制续轮或原生 IRC 等价行为。
- 长期说明覆盖安装与自动装配、稳定配置、协议字段与错误语义、取消及真实验证限制；框架公共能力变更同步更新其权威文档。临时材料删除后不能失去必要使用与维护信息。

## Testing Decisions

- 本次文档发布只做文档结构与链接检查，不运行产品测试，也不宣称后端、扩展或真实链路验收通过。
- 实施沿用仓库现有测试分层：迭代跑受影响测试；TypeScript 变化运行 typecheck；票据完成覆盖所属分区及受影响公共能力消费者；最终集成使用仓库统一 test 入口与 typecheck，不以裸全量测试命令绕过仓库调度策略。
- 宿主接入变化沿用现有 real-host dock 与实际加载验证惯例。静态 integration check 与运行行为证据不同，静态通过不自动提升宿主兼容支持声明。
- 共享工作树的昂贵全套或真实宿主检查遵循安静窗口与顺序协调；运行期间保持受测源码和环境稳定，日志保留可归属的命令、退出状态及环境信息。
- 已确定需要真实观察两个角色的 auto 启用、实际工具和 Prompt 注入、原生身份，以及不同 cwd 下稳定配置。不能用入口文件存在、受控注册或 Agent 偶然成功代替这些事实。
- HTTP 取消需实际观察正文读取期间中断和资源释放；隔离 HTTP 服务可构造延迟、非 2xx、部分生效、传输错误等确定性条件，但不能证明真实 omp 的工具中断或 Session 结束事件已经接通。
- 公共 HTTP 改动需验证受影响既有消费者；长等待可使用短配置验证期限与取消，不要求每个检查等待默认 90 分钟。默认预算关系仍需核对。
- 真实对接使用隔离的验收 Session、数据和目录，不操作用户现有对话或产物。需要实际 herdr-bot、Herdr、omp、有效角色 Task、zone 与模型配置时，缺失前提应如实报告，不以替身宣称通过。
- 上游 A、B → C 真实链路可提供角色集成的最终使用证据：管理者显式推进、节点报告、依赖完成后派发下游，至少一个前置报告后仍收尾。只对本次实际执行与观察到的 toolkit 贡献作结论，不把本 spec 扩大为重新实现全部后端及 UI。
- 本 spec 不选择新增 seams、不分配逐项 promise coverage、不直接移植上游系统级人工验收条目；这些由 /to-contract 在本次范围内批准。

## Out of Scope

- 修改或重新实现 herdr-bot 后端、Task 类型迁移、Run 持久化、状态机、通知服务、workflow 页面和 Chat 启动系统。
- 本次 spec 发布即开始产品实施、运行实施票据或宣称全部设计/验收承诺已批准。
- pi 角色扩展、手动启用模式、单扩展动态切换角色、通用插件平台或独立扩展生成器。
- 客户端自动派发、重试、重报、恢复、接管或第二套状态及报告索引真相。
- 自动发现 endpoint、自动同步后端等待期限、独立配置框架、配置热重载或静默默认服务回退。
- manager→node 消息、同伴通信、广播、联系人查询、接收长连接、强制续轮或严格通知阅读保证。
- 强认证、新凭据、以 sessionId 作为秘密、活动期间原生会话自动重绑定。
- 报告产物复制、路径业务校验、动态参数插值、Bot 文档自动注入或 user_input 自动下发。
- 改变后端重复操作、暂停、完成、重试、重启旧 Run 只读及不接管语义。
- 自动终止旧 Chat、撤销旧副作用、客户端事务回滚、异常窗口完整幂等保证。
- 为满足静态工具假设而合并角色 ID、跳过检查，或以受控替身冒充真实宿主验收。

## Further Notes

### 发布与下一步

用户明确请求先生成 spec；本次发布不等于实施授权。此前设计质询的最终实施确认未被当作已获答复，也不因此阻止按用户本次指令发布文档。

本 spec 按 ready-for-agent 发布，无需额外 triage。已完成 /to-contract 并发布[获批契约](contract.md)：三个 seams、29 条承诺、Rapid iteration 模式及一项人工最终使用判断由该契约持有，不在 spec 复制。下一步为 **`/to-tickets .scratch/manager-node-chat/contract.md`**，以获批承诺与 coverage 进行实施拆解。契约批准不表示产品实现或验收已经完成。

### 依据与当前状态

- [本次设计讨论记录](design-notes.md)记录用户确认：仅 toolkit 侧、以已完成后端实现确定协议、两个独立 auto 入口面向不同角色 Session。
- [领域上下文地图](../../GLOSSARY-MAP.md)与[角色领域词汇](../../extensions/workflow-chat/GLOSSARY.md)约束术语；[框架 ADR](../../docs/adr/0002-semantic-extension-framework.md)约束共享源码、公共能力与薄入口职责。
- [仓库测试指引](../../docs/agents/testing.md)约束后续验证范围与共享工作树协调。
- 上游仓库 herdr-bot 的长期运行说明与运行契约是接口和业务权威；其临时 workflow-map-runtime-design spec/contract 提供批准来源，不应成为最终部署文档的必要依赖。两个仓库作为同级 checkout 进行过静态核对。
- 当前实际后端具有角色动作、collect/report 与固定入口选择。toolkit 已有公共 Prompt、Session 和稳定配置机制，但尚缺双角色实现及公共 HTTP 调用方取消；静态集成需求推导还存在单 definition ID 假设。
- 本次没有更改产品代码、没有运行真实角色链路、没有验证后端完成声明。后续应将确定性检查、真实宿主与后端对接证据、人工使用判断及缺失前提分别报告，不混写成笼统的“完成”。
