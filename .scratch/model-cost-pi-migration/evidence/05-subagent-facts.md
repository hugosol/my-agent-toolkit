# 05：真实子入口接入与可靠会话事实（记录）

**本文件是本票交付的验证记录**：pi adapter 的子代理接入（P3）、会话身份/直接父/Owner/名称/启动快照的映射（P11/P12/P13）及其自动与真实宿主证据。本文件不改承诺、不改 seam，也不重复认领后续票的条目。

- **入口（可重跑）**：
  - `bun test tests/framework/pi-session-facts.test.ts tests/framework/pi-subagent-integration.test.ts`（本票新增的 S1 分区）
  - `bun test tests/framework`（所属分区 + 共同契约消费者）
  - `bun test tests/model-cost`（S3 文档消费者；本票未改其模块，用于确认未被波及）
  - `bun run typecheck`
  - `bun scripts/pi-subagent-smoke.ts`（真实宿主入口；见 §5 的完成度声明）
- **源状态**：分支 `hyper/model-cost-pi-migration/05-subagent-facts-dfc162-411dc288ea83`，起点 `2928430`（[05] 的 WIP 提交）。本票改动为 `framework/adapters/pi.ts`、`framework/adapters/pi/session.ts`、`framework/adapters/pi/nicobailon.ts`、`tests/framework/support/pi-surface-double.ts`、新增 `tests/framework/support/pi-session-files.ts`、`tests/framework/pi-session-facts.test.ts`、`tests/framework/pi-subagent-integration.test.ts`、新增 `tests/harness-dock/fixtures/pi-session-facts/{entrypoint,prefix}.ts`、新增 `scripts/pi-subagent-smoke.ts`。**本票未改** `extensions/model-cost/**`、`framework/core/**`、`framework/behaviors/**`（00 之前的 WIP 已交付的部分沿用）。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2 / node 24.18.0；真实宿主 pi 1.2.0（`D:\nvm4w\nodejs\...\pi-coding-agent\dist\bundle\cli.js`）、第三方工件 `pi-subagents@0.78.0`（本仓库 `node_modules/pi-subagents`，即 `package.json` 的固定依赖）。无 provider 凭据、无付费调用：所有模型请求都由本机 OpenAI 兼容捕获端点回答。

## 1. 交付的行为（本票实现）

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 接入结果四态 | `framework/adapters/pi/nicobailon.ts`、`framework/core/protocol.ts`（WIP 已定型的公共形状） | `none`（本进程没有 provider 工件，或工件在但没有任何 provider 在跑：既未宣告也未应答）/ `failed{registration}`（要求被 provider 自己的登记拒绝，或 settle 无会话可登记）/ `failed{protocol}`（被拒绝的查询、读不出的接口版本）/ `failed{identity}`（为**另一个会话**作答）。四者互不冒充，且都以诊断行报告。 |
| 两种 provider 陈述 | 同上 `ask()` | 同时读 provider 的 `ready` 宣告与其对 `ping` 的应答：**实际加载顺序**下本入口先 settle，此时 provider 还没有会话上下文，应答不带 `session`（`session:{}`）；宣告随后才带。因此「不带会话的应答」被读作**没有身份主张**（不判失败、不判成功主张），等窗口内出现带会话的陈述；拒绝是立即成立的答案。 |
| 会话事实映射 | `framework/adapters/pi/session.ts` | 直接父＝pi lineage link 指名的**会话文件**里 header 自己的 `id`；Owner＝该链上最近的自持顶层会话（跨进程可读）；`new`/`fork` 是 pi 自建副本，不是 spawn；启动快照只写在**证明是开始**的那次 start 上。 |
| 一次交付一个决定 | `framework/adapters/pi.ts` | start 交付只解析一次 position，facts 与 owner 都由它读出（WIP 里 owner 先于 start 记录解析，导致 `new`/`fork` 的 kind=main 与 owner=inherited 互相矛盾——已修）。子会话在本进程开始/结束时只是它自己的交付，不再把主子会话误当转移（WIP 会给主会话发一次假的 `session_end(transferred)`）。 |
| 登记与订阅的释放 | `nicobailon.ts` + `pi.ts` | 要求按会话登记，随该会话自己的结束（或离开它）释放，随所属接入释放；provider 自己的文档也把「通常在一次会话结束时 dispose」列为约定。 |

## 2. S1 自动证据（本票分区，真实运行）

```
$ bun run typecheck                      # tsc --noEmit，无输出
$ bun test tests/framework               # 429 pass / 0 fail（35 files, 2024 expect）
$ bun test tests/model-cost              # 380 pass / 0 fail（29 files, 1934 expect）
$ bun test tests/framework/pi-session-facts.test.ts tests/framework/pi-subagent-integration.test.ts
                                         # 30 pass / 0 fail（18 + 12）
```

- **P11（`pi-session-facts.test.ts`）**：顶层会话自持 Owner 且无父（不把「没有父」写成「取不到父」）；被生成会话的直接父是**父会话文件 header 里的 id**（文件名与 id 故意不同，证明读的是 header 不是路径）；嵌套会话的直接父 ≠ Owner（Owner 沿链到顶层）；同名不同身份保持各自 id/父/Owner；`fork`/`new`（带 link）是自己顶层的会话；链不可读/首行非会话 header/链成环 → 父与 Owner 明确不可得（`unavailable` 具名、owner=unresolved，不猜）；本进程内的子会话有自己的 start/end 交付且不结束所服务的主会话；无名会话把事实写成不可得而非空名。
- **P12**：改名是一次 `session_facts` 交付——同一 id/kind/父/Owner 下换成新名（主子与子会话各一例）；被清空的名字是无名而不是旧名。
- **P13**：模型＋有效 thinking level 只出现在证明是开始的那次 start；`resume`/`fork`/分支已有对话 → 不写；只缺一半时另一半保留、缺的那半具名；会话被重新绑定（reload）时不重发第二次 start，原快照不被后续值覆盖。
- **P3（`pi-subagent-integration.test.ts`）**：没有 provider 在跑 → `none` 且**不报失败**（同时断言登记确实已就位、模式与记录数无关）；被拒的登记 → `failed{registration}`（诊断含 provider 自己的原话，且不发出任何查询）；不支持的接口版本 / provider 拒绝查询 → `failed{protocol}`；为另一会话作答 → `failed{identity}`（诊断同时列出两个身份）；无会话声明的应答 → 不判失败（见 §3），并且「应答无会话、随后宣告指名另一会话」由宣告定案为 identity；模式在初始化节点只 settlement 一次（provider 之后才宣告、子会话随后开始，都不改变交给扩展的那个答案）；会话自己的结束/转移各自释放其登记，释放不影响仍在的会话。

**故障注入（每条注入后立即还原并复跑绿）**

| 注入 | 结果 |
| --- | --- |
| A：spawn 判定忽略 start reason（只看 link） | 1 条失败：`fork`/`new` 是自己顶层会话 |
| B：任何 shutdown 都结束所服务的 Owner | 1 条失败：子会话自己的 start/end 不结束主会话 |
| C：`releaseSession` 变成空操作 | 3 条失败：三个释放用例 |
| D：被拒的登记当成 `none` | 1 条失败：registration 诊断用例 |
| E：忽略身份不匹配 | 1 条失败：identity 用例 |

## 3. 真实宿主事实（本机实测，源不变）

三次探针运行（pi 1.2.0 + 工件 0.78.0 + 捕获端点 + 隔离 agent/session/work/home），结论都已并入实现：

1. **provider 的两种陈述**：`ready` 载荷带 `session:{cwd,sessionId,sessionFile}`；而在**本入口先 settle** 的顺序下，`ping` 应答的 `session` 是 `{}`（provider 尚无会话上下文），`ready` 随后才带。→ 促成 §1「不带会话的应答＝没有身份主张」这条实现。
2. **一次真实前台委派**（脚本化 `subagent({agent:"scout",task:…,async:false})`）：子会话真的被生成，其会话文件首行是 `{"type":"session","id":"01a143a5-461c-…","parentSession":"<父会话文件绝对路径>"}`——正是本 adapter 读取的形状；provider 自己的运行元数据 `<runId>_scout_0_meta.json` 记 `parentSessionId`＝父会话 id，且 `launchResolvedExtensions.required=["model-cost"]`、`effective=[runtime, model-cost]`：**本票的登记确实把本扩展加载进了子会话**（provider 自己的启动证据，非本 adapter 自述）。
3. **前台委派会打死父进程（阻塞本票 S2 的后半段）**：provider 的**默认前台子会话在本进程内**创建（其 `child-session.js` 用 `pi.SessionManager.create(...)` + `pi.createAgentSession(...)` 并写 `parentSession`），pi 因此把父会话的扩展 ctx 标记为失效；本扩展自己的 pi 前端（`extensions/model-cost/harnesses/pi/widget.ts:212` 的 `render` 读 `ctx.hasUI`）在下一次重绘时抛出

```
Error: This extension ctx is stale after session replacement or reload. …
    at render (extensions/model-cost/harnesses/pi/widget.ts:212:34)
    at announce (shared-logic/request-accounting.ts:752:44)
    at Object.announceChanged (…:1166:7)  at Object.onChange (runtime.ts:273:32)
    at fail (shared-logic/provider-balance.ts:193:12)  at runQuery (…:241:7)
```

   未捕获 → 父 pi 进程退出（`Node.js v24.18.0`），本轮既不 settle 也不保存；换用能正常应答的余额端点也照样复现（触发点是被替换之后的任意一次重绘）。这是**扩展自己的前端持有 ctx 后长期重绘**与**provider 进程内替换会话**的组合问题，落在 pi 前端/装配线（[02]/[20] 范围），不属本票机制；本票把它作为真实宿主阻塞点上报，未做静默降级或补丁。**后台（`async:true`）委派走独立进程，不触发该失效**（首次探针即如此）。

## 4. 真实宿主 `scripts/pi-subagent-smoke.ts` 的已得结果

一次运行（隔离布局、受控 `childEntry`）在预算结束前完成并记录：

```
pi 1.2.0 (…pi-coding-agent\dist\bundle\cli.js)
  ok  the harness under test is the fixed version this script states
  ok  the pinned provider artifact this repository installs is present
phase: no subagent provider loaded
  ok  the host's own session facts reach a subscribed extension
  ok  nothing was diagnosed as a failed subagent integration
  ok  this run created one session and no child session
  ok  the session's consumption was accounted and saved under its own identity
  ok  the saved startup pair is the one the host stated at the session's own start
```

- 该 run 建了一个本 run 自己的仓库布局（`extensions/model-cost/config.yaml` 指向隔离存储根 + `entrypoints/pi/model-cost.ts`），**因此主子会话都不会写到操作者的真实存储根**；本次同时核对了操作者真实 `~/.omp/cost-archive/consumption.json`：pi 分区 0 条记录，本票探针没有留下数据（探针的多次运行都未完成一次 Round 保存）。
- 「保存的启动快照＝宿主在会话开始自己陈述的那一对」是 P13 在真实宿主上的交叉核对：一边是 pi 自己给出的 `deepseek/deepseek-flash@off`，一边是扩展写进文档的 `startup`。
- **完成度声明**：脚本的其余三个阶段（被拒的 child entry、真实前台委派、真实后台委派）在本次运行时预算耗尽前**未跑完**（前台阶段另受 §3.3 的进程崩溃限制）。脚本本身通过 `bun run typecheck`，并已把 §2 的 S1 断言与 §3 的真实事实作为可重跑入口固定下来；未跑完的部分按要求记为**未验证**，不声称通过。

## 5. 复用与归属

- **S3 业务面（文档/展示）** 由既有分区覆盖且本票复核有效（本票未改这些模块、分区全绿）：`tests/model-cost/session-ownership-tree.test.ts`「改名即时进展示、下一次既有提交才写盘、不新建身份、不额外消费」＝P12 的 S1/S3；`tests/model-cost/session-recovery.test.ts`「启动事实随消费提交保存、新进程读回、未证明开始的会话保持未知」＝P13 的 S3；`tests/model-cost/consumption-document.test.ts` 的 startup 读取规则。它们驱动的是与宿主无关的公共交付，pi 侧只差「把同一交付喂进去」——本票的 S1 分区正是这一层。
- **未认领**：Round/Turn 边界与后台保活属 [03]/[19]；`/budget detail` 的无子代理分支属 [04] 之后的动作票；本票不复制其断言。

## 6. 未验证 / 未覆盖

1. **前台委派的「子会话事实进入公共交付」**：被 §3.3 的进程崩溃阻断（父进程死亡 => 本进程内的子会话交付与随后的保存都观察不到）。这需要前端/装配线先处理失效 ctx，再由本票的真实入口补跑。
2. **嵌套、后台/续跑/取消、fork 继承、进程替换**：脚本未能跑完这三条真实路径（预算）。其中后台路径的独立进程形态已由第一次探针观察到「不触发 ctx 失效」，但**未**观察到子会话记录落盘。
3. **`none` 的「工件根本不存在」形态**：本机必装 `pi-subagents@0.78.0`，所以真实宿主只覆盖了「工件在、没有 provider 在跑」这一支；「工件不存在」与它同属 `none`（同一分支的提前返回），未单独在真实宿主构造。
4. **POSIX**：所有真实运行都在 win32 上执行，POSIX 未运行。
5. **第三方内核内部**：本票只读 provider 的公开表面（`required-child-extensions`、`subagents:rpc:v1:*`），未依赖其私有字段；但 §3 的 `child-session.js` 行为是**读其源码**得到的解释（用于说明崩溃成因），不是公开接口承诺。
