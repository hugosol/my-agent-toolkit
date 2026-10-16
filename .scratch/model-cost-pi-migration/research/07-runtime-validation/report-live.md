# nicobailon 子代理扩展：固定工件隔离真实验证

关联：[nicobailon 子代理扩展的本机隔离验证](../../decision/07-nicobailon-runtime-validation.md)。日期：2026-10-16（日志时间为 UTC）。这是任务票的运行事实交付，不批准提供方、生产设计、fork 或功能降级。

## 结论与证据等级

`pi-subagents@0.78.0` + pi 1.2.0 在本机 Windows 上实际通过模型自主前台/后台委派、并发 workflow、显式 opt-in 嵌套、完成后续跑、fork、一次性定时触发、在途取消和 follow-up 投递。

最小观察扩展通过公开 required-child-extensions 接口，实际进入根、前台子、后台子、嵌套及 workflow/调度创建的子会话。子会话可以取得自己的真实 session id、直接父文件、有效模型/effort 和逐请求事实；根、独立后台进程及续跑重新绑定后的观察可按会话合并，且不重复计入 fork 历史。**这证明一种最小接入和离线汇集路线，不证明 model-cost 生产迁移或共享 JSON 的并发写入实现已经完成。**

全部 59 个真实 provider 请求都有开始、HTTP 200 响应边界和最终非零 usage/responseId；逐请求用量与独立持久化会话记录一一一致。候选累计 `cost` 的范围不覆盖本轮全部后代/调度：快照比同一时点独立观察少 $0.000240924，恰为两个嵌套叶子及一个定时 workflow 子会话。本报告不把该累计接口当完整 owner 账本。

仍不能宣布完整 OMP 基线等价：Viewed 席位缺失；Round 的最终 quiescence 规则、运行中 execution 读数、完整生命周期/State/公共端口映射与生产汇集尚待规划及实现。各轴见下表。

## 授权、环境与用量

- 用户在本票会话对四项授权回答“全部同意”：`deepseek/deepseek-flash`；最多 16 次子代理 execution；累计 ¥5 软限额，含根及自动继续；费用缺失只重读现有接口/日志一次，仍未知则停止付费调用。允许仅从既有文件读取密钥并注入隔离进程，未打印、持久化或传入 prompt。
- 实际 **14 次 execution**（包括 1 次启动失败、1 次续跑及所有嵌套），13 个不同子 session，另有 1 个根 session。另有 2 次未启动 execution 的参数拒绝（resume 不接受 model override、schedule 不接受 mission:false）；未作为额外实际 execution，均保留日志。
- **59 次 provider 请求 = 根 42 + 子 17**。pi 报告总费用 **$0.015280488**；根 $0.010914816，子 $0.004365672。仅作预算量级换算按 ¥7.2/$ 约 ¥0.11，并非查询到的实时汇率或 provider 发票。没有未知费用请求，未触发未知费用停止规则。
- 固定 npm 工件 `pi-subagents@0.78.0`，实际发布入口 `index.js`；Node v24.18.0、pi CLI 1.2.0。首选源码 pin 沿用输入 `a4c8ced69a8176cdf4179b127feddc8875e3418f`；本轮运行对象是 npm 发布工件，不以源码检出冒充发布内容。元数据、完整 integrity 与宿主 argv 在 [环境记录](preflight-environment.json)。
- 安装使用 `--ignore-scripts --no-audit --no-fund`，发布依赖为 jiti/yaml/acorn/undici/@js-temporal/polyfill，宿主 SDK 由本机 pi 提供；本轮通过不保证所有外部 runner 兼容。

## 真实场景与独立对照

| 场景 | 实际触发与结果 | 证据入口 / 限制 |
| --- | --- | --- |
| 根及前台子观察 | 模型调用 `subagent`，根/子同 PID 26000；required extension 被加载并 acknowledge，子 id 独立、父文件指向根 | `runtime-evidence.zip` 的 observations、sessions、artifacts；首次 `tools: []` 被当成不可用工具名，修正为 `tools: read` 后通过。失败已计数；并非候选原版不兼容 |
| 后台子 | 模型 `async:true`，子 PID 15392，真实输出 BACKGROUND；完成后根自动生成 ACK | async run `c3cf0c2f-9d41-4c3d-8f40-de97b6310f0a`；后台没有伪装成进程内总线，跨进程事实来自子探针与持久化 |
| 前台嵌套 | 自定义 tiny-parent 显式 `tools: subagent, read`、maxSubagentDepth=2；父调用 tiny，输出 NESTED / PARENT | 父 run `1b8b2057-acd2-417b-9a14-69c045f1b320`，叶 run `ab6cd8aa-bee2-4e0d-8163-7e9e63225131`。叶 parentSessionId 由直接父文件 header 解析，与 meta 一致，不指向根 |
| 后台父中的嵌套 | 后台父 PID 37496 内模型调用前台叶，输出 NESTEDBG / BGPARENT；两级都加载探针 | 父 run `c2e9a5da-bc7a-4c08-afac-d8d7260531f4`，叶 run `5ffced7e-a3ff-4530-bca8-1b5ffb5eded4`；不以 depth 或进程级 env 猜父链 |
| 并发 workflow | 模型加载 `parallel.js`，`runs.all` 启动 left/right，两请求区间重叠，返回 LEFT、RIGHT；根收到完成通知 | workflow `bab92fb3-c1db-4da2-9594-0e3afe5bc3bb`；childRunId 分别 a82b4c2b…、98b70e09…。同一 started hint 有重复交付，不能作为重复 execution 或收费依据 |
| 完成后续跑 | 模型对 left 的 run 执行 `action:resume`；新 run `9784f019-6bbd-416a-aee8-bd76ed6157f7`，新进程 PID 22864，输出 SECOND | **同一 session id 和 sessionFile**，此前 LEFT 历史保留；新 run/进程不等于新 actual session。`session_start.reason` 仍为 startup，branch 已有消息，不能据 reason 重报首次 startup。非 OMP IRC keep-alive 等价证明 |
| fork | 模型显式 context:fork，真实新子 id，继承父 branch；本次输出 FORK | 新 session `01a140de-7520-74e0-8839-a374ab428152`；继承 18 个 assistant 响应不是子新请求。header 父路径由本次候选委派路径建立，再与 run meta 的 parentSessionId 及实际根调用交叉核对；不把任意 pi fork header 泛化成委派事实 |
| 定时触发 | 模型创建 `at:+5s`、sessionOnly 一次性 schedule，真实启动 workflow/子会话，返回 SCHEDULED 并投递根通知 | schedule `09df2b8e`，run `0bd6cc1d-e236-40cd-89d3-2092ace83b52`，child `b215dc21-3a4a-42d5-9645-db06426aef6f`；实际 history 已读取，随后删除，最终 schedule.list 为空。未测 recurring 重复触发；重复观察去重另作真实记录回放，不把它当 recurring 调度通过 |
| 在途取消 | tiny-wait 的真实请求调用本地 20 秒等待工具；观测到 pause.started 后模型发 stop，工具收到 AbortSignal，终态 stopped，settled.aborted=true | run `74eb83ac-e30a-46a6-af7f-5f5bc23799c8`；一个已完成请求费用 $0.0002778，取消后没有第二次 request_start。末尾全零 error 消息不作新收费请求，也不推出 HTTP 在途取消费用可读；**未测流式 HTTP 中途取消** |
| follow-up / 活动快照 | 另一个等待子处于 running 时读取公开 status，fleet=1、asyncSnapshot 有运行项；模型 steer follow_up，收到 queued 投递，子 input 中出现该文本，随后完成 | run `81ca0ed4-9502-44b9-bf7d-5f65ae1bace1`；根 input.source=rpc，子该 input.source=extension，不能把 extension 输入冒充用户直接提交；完整事件在 observations |
| 失败与费用 | 首次代理清单格式错误，在 child agent_start 后立即 abort，无 request_start、无 responseId，meta exitCode=1；参数拒绝均未开始 execution | 只证明启动/控制错误可观察；未强制造成 provider HTTP 错误、重试、压缩、真实排队竞争或未知账单 |

## 逐请求、归因与去重的实测核对

[reconciliation.json](reconciliation.json) 由 [reconcile.py](harness/reconcile.py) 对真实记录运行得到，退出 0：

1. 每进程/实际 session 独立 JSONL 观察，不让多个后台进程竞争写同一主 JSON。用 `(sessionId, provider, responseId)` 汇集该 provider 已返回的 59 个请求；未知与已知零不混同。这个 provider 的 responseId 均存在，不承诺其他 transport 同样提供。
2. 独立读取每个真实 pi session JSONL，按首次绑定 branch 的持久化 entry id 排除继承历史；同一会话续跑不重复读取旧费用。原始 session header 和 run meta 是另一份身份/直接父对照，而非只比较探针自己的回显。
3. 观察/转录均为 59 请求；input=32058、output=2933、cacheRead=357248、cacheWrite=0、totalTokens=392239；无缺失、无 usage mismatch，费用相同（仅浮点尾差）。fork 继承的 18 个 assistant 响应被排除。
4. 将整份观察输入重复回放一次，59 个重复请求被去重，各 session 与总账不变。真实 workflow started hints 的重复也未生成额外 provider 请求。
5. 根自身账本只包含根的 42 个请求，不把叶子费用再计为根自身请求。Owner 后代汇总可沿已核对父文件图计算，但本探针不是 framework 的 Owner/State 实现。完整生产 JSON 的锁、原子提交、崩溃恢复、增量订阅与重新绑定寿命仍未实现，不能将离线归并证明写成并发共享主文件已安全。
6. 候选 `cost` 快照的根费用与同一时点独立观察一致，但 total 少两个嵌套叶及定时 workflow 叶：详见 [cost-scope-comparison.json](cost-scope-comparison.json)。该差异说明累计接口不是本范围的完整 owner 费用来源；不修候选、不替用户决定缺口路线。

## 全部 F-/O-/N- 基线行的去向

下表逐组列出原基线的全部稳定行标识。**框架复用**不是候选运行通过；**输入可达**不是等价适配已经实现；没有证据的一律不判通过。

| 基线行 | 本轮证据或边界 |
| --- | --- |
| F-OWNER；O-OWNER；N-AGENT-IDENTITY；N-AGENT-REGISTRY | 真实 id/直接父图可恢复，包括后台与嵌套；无原生 OMP agent.kind/registry 等价接口。Owner 归一及断链/环/失效处理仍由后续设计决定，不把 process/env/depth 当身份 |
| F-SESSION-FACTS；O-SESSION-FACTS；O-NAME-CHANGE；N-SESSION-ID | id/父文件及 meta parent id 已核对，工具结果有 agent/sessionName/run handle；未验证改名后 latest name 订阅。opaque run/agent/session 区别保留 |
| F-SESSION-REASON；O-SESSION-MAP；O-SESSION-REASON；N-SESSION-EVENTS | 实际子创建、shutdown、续跑重绑、fork 已观察；reason startup 不足以判断 first-start；根 new/tree/branch/transfer/dispose 完整映射未运行 |
| F-STARTUP；O-BEGINS-HERE；O-STARTUP；N-MODEL；N-THINKING-LEVEL | session_start 可读有效 deepseek/deepseek-flash 和 off、branch；已证明 resume branch 非空，fork 有继承消息。不得仅按 reason 或当前设置补历史 startup |
| F-SCOPE；F-SCOPE-GATE；O-SCOPE-ASSEMBLY | 根/每实际子会话观察可分离；framework scope 分发及权限闸门必须复用，本票未改或重测其实现 |
| F-SESSION-DELIVERY；F-SESSION-HANDLER；F-CAPABILITY；F-HOOKS-CONDITIONAL；F-DECLARED-REQ | 既有 framework 的 delivery/capability/按需订阅/要求契约；不要求候选重实现。本票不证明其新 pi binding 已交付 |
| F-ROUND-EDGE；O-ROUND-MAP；N-IDLE；N-RUN-EVENTS | agent_start/end/settled、idle/pending、后台活动 snapshot、通知自动继续输入实际存在；ctx.getAsyncJobSnapshot 为 undefined。候选 status 是候选范围快照且有 caps，未证明覆盖所有后台 provider、排队与 next-task 闭轮等价性 |
| O-NEXT-TASK | 现有宿主 task queue 桥仍是 adapter 设计输入；本票未实现/批准新的关轮算法 |
| F-TURN；O-TURN-MAP；O-TURN-ZERO；N-TURN-EVENTS；N-USAGE | 59 个开始/响应/非零 usage/responseId 与转录对应；HTTP status 已采，响应 headers/request-id/流式 usage 更新未采；全零 abort 不当可靠用量，先检查是否实际有请求。framework Turn id/锚价不由 responseId 替代 |
| N-RESPONSE-BOUNDARY-COVERAGE | 仅本轮 DeepSeek Flash transport 的 59 个 HTTP 200 边界得到验证；不覆盖 Codex/websocket/其他 provider |
| F-RUNTIME；F-RUNTIME-SCOPE；O-RUNTIME-ROUTE-1；O-RUNTIME-ROUTE-2；O-RUNTIME-IDENTITY；O-RUNTIME-ABSENCE；O-RUNTIME-FACTS；N-TASK-ENTRY；N-CHANNELS | foreground meta 实际有 durationMs（例如 2599ms），不是只有 bus；探针可测14个子执行的 agent_start→settled 活跃区间，续跑单独区间、不含空闲。两者语义不能混装：agent 活跃测量可能漏执行器 setup，启动失败 meta=16195ms 而 active仅12ms。未证明 OMP runtime running 读数、所有 executor 精确同口径及迟到/缺身份行为；不能因有时钟就宣称完整覆盖，也未触发耗时放弃裁决 |
| N-TASK-TOOL | 模型真实使用 subagent 前后台/嵌套/workflow/控制，而不是用根 RPC spawn 替代模型委派证据 |
| N-KEEPALIVE | resume 新 run/进程复用同一 actual session 与文件已证；不等同原 OMP IRC keep-alive 唤醒协议 |
| F-INPUT；O-INPUT-MAP | 根 RPC 与子 extension input 区分已证，follow-up 已真实投递；interactive 用户输入/mention 未测；不能把父发给子的 extension 输入报告为用户提交 |
| F-VIEWED；O-VIEWED-MAP；O-OWNER-VIEWED；O-OWNER-EXEC；N-VIEWED | 第三轮无费用真实 context 检查 viewed read/subscribe 均 undefined；既有公开面研究亦无席位契约。execution 的父图可得不意味着 viewed owner 可得。未运行 TUI/viewer，不以 status/UI widget/保存 JSON 替代席位出口 |
| F-LIFECYCLE-IMPL；O-FACTORY；F-STATE-INHERIT | 同进程及跨进程子均重新激活探针，dispose/rebind 可见；不是生产 implementation initialize/cleanup 或 State follow 的测试。根专用动作隔离、共享实例、owner 寿命由后续组织票决定 |
| F-ONE-MAIN | 仅一个根会话；未测试也未批准多 main、根切换后存活子会话形状 |
| F-PORT；O-NATIVE-API；O-NATIVE-CONTEXT | 运行确认本探针消费的一部分 pi API；不是 OMP 端口逐成员替代。contextUsage/sessionName/modelRegistry 成员存在；sessionNameSubscription/timer/clearTimer/asyncSnapshot 不存在于实测 context；行为映射留待适配设计 |
| F-COMMAND-FACTS；O-COMMAND-FACTS | 根 RPC get_commands 可取候选命令；新 harness 的 owner/feedback/persist/canAcceptInput 命令交付未实现/未验 |
| O-PRICES；O-PROVIDER-ACCESS | 实际密钥只经进程环境，usage.cost 是 pi 报价，不证明目录价和 providerAccess 端口已映射；未读取或暴露 provider 密钥 |
| O-MARKER-FEEDBACK；N-UI | RPC 收到候选 widget/status UI 请求；ctx.hasUI 为 true 不能当作实际终端视觉验证。绘制/marker/feedback 未测，不给 UI 通过结论 |
| O-EXTENSION-ENTRY | 只加载固定候选和可丢弃观察入口；未安装或交付 model-cost pi 生产入口 |
| N-CONTEXT-USAGE；N-TIMERS | context usage 方法存在但未比较返回形状/运行行为；OMP session-owned timer 不存在于实测 pi context，替代生命周期机制未实现/未验 |

## 与 tintinweb 的同轴比较

- 产品使用：两者都有受限真实前后台/并发/嵌套及控制证据；本轮 nicobailon 另实际通过一次性调度、workflow 子观察、跨进程嵌套和 follow-up。两者嵌套都需要明确 opt-in（形式不同），不是默认无限嵌套。
- 身份/父链/观察：nicobailon 的公开 required-child-extensions 在所有本轮路径加载成功，meta+session 文件能独立核对直接父与 actual session；tintinweb 已发布验证未证明这些自观察路径，不能将“未测”说成“不支持”。
- 累计/逐请求：nicobailon 的自观察为本轮59请求提供了可靠读数及去重；候选 cost 自身仍有后代范围缺口。tintinweb 公开总线累计值也不能代替逐请求事实。
- 续跑：nicobailon 同 session/new run/new process 已实测；tintinweb 已发布模型面同 id 续跑。均不自动等于 OMP keep-alive。
- Viewed、完整关轮、生产实例/State/汇集及运行中 execution 时间：不能因 nicobailon 此轮证据更多就认为已解决，更不能代替用户最终选型。

## 复现、证据与资源清理

- 预检：`report-nofee.md`、`preflight-environment.json`、`raw/preflight-*.{stdout,observer}.jsonl`。第三轮检查额外的 context API，未发 prompt。
- 实测：`raw/live-main.stdout.jsonl`、`raw/live-main.stderr.txt`（为空）；完整原始 session/observations/artifacts/本轮 async 记录及代理/配置/workflow 输入封存为 [runtime-evidence.zip](raw/runtime-evidence.zip)，168 文件。驱动器 `harness/driver.py`，观察入口 `harness/observer.mjs`，核对入口 `harness/reconcile.py`；全部真实 prompt 可从根会话/宿主 stdout 恢复。探针后期增加本地 pause 工具；既有根进程仍用初始已加载模块，后台新进程用增加后的模块，未更改身份/请求观察逻辑。
- 重建：重新按环境记录安装固定工件到 `E:/Developer/pi-playground/wf07-iso/install`；将 zip 中 sessions/observations 恢复到同名隔离路径，agents 恢复到 project/.pi/agents，inputs 的脚本恢复到 project，settings 恢复到 agent，candidate-config 恢复到 agent/extensions/subagent。`python harness/reconcile.py` 可仅凭保存的原始记录复核，不需要模型。付费重放必须另获预算，不能沿用已用次数。
- 驱动器使用 `--mode rpc --provider deepseek --model deepseek-flash --thinking off`，显式关闭环境 extensions/skills/prompts/context/mcp，并指定 session 文件和两个 extension。它是本票隔离验证入口，不是生产功能。
- 最终 status 为0 active、fleet=0，保留终态 run 的 asyncSnapshot 不等于仍在运行；schedule.list 为空、根 isStreaming=false/pendingMessageCount=0；宿主退出0，全部已观测 worker/runner PID 均不存活。
- 已删除本票隔离目录和本轮7个 async 目录。候选默认把 async 数据写入系统 Temp，而非 agentDir；只删除从本轮事件取得的精确 run 目录，不碰其他运行。日常 `~/.pi/agent` 文件路径/大小/mtime_ns 前后快照相同。
- 封存前以真实凭据字节检查全部待封存文件和宿主日志，未发现明文密钥；不记录密钥内容。完整 archive checksum、PID/路径及清理结果见 [cleanup.json](cleanup.json)。
