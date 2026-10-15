# 06: tintinweb 子代理扩展的本机隔离验证：Lighthouse

> Question and discussion: [tintinweb 子代理扩展的本机隔离验证](../decision/06-tintinweb-runtime-validation.md)

## Question

在本机 Windows + 固定 `@earendil-works/pi-coding-agent@1.2.0` 上，`@tintinweb/pi-subagents@0.22.0` 能否加载，并通过公开接口向独立消费者提供 OMP 子代理能力基线所需的事实？本发布给出实际运行结论、证据等级与限制；不批准提供方选择，不批准适配组织或能力降级，也不宣称基线已被完整满足。

## Discussion

### 验证范围、限额与证据等级

- 用户批准的真实调用限额累计为**模型 `deepseek/deepseek-flash`、最多 12 次子代理执行、费用上限累计 ¥10**（先 4 次/¥5，后追加 8 次/¥5）；并要求必须验证**嵌套子代理**。费用读数不可得时**重试一次，仍不可得则放弃该用例**（确认来源：本会话用户两轮回答，2026-10-16）。
- 实际使用 **12 次 spawn（= 累计上限）**，累计费用 **$0.011324 ≈ ¥0.08**（含根会话与子会话全部 provider 调用，按 7.1 估算），远低于 ¥10。两次取消用例的费用读数按策略重试后仍不可得，属放弃项而非通过项。
- 证据等级：**真实宿主、真实 provider 的运行观察**（隔离安装、RPC 驱动、最小第三方消费者）；不是生产迁移验证，也不覆盖未来版本或其它平台。逐场景原始日志、脱敏报告与可复现 harness 见源票 Handoff 与 `research/06-runtime-validation/`。

### 运行环境与隔离

- `PI_CODING_AGENT_DIR` + `PI_CODING_AGENT_SESSION_DIR` + `--session-dir` + `--no-extensions` 完成隔离；候选以 `-e npm:@tintinweb/pi-subagents@0.22.0` 临时安装，运行期实机核对 name/version/`pi.extensions: ["./src/index.ts"]`/deps `croner`,`nanoid` 与固定版本一致。
- 日常 `~/.pi/agent` 前后快照无变化，日常 extension 未被加载，node 进程数不变，退出码 0。**限制**：临时 npm 工件退出后仍留在 `<agent>/tmp/extensions/npm/<hash>`；以 `--no-extensions` 运行意味着本发布**没有**验证子会话重新绑定该扩展的行为（`F-LIFECYCLE-IMPL` 未覆盖）。

### 公开接口的运行事实

- **发现与握手**：`subagents:ready {}`、`subagents:scheduler_ready {sessionId,jobCount}`、`ping → {success:true,data:{version:2}}`；registry 键为 `getRecord,hasRunning,spawn,waitForAll`，`session_shutdown` 后置 null；注册工具 `Agent`/`SubagentWorkflow`/`get_subagent_result`/`steer_subagent`。
- **生命周期与用量**：RPC `spawn` 返回 id；`created`（仅模型面后台 spawn）与 `started`；终态 `subagents:completed`/`failed` 携带 `status/toolUses/durationMs/tokens/usage`（`usage.cost.total` 为 provider 计价 USD）。`status=steered` 表示撞到 turn 上限收尾，仍走 `completed` 事件。
- **并发**：两个 detached spawn 可同时在运行中（默认 `maxConcurrent=10`），均在任一结算前发出 `started`。
- **嵌套**：嵌套工具**仅在 agent 定义声明 `allowed_subagents` 时注入**（默认 `general-purpose`/`Explore`/`Plan` 均未声明，子代理会话没有 `Agent` 工具）。opt-in 后父代理成功调用 `Agent` 生成真实嵌套子代理：该子代理**无任何顶层 `subagents:*` 事件、无独立 session 文件、工具结果不含其 id**，其消耗被折算进父记录的 `lifetimeUsage`。
- **续跑**：RPC 面**没有 `resume`**；模型面 `Agent(resume=<id>)` 在目标已结束后可续跑，**同一 id 重发 `created`+`started`**，终态结果为新一次运行结果。对仍在运行的代理续跑被拒绝；`Agent` schema 在 resume 时仍要求 `description`/`subagent_type`。
- **workflow**：`SubagentWorkflow(script)` 后台运行，运行期对 workflow-owned 代理**零 `subagents:*` 事件**；结果落在 `<run>.workflow.jsonl` journal 与根会话的 `custom_message` 完成通知里。
- **取消**：对运行中代理 `stop` → `{success:true}`，终态 `subagents:failed`/`status=stopped`；**取消运行的 `usage/tokens` 为 null**（转录里对应 assistant 记录 usage 全 0），重试一次仍不可得。
- **通知与自动继续**：完成通知以 `custom_message` 进入父会话并可触发新的父轮次（自动继续），父轮次会真实产生 provider 调用与费用。
- **观察范围与席位**：总线只出现本会话顶层代理；无枚举、无跨会话、无嵌套/workflow 子代理。`get_commands` 仅 `agents`，UI 侧只有 `setStatus`/`setWidget`；**没有“当前查看会话”的公开 read/subscribe**。
- **逐请求**：公开总线**无**逐请求（provider 边界）事件；逐 assistant 消息的 `usage`（含分项 `cost`）只存在被 spawn 代理自己的会话转录里，且其合计与终态聚合事件一致。
- **错误信封**：`cwd` 不存在 → `SpawnOptions.cwd does not exist: "..."`；未知模型 → `Model not found: "..."` + 可用模型列表；均 `success:false`，不产生模型调用。

### 缺口与未覆盖（不得当作通过）

- 公开面缺口（运行证实）：嵌套与 workflow 子代理的身份/会话/用量归因；root 观察者无法取得任何嵌套子代理 id；逐请求事实无公开出口；viewed 席位无公开 read/subscribe；取消运行无费用读数。
- 未覆盖项：强制 `error` 终态（无法稳定触发）；`steer`/mention 输入路径（`F-INPUT`）未执行；`--no-extensions` 下未测子会话重激活（`F-LIFECYCLE-IMPL`）；未测跨平台与未来版本。
- 本发布**不含**提供方选择结论，也不把上述缺口判定为“必须修改上游”或“必须降级”。

---

## Decision

发布 tintinweb `@tintinweb/pi-subagents@0.22.0` 在 Windows + pi 1.2.0 隔离环境下的真实运行结论：其公开总线足以支撑“只观察自己 spawn 的顶层代理”的发现/启动/终态观测/停止路线；嵌套与 workflow 子代理在公开面不可见，逐请求与查看席位无公开出口，取消运行无费用读数，嵌套还需 agent 定义显式 opt-in。选择提供方与缺口处理路线仍归后续决策票。

## User stories

1. 作为提供方选型者，我需要 tintinweb 公开面在真实宿主上的逐项事实，以便判断哪些基线缺口要补接口、哪些只能适配或标记 unavailable，而不是被静态结论或现成接口的启动演示误导。
2. 作为适配组织设计者，我需要嵌套/workflow/取消/续跑的可观察边界，以便把身份归一、订阅寿命与费用处理放在正确层，且不假设嵌套子代理有独立可读会话。
3. 作为完整迁移方案的验收设计者，我需要每项事实的验证状态与限制，以便为“费用不可得”“逐请求缺失”“查看席位缺失”等项写出可判定的验收，而不是把它们当作零或通过。

## Preconditions

- 固定工件 `@tintinweb/pi-subagents@0.22.0`、宿主 pi 1.2.0、隔离的 `PI_CODING_AGENT_DIR`/会话目录与显式 `-e` 装载方式可用；DeepSeek 凭据可注入隔离进程环境。
- 消费方接受本发布只覆盖本机 Windows + 该宿主版本，且按 `research/06-runtime-validation/` 的复现命令与已记录的未覆盖项解释结论。
- 提供方选择、组织落点与完整方案仍由 03/04/05 决定；本发布不解除这些依赖。

## Postconditions

- 下游可直接引用 `report-live.md` 的“基线行对照”与 `live-runs.json` 的机读事实，无需重跑真实调用即可区分“公开可取得 / 需适配 / 公开面缺失 / 未验证”。
- 未覆盖项与限制（强制 error 终态、steer 输入、子会话重激活、跨平台、未来版本、取消运行费用）必须显式保留，不得写成通过。
- 嵌套子代理无公开身份/会话、workflow 子代理零总线事件、取消运行无费用读数这三条成为下游必须处理的既有事实。

## Invariants

- 逐项事实按 OMP 基线行标识（`F-*` 等）组织，并区分公开契约、私有记录字段与转录层证据；私有字段（`record.sessionFile` 等）不计作公开覆盖。
- 复用同一份 extension definition/shared-logic、宿主机制归 adapter 或 extension harness 的地图约束继续有效；本发布不裁定具体落点。
- 不把 model-cost 消费子集当作完整基线，不把静态研究结论升级为运行结论，也不因本发布批准任何提供方、fork 或能力降级。
