# 07：Owner State 实时读取、降级与恢复（记录）

**本文件是本票交付的验证记录**：`follow` 字段在语义使用点读取 Owner 当前 State 的读取半（framework 本机接入的读端）、暂时不可得时的声明默认值、以及有界恢复；观察范围扩大不带来 Owner 写权或效果权限。本文件不改承诺、不改 seam，也不认领 06 已交付的载体能力（端点、定位记录、两端校验、寿命释放）。

- **入口（可重跑）**：
  - `bun test tests/framework`（所属分区，含本票两个新文件）
  - `bun test tests/framework/owner-follow.test.ts`（本票 S1 分区，12 例）
  - `bun test tests/framework/owner-follow-processes.test.ts`（本票 S2 两个真实进程，3 例）
  - `bun test tests/model-cost`、`bun test tests/codebase-tools`、`bun test tests/connect-bot`（共同 State 消费者）
  - `bun run typecheck`
- **源状态**：分支 `hyper/model-cost-pi-migration/07-owner-state-72b774-411dc288ea83`，起点 `38888c6`（06 合入后的树）。本票改动：**新增** `framework/core/followed-owners.ts`、`tests/framework/owner-follow.test.ts`、`tests/framework/owner-follow-processes.test.ts`、`tests/framework/support/followed-owner-child.ts`、`tests/framework/support/followed-owner-child-runner.ts`；**修改** `framework/core/state.ts`（`StateRules.follow`、`followed`、`follows`、`dispose`、`serves` 的读端归属、移除已无消费者的 `inertCapability`）、`framework/behaviors/state-scope.ts`（`follow` 的读路径）、`framework/behaviors/session-events.ts`（非 owner 交付的能力只剩读）、`framework/behaviors/marker.ts`（跟随席位的重绘）、`framework/adapters/pi.ts`（读端接线 + quit/reload 释放）、`extensions/codebase-tools/harnesses/pi.ts`（声明子入口，使 `follow` 消费者在 pi 上可达）、`tests/framework/support/harness-port-double.ts`（可选 `follow`）、`tests/framework/support/pi-surface-double.ts`（分支条目 `data`）、说明文档（`framework/README.md`、`framework/GLOSSARY.md`、`framework/docs/framework-capabilities.md`、`framework/docs/harness-support.md`、`extensions/codebase-tools/README.md`）。
- **环境**：win32 10.0.26200 / x64；`bun 1.4.2`。依赖由 `bun install` 装入 `node_modules`（`pi-subagents@0.78.0` 等）。**无宿主补丁、无凭据、无付费调用、无模型请求**：本票不触网。

## 1. 交付的行为

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 语义使用点的当前值 | `core/state.ts` `followed()` + `behaviors/state-scope.ts` | 声明 `follow` 的子代理读 Owner **当前**值：本进程持有该 Owner 时读自己的 cell（同进程直读，不开接入）；否则读该 Owner 接入最后陈述的值。注入贡献、marker 区域、交付保留的能力三处公共消费走同一条读规则。 |
| 暂时不可得 → 声明默认值 | `core/followed-owners.ts` `read()` | 读**从不等待**另一个进程：接入尚未取得或不可达时答字段声明默认值。该默认值不写回 Owner、不写入本进程持久化介质、不作为“成功读到 Owner 值”呈现；接入恢复后同一次读回到 Owner 的真值。 |
| 按需、合并、有间隔、有上限 | `FollowedOwners.#attempt/#open/#spacing` | 同一 turn 内对同一目标的多次读合并为一次尝试；失败后按 `baseMs × 2^(n-1)` 间隔、在 `maxMs` 处停止增长；连接健康时**不轮询**（值变更由接入单向推来）；恢复只影响后续读，不重放已执行操作。 |
| 结束与处置 | `FollowedOwners.read/dispose`、`adapters/pi.ts` | `ended()` 的接入被弃用而非复用，间隔过后重新打开（断连不证明 Owner 结束）；`StateStore.dispose()` 释放全部接入并永久停止跟随（pi 装配在 `session_shutdown` 的 `quit`/`reload` 上释放）。 |
| 观察不扩大权限 | `behaviors/session-events.ts` | 非 owner 交付交给 handler 的能力只有读：读的是该字段继承规则的值，`write` 与 `notify` 全部丢弃（无论交付结束前后），因此扩大订阅到每个实际会话只增加观察。 |
| 跟随席位的区域 | `behaviors/marker.ts`、`core/state.ts` `serves/follows` | 已**读过**该 Owner 的 store 也回答该席位；跨进程值的变化在本地没有 transition 可发布，因此该进程的运行起点把区域按当前值重绘（行随 Owner 值出现/消失，不停在首次绘制）。 |

## 2. 自动证据（真实运行）

```
$ bun run typecheck                                   # tsc --noEmit，无输出（exit 0）
$ bun test tests/framework                            # 466 pass / 0 fail（38 files, 2236 expect；本票前 451）
```

日志：`.scratch/model-cost-pi-migration/evidence/logs/07-{typecheck,framework,consumers}.log`。

**S1（`tests/framework/owner-follow.test.ts`，12 例；受控时钟 + 可控 seat，无 wall-clock 等待）**

- P14：接入先答 `false`（读不等待，预算 `waitMs`=2000 被记录）→ Owner 改为 `true` → 下一个公共消费（注入贡献 + marker 行）为真 → 再改回 `false` 亦跟随；子启动交付携带的持久化 payload 未被当作值。同进程：Owner 的 cell 直接回答，`opens` 为空（无任何接入）。
- P15：`inheritance: none` 在 Owner 为 true 时仍读声明默认值且**零 open**；`unresolved` 同；不可达时消费为默认值、seat 自身值不变、无写回、之后即使交付携带持久化 payload 仍不是值来源；可达后读到 Owner 真值（说明先前默认值不是一次测量）。
- P16：同一 turn 内 3×2 次读合并为 **1** 次 open 且都答默认值；access 落地后为 Owner 值；接入 `ended()` 后该连接被 `dispose`（计数 1）且后续读答默认值、下一次读重新打开并读到新值；订阅交付只发生一次（不重放）。间隔与上限：注入 policy `{waitMs:20, baseMs:20, maxMs:60}`，open 时刻严格为 `[0,25,75,135,195,255]`（间隔 20→40→60→60→60，无上限时第 6 次应在 620ms）。健康期 200 次虚拟推进的重复读只增加 0 次 open、`request` 计数为 0；`store.dispose()` 后 600s 虚拟时间仍是零 open。
- P17：同一 binding 的 owner/session 两组订阅同一批会话事件；session 组对**子侧**交付 `write(false)`/`notify` 全部无效（`persisted`/`feedback`/`markers` 空、Owner 值仍为 true、保留的 handle 同样无效），子侧命令不生效，而 Owner 自己的命令写盘并通报；owner `session_end` 后保留的 handle 出生即失效。
- 装配：真实 `piAdapter` + `CODEBASE_TOOLS`（`childEntry` + `follow`）——Owner 会话把席位发布到本进程注册表，spawned 会话解析 `{kind:"inherited", key:"main:pi-follow-owner"}`，其运行起点的区域呈现 Owner 的行；对照定义（默认 `none`）既不发布席位也不呈现任何行。

**S2（`tests/framework/owner-follow-processes.test.ts`，3 例；两个真实子进程 + 真实名管道/套接字）**

- 服务进程（真实 `StateStore` + publisher + 真实配置文件的 `runtimeDir`）与跟随进程（真实紧跟装配的读端接线）分离运行：跟随者首读答默认值、随后读到 Owner 的 true（marker 行同时出现）；Owner 改为 false 后跟随者读到 false（marker 行消失），再改回 true 亦跟随。
- Owner 撤席（`session_end`）：跟随者继续工作并读声明默认值（此前为 true，未被保留成真）；另一个真实服务进程重新服务同一席位后，跟随者再次读到 true。
- 跟随者 `dispose` 后不再读、也不再打开接入（Owner 后续改动不影响）。

**消费分区**：`bun test tests/model-cost tests/codebase-tools tests/connect-bot` 合跑 **555 pass / 5 fail**（56 files，2964 expect；日志 `logs/07-consumers.log`）。5 条失败全部来自 `tests/connect-bot`（`budget-regression`、`harness-exit-budget`、`panel-registration-lifecycle` ×2、`request-timeout`），失败原因是**环境缺件**而非行为变化：这些用例要真实 omp-bot 互操作二进制，本机没有（`the interop run needs the actual omp-bot panel, but no binary is at C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`）。它们在本票改动前后都依赖该二进制，且抛错点在任何 State 路径被加载之前；**本票不据此声称 connect-bot 的这 5 条通过**。`tests/model-cost` 与 `tests/codebase-tools` 在本次合跑中无失败。本票改动了共同 State 读路径、非 owner 能力与 marker 发布门，三者都是这两端消费者直接依赖的公共面。

## 3. 故障注入（每条注入后立即还原并复跑绿）

方法：逐条改写实现一处行为，跑本票两个分区，记录是否失败，然后还原原文件（还原后复跑 15 pass / 0 fail）。

| 注入 | 结果 |
| --- | --- |
| `follow` 的继承读退回 `view`（读自己进程的空 cell） | KILLED（15 pass → 7 pass / 8 fail） |
| 非 owner 交付重新拿 Owner 的能力（P17 回退） | KILLED（11/4） |
| 并发读不合并（去掉 in-flight 守卫） | KILLED（10/5） |
| 间隔不设上限 | KILLED（14/1） |
| 已结束的接入被复用 | KILLED（13/2） |
| marker 门忽略“跟随席位” | KILLED（13/2） |
| `dispose` 后仍跟随 | KILLED（14/1） |
| 失败不设间隔 | KILLED（14/1） |

## 4. 验收条目对应

| 票面条目 | 证据 |
| --- | --- |
| 同进程与真实独立进程在子启动后更新 Owner；一致快照，不用启动值/持久化旧值 | §2 S1 前两条 + S2 第一条。同一次处理的一致快照由“读从不等待 + 单次处理内同步读同一接入状态”实现：S1 断言同一 turn 内 6 次读全部相同，S2 断言跟随者读到的是 Owner 改动后的值而不是打开时的值。 |
| 区分权威 false / 读取失败 / `none`；`memory` 不从旧持久化恢复；默认值不写回、不称成功 | §2 S1 P15 全部条目；`memory` 与“不从旧持久化恢复”的读侧证据是：交付携带的持久化 payload 未成为跟随者的值来源，且默认值读不产生任何写（`persisted` 空、Owner 值不变）。权威 true 与默认值可通过“改回真值后读到”区分（同一条读）。 |
| 真实断开/恢复与可控故障；有限等待、同目标合并、有上限退避、无重放、健康无轮询；可靠失效/处置后不复活 | §2 S1 P16 全部条目 + S2 第二、三条。 |
| Owner/session 两订阅观察同一会话事件；子侧与失效句柄越权无效（真实写/外部效果计数），Owner 正常操作仍成立 | §2 S1 P17：写尝试 vs Owner 真实值、`persisted`/`feedback`/marker 发布计数、子侧命令无效果、Owner 命令写盘。 |
| 迁移受影响共同 State 消费者并跑 OMP 回归；恢复任务随票释放 | `extensions/codebase-tools/harnesses/pi.ts` 声明子入口（`follow` 的消费者由此在 pi 上可达）；开发与释放见 §1 表；回归见 §2 消费分区与 §5。 |
| **P14/P15/P16/P17（S1）** | §2 S1 分四段逐条对应。 |
| **P16（S2）** | §2 S2 三条。 |
| P57 的 P17 观察权限项 | §2 S1 P17 段（负向证据用真实写尝试 + 效果计数，不以 widget 数值不变代替）。 |

## 5. 未覆盖项（保持未验收）

1. **真实 pi 宿主运行（S2「实际加载」）本次未执行**：本票的跨进程事实由两个**真实独立进程**（真实 `StateStore` + 真实命名管道/套接字 + 真实共享配置文件）取得，但「真实 pi 进程加载本装配、由真实 provider spawn 的子会话读到 Owner 值」没有运行。原因：`tests/harness-dock` 在本 worktree 不可执行（与 06 记录的同一限制：宿主补丁工件链缺文件），且真实 pi 双进程跟随场景需要额外的真实宿主脚本；本轮预算耗尽前未完成该脚本。**不得据此声称真实 pi 路径已认证**。
2. **POSIX 未执行**：本机 win32；读端复用 06 的载体，unix socket 分支无运行证据。
3. **消费分区日志**：`tests/model-cost` / `tests/codebase-tools` / `tests/connect-bot` 的合跑结果记在 `logs/07-consumers.log`（本次执行结果以该文件为准；`tests/harness-dock` 未执行）。
4. **真实终端观感、真实 provider 账户侧核对**：不属本票（23/24 与人类验收）。
5. **`extensions/codebase-tools/harnesses/pi.ts` 的子入口声明**：本票认定它属于“迁移受影响共同 State 消费者”的必要接线（否则 `follow` 在 pi 上无生产消费者、本票承诺不可达）；其真实宿主加载由后续真实宿主回归（21）覆盖。
