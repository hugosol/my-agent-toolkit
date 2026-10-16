# framework 内部只读 Owner State 同步：本机载体与寻址约束的事实核对

Ticket: [第三方能力适配的集中组织与公共语义复用](../decision/04-third-party-adapter-organization.md)（status: claimed）
性质：**证据资产，不是政策发布**。本文件只核对"没有现成 IPC 时最小本机载体能否成立、寻址上必须满足什么"的事实，不批准目录/接口/协议/安全策略，不选定最终协议，不改 map、ticket、Lighthouse 或任何生产文件，不跑 build/lint/test/formatter，不安装任何东西，不调用模型。

## 0. 方法与证据口径

- 四档标注：**[静态]** = 固定 revision 源码/类型/文档逐行读取；**[实测]** = 本轮在本机真实运行（命令与原始观察值逐条列出，见 §2.3、§6）；**[转引]** = 引已发布研究或基线，本轮不重跑；**[INFERENCE]** = 由前两类推出、未运行验证。
- 本轮运行范围严格限定在**底层载体**：两个 throwaway echo 探针（Node/Bun 的 `net`/`http`，四种运行时组合、独立进程），**不导入 framework、不读 State、不启动宿主、不读配置、不调用模型、不写仓库内文件、不是测试文件**。探针脚本放在 `%TEMP%/omp-pipe-probe/`，运行后连同结果文件一起删除，命名空间与进程残留已核对（§6）。echo 结果**不构成**任何 State 集成验证。
- 固定参考 revision（本轮实际读取对象）：
  - 本仓库 `E:/Developer/myhub/my-agent-toolkit`，分支 `pi-adapter`，HEAD `61891e24ddc78b651b3ec7dbd86103edbe42fc7a`（"wayfinder model-cost", 2026-10-16 08:48:47 +0800）。
  - OMP 宿主 = 安装源码 `.cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent`（**18.5.0**）。本轮引用的每个宿主文件都与 `.cache/host-patch/base/src/**`（补丁基底拷贝）`diff -q` **逐字节相同**（`launch/paths.ts`、`launch/broker.ts`、`launch/client.ts`、`collab/registry.ts`、`lsp/mux/server.ts`、`lsp/mux/protocol.ts` 六个文件全 same），故行号归属 **18.5.0**。本地检出 `E:/Developer/myhub/oh-my-pi` @ `611c189fa2f6b8c9b368559ea6b98062b9b54539`（18.10.4）的同名文件与上述**不逐字节相同**，本轮不按它引用行号。
  - nicobailon `E:/Developer/myhub/wt/_cand/git-nicobailon` @ `a4c8ced69a8176cdf4179b127feddc8875e3418f`（`chore(release): v0.78.0`，浅克隆）。读的是 **git checkout**（`src/**`），不是 npm JS 工件；两者入口差异见 [研究勘误 §2.1](02-primary-candidates-correction.md)。
  - pi 宿主 `E:/Developer/myhub/pi` @ `4a5d37291531ad48b8e536c892557877d219463c`（`@earendil-works/pi-coding-agent@1.2.0`，`engines.node >= 22.19.0`，bin = `dist/bundle/cli.js`，另有 `bun build --compile` 的 binary 目标）。
  - 运行环境 [实测]：win32 x64；`node v24.18.0`（`D:\nvm4w\nodejs\node.exe`）；`bun 1.4.2`（两个安装路径 `D:\nvm4w\nodejs\node_modules\bun\bin\bun.exe` 与 `D:\Users\hugos\AppData\Local\nvm\v24.18.0\node_modules\bun\bin\bun.exe`，`--version` 均为 `1.4.2`）。**Bun 里 `process.versions.bun = "1.4.2"` 而 `process.version = "v26.3.0"`**——两者不可混称。
  - 类型面（用于核对 API 有无）：仓库内 `node_modules/@types/node` = **26.6.4**；这是类型面版本，运行时仍是 Node 24.18.0，两者不可混称。
- 旁证（不作为设计前提）：本机正有 4 个 bun 进程在跑 OMP 宿主本体（命令行 `...bun.exe ...\@oh-my-pi\pi-coding-agent\src\cli.ts`，创建时间 08:44–10:08，早于本轮探针）⇒ 这台机器的 OMP **宿主运行时就是 Bun**；而 pi 侧的既有效运行验证是 **Node v24.18.0** 跑 pi CLI 1.2.0（[转引] [report-live](07-runtime-validation/report-live.md) §授权/环境）。

---

## 1. repo 现有公共机制：能复用哪些部分，没有什么

### 1.1 framework 只有两个 module，且**不存在**任何监听端 / 管道 / 套接字 [静态]

- `framework/modules/` 只有 `files.ts`、`http.ts`；`framework/public.ts` 的公共面只导出 `updateFile`、`SafeFileUpdateError`（files）与 `request`、`HttpConfigurationError`（http）。
- 精确核对：对 `framework/` 全树搜 `listen( | createServer | node:net | node:dgram | process.send | MessageChannel`，**唯一命中**是 [`framework/modules/http.ts:70`](../../../framework/modules/http.ts) 的 `import { isIP } from "node:net"`（仅做 IP 字面量判定）。⇒ **framework 侧没有现成 IPC，也没有本机服务器端；不得声称已有。**
- `http` 模块是**纯出站客户端**：`node:http`/`node:https` 客户端、代理表、CONNECT 隧道、预算；契约头明确写"the connection is made by **this runtime's own** `node:http`/`node:https` client"、"no cancellation channel"，全文没有 `server`/`listen`（[`framework/modules/http.ts:1-67`](../../../framework/modules/http.ts)）。
- `files` 模块是**协调写入**，自陈为 "The lock is **local IPC**, not a distributed lock, and it is not a lease"（[`framework/modules/files.ts:1-77`](../../../framework/modules/files.ts)）：进程内 per-document FIFO 链 + 同目录目录锁 + 同目录临时文件 rename 原子发布 + 有界等待。它是互斥原语，**不是数据通道**；调用方必须给绝对路径与已存在的父目录，模块只发布调用方返回的 JSON。
- 现有唯一的跨进程"活性"判据只到 **PID 粒度**：`holderLiveness` 用 `process.kill(pid, 0)`，`ESRCH` ⇒ 已死，其它错误 ⇒ unknown，**unknown 绝不夺取锁**（[`framework/modules/files.ts:452-457`](../../../framework/modules/files.ts)，消费点 `:545`）。没有 token / generation / incarnation 事实。

### 1.2 可复用的部分（逐条，含不可复用项）[静态]

| 现有件 | 位置 | 可复用的性质 | 不能当什么 |
|---|---|---|---|
| `updateFile` 的协调模式（同进程序列化、跨进程锁目录、原子发布、有界等待、`SafeFileUpdateError` 失败分类） | [`framework/modules/files.ts:1-77`](../../../framework/modules/files.ts) | 若某载体走**文件**，这是现成的发布/协调件；失败分类与预算语义已固定 | 不是端点、不是订阅、不是值通道 |
| 等待预算校验原语 `isScheduledWait` / `SCHEDULED_WAIT_TEXT` / `ConfigLoadError` / `readConfigDocument` | [`framework/core/config.ts`](../../../framework/core/config.ts)，被 [`files.ts:80`](../../../framework/modules/files.ts)、[`http.ts:76-82`](../../../framework/modules/http.ts) 使用 | 任何新增等待预算应沿用同一判定（"必须是本框架能调度的整毫秒"） | 不携带任何传输能力 |
| 出站 `request`（显式目标、不走环境代理、有界预算、返回运行时自己的响应） | [`framework/modules/http.ts:1-67`](../../../framework/modules/http.ts)、`public.ts` | 若某载体走 loopback HTTP，**客户端半边已存在且语义已固定** | 只有出站；无服务端、无端口发现、无回调入站 |
| 进程内注册表：marker 区、pi 文本导入区、文件协调状态 | [`marker.ts:158-174`](../../../framework/behaviors/marker.ts)、[`pi-text-imports.ts:13-14`](../../../framework/adapters/pi-text-imports.ts)、[`files.ts:154-175`](../../../framework/modules/files.ts) | 只解决**同进程**多份模块图共享 | `Symbol.for(globalThis)` 对跨进程无效，**不得**当 IPC 复用（[转引] [state-follow facts §1.2](04-state-follow-facts.md)） |
| 模块标准（若最终新增 module） | [`extension-development-map.md:23`](../../../framework/docs/extension-development-map.md)（modules = 不依赖宿主与具体扩展的通用基础能力；判据"去掉 Session、Owner 和业务概念，这项能力是否仍独立成立"）；[`docs/adr/0002-...:60`](../../../docs/adr/0002-semantic-extension-framework.md)（`modules/ # Harness-independent HTTP/files, not adapter-dependent`）、`:131-141`（import-boundary 机械检查；扩大 escape hatch 属非增量架构变更，需显式决定） | 给出了"新增 module 是否合规"的现成判据与告警机制 | 判据本身不批准任何新 module |

### 1.3 仓库里已有的"本机 IPC 先例"在**宿主内部**，不是 framework 能力，也不是扩展 API [静态]

OMP 18.5.0 `@oh-my-pi/pi-coding-agent` 内部至少四处用 `node:net` 做本机 IPC：daemon broker（`src/launch/broker.ts`）、collab registry（`src/collab/registry.ts`）、LSP mux（`src/lsp/mux/server.ts`）、IDA host（`src/ida/host.ts`）。同一模式下有**两种命名策略**，对本题直接相关：

- **确定性派生**：`daemonBrokerEndpoint(projectDir, runtimeDir)` = win32 `` `\\.\pipe\omp-daemon-${Bun.hash.wyhash(path.resolve(projectDir)).toString(16).padStart(16,"0")}` ``，POSIX `path.join(runtimeDir,"broker.sock")`（`.cache/omp-baseline/18.5.0/.../pi-coding-agent/src/launch/paths.ts:85-90`）。同一文件另有 `canonicalProjectDir`（`:30-38`），注释原文即"so **hash-keyed runtime dirs and Windows pipe names agree across processes**"——宿主自己就为"两个进程要算同一个名字"付了 canonical 化代价。
- **不可预测 + 发布地址**：`publishCollabHost` 用 `crypto.randomBytes(8)` 生成 per-publication `entryId` 命名端点（win32 `\\.\pipe\omp-collab-${entryId}`），端点与其元数据文件名都由此 entryId 决定，并另有 `crypto.randomBytes(32)` 的 `token`（`src/collab/registry.ts:439-458`），注释明写动机是"**PID reuse** cannot attach stale metadata to an unrelated process, and a room that rotates never shares artifact names with its predecessor"（`:449-452`）。
- 端点**所有权与活性**：daemon broker 用 `FileLock.tryAcquire(broker.pid)` 做"一 scope 一 broker"的租约，注释原文"the native lock is **process-owned, so the OS releases it however the broker dies** — a crashed broker can never wedge the scope behind a stale lease again"，并保留 `broker.pid` / `broker.token` 文件（`src/launch/broker.ts:57-58, 376-395`）；collab 另有 `instanceId` 与 `generation`，并以错误码 `stale_generation` 拒绝把陈旧卡片接到后继者（`src/collab/registry.ts:133, 341-343, 713, 752`）。
- **跨 Owner 误连的核对**：broker 客户端在 `ping` 之后比对 `ping.projectDir === client.projectDir`，不等即抛 `"daemon broker ping mismatch"`（`src/launch/client.ts:530`）；collab 侧以 token 拒绝"unrelated endpoint"（`src/collab/registry.ts:577-580`）。
- **平台分叉**：POSIX 侧显式 `fs.rm(endpoint)` 再 listen、`fs.chmod(endpoint, 0o600)`、关闭时再 `fs.rm`（`src/launch/broker.ts:470, 478, 509`；LSP mux 另有 `#clearStaleSocket`：先 `stat`、probe 存活、存活则报 `already listening`、否则 `unlink`，`src/lsp/mux/server.ts:203, 238, 245-256`）；Windows 侧**没有**这些 unlink/chmod（管道是内核对象）。

**归属声明**：上述都是宿主内部模块，未在扩展 API 中作为契约暴露，跨进程可用性属宿主实现细节。本文件只把它们记为"同仓库里存在过的做法与代价"（尤其：确定性名字必须解决 canonical 化；incarnation 靠进程所有的锁/token/generation；跨 Owner 靠握手核对），**不当作可复用的公共机制**，也不建议直接 import 宿主内部模块。

另一条**已在仓库里建立**的路线是 `host-patches/`：仓库已有三个针对 `@oh-my-pi/pi-coding-agent@18.5.0` 的本地补丁（`omp-18.5.0-codex-response-boundary`、`omp-18.5.0-viewed-session`、`omp-18.5.0-viewed-session-codex-response`，各含 `patch.diff` + `record.json`，物化器 `tests/harness-dock/host-patch-artifact.ts`）[静态]。这说明"让宿主多给一条通道"在本仓库是被实践过的形态，与"framework 自己加传输"是两条不同路线；本文件不选边。

---

## 2. 载体事实：Node 内置 net 本机端点 vs loopback HTTP

### 2.1 探针形状 [实测]

- 单进程 driver（Node 24.18）用 `child_process.spawn` 拉起**独立子进程**当 server 与 client；子进程代码以 `-e` 内联传入，只 `require("node:net")` / `require("node:http")`，参数经环境变量传递；**没有 shell**、没有 npm 依赖、没有 framework 代码。
- 覆盖：node-server×{node,bun}-client 与 bun-server×{node,bun}-client 的管道 echo；管道命名空间枚举；重复监听；不存在名字/已关闭端口；SIGKILL 下的客户端观察与重新监听；win32 上的 POSIX 风格路径；loopback HTTP（`:0` 与固定端口、重复绑定、停后连）。`bun` 以真实 `bun.exe` 绝对路径启动（PATH 上的 `bun` 是 `.cmd` 垫片，Node 的裸 `spawn("bun")` 会 `ENOENT`）。

### 2.2 载体对照（事实差异，逐条可回溯到 §2.3）

| 轴 | Windows named pipe（`\\.\pipe\<name>`） | loopback TCP（`127.0.0.1:<port>`） |
|---|---|---|
| 提供方 | Node/Bun 内置 `node:net` [实测 E2] | Node/Bun 内置 `node:http` [实测 E9] |
| 地址形态 | 名字空间里的字符串，**可确定性派生**（宿主先例 `omp-daemon-<hash>`）或随机生成后由别的介质发布（宿主 `omp-collab-<entryId>` + `entryId.json`） | 端口：`:0` 由 OS 分配（实测得到 4249 / 5229），不可预测；固定端口是机器全局资源 |
| 冲突域 | 一个名字一个监听者（跨运行时同样 EADDRINUSE，E5） | 一个端口一个监听者（node/bun 都 EADDRINUSE，E9） |
| 死亡/重启 | 持有者死亡（含 SIGKILL）后名字**立即**从命名空间消失，同名字立即可被新进程绑定，无磁盘残留（E4） | SIGKILL 后同端口立即可重新 listen（E10）；但端口可能被**任何其它程序**占用 |
| 陈旧地址 | Windows：无（内核对象）；POSIX unix socket：**文件残留**，宿主自己 `stat`+probe+`unlink` 处理 [静态 §1.3] | 无文件残留；但 TIME_WAIT/端口复用属另一套语义 |
| 客户端失败信号 | 不存在 → `ENOENT`（立即）；对端死亡 → `end` + `close:hadError=false`，**与正常关闭同形**（E6/E7） | 无监听者 → `ECONNREFUSED`（立即）；对端死亡 → 连接关闭 |
| 可达面 | 命名空间**机器全局**且**任何本机进程可枚举**（实测从一个无关进程列出本机 234 条管道，含我们的探针管道，E3） | 任何本机进程都可连 `127.0.0.1:<port>`（E9） |
| 同用户隔离旋钮 | Node 的 `net` 只在 `listen(path)` 暴露 `readableAll`/`writableAll`（[`node_modules/@types/node/net.d.ts:548-561`](../../../node_modules/@types/node/net.d.ts)，本地类型面未带 JSDoc），**没有**设置安全描述符/DACL 的入口；管道的 ACL 本机**读不到**（`Get-Acl` 报 "Method failed with unexpected error code 87"，E11） | 无 ACL 概念；绑定环回不涉及防火墙规则面 [INFERENCE] |
| 跨运行时一致 | Node 与 Bun 都能监听/连接 `\\.\pipe\`（E2）；**但** win32 上 Bun 接受 POSIX 风格路径而 Node 拒绝，且两者互不可达（E8）——把地址字符串固定成 `\\.\pipe\...` 可避开 | 两端一致（E9） |

### 2.3 本轮实测原始观察（逐条，探针结束后结果文件已随临时目录删除，值在下方逐字转写）

- **E1 运行时**：`node` → `{"out":"v24.18.0"}`、`execPath = D:\nvm4w\nodejs\node.exe`；`bun` → `{"bun":"1.4.2","nodeCompat":"v26.3.0"}`；两处 `bun --version` 均 `1.4.2`。
- **E2 管道 echo（四种组合全部成功）**：`\\.\pipe\omp-probe-<tag>-{a,b,c,d}` 上
  - node-server + node-client → `["CLIENT","connect","data:ECHO:ping"]`
  - node-server + **bun**-client → 同上
  - **bun**-server + node-client → 同上（Bun 1.4.2 在 win32 可作 named pipe 服务端）
  - **bun**-server + bun-client → 同上
- **E3 命名空间可见性**：服务期间从**无关进程** `fs.readdirSync("\\\\.\\pipe\\")` 列出 `["omp-probe-259f59c8-a"]`；另一个无关的 Bun 进程列整机命名空间得到 `count = 234`。
- **E4 名字释放与重绑**：server 停止后同进程再列 → `[]`；server 被 `SIGKILL` 后 `pipesAfterDeath = []`，紧接着用**同一名字**重新 `listen` → `{"ev":"listening","endpoint":"\\.\pipe\omp-probe-...-crash","pid":<新 pid>}` 无错误；正常 `close` 后重绑同样成功。
- **E5 重复监听**：同一 live 名字上第二个监听者（node → `EADDRINUSE: address already in use \\.\pipe\...`；bun → `EADDRINUSE`，退出码 3）都失败。窗口内**跨运行时**也一样。
- **E6 失败信号**：连不存在的管道名 → `error:ENOENT:connect ENOENT \\.\pipe\omp-probe-259f59c8-absent` + `close:hadError=true`；连已关闭的 loopback 端口（127.0.0.1:1）→ `error:ECONNREFUSED:connect ECONNREFUSED 127.0.0.1:1`。
- **E7 对端被杀的客户端观察**：客户端保持连接，server 被 `SIGKILL` 后客户端收到 `["CLIENT","connect","data:ECHO:ping","end","close:hadError=false"]`——**没有任何错误信号**，与正常关闭同形。⇒ 客户端**无法**从连接结果判断 Owner 是正常退出还是被杀。
- **E8 win32 上的 POSIX 风格路径**：Node `server.listen("/tmp/<tag>.sock")` → `listen EACCES: permission denied /tmp/...`；**Bun 同名成功** `listening`（address = 该字符串），但：磁盘上 `C:/tmp/<tag>.sock` **不存在**、`\\.\pipe\` 命名空间里**无**对应条目、**Node** 客户端用同一字符串 → `EACCES`、Node 客户端用 `\\.\pipe\tmp\<tag>.sock` → `ENOENT`、**Bun** 客户端用同一字符串 → echo 成功。⇒ 该形态是 **Bun-only 可达**，跨运行时不可用（对比 E2：`\\.\pipe\...` 形态两端通用）。
- **E9 loopback HTTP**：node `http` server 监听 `127.0.0.1:0` → `{"address":"127.0.0.1","port":4249,"family":"IPv4"}`（另一轮 5229）；独立进程 GET `/x` → `{"status":200,"body":"ok:/x"}`；同端口第二个绑定：node `EADDRINUSE`、bun `EADDRINUSE`（message `Failed to start server. Is port 4249 in use?`）；server 停后连该端口 → `ECONNREFUSED`。
- **E10 固定端口重启**：先用 `:0` 探得空闲端口 5229，起 server、建立过一个真实连接，再 `SIGKILL` server；**立即**用同端口重新 listen：node 成功、bun 成功。
- **E11 管道 ACL 不可读**：对 live 管道 `Get-Acl -Path \\.\pipe\omp-probe2-...` → `GETACL-ERROR: Method failed with unexpected error code 87.` ⇒ 未测。
- **E12 派生原语跨运行时**：Bun 里 `typeof Bun.hash.wyhash === "function"`；Node 里 `typeof Bun === "undefined"` 且 `crypto.getHashes()` 无任何 `wy*` 算法；两侧 `sha256("x")` 前 16 位都得到 `2d711642b726b044`。⇒ **若要求两端算出同一个名字，不能用 `Bun.hash.*`**，只能用两侧共有的原语（`node:crypto`）。

### 2.4 由 §2.2/§2.3 直接得出的三点（不是建议）

1. **地址可派生性**是两者最本质的差别：管道名是可由已知量算出的字符串（宿主先例即 `wyhash(canonical projectDir)`），而 TCP 端口只能 OS 分配（不可预测）或固定（机器全局冲突 + 与任何其它程序抢）。
2. **"连接失败/关闭"不能充当 Owner 生死判据**（E7），因此 incarnation 必须来自**端点之外**的可核对事实（宿主先例：进程所有的 FileLock + `broker.pid`/`broker.token`；collab：`instanceId`/`generation`/token）。
3. **Windows 上两者都不提供"同用户外不可达"的现成旋钮**（E3 全局可枚举 + E5 先到先得 + E11 ACL 读不到）。宿主自己的答案是：POSIX 用 `0o700` 目录 / `0o600` socket，Windows 用**不可预测名字 + 握手 token**（§1.3）。

---

## 3. 子会话侧：接入定位与寻址约束

### 3.1 子进程实际能拿到什么 [静态 + 转引]

- **身份**：子会话知道自己是谁（当前 session），直接父在子会话 header / run meta；**detached runner 额外经环境变量** `PI_SUBAGENT_PARENT_SESSION`（常量 `src/runs/shared/child-runtime-config.ts:18`，赋值 `src/runs/background/async-execution.ts:784-785`）拿到启动它的父会话 id。root 与同进程前台**不**发布这条全局身份（[转引] [state-follow facts §2.3](04-state-follow-facts.md)、[lighthouse 07](../lighthouse/07-nicobailon-runtime-validation.md)）。
- **启动配置只有 `{id, path}`**：`registerRequiredChildExtensions` 只下发"要加载哪个模块"，**没有自定义 payload 槽**（[转引] [state-follow facts §2.2#2](04-state-follow-facts.md)；`src/shared/required-child-extensions.ts`）。
- **stdio 也不能当通道**：runner 启动是
  `spawn(spawnCommand, spawnArgs, { cwd, ...backgroundProcessOptions(), stdio: ["ignore", stdoutFd ?? "ignore", stderrFd ?? "ignore"], env: runnerEnv })`
  （`src/runs/background/async-execution.ts:787-792`），而 `backgroundProcessOptions()` = `{ detached: platform !== "win32", windowsHide: true }`（`src/runs/shared/background-process-options.ts`，全 6 行）⇒ **stdin 被 `ignore`、stdout/stderr 指向日志文件、没有 `ipc`**，即子进程没有 `process.send`，也没有继承的通信管道。父→子唯一现成携带面是 **env**（且 Windows 上不 detached）。
- pi 路径下 framework 侧没有 owner 解析（[转引] [state-follow facts §1.3](04-state-follow-facts.md)）；OMP 路径的解析是进程内注册表上溯。

### 3.2 由此得到必须满足的约束（约束清单，不是设计选择）

- **C1 接入定位**：端点地址必须由子进程**已能可靠计算的量**派生，或由它**已能读到**的介质发布——因为启动配置没有 payload 槽。若走确定性派生，输入必须两端同值：宿主自己的先例已经证明这是**真实的**代价（`canonicalProjectDir`，`src/launch/paths.ts:30-38` 注释"Windows pipe names agree across processes"）。子进程手头可用的候选量只有：自身 session 身份、direct parent 身份（env / header）、cwd、用户目录。派生哈希只能用两端共有原语（E12）。
- **C2 同用户隔离**：Windows 侧 Node/Bun 都不提供 DACL 旋钮（§2.4 第 3 点）；管道命名空间机器全局、可枚举、先到先得（E3/E5）。要得到任何"非本 Owner 不可连"的性质，只能靠**不可预测名字**和/或**握手 token**（宿主先例 `crypto.randomBytes(8)` 名 + `randomBytes(32)` token，`src/collab/registry.ts:446-458`），或靠 POSIX 的目录/文件权限（宿主先例 `0o700` 目录、`0o600` socket，`src/launch/broker.ts:478`，`src/launch/client.ts:499`）。
- **C3 Owner incarnation / 旧地址**：持有者死亡后名字**立即**可被任何进程绑定（E4），而客户端**看不出**换了主人（E7）；⇒ 需要一个可核对的 incarnation 事实，并且必须定义"旧地址被新进程占用"时是拒绝还是重接（宿主先例：`stale_generation` 明确拒绝把陈旧卡片接到后继者，`src/collab/registry.ts:341-343`）。
- **C4 进程重启**：管道侧无磁盘残留、重启即可重绑（E4，含 SIGKILL）；固定端口的重启也不被 TIME_WAIT 阻塞（E10），但端口是机器全局资源、会与任何其它程序互相 EADDRINUSE（E5/E9）。
- **C5 跨 Owner 误连**：需要"我连上的端点确实属于我这个 Owner"的核对（宿主先例：`ping.projectDir` 比对 + token，`src/launch/client.ts:530`、`src/collab/registry.ts:577-580`）。framework 现在只有**进程内**的 `StateStore.serves(ownerKey)` 能回答"这个 store 服务这个 owner"（[转引] [state-follow facts §1.4](04-state-follow-facts.md)）；跨进程没有任何等价核对。
- **C6 不猜父链、不用 model-cost 数据**：本节所有身份事实来自固定 revision 源码与已发布研究；本轮没有读任何 model-cost 数据，也没有推断父链。

### 3.3 本节未验证

- 跨用户可达性（本机无第二个用户）；管道 DACL（E11 失败）；POSIX 侧 unix socket 的真实行为（本机是 Windows，只有宿主源码 [静态]）；句柄继承（子进程是否继承父的管道/套接字句柄）**未测**。注意 nicobailon 在 Windows 上是 `detached:false` 但 `stdio: ["ignore", ...]`，即**明确不传标准句柄**（§3.1）。

---

## 4. 事实支撑的最小载体建议（未选定协议/安全策略）

### 4.1 首选方向：`node:net` 本机流——Windows `\\.\pipe\<name>`、POSIX unix socket 文件

- **正面事实**：四种运行时组合实测可用（E2）；单监听者互斥（E5）；持有者死亡即释放、无磁盘残留、可立即重绑（E4）；地址是可派生字符串（§2.2 首行 + §1.3 宿主先例）；不需要第三方依赖；不占机器全局端口资源（与 E9/E10 对照）。
- **必须同时满足的配套条件（缺一即不成立）**：
  1. 派生输入必须先 canonical 化，且哈希只能用两端共有原语（§1.3 宿主先例 + E12）；
  2. 需要端点与 Owner 的**核对**事实（C3/C5），不能靠连接语义（E7）；
  3. POSIX 侧必须处理**残留 socket 文件**（宿主先例 `#clearStaleSocket`：probe 存活后再 unlink，`src/lsp/mux/server.ts:245-256`）；
  4. 地址字符串在 Windows 上必须固定为 `\\.\pipe\...` 形态，否则会落到 Bun-only 的可达面（E8）。
- **代价/风险事实**：Windows 上名字机器全局、可枚举、先到先得（E3/E5）⇒ 可预测名字存在被他人抢占（随后本 Owner 得到 EADDRINUSE）与跨 Owner 误连的结构性风险 [INFERENCE，跨用户部分未测]。

### 4.2 次选：loopback HTTP

- **正面事实**：内置 `node:http` 两端实测可用（E9）；固定端口在 SIGKILL 后可立即复用（E10）；framework 的**出站客户端已存在**（§1.2），若走这条则只需补服务端与端口发现。
- **代价事实**：端口要么不可预测（`:0` 实测 4249/5229），要么机器全局共享且会被任何本机程序占用（E9/E5）；并会引入 HTTP 语义面（方法、状态码、body）到一条只需要"读一个小值"的通道上。

### 4.3 不构成载体的现有件（避免误判为"已有能力"）

`files.updateFile`（协调写入，非通道）；`http.request`（只有出站）；`Symbol.for` 进程注册表（同进程）；nicobailon `registerRequiredChildExtensions`（只带 `{id,path}`）；runner 的 stdio（`ignore` + 无 `ipc`）；模型消息通道（题面已排除，且 [转引] [state-follow facts §2.2#7](04-state-follow-facts.md) 的证据表明它不是可靠数据面）。

### 4.4 与既有约束的关系（只陈述）

- 任何载体都必须落在 **adapter/harness 侧或 framework `modules`**，不得让业务/共享逻辑持有第三方 context；`memory` 字段不得经任何持久化介质兑现（[转引] [state-follow facts §1.6](04-state-follow-facts.md)）。
- 若最终选择新增 framework module，判据与告警机制已经存在（`extension-development-map.md:23`；`docs/adr/0002-...:131-141`）；若不新增，则实现归属 adapter/harness。本文件**不选边**。

---

## 5. 必须进一步决定的问题（不预设答案，不批准政策）

1. **Q-A 地址与 Owner 的绑定口径**：名字由什么派生（Owner key？session id？canonical 项目目录？进程 pid？），是否要求"同一 Owner 重启后地址不变"（若否，则必须有一处发布新地址的介质）。
2. **Q-B 认证与隔离目标**：是否要求"同用户之外不可达"。Windows 上没有现成旋钮（E3/E5/E11）⇒ 若要求，只能靠不可预测名字 + 握手 token（token 存在哪、怎么让子进程拿到——而启动配置没有 payload 槽，C1）；若不要求，必须显式写下这一放弃。
3. **Q-C incarnation 事实的来源与语义**：token/generation/lock 由谁持有、放在哪（文件 / 端点握手 / 两侧派生），以及"旧地址被新进程占用"时的可见行为（拒绝、重解析、还是报不可用）。
4. **Q-D 服务端运行时的归属**：OMP 宿主是 Bun（本机实测宿主进程为 bun.exe 跑 cli.ts；Bun 1.4.2 可作管道服务端，E2），pi 侧已发布验证跑的是 Node 24.18 ⇒ **两侧都要能当服务端**；是否接受"两端共用一份 `node:net` 实现（地址字符串固定 `\\.\pipe\...`）"。
5. **Q-E 失败可见性**：`connect` 失败（`ENOENT`/`ECONNREFUSED`）与"连上了但不是我的 Owner"如何映射到 framework 公共面（`OwnerReference` 三态 / 声明默认值 / `unavailable` 的哪一条），并保证**不自动重放**失败操作（题面约束）。
6. **Q-F 端点寿命与注册/注销归属**：端点寿命如何与 Owner 寿命对齐（现有 `session_end` 撤 cell、退役 owner 仍回答声明默认值的语义，[转引] [state-follow facts §4.1](04-state-follow-facts.md)）；同一用户/同一项目有多个 main 会话时是否需要互斥。
7. **Q-G 实现归属**：新增 framework module（走 `modules` 判据与 import-boundary 流程）还是落在 adapter/harness（走既有 escape hatch 规则）——本票的用户确认范围。

---

## 6. 探针与清理记录（可复核）

- **脚本**：`%TEMP%/omp-pipe-probe/probe.mjs`（probe 1）与 `probe2.mjs`（probe 2），各约 9.6 KB / 8.3 KB；子进程代码以 `-e` 内联，无 shell、无依赖、无仓库内文件。
- **运行**：`node probe.mjs`、`node probe2.mjs`；原始结果 `result.json` / `result2.json` 已随临时目录删除，§2.3 的取值为逐字转写。
- **清理核对**：探针结束后 `fs.readdirSync("\\\\.\\pipe\\")` 中无任何 `omp-probe*` 条目（实测 `[]`），临时目录 `%TEMP%/omp-pipe-probe` 已 `rm -rf`（复核提示不存在）；所有子进程经 `SIGTERM`→`SIGKILL` 并等待 `close` 后回收。本机残留的 4 个 `bun.exe` 经命令行核对为 **OMP 宿主本体**（`...\@oh-my-pi\pi-coding-agent\src\cli.ts`，创建时间 08:44–10:08，早于探针 10:45），**非**探针残留，未处置。
- **仓库未改动**：本轮只在 `.scratch/model-cost-pi-migration/research/` 新增本文件；`.cache/` 下只读，无写入。

## 7. 未运行 / 未验证清单

1. 跨用户可达性与管道 DACL（E11 读取失败，无第二用户）——**未测**。Windows 上的隔离结论因此只能停在"Node/Bun 没有提供旋钮"这一 API 面事实上。
2. POSIX 侧（unix socket 文件、`0o700/0o600`、残留 socket 清理）——本机 win32，只有宿主源码 [静态] 与推论，**未运行**。
3. loopback HTTP 的防火墙/环回语义、以及 `readableAll`/`writableAll` 在 Windows 命名管道上的实际效果——**未测**。
4. 句柄继承、`detached`/`windowsHide` 组合下的进程树与信号语义——**未测**（不在本票范围，但与 §3.1 的 stdio 事实相邻）。
5. 任何 framework 侧集成：本轮未导入 framework、未读 State、未启动宿主、未调用模型。echo 成功**不证明**任何 State 通道可用。
