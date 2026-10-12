# OMP 会话与进程模型（事实调查报告）

调查对象：`E:/Developer/myhub/oh-my-pi`（graph project `E-Developer-myhub-oh-my-pi`），重点 `packages/coding-agent`。
版本/基线：工作区 `@oh-my-pi/pi-coding-agent` 18.8.6，HEAD `579da1d661c5cb8d43bc2ddd429ab72e67165ad8`（2026-10-09）。
范围：CLI 启动、主会话、new/switch/resume、SDK、子代理执行、独立终端实例、服务守护进程。
不含：政策建议（删除/保留跨进程协调由决策方判断），也不含 pi 侧结论。

---

## 0. 结论速览

1. **一次 `omp` 启动就是一个独立进程；不存在"全局会话守护进程"接管会话。** 独立终端的第二次启动是第二个 OS 进程，二者各自在自己的进程内托管会话（实测：两个 pid，互为兄弟进程，无共同父守护进程；两者的子进程列表为空；两进程退出后机器上无任何 omp 残留进程）。
2. **单个 CLI 进程内的多会话是纯进程内对象。** `/new`、切换、resume 都走同进程的 `AgentSession.newSession()` / `AgentSession.switchSession()`（源码明言 "the core in-process switch path"）。实测：一个 RPC 宿主进程内 `new_session` 后 pid 不变、sessionId/文件切换。
3. **子代理（task 工具）在同一进程内**，通过 `createAgentSession` 构造新的 `AgentSession`；`detached` 子代理是进程内异步作业（async job），不是新进程。worktree 隔离只是文件级隔离。
4. **跨终端仍然会"碰到同一个会话文件"**，因此存在真正的跨进程协调层：会话文件 publish lock + 每会话所有权 lease（`~/.omp/run/session-owners`，profile 无关）；另一个进程写入同一 live 会话时，规范行为是"搬到新的兄弟文件"，绝不混写原文件（实测复现）。
5. **按需生成的服务守护进程（daemon broker）不托管会话**：它只为服务类进程（后台 bash 服务、LSP mux、blob broker、browser relay、IDA host、终端守护进程等）做监督，按项目/全局 scope 懒启动、空闲 3s 自动退出，属于"客户端进程"的子进程；普通会话启动完全不触碰它。
6. **其它跨进程面（不是会话托管，但确属跨进程）**：`omp collab`/`omp join`（跨终端/跨机器的实时会话共享，host 进程就是会话进程）、`omp ps`/`read proc://`（跨进程查看服务）、GC 互斥锁、共享 SQLite（session/title/prompt-history 索引）。

一句话：**"多会话"在 OMP 里是"每进程多会话 + 多进程各自独立宿主"**；进程之间只共享文件与服务注册表，不共享会话宿主。

---

## 1. 单进程拓扑：谁是谁

### 1.1 入口链（一次启动 = 一个进程）

- `packages/coding-agent/package.json`：`"bin": { "omp": "src/cli.ts" }`。
- `src/cli.ts:577`：`if (isProcessEntry || !Bun.isMainThread) { ... const entry = runCli(process.argv.slice(2)); }` —— 只有真正的 CLI 进程入口才如此进入；`src/cli.ts:481-491` 注释并执行 `if (isProcessEntry) declareWorkerHostEntry();`（仅真实进程入口声明为 worker host，被 import 嵌入时不声明）。
- `src/main.ts:2642-2646`：`main()` → `runCli(...)`；无参数时等价于 `omp launch`。
- `src/main.ts:1707`：`runRootCommand()` 是唯一启动路径，内部 `createSessionManager()`（`src/main.ts:1171`）解析 `--resume/--continue/--fork` 后构造会话；`src/main.ts:2246-2254` 的 `createSession()` 直接调用 SDK 的 `createAgentSession`（**同进程**构造）。
- 交互 TUI：`src/main.ts:603-791` `runInteractiveMode(session, ...)` 在**同一进程**里 `new InteractiveModeConstructor(...)`，会话对象就是 TUI 的直属状态。

### 1.2 一个进程内多会话（new / switch / resume）

- `src/session/agent-session.ts:9604` `async newSession(...)`；`:11139` `async switchSession(sessionPath, options)`。
- `docs/session-switching-and-recent-listing.md:168`：**"`switchSession(sessionPath)` is the core in-process switch path."**，其后整段描述"快照回滚 → `sessionManager.setSessionFile` → 重建消息/模型/tools/上下文"，全程 in-process。
- 多顶层会话同进程：`docs/sdk.md:3`（"The SDK is the in-process integration surface"）、`:5-6`（"If you need cross-language/process isolation, use RPC mode instead"）、`:97-99`（"For multiple concurrent top-level sessions in one process, pass a private `AgentRegistry` to each session."）。
- `src/sdk.ts:2403-2409` 源码注释区分 "Subagents inherit the singleton (the parent's manager)" 与 "Secondary **in-process** top-level sessions"。

### 1.3 子代理（task）执行在同进程

- `src/task/executor.ts:63-68`：子代理执行器直接 `import { createAgentSession } from "../sdk"`。
- `src/task/index.ts:1599` `async #runSpawn(...)` 是每次子代理运行的实现；`:775-776`：`const detached = cfgAsyncEnabled.get(...) && this.session.asyncJobManager !== undefined && !blocking;` —— "detached" 是**进程内异步作业**（由 `AsyncJobManager` 投递 `agent://` 结果），并非新进程。
- `docs/rpc.md:1043-1045`：**"Isolated (worktree) subagents run in-process and are steered the same way."**
- `docs/agent-hub.md`：Agent Hub 的 roster 来自"the session's agent registry and progress events"，并列 "sync task calls and detached background spawns alike" —— 子代理是同一会话注册表里的 agent。
- worktree 隔离（`src/task/worktree.ts`、`task/isolation-runner.ts`）是文件系统/分支级隔离，不改变进程归属。

### 1.4 一个进程会另外生成哪些进程（都不托管会话）

| 类别 | 位置 | 说明 |
| --- | --- | --- |
| worker 子进程（入口复用 `src/cli.ts` + worker selector） | `src/cli.ts:183-190`（`__omp_worker_*` 常量）、`src/subprocess/worker-client.ts:169-178` `resolveWorkerSpawnCmd` | tiny/STT/TTS/JS-eval/stats/mnemopi-embed/tab 等，按需 spawn |
| 服务守护进程（broker 监督） | `src/launch/client.ts:318-334` `#spawnBroker()`、`src/launch/broker.ts:1554` `startDaemonBrokerFromEnvironment` | LSP mux、blob broker、browser relay/共享 Chromium、IDA host、text-predict、terminal 守护进程 |
| bash/PTY 子进程 | `src/exec/`、`crates/pi-shell` | 前台命令 |
| MCP stdio server | `src/mcp/transports/stdio.ts:603` `Bun.spawn(...)` | 每个 stdio MCP server 一个子进程 |

---

## 2. 服务守护进程（broker）：按需、有 scope、会空闲退出，不接管会话

- **懒启动**：`src/launch/client.ts:318-334` 在连接失败时自行 `Bun.spawn(resolveWorkerSpawnCmd(DAEMON_BROKER_WORKER_ARG))` 并 `unref()`；`launch/client.ts:489-506` 定义 scope：`daemonClientForProject(canonicalProjectDir)` / `daemonClientForGlobal(service)`；同进程内按 key 共享（`sharedClients`）。
- **空闲退出**：`launch/broker.ts:45` `DEFAULT_IDLE_GRACE_MS = 3_000`；`launch/broker.ts:1522-1539` `#scheduleIdleShutdown()`。
- **只有用服务时才连**：`read proc://` 内部 URL（`src/internal-urls/proc-protocol.ts:119-121`）、`wait` 工具（`src/tools/wait.ts:78-79`）、bash 把长驻命令转成 service（`src/tools/bash.ts:1057` → `src/launch/services.ts:107-121` `request()` → `daemonClientForProject(session.cwd)`）。
- **跨进程可见性**：`src/launch/presence.ts:98-114` `readLiveDaemonBrokerPid`、`DAEMONS_DIR`；`src/cli/ps-cli.ts:211-214` `omp ps` 通过"project scope 或 global scope"的 broker client 列出/操作服务（`launch/client.ts:326-329` 的错误提示也引导 `omp ps`）。
- **实测**：普通 RPC 会话启动后，观察窗口内运行的 omp 进程只有会话宿主自身（无 broker 进程，`allOmpProcessesWhileBothRunning` 仅两项），隔离 agent 目录里只有 `sessions/*.jsonl` 与 sqlite（`agent.db`、`history.db`、`models.db`、`skill-descriptions.db`）；启动进程的子进程列表为空。注意 broker 运行目录根是机器级、跨 profile 的 `~/.omp/run/daemons`（`packages/utils/src/dirs.ts:1082-1092` `getDaemonRuntimeDir`/`getGlobalDaemonRuntimeRoot`），因此"没有 broker"以进程枚举为准。

---

## 3. 跨进程协调清单（存在的东西，及其归属）

1. **会话文件 publish lock（跨进程写序列化）**：`src/session/session-storage.ts:429-445` 注释明说 "a second terminal runs in another process: without a shared lock its append can land between our freshness check and our rename"；`:456-457` `SESSION_PUBLISH_LOCK_WAIT_MS = 500`；`:566-584` 锁名与 `tryAcquireFileLock`（Windows = 命名互斥量，Linux = abstract socket，其它 Unix = `flock` sidecar）。
2. **会话所有权 lease（跨进程互斥 + 自动让路）**：
   - `src/session/session-manager.ts:1052-1069` `#claimSession()`："Only write paths claim, so the first process to write a session owns it"；
   - `src/session/session-manager.ts:1071-1083` `#sessionOwnedElsewhere()`："A non-owner never writes the session's file: its next write moves this session to a sibling with a new id instead, so two processes never mix their entries in one journal"；
   - `packages/utils/src/dirs.ts:1105-1107` `getSessionOwnersDir()` → **profile-independent** `~/.omp/run/session-owners`（跨终端、跨 profile 同名空间，说明该机制就是为多进程设计的）；
   - 文档规格：`docs/session.md:537-541`（publish lock、lease、"first process to write a session owns it"、兄弟文件搬迁与 `parentSession` 指向、`moveTo()` 拒绝搬走他进程持有的会话）。
3. **collab（主动的跨进程/跨机器实时共享，不是"守护进程托管"）**：`docs/collab.md:3`（"`/collab` shares your running session with other omp instances in real time … the host machine runs the agent and all tools"）、`:55`（每个交互会话可自动作为 host 发布）、`:73`（`omp collab list` 枚举"same omp configuration root … across terminals, projects, and profiles"的 live host）、`:89`（每个 room 发布自己的私有 IPC endpoint：Unix domain socket / Windows named pipe，磁盘只放发现元数据）；`README.md:183` 说明队友从另一个终端 `omp join`。
4. **共享 SQLite 索引**：`history.db`（会话标题索引 + prompt history；见 `docs/session-switching-and-recent-listing.md` 的列表/搜索路径）、`agent.db`、`models.db`。
5. **维护性全局锁**：`src/cli/gc-cli.ts:1932-1948`（"GC already running"）。
6. **服务注册表/进程监督**：见 §2。

反过来，**不存在**的东西：任何"第二个终端附着到第一个终端的 live 会话"的 CLI 机制（没有 attach/singleton 会话宿主）；对 `packages/coding-agent/src` 搜索 `already running|another instance|single instance|singleton|attach to (the) (running|existing)` 只命中了各工具自身的锁（browser relay 端口、gc、JavaScriptCore inspector）与进程内 singleton（Settings/AgentRegistry 等），没有"omp 会话单例"。

> 方法论声明：以上"不存在"是"在上述路径与检索词下未发现 + 拓扑由实测与设计文档共同印证"，不是逻辑证明；若要反证，应检查 ACP/RPC 客户端侧与 `collab` 之外的第三方集成。

---

## 4. 运行时实测（隔离环境，无模型请求）

环境：Windows x64；`bun 1.4.2`；`PI_CODING_AGENT_DIR=<临时目录>/agent`；`ANTHROPIC_API_KEY=probe-placeholder-key`（**占位串**，只为让默认模型解析成功；全程不发送 prompt，不产生模型请求）；OS 进程枚举用 PowerShell `Get-CimInstance Win32_Process`。探针 B 额外设置 `PI_TEST_SESSION_OWNERS_DIR=<临时目录>/owners`，把会话 lease 目录也隔离在临时目录（探针 A 未设置；Windows 上 lease 为命名互斥量，不落盘，见 `session-storage.ts:566-584`）。

### 4.1 探针 A：两个独立 CLI 进程 + 进程内多会话（RPC 模式）

脚本：`.scratch/omp-probe/probe-rpc.ts`；原始输出：`.scratch/omp-probe/probe-result.json`。

命令（实质）：`bun packages/coding-agent/src/cli.ts --mode rpc --no-ui` ×2，串行发送 `get_state` / `set_session_name` / `new_session`。

实测要点（原文摘录）：

```json
"aHost": {
  "pid": 15208,
  "stateA1": { "sessionId": "01a12e61-9077-714a-a9e7-8e480f0019f1",
               "sessionFile": "...\\agent\\sessions\\-tmp-...-projA\\2026-10-12T04-31-48-343Z_01a12e61-9077-....jsonl" },
  "newSession": { "cancelled": false },
  "stateA3": { "sessionId": "01a12e61-98be-7533-ba31-c68192ce06c6",
               "sessionFile": "...\\2026-10-12T04-31-50-462Z_01a12e61-98be-....jsonl" },
  "samePidAcrossSessions": true,
  "sessionIdChanged": true
},
"bHost": { "pid": 26976, "distinctPid": true },
"aChildrenWhileRunning": [],
"bChildrenWhileRunning": [],
"allOmpProcessesWhileBothRunning": [ { "ProcessId": 15208, ... }, { "ProcessId": 26976, ... } ],
"ompProcessesAfterExit": [ 仅 PowerShell 查询进程自身——两个 omp 进程退出后无任何 omp 进程残留 ],
"aExit": 0, "bExit": 0
```

结论：① 同一进程内 `new_session` 只换 sessionId/文件，pid 不变；② 独立启动 = 独立进程，二者无共同守护父进程、无子进程、退出后无残留；③ 整个观察窗口内 `allOmpProcessesWhileBothRunning` 只有这两个 `bun ... src/cli.ts --mode rpc` 进程，没有任何 broker/daemon 进程（broker 的 worker 入口同样是 `cli.ts __omp_worker_daemon_broker…`，会被同一正则命中），隔离 agent 目录内也只有 `sessions/*.jsonl` 与 sqlite 文件——即普通会话启动不拉起任何守护进程。

（同一探针里 `switch_session` 指向已不存在/未物化的文件时，第二个进程在该路径新建了自己的会话 —— 这符合 `docs/session-switching-and-recent-listing.md` 的 "Missing or empty explicit paths … initialize and persist a fresh session" 规则，但不构成本次要验证的 lease 冲突场景，故另做探针 B。）

### 4.2 探针 B：跨进程会话 lease（两个 OS 进程争用同一 live 会话）

脚本：`.scratch/omp-probe/probe-lease.ts` + `probe-lease-driver.ts`；原始输出：`.scratch/omp-probe/probe-lease-result.json`。
holder 进程：`SessionManager.create(cwd)` → `appendMessage` → `ensureOnDisk()` → 保持存活；intruder 进程：`SessionManager.open(holder 的文件)` → `appendMessage` → `ensureOnDisk()`。

实测要点（原文摘录）：

```json
"holder":   { "pid": 19340, "sessionId": "01a12e62-ae85-...",
              "file": "...\\sessions\\-tmp-...\\2026-10-12T04-33-01-573Z_01a12e62-ae85-....jsonl", "size": 656 },
"intruder": { "pid": 9364,  "sessionId": "01a12e62-af73-...",
              "file": "...\\2026-10-12T04-33-01-811Z_01a12e62-af73-....jsonl",
              "targetSizeBefore": 656, "targetSizeAfter": 656,
              "siblings": ["...573Z_01a12e62-ae85-....jsonl", "...811Z_01a12e62-af73-....jsonl"] },
"holderFileAfterIntruder": { "size": 656, "unchanged": true },
"verdict": { "intruderMovedToDifferentFile": true, "holderFileUntouched": true, "distinctProcesses": true }
```

说明：intruder 的写入落到**新的兄弟文件 + 新 sessionId**，holder 的文件字节数不变（未混写）。`ownersDir` 内无文件是预期的：Windows 上 lease 是命名互斥量而非磁盘锁文件（见 `session-storage.ts:566-584`）。

### 4.3 最小启动 smoke

```
$ printf '{"id":"probe-1","type":"get_state"}\n' | bun packages/coding-agent/src/cli.ts --mode rpc --no-ui
{"type":"ready","protocolVersion":1,"supportedProtocolVersions":[1,2],...}
{"type":"response",...}   # get_state
# exit 0
```

---

## 5. 证据索引（claim → 出处）

| # | 结论 | 证据 |
| --- | --- | --- |
| 1 | CLI 入口 = 单进程 | `package.json` bin；`src/cli.ts:481-491,577`；`src/main.ts:2642-2646`；`src/main.ts:1707` |
| 2 | 会话在宿主进程内构造 | `src/main.ts:1171`（createSessionManager）、`:2246-2254`（createSession → SDK）、`:603-791`（in-process TUI） |
| 3 | new/switch/resume 全部 in-process | `src/session/agent-session.ts:9604,11139`；`docs/session-switching-and-recent-listing.md:168`；`src/sdk.ts:2403-2409` |
| 4 | SDK 同进程多会话 | `docs/sdk.md:3,5-6,97-99` |
| 5 | 子代理 in-process（含 detached） | `src/task/executor.ts:63-68`；`src/task/index.ts:775-776,1599`；`docs/rpc.md:1043-1045`；`docs/agent-hub.md` |
| 6 | 独立终端 = 独立进程、无会话守护进程 | 探针 A（§4.1）；`src/launch/client.ts:318-334,489-506`；`src/launch/broker.ts:45,1522-1539` |
| 7 | 跨进程会话写协调（publish lock + lease + 兄弟文件） | `src/session/session-storage.ts:429-457,515-517,566-584`；`src/session/session-manager.ts:1052-1083`；`packages/utils/src/dirs.ts:1105-1107`；`docs/session.md:537-541`；探针 B（§4.2） |
| 8 | 跨进程服务监督（按需 broker、`proc://`、`omp ps`） | `src/launch/services.ts:107-121`；`src/internal-urls/proc-protocol.ts:119-121`；`src/tools/wait.ts:78-79`；`src/tools/bash.ts:1057`；`src/cli/ps-cli.ts:211-214`；`src/launch/presence.ts:98-114` |
| 9 | 跨进程/跨机器 live 会话共享（collab） | `docs/collab.md:3,55,73,89`；`README.md:183` |
| 10 | 其它 worker/MCP 子进程（非会话宿主） | `src/cli.ts:183-190`；`src/subprocess/worker-client.ts:169-178`；各 spawn 点（见 §1.4）；`src/mcp/transports/stdio.ts:603` |
| 11 | 全局维护锁 | `src/cli/gc-cli.ts:1932-1948` |

---

## 6. 限制与注意事项

- **本地 dev 检出无法直接运行**：`packages/natives/native/` 无预编译 addon；为让探针运行，临时把全局安装 omp 18.10.0 的 `pi_natives.win32-x64-baseline.node` 复制到该（gitignore 的构建输出）路径，探针结束后已删除。因此实测的 JS 代码 = 检出 18.8.6，NAPI addon = 18.10.0。观测到的都是 OS 级行为（进程树、命名互斥量、文件字节），与检出源码路径一致。
- RPC 模式按 `docs/rpc.md` 固定若干"中性默认"，但其**会话托管路径与交互 TUI 相同**（同一 `createAgentSession`/`AgentSession`/`SessionManager`），差异仅在 UI 与协议默认项。
- 未实测：collab 真实连线、ACP 模式、服务守护进程的真实启动（需要工具/网络）；这些仅有文档 + 代码证据。
- 未验证 Windows 之外的锁语义；`session-storage.ts:566-584` 与 `docs/session.md:537-541` 说明 POSIX 走 abstract socket / flock sidecar，语义相同（进程退出即释放）。
- 未发送任何模型请求；凭据为占位串；`PI_CODING_AGENT_DIR`、`PI_TEST_SESSION_OWNERS_DIR` 均指向临时目录，未触碰用户状态。

## 7. 复现步骤

```bash
cd E:/Developer/myhub/oh-my-pi
# 需要的环境：bun 1.4.2；预编译 natives（见 §6 限制）
bun E:/Developer/myhub/my-agent-toolkit/.scratch/omp-probe/probe-rpc.ts        # 探针 A
bun E:/Developer/myhub/my-agent-toolkit/.scratch/omp-probe/probe-lease-driver.ts  # 探针 B
```
