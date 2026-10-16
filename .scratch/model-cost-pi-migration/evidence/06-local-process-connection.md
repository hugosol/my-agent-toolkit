# 06：受目标与寿命校验的本机接入（记录）

**本文件是本票交付的验证记录**：framework 管理的本机接入（P42、P56）——运行目录的显式配置与明确失败、单端点/多席位的本机流、定位记录与两端校验、寿命释放，以及它在 pi 装配与 State 存储上的接线。本文件不改承诺、不改 seam，也不重复认领后续票的条目（`follow` 在使用点取值的默认值/恢复/等待策略由 07 拥有）。

- **入口（可重跑）**：
  - `bun test tests/framework/local-access.test.ts`（本票新增的 S1 分区，21 例）
  - `bun test tests/framework`（所属分区）
  - `bun test tests/model-cost`、`bun test tests/codebase-tools`（共同契约消费者：两端适配器都用 `StateStore`；codebase-tools 是声明 `inheritance: "follow"` 的扩展）
  - `bun run typecheck`
  - `bun test tests/harness-dock`（真实宿主；本 worktree **不可执行**，见 §5）
- **源状态**：分支 `hyper/model-cost-pi-migration/06-local-process-connection-2eec5e-411dc288ea83`，起点 `304451e`（05 合入后的树）。本票改动：**新增** `framework/modules/local-access.ts`、`tests/framework/local-access.test.ts`、`tests/framework/support/local-access-child.ts`、`tests/framework/support/local-access-child-runner.ts`；**修改** `framework/core/state.ts`（`StateRules.localAccess`、席位的 offer/withdraw、变更广播）、`framework/adapters/pi.ts`（按 `childEntry` × `follow` 决定是否为进程建 publisher）、`framework/config.yaml`（新增 `runtimeDir: ".runtime"`）、`.gitignore`（忽略 `framework/.runtime/`）、`tests/framework/support/pi-surface-double.ts`（新增可选 `definition`），说明 `framework/README.md`、`framework/docs/framework-capabilities.md`、`framework/GLOSSARY.md`。**本票未改** `extensions/**`、`framework/behaviors/**`、`framework/adapters/omp.ts`、`host-patches/**`、任何其他票或工作流文件。
- **环境**：win32 10.0.26200 / x64；`bun 1.4.2`（`D:\nvm4w\nodejs\bun.cmd`，`bun test` 与子进程都用它）。依赖由本次 `bun install --frozen-lockfile` 装入 `node_modules`（`pi-subagents@0.78.0`、`yaml@2.9.1`、`@types/node@26.6.4`、`typescript@7.0.2`、`bun-types@1.4.2`）。**无宿主补丁条件**：本机接入由 framework 自己拥有，不经任何 OMP/pi 宿主补丁，`host-patches/**` 一行未动。**无凭据、无付费调用、无模型请求**：本票不触网。

## 1. 交付的行为（本票实现）

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 显式运行目录 | `resolveRuntimeDirectory`（`modules/local-access.ts`）+ `framework/config.yaml` | 目录只来自共享配置文件的 `runtimeDir`；相对值以**该文件自身所在目录**解析（不看进程 cwd），绝对值照写。无文件、无该键、空串/空白串、非字符串（数字/映射/列表/`null`）都抛 `LocalAccessConfigurationError`，文本里点名实际解析到的文件；**不代入**临时目录、cwd、storageDir。目录缺失时按配置值创建（路径是显式声明的，不是回退）。 |
| 本机端点（一进程一端点，席位多路复用） | `OwnerAccessHost` | Windows 绑定 `\\.\pipe\my-agent-toolkit-access-<random>`（内核命名空间，不是磁盘目录）；POSIX 绑定 `<runtimeDir>/access-<random>.sock`。id 每进程随机，只经定位记录发布，不可预测、不被后继进程复用。懒绑定：工厂构造无任何副作用，第一次 offer 才建目录/绑端点。 |
| 定位记录与消息分离 | `#writeLocation` / `readLocation` | 每席位一条 JSON：`{extension, owner, endpoint, verification, pid}`，写同名 staged 文件后 rename 发布（`0o600`）。**不含**值、State 或业务数据。pid/endpoint 只是信息，不作生死判据。记录读不出、缺 endpoint/verification 字段、或内容指名的席位与文件所依据的席位不一致 → 一律当**没有记录**，不跟随。 |
| 双向校验 | 协议 `hello`/`welcome` | 读端带（目标席位 + 它读到的 verification）问；服务端只在「该席位此刻在服务」且「verification 与本次发布一致」时作答，并在 `welcome` 里回报它服务的席位，读端再核一次。拒绝即以 `refused` 关连接、不带任何值。 |
| 单向推送 + 按需请求/应答 | `changed` / `read`+`value` | 席位值变化单向推给为该席位放行的连接；`read` 是按需请求/应答；未知字段答「无此声明值」。**没有**写帧、没有方法名/参数表：不是任意 RPC，非声明帧一律 `refused`，无远端 State 写入。 |
| 同进程直读 | `localOwnerAccess` + `directCaller` + `globalThis` 注册表 | 本进程在服务的席位由**源本身**回答：不读配置、不读记录、不开端点。`ended()` 与 `dispose()` 语义在直读路径上同样成立。 |
| 寿命释放 | `#withdraw` / `dispose` / `OwnerAccessCaller.dispose` | 撤席即删该席位记录、停止其观察、释放为该席位放行的连接；最后一席撤销即关端点（含 POSIX socket 文件）；`dispose` 撤全部席位并关端点。调用方 `dispose` 关连接、清观察者、拒绝在途等待；`ended()` 在接入被释放时立即为真，不必等下一次请求。握手有 2000ms 预算（未说话的连接被释放）；打开与单次 read 都有可声明的等待预算（复用 `isScheduledWait`）并受 `AbortSignal` 释放。 |
| 接线 | `core/state.ts` + `adapters/pi.ts` | store 在自己的 owner 生命开始处 offer、在结束该 cell 的边界 withdraw（Idle 与单次活动结束不释放），值变化经 `#announce` 推给接入。pi 装配只在「本宿主会把本入口加载进它 spawn 的会话」（`childEntry`）×「该扩展声明 `follow`」时建 publisher；两者缺一都不建（OMP 的子代理是本进程 binding，因此 OMP 不建）。配置失败由 publisher 的 report 通道报一次（pi 走 stderr 诊断行）后不再服务。 |

## 2. 自动证据（真实运行）

```
$ bun run typecheck                      # tsc --noEmit，无输出（exit 0）
$ bun test tests/framework/local-access.test.ts   # 21 pass / 0 fail / 123 expect
$ bun test tests/framework               # 451 pass / 0 fail（36 files, 2150 expect）
$ bun test tests/model-cost              # 394 pass / 0 fail（31 files, 2011 expect）
$ bun test tests/codebase-tools          # 24 pass / 0 fail（7 files, 334 expect；`follow` 声明者的消费者分区）
```

日志留存：`.scratch/model-cost-pi-migration/evidence/logs/06-{typecheck,framework,model-cost,codebase-tools}.log`。

**本票分区逐条（`tests/framework/local-access.test.ts`，全部用真实载体/真实文件/真实子进程）**

- 运行目录：相对值解析到配置文件自身目录；绝对值照写；**真实子进程**在另一个 working directory 里解析出同一目录并真的被本进程读到值；上表 8 种非法/缺失配置逐条抛 `LocalAccessConfigurationError` 且点名文件、工作区除配置文件外无任何写入；无可用目录时真实子进程只报一次诊断、不在配置文件旁或自己 cwd 里建任何东西；配置失败重试仍是配置失败（`LocalAccessConfigurationError`，不是 `LocalAccessUnavailableError`）；仓库自带 `framework/config.yaml` 解析为 `framework/.runtime`。
- 跨进程读写：真实子进程发布席位，本进程 `openOwnerAccess` 读到启动值、按需 `read` 与推送变更都成立，未知字段答「无声明值」；记录恰有 5 个字段、verification 是 64 hex、记录是运行时目录里唯一文件；win32 下 endpoint 是 `\\.\pipe\...` 且**不在**运行时目录之内（POSIX 分支断言 socket 文件就在该目录内，本次未执行，见 §5）；子进程 stderr 不含 verification。
- 同进程直读：配置路径故意**不存在**（配置若被读必然失败）仍读到当前值、观察到变更、`request` 立刻答；offer 撤销后 `localOwnerAccess` 为空。另：本框架调度不了的等待预算（`waitMs: 0`）在直读与跨进程两条路径上都抛 `LocalAccessConfigurationError`（沿用 `isScheduledWait` 的判定，不被替换）。
- 拒绝面：改写记录里的 verification（合成秘密）→ `refused`，且拒绝文本/子进程 stderr/子进程结果都不含合成秘密与真 verification；记录内容改指另一席位 → 按**没有记录**处理（`no-location`）；原始 socket 直接以另一席位 + 本席位 verification 问 → `refused` 且无 `welcome`；记录指向不再存在的 endpoint → `endpoint-absent`；记录文本损坏或指名本席位但无可读 endpoint/verification → `no-location`；`session_end` 后记录消失、仍连着的那一方下一问 `closed`、新开为 `no-location`；`dispose` 后记录消失**且端点本身不再存在**（迟到连接 `rejects`）；原始 socket 发 `{t:"write",id,field,value}` → `refused` 且响应里没有 `value`，随后经正常读端确认服务端值未变。
- 同进程两席位 + **真实子进程读端**：撤掉第一席 → 读端**不经任何请求**即 `ended()`（`endedWithoutAsking`）、其请求 `closed`、没有收到任何跨席位推送；第二席读端 `ended()` 为假、仍收到自己的变更并正常应答。
- 秘密收敛：运行时目录内的**唯一**含 verification 的文件就是该定位记录；调用方能看到的 `values()`、子进程 stderr 与结果文件都不含它。
- 接线（S1 消费面）：带 publisher 的 `StateStore` 在 owner 起始时发布席位、在 `session_end` 撤下记录与本进程注册；pi 装配对 `definition(follow) + childEntry` 发布并随会话结束撤下，`follow` 或 `childEntry` 缺一都不发布（且不注册）。

## 3. 验收条目对应

| 票面条目 | 证据 |
| --- | --- |
| 真 Windows 命名管道 / POSIX 本机 socket 跑单向推送与按需请求应答；同进程直读；不用业务文档、文件队列或目录扫描传消息 | §2「跨进程读写」「同进程直读」+ §1 协议表。载体是 `node:net` 的真实 pipe/socket；同进程路径不读配置/记录、不开端点；消息只走连接，定位文件只被**按席位名读一次**（不列举、不轮询接收）。 |
| runtimeDir 缺失/空/非法/相对值/多进程一致定位；不回退隐藏目录、cwd、storageDir；Windows 管道名与磁盘目录分开记录 | §2「运行目录」全部条目；win32 的 endpoint/目录分离在 §2「跨进程读写」记录，POSIX 侧结论见 §5（未执行）。 |
| 真实子进程 + 合成秘密核对错误 Owner、旧端点、过期定位、处置后连接的拒绝，以及可取得的模型请求/日志；真实凭据不输出 | §2「拒绝面」「秘密收敛」。合成秘密（`synthetic-verification-…`）**不出现**在任何可取得的文本里；真实凭据本票不涉及（无凭据、无模型请求）。「模型请求」面的可取得输出限 framework 交给宿主的内容与诊断通道，见 §5 的限度声明。 |
| 通信资源与定位跟随接入寿命释放；不开放通用 RPC 或远端 State 写入；不把本机验证推广为跨用户或 POSIX 认证 | §2「拒绝面」的撤席/处置/写帧三例 + §1 寿命释放表；跨用户与 POSIX 认证**不作任何声称**（模块头与 `framework/docs/framework-capabilities.md` 明确写「不是 OS 访问控制/跨用户边界/POSIX 认证」）。 |
| **P42 完整 Coverage（S1、S2）** | S1：§2「运行目录」「接线」——绑定与 store 的 S1 消费面上观察诊断与运行产物（记录出现/消失），不静默当重连可修复。S2：真实独立进程配置错误、相对值与一致定位在 §2 由真实子进程执行，观察其诊断与运行产物；**「实际加载后的 model-cost 操作 interface」（真实 pi 进程内）本次未执行**，见 §5。 |
| **P56 完整 Coverage（S1、S2）** | S1：§2「拒绝面」「秘密收敛」「接线」。S2：真实独立进程的读写/拒绝/释放都在真实载体上执行；真实宿主侧的处置与诊断留待 §5 声明的限制。安全含义严格限本机接入范围（合成秘密=本接入自己的 verification，不是凭据）。 |

## 4. 故障注入（每条注入后立即还原并复跑绿）

方法：对 `framework/modules/local-access.ts` / `core/state.ts` / `adapters/pi.ts` 逐条改写一处行为，跑对应用例，记录是否失败，然后还原原文件。

| 注入 | 结果 |
| --- | --- |
| 缺 `runtimeDir` 时改用环境 `TEMP` 兜底 | KILLED（`no-location`/配置失败用例） |
| 服务端不再比对 verification | KILLED |
| 拒绝前先发一个 `welcome`（值先泄漏） | KILLED |
| 同进程直读分支被跳过 | KILLED |
| 记录内容指名的席位不再核对 | KILLED |
| 读不出的记录仍当记录用（`decode` 守卫去掉） | KILLED |
| 记录的 endpoint/verification 字段校验去掉 | KILLED（记录指名本席位、无可读 endpoint 时被当成可跟随） |
| 撤席时不删该席位记录 | KILLED |
| 撤席时不释放为该席位放行的连接 | KILLED（补上 `ended()` 与「两席位 + 真实读端」用例后才成立；此前该差异被「下一次 read 时的席位守卫」掩盖） |
| 打开时不等待定位记录（直接假定存在） | KILLED |
| `follow` 判定去掉（任何带 `childEntry` 的扩展都发布） | KILLED |
| 任何带 `id`+`field` 的帧都按 `read` 服务 | KILLED（探针帧补上 `id` 后才成立） |
| `#closeEndpoint` 的 `!disposed` 条件——**该条件实际是死代码**（dispose 前已由最后一次撤席关掉端点），已从实现中删除；处置用例观察的是端点真的消失 | 结构修正，不再保留不可观察分支 |
| POSIX socket 文件不删 | **不可观察**：删除语句在 `process.platform !== "win32"` 分支内，本机 win32 永不执行（见 §5） |
| 定位记录非原子发布（直接写目标文件） | **不可观察**：读端把半写记录当「没有记录」并重试，用例无法区分；保留 staged+rename 作为本仓库既有的发布约定（`files.ts` 同法），并**不声称**该点有测试证据 |

## 5. 真实宿主与平台限制（未覆盖项，保持未验收）

1. **真实 pi/OMP 宿主运行未执行（S2 的「实际加载」面）**：本 worktree 没有固定宿主安装（`.cache/` 被 gitignore、不在检出内），`tests/harness-dock` 在**任何本票代码被加载之前**就失败：`C:\Users\hugos\AppData\Local\Temp\hyper-ticket-mQncog\host-patches\omp-18.5.0-viewed-session\patch.diff touches no file`（`tests/harness-dock/host-patch-artifact.ts:224`，来自 13 的 viewed-session 工件链）。因此「真实 pi 进程里 model-cost 加载运行时 `runtimeDir` 缺失/非法 → 观察诊断与运行产物」「真实 pi 子会话跨进程读 Owner 值」这两条**本次没有执行**，也不能写作通过。已执行的是同一实现路径的 S1 消费面（pi surface double 的绑定 + State store）与真实独立进程。
2. **POSIX 侧未执行**：本机 win32，`\\.\pipe\` 名称空间与实际 pipe 已实测；unix socket 文件、`0o700/0o600`、socket 残留与清理只有代码路径与断言（用例里以 `process.platform` 分支表达），**没有运行证据**，不得据此声称 POSIX 已认证。
3. **跨用户与 DACL 未验证**：`node:net` 不提供 Windows 管道安全描述符入口；本机无第二用户。本票只声称「verification 区分是哪一次接入/哪个席位」，不声称跨用户隔离。
4. **句柄继承、`detached` 组合**未测（不在本票范围）。
5. **「可取得的模型请求」限度**：framework 交给宿主的模型内容（本次为注入贡献）与诊断通道是本票可观察的输出面；真实 provider 请求体不在本票范围内采集，故 P56 的该面只做到「诊断/结果/错误文本/可读值不含 verification」。
6. **`framework/.runtime/` 会在仓库内被创建**（pi 装配的默认运行目录，已 gitignore）：pi 侧用例会在该目录发布/撤下记录，用例结束时清掉；这是本票有意记录的行为而不是临时目录回退。

## 6. 本票未做（归属说明）

- **今天两个已装扩展都不满足两道门**：`extensions/model-cost/harnesses/pi.ts` 声明了 `childEntry` 但 `MODEL_COST` 未声明 `follow`；`extensions/codebase-tools/harnesses/pi.ts` 用 `piAdapter(CODEBASE_TOOLS)`（无 `childEntry`）而它声明了 `follow`。因此本票交付的接线在今天的装配下**不发布任何端点/记录**（这正是门控的目的：没有外部读端就不付端点与记录的代价）。能力本身由 S1 用例用「`follow` + `childEntry` 的 definition」驱动并观察（§2「接线」）；真正的消费者是 07（在使用点读 Owner 值）与后续为 codebase-tools 的 pi 装配声明子入口的票。
- `follow` 在语义使用点取 Owner 当前值、暂时不可得时的声明默认值、同目标合并、退避与恢复、不重放、越权边界：**属于 07**（本票只提供被它消费的接入能力：读写两侧、寿命与校验）。
- 子代理推送观察事实到另一进程的业务消费、OMP 适配器侧的接入（OMP 会话全在本进程，故不建端点，见 `ompAdapter` 的说明）：后续装配票按实际需要接。
- 真实终端观感、效率/复杂度的最终判断：属 22/23 与人类验收；本票只记录同进程零端点、健康空闲无轮询（release/wait 都由事件与预算驱动）。
