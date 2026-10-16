# pi 异步委派子会话观察失效：调查记录与方案讨论

**性质**：独立调查记录，不属于既有 ticket/evidence 系列。记录症状、真实例子、决定性证据、根因与候选方案；**修复方案尚未定案**，实现票待讨论后另开。

**环境**：win32 / bun 1.4.2 / node 24.18.0；真实宿主 pi **1.3.0**（`D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent`）+ 固定工件 `pi-subagents@0.78.0`。无 provider 凭据、无付费调用；模型请求由本机 OpenAI 兼容捕获端点回答，扩展存储根落在临时 home。操作者真实 `~/.omp/cost-archive/consumption.json` 与 `~/.pi/agent/sessions` 仅**只读核对**。

## 1. 症状（用户报告，2026-10-17）

- 异步委派执行后，`/budget detail` 看不到该子代理行；重启 pi 后重复同一操作仍看不到。
- 主会话自身一切正常：余额、Codex 额度窗口、主会话 model 行与 widget 均正常渲染（这一点最初造成"没有调用子代理"的误判）。

## 2. 真实例子

### 例 1：多扩展登记冲突（已在提交 `a4572e5` 修复）

- 主会话：`~/.pi/agent/sessions/--E--Developer-myhub-my-agent-toolkit--/2026-10-16T16-39-25-865Z_01a14595-29a9-743d-a0fa-4715c4178145.jsonl`；第 20/21 行 `agent: general`（Unknown agent，失败），第 23/24 行 `agent: researcher`（异步成功）。
- 该 run 启动结果：`launchResolvedExtensions.required = ["codebase-tools"]`、`effective` 两项 —— **model-cost 没被加载进子会话**。
- 原因：provider 对每个父会话只接受一份 required-child-extensions 快照，先加载的 codebase-tools 独占；第二份被拒（`Required child extensions are already registered for session '...'; dispose them first.`）。

### 例 2：登记修复后仍无记录（当前未修）

- 主会话：`.../2026-10-16T17-32-07-981Z_01a145c5-69ac-70d2-977e-01473ce2e827.jsonl`（重启后新会话）。
- 异步委派 run `2b1f4bea-59a9-4c4b-82e4-a9c23a6210c2`（`researcher`）：`launchResolvedExtensions.required = ["codebase-tools", "model-cost"]` —— 登记已生效。
- 子会话文件 `.../01a145c5-69ac-70d2-977e-01473ce2e827/474c05ab-c785-4ca3-9b06-f315efab03ea/run-0/session.jsonl`，header：`{"id":"01a145c5-fc29-7065-ac7d-fcb86184aa5f","parentSession":"...01a145c5-69ac-70d2-977e-01473ce2e827.jsonl"}`。
- provider `status.json`：`state=complete`、`turnCount=12`、`totalTokens={input:18658,output:8815,total:27473}`。
- 操作者真实 `consumption.json`：`harnesses.pi.sessions` 只有主会话一条，**没有该子会话记录**。
- 完成后父会话确实收到通知（第三方自定义消息，含 run 身份）：

```json
{"type":"custom_message","customType":"subagent-notify","display":false,
 "details":{"runs":[{"agent":"researcher","status":"completed","runId":"2b1f4bea-...","durationMs":82232,
   "sessionLabel":"Session file","sessionValue":"C:\\...\\run-0\\session.jsonl"}]}}
```

## 3. 决定性证据：逐进程时间线

同一次 `--background-only` 运行，用临时探针记录每个进程的 Round 事实（探针已还原；原始记录见 §10 附录 A）：

| 进程 | 事件（相对首个事件） |
|---|---|
| 父进程（dock 的 rpc 会话） | `session_start` → `activity_started`(+54ms) → `round_start`(+54ms) → `settled/completed`(+304ms) → `candidate`(+304ms) → `recheck:false`(+307ms) → `activity_started`(+1598ms) → `settled/completed`(+1608ms) → `candidate`(+1608ms) → **`recheck:true`(+1610ms) → `round_end`(+1610ms)** → `session_shutdown`(+46340ms) |
| 子进程（provider 的 detached runner） | `session_start` → `activity_started`(+6ms) → `round_start`(+6ms) → `settled/completed`(+109ms) → `candidate`(+109ms) → **`session_shutdown`(+111ms)**（无 recheck、无 round_end） |

结论：**Round 边界映射正确**（start 与 settle 都到达子进程），缺的是**结束确认**。确认被排在 harness 的"下一个 task"（pi：`setTimeout(callback, 0)`，`framework/adapters/pi.ts:648`），而 runner 在 settle 后约 2ms 就 dispose 会话并结束进程，那个 macrotask 永不执行。

## 4. 对照实验：只差一次 macrotask

只在子入口的 `session_shutdown` 加 `await 500ms`（探针，已还原；见 §10 附录 B），同一子进程立刻出现：

| 进程 | 关键事件 |
|---|---|
| 子进程 | `round_start` → `settled/completed` → `candidate` → `shutdown-entered` → **`recheck:true` → `round_end`** → `shutdown-after-delay`(+500ms) |

同一次运行的背景阶段**全部通过**（"the child's own consumption was saved under the child's own identity by its own process"）。

两条推论：pi 会 await 异步 `session_shutdown` handler；缺口不在映射能力，而在**承载确认的进程已经退出**。

## 5. 为什么 OMP 与 pi 前台没有这个问题

- OMP 的 `nextTask` 同样是 `setTimeout(callback, 0)`（`framework/adapters/omp.ts:856`），映射与延迟确认机制与 pi 相同。
- 差别在进程寿命：OMP 的子会话是**本进程 binding**（`framework/adapters/omp.ts:986`），宿主进程在子会话 settle 后继续存活，且提交进的 store 就是 display 读的那个；pi 前台委派（子会话在父进程内）同理。
- 只有 pi **异步**（独立进程且随即退出）会丢。任何"宿主另起进程、且该进程在子会话结束后立即退出"的子代理路径都会有同一类问题。

## 6. 已交付部分：多扩展合并登记（提交 `a4572e5`）

- `framework/adapters/pi/child-extensions.ts`（新增）：同一父会话的多个扩展条目合并成一份 provider 快照，按扩展独立登记/释放；换快照同步 dispose+register，被拒时回滚为已接受快照；注册表经 `Symbol.for` 跨模块图共享。
- `framework/adapters/pi/nicobailon.ts` 改用该模块；`tests/framework/pi-child-extensions.test.ts`（新增）与 `tests/framework/pi-subagent-integration.test.ts`（新增共存用例）覆盖。
- 自动证据：`bun test tests/framework/pi-child-extensions.test.ts tests/framework/pi-subagent-integration.test.ts` → 19 pass / 0 fail；`bun test tests/framework tests/model-cost tests/codebase-tools` → 987 pass / 0 fail（87 files / 5163 expect）；`bun run typecheck` exit 0。
- 真实宿主（前台，`--foreground-only --expect-pi-version 1.3.0`）→ 14 observations held，关键条目：

```text
ok  the provider's own launch evidence names both framework extensions as loaded child extensions
ok  the child session's own work is saved under its own identity, with this session as its direct parent
ok  budget detail draws the real child session after a multi-extension delegation
```

- 真实宿主（后台，`--background-only --expect-pi-version 1.3.0`）→ **失败**，即本 bug 的回归位：

```text
SmokeFailure: check failed: the asynchronous child's consumption is saved
  no consumption document this case expects was published at <run>/.omp/cost-archive/consumption.json
```

## 7. 根因汇总

| # | 根因 | 状态 |
|---|---|---|
| 1 | 多扩展在同父会话各自登记 required-child-extensions，provider 只接受一份 | 已修（§6） |
| 2 | 子进程在自己 Round 结束被确认前退出：确认排在下一个 macrotask，runner 随即 dispose 并结束进程 → 无 `round_end` → `request-accounting.ts:1098 roundEnded` 的 `runtimes.activityEnded` 与 `save()` 都不执行 | 未修（主项） |
| 3 | 生产装配没有 `runtime.synchronize` 的调用者（全仓仅测试调用），父进程不会 adopt 别的进程写入的记录 | 未修（归既有"只读刷新"范围） |
| 4 | 跨进程子会话的"运行中"活动无来源：`sessionActivity` 由**本进程** Round 边沿喂入（`runtime.ts:599/604`），detached 子会话的边沿只出现在它自己的进程 | 未修（需政策） |

## 8. 影响面

| 失效 | 不受影响 |
|---|---|
| 子代理自身消费（token/费用）与 `Run:` 耗时（只在 `roundEnded` 结算） | 主会话自己的 Round / Turn / Session 合计 |
| detail 子代理行、含后代合计、周期 Accrued 中属于它的分段 | 余额读数、Codex 额度窗口、主会话 widget |
| 该子会话启动快照（ADR-0004：只随既有消费提交写入） | 登记（例 2 的 required/effective 正确） |
| 跨进程子代理的行活动色（根因 4） | 前台委派与 OMP 子会话的全部行为 |

## 9. 政策对照、候选方案与待讨论问题

### 政策对照

- 「跨进程运行中消息使用 framework 内部本机 IPC，文件只作持久化与定位」已定（`decision/lighthouse 04` 的 Q34 及其第 123 行），因此子会话→owner 的观察应复用本机 IPC 载体，而不是文件队列/目录扫描。
- 现有本机接入的方向是 owner → 另一进程会话（`AccessTarget = {extension, owner}`、`openOwnerAccess`、`createOwnerAccessPublisher`），**没有 child → owner 的席位语义**，且**没有写帧**。
- shared-logic 侧两个 registry（`sessionActivity`、`sessionContext`）已是"按 session id 的某时刻读数、无读数即无"，`display.ts:773` 读法不变：观察通道落地时变的是"谁供给"。
- 消费不走消息通道（ADR-0004 + Q34），因此通道不能替代下面的 A 案。

### A 案：会话自身结束时确认未决 Round 并保证提交写完（针对根因 2）

- 两个落点：① 需要一个"会话已结束"入口（例如 `HarnessPort` 新增信号），pi adapter 在 `session_shutdown` 调它；`round-events.ts` 对未决候选按已有事实确认（`sessionOver` → 静止为真、无后台持有）并派发 `round_end`。② 该确认触发的 `save()` 必须被 await（今天 `dispatchRoundEvent` 不等待 handler 的 promise），并带等待预算。
- 语义表述可复用既有词汇："会话结束截断未完成 Round"（framework glossary 允许 truncation）。
- 不采用：期限流逝即关轮、轮询、为子代理新增回收/看门狗。
- 备选 A3（业务层订阅 `session_end` 自行保存）：把 Round 语义搬进业务，与 ADR-0004"保存时机为 framework round_end"冲突，且同样要解决 await/flush，故倾向 A 案。

### C 案：子会话 → owner 的观察通道（针对根因 4）

- 复用本机 IPC；同进程（OMP、pi 前台）已由 Round 边沿供给，只能由"子会话不在 owner 进程"时发布，否则双写。
- **新的关键问题——身份发现**：本机接入没有写帧，子会话只能**自己开席位**由 owner 按名读取（既不允许列举目录，也不允许轮询）。而 owner 在**运行中**不知道子会话 id：例 2 中它只在**完成通知**里拿到 `sessionValue`（会话文件路径）。三个候选：
  1. 完成通知顺带提供身份 → 只能"完成后出现"，不解决运行中活动色。
  2. 子会话启动时向 owner 注册 → 需要新增 child → owner 的注册语义（超出既有词汇）。
  3. owner 主动读提供方运行中事实（async run 的 `status.json`、`external-runs` 等公开面）找子会话 id → 可行但与"不轮询"的既有政策需划边界。
- 失效语义：通道断开或子进程消失必须是"读数不存在"（行回普通色），不得留成永久 working。
- 无 A 案时，子会话的 `idle` 边沿永不产生，通道只会推 working，之后靠连接断开清掉。

### 待讨论问题

1. A 案是否足够？它只解决"落盘丢失"；行出现仍取决于父进程下一次提交或一次只读同步，是否本轮同时接上"文件可能已变"的刷新触发（根因 3）。
2. A 案的确认范围：仅 `session_shutdown(disposed)`，还是 `session_end(transferred)` 也确认？（倾向仅 disposed + 该会话自身身份）
3. A 案 flush 的等待预算与失败语义；是否只对 pi 生效（OMP 无进程早退问题）。
4. C 案的载体：扩展现有本机接入（新增一种 seat target）还是另立"子会话观察"模块？（倾向扩展同一载体）
5. C 案的装配门控：现有为 `childEntry` + `follow`；新方向的门控改成什么？
6. C 案承载哪些事实：只活动状态，还是同时含 context 读数（`Ctx:` 列）？耗时与消费仍留在文件。
7. C 案是否先写政策记录（动的是 framework 公共词汇：方向/席位/寿命）再实现；A 案可先行。

## 10. 附录：原始探针记录

### 附录 A：逐进程 Round 事实（`event` 为探针标签；`at` 为毫秒时间戳）

```text
{"pid":43024,"at":1792172756200,"event":"session_start","id":"01a145d2-0b27-..."}   ← 父进程
{"pid":43024,"at":1792172756254,"event":"signal:activity_started","id":"01a145d2-0b27-..."}
{"pid":43024,"at":1792172756254,"event":"edge:round_start","id":"01a145d2-0b27-..."}
{"pid":43024,"at":1792172756504,"event":"signal:settled/completed","id":"01a145d2-0b27-..."}
{"pid":43024,"at":1792172756504,"event":"candidate","id":"01a145d2-0b27-..."}
{"pid":43024,"at":1792172756507,"event":"recheck:false","id":"01a145d2-0b27-..."}
{"pid":40320,"at":1792172757444,"event":"session_start","id":"01a145d2-11be-..."}   ← 子进程
{"pid":40320,"at":1792172757450,"event":"signal:activity_started","id":"01a145d2-11be-..."}
{"pid":40320,"at":1792172757450,"event":"edge:round_start","id":"01a145d2-11be-..."}
{"pid":40320,"at":1792172757553,"event":"signal:settled/completed","id":"01a145d2-11be-..."}
{"pid":40320,"at":1792172757553,"event":"candidate","id":"01a145d2-11be-..."}
{"pid":40320,"at":1792172757555,"event":"session_shutdown","id":"01a145d2-11be-..."}
{"pid":43024,"at":1792172757798,"event":"signal:activity_started","id":"01a145d2-0b27-..."}
{"pid":43024,"at":1792172757808,"event":"signal:settled/completed","id":"01a145d2-0b27-..."}
{"pid":43024,"at":1792172757808,"event":"candidate","id":"01a145d2-0b27-..."}
{"pid":43024,"at":1792172757810,"event":"recheck:true","id":"01a145d2-0b27-..."}
{"pid":43024,"at":1792172757810,"event":"edge:round_end","id":"01a145d2-0b27-..."}
{"pid":43024,"at":1792172802540,"event":"session_shutdown","id":"01a145d2-0b27-..."}
```

### 附录 B：`session_shutdown` 加 `await 500ms` 的对照

```text
{"pid":43460,"at":1792172818224,"event":"session_start","id":"01a145d2-fd50-..."}   ← 父进程
{"pid":43460,"at":1792172818278,"event":"signal:activity_started","id":"01a145d2-fd50-..."}
{"pid":43460,"at":1792172818279,"event":"edge:round_start","id":"01a145d2-fd50-..."}
{"pid":43460,"at":1792172818546,"event":"signal:settled/completed","id":"01a145d2-fd50-..."}
{"pid":43460,"at":1792172818547,"event":"candidate","id":"01a145d2-fd50-..."}
{"pid":43460,"at":1792172818550,"event":"recheck:false","id":"01a145d2-fd50-..."}
{"pid":28552,"at":1792172819510,"event":"session_start","id":"01a145d3-042f-..."}   ← 子进程
{"pid":28552,"at":1792172819516,"event":"signal:activity_started","id":"01a145d3-042f-..."}
{"pid":28552,"at":1792172819516,"event":"edge:round_start","id":"01a145d3-042f-..."}
{"pid":28552,"at":1792172819611,"event":"signal:settled/completed","id":"01a145d3-042f-..."}
{"pid":28552,"at":1792172819611,"event":"candidate","id":"01a145d3-042f-..."}
{"pid":28552,"at":1792172819613,"event":"shutdown-entered","id":"01a145d3-042f-..."}
{"pid":28552,"at":1792172819613,"event":"recheck:true","id":"01a145d3-042f-..."}     ← 确认发生
{"pid":28552,"at":1792172819614,"event":"edge:round_end","id":"01a145d3-042f-..."}   ← 轮次结束
{"pid":43460,"at":1792172819667,"event":"shutdown-entered","id":"01a145d2-fd50-..."}
{"pid":28552,"at":1792172820126,"event":"shutdown-after-delay","id":"01a145d3-042f-..."}
{"pid":43460,"at":1792172820182,"event":"shutdown-after-delay","id":"01a145d2-fd50-..."}
```

## 11. 未验证与限制

1. `--background-only` 当前失败（§6），红信号保留为回归位；前台阶段与 `tests/framework`、`tests/model-cost` 分区为绿。
2. 探针（`globalThis.__budgetTrace`、`[DEBUG-budget-child]`）已从 `framework/**`、`extensions/**`、`scripts/**` 还原：`grep '__budgetTrace\|DEBUG-budget' framework extensions scripts` 无命中。
3. 真实宿主为 pi 1.3.0；脚本对固定 1.2.0 的版本断言由新增的 `--expect-pi-version` 显式声明，1.2.0 上**未复跑**。
4. OMP 结论来自源码/架构对照（`adapters/omp.ts` 的 `nextTask` 与"本进程 binding"注释），未在 OMP 上运行。
5. POSIX 未执行（全部观察在 win32）。
6. 例 1/例 2 只读核对了真实的会话文件与 `consumption.json`；没有写入、付费调用、安装或清理用户数据。
7. 本 worktree 的代码改动（含登记修复与该 bug 的回归位）已随提交 `a4572e5` 落盘；同一提交还含他人对 `extensions/model-cost/harnesses/{omp,pi}/widget.ts`、`shared-logic/presentation/display.ts` 及新增 `tests/model-cost/mixed-channel-rows.test.ts` 的改动，本记录的证据未涉及这些文件。

## 12. 可复现入口

- `bun test tests/framework/pi-child-extensions.test.ts tests/framework/pi-subagent-integration.test.ts`
- `bun test tests/framework tests/model-cost tests/codebase-tools` 与 `bun run typecheck`
- `bun scripts/pi-subagent-smoke.ts --foreground-only --expect-pi-version 1.3.0`（绿，14 observations）
- `bun scripts/pi-subagent-smoke.ts --background-only --expect-pi-version 1.3.0`（红，本 bug 的回归位）
