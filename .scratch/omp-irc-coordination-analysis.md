# OMP 会话 IRC 测试协调分析

目标会话：🎟️ PI: Execute Pi adapter refactor tickets

会话 ID：01a16974-667a-73dd-92c1-e46990e3cb2d。

## 结论

不是二选一：子代理基于本票验收要求、仓库测试协调规则和 OMP 提供的同伴名单主动申请测试窗口；主代理随后明确广播测试顺序；子代理根据这些消息直接交接。没有证据表明子代理自动持有完整 Hyper 依赖图或全局测试队列。测试窗口在本次运行中属于消息约定，不是由 Hyper 执行的资源互斥锁。

## 历史证据

归档目录：`C:/Users/hugos/.omp/agent/sessions/--E--Developer-myhub-my-agent-toolkit--/`。

主记录 M：`2026-10-23T15-49-58-522Z_01a16974-667a-73dd-92c1-e46990e3cb2d.jsonl`。

子记录位于 M 的同名无扩展名目录。下表时间均为 2026-10-23 UTC，行号为 JSONL 物理行。

|时间|记录|证据|
|---|---|---|
|16:00:41|`01-migration-baselinemd-613cf8fd-b823-4dfb-880e-.jsonl:5`|初始 system prompt 含 IRC 用法与 peer 名单，此时只有 Main。task 只给单票、spec/contract 等引用，不给完整计划。|
|16:00–16:01|同子记录 `:23`|实际读取 docs/agents/testing.md，包含昂贵测试串行、与 peers 约定 quiet window 的规则。|
|16:01:12|同子记录 `:105`|模型主动调用 write agent://Main，申请独占昂贵测试窗口。|
|16:01:15|M `:179`|收到上述正文完全一致的 irc:incoming。此时还没有主代理测试队列广播。|
|16:55:25|M `:214`|04 报告与 integrate01 全局测试实际重叠，03 的释放被误当成机器空闲；反证窗口不是强制互斥。不能据此认定所有测试失败由重叠导致。|
|17:15:46|`integrate-01-migration-baselinemd-56921a7a-dc8b-.jsonl:274`；M `:219`|integrate01 主动广播释放窗口，要求 Main 统一安排。|
|17:17:11|M `:223`|Main 主动 write agent://all，明确顺序 02→03→05→04，并要求“按顺序直接通知下一位释放”。|
|17:21|`integrate-05-omp-lifecycle-subagentsmd-59ffdd3c-.jsonl:5`|初始 prompt 自动包含当时多个运行/空闲 peers、粗粒度 activity；task 自动要求本票全局测试。名单不是测试队列。|
|17:21:50|同子记录 `:45`|模型主动 write integrate02，申请窗口交接。|
|17:25:48|M `:270`|Main 明确要求 integrate05 联系 integrate02 确认释放，再通知 06/07。|
|17:40:21|上述 integrate05 子记录 `:93`|模型主动 write 06，通知昂贵窗口释放。|
|17:48:07|M `:297`|Main 再次广播固定队列，并要求没有收到明确释放者不得凭旧消息启动。|
|18:22:49|M `:320`|Main 更新为 integrate03→05→06→07→04。|
|18:23–18:41|M `:328,330`|integrate04 无法定位新 integrate07 ID，向 Main 求助；Main 补充具体 ID，要求直接交接。再次说明子代理不是全知。|

## 源码机制

以下是调查时当前工作树的机制证据；不把当前源码版本等同于历史版本。历史行为以上述归档为准。

W = `E:/Developer/myhub/oh-my-wayfinder`。
P = `E:/Developer/myhub/oh-my-pi`。

1. **Hyper 业务编排**：W `extensions/hyper-auto-coding/agent-tools.ts:67-70` 向主模型发 Phase 2 提示；主模型 plan/dispatch/collect/finish。W `extensions/hyper-auto-coding/workflow.ts:408-467` 保存依赖并构造单票任务，没有把完整 plan/blockedBy/全局测试队列传给子代理。`:467-473` 实现正常完成后自动开始集成。
2. **集成测试要求来源**：W `extensions/integration-node/ticket-integration.ts:67-80` 自动生成 integrate assignment，包含“只要求运行项目全局测试，通过前直接修复问题”，不包含窗口顺序。其措辞与历史 integrate05 task 对应。代码里提到“最后独立门禁”的文字不能单独证明工作流确实创建该 gate；agent-tools 当前明确不额外创建总体验收 gate。
3. **环境继承不等于对话继承**：W `extensions/hyper-auto-coding/subagent-host.ts:185-229,276-308` 派生运行环境并调用 runStructuredSubagent。集成角色定义 `:120-145` 明说 fresh child session、没有父对话。归档初始输入也直接支持该边界。
4. **自动 peer roster**：P `packages/coding-agent/src/task/executor.ts:341-392,3935-3973` 从 registry 采集 id/displayName/kind/status/activity 等字段并渲染 prompt；当前最多 32 个，parked 不展开身份。模板 P `packages/coding-agent/src/prompts/system/subagent-system-prompt.md:27-48` 自动解释 write agent:// 与广播用法、共享文件先协调等规则。没有 Hyper DAG、队列位置或测试资源锁字段。
5. **不是每轮全量同步**：上述 executor 的 roster 是构建 prompt 时的快照；warm revive 甚至有意复用旧 roster。P `packages/coding-agent/src/registry/agent-registry.ts:314-335` 更新 activity 不发 event；P `packages/coding-agent/src/session/session-tools.ts:1309-1323,2140-2168,2272-2312` 的 prompt 重建不是每轮无条件刷新 peers。可主动 read history:// 或 proc:// 查询；这仍不是自动接收 Hyper 测试队列。
6. **主动发送与自动投递**：P `packages/coding-agent/src/internal-urls/agent-protocol.ts:172-201` 接收模型 write 参数；P `packages/coding-agent/src/irc/messaging.ts:45-73` 发到目标。广播仅覆盖当时可见 live peers。P `packages/coding-agent/src/session/irc-bridge.ts:190-260` 负责投递/唤醒。当前 P `task/executor.ts:3053-3194` 还可能自动把被唤醒子代理的结果回送给唤醒者，因此不能声称所有 IRC 都必经模型 write；本报告列出的窗口申请、排队广播和接力已经在历史 assistant toolCall 中核实为主动 write。
7. **Git 串行不等于测试串行**：W `extensions/hyper-auto-coding/git.ts:304-322` 的 FIFO 锁保护 Git 合并操作；W `extensions/integration-node/ticket-integration.ts:68-80` 在 merge 返回后运行集成代理，并不以该锁包住整段测试。窗口约定并非自动强制的互斥。

## 取证验证

通过 Eval 实际解析主 JSONL 与四份子 JSONL，匹配第一次申请的发送正文与主会话收到正文，核对发送早于第一次主队列广播、初始 peer roster 内容，以及 integrate05→06 的主动交接 toolCall，全部匹配。未重跑历史开发任务或测试，也没有修改产品代码。
