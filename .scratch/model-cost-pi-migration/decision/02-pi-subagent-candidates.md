# pi 子代理扩展的接口证据与覆盖对照

Type: research
Status: resolved
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Related input: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；消费其完整基线，不以 model-cost 子集替代。

## Handoff

- 当前恢复点：已发布 [候选对照 Lighthouse](../lighthouse/02-pi-subagent-candidates.md)，研究范围完成。当前事实入口为 [修订研究与候选摘要](../research/02-candidate-comparison-corrected.md)，逐项源码和分类在 [主候选复核](../research/02-primary-candidates-correction.md) 与 [其他候选复核](../research/02-other-candidates-correction.md)。旧报告仅保留为快照，其过强覆盖表已被取代。
- 确认/授权来源：用户明确要求纳入 `tintinweb/pi-subagents`，随后“请开始ticket02”授权本次 AFK 事实收尾；不是最终提供方选择、私有 API/fork 许可或生产迁移批准。用户允许评估补接口/上游贡献，所有路线取舍仍归用户。
- 核心分层：Turn 身份、Round 合成、请求锚价及 State/效果权限继续复用 framework/shared-logic；候选需提供实际会话/直接父、请求、可靠用量、活动/静默和每 execution 测量等原生输入。累计 usage、provider cost、时间戳、viewer 及私有字段都不能自动算完整覆盖。
- 已撤销旧概括：pi 没有 input/HTTP response/responseId；只有两家有公开契约；独立 EventBus 使全子会话观察不可能；`--no-session` 不可能有身份；viewer 即 Viewed 席位；时间戳即 runtime；缺最终 Turn/Round/锚价就必须改上游。勘误理由与源码位置统一见修订研究，不在本票重复保存规则。
- 用户指定的 tintinweb 固定候选为 `@tintinweb/pi-subagents@0.22.0` / `85a704cb8f35c96c0cabfa665b572bab296942e5`。已复核公开 v2 ping/spawn/stop/consume、registry 和顶层终态累计 Usage/本次 duration；明确事件无 actual session/直接 parent、嵌套/workflow 过滤、spawn 覆写观察回调、无公开枚举/续跑 RPC、逐请求与 Viewed 席位缺口。它不是 nicobailon 同名包；gotgenes 是 tintinweb 分叉。不因此批准任何候选或认定必须长期 fork。
- 证据与限制：复读固定 revision 本地源码、类型、README/文档、npm tarball 和既有元数据快照；宿主 HEAD 实测为 `4a5d37291531ad48b8e536c892557877d219463c` / pi 1.2.0。五项只读源码断言通过（input 来源、response status/headers、公开 response 订阅、settled 事件、可注入 bus）；这是静态事实校验，未安装、未构建、未启动宿主、未作 RPC 实际往返、未调用模型。未验证 Windows 兼容及任意未来版本。d3ara1n 的旧 pin 与现有树对应未证、部分 tarball 来源/许可和 dist/source 对应限制均在附件显式保留。
- 下一就绪动作：[tintinweb 子代理扩展的本机隔离验证](06-tintinweb-runtime-validation.md)可领取，先做固定工件与无模型费用的加载/发现/RPC/清理，再按授权边界处理最小真实调用。模型、最大次数和数值费用上限仍须明确；本票不消耗或扩大该授权。
- 其他未决问题及归属：[选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md)在隔离验证后由用户选依赖与补接口路线；[第三方能力适配的集中组织与公共语义复用](04-third-party-adapter-organization.md)决定桥接/身份归一/订阅寿命/集中组织；[model-cost 完整迁移的职责落点与验收路线](05-complete-migration-plan.md)决定全部功能落点与验收。静态比较不承诺任何候选现成完整覆盖；不存在默许降级或多 main 扩围。
- Backtracer 追溯：沿当前 Lighthouse 的 stories/invariants 和已发布基线逐项检查完整能力、依赖选择/补接口、公开事实/权限/寿命、固定版本/平台/许可及真实消费者证据。提供方分别是既有能力基线、上述选型、组织、完整方案与隔离验证票；公共模式的 definition/shared-logic、framework、adapter、harness/entrypoint 已由组织和完整方案问题承接。旧报告矛盾属于本票待修正研究事实，不是需要用户重裁的已批准上游政策。无新增无主缺口或政策冲突，不新建 ticket，不改其他票状态/claim；未完成提供方仍未满足下游前置。

### Evidence assets

- 本次修订与逐候选复核保存于本 effort 的 `research/02-*-correction.md` 和 `research/02-candidate-comparison-corrected.md`；正式结果导航为上面的 Lighthouse。
- 原研究分支 `research/pi-subagent-candidates`，worktree `E:/Developer/myhub/wt/pi-subagent-candidates`，交付提交 `b5c903f`。原记录称已推送 `origin/research/pi-subagent-candidates`、无 PR、未合并；本次未重新检查远端，不声称本次新提交/推送。
- 原主报告：`E:/Developer/myhub/wt/pi-subagent-candidates/.scratch/model-cost-pi-migration/research/02-pi-subagent-candidates-report.md`。原逐候选材料位于同目录 `candidates/{pi-subagents,tintinweb-gotgenes-workflows,background-tasks-group,fleet-runtime-group,process-boundary-group}.md`。
- 原始市场/元数据：同目录 `search-scope.json`、`search-scope-focus.md`、`npm-metadata.json`、`top70-metadata.json`、`pidev-package-pages.json`。市场范围为有界抽样，统计沿用 2026-10-15 快照；不重搜市场、不宣称绝对穷尽。旧包页个别共用字段和版本过期信号按附件限制使用。

## Question

哪些 pi 子代理扩展值得作为当前 OMP 子代理能力的提供方？各候选现有可用接口能覆盖哪些能力，剩余缺口是否需要新增公开接口、上游贡献、私有依赖或 fork，分别有什么证据和维护/兼容性前提？

记录候选发现范围及筛选原因；按当前源码 revision/版本逐项分类为已证实覆盖、可经适配覆盖、需修改上游、未覆盖或证据不足。包括子会话事件/身份与用量可见性、进程边界、后续执行及耗时等基线实际要求，并记录安装方式、授权许可、版本与发布现状。不得承诺绝对穷尽市场或仅因工具能启动子代理而宣称完整覆盖。

## Comments

- 用户允许考虑补接口/向上游贡献，但最终选哪个扩展以及如何取舍由用户决定。本票仅产出事实和候选比较，不作选型批准。
- 2026-10-16 原 CandidateResearch 曾在研究交付后直接设为 resolved；因未完成 Lighthouse/Backtracer 且出现分层勘误，主会话恢复 open 并释放当时 claim。原报告中的“只有两家公开契约”“全部候选与 pi 均无请求/HTTP 事实”等概括已由本次修订取代，历史证据保留于上述原分支。
- 2026-10-16 本次领取后完成固定来源复核、覆盖分类修订、Lighthouse 发布与 Backtracer 追溯，正式设为 resolved 并清除本会话 claim。未执行生产迁移或付费调用。
