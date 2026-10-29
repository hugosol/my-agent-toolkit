# manager-chat / node-chat 部署与故障处置

本文面向部署与维护。工具参数、响应字段和语义的唯一 toolkit 参考是 [README](README.md)；本文提供操作顺序与核对点，不另立协议。术语见 [GLOSSARY](GLOSSARY.md)。无需临时 spec、讨论或实施票据即可使用这些说明。

## 1. 准备与独立装配

1. 选择一个固定的 toolkit 提交和锁文件，部署完整源码 checkout，在其根目录运行 `bun install --frozen-lockfile`。保留 `framework/`、`adapters/`、`extensions/workflow-chat/`、`entrypoints/`、`package.json`、`bun.lock` 和已安装依赖；入口不是可独立复制的脚本。不要复制其他进程的 `framework/.runtime` 或原生 Session 数据到新部署。升级前保留旧提交和部署配置，在隔离数据上复验；不要在活动 Run 中途切换定义、Task 或源码。
2. 使用可运行的 omp 安装。版本支持以 [Harness support](../../framework/docs/harness-support.md) 为准，机器基线见 [harness-baseline.json](../../framework/docs/harness-baseline.json)。本指南的演练使用隔离 omp 18.5.0；不能由此推断所有版本、OS 或 pi 支持。两角色当前只有 omp 入口。
3. 在部署 checkout 的 [config.yaml](config.yaml) 配置 endpoint 和两个预算，见 [稳定配置](README.md#稳定配置)。endpoint 指向实际 herdr-bot 服务，不能指向另一个 Run 的测试服务。配置装配按入口所在仓库定位，不按节点 cwd 查找；修改后重启对应 Session 进程。不要以环境变量或复制 cwd 配置代替它。
4. 在 herdr-bot 部署中找到 `[tasks].metadata_file` 实际使用的 Task 选项目录。将 manager/node 的固定扩展条目分别指向本次部署的绝对入口；不要改成 selectable，也不要让一种角色混载两份角色入口。以下为 TOML 片段，替换示例根路径后写入**实际目录**，不是新增 toolkit 配置：

   ```toml
   [[extensions]]
   id = 'omp-manager-chat'
   label = 'manager-chat'
   agent = 'omp'
   kind = 'fixed'
   taskType = 'manager'
   entrypoint = 'D:\service\my-agent-toolkit\entrypoints\omp-auto\manager-chat.ts'

   [[extensions]]
   id = 'omp-node-chat'
   label = 'node-chat'
   agent = 'omp'
   kind = 'fixed'
   taskType = 'node'
   entrypoint = 'D:\service\my-agent-toolkit\entrypoints\omp-auto\node-chat.ts'
   ```

   目录的 schema、服务配置与 Run 生命周期由后端维护。后端 checkout 的长期入口是 `docs/workflow-runtime.md`（公开 HTTP、记录与操作）和 `meta-data/task-options.toml`（目录实例），不需要其临时工作票。保留原部署所需 Herdr 官方状态/会话引用上报项；加载角色扩展不替代它们。无需加载 connect-bot，也不进行面板登记连接。
5. manager 类型 Task 固定管理职责，node 类型 Task 固定执行与报告职责，均选择 omp；确认没有 autoResume。由 scheduler 正常创建 Run 并建立真实原生 Session 关联。后端的稳定 `run_instructions` 应指向其已部署的 `docs/workflow-runtime.md`，运行输入提供可读的 Map、说明及三份记录绝对路径。具体输入分工见 [首次指引与输入边界](README.md#首次工具指引与输入边界)。不要把工具指引再复制进 Task.prompt，也不要把整张 Map 或 Run user_input 自动传播给 node。
6. 自动装配分别来自 [manager 入口](../../entrypoints/omp-auto/manager-chat.ts)、[node 入口](../../entrypoints/omp-auto/node-chat.ts) 和公共 [auto.yaml](../../entrypoints/startup/auto.yaml)。这里只消费所加载角色的启动策略，不会因文件列出两种角色就加载另一种。manager 应有 `run`/`collect`，node 应有 `report`；首次启用指引由公共 Prompt 提供。普通轮次不重复注入；切换 owner 不会重新消费进程级自动启用。记录过的启用值优先，不能靠重复加载入口重置它。

仅检查独立加载可在两个独立进程分别运行以下命令；它们**不会创建合法 Run 关联**，无关联错误不是要伪造 sessionId 的理由：

```text
omp -e D:/service/my-agent-toolkit/entrypoints/omp-auto/manager-chat.ts
omp -e D:/service/my-agent-toolkit/entrypoints/omp-auto/node-chat.ts
```

## 2. 上线核对与预算

- 在合法关联的管理者 Session 显式 `run {"action":"status"}`，核对 Run 现场和角色；节点在材料可交接时显式 report。模型只传业务参数，真实 `sessionId` 由公共 Session 加入；完整协议以 [run](README.md#run-基础状态动作)、[collect](README.md#collect-长等待与报告待办)、[report](README.md#report-协议与交接) 为准。
- 普通预算覆盖请求至完整正文，不只是连通或响应头。普通预算默认 30000ms；collect 独立默认 5460000ms，覆盖后端默认 5400 秒再留 60 秒余量。不要为了普通 report 调短 collect，也不要把所有普通调用都改为 91 分钟。后端改期时人工核对客户端预算，无自动握手。
- collect 的正常 `reason: "timeout"` 不是错误，也不修改状态；客户端 `error.kind: "timeout"` 是完整传输预算耗尽。paused/completed/notification/no-running 的处理和待办查阅见 README。collect 不返回报告正文；按 pendingReports 的标识读取 messages.jsonl 或已有 Run 详情，再读材料。
- 取消、网络/正文失败或非 2xx 不是回滚保证。保留整个错误正文、已发生 effects、逐项结果、historyError/stateCommitted；HTTP 200 也不能概括整批成功。故障分类与 Session 结束语义见 [故障、取消与信任边界](README.md#故障取消与信任边界)。

## 3. 先查事实，再明确动作

所有恢复都从 `status`、已有 Run 详情、原 Chat 与真实材料开始，记录所见事实；以下是选择规则，不是自动执行脚本。

| 现场 | 维护操作与核对 |
| --- | --- |
| 无关联、错误角色、歧义或入口缺失 | 对照固定 Task 类型、绝对路径、后端派发现场及原生 Session 关联。保留后端拒绝，不用名称/cwd/Owner key 猜身份，不补建连接。 |
| 派发失败且可能已创建 Chat | 检查 failure.stage、effects 和原 agent；显式 reconcile_dispatch，按人工核实选择 uncertain/not_created/created。不能用 retry 跳过核实，不能将错误当成所有目标都未执行。 |
| 执行 failed，已修复且原 Chat 可继续 | 显式 recover 并提供 confirmed=true 与真实依据；核对执行 ID/Task/zone/Chat 不变。它只恢复跟踪，不启动、Resume 或补发输入。paused 下也可 recover。 |
| 执行 failed，必须独立重做 | 先查旧 Chat/材料和副作用并确认另起执行；running Run 才能显式 retry，提供 confirmed=true 和依据。核对新执行、新 Chat、旧历史/产物仍在；paused 时先作明确 resume 决定，resume 本身不派发。 |
| 工作已可真实交接，包括人工补齐 | 读取材料并核实地址、用法、限制和新旧执行归属，把人工依据写入 complete.reason 后显式 complete。不能用旧执行报告冒充新执行，也不伪造报告。complete 解除依赖但不派发下游、不终止原 Chat；允许无害收尾。 |
| report saved=true，notification.failed | 保留报告 ID 与失败原因；管理者 collect 并按 ID 读取已保存报告和材料。不要仅为通知失败重报；通知 submitted 也不证明管理者已读。报告/停轮/退出都不是 completed。 |
| 取消、断线或预算到期，结果不确定 | 重新显式查询现场，核对状态、报告 ID、执行关联及外部效果；不要立即重复变更或报告。新调用是人的新决定，不是客户端自主重试。 |
| stateCommitted=true 且 historyError | 当前状态已提交，保留可得历史错误并排查存储；不为补历史重做动作，不直接改写运行记录来伪造成功。 |

完整动作的准入、字面参数样例和拒绝含义见 [派发与恢复](README.md#run-批量派发与故障恢复)。人工读取材料是交接判断，不是仅检查字符串中有没有路径。

## 4. 同机信任与安全边界

`sessionId` **不是秘密认证凭据**。公共 Session 避免模型随意指定身份，但不是抵御恶意同机进程的认证层；后端同机来源限制也不是认证。沿用同机进程可能冒用身份的信任边界，不提供新增 token、远程授权、跨租户隔离或网络加密保证。不要把服务直接暴露到不受信任网络；真实 Chat 身份、请求与报告材料应按部署的本机访问策略保护。端口可连通或工具可加载不证明安全隔离或后端角色关联成立。

## 5. 隔离配置与处置演练（S1 技术验收）

此流程不修改生产服务、全局 omp 或生产 Run。公开 seam 是交付入口加载后的真实 omp 工具及后端公开详情。通过已有 dock 配置独立复制的源码和 YAML、隔离 Session/agent 数据、随机回环端口及后端临时 Run 数据；provider 与外部 Herdr CLI 是受控边界。不要改用内部函数调用或伪造状态对象替代这些观察。

前提：Bun 依赖已安装；有与当前协议配套的 herdr-bot checkout 和 Rust 工具链。在该 checkout 根执行：

```text
cargo build --manifest-path backend/Cargo.toml --example safe_shutdown_shell --bin herdr-fixture
```

再回到**将运行测试的 toolkit checkout 根目录**执行。即使另一份隔离部署已经安装依赖，也不能代替本 checkout 的 `node_modules/yaml`；因此先在这里安装锁定依赖。以下为 PowerShell 示例，替换 HERDR_BOT_REPO，证据目录每次使用新名称；环境变量只供测试定位后端/保存证据，**不是角色业务配置**：

```powershell
bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Install dependencies in this rehearsal checkout first' }
$env:HERDR_BOT_REPO = 'D:\source\herdr-bot'
$env:WORKFLOW_PROMPT_EVIDENCE_DIR = Join-Path $PWD ('.scratch/manager-node-chat/evidence/operations-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $env:WORKFLOW_PROMPT_EVIDENCE_DIR | Out-Null
bun test tests/harness-dock/role-guidance-rehearsal.test.ts 2>&1 | Tee-Object (Join-Path $env:WORKFLOW_PROMPT_EVIDENCE_DIR 'rehearsal.log')
if ($LASTEXITCODE -ne 0) { throw 'Rehearsal failed; inspect the retained evidence' }
bun test tests/harness-dock/node-report.test.ts tests/harness-dock/manager-collect-budget.test.ts 2>&1 | Tee-Object (Join-Path $env:WORKFLOW_PROMPT_EVIDENCE_DIR 'configuration.log')
if ($LASTEXITCODE -ne 0) { throw 'Configuration/budget check failed' }
```

按以下独立判据审阅真实结果，而非仅看退出码：

1. **配置与角色**：manager/node 独立部署，分别写入真实 endpoint、普通 2000ms 和 collect 5460000ms；node cwd 的故意错误配置不能取代部署配置。首次 Prompt 包含对应角色指引。预算 dock 另以 1 秒后端期限，比较普通 60ms/collect 3000ms 的正常到期与普通 3000ms/collect 200ms 的客户端预算错误。
2. **保存但通知失败**：实际创建 UTF-8 材料，经 node report 保存且外部 CLI 拒绝通知。manager collect 返回 notification，pendingReports.A 与保存报告 ID 相等；公开详情中报告恰好一份、A 仍 running，实际读取材料。
3. **recover 与 retry**：执行 failed 后 confirmed=false 必须拒绝；人工补齐/核实后 recover 保留原 execution。再次 failed 后，未确认 retry 与 paused 下 retry 分别拒绝；明确 resume 后 confirmed retry 产生不同执行 ID，旧执行和输出仍保留。
4. **人工真实交接**：独立重做后人工实际写入并读取材料，在 complete.reason 写入地址、用途、限制及人工依据；观察 completed 且不伪造新报告。这里是 Agent/测试控制的人工处理样本，不是假称真实模型生成的材料。
5. **证据与复验**：保存命令、退出码、环境、实际步骤和观察，检查 `guidance-rehearsal.json`（实际注入指引、工具结果、HTTP、外部 CLI 调用）。Prompt 专用 dock 的原始请求/Session 保留规则见 [验证入口](README.md#验证入口与已验证范围)。诊断到问题时先修正文档或所属实现，再跑受影响检查；行为改动按 [测试约定](../../docs/agents/testing.md) 跑所属分区/相应 smoke，TypeScript 改动再跑 typecheck。纯文档修改检查本地链接、锚点和示例，不要求用全仓测试代替技术核对。

原始证据可能包含材料地址、Session 信息和请求全文，按本机访问策略保存，不作为公开安全样例。每次部署须运行自己的检查，历史结果不能自动认证新环境。

## 6. 证据能证明什么

上述检查实际运行隔离 omp、公共 Session/HTTP、真实后端路由/存储与真实材料读写；受控 provider 指定工具调用，记录型 Herdr CLI 提供身份和外部故障，不是真实 Herdr 自主启动模型。它们证明受控情境下的配置、协议呈现和处置步骤，不证明模型自主选择/报告质量、任意网络条件、无限期无重试、生产部署或其他宿主支持。

技术验收不是 H1：独立汇总仍需整体使用判断；不把用户判断当作免做配置、技术核对、文档修正或复验的理由。取消、部分效果及其他专题的已验证范围统一见 README，版本支持结论统一见 Harness support，不由本指南重复提升。
