# pi 子代理扩展的接口证据与覆盖对照

Type: research
Status: open
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Related input: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；已消费其基线行完成对照。

## Handoff

- 起点：从 https://pi.dev/packages 寻找实际候选，追溯其一手文档及源码；同时读取本地 pi 源码验证宿主机制。
- **用户指定候选（必须纳入后续正式对照与选型讨论）**：[tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)，npm 包 `@tintinweb/pi-subagents`。该项目已在原研究中检查（v0.22.0，revision `85a704cb8f35c96c0cabfa665b572bab296942e5`），但主会话的简短候选表遗漏；用户本次明确要求加入，不代表批准选用。现有证据见下述 `research/candidates/tintinweb-gotgenes-workflows.md` 的独立章节。后续须单独呈现其公开事件/RPC、会话与父链事实、逐 Turn 用量、执行耗时及续跑覆盖，区分它与 nicobailon 的同名项目及 gotgenes 分叉；既有报告的分层勘误同样适用。
- **tintinweb 初步复核结果**：主会话直接复读固定 revision 的 `package.json`、`docs/rpc.md:1-75,125-180`、`src/index.ts:535-594`、`src/types.ts:230-310`。已确认存在文档化的跨扩展 EventBus RPC（ping/spawn/stop/consume）和 registry；因此“无 exports”不等于“无公开接口”。终态事件有累计 Usage 与 `durationMs`，但事件构造不带 actual sessionId/parentSessionId，且 nested/workflow children 被显式过滤出顶层生命周期通道。RPC spawn 覆写 `onSessionCreated`/`onAssistantUsage`/`onTurnEnd`，故不能仅靠传回调旁接逐请求事实。当前只能判断值得保留候选、现成公开通道不足以证明完整覆盖；应重点评估公开的只读全子会话事实/请求事件、每执行耗时与身份接口。原报告将有 conversation viewer 判为 Viewed session 契约 covered 过强，UI 存在不证明提供“当前查看席位”的可读订阅。无安装或运行验证，未批准选型。
- 产出：候选发现与源码比较报告已交付；正式发布尚未完成。研究代理曾直接设为 resolved，但未完成 Lighthouse/Backtracer 流程，主会话恢复 open 并释放已结束代理的 claim；不是撤销已批准选型（从未批准选型）。
- 审阅恢复点：保留原研究分支为证据快照，下列勘误优先于原报告的概括，不得直接拿原表做完整覆盖结论。下一步应修订覆盖分类后发布事实结果，不需要重新搜索整个市场。
- **已核实的勘误**：原报告 §2.5 称 pi 没有用户输入事件，与本地 pi `packages/coding-agent/src/core/extensions/types.ts:1170-1187` 的 `InputEvent`/`input` 声明及基线研究矛盾。同文件 `:917-920,1636` 明确存在 `after_provider_response` 且携带 HTTP `status`/`headers`，故不能把 JSON 导出流缺字段等同于所有 pi 公开接口缺事实。
- **分层分类修正要求**：Turn 身份、Round 身份/开闭及请求锚价由现有 framework/shared-logic 机制负责；候选没有这些最终语义不直接构成需上游接口的缺口。必须核对它提供的原生请求起止、模型、用量、队列/执行事实是否足够。每 ResourceLoader 独立 EventBus 只证明不自动共享，不证明提供方无法桥接；原报告“事先堵死”及“只有两家有版本化公开契约”也过强（其自身列出其他版本化事件/邮箱）。保留逐候选原始证据，暂不发布绝对结论。
- 对照：已消费能力基线分支 `research/omp-capability-baseline`（worktree `E:/Developer/myhub/wt/omp-capability-baseline`）的 F-/O-/N-/M-/P-/G- 行；两侧在“pi 无原生子代理身份/注册表/执行耗时、无 `getAsyncJobSnapshot`、无 viewed session”上一致；本报告另证 `pi.events` 是每 `ResourceLoader` 一份（`packages/coding-agent/src/core/resource-loader.ts:379`），这是“跨 owner 观察范围”需要新接口的直接原因。
- 结论性质：事实与候选比较，**不批准**任何提供方；未宣称穷尽市场（范围与排除原因见报告 §1）。
- 下一步（属 ticket 03/04 与用户）：选型、缺口处理路线（上游贡献 / 适配层 / 是否允许例外 fork）、以及是否接受运行验证成本。
- 剩余未验证项（不是阻塞，是本轮证据等级的边界）：全部为固定 revision 的源码/tarball 阅读，**无安装、无构建、无运行**；`@quintinshaw/pi-dynamic-workflows` 仅有 npm tarball 证据（声明仓库 404）；`@zhushanwen/pi-subagent-workflow` 无仓库且无 LICENSE 文件；候选在 Windows × 当前 pi 版本上的运行时兼容未验证。
- Research asset: 分支 `research/pi-subagent-candidates`（worktree `E:/Developer/myhub/wt/pi-subagent-candidates`，commit `b5c903f`）已推送 origin（`origin/research/pi-subagent-candidates`，新建分支，未开 PR、未合并）。
  - 主报告（绝对路径）：`E:/Developer/myhub/wt/pi-subagent-candidates/.scratch/model-cost-pi-migration/research/02-pi-subagent-candidates-report.md`
  - 逐候选深挖：同目录 `research/candidates/{pi-subagents,tintinweb-gotgenes-workflows,background-tasks-group,fleet-runtime-group,process-boundary-group}.md`
  - 原始证据：同目录 `research/{search-scope.json,search-scope-focus.md,npm-metadata.json,top70-metadata.json,pidev-package-pages.json}`

## Question

哪些 pi 子代理扩展值得作为当前 OMP 子代理能力的提供方？各候选现有可用接口能覆盖哪些能力，剩余缺口是否需要新增公开接口、上游贡献、私有依赖或 fork，分别有什么证据和维护/兼容性前提？

记录候选发现范围及筛选原因；按当前源码 revision/版本逐项分类为已证实覆盖、可经适配覆盖、需修改上游、未覆盖或证据不足。包括子会话事件/身份与用量可见性、进程边界、后续执行及耗时等基线实际要求，并记录安装方式、授权许可、版本与发布现状。不得承诺绝对穷尽市场或仅因工具能启动子代理而宣称完整覆盖。

## Comments

用户允许考虑补接口/向上游贡献，但最终选哪个扩展以及如何取舍由用户决定。本票仅产出事实和候选比较，不作选型批准。

- 2026-10-16 CandidateResearch：研究交付完成并 resolve（事实与比较，不含批准）。要点供 ticket 03/04 引用：
  - 提供方分档：只有 `pi-subagents`(nicobailon, v0.78.0, MIT) 与 `@gotgenes/pi-subagents`(23.4.0, MIT) 给第三方扩展**可导入/版本化的公开契约**；tintinweb/esso0428/arhen 只有事件频道；herdsman 有版本化文件邮箱但不可 import；background/better/durable 走 CLI/JSON/文件；cowboy 不产生任何会话或用量事实。
  - 没有任何候选提供 OMP 式的「agent 注册表 + 每 execution 读数 + round 边」；最接近者：pi-subagents（`runId/childId`+`durationMs`+8 值状态+owner 会话）、pi-durable-subagents（`wid/key/gen/exec`+active 时间+`main:<sessionId>`，且 `follow-up` 开新 generation 最像保活后续执行）、pi-herdsman（`ownerSessionId/piSessionId/piSessionFile`）。
  - 一致缺口（全部候选 + pi 本身）：turnId、请求时刻目录价、http status/responseId、round 记录、`getAsyncJobSnapshot` 式的异步 job 静默判据、viewed session 事实、跨 owner 的 session scope 观察（根因：`pi.events` 每 `ResourceLoader` 一份）。
  - 外部前提：herdr ≥0.8 与 Linux/macOS（cowboy/herdsman）；Node 地板差异；许可需澄清的包（workflows 无 LICENSE 文件且无仓库、pi-task 为 AGPL、maestro-flow/selesai-code 无 license）。
