# tintinweb 子代理扩展的本机隔离验证

Type: task
Mode: AFK；仅真实模型、调用次数与费用上限的选择需要 HITL
Status: resolved
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)

## Handoff

- 用户已确认新增独立本机验证任务，先验证 [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) 固定版本，不修改日常 pi 配置，不实现生产 adapter。确认来源：本轮 Q4 的回答“是”。此确认不是批准最终选型。用户随后明确授权使用 DeepSeek API key 进行小流量测试，凭据文件为 `E:/Developer/pi-playground/dskey.txt`；只记录路径，不将密钥内容写入文档、日志、命令行参数或版本控制。具体模型及数值费用上限尚未指定。
- 现有研究检查的是 `@tintinweb/pi-subagents@0.22.0` / revision `85a704cb8f35c96c0cabfa665b572bab296942e5`；以此固定候选版本为初始验证对象，运行前核实包身份、宿主版本与工件对应关系，不自动升级到 latest。
- 输入：[OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md) 的已交付基线报告，以及 [pi 子代理扩展的接口证据与覆盖对照](02-pi-subagent-candidates.md) 的 tintinweb 原始证据与主会话勘误。两票尚未正式发布；可使用已就绪证据设计场景，不宣称其整个问题已解决。
- 下一就绪动作：领取本任务，检查本机真实 pi 入口与现有运行方式，在独立临时目录准备固定版本候选、项目、配置与观察扩展，先做不产生模型费用的加载/发现/RPC/清理验证。不得通过会回显内容的工具查看凭据；真实验证进程可在需要时从已授权文件直接读取并仅注入本次隔离进程的认证环境，不输出内容、不写入持久配置，也不将密钥传给子代理提示词。
- 真实调用授权：仅限 DeepSeek 的小流量验证，凭据位置见上。用户要求 subagent 尽量使用简单、耗时短的任务，不浪费 token；不扩展到其他 provider、大上下文、长输出、压力测试或无界重试。沿用执行前明确模型、最大调用次数、数值费用上限及无法硬性限额时停止策略的约束；小流量授权不等于无限预算，尚未指定的数值不得写成用户已批准。
- 用户已裁决真实调用限额（2026-10-16）：模型 `deepseek/deepseek-flash`；最大子代理执行数 **4**；费用上限 **¥5**；明确要求验证**嵌套子代理**；费用读数不可得时**重试一次**，仍不可得则该用例放弃。
- 用户追加限额（2026-10-16）：剩余场景继续实测，追加 **8 次子代理**、追加 **¥5** 费用上限（累计预算 12 次 spawn / ¥10）。
- 节约策略：先完成无模型费用的加载/RPC/静态接口检查；真实子代理优先使用“只回复 OK”、极短算术或单次工具调用等最小任务。并行仅用能区分身份的最少代理，嵌套只验证必要最小深度；续跑每次只给极短输入，不携带真实仓库或无关历史。按场景限制 Turn、输出和运行时长，关闭非必要推理；场景已有充分证据即停止，不为扩大日志反复调用。记录实际 usage 与可取得的费用读数；失败先诊断，不盲目重试。具体限额及费用监测能力在运行前核实，不能把软限制声称为硬预算保证。
- 本次执行状态（2026-10-16，本会话；无模型费用部分已完成）：隔离环境 `E:/Developer/pi-playground/wf06-iso`（`PI_CODING_AGENT_DIR` + `PI_CODING_AGENT_SESSION_DIR` + `--session-dir` + `--no-extensions`），候选以 `-e npm:@tintinweb/pi-subagents@0.22.0` 临时安装并实机核到 0.22.0 / entry `./src/index.ts` / deps `croner`+`nanoid`；日常 `~/.pi/agent` 前后快照无变化，日常 extension `herdr-agent-state.ts` 未被加载，node 进程数不变，退出码 0。实测：`subagents:ready {}`、`subagents:scheduler_ready {sessionId,jobCount}`、`ping→{success:true,data:{version:2}}`、stop/consume 负向错误信封、registry 四成员并在 `session_shutdown` 置 null、注册工具 `Agent`/`SubagentWorkflow`/`get_subagent_result`/`steer_subagent`。异常点：临时 npm 工件退出后仍留在 `<agent>/tmp/extensions/npm/<hash>`（进程与 registry 释放，磁盘工件未清理）。证据与复现见 `research/06-runtime-validation/`（`report-nofee.md`、`runs.json`、`raw/`、`harness/consumer.ts`）。另做零 provider 调用的预检：注入授权密钥后模型解析可用，`set_model deepseek/deepseek-flash` 成功，`before_provider_request` 计数 0；新鲜隔离配置默认模型为 `deepseek-v4-pro`，需显式指定所需模型。真实子代理/用量/耗时/并行嵌套/续跑/取消/后台等待/查看席位等场景**全部未运行**，必须待用户裁决模型、最大执行次数与数值费用上限后再跑（HITL）；后续结果必须附实际命令、退出状态及脱敏证据；本任务本身不承诺现成接口足够。
- 真实调用阶段（2026-10-16，限额 deepseek-flash/≤4 子代理/≤¥5）：实际 spawn **5** 次（超额 1 次——首轮嵌套父 P1 因我未给默认 agent 配置 `allowed_subagents` 而无效，补测需父+子两次）。总费用 ≈ $0.0038（≈¥0.027），`usage.cost.total` 每次都可得，未触发“重试一次/放弃”策略。已验证：`spawn→started→completed`；终态事件带 `status/toolUses/durationMs/tokens/usage`；两个 detached spawn 并发运行；**嵌套仅在 agent 定义声明 `allowed_subagents` 时可用**（默认 `general-purpose` 无 `Agent` 工具），opt-in 父代理成功调用 Agent 工具生成嵌套子代理（toolResult "OK"，579ms），该子代理无顶层事件、无独立 session 文件、用量折算进父记录；`stop` 对已结算代理返回 `Agent is not running`；根会话 provider 调用 0（同一事件内 `consume` 抑制通知）。未验证（额度用尽，非候选结论）：在途取消、逐请求事实、workflow 子代理、同会话续跑、后台等待/关轮输入、查看席位。证据：`research/06-runtime-validation/report-live.md`、`live-runs.json`、`raw/`、`harness/`。
- 第二轮（2026-10-16，用户追加 +8 子代理 / +¥5）：本轮 spawn 7 次，累计 **12 次 = 累计批准 12 次**；累计费用 **$0.011324 ≈ ¥0.08**（含根/子会话，低于累计 ¥10）。已验证：在途取消（`stop`→`{success:true}`，终态 `subagents:failed` / `status=stopped`）、错误信封（`cwd` 不存在 / 未知模型）、逐请求（子会话转录有逐 assistant `usage`+分项 `cost`，总线无）、后台等待与通知自动继续（`custom_message` 触发新的根 provider 调用）、同会话续跑（`get_subagent_result(wait=true)` 后同一 id 重发 `created`+`started`，终态 `SECOND`；RPC 面无 resume）、workflow（运行期零 `subagents:*` 事件，journal 记录结果，通知为 `custom_message`）、查看席位（仅 `/agents` 命令与 widget，无公开 read/subscribe）。按用户策略：取消运行的费用读数两次均不可得（终态 `usage/tokens=null`、转录 `usage` 全 0）→ 该用例**费用读取放弃**，行为证据保留。仍未覆盖：强制 `error` 终态；`steer`/mention（`F-INPUT`）未执行。基线行对照见 `research/06-runtime-validation/report-live.md` 的“基线行对照”节。
- Backtracer 追溯（2026-10-16）：沿本票发布结果（`lighthouse/06-tintinweb-runtime-validation.md`）与上游 authority（`lighthouse/01`、`lighthouse/02`）核对完整能力行、提供方选择、缺口处理、组织落点与验收。运行揭示的缺口（嵌套身份/会话、逐请求、查看席位、取消运行费用）均落在 03（逐项缺口处理与补接口/上游路线）、04（接口边界、订阅寿命、身份归一）、05（完整功能验收，含 `unavailable`）的问题范围内，**无无主缺口**；未发现与已批准上游结论矛盾的运行事实（tintinweb“无公开 session 身份/无枚举/无 resume/顶层过滤”被运行印证）。`F-INPUT`（steer/mention）与 `F-LIFECYCLE-IMPL`（子会话重激活）的未验证项已写在报告内，分别归输入映射与适配组织，不新增 ticket；未修改其他票状态/claim。
- 收尾与清理（2026-10-16）：运行进程全部退出、无遗留子进程；按票要求移除临时运行工作区 `E:/Developer/pi-playground/wf06-iso`（含临时安装的候选与观察脚手架），日常 `~/.pi/agent` 与 `dskey.txt` 未改动；脱敏证据、harness 与复现命令保留在 `research/06-runtime-validation/`，工作区可由 `harness/` 重建。

## Question

在本机 Windows 与当前 pi 宿主上，固定版本 tintinweb 子代理扩展能否加载并通过公开接口向一个独立消费者提供 OMP 能力基线所需的事实？完成隔离安装与可复查的真实运行验证，使用户能够基于实际证据选择提供方及缺口处理路线，而不是交付生产迁移。

## Execution boundaries

- 使用隔离的 agent/config/session/project 目录；先核对 pi 支持的隔离入口，不能仅改变 cwd 就假定用户级配置、自动加载扩展、会话文件和凭据写入均已隔离。
- 不修改日常 pi 配置、不做全局安装或正式切换、不改候选源码来冒充原版能力，不实现生产 adapter，不复制 model-cost/shared-logic/framework 语义。
- 采用临时最小消费者记录公开事件/RPC/registry 读数；不主动 consume/stop 不属于验证场景的任务。不得用生产 agent 权限执行无关操作。
- 只读内部数据可以帮助定位，但不计作公开接口覆盖；模拟 provider 或人工注入事件只能验证观察脚手架，不能替代真实子代理、用量或费用验证。
- 只在专用临时项目中运行，子代理不授予日常仓库写权限。依赖安装和启动遵循包实际需求，记录版本、命令和环境差异。
- 遵循 [测试约定](../../../docs/agents/testing.md)；真实宿主运行是核心证据，不新增永久实现测试。需要判断界面体验时另行请求 HITL prototype；本任务仅核实可观察事实。

## Verification matrix

| 场景 | 必须观察或明确记为未验证的事实 |
| --- | --- |
| 安装、加载与清理 | Windows 与 pi/Node/Bun 版本；候选固定工件；依赖是否兼容；ready/ping 可用性；退出后资源释放；日常配置未受影响 |
| 单个子代理 | 实际子会话 id、直接父会话/Owner 所需事实、名称、启动模型/effort；消费者可见性与事件顺序 |
| 逐请求用量 | 实际请求开始/响应结束、模型与可靠 usage；聚合值是否掩盖多 Turn；与候选会话记录对照，不将缺失计为零，不将 provider cost 当成 model-cost 请求锚价 |
| 并行与嵌套 | 各实际会话与执行可区分；直接父链；是否遗漏嵌套子代理、重复或串归属 |
| workflow 子代理 | 顶层事件过滤的实际效果；是否存在其他受支持的只读观察入口；无入口也应形成可复查证据 |
| 同会话续跑 | 会话身份是否延续；新执行能否区分；累计用量与执行耗时如何变化，是否把空闲间隔误算为执行时长 |
| 取消和失败 | 在途取消、错误后已报告用量、终态事实、晚到事件及重复交付；以可控真实路径验证，不破坏外部服务 |
| 后台等待与关轮输入 | 父会话等待期间，运行/排队/后续自动继续事实是否可见；不要求候选输出 framework Round，而是核对可供既有框架合成的事实 |
| 查看子会话 | 区分“能打开 viewer”与“独立消费者能读取/订阅当前查看目标”；不以可视界面存在证明事实接口存在 |

## Acceptance and evidence

- 产出一个脱敏验证报告及必要原始日志，按 OMP 基线行标识关联每项场景、实际命令、版本、观测结果和限制；报告位置与隔离环境路径写回本 Handoff。
- 每项区分：运行证实可取得、事实存在但需适配、公开接口缺失、环境/兼容失败、证据不足或未验证。不以未收到事件直接证明不存在：记录安装/激活状态、触发路径及监听范围，并结合源码解释边界。
- 对关键数据以真实会话/执行记录交叉检查；观察扩展不自行重建计费与公共语义来制造“覆盖”。
- 发现即使补映射也无法得到的事实，交给选型和适配组织票决策；不擅自降低基线、修改上游或批准 fork。
- 验证失败可作为完整事实结果；范围内未执行场景必须说明具体原因，不能把无费用 smoke 或模拟结果称作全量验证完成。若模型/消费权限未确定，保存 Handoff 并保持 open，而不是假报通过。
- 运行完成后停止专用进程，移除临时观察脚手架与无须保留的运行产物；保留脱敏证据和复现指引，不删除任何日常文件。票按 Wayfinder Lighthouse/Backtracer 发布后才能 resolved。

## Comments

- 用户确认的本轮动作是新增独立验证任务；最终选择哪个扩展及取舍仍由用户决定。本任务可在已有研究证据上准备，不等待提供方已获选，否则会形成选型与验证的循环依赖。
