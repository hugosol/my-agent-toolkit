# manager-chat / node-chat 部署与故障处置

本文面向部署与维护。工具参数、响应字段和语义的唯一 toolkit 参考是 [README](README.md)；本文提供操作顺序与核对点，不另立协议。术语见 [GLOSSARY](GLOSSARY.md)。无需临时 spec、讨论或实施票据即可使用这些说明。

## 1. 准备与独立装配

1. 选择一个固定的 toolkit 提交和锁文件，部署完整源码 checkout，在其根目录运行 `bun install --frozen-lockfile`。保留 `framework/`、`adapters/`、`extensions/workflow-chat/`、`entrypoints/`、`package.json`、`bun.lock` 和已安装依赖；入口不是可独立复制的脚本。不要复制其他进程的 `framework/.runtime` 或原生 Session 数据到新部署。toolkit 与后端必须配套升级至 input_rule/output_rule、outputs 数组与报告 from/to 契约；旧 Map、Run 与报告须先执行后端的一次性迁移并保留历史与状态，普通读写不兼容旧格式，不提供旧形状新请求放行；升级前保留旧提交和部署配置，在隔离数据上复验；不要在活动 Run 中途切换定义、Task 或源码。
2. 按 Task 选择可运行的 OMP 或 Pi 安装，并使用对应宿主的 auto 角色入口。Pi 独立验证基线为精确 1.4.0；具体环境与验证边界以 [Harness support](../../framework/docs/harness-support.md#pi-workflow-chat-verification-baseline) 为准。OMP 仍使用既有 [harness-baseline.json](../../framework/docs/harness-baseline.json)，历史 OMP 演练不能外推为 Pi 整体集成通过。
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

   [[extensions]]
   id = 'pi-manager-chat'
   label = 'manager-chat'
   agent = 'pi'
   kind = 'fixed'
   taskType = 'manager'
   entrypoint = 'D:\service\my-agent-toolkit\entrypoints\pi-auto\manager-chat.ts'

   [[extensions]]
   id = 'pi-node-chat'
   label = 'node-chat'
   agent = 'pi'
   kind = 'fixed'
   taskType = 'node'
   entrypoint = 'D:\service\my-agent-toolkit\entrypoints\pi-auto\node-chat.ts'
   ```

   目录的 schema、服务配置与 Run 生命周期由后端维护。后端 checkout 的长期入口是 `docs/workflow-runtime.md`（公开 HTTP、记录与操作）和 `meta-data/task-options.toml`（目录实例），不需要其临时工作票。保留原部署所需 Herdr 官方状态/会话引用上报项；加载角色扩展不替代它们。无需加载 connect-bot，也不进行面板登记连接。
5. manager 类型 Task 固定管理职责，node 类型 Task 固定执行与报告职责，分别选择所需的 omp 或 pi，不要求整张 Run 宿主一致；确认各宿主不会自动续接其他原生会话。由 scheduler 正常创建 Run 并建立真实原生 Session 关联。后端的稳定 `run_instructions` 应指向其已部署的 `docs/workflow-runtime.md`，运行输入提供可读的 Map、说明及三份记录绝对路径。具体输入分工见 [首次指引与输入边界](README.md#首次工具指引与输入边界)。不要把工具指引再复制进 Task.prompt 或自动复制整张 Map、上游聊天和文件正文；配套后端向 node 提供本次 userInput、业务 input 和命名输入地址。
6. OMP 自动发现入口是 [manager 入口](../../entrypoints/omp-auto/manager-chat.ts)、[node 入口](../../entrypoints/omp-auto/node-chat.ts)，Pi 对应 [manager 入口](../../entrypoints/pi-auto/manager-chat.ts)和 [node 入口](../../entrypoints/pi-auto/node-chat.ts)。启动策略来自公共 [auto.yaml](../../entrypoints/startup/auto.yaml)；角色声明位于 [manager-chat/definition.ts](manager-chat/definition.ts) 与 [node-chat/definition.ts](node-chat/definition.ts)，原生装配位于各自的 [manager omp harness](manager-chat/harnesses/omp.ts) 与 [node omp harness](node-chat/harnesses/omp.ts)。源码职责与依赖只在 [README](README.md#workflow-chat-源码职责与依赖) 维护。这里只消费所加载角色的启动策略，不会因文件列出两种角色就加载另一种。manager 应有 `run`/`collect`，node 应有 `report`；首次启用指引由公共 Prompt 提供。普通轮次不重复注入；切换 owner 不会重新消费进程级自动启用。记录过的启用值优先，不能靠重复加载入口重置它。

仅检查独立加载可在两个独立进程分别运行以下命令；它们**不会创建合法 Run 关联**，无关联错误不是要伪造 sessionId 的理由：

```text
omp -e D:/service/my-agent-toolkit/entrypoints/omp-auto/manager-chat.ts
omp -e D:/service/my-agent-toolkit/entrypoints/omp-auto/node-chat.ts
pi -e D:/service/my-agent-toolkit/entrypoints/pi-auto/manager-chat.ts
pi -e D:/service/my-agent-toolkit/entrypoints/pi-auto/node-chat.ts
```

升级已有 herdr-bot Run 存储时，节点执行新增必填 `agent` 字段；先停服、备份，再按后端长期运行说明的“执行宿主字段与旧 Run 升级”执行 `scripts/migrate-execution-agents.py`。它只为旧版 OMP 执行补明确宿主，保留原字节备份及追加历史；不要让新服务自动猜测，也不要直接编辑活动 Run。实际部署切换与整体模型协作验收由人工完成。

## 2. 上线核对与预算

- 在合法关联的管理者 Session 显式 `run {"action":"status"}`，核对 Run 现场和角色；节点遵守本次派发的 report_policy：auto 在材料可交接或需报告阻塞时显式 report，如实填写 can_complete，manual 先在 node Chat 展示摘要、交付地址和限制并询问、停轮，收到用户自然语言确认后再 report；旧派发缺字段按 auto。模型只传业务参数，真实 `sessionId` 由公共 Session 加入；完整协议以 [run](README.md#run-基础状态动作)、[collect](README.md#collect-长等待与报告待办)、[report](README.md#report-协议与交接) 为准。
- 普通预算覆盖请求至完整正文，不只是连通或响应头。普通预算默认 30000ms；collect 独立默认 5460000ms，覆盖后端默认 5400 秒再留 60 秒余量。不要为了普通 report 调短 collect，也不要把所有普通调用都改为 91 分钟。后端改期时人工核对客户端预算，无自动握手。
- collect 的正常 `reason: "timeout"` 不是错误，也不修改状态；客户端 `error.kind: "timeout"` 是完整传输预算耗尽。paused/completed/notification/no-running 的处理和待办查阅见 README。collect 不返回报告正文；按 pendingReports 的标识读取 messages.jsonl 或已有 Run 详情，阅读报告结论、阻塞、部分效果及必要干预；不默认读取输出正文验收。
- 取消、网络/正文失败或非 2xx 不是回滚保证。保留整个错误正文、已发生 effects、逐项结果、historyError/stateCommitted；HTTP 200 也不能概括整批成功。故障分类与 Session 结束语义见 [故障、取消与信任边界](README.md#故障取消与信任边界)。

### report_policy 真实模型冒烟（OMP 与 Pi 分别执行）

使用上节对应宿主的自动入口和合法后端派发，不在任意独立启动的无关联 Session 中伪造身份。升级共享定义后创建新 node Chat；已有 Chat 的持久化指引不热更新。

1. 在 Map 中给一个可独立交付的小任务设置 `report_policy: manual`，由 manager 正常 dispatch。任务示例：在指定绝对目录写一份 UTF-8 文本，正文为 `report-policy-smoke`，交付地址、读取方法和限制。核对实际派发输入有独立 `report_policy: manual` 控制段。
2. 等任务可交接：node Chat 应先展示摘要、绝对地址和限制、询问是否报告并停轮；从 Run 详情或 `messages.jsonl` 确认尚未新增 report。manager 不得仅凭等待确认就 complete。
3. 在该 node Chat 输入 `先将正文改为 report-policy-smoke-revised，不要发送报告`。检查实际文件已修改，模型再次展示交接信息、询问并停轮，仍未新增 report。然后输入 `确认，发送这份报告`，核对新增一份 saved report 及对应 execution，核对严格 boolean can_complete 和命名 outputs（如有）；manager 阅读报告作编排判断，最新 true 仅允许而不强迫其显式 complete，不默认读取成果正文。
4. 在 node Chat 要求补充或更正交接内容：再次观察询问与停轮；确认前报告数不变，输入 `确认发送补充报告` 后新增独立报告。辅助通知失败时不应仅因该失败重报。
5. 用新执行分别验证 `report_policy: auto` 与旧派发缺字段的输入：可交接后允许直接 report，再继续无害收尾。分别用 OMP/Pi 重复以上流程；保留实际输入、对话、文件和报告标识，不用受控 provider 的预设调用声称模型遵从了策略。

这些观察验证提示词行为，不代表 report_policy 是审批接口。report 使用 body、必填 boolean can_complete 和可选 outputs；不要新增审批状态，can_complete 不代替真实用户确认。配套升级 toolkit 与后端后，新请求旧形状明确拒绝；历史报告可读但缺声明不能首次完成。人工补齐也须当前执行最新 true 报告，不存在无报告人工完成旁路。

### 文件交接跨仓自动验收

配套 herdr-bot checkout 提供 `scripts/test-workflow-file-handoff.py --scenario roles`。从该 checkout 根运行，显式指定参与的后端构建产物、**本 toolkit worktree** 与专用隔离依赖根：

```powershell
$env:HERDR_BOT_REPO = $HERDR_BOT_WT
$env:CARGO_TARGET_DIR = Join-Path $HERDR_BOT_WT 'backend/target'
# 全仓 connect-bot/panel 回归有独立的既有定位参数，也必须关联同一后端源码。
$env:HERDR_BOT_BINARY = Join-Path $env:CARGO_TARGET_DIR 'debug/examples/safe_shutdown_shell.exe'
$env:HERDR_BOT_METADATA = Join-Path $HERDR_BOT_WT 'meta-data/task-options.toml'
# 临时 worktree 的 frozen-baseline 外部依赖仍需显式关联其原始记录根。
$env:OMP_BASELINE_RECORD_ROOT = 'D:/original-toolkit'
python scripts/test-workflow-file-handoff.py `
  --backend (Join-Path $env:CARGO_TARGET_DIR 'debug/herdr-bot.exe') `
  --toolkit $TOOLKIT_WT --scenario roles --paths-file 'D:/isolated-acceptance/isolated-paths.toml'
```

命令中的脚本位于 herdr-bot，不在 toolkit 内复制第二份 runner。完整依赖根/真实模型配置格式由该 checkout 的 `docs/agents/testing.md`“文件交接真实角色自动验收”维护。需要真实 Herdr、官方 Pi 状态扩展、实际 Pi 包、已安装锁定依赖的两个源码根、独立 Cargo target，以及**显式授权的专用真实模型配置与密钥环境变量**。不读取用户全局配置/Session，不用 bridge token 代替业务模型。缺依赖或模型访问失败时非零退出、保留错误，不跳过或声称通过。

此命令先运行本仓 `tests/harness-dock/node-report-contract.test.ts`（实际 OMP/Pi 宿主、受控 provider/外部 Herdr、真实后端）。覆盖 report 可发现与可调用、严格 true/false、缺声明、错类型、旧形状/多余字段拒绝且无报告保存、命名 outputs 与省略 outputs、公共原生 Session 的落盘归属。它验证参数不被宿主强转/删字段放行，**不证明真实模型职责遵从**。可单独从 toolkit 根运行：

```powershell
bun test tests/harness-dock/node-report-contract.test.ts
```

后端先构建 `safe_shutdown_shell` example、`herdr-fixture` 与 `herdr-bot`；不可让 `HERDR_BOT_REPO` 意外回落到默认同级旧仓。普通相关检查仍需 `bun test tests/workflow-chat`、受影响角色/collect/取消 dock、`bun run typecheck`、`bun run test`；不要用裸 `bun test` 代替 package script。按[测试运行协调](../../docs/agents/testing.md)安排重型检查窗口。

随后 runner 用真实 Herdr 发起原生 manager/node，真实模型自行调用实际工具，观察旧执行替换、当前 false→门禁拒绝→collect 保留待办真等待→新 true 唤醒→manager 显式 complete/dispatch；下游初始化只拿独立背景、业务 input、当前登记地址及缺失逻辑输入，不复制旧地址/报告正文/原生聊天/成果正文。外部业务程序实际产出独立文件；报告简短说明结论、阻塞及部分效果，manager 不默认读成果正文验收。实际 Session/Run/node/execution、完整对话与工具/HTTP 次序、进程清理和只读记录副本均关联证据，不能从最终 completed 倒推过程。

当前真实模型入口覆盖 **Windows + Pi**，通过 chat-completions 传输连接模型。除直接授权的兼容服务外，配套 herdr-bot 的 `scripts/workflow_completion_transport.py` 允许测试宿主公开真实 `completion`：逐请求发送完整真实原生历史及工具定义，由真实模型自行选择响应/动作，薄传输仅映射响应格式，Pi 仍执行实际 toolkit 工具并保存原生历史。配置与宿主调用示例见配套 `docs/agents/testing.md` 同一章节；不读取私有 auth、不脚本化工具序列、不预置业务答案、不修改产品 adapter。须联合保留原始 completion 请求/输出/映射与原生/HTTP 证据，且不将这种结果称为模型原生 OpenAI provider wire 合规性。OMP 只有本命令内对应参数 dock 的证据，不将 Pi 结果外推为 OMP 真实模型通过。每阶段默认有界 300 秒，无 runner 业务重试；未取得实际运行证据的承诺必须保持未验证。入口支持显式实际依赖路径，不修改正式部署、不启用 LAN/mDNS、不触碰真实关机或用户服务。长期说明不依赖临时票据/证据链接。

## 3. 先查事实，再明确动作

所有恢复都从 `status`、已有 Run 详情、原 Chat 与真实材料开始，记录所见事实；以下是选择规则，不是自动执行脚本。

| 现场 | 维护操作与核对 |
| --- | --- |
| 无关联、错误角色、歧义或入口缺失 | 对照固定 Task 类型、绝对路径、后端派发现场及原生 Session 关联。保留后端拒绝，不用名称/cwd/Owner key 猜身份，不补建连接。 |
| 派发失败且可能已创建 Chat | 检查 failure.stage、effects 和原 agent；显式 reconcile_dispatch，按人工核实选择 uncertain/not_created/created。不能用 retry 跳过核实，不能将错误当成所有目标都未执行。 |
| 执行 failed，已修复且原 Chat 可继续 | 显式 recover 并提供 confirmed=true 与真实依据；核对执行 ID/Task/zone/Chat 不变。它只恢复跟踪，不启动、Resume 或补发输入。paused 下也可 recover。 |
| 执行 failed，必须独立重做 | 先查旧 Chat/材料和副作用并确认另起执行；running Run 才能显式 retry，提供 confirmed=true 和依据。核对新执行、新 Chat、旧历史/产物仍在；paused 时先作明确 resume 决定，resume 本身不派发。 |
| 工作已可交接，包括人工补齐 | 阅读当前执行最新报告及其声明；只有 can_complete 严格为 true 才允许首次 complete，并记录编排依据和限制，不强制立即完成。拒绝后 collect 等待新报告，不反复对同一报告完成。不能用旧执行 true 或人工判断绕过门禁，也不伪造报告。complete 解除依赖但不派发下游、不终止原 Chat；允许无害收尾。 |
| report saved=true，notification.failed | 保留报告 ID 与失败原因；管理者 collect 并按 ID 读取已保存报告作编排判断，详细成果留在文件中。不要仅为通知失败重报；通知 submitted 也不证明管理者已读。报告/停轮/退出都不是 completed。 |
| 取消、断线或预算到期，结果不确定 | 重新显式查询现场，核对状态、报告 ID、执行关联及外部效果；不要立即重复变更或报告。新调用是人的新决定，不是客户端自主重试。 |
| stateCommitted=true 且 historyError | 当前状态已提交，保留可得历史错误并排查存储；不为补历史重做动作，不直接改写运行记录来伪造成功。 |

完整动作的准入、字面参数样例和拒绝含义见 [派发与恢复](README.md#run-批量派发与故障恢复)。业务内容验收由 Map 安排的 node 承担；管理者不默认读取成果正文作业务验收。

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
2. **保存但通知失败**：实际创建 UTF-8 材料，以命名 outputs 经 node report 保存且外部 CLI 拒绝通知。manager collect 返回 notification，pendingReports.A 与保存报告 ID 相等；公开详情中报告恰好一份、A 仍 running，实际读取材料。
3. **recover 与 retry**：执行 failed 后 confirmed=false 必须拒绝；人工补齐/核实后 recover 保留原 execution。再次 failed 后，未确认 retry 与 paused 下 retry 分别拒绝；明确 resume 后 confirmed retry 产生不同执行 ID，旧执行和输出仍保留。
4. **报告门禁与等待**：独立重做后由业务过程写入材料，旧执行 true 不能代用；实际新 node Session 提交 false 报告，manager complete 被拒绝且状态不变，collect 在同一待办下等待正常到期。新 Session 再提交 true、collect 收到新通知，manager 才显式 complete。这里只证明受控工具/后端交互，不声称真实模型自主判断或材料质量。
5. **证据与复验**：保存命令、退出码、环境、实际步骤和观察，检查 `guidance-rehearsal.json`（实际注入指引、工具结果、HTTP、外部 CLI 调用）。Prompt 专用 dock 的原始请求/Session 保留规则见 [验证入口](README.md#验证入口与已验证范围)。诊断到问题时先修正文档或所属实现，再跑受影响检查；行为改动按 [测试约定](../../docs/agents/testing.md) 跑所属分区/相应 smoke，TypeScript 改动再跑 typecheck。纯文档修改检查本地链接、锚点和示例，不要求用全仓测试代替技术核对。

原始证据可能包含材料地址、Session 信息和请求全文，按本机访问策略保存，不作为公开安全样例。每次部署须运行自己的检查，历史结果不能自动认证新环境。

## 6. 证据能证明什么

上述检查实际运行隔离 omp、公共 Session/HTTP、真实后端路由/存储与真实材料读写；受控 provider 指定工具调用，记录型 Herdr CLI 提供身份和外部故障，不是真实 Herdr 自主启动模型。它们证明受控情境下的配置、协议呈现和处置步骤，不证明模型自主选择/报告质量、任意网络条件、无限期无重试、生产部署或其他宿主支持。

技术验收不是 H1：独立汇总仍需整体使用判断；不把用户判断当作免做配置、技术核对、文档修正或复验的理由。取消、部分效果及其他专题的已验证范围统一见 README，版本支持结论统一见 Harness support，不由本指南重复提升。
