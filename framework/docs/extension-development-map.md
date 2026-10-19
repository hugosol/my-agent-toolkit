# Extension 开发地图

这份地图面向新增或修改 extension 的开发者与 agent，回答两个问题：**需要一个功能时先去哪里找；新增代码应由哪一层负责。**

地图只保留长期稳定的职责与判断原则，不维护具体接口、源码清单或实施进度。能力入口查[框架能力索引](framework-capabilities.md)，接口细节读源码；架构理由见 [ADR 0002](../../docs/adr/0002-semantic-extension-framework.md)，术语见 [Glossary Map](../../GLOSSARY-MAP.md)。

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
| Framework `interface` | 已封装 capability 的 canonical 消费契约及使用约定；Session 是第一个完整示例 | extension 能否只读这里就正确使用该 capability？ |
| Framework `core` | 尚未迁移的契约、内部 adapter protocol 与宿主无关的语义 implementation | 这是应藏在 capability seam 后面的规则，还是尚未迁移的声明？ |
| Framework `behaviors` | 基于公共契约实现的可复用行为：绑定、状态控制、贡献、生命周期与派发 | 这是框架应该统一兑现的行为，还是扩展自己的处理逻辑？ |
| Framework `modules` | 不依赖宿主与具体扩展的通用基础能力 | 去掉 Session、Owner 和业务概念，这项能力是否仍独立成立？ |
| 顶层 `adapters/<harness>` | 宿主原生事实、触发位置与能力到框架契约的映射 | 这是公共语义在此宿主上的实现机制吗？ |
| Extension `harnesses` | 本扩展的宿主专属实现及薄装配：原生绘制、专属能力接线、选择实现并连接业务 | 这是此扩展的宿主接入，而非框架通用映射吗？ |
| Discovery entrypoint | 供宿主发现并导出对应扩展装配 | 是否只承担发现入口，而没有业务或装配过程？ |

`shared-logic` 中的“shared”指**同一扩展跨宿主共享**，不意味着所有扩展共用一个业务层。独立扩展拥有自己的业务；framework 不依赖具体扩展。

### Adapter 按共享能力领域导航

公共接入位于仓库顶层 `adapters/<harness>/`。每个 adapter 根目录只有 `index.ts`、`internal/`、`domain/`：`index.ts` 是公共装配入口，`internal/` 是私有原生支撑与 binding port，`domain/` 集中放置能力领域。`domain/` 内直接按能力领域组织，不按消费它的 extension 分组，也不增加 business/foundation 中间目录。领域归属有歧义时，业务领域优先；只有真正公共的支撑能力才独立共享。按能力含义归类，不按原生对象的数据来源归类。framework 公共领域补充业务词汇：Turn、Round 收入 Session；context、pricing 保持自己的职责。

领域内部默认按映射方式组织：`events.ts` 把原生观察转成 framework 事件，`queries.ts` 把原生读取转成 framework 数据，`effects.ts` 执行 framework 请求的原生效果。先找领域，再找映射方式；只创建实际需要的文件，简单领域仍用单文件。复杂 Turn、Round 原生协议可留作 Session 内部 implementation，不增加纯转发入口。事件 delivery 的领域构造靠近事件映射，不留给 port 逐项拼装；共享类型、诊断和状态靠近其寿命拥有者，不另建一套支撑能力分类。

这是帮助从 requirement 定位到相关 module 附近的导航约定，不要求一项声明一份文件，也不扩展当前 `subagentRequirements` 范围。具体落点见[能力到实现的导航](framework-capabilities.md#adapter-implementation-navigation)。简单能力优先一个文件，确有协作才增加目录；不要求不同 Harness 文件对称。

完整领域包括 Session、Context、Subagent、Pricing、Provider、Control、Prompt、Feedback、Marker；每个领域先明确归属，再决定单文件或目录，不能把原生数据来源或第三方接入名称当作主要领域。Subagent 拥有原生父子/祖先关系、接入状态与必要的接入协议；子会话通用的 Session、Turn、Round 事件仍归 Session，不复制第二条事件路径。Feedback 与 Marker 各自拥有原生效果。能力领域全部放在 `domain/` 下；原生类型、文本加载和 binding 端口放在 `internal/`，`index.ts` 负责公共装配入口，均不当作领域；完整路径对照只维护在[能力导航](framework-capabilities.md#adapter-implementation-navigation)。

装配连接各领域 module，公共事实保留单一来源；跨领域通过明确 interface 协作，不重复维护身份、当前读数或寿命规则。已有 seam 上的 adapter 兑现统一契约，公共 implementation 留在 framework；用 deletion test 衡量 depth，追求 locality 与 leverage，不增加 shallow 转发。interface 是 test surface，验证不按新文件逐一镜像。

### Framework adapter 与 extension 宿主实现不是同一层

Framework adapter 服务于公共契约，extension 的宿主实现服务于这个扩展。不能因为两者都接触原生能力，就把它们合并。

例如，公共事件的原生映射属于 framework adapter；某个扩展如何使用宿主 widget 绘制自己的界面，属于该扩展的宿主实现。业务计算不属于这两者。extension 的 presentation 不在公共 adapter 分类下；framework 的 Marker area、Extension feedback 仍由公共 adapter 映射到原生输出。

## 三、需要功能时，先沿公共能力查找

1. **先明确业务含义。** 阅读目标扩展的领域文档与术语，区分业务需求和宿主实现方式，不从熟悉的原生 API 反推设计。
2. **先查框架能力索引。** 判断需求是否已有声明、公共事实、生命周期、效果能力或通用基础能力可以承接。能用声明解决的，不另写一套运行逻辑。
3. **读取 capability interface，而不是追读 implementation。** Session 已完成首个封装：从 [`framework/interface/session`](../interface/session/index.ts) 阅读事实、观察、订阅、提交提示与 close-out 约定，工厂使用 `context.session`；不导入 `core/protocol`、具体观察来源或内部派发。其他 capability 尚未全部迁移，沿能力索引查其现有入口。不要因为框架内部某个对象“能做到”，就让 extension 依赖它。
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
