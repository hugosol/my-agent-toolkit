# 双角色装配、身份、配置与隔离证据

2026-10-29 的 S1 验证与 P5 非运行架构审查。复核入口是仓库长期测试，不依赖临时 spec 或票据目录。此记录只证明下列技术行为，不是实际模型完成 A/B→C 工作或人工最终使用判断。

## 环境与隔离

- Windows 10.0.26200 / win32 x64，Bun 1.4.2；toolkit 基于 `ca5bfb6`，加本记录对应的验收测试与 dock 支持变更。没有改动角色生产实现、后端、宿主或集成工作区。
- 实际运行 `@oh-my-pi/pi-coding-agent@18.5.0` 隔离安装的 `src/cli.ts`，`OMP_TEST_VERSION` 未设置。使用包内 `pi-natives-win32-x64/pi_natives.win32-x64-baseline.node`，不是源码 checkout 启动，也不是模拟注册。
- 每个 dock 各有临时 agent-state、Session JSONL、cwd、provider captures 和部署副本；只复制交付源码/配置及 YAML 依赖。实际 argv 为 RPC、`--no-extensions`、显式角色入口与受控 provider；身份观察场景另加一个无工具、无网络、只读公共 Session 事实的 witness。没有加载 connect-bot。
- 后端是 `E:/Developer/myhub/herdr-bot` 的隔离 `safe_shutdown_shell.exe`，每次随机端口、临时 Task/Map/Bot/Run 数据；外部 Herdr 命令由记录型 `herdr-fixture.exe` 控制。它返回已经实际运行的 OMP Session ID，**不证明真实 Herdr 启动了 OMP**。
- 后端 source anchor 为 `005bad373db779639cf384e57d205423fb6cec1e`。执行二进制的 SHA-256 分别为：
  - safe_shutdown_shell：`780c7239c4c6d60245ffd1c0baba765d0d9831ae41d39e2a1ce5f922504ae12e`
  - herdr-fixture：`f48171da3fb6a56c0e20cdd994bc5275fa689320b7aeb5dc84feef767df1bb2b`
  这是执行产物标识；没有据 source anchor 推断产物可重现构建。

## 验收观察

所有工具都通过实际 OMP loader 和原生执行调用；provider 只选择独立字面调用，不替代角色、公共 Session、HTTP 或取消机制。

| 承诺 | 长期复核用例 | 可观察证据与范围 |
| --- | --- | --- |
| P1 | [`role-identity-integration.test.ts`](../../../tests/harness-dock/role-identity-integration.test.ts) | 分别加载交付 manager/node 自动入口，没有先发启用命令；实际模型工具集合分别只有角色的 run/collect 或 report，实际持久化身份分别为 `manager-chat:tools` / `node-chat:tools`；三个工具均实际调用。 |
| P2 | 同上 | 未加载 connect-bot，真实后端接受实际 manager status/dispatch/collect 与 node report；完整外发路径只有 workflow 路由，没有登记/心跳/上报路由。测试自己打开一次后端 SSE 读快照，核对面板登记 Session 列表为空；该只读连接不是扩展额外建立的上报连接。 |
| P3 | [`role-session-isolation.test.ts`](../../../tests/harness-dock/role-session-isolation.test.ts) | 两个不同原生 ID 的独立实际 OMP Session 同时到达被扣住的 HTTP 正文；通过原生 RPC abort manager，观察其真实 socket 关闭与 cancelled 工具结果；node 仍保持连接并取得完整字面响应。随后两 Session 的显式独立调用均成功，核对每次请求的身份和次数。这里 HTTP 响应受控，不宣称该场景证明真实后端业务效果；真实后端接通另由 P2 证明。 |
| P6 | identity integration 与 [`role-missing-identity.test.ts`](../../../tests/harness-dock/role-missing-identity.test.ts) | RPC 原生 ID、公共 Session witness 的实际 Owner key、实际显示名和 cwd 故意不同；逐请求只发送原生 ID。实际工具 schema 没有模型填写的 Run、execution、接收者或身份归属字段。无关联、节点歧义、管理者歧义和跨角色调用保留真实后端的 HTTP 403、code、message。健康派发会拒绝重复身份，因此歧义只在**隔离测试后端的持久化文件**中注入，后端真实读取/解析/归属判定不被替换；不声称正常派发能产生该损坏状态。 |
| P6 缺失身份 | missing identity 同上 | 健康 OMP 总有工具上下文身份；专用 fixture 仅将这个外部原生事实变为空字符串，实际加载、原生注册、角色代码、公共 Session 观察与 HTTP 保持真实。保留有效显示名、cwd 和原始 Session 事实；run/collect/report 均返回 `session-unavailable`，trap endpoint 收到零请求。这个故障注入不是自然发生过的宿主丢失身份事件，也不冒充 P1 的独立入口加载证据。 |
| P7 | [`role-stable-config.test.ts`](../../../tests/harness-dock/role-stable-config.test.ts) | 两个不同临时 cwd 和部署内两个 ID 推导目录均放置可解析的错误 endpoint/1ms 预算配置。两角色仍访问明确部署 endpoint，延迟约 90ms 的完整响应成功；扣住正文后普通预算 700ms、collect 1600ms 分别真实断连并返回 timeout，不误用 1ms 或交付默认预算。测量从 endpoint 收到请求到真实 socket close，排除 provider/loader 时间；原生子进程时钟不能由测试假时钟推进。 |
| P8 | [`role-config-failures.test.ts`](../../../tests/harness-dock/role-config-failures.test.ts) | 两角色各自独立覆盖文件缺失、不可解析 YAML、非法业务毫秒预算；实际宿主报告带角色 ID、configuration、真实 workflow-chat 路径及具体原因的错误。即使 cwd 和 ID 默认目录中有有效配置，也无 fallback HTTP、无角色工具注册。测试同时断言明确失败诊断，绝不把未启用或空结果本身当成功。 |

用例输出原生身份、Owner key、cwd、实际请求、后端报告归属、拒绝正文、预算断连测量和配置诊断。端口、临时路径和业务标识每次重新生成，不把某次时序作为性能承诺。

## P5：独立的非运行架构审查

审查依据为共享源码 ADR、公共 Session/HTTP interface 与以下完整角色源码，不以运行成功代替依赖审查。

1. **发现入口薄**：[`manager-chat.ts`](../../../entrypoints/omp-auto/manager-chat.ts) 与 [`node-chat.ts`](../../../entrypoints/omp-auto/node-chat.ts) 都只有文档注释及到对应角色装配的 default re-export。没有参数校验、请求、Run 协议或状态业务。
2. **依赖方向**：两个 [`*-definition.ts`](../../../extensions/workflow-chat/manager-definition.ts) / [`node-definition.ts`](../../../extensions/workflow-chat/node-definition.ts) 只依赖 framework 声明及 [`common/config.ts`](../../../extensions/workflow-chat/common/config.ts)；两个 [`harnesses/`](../../../extensions/workflow-chat/harnesses) 依赖自身声明、common requests、公开 framework interface、公开 omp adapter 与 Node 路径工具。common/config 只依赖公开配置类型；[`common/requests.ts`](../../../extensions/workflow-chat/common/requests.ts) 只依赖公开 ImplementationContext 和 [`general/http`](../../../framework/interface/general/http.ts)，不反向导入角色。完整 import/re-export 清单已逐项审查，不存在角色互相依赖。
3. **framework 不认识 Run 协议**：对 `framework/**/*.ts` 与 `adapters/**/*.ts` 检查 `workflow-chat|manager-chat|node-chat|/api/workflow|runId|executionId`，无命中；角色只通过公共 Session observation 读原生身份，公共 HTTP 负责完整传输、预算与取消。业务 action、路由与结果归属保留在角色目录。搜索是补充；同时审查了完整角色依赖及公共 HTTP 出口，未把单次词搜索当成所有架构性质的证明。
4. **无复制的 connect-bot 私有客户端**：角色没有 connect-bot import。对照其 [`shared-logic/panel/client.ts`](../../../extensions/connect-bot/shared-logic/panel/client.ts)，登记 envelope、register/heartbeat/state/unregister 和 panel receipt 不进入 workflow-chat；两者各自消费同一个公开 HTTP interface，而不是把 panel 客户端复制或暴露为角色客户端。
5. **common 有实际深度，没有空层**：config 持有两 ID 必须共享的明确文件定位与字段契约，两个声明都消费它；requests 持有两角色共用的真实身份检查、完整预算选择、每 Session AbortController 资源、工具取消/结束合并、JSON/非 2xx/不确定结果保真。两个角色在各自 implementation factory 中创建 requests，不共享全局 Session 身份或 controller。没有新增通用工具平台、虚设协议 port、纯转发目录层或后端状态机。
6. **职责界限**：manager 装配只注册必要原生工具、严格整理对应 action 参数并呈现后端结果；node 只提交 body 和原生身份。无自主重试、状态推导、自动派发或归属猜测。装配以 `import.meta.url` 定位仓库根，明确选择公共自动启动策略；配置机制、Session 生命周期、Prompt 历史和 HTTP 都复用既有 framework，而不是角色另造机制。

结论：上述源码满足 P5 依赖与职责约束，本轮未发现需修正的生产实现缺陷。此票新增的是跨角色长期验收与可复核证据，不通过制造产品变更伪造 red。

## 复核命令与边界

```text
bun test tests/workflow-chat
bun test tests/harness-dock/role-identity-integration.test.ts tests/harness-dock/role-session-isolation.test.ts tests/harness-dock/role-stable-config.test.ts tests/harness-dock/role-config-failures.test.ts tests/harness-dock/role-missing-identity.test.ts tests/harness-dock/role-prompts.test.ts tests/harness-dock/role-guidance-rehearsal.test.ts tests/harness-dock/node-report.test.ts tests/harness-dock/manager-state-actions.test.ts tests/harness-dock/manager-resume-finish.test.ts tests/harness-dock/manager-dispatch-recovery.test.ts tests/harness-dock/manager-collect-budget.test.ts tests/harness-dock/manager-collect-pending.test.ts tests/harness-dock/manager-collect-lifecycle.test.ts tests/harness-dock/uncertain-effects.test.ts tests/harness-dock/consumer-regression.test.ts tests/harness-dock/baseline.test.ts
bun test tests/framework/http.test.ts tests/framework/http-cancellation.test.ts tests/framework/http-collect-budget.test.ts tests/framework/http-collect-termination.test.ts tests/connect-bot
bun run typecheck
```

本次在上述隔离 worktree 顺序完成，测试期间源码与 fixtures 未变化：

| 实际检查 | 结果 |
| --- | --- |
| workflow-chat 所属分区 | 14 文件，15 pass / 0 fail，315 assertions；29.05s |
| 上列 17 个真实宿主 dock / baseline / 受影响 dock 消费者 | 43 pass / 0 fail，663 assertions；120.23s |
| 上列公共 HTTP 与 connect-bot 消费者分区 | 26 文件，203 pass / 0 fail，1223 assertions；113.41s。日志中的 transport/cancelled/timeout failure 是故障用例的预期诊断，不是失败测试。 |
| TypeScript 与 authoring | `bun run typecheck` 退出 0；authoring 67 文件、6 declarations、0 diagnostics |
| P5 非运行审查 | 上节逐项源码/依赖审查通过；没有用测试通过替代此项 |

其中新增 S1 用例共 11 个。实现本已满足这些条件，因此验证既有行为，没有为制造 red 故意破坏产品；初期运行中修正了测试 fixture 对真实后端错误 envelope、OMP 成功帧省略 `isError=false` 和后端拒绝重复原生身份的错误假设，保持后端协议权威与验收条件不变。初次 typecheck 发现本仓库目标库不含 Array.at/findLast，已按既有目标迁移数组访问，最终 typecheck 通过。首次运行前 worktree 尚无依赖，已用 `bun install --frozen-lockfile` 安装；不是产品失败或成功行为证据。没有运行全仓 `bun run test`，不宣称全仓回归通过。

一次真实后端样本：manager 原生 ID `01a18447-fce8-757e-a43e-2349c0d5d701`，实际 Owner key `main:01a18447-fce8-757e-a43e-2349c0d5d701`；node 原生 ID `01a18448-02b6-739d-815f-d56dfab27c92`，Owner key 同样带独立 main 前缀。Run `bc-f260b2c0e11d` 的实际报告为 `bc-540337febda0`，执行 `bc-e47943411149`，source/target 分别保留 node/manager 原生 ID。无关联、歧义与跨角色的实际 code 分别保留 `manager-unassociated`、`node-unassociated`、`manager-ambiguous`、`node-ambiguous`、`node-role-invalid`，不由客户端重写归属。

配置、原生身份缺失和时序故障使用受控外部条件；真实宿主加载、工具执行、公共 Session、真实传输和资源关闭不被替换。真实后端接通使用安全壳及隔离数据，不修改生产后端或启动真实用户 Chat。以上证据不证明真实模型工作质量、不替代真实 Herdr 启动模型、P28 汇合演练、P4 静态多声明检查所有权或 H1 人工最终判断。
