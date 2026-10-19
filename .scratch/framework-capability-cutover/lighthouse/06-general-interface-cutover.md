# 确定 General 操作与内部配置 seam 的隔离：Lighthouse

> Question and discussion: [确定 General 操作与内部配置 seam 的隔离](../decision/06-general-interface-cutover.md)
> Prerequisite: [统一 interface 所有权与迁移原则](01-shared-interface-policy.md)
> Related authority: [Feedback、Host facts 与 authoring 契约归属](04-host-feedback-authoring.md)

## Question

HTTP、协调文件更新与 Extension configuration 如何只通过最小公开 interface 使用既有实现，同时保留内部配置读取、校验和 transport seam？本结论完整覆盖本票，不执行生产改造，不决定最终实施顺序或整体 harness 验收矩阵。

## Discussion

### 确认来源与范围

无独立会话定位符，以下问题编号和用户原话构成可恢复确认记录；初轮 Q1–Q4 的推荐不单独视为批准，后续明确确认取代早期候选。

- 用户先指出「capability的功能需要依赖adapter实现，而通用模块是独立封装的功能，不需要依赖adapter」；对 Q5 的术语区分回答「同意，这次可以顺便对通用模块进行改造，只暴露interface，其他部分没什么变化」。
- Q6 用户「同意，通用模块的部分尽量不要修改原有的逻辑」：批准 HTTP、文件更新的具体公开清单及保持既有行为。
- Q7、Q8 用户分别「同意」：批准配置最小公开操作、内部读取 seam 保留，以及 model-cost 自有诊断 helper。
- Q9 用户「同意」：批准 general 下三个直接入口，无汇总转发入口。
- Q10 用户「不考虑极端情况，先不做限制」：不批准冻结配置的推荐。Q12 明确展示原政策归属文件与有限修订，解释类型约束和运行时防护后，用户明确「不需要运行时防护」。该修订只在原共同原则权威发布。
- Q11 用户「同意」：批准真实 HTTP、跨进程文件、配置绑定与错误、消费者迁移的实施验收方向；其中条件性的配置写保护未获批准，不作为要求。
- 最终 Q13 汇总术语、入口、清单、行为保持、消费者迁移、有限只读修订与验收交接，用户「同意」，授权完成发布与追溯，不授权生产实施。

### Capability 与通用模块的区分

本努力采用 [framework 领域词汇](../../../framework/GLOSSARY.md) 的 Framework capability / Framework general module 区分：capability 依赖 adapter 接入 harness 的事实、操作或生命周期，具体语义仍可由 framework 实现；通用模块不依赖 adapter。拥有公开 interface 并不使模块自动成为 capability。

HTTP 与协调文件更新是通用模块。General 是通用功能的导航分组，不是 capability，也不新增 adapter、注入对象、registry 或运行时包装层。配置读取保留 framework binding 的校验与交付流程，不因归在 General 就成为 adapter-backed capability。

现有架构文档把 General 列为 capability 的文字需要在实施文档更新时修正；本规划不假称目标入口已存在，也不重写已完成 Session 的领域语义。

### 三个直接公开入口与 canonical 所有权

```text
framework/interface/general/
  http.ts
  files.ts
  config.ts
```

| 入口 | 唯一公开内容 |
| --- | --- |
| framework/interface/general/http.ts | request、HttpRequestOptions、HttpConfigurationError |
| framework/interface/general/files.ts | updateFile、SafeFileUpdateOptions、SafeFileUpdateError、SafeFileUpdateFailureKind |
| framework/interface/general/config.ts | getConfig、ExtensionConfigError |

公开类型与错误类由对应 interface 文件 canonical 拥有，内部实现引用这些声明；不重复定义或从内部模块 blanket re-export。普通函数入口可以按共同原则的精确例外连接现有内部实现，避免循环依赖；这不是在旧路径留下兼容转发。

不建立 general/index.ts，不从 interface 根入口再汇总这些操作。三个入口本身不承担新运行时逻辑；现有深实现保留在 modules/http、modules/files、core/config，按迁移所需调整声明导入和连接，不为目录对称搬迁或重写。

### HTTP 的调用契约与内部 seam

保留 request(url, options): Promise<Response>；HttpRequestOptions 仍为 method、headers、字符串 body、timeoutMs、proxy，不新增序列化或响应包装。HttpConfigurationError 保留 detail，表示请求发出前的配置失败；不增加统一 transport 错误体系。

HttpTransport、HttpTransportInit、HttpModuleSeam、HttpModule、createHttpModule、共享配置路径、reader/parser、默认值与代理解析均为内部 seam。扩展可以通过 proxy 选择共享配置中的代理名，不能取得代理表或注入 framework transport。

保留现有代理启用/禁用与直连规则、预算选择及整次交换的超时语义、标准 Response 和错误传播。配置失败不偷偷改为直连；不新增重试、缓存或 adapter 依赖。

### 协调文件更新的调用契约与内部 seam

保留 updateFile<T>(target: string, update: (current: unknown) => T | Promise<T>, options?: SafeFileUpdateOptions): Promise<T>，返回发布的 next 值；不新增同步版本、通用事务或公开锁操作。

SafeFileUpdateOptions 保留 timeoutMs 与 signal。等待预算覆盖进程内排队和跨进程锁获取；signal 只取消等待，更新开始后不是回滚机制。SafeFileUpdateError 保留 kind 与 detail；SafeFileUpdateFailureKind 保留 timeout、cancelled、io、corrupt。更新函数自己的业务错误原样传出，不包装成协调错误。

队列、锁、临时文件、协调键、恢复与重试常量、原子发布过程保留内部。保持锁内重读、跨进程协调、完整原子发布与原有失败分类；保留现有本机文件系统适用范围，不扩大为分布式锁或网络卷正确性承诺。

### 配置读取、加载错误与 authoring 的分工

General 只公开 getConfig(definition) 与 ExtensionConfigError。前者继续读取该进程中 binding 已校验并记录的扩展配置；后者用于没有可用已校验配置时的使用错误，不加入 binding 失败联合。

ConfigLoadError 保留内部：声明、读取、解析或校验失败由 binding 转为配置绑定失败，扩展不会成功加载。ConfigReader、ConfigParser、ConfigSource、ConfigReadOptions、readConfig、readConfigDocument、findConfigFailure、字段校验与声明解析 helper 都不是 extension-facing interface，不整体搬出 core/config。

ExtensionConfigDeclaration、ConfigFieldType 等整体配置声明继续由 [authoring 权威](04-host-feedback-authoring.md) 指定的 interface/details/definition.ts 拥有，General 不重复拥有。context.config 的交付继续遵守该权威，getConfig 保持现有普通函数形式。

Extension configuration 与 Shared configuration 保持区分；不开放代理表、runtimeDir 或 pi 子代理配置的读取 interface。保持既有读取、校验、生效和缓存时序，不把缓存时序收敛、热更新或刷新管理捆绑进迁移。

配置值的只读保障以 [共同原则中的配置有限例外](01-shared-interface-policy.md#扩展可见性与实际对象同步收窄) 为唯一权威。本票引用该批准，不另外建立或扩大运行时隔离政策。

### model-cost 的内部依赖退出

model-cost 的消费文档诊断改用扩展自有小 helper，退出从 core/config 导入 describeValue 的依赖，保持现有诊断效果。不为此新增 framework 公共工具 module，也不把消费文档业务校验带进 framework General。

### 消费者迁移、退役与实施验收

迁移所有相关 extension、framework、adapter、工具和测试消费者。公开错误类必须保持单一身份，使内部抛出的错误能被公开入口导入的类识别；不得保留一份内部类和一份公开类。确认无调用后移除旧公开声明、导出和 extension legacy 导入例外，不保留兼容 alias/re-export；内部文件仍有 framework 调用时保留实现，不等于允许扩展导入。

按 [测试约定](../../../docs/agents/testing.md) 验证公开 interface 后的既有行为，而不是仅证明导入成功：

- HTTP：真实本机 HTTP 请求与代理路径，覆盖超时及响应体读取；配置失败不得降级为直连。
- 文件：真实临时目录和多进程竞争，验证锁内重读、不丢更新、完整发布、原有失败分类与业务错误传递。
- 配置：真实临时配置文件驱动 binding，覆盖成功加载、加载失败、getConfig 使用错误及原有缓存时序；不增加绕过类型约束后的修改防护验收。
- 消费者和入口：更新导入限制，运行 typecheck、所属测试分区及受影响消费者；确认旧公开导出与内部导入例外退出。

优先复用既有行为覆盖，不为声明搬家、转发关系、目录组织新增永久测试；只补消费者可见的真实行为缺口。最终三个扩展、两种 harness 的组合 smoke/dock 矩阵、共享工作树协调、实施顺序、完整旧入口退役及文档/ADR 导航更新，由 [确定整合顺序、旧入口退役与验收交接](../decision/07-cutover-integration-plan.md) 定稿。

### 证据与限制

本次只读核对 public.ts:65–135、modules/http.ts 的公开选项/错误/工厂 seam 与 request 出口、modules/files.ts 的选项/错误与 updateFile、core/config.ts 的读取校验/缓存/getConfig/findConfigFailure，以及 core/assembly.ts 的 ImplementationContext。图谱大纲辅助定位，实际源码用于核实声明与逻辑。

当前扩展消费者搜索观察到：connect-bot 的 panel/config 使用 getConfig；model-cost 的 quota/balance 使用 request 和 HTTP 选项，quota 区分 HttpConfigurationError；估算与消费存储使用 updateFile，消费存储依赖 SafeFileUpdateError 分类；消费文档依赖 describeValue。搜索不是未来零残余调用的证明，实施时须重扫。

观察到现有缓存配置直接返回普通对象，字段校验只接受基础值，未提供冻结；这是用户选择保持现状的背景，不是运行时不可修改的证据。本轮未改生产代码、未运行 HTTP/文件/配置行为或 harness smoke；上述均为实施验收要求，不是本次通过声明。

## Decision

将 General 作为非 adapter-backed 通用功能分组，以三个直接 interface 入口唯一拥有最小公开声明，连接既有深实现并尽量保持原逻辑。配置只读保障引用共同原则的有限例外；完成消费者迁移、旧入口退役和真实行为验收后才可认定实施完成。

## User stories

1. 作为扩展作者，我希望通过直接、最小的 HTTP 和文件 interface 使用现有功能，以便不必依赖内部 transport、锁或测试工厂。
2. 作为扩展作者，我希望读取 binding 已校验的扩展配置并识别使用错误，以便不必掌握通用配置加载和 Shared configuration 的内部规则。
3. 作为通用模块维护者，我希望只调整公开声明与入口连接并尽量保留既有逻辑，以便不因 interface 迁移引入功能或时序变化。
4. 作为 model-cost 维护者，我希望拥有自身消费文档诊断 helper，以便退出 framework 内部依赖而不扩大公共工具面。
5. 作为整合维护者，我希望迁移所有消费者并以真实 HTTP、跨进程文件与配置绑定行为验收，以便关闭旧入口时不遗漏运行时行为或调用者。

## Preconditions

- 统一 interface 原则提供 canonical 所有权、精确运行时入口例外与无调用者后退役规则，并已发布配置只读的有限修订。
- authoring 权威提供配置声明及 context.config 的归属；现有 HTTP、文件协调和配置实现是保持对象，不推定本次已经验证其行为。
- 当前既有本机文件系统、Shared configuration、State / Session 与 harness 支持约束保持有效。

## Postconditions

- General 的公开操作、选项、错误、入口组织、内部 seam 和 model-cost 依赖退出已有完整规划输入。
- 整合票可据此汇总残余声明、共享文件冲突、迁移顺序和最终验收，不再等待本票的成员清单或配置防护选择。
- 实施必须迁移消费者与更新导入限制、架构文字和文档导航；本规划不保证目标文件已存在、旧调用已清零或任一行为通过。

## Invariants

- HTTP、文件与配置继续使用普通函数，不新增 adapter、registry、注入式 General 对象、同步文件操作或通用事务。
- 不改变现有代理、超时、错误、锁内重读、原子发布及配置读取校验/缓存时序；不扩大到 Shared configuration 公开读取。
- 对齐现有 Session 的唯一声明归属与扩展只读获准 interface 原则，不机械复制其目录或注入对象形状；配置只读的有限例外只按共同原则执行。
- 公开错误类与内部抛出使用同一身份；测试可继续使用内部 seam，但扩展不能因测试需求获得它。
- 本票仅规划，不修改生产行为，不以发布或静态检索代替真实 smoke、测试或 harness 兼容性验收。
