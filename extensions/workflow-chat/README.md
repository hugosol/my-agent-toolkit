# Workflow Chat：manager-chat 与 node-chat

节点执行者面向 Map Run 的一次实际执行，只负责工作与报告，不拥有管理者状态操作权。[领域词汇](GLOSSARY.md)区分 Run、执行者和交接完成。管理者与节点是独立 Session、独立声明、独立自动入口，不是一个工具的角色切换参数。

部署者从[长期部署与故障处置](OPERATIONS.md)开始；实际协议与角色语义由本文维护，操作手册不建立另一套协议。隔离配置、恢复/重试、真实材料交接及通知失败的复核步骤见操作手册的隔离配置与处置演练章节。

## 安装与自动加载

独立交付入口为 [`entrypoints/omp-auto/manager-chat.ts`](../../entrypoints/omp-auto/manager-chat.ts)（ID `manager-chat`）和 [`entrypoints/omp-auto/node-chat.ts`](../../entrypoints/omp-auto/node-chat.ts)（ID `node-chat`）。manager 提供 `run` 与 `collect`，node 提供 `report`；分别用于对应角色 Session，不共享节点身份。当前仅支持 omp，不提供手动启用命令或 pi 入口。部署须保留本仓库的 `framework/`、`adapters/`、`extensions/workflow-chat/`、`entrypoints/startup/auto.yaml` 及 YAML 依赖；只复制入口文件不构成部署。`framework/.runtime/` 中的 owner-access 记录及原子写入暂存文件属于运行中的源 Session，不属于部署输入；角色 dock 复制源码时同样排除此目录，避免全局并行测试复制正在被重命名的暂存文件。

herdr-bot 的 manager/node 类型 Task 应分别固定选择对应自动入口，部署者应把后端 Task 选项目录中的角色入口指向其实际绝对路径。独立加载示例（不是在同一角色中混装）：

```text
omp -e /absolute/my-agent-toolkit/entrypoints/omp-auto/manager-chat.ts
omp -e /absolute/my-agent-toolkit/entrypoints/omp-auto/node-chat.ts
```

入口加载后按公共启动策略自动启用；首次启用轮次由公共 Prompt 注入对应角色的完整工具指引，普通后续轮次不额外重复注入。不要同时加载另一份同 ID 扩展。无需加载或启用 connect-bot，不建立面板登记连接。**加载成功不等于已关联到 Run**：身份必须先由后端的合法派发流程关联；直接启动的任意会话会收到后端无关联拒绝，客户端不绕过该规则。

## 首次工具指引与输入边界

三种输入各有唯一职责：`Task.prompt` 固定角色职能；后端本次 input 提供工作、运行说明及状态/历史/报告记录的路径；扩展的公共 Prompt 只说明工具使用。后端仍按原规则把固定文本与本次工作组合为启动输入，扩展不重拼、不替换或另发固定文本，不复制 Bot 文档、整张 Map 或向 node 自动传播 Run 的 `user_input`。模型应按给定路径读取所需材料，而不是等待扩展自动注入内容。

完整指引由 [manager 声明](manager-definition.ts)与 [node 声明](node-definition.ts)持有，不要求部署者再复制到 Task。manager 的首次指引覆盖全部十种 run action、collect 五种 reason 与完整等待预算、报告标识查阅、依赖与终态、派发核实、recover/retry、人工真实交接及部分效果；node 的首次指引覆盖报告时机、可读地址/用法/限制、允许后续收尾、报告不等于完成，以及已保存但通知失败不重报。

两条隐藏、持久化的 Prompt 身份分别为 `manager-chat:tools` 与 `node-chat:tools`，使用公共 `first-enabled-run` 的分支历史规则，不另存“已注入”标记。普通轮次保留历史中的一份指引，不追加副本；切换回来也不重置。公共自动启动策略每进程只消费一次，切到新的未启用 owner 不会再次自动启用；历史分支不带该身份时，由公共规则决定首次贡献，不由角色代码另建状态机。

## 稳定配置

配置是 [`config.yaml`](config.yaml)，声明显式指定 `extensions/workflow-chat/config.yaml`，装配以自身文件位置确定仓库根目录。即使节点 cwd 中有同名配置，也不会选择它；不按 `node-chat` ID 推导其他目录，不使用环境变量或 endpoint 自动发现作业务配置回退。

```yaml
endpoint: http://127.0.0.1:18787
requestTimeoutMs: 30000
collectTimeoutMs: 5460000
```

- `endpoint` 为 herdr-bot 基地址；按实际部署修改后重启 Session。
- `requestTimeoutMs` 是 report 等普通请求的完整传输预算，包含响应正文。
- `collectTimeoutMs` 是管理者长等待的独立预算，节点 report 不使用它。后端默认 5400 秒，建议客户端 5460000 毫秒（91 分钟）；没有自动同步握手，预算较长也不保证所有网络请求成功。
- 文件缺失、非法 YAML、缺少或错误类型的字段会由公共配置机制明确拒绝绑定；不静默换用 cwd 配置或其他 endpoint。正整数毫秒范围是 1..2147483647。

框架公共网络配置仍由框架维护；角色只通过[公共 HTTP](../../framework/interface/general/http.ts)请求，不复制 connect-bot 私有客户端或后端状态机。

## run 基础状态动作

manager 的 `run` 工具以 `action` 选择显式动作。传输为 `POST /api/workflow/manager/<action>`，工具移除 `action` 路由选择字段并由公共 Session 加入真实原生 `sessionId`，不接受模型自报身份。当前基础动作的独立字面样例：

```json
{"action":"status"}
{"action":"complete","nodeId":"A","reason":"已读取 E:/artifacts/alpha.txt；UTF-8，可只读引用；原 Chat 仍收尾"}
{"action":"fail","nodeId":"B","reason":"已核实缺少源文件；保留原 Chat 与部分产物"}
{"action":"pause"}
{"action":"resume"}
{"action":"finish"}
```

| 动作 | 后端事实与边界 |
| --- | --- |
| status | 原样返回 `snapshot`、`ready`、`blocked`、`canFinish`；不是客户端缓存或第二套派发状态。A/B→C 中 C 必须等 A 与 B 都 completed，ready 不是已执行。 |
| complete | running node 或人工确认可交接的执行阶段 failed 才可完成；`reason` 非空且原文保留。pending/派发 failed 不得跳过工作。解除依赖，不制造报告、不传材料、不启动下游、不终止原 Chat；可继续无害收尾。 |
| fail | 仅将 running node 记为执行失败，保留原执行与首次原因。不暂停 Run、不重试、不终止实际 Chat。 |
| pause | 只禁止新执行，已有工作、report、核实和 complete 仍可继续；不等已有 Chat 退出。 |
| resume | 只恢复派发资格，不是普通 Chat Resume，不自动派发、重试或补发输入。 |
| finish | running/paused 且全部 node completed 才可结束，活动 Chat 不阻止。终态 `canFinish=false`，不重新打开 Run。 |

重复 complete/fail 保留首次事实，重复 pause/resume 不重复转换，重复 finish 返回首次结束事实；终态拒绝变更。工具保留后端 `changed`、拒绝 code/原因、`reports`、`pendingReports`、`historyError`、`stateCommitted` 与已发生效果，不把 HTTP 200 或动作取消解释成全部成功/回滚。

所有动作严格拒绝额外身份或不适用字段（如 status 的 nodeId、complete 的 confirmed）。OMP 18.5.0 会修复 closed schema 并删除未知字段，因此原生 schema 刻意保留未知键供工具逐 action 拒绝，避免非法调用被“修好”后意外执行；这不是业务参数扩展。缺失/非字符串字段由宿主或工具拒绝，空白 reason 的业务拒绝交由后端，不复制状态机。

人工真实交接须先查看已保存报告、亲自读取真实材料并记录地址、用途、限制和人工处理依据，再明确 complete；不能把 report/停轮/退出当作完成。派发、故障核实和报告等待是各自独立职责，基础动作不会代替它们。失败或不确定结果先查询现场，不自主重试。

## collect 长等待与报告待办

manager 的 `collect` 没有业务参数，调用样例为 `{}`。实际传输是 `POST /api/workflow/manager/collect`，仅自动加入公共 Session 的原生 `sessionId`；模型不得填写 Run、node、执行或接收者。它使用独立的 `collectTimeoutMs` **完整请求预算**（包括等待与正文读取），不复用 `requestTimeoutMs`。后端默认 5400 秒 = 5400000 毫秒，建议客户端 5460000 毫秒，比默认期限多 60000 毫秒；这不是自动同步配置或所有网络等待成功的保证。修改后端期限时，部署者须自行核对客户端预算。

| `reason` | 含义与处理 |
| --- | --- |
| `paused` | Run 已暂停，立即返回当前现场；已有报告及交接仍可处理。 |
| `completed` | Run 已显式结束，立即返回终态现场，不重新打开工作。 |
| `notification` | 有已保存、尚未经过 collect 检查的报告；辅助通知投递失败也不影响收取，多个通知可合并。 |
| `no-running` | 没有未检查通知且没有 running node，避免空等；根据现场显式派发、核实失败或 finish。 |
| `timeout` | 后端配置的等待期限正常到期，不改变 Run/node 状态。客户端预算耗尽是错误，不是这个正常原因。 |

结果保留后端 `snapshot`、`ready`、`blocked`、`canFinish` 和 `pendingReports`，**不包含 `reports` 或报告正文**。仍有 running node 且没有新通知时，即使有 ready node 也可能等待；扩展不强制提前返回、不轮询、不自动重试。

`pendingReports` 是 node → 最新适用报告标识。按标识读取已提供的 `messages.jsonl` 或已有 Run 详情，再核实正文中的材料与限制。collect/读取/辅助通知均不等于交接，不清除未完成待办；只有后端显式 complete 等事实改变适用待办。completed 后原执行仍可报告收尾，但不会重开待办；retry 后旧执行报告仍属旧执行历史，不能以全局最新报告替代新执行依据。旧/新报告交错、待办移除与通知检查均由后端决定，客户端不缓存或重算适用性。
## run 批量派发与故障恢复

以下四个动作使用同一个 `run` 工具和当前管理者原生 Session 身份，不接受额外 Run、执行、Chat 引用或目标状态。字面调用示例：

```json
{"action":"dispatch","nodes":["A","B","C"]}
{"action":"reconcile_dispatch","nodeId":"A","finding":"uncertain","reason":"人工尚不能确认原 Chat 是否创建，保留现场"}
{"action":"reconcile_dispatch","nodeId":"A","finding":"not_created","reason":"人工查阅启动拒绝并确认没有原生 Chat"}
{"action":"reconcile_dispatch","nodeId":"B","finding":"created","reason":"人工已定位原派发 agent，原 Chat 可跟踪"}
{"action":"recover","nodeId":"A","confirmed":false,"reason":"尚未核实修复，不应恢复"}
{"action":"recover","nodeId":"A","confirmed":true,"reason":"人工已补齐源文件，确认原 Chat 可以继续"}
{"action":"retry","nodeId":"A","confirmed":false,"reason":"尚未检查旧副作用，不应重试"}
{"action":"retry","nodeId":"A","confirmed":true,"reason":"人工已检查原 Chat 与部分输出，同意另起独立执行，旧副作用保留"}
```

这些是不同现场的示例，不是自动顺序执行的恢复脚本。`confirmed` 和 `reason` 必须显式提供；工具原样传递 `false`，不补成 `true`，也不替人判断自然语言依据是否充分。后端要求确认与非空依据，否则返回 `recovery-confirmation-required` / `retry-confirmation-required`。

| 动作 | 先看什么、结果意味着什么 |
| --- | --- |
| dispatch | 显式列出 `nodes`；后端逐目标落实批次。检查每个 `results` 项的 running/rejected/failed、拒绝原因、失败阶段、`effects` 与快照中的可得执行关联。一个目标失败不代表其余目标没有执行；成功项不保证携带冗余 Chat 字段，以实际快照/效果为准。 |
| reconcile_dispatch | 仅派发阶段 failed。`uncertain` 保持失败；`not_created` 在人工确认未创建且没有已知原生关联时恢复 pending，仍需另行显式 dispatch；`created` 由后端只读核实原派发效果中的 agent，关联原执行并恢复 running。不接收模型自填 Chat；无法核实身份则保持失败，不制造身份、不新建 Chat、不补发初始指示。 |
| recover | 仅执行阶段 failed，人工修复并确认原 Chat 可继续；paused 也可用。保留原执行 ID、Task、zone、Chat，只恢复跟踪，不启动/Resume 进程、不补发输入、不撤销失败历史。 |
| retry | 仅 running Run 的执行阶段 failed；paused 返回 `run-paused`，先明确 resume（它本身不派发）。人工检查旧 Chat 与部分产物后，另起新执行、新 Chat；保留旧执行历史和副作用。结果是单项 `result`，仍需核对新启动失败阶段、已发生效果与可得关联，不能因失败声称没有新 Chat。 |

处置顺序先查看 status、原 Chat 与产物：派发不确定先 reconcile_dispatch，不用 retry 的确认跳过核实；执行失败而原 Chat 可继续用 recover；必须独立重做才 retry；人工处理后已可交接则用 complete 并写清材料/限制，不制造报告。四种动作都不撤销旧副作用，不自动重试或启动下游。HTTP 200、网络错误或取消都不等于所有目标未执行，先查事实再做下一次显式决定。

## report 协议与交接

模型业务参数**只有**字符串 `body`：

```json
{"body":"结果：E:/artifacts/summary.txt；UTF-8。用法：只读引用；限制：未经过生产验证。"}
```

使用公共 Session 观测取得原生 sessionId，传输为 `POST /api/workflow/node/report` 的 JSON `{sessionId, body}`。不让模型填写 Run、node、执行、来源或接收者，不用 Owner key、名称或 cwd 猜身份。OMP 自身可能在模型工具 schema 中加入全局追踪字段 `i`；这是宿主元数据，不是角色业务字段，OMP 在执行前移除它。

后端唯一决定并生成报告 `id`、毫秒时间 `at`、`type=report`、`runId`、`nodeId`、`executionId`、`source`、`target`，扩展原样返回，不在本地改写归属。正文应有实际可读地址、用法和限制；这是交接责任，不是额外地址校验。实际后端只要求 body 为字符串，扩展不发明空字符串拒绝。

结果保留 `saved`、`report`、`notification`、`diagnostic`、`guidance`：

| 现场 | 如何处理 |
| --- | --- |
| 保存失败：`saved=false`，通知 `not-attempted` | 保留后端 code、原因和 HTTP 错误正文，先排查保存问题；没有“已保存”的成功保证。 |
| 保存成功、通知 `failed` | 报告已提交。保留报告 ID 和通知原因，让管理者直接读取已保存报告；**不要仅因通知失败重新 report**。 |
| 保存成功、诊断 `failed` | 诊断失败不撤销报告，也不改变通知的真实结果；不自动重报。 |
| 保存成功、通知 `submitted` | 只表示辅助输入提交，不证明已阅读、严格顺序、打断 collect 或强制续轮。 |

工具文本为后端 JSON；HTTP 状态及原始解析结果也保留于工具 details。辅助通知或诊断失败不会把已保存报告标成工具提交失败。每次显式 report 都可能追加独立报告，不是客户端幂等更新；有新结果或需更正正文时才明确再次提交。

**report、停轮、退出都不等于 node completed。** 管理者须读取材料、核实真实交接并显式 complete。结果已可交接时可以先报告，再继续不影响结果的收尾；暂停新派发不撤回既有工作。旧执行的补充报告只保留其原执行事实，不替代新执行结果。

## 故障、取消与信任边界

- 无关联、歧义、错误角色及其他准入拒绝由后端决定，扩展保留响应，不修补身份或新建连接。
- 非 2xx 结构化正文不会被压缩成状态码；已发生的保存或其他部分效果不被描述为回滚。HTTP 200 也不是整批成功保证：逐项查看 `results`、`effects`、`historyError` 和 `stateCommitted`。`stateCommitted=true` 且历史追加失败表示当前状态已经提交，不应为补历史重复执行动作。
- 已接受状态动作、dispatch 或 report 后再断开，客户端通常只能得到不确定结果。先显式 `run status` 或读取 Run 详情核对状态、执行关联、报告 ID 与外部 Chat/材料；不要把取消当成“未执行”，不要立即重做。尤其 report 可能已经保存而通知/诊断失败，重复提交会产生另一份报告。存活 Session 可接收新的显式调用，其请求不沿用上一工具的取消状态；这属于用户决定的新请求，不是自动重试。
- 网络/正文读取失败、预算耗尽、取消或非法 JSON 不生成假成功报告，也不自主重试；请求被取消不保证后端未接受。先核实已保存事实，再明确决定后续动作。
- 每个实际 Session 持有独立请求取消资源，工具 AbortSignal 和该 Session 结束信号传入公共 HTTP；工具中断、切走 Session 及进程正常结束都会终止仍在接收正文的 collect。取消覆盖完整交换，不在收到 HTTP 响应头时解绑；不能把本地返回取消等同于后端回滚。
- 正常后端到期是成功正文的 `reason: "timeout"`。主动取消为 `error.kind: "cancelled"`，客户端完整预算耗尽为 `"timeout"`，连接/正文断流为 `"transport"`，完整收到但 JSON 非法为 `"parse"`；错误不附加推测快照。HTTP 200 响应头不是成功凭证；不完整分块或 Content-Length 正文均是传输失败，不是假成功或正常到期。
- 多个终止事件竞争时保留公共 HTTP 已采用的原因，不规定“取消始终胜出”等全局优先级。工具结果含相应错误 message；Session 已被切换时，omp 可能丢弃原 Session 的工具结果，不能为它补造成功/取消快照。重新打开原 Session 后显式收取/查询保存事实。
- 后端同机来源限制不是认证；sessionId 不是秘密，沿用同机进程可能冒用身份的信任模型，不新增 token 或远程信任承诺。

## 验证入口与已验证范围

以下命令用于复核角色协议与真实宿主边界；每次运行须记录自己的环境、结果与限制。自动检查通过不等于真实模型协作或人工整体验收已通过。

```text
bun test tests/workflow-chat
bun test tests/harness-dock/node-report.test.ts
bun test tests/harness-dock/manager-state-actions.test.ts tests/harness-dock/manager-resume-finish.test.ts
bun test tests/harness-dock/manager-collect-budget.test.ts tests/harness-dock/manager-collect-pending.test.ts
bun test tests/harness-dock/manager-collect-lifecycle.test.ts
bun test tests/framework/http-collect-budget.test.ts tests/framework/http-collect-termination.test.ts
bun test tests/harness-dock/manager-dispatch-recovery.test.ts
bun test tests/harness-dock/uncertain-effects.test.ts
bun test tests/harness-dock/role-prompts.test.ts tests/harness-dock/role-guidance-rehearsal.test.ts
bun run typecheck
```

Prompt 检查直接捕获真实 omp 发给 provider 的文本，并读取其持久化的隐藏贡献；两角色均核对首次、普通轮次、新 owner 与切回原会话的行为。输入边界检查使用不同标记的真实后端 Task、工作、Bot/Map/user_input，取得实际 CLI 提交正文后原样送入真实 omp，核对工作文本块不变且工具指引是另一条消息。此处 Herdr 是记录型受控 CLI，不证明真实 Herdr 已启动这些会话。

指引故障演练实际执行“已保存但通知失败→collect 并读取材料”“原执行修复→recover”“核实旧副作用后→retry”“人工补齐并读取真实材料→complete”。执行前可将 `WORKFLOW_PROMPT_EVIDENCE_DIR` 设为 `.scratch/manager-node-chat/evidence/` 下本次运行专用目录的绝对路径：Prompt dock 保留原始请求与 Session JSONL，演练保留 `guidance-rehearsal.json`（实际注入全文、工具结果、HTTP 和外部 CLI 调用）。产物和决策均由验收 Agent/测试控制，不能当成真实模型工作结果；这些是 P26 技术证据，不是 H1 通过，H1 的唯一整体使用判断仍须独立汇总与用户确认。

测试通过真实隔离 omp 18.5.0 加载交付入口；受控 provider 仅发出预先指定的工具调用，不冒充真实模型自主工作。受控 HTTP 分别验证保存失败、已保存但通知失败、诊断失败以及空正文不被客户端拒绝；150ms 有界窗口内观察无额外请求，不证明无限期无动作。

manager dock 通过实际 manager 入口与真实后端执行 A/B→C 小图的 status、交接、失败、暂停、恢复资格和结束，检查首次事实、拒绝与 150ms 窗口内无额外客户端 HTTP/外部 CLI 动作。测试前置派发通过隔离后端公开接口准备，不依赖派发工具。受控 provider/Herdr CLI 不证明真实模型使用两份材料或真正启动节点 OMP；这不是完整真实模型汇合验收，也不保证无限期无动作。

collect dock 同样使用真实 manager 工具与隔离后端：后端期限 1 秒，分别配置普通 60ms/collect 3000ms 和普通 3000ms/collect 200ms，区分正常到期与客户端预算耗尽；公共 HTTP 用实际分段响应覆盖完整请求预算。报告场景通过后端公开接口准备旧/新执行，不依赖 dispatch/retry 工具；核对五种真实 reason、辅助通知失败、反复读取、completed 后收尾报告及旧/新报告交错的适用待办。此预算/待办场景本身不证明宿主取消或真实模型决策。

取消专用 dock（P19）另用 **30 秒真实后端期限与 30 秒客户端预算**，在后端实际发送 `HTTP/1.1 200 OK`、正文仍为 0 字节后，分别向真实 omp 发出 `abort`、`new_session` 和关闭 stdin 的正常 shutdown。透明 TCP 观察器只转发字节与客户端 FIN，不主动制造 HTTP 响应或先行断开后端；它记录客户端 FIN 和后端自行返回的 FIN。要求两端在 5 秒内结束且没有正文，排除等满期限才释放。随后通过真实宿主恢复原生 Session（shutdown 还会重启宿主），提交真实 node 报告并由新的 collect 得到 `notification` 与该报告标识，排除遗留等待吞掉下一份通知。每次运行输出原生身份、响应头、字节数、双向 FIN 时序、实际终止反馈及报告标识，保留为命令日志即可复核。此观察验证连接和等待响应的释放，不测量后端内部 watch 接收者计数，也不声称取消撤销了已提交业务效果。

P21 分区经真实 manager 工具独立控制正常到期、工具取消、客户端预算、响应前断线、200 后无完整分块正文、Content-Length 截断及非法 JSON；S2 公共 HTTP 另观察取消/断流竞争与已采用期限后的取消，不把测试调度顺序提升为产品优先级。受控故障只证明这些分支的呈现，不证明真实模型决策或任意外部网络条件。
派发/恢复 dock 通过真实 manager 工具与后端制造同批成功、依赖拒绝、身份阶段失败（外部 CLI 对两个目标返回同一原生身份），保留实际已启动效果；并从真实启动/身份读取失败进入三种 reconciliation，验证 created 只查询原 agent。执行失败场景分别验证 confirmed=false/空依据拒绝、paused 下 recover 原执行与 retry 拒绝，以及新执行成功/提交失败均保留旧输出、旧执行和新效果。HTTP 捕获分区逐 action 拒绝额外身份、不适用字段和模型 Chat 引用。这里的 Herdr CLI 故障/身份均受控，不能据此宣称真实 Herdr/模型已完成恢复演练，也不重复宣称通用部分提交覆盖。

P22–P24 专用检查分开使用独立字面 HTTP 错误样例与真实后端故障。`uncertain-errors.test.ts` 从真实 manager 工具观察 503 正文、200 部分效果、网络断开和非法 JSON；每个结果后保持 250ms 外部请求计数窗口，再由同一 Session 显式 status，区分新调用与自动重试。`uncertain-effects.test.ts` 的边界代理先把请求交给真实后端并完整取得其响应，之后才扣住响应并对真实 omp 工具发出 abort；分别验证 pause 已提交、dispatch 已启动且关联 Chat、report 已保存且通知失败。取消后读取公开 status/Run 详情，并在 250ms 窗口核对 HTTP 与外部 CLI 无新增动作；存活 node Session 的另一份显式报告恰好新增一份报告，辅助失败后也无自主重报。另以损坏的隔离历史文件触发真实 `historyError/stateCommitted`，核对状态、分项目标与外部效果保留；损坏当前记录触发真实 500，核对结构化正文与修复后的显式查询。代理仅控制交付时序，不伪造后端接受、提交或回滚；这些检查不证明无限期无重试，也不证明真实模型决策或生产网络故障。

真实后端 dock 需要同级 herdr-bot checkout（或测试环境 `HERDR_BOT_REPO`），并先在该 checkout 构建：

```text
cargo build --manifest-path backend/Cargo.toml --example safe_shutdown_shell --bin herdr-fixture
```

此 dock 只启动安全壳、隔离数据和记录型 Herdr CLI，实际运行 node 工具、公共 Session/HTTP、后端路由、身份关联与报告落盘；通过公开详情确认报告仍可读取、待办保留且 node 仍 running。通知失败来自真实后端调用被明确拒绝的外部 CLI。它不验证真实 Herdr 启动模型、真实模型选择材料/报告质量、manager 完整链路、跨阶段取消或 A/B→C 汇合；这些不得从该 dock 的成功推断。诊断失败受控响应只证明呈现分支，不证明真实 stderr 故障注入。
