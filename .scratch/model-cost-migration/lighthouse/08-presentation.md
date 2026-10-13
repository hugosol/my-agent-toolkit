# 动态 widget 如何分层，无 UI 时哪些业务仍需更新？：Lighthouse

> Question and discussion: [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)
>
> 用户在 Q33 确认完整收口并授权发布；确认、修订链与本轮探针见[展示确认来源](../assets/presentation-confirmation-2026-10-12.md)，发布前 legacy 恢复上下文见[历史](../assets/presentation-before-publication-2026-10-12.md)。这是迁移展示规划，不是生产实现或运行验收。

## Question

确定 model-cost widget 的共享后端／宿主前端职责、旧视觉保留与 detail 重设计、费用与参考费用字段口径、Hub 子会话展示、轻量 Round、错误承载和无 UI 记账。完整远端刷新调度由刷新票持有，不在本票推定。

## Discussion

### widget 前端／后端与通用能力

widget 后端位于 model-cost shared logic，通过 framework 公共接口消费 adapter 映射的事实，管理业务统计、字段选择、比例／金额／token 格式化、brief／detail 内容。后端不直接读取 OMP ctx、原生 model.cost 或 SessionManager，不重复框架已有接口。

widget 前端属于扩展的宿主专属实现，只负责原生 UI 组件、布局、树形缩进、主题／字体／颜色和宽度适配。shared logic 不包含 OMP 颜色控制码／原生组件；render 不请求远端、不创建 timer、不落盘、不修改 lastContextTokens 或权威业务值。前端／后端是职责层，不新增网络服务或独立进程。

通用宿主分支选择、当前查看 Session 与有效 State／Marker area 的唯一分层 authority 为[装配局部决议](10-assembly-layout.md)；模型计价比例表来源 authority 为[模型计价局部决议](13-model-catalog-policy.md)。widget 不实现第二套焦点、激活 State、公共通知或通用框架，也不把复杂 widget 塞入单行 Marker area。

### 视觉保留与统一字段

现有布局、字体、颜色、上下文条、实际 Effort 着色、DeepSeek 峰谷／holiday、余额告警、Accrued／Session 分段条、Codex 5h／7d 节奏／reset／ratio／left 及既有宽度降级保持；以下明确修订统计字段和 detail 是视觉保留的例外，不恢复旧 detail 展开设计。

- 保留 Total 标签；原旧 UI Turn 行改名 Round，公共 Turn 仍指一次模型请求／响应。
- CacheRead 简写为 CacheR，CacheWrite 简写为 CacheW，不额外增加当前模型标识，界面已有模型信息。
- DeepSeek／Codex 各自适用的 Cache／Input／Output／Read／Write、比例、Sum／Cost／Ref 风格和数值格式放 shared logic；Total、Round 与代理树复用同一字段规则，替换数据范围而非复制 renderer 业务。
- 沿用现有 provider 模式覆盖，不默认给 hidden 创建 widget；不因当前展示模式过滤已获得且应计入的其他模型消费。长名称／树缩进的具体前端排布沿本视觉原则实现，不新增交互、逐代理查询命令或隐藏节点数量政策。

### Total：当前会话模型字段与完整树累计分开

主会话 brief 与 detail 的 Total 都是一条记录，不变成多渠道汇总行。

| 字段 | 数据范围 |
| --- | --- |
| Cache 命中率、CacheR／CacheW／Input／Output 等适用字段、费用结构参考占比 | 当前查看 Session 自身、当前 provider／model 的本周期累计，不混入子代理 |
| Sum | 当前主会话＋全部后代 Session 的全部模型 token 累计 |
| Cost | 同一整棵主会话树的已算计费金额，当前 DeepSeek 人民币，Codex 贡献为 0 |
| Ref | 同一整棵主会话树的 Codex 已算美元参考费用独立累计，不进入 Cost |

每个实际 Session 自身桶只加一次，含后代视图不是另一笔消费。不混人民币与美元、不换算后相加，也不使用当前模型价格重算历史费用。JSON 没有独立 totalCost；这里的总值由已保存／运行期同口径自身桶派生，正常运行无需等读盘才能刷新。

纯 Codex 使用 Ref，不额外强加没有意义的 Cost: ¥0；有两种适用费用时一行分别显示 Cost 与 Ref。缺适用价格沿[数据权威](12-state-data-contract.md)保留 token、提示并跳过对应金额；token-only／hidden 无金额口径不是确认免费，不捏造 Cost: 0。不恢复“只有纯 Codex 才显示参考费用”的早期候选。

### detail：保留 Total，以静态代理树替换 Round

/budget detail 的动作与入口偏好寿命消费[命令权威](07-command-state.md)；本票改变其展示内容，而非新增命令语法或持久化偏好。

主会话 detail 保留顶部 Total，隐藏 Round 行，在同一 widget 展示以主会话为根的静态代理树。树包含主会话、子／孙代理，以 Session name 标识、直接父关系缩进；name 不充当身份。没有展开交互，也不另增“子代理合计”“含后代合计”节点／行。

根节点自身消费按 provider／model 分行；模型／渠道明细在视觉上区别于代理节点，不能冒充子代理。各 subagent 只显示一条自身累计，不按模型／渠道再展开。每行使用与 Total／Round 相同的适用字段格式，不缩成只剩 cost＋token，也不恢复旧 detail 的 Input／Output 扩展模式。单行 subagent 的金额仍分别保留计费与参考性质，不因常用路径单渠道就按当前模式丢弃真实累计。

结构示意（字段样式保持旧风格，不是新主题批准）：

    Total: [当前会话当前模型字段] [主会话树 Sum／Cost／Ref]
    主会话名称
    │  provider / model A  [该模型自身累计]
    │  provider / model B  [该模型自身累计]
    ├─ 子代理 A名称       [A 自身累计]
    │  └─ 孙代理名称      [孙自身累计]
    └─ 子代理 B名称       [B 自身累计]

子代理费用不归入父 Round；上方 Total 与树各节点自身数字可作对比，但树自身节点不再嵌套含后代合计造成双算。

### 费用结构参考占比，不是历史分项账单

保留费用／参考费用占比以评估各项等额消耗、调整 agent 行为，不改为纯 token 比例。shared logic 使用[计价比例表](13-model-catalog-policy.md)，按当前 Session／当前模型在相应范围的 token × 相对价格权重计算并归一化；不添加当前模型标识，不混合子代理或不同模型来算一个比例。

实际 Cost／Ref 总值仍按请求锚价累计；参考比例不承诺等于跨峰谷历史实际支出分项。数学证据：同一 usage 峰／谷参考均 25:75，跨峰 Input＋谷 Output 实付累计可为 40:60。本轮明确接受参考口径，不需要历史价格或持久化费用分项，撤回增 cost breakdown 的候选，[存储 schema](06-local-storage.md)不变。

比例表的模型覆盖、配置／数据格式、更新、结构变化与资料缺失由模型票收口；当前 approval 不等于完整可实施名单。Codex 价格事实经 framework／adapter，不由 widget 调 API。无法取得比例资料时不伪造零，具体模型缺失处理仍由该票决定。

### Hub 子代理视图：只切必要的 Session 信息

旧 Q26 候选“Total 合计转为子树、子代理提供 detail”被 Q28–Q31 明确收窄。子代理查看不复制主会话全功能：

| 区域 | 查看子代理时 |
| --- | --- |
| Effort | 当前子代理模型的实际生效值，未知沿既定 ?，不复制主会话或用配置冒充 |
| context bar | 当前子代理模型、上下文事实与既定预算规则 |
| extension 激活标记 | framework Marker area 显示当前子会话有效 State，沿声明的 follow／none，不复制主会话全部 markers |
| Total 的 Cache／Input／Output／比例 | 当前子会话自身、当前 provider／model 的本周期累计 |
| Total 的 Sum／Cost／Ref | 保持原主会话＋全部后代范围，不切到所查看子树、不丢父／兄弟消费 |
| Round | 当前子会话自身轮次；字段沿本轮模型口径，不显示主会话 Round 或混入后代 |
| 余额／双额度窗口／Accrued 与全局分段信息 | 保持既定 provider／全局范围，不伪造该子代理独享的额度或余额；消费累计与账户测量仍正交 |
| detail | 子代理固定 brief，不显示代理 detail 树、不增加 focused 下 /budget detail 路由；返回恢复主会话原偏好 |

查看切换不重置累计、不开新 Round、不重算历史，不改变实际记账归属或 State Owner。可靠原生查看出口、实时切换与 marker 重绑定接线消费装配 authority；检查到的 OMP focused 公共入口不足，不能用私有字段／UI 文字猜测，支持版本须核验。

### Round：轻量差分，可用才展示

Round 的数据寿命与公共含义仍由[数据原主题](12-state-data-contract.md#最近-roundtree-与恢复展示)和[观察契约](03-observation-contract.md)持有。本票确定可见性：不另外获取一份宿主轮次账单，使用已有实际会话自身累计、运行期边界与开始／结束快照。

最近一 Round：进行中＝当前自身累计 − 开始快照；已结束＝结束快照 − 开始快照。brief 只画这一行，不另列上一轮。差分含各模型 token 与已算 Cost／Ref，不拿当前价格重算；不混后代累计。公共逐 Session 观察本来就服务于子代理记账，不为 UI 另建 native Round 订阅。

JSON 恢复累计可以作为已取得快照的数据来源，但任意两次文件读写差值不保证是 Round。须是同实际会话、同有效周期且与可靠边界对应的快照；最新消费 JSON 不因此存两份历史版本。正常连续运行保留运行期快照以看最近一 Round；resume/tree／重载没有所需记录时隐藏 Round，不扫描历史、不补账、不猜零、不增加持久字段／专用恢复系统。不是取消正常 Round，而是对不可取得场景明确降级。

若具体装配证明正常子 Round 仍必须引入额外复杂机制，再交用户作局部取舍，不静默扩建或擅自取消。强杀／保存失败／clear 的既有损失和初始化规则由原权威持有，不借差分恢复已放弃消费。

### 无 UI 记账与公共错误反馈

无 UI／RPC 仍按既定语义观察、记账与保存，不创建 widget 前端，也不执行仅用于绘制的布局／颜色／文本格式化。用户只确认无 UI 记账，[无 UI 远端刷新完整调度](09-refresh-lifecycle.md)仍未决定，不批准全部网络效果与 UI 同策略；刷新票是该政策唯一 authority。

| 情况 | 有 UI | 无 UI |
| --- | --- | --- |
| 余额／额度请求失败 | widget 内显示，保留不弹通知的要求 | 经 framework Extension feedback 输出 stderr |
| 缺 usage／适用价格、普通消费保存失败或统计暂停 | 公共反馈报告，不新增持久缺失计数或持续完整性标记 | 同一公共能力输出 stderr |
| 命令成功／失败 | 沿命令公共反馈 | 同一反馈能力输出 stderr |

公共反馈不以某扩展 enable 或加载多少扩展为开关，不进入模型上下文、不新建打印系统；本轮没有批准退役 Owner handle 越过既有生命周期继续产生外部效果。UI 前端 absence 不阻止业务故障报告。

展示消费[存储失败政策](06-local-storage.md)：保存失败后允许丢弃未保存消费并从有效磁盘初始化；无有效基线暂停统计。不能把失败伪装成保存成功、暂停／缺失显示成确认零、或将初始化误称 clear 成功。普通故障不停止代理，独立余额／额度功能不因此自动停用；其实际刷新仍由刷新票决定。

### 本轮批准替代与证据边界

原 detail 字段展开 → 同处静态树；旧 Turn 标签 → Round；全范围 Cache／比例 → 当前查看 Session 自身当前模型；多渠道挤两套比例 → 当前模型单套比例；纯 Codex 过滤参考金额 → Cost／Ref 分开同时显示；历史费用分项持久化 → 相对权重参考、不改 schema；子树 Total／detail → 保留主树 Total、子代理 brief。理由与用户原话只在[确认资产](../assets/presentation-confirmation-2026-10-12.md)；旧 ticket／相关原权威原文见[历史](../assets/presentation-before-publication-2026-10-12.md)。

实际只运行比例数学与安装版真实焦点控制器隔离探针；后者使用 fixture Session／UI。未运行生产 widget、公共查看接口、真实模型与远端余额／额度、完整 TUI／RPC 新迁移验收。不改变 18.5.0 基线或声明 pi 支持。

## Decision

保留旧视觉并将 widget 分为 shared logic 后端与宿主专属前端；Total 区分当前会话模型字段与主树完整累计，detail 改静态代理树，Hub 子代理仅切必要会话事实并固定 brief。费用比例采用模型相对权重参考，Round 仅利用已有边界／累计快照轻量差分，无 UI 记账及错误可见；具体模型表、查看装配与远端调度在各自票继续收口。

## User stories

1. As a 用户, I want 保留熟悉的 widget 风格并统一字段规则, so that 迁移不改变常用视觉体验且不同宿主不重复业务计算。
2. As a 用户, I want Total 展示当前模型自身结构与整个主会话树消耗, so that 判断当前模型行为同时看见任务总花费。
3. As a 用户, I want detail 中按 Session 名称显示静态树与根的模型明细, so that 在同处对照各代理自身消费而不需要额外交互或重复汇总。
4. As a 用户, I want 保留费用结构参考占比, so that 可以评估输入／输出／缓存的等额消耗并调整 agent 行为。
5. As a 用户, I want Hub 中看到子代理真实 Effort／上下文／有效扩展标记, so that 查看对象变化后信息不错误沿用主会话。
6. As a 用户, I want 有可靠快照才显示轻量 Round, so that 不为轮次统计扩大持久化与历史恢复成本。
7. As a 无 UI 用户, I want 记账保存与错误报告不依赖 widget, so that RPC 场景不漏正常统计或静默失去故障提示。

## Preconditions

- [行为](01-behavior-contract.md)、[消费归属](02-accounting-ownership.md)、[数据](12-state-data-contract.md)与[存储](06-local-storage.md)确定 token／费用／关系／周期与已接受损失；这是设计输入，不是生产认证。
- [观察契约](03-observation-contract.md)需落实逐实际 Session／Turn／Round 与模型／上下文事实，不沿用 blanket owner gate 丢弃子消费。
- [装配局部权威](10-assembly-layout.md)承载宿主分支与当前查看公共能力，具体原生出口仍待该票核验；不假定只改 widget 即可支持 Hub。
- [模型计价局部权威](13-model-catalog-policy.md)承载比例表来源，具体模型／更新／缺失与实际查询未决。
- [命令](07-command-state.md)承载入口偏好与操作范围；[刷新](09-refresh-lifecycle.md)承载远端调度，包括仍未获批的无 UI 策略。

## Postconditions

- 本票展示选择已由用户 Q33 确认收口；其技术接线／生产行为不因结案自动成立。
- 后续不恢复旧 detail、纯 Codex 过滤、子树 Total、Round 持久化／历史补账或前端原生业务读取。
- 验收须覆盖下列场景，实际执行与支持版本由[验收与切换](../decision/11-acceptance-cutover.md)决定，不在本票交付生产实现。

### 视觉与 headless 验收场景

1. DeepSeek／Codex／token-only 的主会话 brief 保留适用原视觉，旧 Turn 改 Round；hidden 不被擅自扩大。
2. 主会话切模型且存在异构子／孙消费：Cache／比例只取主自身当前模型，Sum／Cost／Ref 保留全部主树累计并分单位；切换不重价、不双算。
3. detail 保留同一 Total、隐藏 Round，树含主根、子孙 Session 名称、主自身逐模型行与 subagent 单行；模型行不能被误看成代理节点，没有额外展开／查询交互。
4. 纯 Codex 显示 Ref 而非假装消费免费；缺价仍有 token，不捏造金额／比例；当前模型表可用时费用比例采用参考权重、不冒充历史分项。
5. Hub 进入子／孙再返回：Session 字段与有效 marker 正确切换，Total 合计仍主树，子固定 brief，返回恢复原模式；不修改 Owner 或新计费。
6. 正常连续 Round 可作自身快照差分；恢复／tree 缺数据时隐藏，不读取历史重估、不添加 Round JSON；子 Round 不混后代。
7. 无 UI 正常响应与 round_end 仍记账保存，缺 usage／价格、保存失败及命令反馈在 stderr 可见；不得以此测试推定完整远端刷新策略。
8. 有 UI 余额／额度错误只在 widget；无 UI 可见。保存失败／暂停不得冒充零或成功，代理继续；窄终端沿旧降级与新树布局验证，不增加未批准行为。

## Invariants

- 复用框架公共事实、State／Marker area／Extension feedback；按[装配 authority](10-assembly-layout.md)的 ADR-0002 native seam 分工，不建第二套机制。
- Session 自身桶是唯一消费源；Total／树／Round 是查询视图，render 只读，无网络／timer／文件副作用。
- Cost 与 Ref 不混算，比例参考与锚价总金额不混淆；不改变消费 JSON 的已确认 schema。
- 当前查看对象与实际执行／记账会话、Owner 分开；焦点或 detail 切换不清统计、不改变真实生命周期。
- 无记录不冒充确认零，不恢复完整性计数／补算／Round 历史；未知、无口径与额度消费仍沿领域概念区分。
- 未决接口／模型覆盖／远端调度只在相应 authority 收口；本轮不是生产实现或新版基线认证。
