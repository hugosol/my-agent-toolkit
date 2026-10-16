# 选择 pi 子代理扩展及缺口处理路线：Lighthouse

> Question and discussion: [选择 pi 子代理扩展及缺口处理路线](../decision/03-subagent-provider-choice.md)

## Question

选择迁移的子代理提供方、开发期间固定版本及缺口处理路线，明确宿主适用范围、外部前提与重新评估条件。本票解决选型与路线，不宣称全部基线已经实现；具体组织和验收由后续决策票提供。

## Discussion

### 确认来源与修订记录

2026-10-16，用户在“请继续ticket03”后的本轮访谈中确认：
- Q1：“是，以nicobailon为基点规划”；Q2 明确顺序为“优先pi公开事实，其次第三方公开事实，再次shared-logic自己实现，再没有办法才考虑修改第三方extension”。
- 用户纠正费用来源：“我们需要保证计费逻辑走的都是我们的实现”；Q10 最终以“全部同意”确认各缺口路线及停止条件。
- Q5：“确认这个原则”，即 pi 不复制 OMP hub 切换机制、不随 inspector 选择切换 model-cost 显示目标；真正切换实际会话且复用显示区域的路径出现时再评估。OMP 原查看路径不变。
- Q6 用户提出两端重新设计耗时；对计时边界及按文件名归属的跨票修订回答“Q8 是 Q9 是”。详细耗时规则唯一权威为 [跨宿主内置观察与耗时组织原则](04-third-party-adapter-organization.md)。
- Q7：“同意，开发期间固定为这两个版本”。
- 用户明确要求把通过 pi 原生事件确定 Round 边界的问题独立建票；已建立 [pi 原生事实到 Round 边界的映射](../decision/08-pi-round-boundaries.md)。

先前“最终提供方未定、nicobailon 尚待真实验证”的停止点已被本轮选择及已发布验证取代。先前耗时可有条件放弃的提案不再作为本轮路线：当前采用已确认的结束结算、自行累计方案，不自动批准放弃；原研究的完整能力事实基线不改写。上述修改均为规划，不是生产迁移授权。

### 提供方、版本与选择理由

选择 nicobailon 的 npm `pi-subagents@0.78.0`，开发期间固定宿主 pi `1.2.0`。默认分支或未来发布的功能不混入本版本承诺。

产品要求保留模型自主委派、嵌套、并发、续跑及取消；workflow 与定时调度为重要加分项，不自动扩成新的迁移硬功能。选择依据是 [nicobailon 真实验证](07-nicobailon-runtime-validation.md) 提供了上述使用路径、公开必需子扩展入口、实际身份/父链及逐请求离线归并证据。相较 [tintinweb 验证](06-tintinweb-runtime-validation.md) 中嵌套/workflow 的公开观察与归因缺口，nicobailon 更适合本轮内置观察路线。产品/维护的时间点信息见 [比较报告](../research/03-product-maintenance-comparison.md)，热度和更新频率不等于兼容通过。

不再以 tintinweb 为首选，不因此宣称其无法使用或 nicobailon 已完整覆盖。nicobailon 累计 cost 有范围不足，探针成功不证明生产并发写入、崩溃恢复、生命周期或公共语义已经实现。

### 事实优先级与自身计费

补齐顺序：pi 原生公开事实 → 第三方公开事实 → 复用/补充自身 shared-logic 实现 → 实在不足时才评估修改第三方 extension。自行计算不能创造缺失身份、父链、请求或生命周期事实；公开稳定性需要核实，源码可达或私有字段不算公开承诺。

使用 nicobailon 已实测的公开 `registerRequiredChildExtensions` 入口，把 model-cost 内置观察加载到子会话。优先读取 pi 请求开始、响应与原始 usage，以及有效模型等事实；只有所需加载、身份或关系事实不足时才使用可靠第三方公开事实。允许可靠的子会话持久化作为关联来源，但保存 JSON 本身不证明关系。

所有计费继续使用现有 model-cost 实现：`shared-logic/request-price.ts` 的请求锚价，以及 `shared-logic/request-accounting.ts` 的金额计算、去重和累计；不以 adapter 或第三方给出的最终 cost 替换。宿主提供原始 usage 或目录单价作为输入，与采用宿主计算好的费用不同。计费渠道、参考费用、未知与已知零保持既有区别。

### Viewed session 的宿主适用范围

修订此前将缺少 Viewed 出口直接视作 pi 必须补齐项的推论：pi 不为复制 OMP hub 而新增该接口，model-cost 不随 nicobailon inspector 的选择切换显示目标，保留主会话下的子代理统计与代理树。OMP 原有查看路径不变。若后续发现真正切换实际会话、复用同一显示区域的路径，再针对该路径评估事实需求，不自动批准缺失事实时的替代值。

证据为固定 `v0.78.0` 源码（`a4c8ced69a8176cdf4179b127feddc8875e3418f`）的 `README.md:95-101`、`docs/observability.md:112-135`：存在 Fleet inspector、transcript 与 Inspect plugin 的独立查看入口。这是文档/源码证据；既有真实验证未运行 TUI，不宣称已证明与 OMP hub 等价或所有切换路径均不存在。Viewed 是显示目标，不是运行状态。

### 缺口路线与后续决策归属

- 身份、直接父、续跑与 fork：采用可靠公开事实，区别 actual session、execution 和继承历史，不按名称、进程或深度猜关系。
- 观察加载、事实归一、跨进程 JSON 汇集/去重/原子保存/恢复、根专用初始化清理、实例/订阅及 Owner 寿命、State 继承：由 [第三方能力适配的集中组织与公共语义复用](../decision/04-third-party-adapter-organization.md) 决定具体接口和组织。公共语义仍由 framework 拥有。
- 子代理耗时：按 [原组织权威中的跨宿主修订](04-third-party-adapter-organization.md) 实现，不能拿第三方 duration、会话跨度或活动区间近似值替代；具体生命周期接线尚待组织设计。
- Round：由 [独立边界决策](../decision/08-pi-round-boundaries.md) 处理主/子会话起止、持续、截断及自动继续；不在选型票中批准 idle 等价判据。
- 目录价、provider access、改名、context usage、托管 timer、绘制与发现入口，以及全部功能、生命周期和失败路径验收：由 [完整迁移方案](../decision/05-complete-migration-plan.md) 结合组织与 Round 结果逐项确定，不以只覆盖子代理统计代替完整迁移。

### 外部前提与重新评估

不自动批准私有 API、长期 fork、pi 补丁、第三方修改或额外付费验证。硬性要求不能按上述顺序满足时，带具体缺口回来确认是否修改第三方；不能以 unavailable、未知记零、猜父链或提前关轮绕过。

开发期间固定两版本。未来升级若改变子扩展加载、身份/父链、续跑或后台机制，须核验受影响路径；不必机械重做全部研究。若完整 usage 无法可靠获取、无法防止漏账/重复，组织或 Round 决策揭示路线不成立，或必须依赖未批准机制，则重新评估路线，必要时重开提供方选择。

## Decision

以 nicobailon `pi-subagents@0.78.0` 和 pi `1.2.0` 为开发固定基点，采用公开事实优先、内置观察及自身计费的补齐路线。明确 pi 查看适用范围与跨宿主耗时修订的权威，具体组织、Round 边界和完整验收由各自决策票提供；不宣称生产迁移已完成。

## User stories

1. 作为使用者，我需要可靠的自主委派、嵌套、并发、续跑及取消，以便在 pi 上保持日常子代理工作方式，并利用 workflow/调度加分能力。
2. 作为 model-cost 维护者，我需要把真实逐请求事实送入同一套自身计费逻辑，以便跨宿主保持计费一致，避免漏账、重复或误采第三方总额。
3. 作为迁移规划者，我需要宿主适用范围、缺口去向及重评条件，以便不为复制界面机制而补无用接口，也不把未完成的适配误认为已满足基线。

## Preconditions

- [完整事实基线](01-capability-baseline.md)、[候选对照](02-pi-subagent-candidates.md)及两候选固定版本验证均已发布；按其证据限制解释。
- 必需子扩展观察与离线归并已有实测输入，生产可靠汇集及生命周期仍须后续设计和验收。
- 当前选择依赖固定版本及已测环境；其他 provider/平台和未经验证路径不是自动通过。

## Postconditions

- 提供方、开发版本、补齐优先级、计费来源边界及重评条件已决定，选型范围完成。
- 组织、Round 和完整方案的未决设计有命名决策票承接；这些票保持各自认领与完成状态。
- 生产安装、实现、付费重测及未经批准的外部修改不在本次授权内。

## Invariants

- 对齐 `framework/docs/extension-development-map.md`：同一份 extension definition/shared-logic，宿主机制隔离，装配薄，不新增通用插件系统。
- `framework/core/protocol.ts` 与 framework behaviors 拥有身份、scope、Turn、Round、State 和生命周期语义；观察不产生第二套语义或额外写权限。
- model-cost 的 usage、请求锚价、费用、参考费用、未知、已知零、自身累计与含后代累计保持区分。
- Session、直接父、Owner、Viewed session 和 execution 不互相替代；已批准的宿主适用范围与耗时需求修订不改写历史事实基线。
