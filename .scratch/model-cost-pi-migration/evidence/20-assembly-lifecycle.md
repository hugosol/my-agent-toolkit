# 20：完整装配的共享准备与处置验证（记录）

**本文件是本票交付的验证记录**：P48、P49 的完整 Coverage（S1、S2、S3），以及 P57 中「P48：共享准备、工厂及根专属效果不重复」「P49：处置后旧资源不再产生效果」两项。本文件不改承诺、不改 seam，也不重复认领后续票的条目。

- **入口（可重跑）**：
  - `bun test tests/model-cost/pi-assembly-lifecycle.test.ts`（本票新增的 S1/S2/S3 分区，10 例）
  - `bun test tests/model-cost`（所属分区；40 files / 463 pass）
  - `bun test tests/framework`（共同契约消费者；38 files / 481 pass）
  - `bun run typecheck`
  - `PI_CLI=D:/nvm4w/nodejs/pi.cmd bun scripts/pi-subagent-smoke.ts`（真实宿主入口；本票扩了真实前台委派与后台委派两个阶段的断言，见 §4）
- **源状态**：分支 `hyper/model-cost-pi-migration/20-assembly-lifecycle-<id>`，起点 `1ccc443`（19 的合入点）。改动：`extensions/model-cost/shared-logic/runtime.ts`、`framework/adapters/pi.ts`、`framework/adapters/pi/round.ts`、新增 `tests/model-cost/pi-assembly-lifecycle.test.ts`、`scripts/pi-subagent-smoke.ts`、`framework/docs/harness-support.md`。**本票未改** `framework/core/**`、`framework/behaviors/**`、OMP adapter、其他扩展与工作流报告；**未改任何前票的票据/证据文件**。实现提交 `127638a`（证据与票据状态随本记录的提交）。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2 / node 24.18.0；真实宿主 pi 1.2.0（`D:\nvm4w\nodejs\...\pi-coding-agent\dist\bundle\cli.js`）、第三方工件 `pi-subagents@0.78.0`（仓库固定依赖与其 `node_modules` 安装）。无 provider 凭据、无付费调用：所有模型请求与两个 provider 查询都由本机捕获端点回答。未涉及 OMP 补丁条件（未跑 OMP dock，见 §6）。

## 1. 交付的行为（本票实现的三处修复）

本票是组合行为票。按 05 的遗留与真实主机事实，本票在**装配线**发现并修复了三处缺陷；三处都在 `tests/model-cost/pi-assembly-lifecycle.test.ts` 里各有回归用例，并各以故障注入确认过（§5）。

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 共同记账准备与根侧效果分离 | `shared-logic/runtime.ts`（`loadBaseline` / `prepare` / `account`） | 实例的“共同记账准备”（有效期文档基线 + 独立 Codex 估计）不再捆绑在 owner 节点的 initialization 里，而是**由该实例服务的第一个 delivery** 拉起、一次结果共享给并发调用者；owner 节点的 initialization 只在此之上做**根侧效果**（两个 provider 源预取 + UI）。于是“这个实例服务的会话”都能在配置/有效基线/计费输入就绪后处理记账，而“不是 owner 的会话实例”（pi 的 spawned session 自己的求值，含子进程）不冒充 Owner 触发根侧效果。 |
| 根侧 provider 读取只属于开始了自己根侧启动的实例 | `shared-logic/runtime.ts`（`rootSideStarted` 门） | 余额/额度的“已结算请求触发刷新”只在**本实例自己做过根侧启动**时发生。没有读数但从未做过 initialization 的实例（spawned session 自己的实例）不再因 `due(undefined)` 去查同一个 provider account——那是同一 account 的第二次根侧读取，而不是“对自己读数的刷新”。 |
| 会话自身结束后的迟到读取 | `framework/adapters/pi.ts`（`endedSessions`）、`framework/adapters/pi/round.ts`（`sessionOver`） | Round 的结束候选在**下一个 task** 上复检（framework 既有规则），而 pi 在会话结束后就让它的 ctx 失效：spawned session 最后一个 Round 的复检过去读到失效 ctx 抛错 → Round 永不收口 → 该会话的消费**永不保存**。现在 adapter 用它**自己观察到的会话结束**回答这两处迟到读取：会话已结束 ⇒ 处于静止、且没有任何东西还能继续它。framework 的 Round 语义、owner 语义与公共 initialize/cleanup 含义均未改变；OMP 未受影响（另一份映射）。 |

## 2. 自动证据（本票分区，真实运行）

```
$ bun run typecheck                                   # tsc --noEmit，无输出
$ bun test tests/model-cost                           # 463 pass / 0 fail（40 files, 2499 expect）
$ bun test tests/model-cost/pi-assembly-lifecycle.test.ts   # 10 pass / 0 fail
$ bun test tests/framework                            # 481 pass / 0 fail（38 files, 2250 expect）
```

`pi-assembly-lifecycle.test.ts` 的接缝是生产的一半以上都不是本文件的替身：真实 `definition` + 真实 framework pi adapter + `createModelCostRuntime`（真实存储根、可控时钟）+ 真实 `observeSessionContext`/`attachModelCostWidget`，且**前端释放按生产装配的方式组合进 framework 的唯一 `cleanup`**（`releasingFrontendsOnCleanup`）。文件里的两处替身都有明确契约：`modelRegistry` 按 pi 的宿主形态给出 provider access（于是两条 provider 查询是**真实出站请求**，由本文件的 `httpRequest` 记录），以及 UI 的边界等待用记录式 double（真实调度规则属 19 的分区）。一次装配 = 一次 pi 扩展求值。

- **P48 工厂无外部效果**：绑定（=工厂跑过）后：出站请求 0、存储根目录**尚未创建**、widget 0 帧、边界等待 0、notice 0；而只读结果可读（余额读数为“无”）。
- **P48 第一请求等待 + 并发准备共享**：owner 会话 start + 首个 run initiation 时，两条 provider 请求**都已出站且都未作答**（并行），此时 run initiation 未 settle；作答后 settle，且只有那一对请求（并发两次 run initiation 同样只产生一对）。
- **P48 spawned session 自己的实例（= 子进程形态）**：只服务该 spawned session 的实例里，该会话 1 次请求被记账并保存为自己的记录（identity/直接父/金额三处独立核对），文件里另一条已存在记录逐字段不变（说明是与文件合并而非与空文档），而**出站请求 0、widget 0 帧、边界等待 0 个**。
- **P48 同一实例的第二个会话**：owner 的预取对只有一对（不按会话重复），headless 绑定**没有**第二次登记边界等待、没有以该会话身份交付过 widget；该会话的消费是自己的记录（不带进 owner 的记录）。
- **P49 owner 处置**：会话语义结束（`quit`）后：widget 被清除（一次 `lines: undefined` 交付）、边界等待登记归 0、此后又一次交换既不绘制也不写盘、`synchronize()` 返回 `{kind:"closed"}`。
- **P49 spawned 会话结束 / idle 边界不误清理活实例**：spawned session 自己的结束与一次 idle Round 结束都不清除显示、不释放登记；owner 的下一次交换照旧被记账、保存并绘制。
- **P49 会话结束后的迟到复检**：spawned session 的 Round 结束候选在宿主已**作废其 ctx**（`spend()`，pi 自己的契约：失效 ctx 的每次读都抛）后才复检——该交换仍被记账并保存成自己的记录（这正是 §1 第三处修复的回归）。

## 3. 负向证据（P57 的 P48/P49 两项）

P57 要求“区分没有副作用与没有可见数值变化”。本票对每条修复都用**效果计数 / 活动登记 / 文件前后对照**表达，而不是 widget 数值：

| 对照面 | 本票观察 | 敏感性对照（证明不是“什么都看不到”） |
| --- | --- | --- |
| 网络（根侧 provider 读取） | spawned session 自己的实例：整段用例出站请求 **0**；同一进程的 owner 实例：恰好一对（1 余额 + 1 额度） | 同一文件里 owner 用例的计数随真实查询增长；注入 §5-C 后子实例立即多出请求 |
| 记账写入（文件） | 处置后：文档字节与之前逐字节相同、无新 widget 帧；预备阶段（工厂刚跑完）存储根**不存在** | 同一用例随后的一次真实交换让字节改变（`until` 等到它出现） |
| UI 登记 | headless 绑定的边界等待登记 **0**、无该会话身份的 widget 交付；处置后 owner 的登记 **1 → 0** | spawned 会话的 start 在同一实例里确实会走到前端（`taken` 保持 1，说明没有为它新建等待） |
| 迟到结果 | 处置后注入的迟到 provider 回答经变更通知抵达前端重绘，但**不产生任何帧、不写盘**（`synchronize()` 为 closed） | §5 注入让该路径在修复前确实抛错/写盘 |

## 4. 真实宿主事实与已执行的真实路径

1. **pi 1.2.0 的扩展求值是“每会话一次”，即使同一条入口路径**（本票实现依据，本机实测）。用一个临时探针写在运行自己布局的 child entry 上（`console.error` 到 stderr），一次真实前台委派得到：

```
PROBE evaluated pid=38172
PROBE session_start 01a14443-f0dd-... "startup"
...
PROBE evaluated pid=38172                       # 同一进程，第二次求值
PROBE session_start 01a14443-f64c-... "startup"  # 子会话，parent=<主会话文件>
```

   探针随后记录到该子会话求值自己的整条主轴（`before_agent_start`、`agent_start`、`before_provider_request`、`after_provider_response`、`message_end(assistant)`、`agent_settled`、`session_shutdown quit`）。这解释了本票两处缺陷为何只在真实主机上出现：同进程的 spawned session 有**自己的实例**（自己的 runtime/准备/前端登记），而不是共享 owner 的实例；探针后来已从脚本移除，本票不把它留作运行期机制。

2. **修复前的真实事实（本票的发现过程）**：同一前台委派下，文档里**只有 owner 的记录**（子会话 1 次真实请求的消费无处落盘），余额查询为 **2**（子实例的第二次 provider account 读取），并出现一次 `reading whether the session is at quiescence failed: This extension ctx is stale after session replacement or reload`（子实例的 Round 复检读到失效 ctx）。三者分别对应 §1 的三处修复。

3. **修复后的真实前台委派（`PI_CLI=... bun scripts/pi-subagent-smoke.ts`，全部通过）**：
   - provider 自己的启动证据把 model-cost 列为子会话的 required/effective 扩展，且 parent session id 与本会话一致；
   - 子会话自己的文件写明直接父＝本会话文件；
   - **父会话的 run 在同一进程内站着子会话时仍然 settle**，其 Round 结束且累计落盘（05 §3.3 的崩溃点在本票修复后的真实路径上不再出现：本次运行 `stale-extension-context` 诊断计数为 0）；
   - **子会话自己的消费按自己的身份、以本会话为直接父保存**；
   - **整进程余额查询恰好 1 次**：子会话自己的求值没有第二次预取；
   - 子会话的绑定没有在这块显示上画过任何东西（widget 帧里不带该子会话名）；
   - 子会话自己的结束没有处置活实例：随后一次交换仍被记账并保存；
   - 本 run 退出是**进程自己退出**（不是被 kill），退出后存储根不再有写入。

4. **真实后台委派（独立进程）**：脚本会驱动一次 `async: true` 委派并等待子会话自己的文件与它自己进程保存的记录。本次运行观察到：子会话文件真的被 detached runner 写出（header 带 `parentSession`），但该 run 的 `subagent-artifacts` 为空，45 秒内没有该子会话的记录落盘——该 dock 的后台 runner 在本机从未走到模型请求（见 §6.2）。因此**独立子进程形态的“不重复根侧效果”在真实主机上未取得证据**；本票对该形态的证据是同一代码路径的 hermetic 分区（§2 的第三、四条用例）与真实运行里“同进程子会话自己的求值”这一同形事实。

## 5. 故障注入（每条注入后立即还原并复跑绿）

| 注入 | 结果 |
| --- | --- |
| A：`account()` 不再等待准备（直接 `work()`） | 1 例失败：spawned session 自己的实例用例，报 `a session snapshot was committed before the store loaded a baseline`（正是修复前的真实症状） |
| B：去掉 `if (!rootSideStarted) return`（子实例也刷新） | 2 例失败：子实例用例的出站请求从 0 变 1+、余额读数不再是“无” |
| C：`quiescent`/`heldWork` 忽略 `sessionOver`（round 修复回退） | 1 例失败：会话结束后的迟到复检用例，报 `reading whether the session is at quiescence failed: ... stale` |

三条注入分别对应 §1 的三处修复，且各自只由本票新增用例捕获（既有分区在修复后全绿，见 §2 命令）。

## 6. 未覆盖与限制

1. **独立子进程（后台/分离 runner）形态未取得真实证据**：见 §4.4。该 dock 的 detached runner 在本机不产生模型请求（`subagent-artifacts` 为空、无记录），无法观察“子进程不重复根侧预取/UI”。本票未把它标为通过；同一代码路径由 hermetic 分区覆盖（第二个装配 = 第二个进程的求值）。要补真实证据需要该 runner 在本机真正跑通一次委派（模型端点/凭据/平台条件），不属本票可执行范围。
2. **适用重载（`session_shutdown reason=reload`）的真实路径未驱动**：pi 的 RPC 入口本票未找到可脚本化的 reload 动作。真实路径覆盖的是 `quit` 与“新进程读同一存储根”；reload 语义由 hermetic 用例（`sessionEnds(MAIN, "reload")` 同 `quit` 走同一条 disposed 分支；`sessionEnds` 与 `sessionStarts` 的其余 reason 在既有 pi 分区覆盖）与 framework 的生命周期分区覆盖。
3. **OMP 真实宿主（dock）回归本 worktree 无法启动**：`tests/harness-dock/*` 因 `host-patches/omp-18.5.0-viewed-session/patch.diff` 被检出为 CRLF 而报 `patch.diff touches no file`（既有环境条件，本票未改动该文件；19 的记录同样如此）。本票对共享路径的证据是 `tests/framework` 分区（S1 消费者）与 OMP adapter 未被改动；**未**把 dock 通过算作已得。
4. **`connect-bot` 的 panel 生命周期分区在本 worktree 因缺少 OMP bot 工件而失败 5 例**（`tests/connect-bot/support/omp-bot.ts` 报 “omp bot binary” 不存在），与本票改动无关（本票未改 connect-bot 或其依赖），属既有环境条件。
5. **child 实例自己的 cleanup 不会因它自己的会话结束而运行**：framework 的 cleanup 依旧只在“本实例服务的 owner 会话结束”时运行（公共含义未改）；spawned session 自己的实例在进程内不会走到那一步，其实例的登记随宿主对该会话求值的收回结束。本票未改这一公共语义，也未新增按会话的释放机制（那会与“不新增租约/引用计数/资源池”冲突）。**未观察到由此产生的残留效果**（§2 的处置用例、真实 run 的退出检查），但该形态的长期行为未单独验证。
6. **POSIX 未运行**；全部真实运行都在 win32。

## 7. 复用与归属

- **P48/P49 之外的条目**：P4/P17/P33/P45/P51 各由 17/07/04/19/22 拥有，本票不复制其断言；本票只补 P57 中 P48、P49 两项。P10/P18 的记账与 Round 语义由 08/03 拥有，本票的第三处修复是**装配/映射线**（session 结束后的迟到读取），不改变它们的公共语义。
- **既有检查的复核**：`tests/framework/implementation-lifecycle.test.ts`（工厂无副作用、owner 节点初始化、第一请求等待、至多一次 cleanup、处置后不再交付）、`tests/model-cost/runtime-initialization.test.ts`（并行预取、一个 CLI 共享一次初始化、处置后迟到回答不是读数）、`tests/model-cost/pi-season-boundary.test.ts`（每 UI 一个等待、释放取消等待）在本票改动后全部仍绿（§2 命令），本票据此把它们作为有效证据复用，并在新分区里补上真实装配的组合面。
- **文档同步**：`framework/docs/harness-support.md` 的 `execution.round-main-trunk`（或同域行）补记 pi 侧的“会话自身结束后迟到读取由 adapter 观察到的结束回答”，即本票第三处修复的宿主事实；该行同时保留 pi 不发布 timer 等既有记录。
