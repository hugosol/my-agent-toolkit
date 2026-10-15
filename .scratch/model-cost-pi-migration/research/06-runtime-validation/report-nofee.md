# Ticket 06 无费用阶段验证记录（tintinweb 子代理扩展）

Status: 无模型费用的安装/加载/发现/RPC/清理部分已完成；真实子代理场景待 HITL 限额后执行。
Ticket: [decision/06-tintinweb-runtime-validation.md](../../decision/06-tintinweb-runtime-validation.md)

## 范围与结论口径

- 本文件只记录**运行观察**，不批准提供方、入口路线、fork 或上游贡献，也不宣称候选满足能力基线。
- 本轮**未调用任何模型**、未启动任何真实子代理、未产生任何 provider 费用。
- 覆盖：固定工件的临时安装、扩展加载与工具注册、`subagents:ready`/registry/`ping` 发现、stop/consume 负向 RPC 信封、进程退出与资源释放、宿主隔离性。
- 未覆盖：全部需要真实子代理或模型调用的场景（单代理、逐请求用量、并行/嵌套、workflow、续跑、取消/失败、后台等待、查看席位）。

## 隔离环境与命令

- 隔离根：`E:/Developer/pi-playground/wf06-iso`（`agent/` 为 `PI_CODING_AGENT_DIR`，`sessions/` 为会话目录，`project/` 为空工作目录）。
- 事实：`pi 1.2.0`（与本票固定宿主 HEAD `4a5d372` 一致）、`node v24.18.0`、`Windows 10.0.26200`。
- 调用：

```text
pi --mode rpc --no-session \
   --no-extensions --no-skills --no-prompt-templates --no-context-files --no-mcp \
   --session-dir <iso>/sessions \
   -e npm:@tintinweb/pi-subagents@0.22.0 \
   -e <iso>/consumer/consumer.ts
```

- 环境变量：`PI_CODING_AGENT_DIR=<iso>/agent`、`PI_CODING_AGENT_SESSION_DIR=<iso>/sessions`、`PI_SKIP_VERSION_CHECK=1`、`PI_TELEMETRY=0`。
- 消费者扩展：`harness/consumer.ts`，只通过 `pi.events` / `pi.getAllTools()` / `globalThis[Symbol.for("pi-subagents:manager")]` 观察并写 JSONL。

## 隔离性证据

- 运行前后对 `~/.pi/agent` 递归快照（路径+大小+mtime）：**无变化**。
- 日常 `~/.pi/agent/extensions/herdr-agent-state.ts` 与日常 npm 包目录存在，但未被加载（`--no-extensions` 生效）。
- 候选以 npm 临时作用域安装到 **`<iso>/agent/tmp/extensions/npm/f35b2129/node_modules/@tintinweb/pi-subagents`**，未触碰日常 npm 目录。
- node 进程数运行前后均为 3；进程退出码 0。

## 观察结果

| 项 | 实测 | 证据 |
| --- | --- | --- |
| 固定工件 | `@tintinweb/pi-subagents@0.22.0`，入口 `pi.extensions: ["./src/index.ts"]`，deps `croner ^10.0.1` / `nanoid ^5.1.16`，peers `@earendil-works/pi-{ai,coding-agent,tui} >=1.1.0`、`typebox *` | `runs.json`、运行期 package.json |
| 加载 | 候选工厂与消费者工厂均执行；`pi.getAllTools()` 在工厂期抛 `Extension runtime not initialized`（pi 行为，非候选问题） | `raw/consumer-1.jsonl` |
| 发现 | `subagents:ready` 载荷 `{}`；`subagents:scheduler_ready` 载荷 `{sessionId, jobCount}` | 同上 |
| RPC ping | 首个请求即收到 `{ success: true, data: { version: 2 } }`，`PROTOCOL_VERSION=2` 成立 | 同上 |
| RPC 负向 | `stop{agentId:不存在}` → `{success:false,error:"Agent not found"}`；`consume{agentId:不存在}` → `{success:false,error:"Agent not found or still running"}` | `raw/consumer-2.jsonl` |
| registry | factory/session 期键恒为 `getRecord, hasRunning, spawn, waitForAll`；`session_shutdown` 后置 `null` | 同上 |
| 工具注册 | `Agent`、`SubagentWorkflow`、`get_subagent_result`、`steer_subagent`（另加 pi 内置 8 个） | 同上 |
| RPC 模式 UI | 候选在 RPC stdout 发 `extension_ui_request`：`setWidget(agents)`、`setStatus(subagents)` | `raw/pi-1.stdout.jsonl` |
| 退出 | `session_shutdown reason=quit`，退出码 0 | 同上 |

## 需要后续注意的运行事实

- **临时 npm 工件退出后仍保留**：`<agent>/tmp/extensions/npm/f35b2129` 在进程退出后仍存在（重复运行复用该目录）。即“临时”作用域按内容缓存而非进程级清理；隔离环境内无害，但“退出后资源释放”一项只能记为**进程与 registry 已释放、磁盘工件未清理**。
- `ping` 的回信相对 `emit` 是异步到达的（本次日志中 stop/consume 同步回信先于 ping 回信）；消费者必须按请求 id 订阅回信频道，不能假定同步。
- 工厂期不能调用 `pi.getAllTools()` 等 action 方法；消费者若要在扩展加载期登记，只能使用 `pi.on`/`pi.events`。

## 凭据与模型选择预检（零 provider 调用）

- 第三次运行注入 `DEEPSEEK_API_KEY`（内容读自授权文件，只进隔离进程环境，未落盘、未出现在命令行与日志），其余参数与上相同，通过 RPC 依次发 `get_state` → `set_model` → `get_state`，不发送任何 prompt。
- 结果：新隔离配置的默认模型为 `deepseek/deepseek-v4-pro`；`set_model deepseek/deepseek-flash` 返回成功，随后 `get_state` 报告 `deepseek/deepseek-flash`。
- 消费者扩展的 `before_provider_request` / `after_provider_response` 探针**未触发**（计数 0），即本预检零 provider 调用；候选仍正常 `ready` 与 `ping→version 2`。
- 结论：隔离环境中的凭据注入与模型解析路径可用；真实调用阶段只需决定模型与限额，无需再排查认证接线。若用户未显式指定，新鲜隔离配置会默认用 `deepseek-v4-pro`。

## 复现与原始材料

- `runs.json`：环境、命令、两次运行的结论与未验证清单。
- `raw/consumer-1.jsonl`、`raw/consumer-2.jsonl`：消费者 JSONL 全量日志。
- `raw/pi-1.stdout.jsonl`、`raw/pi-1.stderr.txt`、`raw/pi-2.stdout.jsonl`、`raw/pi-2.stderr.txt`：RPC 宿主输出。
- `harness/consumer.ts`：最小消费者扩展源码。
- 隔离工作区曾为 `E:/Developer/pi-playground/wf06-iso`；验证完成后按票要求清理，现由 `harness/` 与上述命令重建。

## 下一步（HITL）

真实子代理场景需要用户先裁决：模型（`deepseek/deepseek-flash` 或 `deepseek/deepseek-v4-pro`）、最大子代理执行次数、数值费用上限及无法硬性限额时的停止策略。凭据位置已确认为 `E:/Developer/pi-playground/dskey.txt`（仅记录路径，内容不落盘、不出现在命令行）。
