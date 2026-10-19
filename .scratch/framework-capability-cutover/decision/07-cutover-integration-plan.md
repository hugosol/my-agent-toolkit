# 确定整合顺序、旧入口退役与验收交接

Type: grilling
Status: resolved
Assignee: unassigned
Blocked by: 01, 02, 03, 04, 05, 06
Parent: ../map.md

## Handoff

- 完整结果与可恢复确认来源：[整合顺序、旧入口退役与验收交接 Lighthouse](../lighthouse/07-cutover-integration-plan.md)。用户逐项确认 Q1–Q7，最终对 Q8 / Q9 回答「同意」，授权整票发布。
- 本票全部规划范围已决定，无待答候选或下一轮访谈。六项前置权威已提供完整设计输入；其 resolved 不代表生产实现或验证通过。后续读取本 Lighthouse 及其原权威链接，不从旧架构候选重新推定政策。
- 已确认六批串行计划、残余声明/离线清单/port 归属、全部消费者与七个 legacy 例外退出、五个实际入口及分层验收。用户限定「本轮需求仅限代码重构，把interface作为最小接口暴露给extension层，不作其他功能扩充」；不新增诊断工具、harness 组合或支持声明。
- 证据：读取 public / requirements / integration / checker / import-boundary，图谱核对 protocol 与 assembly 声明；精确搜索扩展、adapter、脚本消费者，列出现有 smoke / dock / discovery 文件。find 因地区限制不可用，已用图谱和精确搜索补足；文件存在不代表行为已运行。
- Backtracer 与文档链接/frontier 核验已完成，未发现新缺口或未裁决冲突；证据见下方 Comments。本票已 resolved / unassigned，地图无未决票。当前只发布规划文档，未改生产代码，未运行 typecheck、行为测试或真实 harness；这些是后续实施验收，不是本票的通过结论。
- 下一步是另行将已发布计划拆成 implementation tickets，本会话不生成或执行。若后续实施发现必须改变领域语义，携具体冲突重新取得决策，不自动重开原政策。

## Question

如何把全部已发布决定汇成无关键悬案的实施交接计划，按真实依赖串联五项重构并最终关闭旧入口？

- 建立最终公开声明/运行时入口/内部 port 的归属表和消费者迁移清单；definition、assembly、requirements 与 integration checklist 等残余类型必须有落点，不可只完成五个目录。
- 明确每批前置条件、允许修改的共享文件、退出条件、失败时如何在未完成切换前保持可验证；不引入最终保留的兼容 re-export。
- 基于已定设计重新评估类型依赖、运行时效果、共享文件、测试/宿主资源四类冲突。只有全部证明独立的切片才可并行；其余串行。当前证据不足以批准任何生产实施并行。
- public.ts、core/assembly、core/definition、core/config、core/integration、modules/http、modules/files 的 extension legacy 例外如何逐项退役？内部仍可保留原文件，不等于扩展仍可导入。
- 明确静态限制、实际运行时表面、capability 行为、三个真实扩展及两种 harness 的验证矩阵；按 testing.md 区分迭代、完成、集成与真实 smoke，串行协调共享工作树运行。
- 文档/ADR 变更、已完成 Session 的不回退检查、未验证项与实施交接出口如何记录？计划完成不是实现完成，不创建生产 implementation tickets 来冒充决策结论。

## Comments

### 完成发布与追溯

- 本轮 Q1–Q9 已全部确认；最后用户对 port 范围和文档/计划出口回答「同意」。已发布本票 Lighthouse，地图只索引结果；未改写其他决策票的 Question、Handoff、状态或 claim，未创建实施票。
- Backtracer 已回查地图、六项前置 Lighthouse 与全部决策票的当前 Question/状态。意图信号：最小扩展知识与唯一入口由统一原则及各能力权威提供；逐批可验证、消费者/旧入口退役与交接出口由上游共同原则的迁移要求和各票完整迁移要求提供；单一 port 与离线检查分离由共同原则、authoring/Subagent 权威及既有 ADR 提供；五个实际入口的验收需求来自 Command、General、authoring 与共同原则的行为保持要求。
- Pattern / peer 检查：Session/State 的 canonical 与受限对象模式在 Command/初始化中延续，普通函数与配置有限例外按原权威处理，不机械要求 General 使用对象 capability；两 adapter、三个扩展、五个真实入口和脚本/测试消费者均有归属。Dependency / layer 检查：设计输入均已由已解决票提供；实现、凭据、宿主与测试资源是后续执行前提，不伪装为本轮已实现能力，也不混入功能扩充。未发现新的无主问题、同类缺口、层级越界或需用户裁决的上游冲突；无 gap 待分派，不新增空追溯报告或重复票。
- 地图原有条件性 fog 是实施遇到新事实时的重决策规则，不是当前可命名的未决问题；已转为整合计划约束，地图 Not yet specified 收敛为无。本次规划终点已达到，下一步是另行拆分实施任务，不在本会话执行。
- Bun 文档发布核验已运行并通过：地图、本票和七份 Lighthouse 共 9 份文档，73 个本地链接及适用片段目标均存在，错误 0；本票 Lighthouse 必需章节齐全，唯一 Handoff 位于 Question 前；七张决策票均为 resolved / unassigned，frontier 为空。生产 typecheck、行为测试、真实 harness smoke 与正式切换均未在本轮执行，文档核验不能代替它们。
