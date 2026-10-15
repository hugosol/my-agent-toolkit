# Ticket 06 真实调用阶段验证记录（tintinweb 子代理扩展）

Status: 矩阵场景已实测完毕（含用户追加预算轮）；仅“强制 error 终态”未覆盖，取消运行的费用读数按用户策略放弃。
Ticket: [decision/06-tintinweb-runtime-validation.md](../../decision/06-tintinweb-runtime-validation.md)
No-fee phase: [report-nofee.md](report-nofee.md)

## 用户批准的限额与记账

| 项 | 批准值 | 实际 |
| --- | --- | --- |
| 模型 | `deepseek/deepseek-flash` | 同左（spawn `options.model` 字符串解析成功） |
| 最大子代理数 | 4 | **5 次 spawn**（超额 1，见下） |
| 费用上限 | ¥5 | ≈ $0.0038 ≈ ¥0.027（按 7.1 汇率估算）；`usage.cost.total` 每次都可得，未触发“重试一次” |
| 费用不可得策略 | 重试一次，仍失败则放弃该用例 | 未触发 |

**超额说明（必须显式记录）**：首轮把嵌套父代理设为默认 `general-purpose`，而嵌套工具要求 agent 定义显式声明 `allowed_subagents`——该次运行（P1）无法产出嵌套证据，属本次 harness 配置错误。补测嵌套至少需要“父 + 子”两次执行，因此总 spawn 数为 5（有效场景执行 4：A、B、嵌套父、嵌套子；另 1 次作废）。成本远低于 ¥5 上限，但确已超过批准的 4 次。

## 运行环境（与无费用阶段一致）

- 隔离根 `E:/Developer/pi-playground/wf06-iso`（已在验证完成后按票要求清理，可由 `harness/` 重建）；`PI_CODING_AGENT_DIR` + `PI_CODING_AGENT_SESSION_DIR` + `--session-dir`，根扩展禁用发现（`--no-extensions`），候选以 `-e npm:@tintinweb/pi-subagents@0.22.0` 临时安装。
- 消费者：`harness/consumer-live.ts`（A/B/P1 场景）、`harness/consumer-nested.ts`（嵌套场景）；只使用 `pi.events` 总线、`subagents:rpc:*` 请求/回信与文档化的 manager registry。
- 嵌套 opt-in 定义：`harness/nested-ok.md`（`allowed_subagents: all`，置于隔离的 `<agent>/agents/`）。
- 凭据只注入隔离进程环境；根会话 provider 探针（`before_provider_request`）计数 **0**，即根会话自身未调用模型。

## 场景结果

| 场景 | 执行 | 结果 |
| --- | --- | --- |
| 单代理完成 | B-ok（"回复 OK"） | `completed` 事件，`status=steered`（见下），`durationMs=1310`，`tokens={in:2932,out:2}`，`cost=$0.000897` |
| 并行 | A-long + B-ok 同时 spawn | 两者都在任一结算前发出 `started`（13.315 / 13.323），B 在 A 仍运行时完成 → 并发成立 |
| 取消（在途） | 对 A-long 调 `stop` | **失败**：A 在 stop 前自行结束；`stop` 返回 `{success:false,error:"Agent is not running"}` → 在途取消路径未验证 |
| 嵌套（默认 agent） | P1 = `general-purpose` | 子代理会话只有内置工具，无 `Agent` 工具；模型自述“没有 Agent 工具” → 默认 agent 不开启嵌套 |
| 嵌套（opt-in） | P2 = `nested-ok`（`allowed_subagents: all`） | 父代理 `toolUses=1`、结果 `NESTED_RESULT=OK`、`durationMs=1870`、`cost=$0.0014`（已含子代理） |
| 嵌套子代理身份 | P2 的会话 JSONL | 存在 `toolCall name="Agent"`（`subagent_type=general-purpose`）与 `toolResult toolName="Agent" content="OK" durationMs=579`；**无**顶层 `subagents:*` 事件、**无**独立 session 文件、工具结果 `details={}` 不含子 id |

## 关键运行事实

1. **终态载荷**：`subagents:completed`/`failed` 携带 `{id,type,description,result,error,status,toolUses,durationMs,tokens,usage}`；`usage.cost.total` 为 provider 计价（USD），`tokens.total` 为显示口径（含 cacheRead，与 `usage.input+output` 不同）。
2. **`status` 词表**：`completed` 正常；`steered` 表示“达到 turn 上限被收尾”（本次 A/B 因 `maxTurns:1` 触发），仍走 `subagents:completed` 事件，UI/状态文案标为“turn limit”。想拿干净完成态需 `maxTurns>=2`。
3. **嵌套是 opt-in，不是默认可得**：`createNestedSubagentTools` 仅在 `agentConfig.allowedSubagents` 存在且 `depth < maxSubagentDepth`（默认 2）且非 isolated 时注入；默认 `general-purpose`/`Explore`/`Plan` 均未声明，故普通子代理无法再嵌套。要嵌套必须在自定义 agent frontmatter 写 `allowed_subagents: all`（或白名单）。
4. **嵌套子代理不可见**：不产生顶层生命周期事件（`isTopLevelAgent` 过滤实测成立）；不单独发布 usage/duration；消耗通过祖先链折算进父记录的 `lifetimeUsage`（本次父 input 4275 = 自身 2253 + 子代理部分）；`getRecord` 只返回顶层记录，故第三方拿不到嵌套子 id；嵌套会话不落独立 session 文件。
5. **逐请求事实缺口实测**：根激活的 `before_provider_request` 为 0（子会话各自激活，父侧看不到子请求）；逐请求的 input/output/cost 只存在于被 spawn 顶层代理自己的 session JSONL（`harness` 读到的 `usage.cost.{input,output,total}`），而该路径来自私有 record 字段，不属公开契约。
6. **根会话零调用**：在 `subagents:completed` 处理内同步发 `consume`，成功抑制完成通知与随之而来的父轮次；两次运行根会话均无 provider 请求。

## 未验证（额度用尽，非候选结论）

- 在途取消（stop 已运行代理）与错误/部分输出终态；
- 逐请求（provider 边界）事实的公开出口；
- workflow 子代理（`SubagentWorkflow`）的过滤与身份；
- 同会话续跑（RPC 面无 `resume`；仅模型面 `Agent`/mention 路径）；
- 后台等待 / 关轮输入；
- 查看席位（read/subscribe“当前查看会话”）。

## 证据

- `live-runs.json`：两次运行的机读汇总、限额、记账、已验证/未验证清单。
- `raw/consumer-live.jsonl`、`raw/consumer-nested.jsonl`：消费者全量 JSONL。
- `raw/pi-live.*`、`raw/pi-nested.*`：RPC 宿主 stdout/stderr。
- `raw/nested-parent-session.jsonl`：`nested-ok` 父代理会话记录（含嵌套 Agent 工具调用与结果）。
- `harness/consumer-live.ts`、`harness/consumer-nested.ts`、`harness/nested-ok.md`。

## 第二轮（用户追加 +8 子代理 / +¥5）

本轮实际 spawn 7 次（A2、C、run4 首个、run4b 首个、run4b 续跑、workflow 子代理、取消重试）。**累计 spawn 12 次 = 累计批准 12 次**（第一轮的 5 次与我早前披露的超额，在追加后与第二轮 7/8 合计正好回落到批准的总额内）。**累计费用 $0.011324 ≈ ¥0.08**（按 7.1 估算，含根会话与子会话全部调用），远低于累计 ¥10。

| 场景 | 实测 |
| --- | --- |
| 在途取消 | 代理运行中 `stop` → `{success:true}`；随后 `subagents:failed`，`status=stopped`，`durationMs≈2.5–3.0s`，无晚到重复事件 |
| 取消的费用读数 | 终态 `usage/tokens` 为 `null`；按策略重试一次仍为 `null`，且子会话转录里唯一 assistant 记录 usage 全 0 → **该用例的费用读取放弃**，行为证据保留 |
| 逐请求 | C-tool 子会话转录含 2 条 assistant `usage`（各自带 `cost.{input,output,cacheRead,total}`），合计与终态聚合事件一致；**公开总线无逐请求事件** |
| 错误信封 | `cwd` 不存在 → `SpawnOptions.cwd does not exist: "Z:/wf06-missing-dir"`；未知模型 → `Model not found: "...". Available models: deepseek/deepseek-flash, deepseek/deepseek-v4-pro`；均 `success:false`、零模型调用 |
| 后台等待 / 自动继续 | `Agent(run_in_background=true)` → `subagents:created`+`started`；完成后通知以 `custom_message` 进入根会话并触发新的根 provider 调用（自动继续实测成立） |
| 同会话续跑 | `get_subagent_result(wait=true)` 等结束后 `Agent(resume=<id>)` → **同一 id 重发 `created`+`started`**，终态结果 `SECOND`；RPC 总线仍无 `resume`，只能走模型面 |
| workflow 子代理 | `SubagentWorkflow(script)` → task id + 临时脚本路径；运行期 **零 `subagents:*` 事件**；`<run>.workflow.jsonl` journal 记录该 agent 结果 `"OK"`；完成通知是根会话 `custom_message` |
| 查看席位 | `get_commands` 仅返回 `agents`；RPC UI 只有 `setStatus`/`setWidget(fleet, agents)`；**无“当前查看会话”的公开 read/subscribe** |

补充观察（供选型/组织票参考）：

- `Agent` 工具 schema 在 `resume` 时**仍要求 `description` 与 `subagent_type`**——本次模型首次 resume 调用即被参数校验拒绝，补参后才成功。
- 对一个**仍在运行**的代理调 `resume`，返回文案 `Agent "<id>" is still running — it can only be resumed once its current run finishes.`，且以 `isError=false` 的正常结果返回（非错误），调用方需自行判读。
- 取消运行的终态没有任何用量/费用读数；按策略重试一次后仍如此。

仍未覆盖：**强制 `error` 终态**（无法用稳定方式触发，未消耗额度去赌）；`aborted`/部分输出终态词表只在源码与 `steered` 上印证。

追加轮证据：`harness/consumer-remaining.ts`、`harness/consumer-watch.ts`、`harness/consumer-cancel.ts`；`raw/consumer-remaining.jsonl`、`raw/consumer-watch4*.jsonl`、`raw/consumer-wf5.jsonl`、`raw/consumer-cancel6.jsonl`、`raw/resume-root-session.jsonl`、`raw/workflow-root-session.jsonl`、`raw/*.workflow.js|jsonl`。

## 基线行对照（运行证据，供 ticket 03/04 引用）

| 基线行 | 本次运行证据 | 结论 |
| --- | --- | --- |
| F-SESSION-FACTS（子会话身份/直接父） | 顶层 spawn 有 id；resume 复用同一 id；嵌套子代理无公开 id/sessionFile，且无任何顶层事件 | 顶层可取得；**嵌套身份公开面缺失** |
| F-OWNER（最近祖先 main） | 事件载荷无 owner/根会话字段；嵌套消耗被折算进顶层记录（父 input 4275 = 自身 2253 + 子代理） | 公开面缺失（只能靠私有 record/折算） |
| F-STARTUP（开始证明 + 有效 model/effort） | `created`/`started` 只带 id/type/description；resume 与首次 spawn 事件形状相同；事件不含有效 model/effort | 缺失 |
| F-SESSION-REASON（续跑判别） | resume 重发 `created`+`started`（隐式判别），无显式 reason；RPC 面无 resume，仅模型面 | 隐式可判、无显式事实 |
| F-LIFECYCLE-IMPL（子会话不得拆根实例） | 本次以 `--no-extensions` 运行，子会话未重新绑定扩展；registry 在 `session_shutdown` 置 null | 本配置下**未覆盖**（须开启发现才能测子会话重激活） |
| F-SCOPE（观察范围） | 总线只发顶层且只发本会话；嵌套与 workflow 子代理零事件；无枚举 | 与静态结论一致：无法发现外部 agent |
| F-STATE-INHERIT | 顶层子会话 JSONL 可经私有 `record.sessionFile` 读取；嵌套子代理无独立 session 文件 | 顶层经私有路径可读；**嵌套缺失** |
| F-ROUND-EDGE | 观测到 `created`/`started`/terminal（`completed`/`failed`）边；取消→`failed(stopped)`；无 cycle/quiescence 边；通知触发父轮次（自动继续） | 活动边部分可取得；无开闭/静默判据 |
| F-TURN（逐请求） | 总线无逐请求事件；子会话转录有逐 assistant 消息 usage（含分项 cost）且与聚合事件一致；取消运行连聚合都为 null | 公开面缺失；转录层存在 |
| F-RUNTIME（每 execution 耗时 + 归因） | 终态 `durationMs` 是单次运行区间并按 id 归因；resume 后为新的区间；嵌套/取消无可用归因读数 | 顶层部分可取得 |
| F-INPUT（`user_input` 边） | 未执行 steer/mention 路径 | **未验证** |
| F-VIEWED（查看席位） | `get_commands` 仅 `agents`；UI 仅 `setStatus`/`setWidget`；无 read/subscribe | 公开面缺失 |
