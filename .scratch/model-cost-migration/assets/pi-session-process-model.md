# pi 多会话与进程模型：事实调查

本文件是「OMP 与 pi 的多会话是否单进程、能否删除跨进程协调」讨论的**事实依据**，不是政策决定；决策文件、Lighthouse、宿主源码均未改动。第二个研究分片独立输出，不在此合并判断。

- 调查对象：`E:/Developer/myhub/pi`（graph project `E-Developer-myhub-pi`，索引 2026-10-03 与 checkout HEAD 同期）。
- checkout 版本：HEAD `a276dabe57911253350bffb93cb7d7aff6a73261`（2026-10-03，`main`）。行号均指该 checkout 当前文件内容；「发行版编号」指本机已安装的 `@earendil-works/pi-coding-agent` 1.0.2（仅用于 smoke，非源码依据）。
- 方法：graph/outline 定位符号 + 直接读取源码与官方文档；会话/进程断言另用隔离目录做运行时探针（第 6 节）。**未**凭「搜不到」证明不存在全局锁：下文先给出全部 `lockfile`/`createServer`/socket 命中，再给判定。

## 结论速览（不含政策）

1. 发行版 CLI：`pi` 的 bin 直接 require 打包入口并在**同一进程**运行（`package.json:10`、`scripts/build-coding-agent-bundle.mjs:228-233`），`src/cli.ts:1-6` → `main()`。没有守护进程、没有 IPC、没有 attach 概念；`--version/--help/--mode rpc/--mode json/交互 TUI` 都是这一个进程。
2. 多会话（`/new`、`/resume`、`--continue`、`--resume`、`--session`、`/fork`、`/clone`、`/tree`）**在同一进程内替换/切换**：`AgentSessionRuntime` 持有唯一活动 `AgentSession`，替换时重建 services（`src/core/agent-session-runtime.ts:196-260`、`:415-438`）。
3. SDK 是宿主进程内库：一个进程可先后/并行持有任意多个 `AgentSession`（`docs/sdk.md`、`:420-438` 工厂复用；smoke 实测同进程 3 个）。
4. 独立终端 = 独立进程：每次启动各自 fork/exec，互相不接管；**没有单例锁**。存在的跨进程锁只有文件级 mutation 锁（凭据、trust、托管更新、MCP OAuth 刷新）与（未发行的）experimental server/worker 锁。
5. 子代理不是 pi 内核能力：官方示例扩展为每个子代理 `spawn` 一个**独立 `pi` 子进程**（`examples/extensions/subagent/README.md:7`、`index.ts:4-15`）；experimental durable harness 用同进程 conversation 做子代理（`src/experimental/durable/subagent.ts:24-50`）。
6. 代码库里唯一「全局守护进程」形状的东西是 **experimental client/server**：coordinator（Unix socket 路由 shim）→ 可替换 server → 每会话 worker 子进程。它被 `PI_EXPERIMENTAL=1` 门控、只由开发入口 `src/experimental/cli.ts` 分派、且被 `files` 排除出发行包与单文件二进制。正常 `pi` 启动不会被它接管。

## 1. 发行版 CLI：每次启动一个进程

- bin：`packages/coding-agent/package.json:10` → `"pi": "dist/bundle/cli.js"`；入口源码 `src/cli.ts:1-6`（`setupCli(); main(process.argv.slice(2));`）。
- 打包：`scripts/build-coding-agent-bundle.mjs:165-169` 把 `dist/cli.js` 打成 `cli-runtime`，`:228-233` 生成的 `cli.js` 只是 `enableCompileCache(); createRequire(import.meta.url)("./cli-runtime.js");` —— **同进程加载，没有 spawn**。
- 三种模式的落地都在 `main()` 内：`src/main.ts:949` `await runRpcMode(runtime)`、`:951` `new InteractiveMode(runtime, …)`、`:982` `await interactiveMode.run()`、`:985` `await runPrintMode(runtime, …)`。模式判定 `src/main.ts:112-123`（`rpc`/`json`/`print`/`interactive`），没有第五种「attach 到已运行实例」。
- 会话管理器在启动流程内创建：`src/main.ts:693` `createSessionManager(...)`。
- 官方口径一致：`docs/how-pi-works.md`（Interfaces 节）「RPC mode accepts JSONL commands on stdin and writes responses and events to stdout. The TypeScript SDK creates and controls agent sessions in process.」；`docs/rpc.md:3` 「RPC mode runs Pi as a long-lived subprocess controlled through JSON records on stdin and stdout.」
- 没有监听端口/socket 的会话服务：全仓 `createServer(`/`listen(` 命中仅 3 处，均与「会话守护进程」无关——
  - `src/experimental/coordinator.ts:298-299,319-322`（experimental，见第 5 节）；
  - `src/extensions/mcp/oauth.ts:445`（MCP OAuth 回调，登录流程期间临时监听 localhost，一次性）；
  - `src/experimental/server.ts` 的 socket 路径/权限辅助（experimental）。
- 环境变量清单同样没有 attach/daemon 概念：`docs/environment-variables.md`（Pi Process Configuration 表）只有 `PI_CODING_AGENT_DIR`、`PI_CODING_AGENT_SESSION_DIR`、`PI_OFFLINE`、…；源码中 `PI_*` 命中无 daemon/attach/server 语义（`PI_SERVER_DIR`/`PI_SERVER_ID` 只在 experimental，见第 5 节）。

## 2. 新建 / 切换 / 恢复 / fork：同一进程内替换

`AgentSessionRuntime` 是「一个活动会话 + 一个可复用工厂」；替换发生在进程内：

- `src/core/agent-session-runtime.ts:196-224` `switchSession(sessionPath, …)`：`:210` `SessionManager.open(sessionPath, …)` → `teardownCurrent("resume")` → 用工厂 `createRuntime({ reason: "resume", previousSessionFile })` 重建 → `apply()` 换掉 `this._session`。
- `:226-260` `newSession(…)`：`:239-240` `SessionManager.create(this.cwd, sessionDir)` 或 `SessionManager.inMemory(this.cwd)`，同样走 `teardownCurrent("new")` + 工厂重建。
- `:262-350` `fork(...)`、`:297` 新建 fork 文件；`:359-402` `importFromJsonl(...)`。
- `:415-438` `createAgentSessionRuntime(...)` 文档注释：「The same factory is stored on the returned AgentSessionRuntime and reused for later /new, /resume, /fork, and import flows.」（同一工厂 = 同一进程里再建一份服务与会话，不是新进程。）
- 会话存储：JSONL 文件树（`docs/how-pi-works.md` Sessions 节、`docs/session-format.md`）；文件在**第一条 user/assistant 消息**出现时才落盘（`src/core/session-manager.ts:1166-1176` `_hasConversation`）。

交互模式入口（都在同一进程）：

| 动作 | 位置 | 结果 |
|---|---|---|
| `/new` | `src/modes/interactive/interactive-mode.ts:3256-3259` → `handleClearCommand` `:6852-6855` | `runtimeHost.newSession()` |
| `/resume`（选择器）与 `--resume` 选择结果 | `:5640` `showSessionSelector` → `:5683` `handleResumeSession` → `:5689` / `:5705` | `runtimeHost.switchSession(path, …)` |
| `/fork`、`/clone`、`/tree` | fork：`:1979`、`:5448`、`:5478`；`/clone` 分派 `:3229` → `handleCloneCommand :5470-5479`；slash 列表 `src/core/slash-commands.ts:34-35` | `runtimeHost.fork(...)` / 同文件树导航（`/tree` 只在同文件内移动 leaf） |
| CLI 启动期 `--continue/--resume/--session/--fork` | `src/main.ts:252-283` `resolveSessionPath` → `:358-449` `createSessionManager` | 启动那一个进程内打开目标文件 |

RPC 模式（发行版支持的子进程嵌入方式）同样是**进程内 runtime + stdin/stdout 协议**：

- `src/modes/rpc/rpc-mode.ts:1-10` 头注释：JSON on stdin / events on stdout；`:53-63` `runRpcMode(runtimeHost)` 直接用 `runtimeHost.session`，`:324-340` 把 `newSession/fork/switchSession` 接到命令上下文，`:436-437` `new_session`、`:603-607` `switch_session`、`:611-627` `fork` 全部 `rebindSession()`，无进程切换。
- 调用方侧确实是另一进程：`src/modes/rpc/rpc-client.ts:94` `spawn("node", [cliPath, …])`；`docs/cli-integration.md:72` 「It starts a Pi RPC child process」。即「RPC = 宿主应用 fork 出来的 pi 子进程」，pi 这边没有常驻服务。

SDK：

- `docs/sdk.md`（Session lifecycle / Session storage）：`createAgentSession()` 返回一个 `AgentSession`，可在同一进程创建多个；`AgentSessionRuntime` 增补 `newSession/switchSession/fork/importFromJsonl`，「Each operation replaces the active `AgentSession` and recreates services for the target working directory.」
- 示例 `examples/sdk/11-sessions.ts`、`13-session-runtime.ts` 均为同进程用法。

## 3. 独立终端与并发启动：无单例、无接管

- 逻辑上没有任何「已有实例则接管」的分支：`src` 内 `another instance|already running|another pi|single instance|in use by|already open` 的全部命中只有 4 处——`src/package-manager-cli.ts:181`「Another managed Pi update is already running.」（托管自更新互斥）、`src/experimental/coordinator.ts:302`「Coordinator process is already running」（同一 coordinator 进程内的重入检查）、`src/experimental/durable/sessions.ts:53`／`src/experimental/vacation/sessions.ts:53`「Session is already open in another process: …」（experimental sqlite 会话目录锁）。发行版普通会话文件**没有**跨进程锁——`src/core/session-manager.ts` 内 `lockfile|flock` 零命中。
- 进程内文件写入串行化不是跨进程锁：`src/core/tools/file-mutation-queue.ts:1-5,32`（模块级 `Map` + promise 队列，注释明示「Serialize file mutation operations targeting the same file」）。
- 因此两个终端同时 `pi` 会各自打开/写自己的会话。会话文件的写入路径没有任何锁/租约/所有者检查：`src/core/session-manager.ts:1172-1186` `_persist` 首次落盘用 `openSync(this.sessionFile, "wx")`，其后逐条 `appendFileSync`；若两个进程被指向同一未落盘路径，代码里没有为这种竞争做互斥（本报告未追踪 EEXIST 的上抛/展示路径），也没有「被接管」语义。
- 文件级跨进程锁（真实现存清单，全部是短临界区，不是实例单例）：

| 用途 | 位置 | 锁对象 |
|---|---|---|
| 凭据写入（auth.json） | `src/core/auth-storage.ts:127-131` | `lockfile.lock(this.authPath, …)`，stale 30s，重试至 deadline |
| 项目 trust store | `src/core/trust-manager.ts:140-161`（循环 `lockfile.lockSync`，`:147`；ELOCKED 重试）、`:170-177` `withTrustFileLock` | `trustDir` / `*.lock` |
| 托管安装自更新 | `src/package-manager-cli.ts:177-181` | `join(managedRoot, "update")` |
| MCP OAuth 刷新 | `src/extensions/mcp/oauth.ts:176` | `mcp-auth-refresh-<hash>` |
| (experimental) server 启动/激活、worker 归属 | `src/experimental/server.ts:113`、`:201`；`src/experimental/session-worker.ts:517` | server 目录内 `launcher-*`/`activation-*`；会话目录 |

- 没有 pid 文件：`process.pid` 命中只有临时目录命名（`package-manager-cli.ts:128`、`utils/tools-manager.ts:290`、`utils/windows-self-update.ts:74`）与 experimental worker 的内存表（`session-worker-manager.ts:96,686`）。发行版 CLI 只有内存态的子进程登记表：`src/utils/shell.ts:167-180` `trackedDetachedChildPids`（用于退出时 kill bash 工具留下的 detached 子进程）。

## 4. pi 会创建的子进程（与「会话是否单进程」无关）

发行版进程是**父**进程，但不会退化成会话守护进程；这些子进程都是一次性/工具性的：

- 工具：bash/powershell（`src/core/tools/bash.ts:112`，detached 于非 Windows；`src/core/tools/find.ts:216`、`grep.ts:168` 调 fd/rg）。
- 交互辅助：外部编辑器（`src/modes/interactive/external-editor.ts:26`）、tmux 查询（`interactive-mode.ts:1274`）、`/share` 的 `gh gist`（`src/modes/interactive/session-share.ts:175`）、剪贴板程序（`src/utils/clipboard-command.ts:11`）、浏览器打开（`src/utils/open-browser.ts:21`，detached+unref）。
- 包管理：`src/package-manager-cli.ts:99-101` `spawnProcess("npm", …)`。
- MCP：stdio 传输把 MCP server 作为子进程（`packages/mcp/src/transports/stdio.ts:95`）。
- 线程（非进程）：codemode quickjs 沙箱 `packages/codemode/src/runtime/host.ts:155` `new Worker(workerUrl)`；图片缩放 `src/utils/image-resize.ts:22`。
- 子代理（示例扩展，非内核）：`packages/coding-agent/examples/extensions/subagent/README.md:7`「Isolated context: Each subagent runs in a separate `pi` process」；实现 `examples/extensions/subagent/index.ts:4-15`（`spawn` + JSON 模式）。

## 5. 唯一带「守护进程」形状的架构：experimental server/coordinator（未发行）

门控与入口：

- `src/core/experimental.ts:1-3`：`PI_EXPERIMENTAL === "1"`；`src/experimental/commands.ts:85+` `runExperimentalCommand` 只认 `server` / `client`；只有**开发入口** `src/experimental/cli.ts:6-12` 调用它（`pi-test.sh` 用它）。发行 bin 的 `src/cli.ts` 不 import 它，且 `package.json:31-33` 把 `dist/client`、`dist/experimental`、`dist/cli/experimental` 排除出包；`src/experimental/services/README.md:12`「The server, client, and experimental package subpaths are excluded from npm packages and standalone binaries.」本机安装（1.0.2）实测 `dist/` 下无 `client`、`experimental` 目录。

进程形状（若真的以 `PI_EXPERIMENTAL=1 pi server`/`pi client` 运行）：

- **coordinator = 独立进程**，只做 socket 路由（注释「This process is intentionally a transport shim. It depends only on Node built-ins…」`src/experimental/coordinator.ts:258-262`）；`ensureCoordinator`（`:187-199`）先试连 control socket，连不上就 `spawnInternalProcess("coordinator", [publicPath, controlPath])`；`runCoordinatorProcess`（`:301-328`）在同一进程里 `listen(controlServer/ publicServer)`，两条 socket 都 `restrictSocket`；空载时自杀（`EMPTY_STARTUP_GRACE_MS=30_000`、`EMPTY_SHUTDOWN_GRACE_MS=250`、`scheduleEmptyShutdown :491-506`）。
- **server = 可替换子进程**：`startServer`（`server.ts:493` 起；`pi server` 命令走 `startForegroundServer` `:682`）先 `ensureCoordinator`（`:586`），再注册自己（`:587-607`）；`activateServer` 在 `launcher-*`/`activation-*` 锁内连接或 `spawnInternalProcess("server", …)`（`:113`、`:157-200`）；被新 server 顶替时 `wasReplaced`（`:621-629`、`:665`）。
- **session worker = 每会话子进程**：`session-worker-manager.ts:465-470` `spawnInternalProcess("session-worker", …)`，通过 coordinator 与 server 通信（`:304-352`），停止超时后 SIGKILL（`:391`）；worker 侧 `session-worker.ts:835-839` 要求内部角色，`:517` 锁住自己会话目录。会话目录语义见 `services/README.md:30`（`meta.json` + `session.sqlite`，worker 独占）；`pi client` 在 `PI_EXPERIMENTAL=1` 下会创建并 attach 一个 Session（`services/README.md:28`）。
- 目录与平台：默认 `PI_SERVER_DIR` 或 `~/.pi/server`（`server.ts:51-56`），要求 POSIX UID/0700（`:58-66`）；客户端 transport 在 Windows 直接抛错（`packages/client/src/unix.ts:37-38`「Unix transport is not supported on Windows」）。
- 该架构里的「多会话」才是跨进程：一个 server 下多个 worker，各会话 sqlite 由 `lockfile` 独占（`durable/sessions.ts:47-55`、`vacation/sessions.ts:47-55`）。
- 同进程子代理变体（同属 experimental durable）：`durable/subagent.ts:24-50` 用 `tx.createConversation(...)` 在**同一进程/harness** 内开子会话，`README.md:26-29`。

因此：**正常 `pi`（含交互、print、json、rpc、SDK）不存在全局守护进程接管；只有 experimental 的 `pi client` 会连/拉起 coordinator+server，那属于未发行、POSIX-only、开发用途的切片。**

## 6. 已运行的隔离 smoke（无模型请求、未触真实凭据）

环境：Node v24.18.0（Windows 10.0.26200），已安装 `@earendil-works/pi-coding-agent` 1.0.2；探针用临时 `PI_CODING_AGENT_DIR`/`PI_CODING_AGENT_SESSION_DIR`，清空 `*_API_KEY*`/AWS/GOOGLE 等环境变量，置 `PI_OFFLINE=1`；不做任何 prompt（不产生模型请求），不写真实 `~/.pi`。仓库本身未构建（无 `node_modules`/`dist`），故探针跑的是**发行产物**而非 HEAD 源码。

`--version` / `--help`（退出码 0）：

```text
[--version stdout] 1.0.2
[--help first lines] pi - AI coding assistant with read, bash, edit, write tools | … | Usage: |   pi [options] [--] [@files...] [messages...] | Commands:
```

`--mode rpc` 是否交出控制权（判定「CLI 自己就是 rpc server」）：

```text
[rpc pid] 20772
[rpc children] []
[rpc reply] {"id":"s1","type":"response","command":"get_state","success":true,"data":{"model":{"id":"unknown",…
[rpc children after get_state] []
[rpc process after stdin EOF] gone
```

即：RPC「服务器」就是 CLI 进程本身，无子进程（无 coordinator/worker），stdin EOF 即退出。

两路并发启动是否被同一守护进程接管：

```text
[launch A] pid=27824 parent=4560 exe=node.exe        # 4560 = 启动它们的探针进程（本会话）
[launch B] pid=1704 parent=4560 exe=node.exe
[both alive at once] true true
[children of A] 0
[A after stdin EOF] gone
[B after stdin EOF] gone
```

产物检查：

```text
[temp tree] ["agent","agent\auth.json","agent\models-store.json","sessions","ws"]
[~/.pi/server exists] false
[~/.pi entries] ["agent"]
```

SDK：同一进程内的会话新建/切换（用发行版 `createAgentSessionRuntime` + `createAgentSessionServices/FromServices`，`noTools: "all"`）：

```text
[os pid] 4560
[initial session] 01a12e5f-8bd5-73d2-800a-338c1d338837
[session B after first user message] 01a12e5f-8bff-73d2-800a-338e377e42ec file=2026-10-12T04-29-36-127Z_01a12e5f-….jsonl
[after switchSession(B file)] id=01a12e5f-8bff-73d2-800a-338e377e42ec equalsB=true
[context rebuilt from file] ["user"]
[AgentSessions built in this one process] 3
[session files on disk] 2026-10-12T04-29-36-127Z_01a12e5f-8bff-….jsonl
[after dispose, still one process] 4560
```

另外一次探针（未落盘的会话）显示：`newSession()` 后 `switchSession(<B 文件>)` 会得到**新 id**——因为 B 还没有 user/assistant 消息、文件未创建（对应 `_hasConversation` 的懒落盘语义），这不是进程语义问题。

探针脚本（一次性、位于系统临时目录，未入库）：`%TEMP%/pi-session-probe/probe.mjs`、`probe2.mjs`；核心片段见附录 B，可原样复跑。

## 7. 未覆盖与限度

- 未跑交互 TUI（需要真实 TTY）：`InteractiveMode` 单进程结论来自源码路径（`main.ts:951-982`）与官方文档，未做端到端 TTY 观测。
- smoke 跑的是发行版 1.0.2，不是 checkout HEAD（仓库无 `node_modules`/`dist`，未构建）；两者同属 1.0.x，所引用的 API/行号以 HEAD 源码为准，行为差异未逐项对照。
- experimental server/coordinator 未实跑（未发行、POSIX-only、Windows 下 unix socket 不可用）；其结论全部来自源码 + `services/README.md`。
- 未做真实模型请求、未导入真实凭据；`auth.json`/`models-store.json` 只出现在临时目录中。
- 「无全局锁」的判定基于：全仓 `createServer/listen(` 命中枚举、`another instance|already running` 命中枚举、`session-manager.ts` 无 `lockfile`、pid 文件枚举；若存在依赖间接手段（如同名 socket 路径探测）的接管路径，本报告未覆盖。

## 附录 A：本机进程观测（非 pi 源码结论，供对照）

同机观测到的是 **OMP**（`@oh-my-pi/pi-coding-agent`，bun 运行）的进程树，不是 `@earendil-works` 的 pi 进程；pi 侧在探针前后均无常驻进程：

```text
28144 <- parent 24816 bun.exe …@oh-my-pi\pi-coding-agent\dist\cli.js
17472 <- parent 28144 bun.exe …dist\cli.js __omp_worker_daemon_broker
 9432 <- parent 17472 bun.exe …dist\cli.js __omp_worker_text_predict
13376 <- parent 28144 bun.exe …dist\cli.js __omp_worker_daemon_broker
17200 <- parent 13376 bun.exe …dist\cli.js __omp_worker_lsp_mux
21856 <- parent 28144 bun.exe …dist\cli.js __omp_worker_js_eval_process
 7348 <- parent  5932 bun.exe …dist\cli.js
16688 <- parent  7348 bun.exe …dist\cli.js __omp_worker_daemon_broker
```

即 OMP 宿主把若干 worker（broker/text_predict/lsp_mux/js_eval）跑成**独立子进程**；OMP 自身的会话/worker 共享语义需查 OMP 源码，本分片未分析（仅记录观测）。

## 附录 B：探针关键片段（可复跑）

```js
const PKG = "D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent";
const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: sessionDir, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1" };
// (a) CLI 进程自证：spawn node <PKG>/dist/bundle/cli.js --mode rpc --no-session --offline
//     → 子进程列表为空；写 {"id":"s1","type":"get_state"} 得 stdout 应答；stdin EOF 后进程消失
// (b) SDK 同进程多会话
const pi = await import(pathToFileURL(join(PKG, "dist", "index.js")).href);
const settings = pi.SettingsManager.inMemory({});
const factory = async ({ cwd, agentDir, sessionManager }) => {
  const services = await pi.createAgentSessionServices({ cwd, agentDir, settingsManager: settings });
  const made = await pi.createAgentSessionFromServices({ services, sessionManager, noTools: "all" });
  return { ...made, services, diagnostics: [] };
};
const first = pi.SessionManager.create(cwd, sessionDir);
const runtime = await pi.createAgentSessionRuntime(factory, { cwd, agentDir, sessionManager: first });
await runtime.newSession();                                  // = /new，同进程
const second = runtime.session.sessionManager;
second.appendMessage({ role: "user", content: "hello", timestamp: Date.now() }); // 落盘该会话
await runtime.switchSession(second.getSessionFile());         // = /resume，同进程，id 不变
```
