# 装配访谈确认来源与证据限度

来源：本会话从用户「请开始ticket10」至最终「确认」。无可用消息 URL；以下使用实际用户原话和 Q 编号作为恢复定位，不编造消息时间。政策在各原权威，本文保存确认链、被替代提案和事实限度；[发布前完整历史](assembly-before-publication-2026-10-13.md)可恢复工作票、原局部 Lighthouse、地图与架构文档。

## 确认链

- Q1：用户先澄清装配不是 adapter，并要求区分宿主专属 widget 实现。用户的目标原话：「当我想要扩展一个新的harnesss时，能清晰地知道，自己新增的代码应该放在哪里」；随后对公共 adapter、extension harnesses 专属实现与薄装配／加载入口的目录约定回答「Q1 同意」。不同 harness 共享公共语义与业务，不复制接入流程。
- Q2：「可以，我想应该有一类能力，与adpter完全没有依赖，但属于常用的能力，没必要每个extension实现一遍的，应该单独一个类别」。确认 framework/modules/ 分类，HTTP／文件为独立通用 Module，不增加能力注册系统。
- Q3／Q4：用户要求按 codebase-design 检视，接受收窄后的公共装配 Interface，以及 Owner／逐实际 Session 按订阅组声明范围：「Q3 同意」「Q4 同意」。不是逐 handler 填满 capability 开关，不导出内部 HarnessPort／StateStore／派发器来让 extension 自行组装 framework。
- Q5：「同意」。确认 framework 在必要配置校验后调用实现工厂，工厂创建与连接 extension 实现；后续 Q10a 明确替代原 Q5 中的运行时能力准入步骤。创建阶段不请求远端、不启动 timer；框架管理绑定失败清理。
- Q6／Q7：「Q6 同意」「Q7 同意，这个架构还有一个好处，就是测试可以集中在后端seam，减轻前端测试压力」。确认事件当时快照／操作时查询区分、公共事实 Interface 与 widget 的只读展示结果＋更新订阅；减少前端业务测试不等于取消宿主绘制与真实接线验证。
- Q8：「Q8 同意，初始化节点是一个非常重要的通用功能」。确认公共一次性初始化入口，认证资料可读节点调用，首次模型请求前收口；不复制到各 extension，不每个子代理预取，不增加运行期网络屏障。
- Q9：「Q9 采用，framework统一维护完整生命周期是正确做法」。确认框架结束绑定／解除公共订阅，extension 清理自身业务／前端资源，旧结果失效。普通切 Session／模型／查看不销毁业务运行实例，不新增保存排空或网络取消。
- Q10：用户拒绝复杂动态准入：「能力准入应该在extension开发阶段就已经确定清楚，不需要在运行时再进行复杂动态判断，所有能力都满足，才能实现对应harness的extension」。初始建议的按 UI／headless 动态能力判断撤回。
- Q10a：用户进一步提出「把验证阶段抽出来，作为独立脚本（或其他任意可以独立运行的方式），单独执行产出报告……而启动阶段不要添加业务需求以外的任何验证逻辑」。用户对明确的旧→新总结回答「Q10a 采用，这才是我心目中更理想的架构」。旧启动版本判断／警告及 required-API shape guard 被独立能力／版本／接入验证报告替代；不自动验证、不读报告作为启动门禁，保留必要配置检查与业务错误处理。requiredSemantics 若保留仅作开发／验证描述，不作运行时开关。支持声明由显式维护决策作出，不因运行正常或测试局部通过自动认证。
- Q11：「同意」。确认 runtime、accounting、consumption-store、providers、quota-estimate、presentation、model-data.ts 的职责与候选源码落点；不是要求创建空目录或浅转发链。物理文件协调归 framework，schema／合并／业务失败政策归 extension；业务布局消费现行存储／数据权威。
- Q12：「Q12 同意」。冻结原 my-omp-toolkit HEAD fd3b507f99d11f8a68b63446c45aa911f0ee5c84 为只读源码 oracle，当前工作区干净；新契约优先，不实时跨仓库 import，不自动跟随原 HEAD 更新。
- Q13：用户先问「这部分应该属于shared-logic？」；澄清 Codex 协议／parser／预算／测量归 shared logic，认证映射归 adapter，HTTP 执行归通用 Module 后，用户回答「采用」。确认不保留 OMP runtime helper／专属查询桥接，复用适用纯逻辑前核对源码来源与许可证。
- Q14：「Q14 允许，这是正确的实现顺序」。允许最小 OMP 公开当前查看事实／变化出口作为完整接入的实施前置；不使用私有字段、UI 文本或猜焦点，不自动升级支持基线。最终 patched revision／版本与验证场景由验收票收口。
- Q15：用户要求了解不同能力及变更 Interface；用户随后回答「Q15 按照你的表格分析执行即可」。当前查看／有效 marker 用只读快照＋变化通知，catalog 按需查、认证按操作读、Turn／Round 明确事件、初始化／销毁为生命周期、HTTP／文件为操作、命令为动作；不自动提供 setter。model-cost 无修改模型／Effort 需求，不因 native setter 存在升级成公共控制能力。
- Q16：「Q16 采用」。公共 handler 有序调用，Promise 完成／拒绝有承接，但未完成保存不构成整 Session 的后续事件屏障；初始化与命令的明确等待位置保留，同文件顺序由文件 Module 实现。
- Q17：「Q17 同意」。DeepSeek 余额 proxy:false，Codex 启动额度 proxy:"codex"，connect-bot proxy:false；显式 codex 配置缺失失败、不回退直连，不控制宿主推理／OAuth 网络，不增 balanceProxy／usageProxy 字段。
- Q18：用户要求复用旧 seam 行为测试；随后明确：「Q18 同意，按此原则，特别是关于connect-bot 的‘子代理结束不能驱动主会话效果’仍应保留；但‘所有扩展都收不到子代理事件’不能继续作为通用断言，这个理解迁移非常重要」。现有消费者一起切公共接入，不留旧生产路径；行为断言保留，必要测试接线迁移，失效／实现细节断言删除，不重写业务预期来迁就重构。
- Q19：用户对完整组织规格、原权威修订、发布／Backtracer 与整票收口回答「确认」。授权发布规划，不执行迁移、宿主补丁、安装／配置／凭据／统计修改。

## 实际检查与证据限度

- 读现行 tracker、地图、工作票／局部 Lighthouse、前置权威及 framework／model-cost glossary；使用图大纲与符号片段核对 definition、bindExtension、OmpAdapterOptions、事件 delivery、connect-bot 装配与 transport。旧 codebase-tools 真实 loader 测试入口、connect-bot heartbeat 入口证明其场景组织位置，不是本轮已跑通测试。
- git -C E:/Developer/myhub/my-omp-toolkit rev-parse HEAD 实际输出上述 oracle commit，status --short 实际为空。只读核对旧 chatgpt-usage.ts 的 native helper／OAuth／proxy 调用链。
- 复核当前 OMP 的公开 ExtensionContext／ExtensionUIContext，未见完整 Viewed session 快照／订阅出口；公开类型声明有 setModel／setThinkingLevel，不等于本次公共控制需求。图字面检索空结果曾以已定位文件的 grep 补查，不能把索引空结果当不存在的证据。
- 既有查看探针来源：[展示证据](presentation-confirmation-2026-10-12.md)。它运行安装版 18.9.2 控制器＋fixture Session／UI，不是公开出口、18.5.0 支持或真实新 TUI 验收。既有正常观察证据见 [正常数据流](observation-happy-flow-convergence-2026-10-11.md)。
- 本轮只读事实与发布文档；未运行新 framework／adapter／widget、远端查询、完整测试套件、代理／文件并发或真实账单验收。发布导航 smoke 另记录在工作票；不能把文档检查称为生产可靠性证明。
