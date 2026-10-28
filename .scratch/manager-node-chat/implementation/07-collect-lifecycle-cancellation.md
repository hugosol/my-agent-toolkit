# 07: 真实等待取消与终止原因

**What to build:** 实际 omp 的工具中断或 Session 结束能取消在途 collect，释放真实连接和后端等待；管理者能区分正常到期、主动取消、客户端超时与传输／解析失败。通过 S1、S2 交付。

**Delivers:** P19、P21

**Blocked by:** 01：公共 HTTP 全请求取消与兼容；06：collect 长等待与报告待办

**Status:** in-progress

依据：[获批契约](../contract.md)及其继承的 spec。仅交付 toolkit，不修改后端、不新增自主重试或第二套状态机。

## Acceptance criteria

- [x] 将工具取消与对应 Session 生命周期接入公共 HTTP 取消，覆盖真实 omp 工具中断与 Session 结束两条路径，均包含响应头已到但正文未完成的场景。
- [x] 观察实际连接结束和后端等待释放，后续报告仍可由新 collect 收取；本地提前返回或受控 HTTP 断线不能单独充当真实宿主证据。
- [x] 独立控制正常后端到期、调用方取消、客户端预算耗尽、传输失败及 JSON 解析失败，终止原因可辨识。
- [x] HTTP 200 响应头后断流、非法 JSON、不完整正文不得变为成功快照或正常 timeout。
- [x] 终止竞争时如实呈现实际采用原因，不新增全局优先级或伪造快照；取消技术实现与验证均由 Agent 完成，不留给 H1。
- [x] 保留真实环境、命令、连接／等待观察证据；执行所属分区、对应真实宿主 dock 及 TypeScript typecheck，更新取消与限制说明。

本票独占 P19、P21 完整测试。01 拥有公共传输各阶段资源清理与消费者兼容；08 拥有错误／取消后的有界请求次数与后续显式调用检查；10 拥有两个 Session 之间的并发取消隔离检查。

## Execution evidence

实现与本票验收已完成，待独立集成；按仓库约定尚未合入 dev 时保留 `in-progress`，不把代理完成等同于已合入。

- Seam：S1 实际 manager 自动入口、原生 OMP 工具与 Session；S2 已发布公共 HTTP。复用 01/06 已交付的工具/Session 信号连线及请求分类，不新增状态机、业务客户端或重试。
- P19：`tests/harness-dock/manager-collect-lifecycle.test.ts` 分别通过真实 `abort`、`new_session`、stdin 正常 shutdown 触发取消。真实后端期限及客户端预算均为 30 秒，TCP 观察器等待真实 200 头完整转发后才允许触发宿主操作；三个场景正文均为 0 字节，客户端/后端 FIN 分别为 3/3、4/4、5/5 ms。恢复原 Session（shutdown 还重启宿主）后，真实报告 `bc-1fecbf76e0d8`、`bc-761020ce1e44`、`bc-de7d12662440` 分别被新 collect 以 notification 和对应 pendingReports 收取，A 仍 running。完整输出：`artifact://330`；长期说明同步于 `extensions/workflow-chat/README.md`。
- P21：`tests/workflow-chat/manager-collect-termination.test.ts` 通过真实工具独立控制后端正常 timeout、caller cancelled、客户端 timeout、响应前断线、200 后断流、不完整 Content-Length、非法 JSON。错误不含伪造 reason/snapshot。`tests/framework/http-collect-termination.test.ts` 验证竞争与已采用结果的错误身份，不规定取消与异步 socket 失败的全局顺序。
- 环境：Windows x64、Bun 1.4.2、默认记录的隔离 omp 18.5.0；真实后端使用 helper 默认 `../herdr-bot/backend/target/debug/examples/safe_shutdown_shell.exe`，外部 Herdr CLI/provider 受控，数据/配置独立。未修改后端或集成工作区。

实际运行（最终相关源码）：

```text
bun test tests/workflow-chat
# 11 pass / 0 fail，195 assertions，artifact://315
bun test tests/harness-dock/manager-collect-lifecycle.test.ts tests/harness-dock/manager-collect-budget.test.ts tests/harness-dock/manager-collect-pending.test.ts tests/harness-dock/manager-state-actions.test.ts tests/harness-dock/manager-resume-finish.test.ts tests/harness-dock/manager-dispatch-recovery.test.ts
# 15 pass / 0 fail，292 assertions，artifact://330
bun test tests/framework
# 725 pass / 0 fail，3905 assertions，artifact://324
bun run typecheck
# exit 0；Authoring 67 files / 6 declarations / 0 diagnostics
```

TDD 敏感度：现有产品连线初次行为验证已通过，未为制造 red 改写承诺。临时移除请求的两个取消信号后，真实 abort 测试于 30031ms 才释放，明确失败于 `<5000ms` 断言；恢复后上述最终 dock 全绿。仅移除 Session 信号的探针仍通过（宿主 shutdown 亦发出工具取消），不声称该探针单独隔离了两个取消来源。首次缺依赖、测试语法及类型设置错误均已修复，不作为行为 red 证据；未留下变异或脚手架。

限制：真实 Session 转移时 OMP 丢弃旧工具反馈，测试不伪造该反馈；shutdown 实际返回 cancelled / Session ended，abort 返回 cancelled / Interrupted by user。通过双向 FIN、未等满期限及后续报告收取观察等待响应释放，不测量后端内部 watch 数量；受控 provider 不证明真实模型决策、后端回滚或无限网络保证。本票无剩余技术验收事项，未运行全仓库总入口，交由独立集成代理执行集成验收。
