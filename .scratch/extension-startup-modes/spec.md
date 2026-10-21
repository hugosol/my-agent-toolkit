# Extension 手动模式与自动启动模式

Status: ready-for-agent
Labels: ready-for-agent

Contract: [已批准契约](./contract.md)

## Problem Statement

维护者希望在 agent 启动时，按本次用途选择 extension：一些会话只加载 codebase-tools，另一些还加载 connect-bot。当前逐 extension 的薄入口已经支持通过宿主启动参数按需加载，但加载后通常仍需要用户输入命令才能启用。

用户需要保留手动启用的使用方式，同时增加自动启动方式：加载所选 extension 后，由配置确定启动默认值；需要外部业务操作的 extension 自动触发与命令相同的操作。例如，connect-bot 应当触发面板会话登记，而不是仅把 State 改成开启。

如果为两个入口复制启动处理、配置读取和业务实现，两个模式会逐渐产生差异。反过来，为了避免少量薄入口而增加运行时配置档选择参数，也超出了这次需求。维护者希望采用两个明确的静态入口模式、两份启动配置和一套共享逻辑，并保持现有 State 恢复、持久化、子代理继承及命令行为。

## Solution

提供“手动模式”和“自动启动模式”两组可逐 extension 选择的薄入口。保留现有入口作为手动模式，新增独立的自动启动模式入口；两组入口分别选择自己的启动配置，但共享 extension 定义、装配过程和启用操作。

启动参数决定加载哪些 extension；启动配置决定已加载 extension 的初始启用选择。配置中出现一个 extension，并不意味着要加载它。两种模式使用同一套启动规则，区别来自所选配置，而不是两份硬编码的执行流程。常规手动配置默认关闭，常规自动启动配置默认开启。

沿用现有恢复行为：对具有可恢复 State 的 extension，有效历史值优先于配置默认值，包括历史关闭值；没有历史值时才使用配置默认值。codebase-tools 保持 session-entry 持久化和 follow 继承。connect-bot 保持 memory 持久化和 none 继承，不新增跨启动记忆。

codebase-tools 的启动启用同步完成，使既有 prompt 和 marker 机制读取正确 State。connect-bot 的启动启用复用现有异步注册队列：入队后立即返回，首个模型请求不等待面板注册；后台注册成功后才把实际 State 设为开启，失败则沿用现有关闭和反馈行为。

启动策略只在 agent 启动、首次主会话就绪时应用，不在之后的 new、resume、fork 或其他会话导航中重复应用。启动之后继续使用原有命令和会话边界规则，不持续用配置覆盖用户操作。

## User Stories

1. As an agent 用户, I want 逐个指定本次加载的 extension 入口, so that 我不必加载整个扩展集合。
2. As an agent 用户, I want 在同次启动中选择多个独立 extension, so that 我可以按任务组合能力而不使用聚合扩展。
3. As an agent 用户, I want 配置中未加载 extension 的条目不导致其被加载, so that 配置可以覆盖完整集合而本次只运行其中一部分。
4. As an agent 用户, I want 为已加载 extension 选择手动模式入口, so that 我可以在需要时才通过命令启用它。
5. As an agent 用户, I want 为已加载 extension 选择自动启动模式入口, so that 我不必每次启动后重复输入启用命令。
6. As an agent 用户, I want 保留现有手动入口路径, so that 已有启动方式不会仅因增加自动模式而失效。
7. As an agent 用户, I want 通过入口路径静态选择模式所使用的启动配置, so that 我不必学习新的运行时配置档选择参数。
8. As an agent 用户, I want 两种模式各自具有启动配置, so that 调整自动模式时不必同时改变手动模式的默认行为。
9. As an agent 用户, I want 已加载 extension 只消费自己对应的启动配置条目, so that 其他未加载 extension 的字段值不会参与本次业务配置校验。
10. As an agent 用户, I want 启动配置与 extension 的业务连接参数分开管理, so that 两种启动模式不必分别维护 endpoint 和请求超时。
11. As an agent 用户, I want 修改启动配置后在下次启动生效, so that 运行中的开关不会被文件变化意外覆盖。
12. As an agent 用户, I want 两种模式采用相同的启动规则, so that 相同配置不会仅因入口名称不同而产生隐藏行为差异。
13. As a codebase-tools 用户, I want 无历史 State 的会话在常规手动模式下默认关闭, so that 我仍然可以通过命令决定何时开始注入提示。
14. As a codebase-tools 用户, I want 无历史 State 的会话在常规自动模式下默认开启, so that 首次符合条件的模型运行可以直接使用现有提示注入能力。
15. As a codebase-tools 用户, I want 自动启用表达明确的开启目标而不是执行一次 toggle, so that 原本已经开启的状态不会被错误关闭。
16. As a codebase-tools 用户, I want 自动模式恢复历史关闭的会话时仍然关闭, so that 配置默认值不会推翻我已保存的选择。
17. As a codebase-tools 用户, I want 手动模式恢复历史开启的会话时仍然开启, so that “手动模式”不会破坏现有恢复语义。
18. As a codebase-tools 用户, I want 没有历史值与历史值为 false 被正确区分, so that 自动启动默认值不会覆盖一个真实的关闭记录。
19. As a codebase-tools 用户, I want 启动后的命令继续使用原有 toggle 行为, so that 我无需适应另一种运行中控制方式。
20. As a codebase-tools 用户, I want 启动模式不重置已有提示注入进度或删除历史消息, so that 原有注入与 History preservation 行为保持不变。
21. As a codebase-tools 用户, I want 子代理继续 follow Owner 的当前值, so that 自动模式不会引入独立的子代理启用策略。
22. As a connect-bot 用户, I want 常规手动模式不在启动时发送面板注册, so that 只有主动执行命令才尝试接入面板。
23. As a connect-bot 用户, I want 自动模式在首次主会话启动阶段触发面板登记尝试, so that 无需手工输入 connect-bot 命令。
24. As a connect-bot 用户, I want 命令与自动启动复用同一个业务启用操作, so that 注册、heartbeat 和反馈不会因入口不同而分叉。
25. As a connect-bot 用户, I want 注册请求入队后模型请求可以继续, so that 面板网络延迟不会阻塞 agent 工作。
26. As a connect-bot 用户, I want 实际 State 在获得有效注册结果后才开启, so that marker 不会把尚未接入的会话显示为已启用。
27. As a connect-bot 用户, I want 注册失败时沿用现有关闭和错误反馈行为, so that 我可以识别面板接入失败，同时继续使用 agent。
28. As a connect-bot 用户, I want 后台注册成功后继续运行原有 heartbeat 和状态上报, so that 自动接入与命令接入承担相同业务职责。
29. As a connect-bot 用户, I want 自动注册尚未完成时执行 off 仍能使待完成尝试失效, so that 稍后到达的结果不会重新启用已关闭的连接。
30. As a connect-bot 用户, I want Owner 结束后其待完成注册不再生效, so that 异步结果不会复活已离开的会话。
31. As a connect-bot 用户, I want 自动接入后仍可使用原有开启和关闭命令, so that 自动启动只是初始触发方式而不是永久锁定。
32. As a connect-bot 用户, I want 保持 memory State 且不从旧会话恢复“已经连接”, so that 外部效果必须由本次真实注册建立。
33. As a connect-bot 用户, I want 子代理不自动登记为独立面板连接, so that 原有 Owner 限制和 none 继承继续成立。
34. As a connect-bot 用户, I want 自动启动保持既有注册前置条件和拒绝行为, so that 改变触发来源不会绕过原有业务约束。
35. As an agent 用户, I want 启动时恢复旧会话也进入首次启动策略判断, so that “启动时 resume”不会被误认为普通运行中切换。
36. As an agent 用户, I want 启动后切换到其他会话时不再次应用入口启动配置, so that 原有会话切换和 State 恢复规则保持不变。
37. As an agent 用户, I want 一次启动中的自动触发不因重复观察或首轮请求被再次执行, so that 自动模式不会额外制造重复启用操作。
38. As an agent 用户, I want 同一个 extension 在同一进程中只选择一种模式入口, so that 不会产生两套 State、命令绑定或面板注册流程。
39. As a framework 维护者, I want 配置选择、启动时机和 Owner 范围由 framework 统一管理, so that 两个 extension 不必分别实现一套启动机制。
40. As a framework 维护者, I want 面板协议、注册队列和外部效果结果继续属于 connect-bot, so that framework 不依赖 extension 业务代码。
41. As a framework 维护者, I want 纯声明的 codebase-tools 无需增加空业务初始化函数, so that 分层不会为了形式对称而制造无意义实现。
42. As a framework 维护者, I want 两种入口共用 harness 装配过程, so that 维护原生映射时不必同步修改两套实现。
43. As a pi 用户, I want codebase-tools 的自动入口与显式 childEntry 接线保持一致, so that 子会话不会意外接入错误的入口策略或失去现有 follow 能力。
44. As an OMP 用户, I want codebase-tools 和 connect-bot 都支持这两种模式, so that 两个实际消费者验证的是同一个框架机制。
45. As a framework 维护者, I want 既有 initialize 和子代理接入等待保持原有语义, so that 非阻塞面板注册不会演变成取消其他必要初始化等待。
46. As a framework 维护者, I want 文档明确加载、启动目标和实际 State 的区别, so that 使用者不会把加载成功或请求入队误认为业务启用成功。

## Implementation Decisions

以下记录对话已收敛的方向与既有架构约束，不在本 spec 中新增接口签名或决定新的 seam。

1. 采用手动模式与自动启动模式，不再将此功能称为单独的 dynamic-entry 加载机制。宿主已经提供逐模块启动加载；本需求新增的是配置驱动的启动行为。
2. 两组入口都是逐 extension 的薄入口，现有入口保留为手动模式。自动模式采用独立加载来源，不使用一个聚合 factory 构造多个 extension，也不复制完整 harness 实现。
3. 两种入口分别选择自己的启动配置，复用同一个装配过程、extension 定义和业务启用逻辑。模式差异由配置表达，不在两份处理流程中分别实现。
4. 启动配置按 extension 身份提供初始启用选择。只有已加载 extension 的对应条目参与其启动字段校验；配置中列出某个 extension 不触发代码加载。单一配置文档仍必须能被正常解析。
5. 模式专属配置只承担启动策略；已有 endpoint、请求超时等业务配置继续共享。具体配置结构、文件命名、解析入口和接口形状留给后续 contract 阶段。
6. 不增加记忆配置，不改变 State persistence 或 Subagent State inheritance。codebase-tools 仍为 session-entry 与 follow；connect-bot 仍为 memory 与 none。
7. 对可恢复的 State，有效历史值优先于启动配置默认值，包括 false。不存在有效历史值时才使用配置初始值。手动模式不是强制关闭历史开启状态，自动模式也不是强制开启历史关闭状态。
8. 启动默认值的应用必须区分“没有记录”和“历史记录为 false”。不能仅凭当前读出的 false 就认定没有历史记录，也不能修改现有持久化载荷来引入新的记忆机制。
9. framework 统一承担所选启动配置的处理、首次主会话启动时机、Owner 范围、有效启动目标及触发协调。启动策略不在运行中持续执行，不在后续会话切换时重新应用。
10. “启动时恢复会话”仍属于首次启动；“进程运行中切换或恢复会话”继续沿用既有会话边界行为。子代理不独立执行主会话自动启用流程。
11. 启用是明确目标，不等同于执行命令文本或复用 toggle 的取反动作。codebase-tools 的纯 State 启用由框架既有 State 管理能力承接，不为了对称增加空的 shared-logic 初始化函数。
12. connect-bot 的 shared-logic 保留面板登记、队列、heartbeat、外部结果处理和实际 State 写入职责。命令路径和自动启动路径调用同一个业务启用操作，不复制注册流程，不通过模拟命令输入实现启动。
13. harness 装配与 adapter 继续提供宿主事实和原生映射；framework 不依赖 connect-bot 的业务类型，shared-logic 不直接依赖原生宿主上下文。跨层依赖继续遵循既有架构方向。
14. 自动启动采用现有非阻塞业务策略。connect-bot 注册入队后立即返回；面板注册不成为首个模型请求的新等待条件，不要求为本功能增加完成 Promise 或通用后台任务队列。
15. codebase-tools 可以同步完成启动启用；统一启动流程完成的是“业务启用操作的触发”，不要求所有外部业务效果完成。不得因此把纯同步 State 设置延后到首轮 prompt 规划之后。
16. connect-bot 仍仅在有效注册结果确认后写入开启 State；请求入队不是登记成功。失败、主动关闭、Owner 结束以及迟到结果的失效行为沿用现有实现，不新增自动重试、回滚编排或失败恢复策略。
17. 既有命令的参数语义、重复 directed 调用行为、注册前置条件和反馈规则保持不变。本需求不以自动启动为由增加命令去重或绕过无 UI、子代理等既有业务约束。
18. 既有 implementation initialize、cleanup、子代理接入及其模型请求等待语义保持不变。新增自动注册不挂入已有初始化等待链，也不能通过删除旧等待实现非阻塞。
19. 同一个 extension 的两种模式不支持在同一进程内同时加载。以互斥的加载来源选择模式，不承诺宿主会按 extension 身份合并不同路径；不通过更改 extension 身份绕过现有配置、State 或命令约束。
20. pi 的显式 childEntry 与入口装配必须保持一致，保留现有跨进程跟随能力；不为子代理增加独立面板注册或主会话启动策略。
21. 交付范围是当前已有支持组合：codebase-tools 的 pi 与 OMP 接入，以及 connect-bot 的 OMP 接入。不因双模式新增 connect-bot 的 pi adapter，也不扩展 model-cost。
22. 对话已确认的职责分层如上。具体新增声明、能力交付形状、内部 module 拆分、状态恢复信息如何传递、静态分析如何接线，以及验证 promise 所选的 seam，均由 /to-contract 在现有契约基础上决定。

## Testing Decisions

- 已有 framework State、控制、Owner／继承、实现生命周期和配置行为用例可作为先例；codebase-tools 的注入行为用例、connect-bot 的状态机、会话切换、注册及配置用例可作为消费者先例。
- 已有 harness dock、pi codebase-tools 隔离 smoke，以及入口导入约束和部署检查，为原生加载与双模式装配提供既有实践。不是用单独的源码匹配断言替代用户可见行为验证。
- 保持测试范围与改动层次相称：迭代运行受影响用例；TypeScript 变更执行类型检查与 authoring 检查；完成时覆盖所属分区及受影响消费者。涉及 harness 接线的变更还应运行相应真实宿主观察或隔离 smoke。
- 静态 authoring 与 integration 检查仅证明各自的声明表达和接线范围，不证明真实宿主行为正确，不自动提升 harness 支持状态。
- 行为验证应沿用仓库隔离约定，使用临时 agent 状态与独立 fixture，不修改正式宿主配置，不连接正在使用的用户会话，不在正式面板制造测试登记。
- 异步结果、延迟与错误场景可以沿用既有受控 transport、计时及 Owner 生命周期测试设施；不把不受控网络时序当作验证依据。具体 stand-in 及其使用位置不在本 spec 中新增决定。
- 非阻塞注册这一选择不要求新增“注册完成前阻塞首个请求”的测试或接口；也不能把入队成功当作注册成功的证据。
- 永久测试应验证真实的行为、边界和生命周期，不以薄入口文本、简单转发、配置副本或内部文件布局为新增测试目标。
- 遵循仓库共享工作树运行协调规则；记录实际执行命令、范围和限制，不把历史研究报告当成本次新入口已经验证的证据。文档阶段不声称运行了功能测试。
- 本 spec 不指定测试 seam、逐项 promise 覆盖表或新的测试契约；这些属于 /to-contract。

## Out of Scope

- 可配置的 rememberState、全局最后退出值、跨会话启用偏好，或对现有持久化、恢复及子代理继承规则的改造。
- 为 connect-bot 保存跨启动的“上次已连接”或启用意图，或把其 memory State 改成 session-entry。
- 强制自动模式覆盖有效历史关闭值，或强制手动模式覆盖有效历史开启值。
- 首个模型请求等待面板注册完成，以及为自动注册新增完成屏障、通用后台队列、自动重试、重试退避、额外去重或新回滚策略。
- 运行中热插拔 extension、监视启动配置变化、自动 reload，或运行中持续强制配置值。
- 新的命令行配置档选择参数、环境变量覆盖或配置选择 UI。
- 同一 extension 在同一进程中同时使用两种模式，或构建一套新的跨宿主重复加载检测系统。
- 聚合多个 extension 的单一 factory、extension 代码生成器、独立分发包，以及第二套 framework runtime。
- model-cost 的双模式改造、connect-bot 的 pi 接入，以及对现有支持范围以外宿主的适配。
- 修改正式宿主发现配置、自动迁移用户部署、永久安装切换或直接操作正式面板作为本次自动交付步骤。
- 将现有 initialize 重定义成自动启用钩子，取消已有必要等待，或改变既有 cleanup 与会话切换职责。
- 新增遥测、性能基准、宿主版本升级或与本需求无关的通用配置重构。

## Further Notes

- 本 spec 是需求与上游决定的记录，不是实现完成报告。发布时标记为 ready-for-agent；具体 promises、已批准 seam、后续约束选择与验收责任以[已批准契约](./contract.md)为准，拆票使用该契约作为输入。
- 现有 ADR 将配置式开关留待后续实现，并明确区分配置值、State 和外部效果。本需求推进的只是已限定的双模式启动范围；后续契约与实现应同步维护必要的架构说明，不把历史 deferred 描述误当成已有实现，也不否定现有 State 与外部效果的区别。
- 两份本地 pi／OMP 动态加载研究已在讨论中用于确认启动参数选择模块的能力；两者均可显式选择单个入口。显式加载通常是追加来源，因此使用说明必须明确如何避免同时发现两种模式。研究不代表自动模式新入口已经完成宿主验证。
- “自动”表示自动触发启用，而不是“配置中出现就自动加载”，也不是“所有后台效果完成后才允许 agent 工作”。对于 connect-bot，首个请求发出时实际 State 仍可能关闭，随后由有效注册结果改变。
- 两个真实消费者用于约束共性：codebase-tools 是无外部注册的声明式 State 消费者，connect-bot 是异步外部效果的消费者。共享启动规则，不强迫它们拥有相同的业务实现形状。
- 规范性阅读入口：[文档导航](../../DOCS-MAP.md)、[Framework glossary](../../framework/GLOSSARY.md)、[架构决策](../../docs/adr/0002-semantic-extension-framework.md)、[维护者架构原则](../../framework/docs/capability-interface-architecture.md)、[测试约定](../../docs/agents/testing.md)。
- 现有使用方式与业务术语：[codebase-tools](../../extensions/codebase-tools/README.md)、[codebase-tools glossary](../../extensions/codebase-tools/GLOSSARY.md)、[connect-bot](../../extensions/connect-bot/README.md)、[connect-bot glossary](../../extensions/connect-bot/GLOSSARY.md)。
- 背景研究：[OMP 启动加载研究](../oh-my-pi-extension-dynamic-loading-research.md)、[pi 启动加载研究](../pi-extension-dynamic-loading-2026-10-22.md)。
