# 确定的新能力与 model-cost 如何组织、声明和装配？：Lighthouse

> Question and discussion: [确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)
>
> 用户在 Q19「确认」授权整票发布；[本轮确认链与证据限度](../assets/assembly-confirmation-2026-10-13.md)、[发布前完整历史](../assets/assembly-before-publication-2026-10-13.md)可恢复。本文件取代原局部稿，原已批准宿主专属实现／Viewed session／marker 职责保留。以下为组织与装配规划，不是生产实现、宿主补丁或新支持基线认证。

> 本次 Traverse 接线补充只消费名称、文件安全／后续可写、边界余额查询的原权威；[Traverse 确认来源](../assets/traverse-confirmation-2026-10-13.md)。不新增配置、State、保存触发或生产实现。

## Question

将已定业务与公共能力契约落实到源码职责、authoring Interface、依赖注入、生命周期、公共观察、原生接入与消费者切换；让新增 harness 的维护者知道代码落点，而不复制业务或另建 framework。完整探索见源票。

## Discussion

### Source layout and dependency direction

Q1／Q2 确认下面职责落点。只创建实际需要的 Module，不按图创建空目录；内部复杂时按概念拆分，不能以浅转发链冒充 Depth。

```text
framework/
  core/                       # 公共定义／协议／配置／State 等
  behaviors/                  # 公共语义、绑定与派发
  modules/
    http.ts                   # 通用传输／代理／超时
    files.ts                  # 通用文件协调读改发布
  adapters/
    omp.ts                    # OMP 公共原生映射
  public.ts                   # 小型 authoring 与基础能力公共入口
extensions/model-cost/
  definition.ts               # 纯声明
  config.yaml
  shared-logic/
    runtime.ts                # 业务实例、公共 handler／命令接线
    accounting/               # 锚价／去重／自身累计／关系／轻量 Round
    consumption-store.ts      # schema／加载／提交／归档切周期
    providers/                # 业务协议／parser／缓存／刷新
    quota-estimate/           # Codex 估计与独立持久化
    presentation/             # 只读查询／展示计算／更新订阅
    model-data.ts             # 集中模型映射／谷价／峰价系数
  harnesses/
    omp.ts                    # 薄宿主装配入口
    omp/
      widget.ts               # OMP 专属绘制
entrypoints/omp/model-cost.ts  # 只导出宿主装配入口
```

新增 pi 时对应 framework adapter、extensions/<id>/harnesses/pi/ 专属实现、harnesses/pi.ts 装配与 entrypoints/pi/<id>.ts；这说明将来接入位置，不批准本次实现／认证 pi。公共语义不在每个 adapter 重写；原生 import 只在既有 framework/adapters/** 与 extension harnesses/** seam，不扩大 allow-list，不透传原生 ctx／modelRegistry。

framework/modules/ 与 harness adapter 无依赖，其他扩展可直接使用，不经 Session／Owner delivery 转发；HTTP／文件详细契约分别消费 [HTTP](05-http-capability.md)／[存储](06-local-storage.md)原权威，不在这里复制。framework 不依赖具体 extension，shared logic 不依赖某个 adapter；根 package.json／bun.lock 统一依赖，YAML 复用已有配置 Module，HTTP／文件优先目标 Bun／Node 内建能力。若真实协议／平台验证证明必须加第三方依赖，再记录来源／用途，不预建 native helper 或第二套配置。

### Authoring Interface and implementation factory

Q3／Q5 确认把 actions、公共事件订阅、开发／验证契约描述、configBaseDir 等通用装配信息从 OMP 专属类型中独立，公共类型沿 framework/public.ts 导出；只把真正宿主专属接入留在 adapter。沿 defineExtension 的纯声明＋注入实现模式，不增注册器、扫描、autodetect 或 DI 容器，也不把 HarnessPort、StateStore、内部派发器公开给 extension。

公共绑定提供实现工厂：必要配置读取／值检查通过后调用，提供已校验配置与所需公共事实 Interface；extension 工厂创建 shared logic 业务实例并连接所选宿主专属实现，交付命令实现、事件订阅、初始化／清理入口。创建阶段不发远端、不启动 timer。绑定失败收口已创建资源并报告；业务错误与配置错误的运行承接保留。

旧 Q5 提案里的运行时能力准入被 Q10a 显式替换。独立兼容性验证规则的唯一原权威是 [harness support](../../../framework/docs/harness-support.md#independent-compatibility-verification)；requiredSemantics 若保留仅作开发／验证描述，不作运行时开关。公共装配没有新 capability 协商、版本门禁、报告门禁或完整性探测。

### Public facts and observation scopes

Q4／Q6／Q15 确认按订阅组一次声明 Owner 或逐实际 Session 范围，两种范围使用同一公共派发 Module。Owner 订阅只接主会话效果；逐实际 Session 订阅按真实主／子／孙身份观察，不用 Owner key、名字或 agent 层级代替 sessionId／直接父关系。观察扩大不授予 Owner 写入／外部效果权限；State follow／none 不变。

| 能力 | Interface 形态 | 约束 |
| --- | --- | --- |
| 当前查看 Session／模型／Effort／上下文 | 只读快照＋变化订阅 | 当前状态，通知后重读；不保留旧 ctx |
| Viewed session 的有效 State／marker | framework 只读投影＋变化通知 | 非新 State Owner；不能靠查看取得写权限 |
| 对应 provider／model catalog | 按需公共查询 | 无运行期 catalog 热更新需求，不预建订阅 |
| 对应实际 Session 身份／直接父关系／最新展示名称 | 公共事实交付及更新 | 名称源事实消费[观察原主题](03-observation-contract.md#正常数据流与最小事实契约)，覆盖主／子／孙而非仅当前查看；不扩大 Owner 权限 |
| 当前认证访问资料 | 每次操作读取 | OAuth／native 访问隐藏在 adapter，秘密不广播／持久化 |
| Request／Turn／Round | 事件当时 delivery | 身份／顺序／请求锚点不被最新快照替代 |
| 一次性初始化／销毁 | 公共生命周期入口 | 有调用、等待／清理约束 |
| HTTP／安全文件更新 | 公共操作及结果 | 不包装为事实订阅，业务 schema 不进 framework |
| 命令 | 动作与完成结果 | 复用 [命令权威](07-command-state.md)，不冒用激活 State |

请求开始固定对应 Session／Round／provider／model／时间／可用 catalog 价格快照；结束交付同一身份、可靠 usage 与 HTTP metadata，详细字段与缺失规则消费 [观察权威](03-observation-contract.md)。实时认证／catalog／查看读取通过小公共事实 Interface，不注入任意 native 属性读取函数，不镜像完整宿主对象。名称变化按实际 Session 身份更新内存／展示并随下次正常消费保存写入，消费[观察](03-observation-contract.md#正常数据流与最小事实契约)及[存储 Q25](06-local-storage.md#q25consumptionjson-的物理-schema归档与版本)原权威，不另设改名保存触发。读取与修改分开；不自动配 setter，model-cost 无修改模型／Effort 需求，不因 native setModel／setThinkingLevel 存在升级公共控制能力。

### Initialization, binding lifetime and asynchronous dispatch

Q8／Q9／Q16 确认 framework 管完整绑定生命周期。认证已可读的初始节点调用一次初始化入口；优先复用 initial session_start 原生位置，由 adapter 兑现真正请求前的可等待位置，framework 管初始化完成。业务内容／预算／局部失败由 extension 管，CLI 两源预取及成功／失败／超时收口消费 [刷新权威](09-refresh-lifecycle.md)。同 CLI 子代理共用初始化，不每个 Round、Session 切换或首消息重建；工厂创建不提前请求。

正常切模型／Session／tree／查看只改变所需业务视图／恢复目标，不销毁 CLI 业务实例、provider 缓存、detail 或单一 UI timer。统计恢复只加载现行 [数据](12-state-data-contract.md)／[存储](06-local-storage.md)当前周期有效 Session 聚合与关系，不扫描宿主历史、不恢复放弃的 Round 账本。运行期请求关联／已处理标记绑定观察实例，不在 round_end 清空；旧实例回调不得进入新实例。

framework 先处理公共身份／生命周期，再有序调用 handler；同步异常／Promise rejection 都有承接。未完成 round_end 保存不阻塞整 Session 后续事件或宿主下一输入。extension handler 开始捕获稳定快照、提交安全更新、处理独立逻辑，并在本 handler 返回前等结果；业务 runtime 记录未收口保存用于命令门控，不把宿主 idle 当保存完成。文件提交顺序与跨进程协调消费原存储 Module，不增派发层存储队列。首次初始化与命令是明确等待位置，不把一般异步事件改成裸 fire-and-forget。

绑定结束／失败／卸载或重载／CLI 结束由 framework 停交付、解除公共订阅、使旧公共访问失效并调用单一 extension 清理入口，避免重复清理。extension 使业务实例失效、停止接纳迟到网络结果，前端解除展示订阅／释放 widget 并清 timer。生命周期职责覆盖销毁，不代表本轮认证热 reload；现有正式 reload 支持条件仍未升级。结束不等余额／额度网络，不增加 HTTP 主动取消；不自动保存、补账或退出排空，已开始的保存不能假报取消成功，仍遵守实际结果契约。

### Business Modules and presentation Seam

Q7／Q11 确认 runtime 隐藏 handler／命令／业务 Module 组合，宿主装配不组织计价、缓存与归档步骤。accounting 拥有自身累计与轻量 Round；消费存储 Module 暴露业务加载、稳定 Session 快照提交、归档切周期，隐藏 schema／记录合并／周期版本校验／阶段结果。普通保存失败后的丢弃、有效磁盘初始化或暂停仍由 runtime 按原权威处理，不自行重试／补账；同 Session 双执行者按存储 Q26 的版本冲突取舍，不新建检测／租约系统。

providers 不知道 widget、不改消费累计；命令的边界余额获取消费[刷新原主题](09-refresh-lifecycle.md#clear首次-holiday-的边界余额查询)，consumption-store 只接收该次结果并执行既定归档／切周期；文件锁安全与失败后后续可写只消费[存储 Q24](06-local-storage.md#q24framework-通用文件能力的接口锁与发布契约)，不恢复年龄抢占方案或另建恢复系统。quota-estimate 独立沿已定采样与文件组织；presentation 只读同一源，承担字段选择、金额／token／比例格式与树数据，不持有第二套累计。model-data.ts 按 [模型权威](13-model-catalog-policy.md)持有精确映射、谷价与共用系数，不是用户 YAML，算法测试注入自造数据，不固定真实名单／价格快照。

前端 Seam 为只读展示结果＋更新订阅：累计、有效余额／额度、detail、峰谷边界等通知后重读当前目标与展示结果。public 查看变化也触发重读；render 无网络／timer／文件或权威数据修改。扩展宿主前端只处理原生 widget／主题／颜色／布局／树缩进／宽度；不接管 TTL、计价或保存。无 UI 不建前端／绘制订阅、不执行仅为绘制的格式化，同业务后端／错误承载沿刷新与展示原权威。后端 seam 集中测试业务，前端仍要绘制／接线验证，不以单元测试替代真实 UI。

storageDir 使用 [存储路径原权威](06-local-storage.md)：字段局部 ~/ 语义与普通相对路径解析在 model-cost 配置／装配入口，再传绝对路径给文件 Module，不把 .omp 目录策略固化成通用能力；固定根内文件／schema／版本／归档沿存储原文。

### Codex integration, network selection and oracle

Q12／Q13／Q17 确认旧 my-omp-toolkit oracle 固定 fd3b507f99d11f8a68b63446c45aa911f0ee5c84，检查时工作区干净。原源代码、视觉和业务算法是对照，不胜过新契约，不实时跨仓库 import，不自动随 HEAD 移动；更新基线须记录差异。

Codex endpoint、认证 headers 组织、业务预算、额度 API parser、窗口识别、测量与估计归 shared logic；adapter 只提供当次认证和响应事实，framework HTTP 执行。适用纯逻辑复用前核对来源／许可证，不保留 OMP usage helper、proxy wrapper、惰性 native import 或专属查询桥接，也不整包搬迁宿主实现。

业务固定逐请求选择：DeepSeek 余额 proxy:false、Codex 额度查询（启动与运行期共用同一入口）proxy:"codex"、connect-bot proxy:false。共享配置可改 codex URL，但删配置不是直连指令；改为直连需改集中业务选择。显式缺配置按 HTTP 原权威失败，不自动重发／直连，不加 balanceProxy／usageProxy，不接管宿主推理或 OAuth 网络。

### Public Viewed session prerequisite

Q14／Q15 允许 OMP 补齐最小公开只读查看出口与变化订阅，先宿主、再 adapter、再公共 Interface／marker 与 extension 接线。概念 Interface 是 readViewedSession 与 subscribeViewedSessionChanged（返回解除订阅），字段名按公共协议落实，不冻结成第二套 native 镜像。

快照提供对应实际 Session 身份／名称／必要关系、provider／model、实际生效 Effort、上下文占用／窗口；不可取得明确表达，不猜主会话。通知覆盖目标切换、同目标模型／Effort／上下文变化、目标失效；不是只有焦点切换才更新。framework 按该身份的有效 State 投影唯一 Marker area，消费 [展示权威](08-presentation.md)的主／子内容范围；查看不改变记账、Owner、继承或外部效果。

现有公开 ExtensionContext／ExtensionUIContext 未提供完整出口，内部 controller 探针不等于公共能力。不上私有字段／UI 文本，不默认最新版本可用，也不把 18.5.0 当已满足；允许宿主公开出口补丁是已定实施前置，最终 patched revision／支持版本／独立验证与切换由 [验收票](../decision/11-acceptance-cutover.md)决定。规划题已决不等于原生工作已完成。

### Consumer migration and behavior tests

Q18 确认完整迁移公共接入，不留旧装配类型、owner-only 通用派发、原始 fetch／无独立职责 PushTransport 或兼容副本。

- connect-bot 切公共工厂／生命周期、Owner 订阅、清理、HTTP；注册协议、心跳、失败预算、working／idle／awaiting-input、Owner 效果权限不改。
- codebase-tools 切受影响公共接线；prompt、历史保护、激活 State、follow／none 不改。不强迫简单 extension 模拟 model-cost 内部结构。
- Marker area 接当前查看有效 State，仍唯一，不按扩展另造 marker。
- 独立验证入口／测试使用新公共 Interface；有效命令／协议／转换／效果场景保留，旧 transport／double 等必要接线迁移，内部转发、旧形状、已被替代政策断言删除，不重钉旧预期，不保留旧生产路径迁就测试。

明确对称约束：connect-bot「子代理结束不能驱动主会话效果」继续成立；「所有扩展都收不到子代理事件」不得作通用断言。Owner 与逐 Session 两组分别验证。现有真实 loader／请求捕获／JSONL 和 wire 行为测试可作回归依据，绿色 framework 局部套件不能单独认证 extension 或真实远端／视觉／存储链路。

### Publication and implementation limits

Q19 完整确认覆盖本票全部规划范围。部署源码组织／生命周期的架构修订见 [ADR-0002](../../../docs/adr/0002-semantic-extension-framework.md#model-cost-assembly-revision)；能力／版本验证原规则已在其 [support 原主题](../../../framework/docs/harness-support.md#independent-compatibility-verification)显式修订。工厂、scope、异步派发、public 查看、HTTP／文件／配置与消费者迁移均待生产实施。固定支持基线记录未修改，不宣称 pi、多窗口修复、真实余额／额度或新安全文件能力已认证。

本轮证据、原话与被拒分支仅见确认资产，之前局部结果与恢复全文只作链接历史。验收／切换的未答问题留原票，不在此替它选择最终版本、执行脚本或正式切换。

## Decision

采用公共语义／adapter／独立基础 Module、共享业务／宿主专属实现／薄装配的源码组织，framework 统一实现工厂与完整生命周期、按范围派发及小型事实 Interface；业务、展示与测试跨 harness 复用。消费者完整迁移，兼容性验证独立执行，可靠宿主公开查看出口先行；本票规划收口，生产与最终验收仍未执行。

## User stories

1. As a 新 harness 接入者, I want 明确 adapter、专属实现与薄装配落点, so that 新代码位置清楚且不重复公共语义或业务。
2. As a 扩展作者, I want 小公共装配 Interface 与工厂, so that 不学习内部校验／注册／失败清理顺序。
3. As a 扩展作者, I want framework 统一初始化与清理, so that 首请求顺序、旧实例失效与资源寿命不散落在装配入口。
4. As a 用户, I want Owner 效果隔离与逐实际 Session 观察同时成立, so that 子代理正常记账而不驱动主会话面板效果。
5. As a 用户, I want 当前查看的可靠公共快照与通知, so that Hub 子代理的 Effort／上下文／有效 marker 不沿用主会话。
6. As a 开发者, I want shared logic 的只读展示 Seam, so that 业务测试集中在后端且宿主前端只负责绘制与接线。
7. As a 用户, I want 异步保存有承接而不阻塞后续事实, so that 下一轮继续执行且命令不把 idle 当已保存。
8. As a 维护者, I want 独立验证报告与稳定源码 oracle, so that 支持声明有可恢复的版本／环境／覆盖证据而不污染启动流程。
9. As a 维护者, I want 现有消费者完整迁移并复用行为测试, so that 不维护双轨架构且重构不悄改既有业务。
10. As a 用户, I want 逐实际 Session 名称源事实接入既有 runtime 与展示 Seam, so that 未查看的子／孙会话也能持续更新名称且不增加消费文件保存频率。

## Preconditions

- [行为](01-behavior-contract.md)、[归属](02-accounting-ownership.md)、[数据](12-state-data-contract.md)、[存储](06-local-storage.md)提供保留需求、自身聚合／寿命／关系／物理与失败政策；装配不重开账本、多账号或单执行者检测。
- [观察](03-observation-contract.md)、[认证](04-provider-access.md)、[HTTP](05-http-capability.md)、[命令](07-command-state.md)、[展示](08-presentation.md)、[刷新](09-refresh-lifecycle.md)、[模型](13-model-catalog-policy.md)提供本票消费契约；设计输入不要求先已生产实现。
- 已确认宿主补齐公开 Viewed session 出口是实施前置，最终实际 patched revision／版本须在验收决定并执行独立验证，当前支持记录不因本票升级。
- 配置机制、公共入口、既有 native import seam 与可复用消费者行为场景继续有效；所选 oracle 与许可证／来源是复用依据，不是 production import。

## Postconditions

- 后续规格／实施按本职责与 seam 接线，不增第二套配置、通用 State、注册、焦点或业务传输机制，不保留旧生产兼容路径。
- [验收与切换](../decision/11-acceptance-cutover.md)是下一决策提供票；需消费宿主公开出口、独立验证、消费者行为回归等已定输入，并决定最终支持／证据／用户切换步骤，不重复本票架构访谈。
- Q19 授权规划出版，不授权生产迁移、正式配置／凭据／旧数据改动或宿主补丁。实际实现完成不能由本票 resolved 推导。

## Invariants

- 延续 defineExtension＋公共绑定与 framework/public.ts seam；只发布实际需要的 authoring Interface，不暴露 HarnessPort／StateStore／派发器作为 extension 组装任务。
- ADR-0002 原生 import 责任测试保持；基础 Module 无 adapter 依赖，shared logic 无 harness 原生依赖，framework 无 extension 业务依赖。
- State／Owner／follow／none、唯一 Marker area、Extension feedback 继续复用；查看与观察不扩大 Owner 权限。
- HTTP／文件详细规则、消费 schema／失败取舍、刷新与视觉口径仅消费原权威；不借组织规格扩张保存、重试、取消、轮询、账号管理或账本。
- Owner handler 不被子事件驱动；逐 Session handler 不被 blanket gate 漏掉；同步／异步结果有承接，不新增全局保存屏障。
- 测试跨调用方同一 seam 验证可见行为，保留有效场景，迁移必要接线，删除实现细节／已失效政策断言，不用测试通过自动声明支持。
- 规划／源码检查／文档 smoke／隔离 native 探针与新生产链路认证严格区分，旧 supports record 不自动延伸。
