# Extension 开发地图

这份地图面向新增或修改 extension 的开发者与 agent，回答两个问题：**需要一个功能时先去哪里找；新增代码应由哪一层负责。**

这是 **extension 开发者入口**，集中维护扩展的职责划分与阅读顺序，不维护第二份接口清单或实施进度。其他角色与检查专题从[文档导航](README.md)进入。

## 阅读与开发顺序

1. **找能力**：先读[能力 interface 阅读地图](../interface/README.md)，再按[框架能力索引](framework-capabilities.md)定位需要的声明、交付类型和源码。索引负责导航，canonical interface 的类型、注释与使用约定负责定义契约；不必先通读 framework implementation。
2. **理解语义**：特别核对身份、观察范围、效果权限、交付顺序、初始化/清理、异步失败与配置要求。Session 从[Session 契约](../interface/session/README.md)进入；框架术语从 [Glossary Map](../../GLOSSARY-MAP.md)定位，不以宿主同名方法代替公共语义。
3. **组织扩展**：用 `defineExtension` 声明扩展，用 `defineImplementation` 静态表达订阅、命令与生命周期，`create(context)` 构造业务状态；本页说明各层职责，[model-cost 分层实例](capability-layering.md)说明复杂扩展如何拆分。简单扩展不必复制全部目录。
4. **连接宿主**：`harnesses/` 选择 `adapters/<harness>` 公共入口并连接扩展专属实现，`entrypoints/` 只负责发现。新增公共 adapter 时转到 [harness 接入指南](harness-integration.md)。
5. **验证**：先遵循[静态 authoring 规则](static-authoring-check.md)，再按 [integration check](integration-check.md)扫描实际 extension 与目标 adapter；最后运行本扩展的行为用例和相应真实 harness 场景。静态接齐不等于语义正确，版本是否满足需求按[版本检查手册](harness-support.md#version-verification)另行验证。

架构理由见 [ADR 0002](../../docs/adr/0002-semantic-extension-framework.md)。

## 一、先区分业务、公共语义与宿主机制

- **Extension 业务**回答“这个功能要做什么”：规则、协议、业务数据、展示含义与业务动作。
- **Framework 公共语义**回答“扩展共同依赖的行为意味着什么”：状态、身份、生命周期、事件与效果权限。
- **Harness（宿主）机制**回答“在这个宿主上如何取得事实、调用能力、绘制界面”。Adapter 将原生机制接入公共语义，而不是把原生 API 换个名字透传给业务。

一项功能通常跨越几层。应按职责拆分，而不是把整个功能放进一个目录。**复用业务不等于把业务上移到 framework；适配宿主不等于在 adapter 中重写公共语义。**

## 二、代码落点

| 层 | 拥有的职责 | 判断问题 |
| --- | --- | --- |
| Extension definition | 与宿主无关的纯声明：扩展身份、控制方式、状态、贡献内容与配置要求 | 这是“声明需要什么”，还是“执行时如何实现”？ |
| Extension `shared-logic` | 扩展业务及其组合：业务规则、外部业务协议、业务数据模型、缓存与刷新策略、业务持久化、展示计算 | 换一个宿主，这条业务规则是否仍然成立？ |
| Framework `interface` | 已封装 capability 的 canonical 消费契约及使用约定；State、Session、Prompt、Marker、Feedback、Provider、Subagent、Command 及三个 General 模块均已迁移，Session 是最深的示例 | extension 能否只读这里就正确使用该 capability？ |
| Framework `runtime` | 单一 framework / adapter 内部 port 与交付契约 | 这是 adapter 必须实现/提供的框架事实，还是扩展可见的能力？ |
| Framework `core` | 尚属内部的契约与宿主无关的语义 implementation | 这是应藏在 capability seam 后面的规则，还是内部 helper？ |
| Framework `behaviors` | 基于公共契约实现的可复用行为：绑定、状态控制、贡献、生命周期与派发 | 这是框架应该统一兑现的行为，还是扩展自己的处理逻辑？ |
| Framework `modules` | 不依赖宿主与具体扩展的通用基础能力 | 去掉 Session、Owner 和业务概念，这项能力是否仍独立成立？ |
| 顶层 `adapters/<harness>` | 宿主原生事实、触发位置与能力到框架契约的映射 | 这是公共语义在此宿主上的实现机制吗？ |
| Extension `harnesses` | 本扩展的宿主专属实现及薄装配：原生绘制、专属能力接线、选择实现并连接业务 | 这是此扩展的宿主接入，而非框架通用映射吗？ |
| Discovery entrypoint | 供宿主发现并导出对应扩展装配 | 是否只承担发现入口，而没有业务或装配过程？ |

`shared-logic` 中的“shared”指**同一扩展跨宿主共享**，不意味着所有扩展共用一个业务层。独立扩展拥有自己的业务；framework 不依赖具体扩展。

### 公共 adapter 的实现导航

Extension 只消费 `adapters/<harness>` 的公共装配入口，不导入其私有 port 或 domain implementation。公共 adapter 的目录组织、领域归属和原生映射步骤集中在 [harness 接入指南](harness-integration.md)；各能力的具体源码位置只维护在[能力到实现的导航](framework-capabilities.md#adapter-implementation-navigation)。不要把公共 adapter 的领域布局照搬为扩展的业务布局。

### Framework adapter 与 extension 宿主实现不是同一层

Framework adapter 服务于公共契约，extension 的宿主实现服务于这个扩展。不能因为两者都接触原生能力，就把它们合并。

例如，公共事件的原生映射属于 framework adapter；某个扩展如何使用宿主 widget 绘制自己的界面，属于该扩展的宿主实现。业务计算不属于这两者。extension 的 presentation 不在公共 adapter 分类下；framework 的 Marker area、Extension feedback 仍由公共 adapter 映射到原生输出。

### 用 model-cost 判断扩展内部落点

[model-cost README](../../extensions/model-cost/README.md#shared-logic-architecture)是实例入口；[分层实例](capability-layering.md)集中解释其职责、保存协作与测试组织。可以按下面的问题判断新逻辑的归属，而不是按文件大小拆分：

| 新逻辑 | model-cost 的落点 | 为什么 |
| --- | --- | --- |
| 声明激活状态、命令和贡献 | [`definition.ts`](../../extensions/model-cost/definition.ts) | 描述扩展，不启动业务或原生资源 |
| 计价、余额、额度、显示预算、后代数据组合 | [`shared-logic/business/`](../../extensions/model-cost/shared-logic/business/) | 独立业务功能拥有自己的规则；后代组合不创建第二份消费账本 |
| 会话消费权威、关系、协调存储、共享刷新策略 | [`shared-logic/foundation/`](../../extensions/model-cost/shared-logic/foundation/) | 同一扩展内部稳定的内向支撑；不 import business，不把计价政策下沉 |
| 字段选择、格式化、只读视图与重绘通知 | [`shared-logic/presentation/`](../../extensions/model-cost/shared-logic/presentation/) | 展示消费业务结果，不在绘制时查询 provider、写文件或累计消费 |
| 创建 module、订阅和生命周期接线 | [`shared-logic/runtime.ts`](../../extensions/model-cost/shared-logic/runtime.ts) | 连接既有职责，不成为新的业务收容层 |
| 原生布局、绘制和公共 adapter 装配 | [`harnesses/`](../../extensions/model-cost/harnesses/) | 原生依赖留在扩展的宿主层，不泄漏到 shared logic |

依赖方向是 `presentation → business → foundation → framework/interface`；business 可以单向组合其他 business，禁止循环依赖和重复权威。`runtime.ts` 负责组合这些 module，宿主装配负责注入原生实现。不是每个扩展都需要 foundation；出现真实共享协作再提取，简单扩展保持简单。

## 三、需要功能时，先沿公共能力查找

1. **先明确业务含义。** 阅读目标扩展的领域文档与术语，区分业务需求和宿主实现方式，不从熟悉的原生 API 反推设计。
2. **先查框架能力索引。** 判断需求是否已有声明、公共事实、生命周期、效果能力或通用基础能力可以承接。能用声明解决的，不另写一套运行逻辑。
3. **读取 capability interface，而不是追读 implementation。** 从 [`framework/interface`](../interface/index.ts) 及其各 capability 入口阅读声明与交付约定；不导入 `framework/runtime/port`、具体观察来源或内部派发。Session 工厂使用 `context.session`。不要因为框架内部某个对象“能做到”，就让 extension 依赖它。
4. **只有涉及宿主机制时，才进入 adapter 或 extension 的宿主实现。** 先判断它是公共映射还是扩展专属接入。缺少宿主事实，不应让 shared logic 猜测或读取私有字段。
5. **最后决定新增代码的归属。** 已有能力就组合使用；业务缺口补在 extension；通用契约或基础能力缺口才考虑补在 framework。

| 需求类别 | 首先寻找什么 | Extension 保留什么 |
| --- | --- | --- |
| 命令、激活状态、prompt、marker | 框架声明与对应公共行为 | 业务动作与贡献内容 |
| 会话、请求、轮次、身份与生命周期 | 框架的公共事实、语义事件与观察范围 | 消费这些事实的业务规则 |
| 外部请求、文件更新、配置读取 | 框架已有的通用基础能力 | 业务协议、数据 schema、提交时机与失败后的业务处理 |
| 展示与交互 | 公共事实和已有贡献能力；确有专属界面时再查宿主机制 | 展示含义与数据计算；宿主层只做绘制和接线 |

这里的顺序是**先公共契约，后具体机制**，不是要求每次从头阅读整个 framework。

## 四、跨层协作的边界

### 业务读取事实，不接管事实的定义

Framework 统一拥有公共身份、事件含义、顺序与作用范围；adapter 提供原生事实；extension 据此实施自己的业务。扩展不应自行重建一套公共生命周期，也不应把原生事件名称当作业务契约。

观察范围与效果权限分开：能观察子会话，不代表能替它修改 State 或驱动主会话效果。查看目标也不等于业务数据归属或 State Owner。

### 公共生命周期管寿命，业务生命周期管内容

Framework 负责绑定、初始化和清理的调用约束；extension 负责这些阶段执行的业务，以及自己资源的释放。宿主装配连接两者，不另建业务调度系统。

### 通用操作与业务策略分开

传输、协调更新和配置解析属于基础能力；请求哪个业务 endpoint、怎样解释返回、保存什么 schema、何时归档属于 extension。基础能力不能固化某个扩展的路径、协议或规则。

### 展示计算与原生绘制分开

展示含义、字段选择和业务格式化来自 shared logic 的只读视图；宿主专属层处理主题、布局、宽度和原生绘制。绘制不修改权威业务数据，不顺带触发网络或存储。

### 装配连接实现，不承载业务

宿主装配选择 adapter 与专属实现，把必要的事实或小型能力接口交给 shared logic；不将完整原生 context、registry 或其他宿主对象泄漏出去。业务模块之间的组合仍由业务层负责。

## 五、什么时候补 framework

考虑上移之前，先回答：

- 它能否用不含具体扩展业务的语言描述？
- 它解决的是公共语义或独立基础能力，而不是两个业务实现表面相似的代码？
- 它是否有明确、稳定的契约，能让消费者不必了解内部机制？
- 它是否保持 framework 不依赖 extension、shared logic 不依赖具体 adapter 的方向？

满足这些条件，才考虑公共能力。**多个调用者不是充分理由，代码变长也不是上移理由。** 某个扩展的协议、计价、缓存与数据模型仍由它自己拥有。

新增宿主时，应复用同一份扩展声明与 shared logic，补齐公共 adapter、必要的扩展专属实现及薄装配，而不是复制整份业务。

## 六、保持地图简洁，保持模块有深度

- 按概念拆分，只有真实职责需要时才创建模块；简单扩展无需套用复杂扩展的目录。
- 小接口应隐藏完整职责，不用多层浅转发制造“分层”。
- 地图维护职责与判断方式；能力索引维护入口；源码维护接口细节；术语与 ADR 各自保留唯一权威。不在这里复制它们的内容。

**一句话：先查公共能力，再按职责组合；业务留在扩展，公共语义留在框架，原生机制留在宿主边界，装配和发现入口保持薄。**
