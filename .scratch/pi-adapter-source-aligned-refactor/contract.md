# Contract — Pi 与 oh-my-pi adapter 来源对齐重构

Source: [Spec](./spec.md)
Acceptance mode: Rapid iteration
Approval: 用户已依次确认 seam 选择、六面检视后的约束方向，以及快速迭代＋指定人工验收。
Date: 2026-10-23

本文件是已批准的决策契约，不是实施完成报告。范围与组织决定由 spec 持有；本文只记录承诺、观察位置和验收责任。具体交付工作由后续 tickets 关联到 P 编号，不维护手工完成状态。

**Complete implementation and all assigned automated checks before the human-led acceptance round. Planned human-led checks do not pause otherwise executable work. At the final handoff, report the remaining checks together with their prepared evidence; they remain unverified until the user confirms them. Report genuine blockers when encountered.**

## Promises

Coverage 中未明确标为 human-led 的工作均由 agent 负责。S1–S3 为已批准的既有运行／检查 seam；R1 是结构交付审查观察面，不是新增运行时 seam。

|#|Promise (one observable result)|Coverage|Source|Seam|
|---|---|---|---|---|
|P1|维护者能够按实际契约来源追踪两端映射，而不会把 Pi 原生事实误认为第三方协议或把 OMP 原生机制误认为 Pi provider 的对应物。|审查实际来源对应关系及导航；对照上游契约而非仅检查目录名；按 spec 验收组织结构，不要求逐文件镜像。|stories 1–5, 9–10, 23|R1|
|P2|来源之间的依赖符合 spec 已批准的方向，跨来源解释不泄漏给消费方或退回 port 组装。|审查真实依赖与组合职责；复用导入约束检查。不得仅凭目录分组宣称隔离完成。|stories 11–15|R1|
|P3|重构后只保留一套有效实现与一致导航，不遗留替代路径、兼容转发、无职责镜像或过时架构规则。|结构、引用及文档审查；确认完整协议没有仅因单事件或上游文件拆分；更新既有 ADR 的相关组织决定，不改变无关规则。|stories 6–8, 27–28|R1|
|P4|现有公开 extension 定义及 assembly 使用方式在两个 harness 上继续兑现原有类型与绑定契约。|类型检查；通过公开 assembly 验证原有成功与拒绝场景、条件能力类型凭据；不得新增消费方对来源细节的依赖。|stories 3, 14–18|S1|
|P5|受影响 extension 在同一 harness 上继续收到符合既有契约的 Session、Turn、Round 和相关观察序列。|消费侧场景使用独立给定的事件事实、身份及顺序预期；覆盖实际受影响的开始、结束、转移、取消与终止失败；真实宿主验证适用路径。|stories 16–19, 25|S1, S2|
|P6|受影响 extension 的命令与 prompt 行为保持原有可观察结果。|观察命令结果、请求内容与历史；保留既有激活及交付规则，不以两个 harness 的原生事件相等作为预期。|stories 16–17; spec Testing Decisions|S1, S2|
|P7|受影响 extension 的 Marker area、反馈和 Viewed session 投影保持既有输出与交互行为。|Agent：自动验证输出、会话身份、投影及有／无 UI 分支，并执行适用真实宿主场景。**Human-led H1：用户在日常 TUI 确认受影响 extension 的 Marker area、反馈与 Viewed session 切换体验与重构前一致。** Agent 准备环境／版本记录、重构前后输出记录、可重复操作步骤、自动检查结果及已知差异；用户确认前 H1 保持未验证。H1 不替代底层状态、身份、输出或补丁分支的自动验证。|stories 16–17, 23, 25–26|S1, S2|
|P8|原来有效的 State 持久化内容在重构后仍按原有含义恢复和使用，无需数据迁移。|以独立预期与重构前有效样例验证恢复、分支选择及后续写入；不能只让新实现写入后再由新实现读取作为兼容证明。|story 20; inferred—履行既有持久化兼容承诺所必需|S1, S2|
|P9|原来有效的用户配置在重构后仍按原有含义生效，无需因内部重组更改配置。|验证受影响配置的有效输入及既有失败路径；区分用户配置与允许变化的内部源码定位。不得新增静默回退。|stories 15–18; inferred—履行保行为承诺所必需|S1, S2|
|P10|不同 extension、binding、主会话和子会话之间的既有状态及失败隔离保持不变。|多消费方／多 binding 场景；绑定失败后再绑定、独立释放、主子会话身份和 Owner 场景；观察消费结果，不读取私有状态表示。|stories 16–19, 22; inferred—履行隔离与生命周期承诺所必需|S1, S2|
|P11|Pi 第三方接入继续区分既有缺失、未启用、拒绝、协议失败和身份不匹配结果，不将其伪装成成功或空闲。|通过既有宿主／第三方契约控制输入并观察公开结果及错误；验证实际使用的版本、身份和启动条件；真实 provider 接通证据与替身分支证据分别记录。|stories 18, 21, 25–26|S1, S2|
|P12|实际子会话接入继续保留原有 child-extension 要求和可观察能力，不因来源重组漏加载或错误继承。|Pi 与 OMP 分别运行适用的真实子会话接入场景；结合可控条件验证拒绝路径，不将注册调用成功当成实际 child 加载证明。|stories 16–18, 21–22|S1, S2|
|P13|受影响错误、取消及超时继续按既有方式传播，不因重组新增重试、延长等待或吞掉失败。|确定性失败与取消场景，独立断言结果、顺序和既有等待规则；适用真实宿主终止路径；不新增性能目标。|stories 19, 21–22|S1, S2|
|P14|按既有生命周期释放后，应停止的交付、回调与外部效果不再发生，仍有效的其他 binding 不受误伤。|观察释放后的行为及另一 binding 的继续运行；覆盖适用注册、取消订阅和资源释放路径，不以 cleanup 被调用一次代替行为证明。|story 22; inferred—履行释放承诺所必需|S1, S2|
|P15|OMP 可选 Viewed-session 契约存在与缺失时，分别保留各自原有行为。|可控输入验证两个分支；真实运行只声明实际环境提供的路径。未获得补丁环境时明确记录接通验证缺口，不补装或修改宿主。H1 仅覆盖实际可用环境的交互判断。|stories 18, 23, 26|S1, S2|
|P16|两端接入完整性检查仍从实际 assembly 得到可解析的供给，必需项无新增缺口，既有可选状态含义不变。|对受影响消费方运行两端检查并审查需求与供给；保留条件 assembly 证据；不得通过删减需求或增加手工能力清单掩盖缺口。允许迁移导致源码定位变化，不要求报告逐字节相同。|stories 18, 24|S3|
|P17|交付证据明确区分结构供给、受控行为验证、真实环境接通和未验证项，不产生超出实际运行范围的支持声明。|报告命令、结果、源状态、宿主／provider／补丁环境和验证限制；已知失败单独列出，不算通过；H1 的记录随 P7 交接并等待用户确认。|stories 25–26|S2, S3, R1|

所有行为预期来自既有契约、独立字面量、人工可复核的例子或有效历史样例，不从被测实现重新计算。发现与既有契约冲突的现存缺陷时单独记录并请求范围决策，不静默修复，也不把失败记为通过。

## Seam decisions

|Seam|Exposes|Hides|Alternatives considered|Reversibility|
|---|---|---|---|---|
|S1 — 公开 adapter assembly 与 extension 消费 interface|绑定结果、语义交付、State 与效果、错误、身份及生命周期；同时约束公开类型承诺。|内部 module 划分、函数、组合算法和状态表示。|不把逐个 port 工厂的转发测试作为主验收：更高的消费 interface 已能承载行为承诺；不为测试公开私有 helper。既有 HarnessPort 继续保留，不新增公共 interface。|复用现有 interface，无新增迁移成本；若未来承诺无法在此区分，应先修订契约而非偷偷下沉测试。|
|S2 — 真实 harness 加载 extension 后的操作与输出|实际加载、子会话接入、命令、请求与历史、存储、UI 及终止行为；H1 保留实际日常 TUI 判断。|宿主内部调用链和 adapter 实现。|不只依靠替身：替身无法证明真实 provider 接通或子会话确实加载 extension；不把所有确定性失败场景都改成昂贵真实运行。|复用既有 dock／真实运行设施；版本、补丁和 provider 变化要求更新适用证据，不自动更改行为承诺。|
|S3 — 接入完整性检查的命令与报告 interface|实际需求、供给状态、条件证据、诊断与分析完成结果。|分析器内部遍历、源码行号及迁移后的定位差异。|不手工维护第二份能力表；不把结构 provided 等同于运行时成功。|复用现有检查 interface；有意改变报告语义需要独立决策，不属于本次内部重构。|
|R1 — 已批准的结构交付审查观察面；非运行时 seam|实际来源归属、依赖方向、单一实现、权威文档与证据一致性。|具体私有文件安排、helper 和内部 construction。|不新增运行时 interface 来证明目录隔离；不把所有私有路径冻结成永久行为测试。组织约束引用 spec，不在 contract 重复维护路径清单。|审查方式可以演进；已批准的来源隔离和干净切换承诺不因此放宽。|

### Dependency treatment

- **In-process**：状态与事件组合经 S1 直接观察，不为内部重组新增 adapter。
- **Local-substitutable**：使用已有隔离设施和可控输入处理文件系统、时间等适用依赖；替代设施必须保留被验证的契约，不能以自洽回声作为预期。
- **True external**：Pi、OMP 与 pi-subagents 的外部契约可在既有接入处使用测试替身控制失败分支；真实接通由 S2 独立证明。即使源码可在本地读取，也不代表此重构拥有修改这些外部契约的权限。
- 本次没有新引入的 **Remote but owned** interface；消费方已有外部交互仅作为受影响行为的既有观察，不借此次重构重新设计。

### Approval and rejected alternatives

- 用户确认复用 S1–S3，并以 R1 单独审查结构约束；没有批准新增公共 interface。
- 用户确认隔离性、跨重构持久化／配置兼容、释放后的停止效果及证据分级均是保行为要求的必要推论，不是新增功能。
- 用户选择 Rapid iteration，接受 P7 的 H1 人工项。Full automation 未被选择；人工例外仅限实际 TUI 体验判断，不转移实现、自动验证或真实 provider 接通责任。
- 未要求新的 ADR：本契约复用既有 seam。Spec 已确认替代旧 domain-first 组织决定；实施时更新相应架构记录，不由本契约提前宣称迁移完成。

## Not yet specified

- 后续 tickets 将把交付工作关联到 P 编号，并确定具体受影响测试及场景；这是交付细化，不是尚未批准的 seam。
- 实施验证时使用的确切宿主、provider 与补丁环境及可运行性尚未确立。优先使用既有设施；真正缺失的前提按阻塞／证据缺口报告，不凭空补齐，不改变 P15 的责任。
- H1 的实际运行结果留待所有自动工作完成后由用户确认；它是已批准的验收分配，不是当前契约批准的阻塞项。
- 没有尚未批准的行为、seam 或验收责任决定。若实施证明既有观察不足，先修订本契约，再重开相关 tickets。

## Out of scope

完整继承 [spec 的 Out of Scope](./spec.md#out-of-scope)，不增加例外或缩小范围。结构重组不授权改变公共语义、修改宿主或第三方、补装可选补丁、顺手修复行为缺陷、强制两端能力对称或提升版本支持声明。

## Coverage report

- P1–P17 均有观察位置。P1–P3 属于结构交付要求，通过 R1 审查而非运行时 seam；这项例外已明确批准。其余承诺至少映射到 S1–S3 之一，P17 同时接受 R1 证据审查。
- S1、S2、S3 均承载承诺；R1 也有明确承诺，无空 seam 或无归属承诺。
- 六面检视已完成，无整面不适用：
  - **Entry**：P4、P6、P12、P16；公开装配、真实加载和检查命令。
  - **Data and state**：P5、P8–P10、P15；语义事实、历史持久化、配置和隔离。
  - **External dependencies**：P11–P12、P15、P17；宿主、provider、可选补丁及证据条件。
  - **Errors and failure**：P4、P10–P11、P13；绑定拒绝、污染隔离、协议失败、取消和超时。
  - **Output and observability**：P6–P7、P16–P17；命令、prompt、UI、报告及真实证据。
  - **Resources and concurrency**：P10、P12、P14；共享注册、多 binding、子会话及释放后的效果。无新增性能或成本指标。
- Deferred：具体交付关联、验证环境实例及 H1 结果。Approval-blocking decisions：none。
- Acceptance mode：Rapid iteration。Human-led coverage：仅 P7 / H1；其余由 agent 负责。
