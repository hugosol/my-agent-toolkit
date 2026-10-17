# 12 真实宿主复用验收 — 证据（2026-10-17）

本票是 P24、P34、P35 的唯一完整验收与测试所有者：同进程零端点路径、两种进程位置的共同观察含义、
两个实际 adapter 的复用边界，以及可归因的真实宿主报告。实现面没有新增产品逻辑；本轮新增一项确定性
覆盖（`tests/framework/process-mode-reuse.test.ts`），并修复了 `scripts/pi-subagent-smoke.ts` 前台阶段
一个把“提交先后”当同步事实读取的验收检查（详见「发现与修复」）。报告严格区分确定性检查、真实进程、
真实宿主和视觉/表面观察；未执行或未取得的证据在末尾保留为未验证，不折算为通过。

## 环境与源码状态

| 项 | 值 |
| --- | --- |
| 工作树 | `C:/Users/hugos/AppData/Local/Temp/hyper-ticket-Jq0PSO` |
| 分支 / HEAD | `hyper/framework-subagent-observation/12-real-harness-reuse-verificati-f0bd4a-e98ea402077c` / `3b0a1f7`（基于集成分支 `hyper-tdd` 的 09 合并提交；本轮改动未提交前 HEAD 不变） |
| 系统 | Windows 11 家庭版 10.0.26200，AMD64 |
| 运行时 | bun 1.4.2；node v24.18.0 |
| pi 实际宿主 | pi 1.3.0，`D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js` |
| 第三方 provider | `pi-subagents@0.78.0`（本仓 `node_modules`，仓库锁文件安装） |
| OMP 实际宿主 | OMP 18.5.0，隔离安装 `.cache/omp-baseline/18.5.0`（`framework/docs/harness-baseline.json` 的记录基线；本轮经与其他 worktree 的同一安装目录联接复用，未新装） |
| POSIX | 未运行。本文所有观察只覆盖 win32 / bun 1.4.2 / pi 1.3.0 / OMP 18.5.0。 |

环境前置（不是仓库内容）：三份行尾敏感文件在 `core.autocrlf=true` 下为 CRLF 检出；真实 OMP 运行前
临时还原为已提交 LF 字节（`bun.lock`、`host-patches/omp-18.5.0-viewed-session/patch.diff`、
`host-patches/omp-18.5.0-codex-response-boundary/patch.diff`），运行后按字节还原为检出原样。真实宿主
运行使用 `.cache` 中的隔离安装、OS 临时目录中的独立 agent state / session dir / 工作目录 / 用户 home、
本机 capture endpoint，未调用付费模型，未写操作者真实消费或会话数据。

## 本轮改动

1. **新增确定性覆盖** `tests/framework/process-mode-reuse.test.ts`（P24、P34 的共同 interface 行为）：
   - 真实 OMP adapter + 受控原生 surface，在配置声明 `runtimeDir` 的情况下投递一轮给定事实，断言
     观察仍到达共同消费 interface 与进程观察源，而 runtime directory / location record 从未创建；
   - 同一给定 activity/context 经真实本机接入（命名管道或 socket + 成帧）送达 owner 进程，断言
     采用后的观察与 in-process 路径等价，且确实创建了一个 location record 作为对照；
   - 真实 OMP adapter 与真实 pi adapter（无 child entry 的同进程装配）对同一给定事实留下相同的
     `ObservedSession`（activity + context），并都通过同一 `session_context` 投递面交付。
2. **验收脚本修复** `scripts/pi-subagent-smoke.ts`：前台阶段原先在等到 child 记录后同步读取 parent
   记录；两个提交的先后没有保证。现在 `savedDocument` 等待文档同时包含 child 与 parent 记录（有界，
   无固定 sleep）。若 parent 从不提交，等待仍失败。修复前后行为与归因见「发现与修复」。

产品源码未改动。

## 发现与修复（前台 smoke 的提交顺序）

- **现象**：本票首次运行 `bun scripts/pi-subagent-smoke.ts --foreground-only --expect-pi-version 1.3.0`
  在本分支失败于 `the parent's own Round settled after the delegation, and its accumulation is saved`
  （`parent record: undefined`），两次均在 2–5s 内退出；同一命令在 07 之前的树（01、03）通过（14
  observations，17s）。
- **归因（二分 + 还原实验）**：在临时 detached worktree 上逐项恢复票据 10 的改动，确认该提交的
  `framework/behaviors/round-events.ts` 与 `framework/behaviors/subscriptions.ts` 两者同时为新版本时
  失败，任一为旧版本时通过；整提交 `git revert --no-commit 6c606ad` 后 smoke 恢复 14 observations。
  临时 worktree 已删除（`git worktree list` 无残留）。
- **定性**：parent 的 Round end 提交并未丢失；在恢复等待后，同一个子进程在 3s 内已有 parent 记录，
  随后所有前台检查通过。失败来自检查在 child 记录出现时把 parent 记录当成“应当已经存在”的同步事实，
  而票据 10 的 promise 返回/派发时序使 parent 提交更常落在该读取之后。该检查因此改为对两个提交事实
  各自等待（有界），而不是固定延迟：`logs/12-pi-foreground-smoke.log`（失败）、
  `logs/12-pi-foreground-smoke-2.log`（失败）、`logs/12-pi-foreground-smoke-3.log`（修复后 14/14）。
- **旁证**：01/03/04/05/06/10/07 各树的同一 smoke 结果在 `logs/12-pi-foreground-smoke-*-tree.log`；
  其中 01 与 03 通过，04 起失败，10 树带 `--keep` 失败且关闭后仍无 parent 记录（`12-pi-foreground-smoke-10-tree-keep.log`）。

## 确定性检查（本轮实际命令）

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `bun run typecheck` | exit 0（`tsc --noEmit`，无诊断） | `logs/12-typecheck.log` |
| `bun test tests/framework` | 582 pass / 0 fail / 2,639 expect / 49 files / 47.49s（含本票 3 例） | `logs/12-partition-framework.log` |
| `bun test tests/model-cost` | 507 pass / 2 fail / 2,841 expect / 51 files / 23.17s（并发满载下的 2 例见下） | `logs/12-partition-model-cost.log` |
| `bun test tests/model-cost/pi-disposal-round-close.test.ts tests/model-cost/pi-runtime-gaps.test.ts` | 12 pass / 0 fail / 91 expect / 1.68s（上述 2 例单独复跑） | `logs/12-model-cost-failures-rerun.log` |
| `bun test`（measurement-focused，5 files） | 21 pass / 0 fail / 127 expect / 1.35s | `logs/12-measurement-focused.log` |
| `bun test tests/framework/process-mode-reuse.test.ts` | 3 pass / 0 fail / 16 expect / 89ms | 见 framework 分区 |

**2 例分区失败归因（未计为通过）**：`tests/model-cost/pi-disposal-round-close.test.ts` ›「leaving a
session for another one closes no Round…」与 `tests/model-cost/pi-runtime-gaps.test.ts` ›「the gap keeps
the subtotal…」在同一分区运行中因 `savedDocument` 找不到期望文档失败；两文件单独复跑 12/12 通过。运行
发生时另一 worktree 正在执行全仓回归（并行负载）。该签名与 08/09 轮记录的存盘/锁时序类同源，但仍按
「本树本次未取得稳定证据」处理：最终全仓回归必须在安静窗口重新取得（见文末）。

## 验收标准对照

1. **同进程零端点 + 两路径等价（P24）** — `tests/framework/process-mode-reuse.test.ts`：
   - 真实 OMP adapter 的给定事实到达 `sessionObservations` 与订阅者（activity `working`、context
     `12,345 / official / model-alpha`），同时配置声明的 runtime directory 不存在、location record 列表为空；
   - 同一给定事实经真实本机接入送达 owner 进程，采用后的 `ObservedSession` 与 in-process 路径逐字段相等，
     且接入确实发布一条 `owner-access-*` 记录（对照证明“零记录”不是观测不到）；
   - 真实 pi adapter（无 child entry 的同进程装配）对同一事实留下相同 observation。
   - 同进程的 pi 前台投递不进入载体：`tests/framework/session-observation-access.test.ts` ›「a session
     whose owner this process serves is observed here and handed to nobody」证明本进程服务 owner 时，读数
     只记录/派发在内存，`deliver` 不会被调用（没有序列化通信）；载体只在跨进程方向使用。
   真实宿主回归见「实际宿主」：OMP detail 表面与 pi 前台 detail 帧。
2. **本次实际 OMP、pi 前台、pi 后台证据** — 见「实际宿主」表；分别取自 OMP 18.5.0 dock 的
   `setWidget` 帧、pi 1.3.0 前台 RPC 会话的 detail 帧、pi 1.3.0 后台子进程的注册/提交记录。后台证据
   包含首轮提交前读数（请求被 capture endpoint 持有 4s 时 owner 已收到登记）与子进程自身保存；不以
   provider 完成通知替代实际表面，不以后台通过推断前台或 OMP。
3. **P34 行为覆盖与维护性审查** — 行为覆盖：本票新测试对两个实际 adapter 的共同 `ObservedSession`
   与 `session_context` 投递逐项比对；真实宿主分别覆盖 OMP（同进程）与 pi 前台/后台（跨进程）。
   维护性审查（源码 + 导入边界）：
   - 原生映射只在 adapter：`framework/adapters/omp.ts`、`framework/adapters/pi.ts`（及其 `omp/`、`pi/`
     子模块）；扩展 harness 目录只做装配；
   - 通信与来源管理只在 framework：`framework/modules/local-access.ts`、`framework/core/observations.ts`、
     `framework/behaviors/binding.ts`、`framework/behaviors/round-events.ts`；`local-access` 仅被 pi
     adapter 与 framework 自身导入，OMP adapter 不导入（同进程装配不建载体）；
   - 计费规则只在扩展 shared logic：两个 harness 装配都调用同一个 `createModelCostRuntime`
     （`extensions/model-cost/shared-logic/runtime.ts`），usage 累计/价格/提交/周期保护在
     `shared-logic/{request-accounting,request-price,consumption-store,period-switch}.ts`；两个 harness
     文件不导入这些规则自行实现；
   - 展示规则：字段、格式、预算、树行内容与合并重绘在 `shared-logic/presentation/display.ts` 及
     `runtime.ts` 的只读结果；两个前端（`harnesses/{omp,pi}/widget.ts`）导入同一组
     `budgetLine/contextText/fieldsColumns/roundColumns/totalColumns/...`。
   - **维护性发现（记录，不计为共享业务规则的通过项）**：两个前端各自保留了一份终端布局机制
     （`textColumns`/`isWide`/`isZeroWidth`/`cutColumns`、树栅格/字段对齐/截断等十余个辅助函数），
     二者近似重复。该重复早于本规格（文件历史可追到并行迁移），属于宿主绘制层，不是第二套计费或观察
     权威，也没有影响第三个 adapter 只写事实映射与子入口接线的接入职责；但它确实是展示绘制层可继续
     收敛的债务。
   - 未实现第三个 harness；`tests/framework/import-boundary.test.ts` 在本轮 framework 分区中通过。
   - **P34 结论**：契约 P34 的“无按 harness 复制的计费或观察规则”通过；ticket 文本的展示规则一项，
     业务展示规则共享成立，但绘制层仍留有上述重复实现，因此不宣称“展示层完全无复制”，只将其记为
     债务与未完全消除项，不把它折算为通过。
4. **跨票证据关联（normal exit、reconnect、disconnect、nesting、concurrency、billing、failure/deadline）**
   — 见「契约场景矩阵」；每行给出本树实际运行的确定性用例或真实运行日志，未取得实际宿主证据的行显式
   标注。
5. **采集/通知、绘制、退出等待测量** — 见「测量」；三者分别记录，不以最终截图代替。
6. **报告可归因** — 本文记录源码状态、宿主/第三方版本、OS、命令、退出状态、结果、计时与日志；未执行
   的平台/版本保留为限制。
7. **隔离与全自动** — 真实运行全部使用临时/隔离存储与本机 compat endpoint；未使用付费模型，未写操作者
   数据。环境阻塞不转为人工例外。
8. **稳定窗口与最终门禁** — 最终 `typecheck`、全仓测试、OMP dock 与 pi 真实宿主 smoke 在故障注入全部
   还原后顺序执行；实际命令与结果见文末。

## 契约场景矩阵（证据来源）

> 计数来自本树本轮实际运行的 `tests/framework`（582）与 `tests/model-cost`（507）分区；下表只引用
> 实际存在于本树并通过的用例，名称即证据 ID。

| 场景 | 承诺 | 证据（文件 › 用例） | 证据类型 |
| --- | --- | --- | --- |
| 首次接入快照 | P4 | `tests/framework/session-context-observation.test.ts` ›「a consumer that attaches after…」；`tests/framework/process-mode-reuse.test.ts` | 确定性 |
| 正常后台登记（提交前） | P1、P9 | `scripts/pi-subagent-smoke.ts --background-only` ›「the spawned session registered with the owner's process before its first Round ended」 | 真实宿主 + 真实进程 |
| 后代直接交付/嵌套 | P2 | `tests/model-cost/detail-tree-live-sessions.test.ts` ›「the child's and the grandchild's readings arrive at the owner's seat, and the tree stays three levels」 | 确定性（真实子进程载体） |
| 续跑不重复建行 | P3 | 同文件 ›「a continuation in another run updates that session's own row…」 | 确定性 |
| 重连快照 | P5 | `tests/framework/local-access-observation.test.ts` ›「a source that reaches the seat again restores what was withdrawn…」；`tests/model-cost/detail-tree-live-sessions.test.ts` | 确定性（真实载体） |
| 迟到/旧来源 | P6 | `tests/framework/local-access-observation.test.ts` ›「two real processes' words about one session are ordered…」 | 确定性（真实进程） |
| 断连撤销读数 | P7/P8 | `tests/framework/local-access-observation.test.ts` ›「a real process ended abruptly ends one source just as well」；`tests/model-cost/detail-tree-live-sessions.test.ts` ›「the row stops being drawn as working…keeps its place and its record」 | 确定性（真实进程） |
| Working/Idle 语义 | P10 | `tests/framework/round-events.test.ts`、`tests/framework/pi-round-mapping.test.ts`、`tests/framework/session-activity.test.ts` | 确定性 |
| 上下文采集/模型 | P11/P12 | `tests/framework/session-context-observation.test.ts` ›「both harnesses collect the reading with the model…」；`tests/model-cost/pi-session-context.test.ts` | 确定性 |
| 通知携带当前值、无需读文件 | P13 | `tests/framework/session-observation-access.test.ts` ›「the identity, the activity and the context arrive with the reading…」 | 确定性 |
| 去重与无逐 token 流量 | P14 | `tests/model-cost/observation-notice-frequency.test.ts`（固定序列、40 chunk、静止窗口） | 确定性（计数） |
| 合并重绘 | P15 | `tests/model-cost/observation-redraw-merge.test.ts`、`observation-redraw-merge-processes.test.ts`（真实接入批量） | 确定性（帧计数） |
| 计费归属、不重复记账 | P16/P17 | `tests/model-cost/local-accounting-owner-sync.test.ts` ›「each request is accounted once by the session that spent it…」；真实后台 smoke ›「the child's own consumption was saved under the child's own identity by its own process」 | 确定性 + 真实进程 |
| 提交提示合并/不漏刷 | P18 | `tests/model-cost/coalesced-sync-period-safety.test.ts` ›「a turn's commit notices cost the read-only synchronizations they need」 | 确定性 |
| 重连触发只读同步 | P19 | `tests/model-cost/shared-storage-refresh.test.ts` / `local-accounting-owner-sync.test.ts` ›「a notice for a root that holds no document adopts nothing…」 | 确定性 |
| 周期保护 | P20 | `tests/model-cost/coalesced-sync-period-safety.test.ts` ›「a same-period synchronization protects…」「a period another writer replaced…」 | 确定性 |
| State follow 当前值 | P21/P22 | `tests/framework/follow-observation-independence.test.ts`、`owner-follow-processes.test.ts`、`tests/model-cost/form-observation-independence.test.ts` | 确定性（真实进程） |
| 无 follow 字段仍观察 | P23 | `tests/framework/follow-observation-independence.test.ts` ›「a real process registers and then updates on that Owner's seat…」 | 确定性（真实进程） |
| 同进程零端点/两路径等价 | P24 | `tests/framework/process-mode-reuse.test.ts`；真实宿主见「实际宿主」 | 确定性 + 真实宿主 |
| 接入校验/定位 | P25/P26 | `tests/framework/local-access.test.ts`、`local-access-observation.test.ts`（错误目标、旧接入、显式 runtimeDir） | 确定性（真实进程） |
| 正常处置收口 | P27/P29 | `tests/framework/pi-disposal-round-close.test.ts`、`round-disposal.test.ts`、`tests/model-cost/pi-disposal-round-close.test.ts`；真实后台 smoke | 确定性 + 真实宿主 |
| 未 settled 截断 | P28 | 同上截断用例；真实截断运行未取得（见限制） | 确定性 |
| 15s 截止 | P30 | `tests/framework/close-out-deadline.test.ts`、`tests/model-cost/close-out-deadline.test.ts` | 确定性 |
| 截止结果不冒报 | P31 | 同文件 ›「an update that had already begun is not cancelled by the deadline…」 | 确定性 |
| Owner 不可达仍保存退出 | P32 | `tests/framework/close-out-deadline.test.ts`；真实 `scripts/pi-close-out-smoke.ts`（Owner 不服务） | 确定性 + 真实宿主 |
| 查看切换不关轮 | P33 | `tests/framework/pi-disposal-round-close.test.ts` ›「leaving one session for another is no disposal…」 | 确定性 |
| 复用边界/第三 harness | P34 | 本票新测试 + 维护性审查（上节） | 确定性 + 源码审查 |
| 报告可归因 | P35 | 本文 | 报告 |

## 测量

- **采集 / 通知**：`tests/model-cost/observation-notice-frequency.test.ts` 记录固定事件序列的实际发布次数
  （初次读数 1 次；重复读数 0 次；40 个流式 chunk 在 message_end 才形成 1 次读数；静止窗口 0 帧/0 通知）。
  本轮 21 个 measurement-focused 用例全绿（`logs/12-measurement-focused.log`）。未宣称端到端延迟或零开销。
- **绘制**：`tests/model-cost/observation-redraw-merge.test.ts` 与 `...-processes.test.ts` 记录帧数
  （两会话/三会话的同批读数合并为一次重绘；重复读数 0 帧；真实接入批量有界帧数）。上述 5 文件
  21 pass / 0 fail。
- **退出等待**：真实 `scripts/pi-close-out-smoke.ts`（pi 1.3.0，`logs/12-pi-close-out-smoke.log`）两段：
  已提交会话关闭后 **12ms** 离开（exit 0，无未写/未确认提示）；文档被另一进程真实持锁时，处置在
  **14,998ms** 被框架自己的 15,000ms 截止结束（exit 0，timedOut false；相对截止 -2ms 的平台调度/teardown，
  脚本允许 ±5s），操作者收到“消费累计没有写入、收口等待到期”的提示，文档中没有该 Session 记录，持锁者
  发布的文档保持原样；11 observations / 0 required facts missing。确定性
  `tests/framework/close-out-deadline.test.ts` 与 `tests/model-cost/close-out-deadline.test.ts` 控制
  已完成、临界与截止路径并通过。
- **前台/后台真实运行计时**：最终门禁中两条 smoke 合计 42.30s（前台 14 observations、后台 10
  observations，后台含 4s 请求持有）；OMP dock 249.03s / 107 pass，全仓 441.82s / 1364 pass。均为本轮
  实际计时，不与确定性检查耗时混算。

## 实际宿主（本轮）

| 宿主 / 模式 | 命令 | 结果 | 观察表面 |
| --- | --- | --- | --- |
| pi 1.3.0 前台 | `bun scripts/pi-subagent-smoke.ts --foreground-only --expect-pi-version 1.3.0` | 14 observations / exit 0 / 17.08s | 实际 detail widget 帧含真实子会话；child/parent 各自记录；进程按自身节奏退出 |
| pi 1.3.0 后台 | `bun scripts/pi-subagent-smoke.ts --background-only --expect-pi-version 1.3.0 --keep` | 10 observations / exit 0 / 25.30s | 首轮提交前 owner 已收到登记；子进程自身保存记录（父/子 id 与 session 文件一致）；context+model 到达 owner。提交归属：该记录含 child 自己的 usage/startup，owner 进程只收到观察（不含 usage），provider meta 记录该次 launch `exitCode: 0`；唯一能写这条记录的进程是已结束的子进程，故其提交发生在退出前。 |
| OMP 18.5.0 | `bun test tests/harness-dock`（归一 LF 冻结文件 + `.cache/omp-baseline/18.5.0`） | 107 pass / 0 fail / 1,185 expect / 28 files / 249.03s / exit 0 | 真实 patched OMP 的 `setWidget` 帧：detail 树（root + 真实 task 子会话行，Cost/Run/Ctx）、真实委派与保存、period/round/binding 回归；不读内部 registry |
| pi 正常处置/截止 | `bun scripts/pi-close-out-smoke.ts --pi <pi 1.3.0 bundle>` | 11 observations / exit 0 / 61.70s；正常关闭 12ms，持锁截止 14,998ms | 操作者提示、消费文档与真实锁持有者文档 |

## 最终门禁（本树，顺序执行）

故障注入/二分实验全部还原、临时 worktree 已删除、产品源码无改动后，在协调窗口内顺序执行。**现场说明**：
本门禁运行时另一 worktree（票据 09）的全仓回归仍在进行（同一机器、不同 worktree 与独立 `.cache` 副本）；
本树 dock 与全仓均为 0 fail，但因此不宣称取得了完全独占的安静窗口。若宿主要求严格独占窗口，应以本提交
之后的独立门禁重跑。

| 顺序 | 命令 | 结果 | 日志 |
| --- | --- | --- | --- |
| 1 | `bun run typecheck` | exit 0 | `logs/12-typecheck.log` |
| 2 | 三份冻结文件还原为已提交 LF 字节 | 工作区 sha256 = HEAD blob（见 `12-environment.txt`） | — |
| 3 | `bun test tests/harness-dock`（OMP 18.5.0 真实宿主） | 107 pass / 0 fail / 1,185 expect / 28 files / 249.03s / exit 0 | `logs/12-dock.log` |
| 4 | `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun run test` | **1364 pass / 0 fail / 7,702 expect / 153 files / 441.82s / exit 0** | `logs/12-fulltest.log` |
| 5 | 冻结文件按字节还原为 CRLF 检出 | sha256 与运行前逐一相同（`e7ed487b…` / `057e01f6…` / `294b3727…`） | — |
| 6 | `bun scripts/pi-subagent-smoke.ts --foreground-only --expect-pi-version 1.3.0` | 14 observations / exit 0 | `logs/12-pi-foreground-smoke-final.log` |
| 7 | `bun scripts/pi-subagent-smoke.ts --background-only --expect-pi-version 1.3.0` | 10 observations / exit 0 | `logs/12-pi-background-smoke-final.log` |

第 6、7 步合计 42.30s。真实宿主 smoke 使用本机 capture endpoint 与 OS 临时隔离存储；未使用付费模型，
未写操作者数据。`OMP_BOT_BINARY` 指本机既有 release 构建（2026-10-09，非本轮构建/安装产物）。

## 未验证 / 限制

- POSIX 载体、其他 OMP 版本、其他 pi 版本未运行；本文不构成其认证。
- 真实 pi 截断场景（处置时无 settled 的 open Round）未在本次真机复现；P28 只有确定性证据，另有票 11
  记录的真机限制。真实 OMP 嵌套/并发未单独运行；相关行为由确定性用例覆盖。
- 视觉观察：本轮读取的是真实宿主交给前端的 widget 帧（OMP `setWidget`、pi RPC detail 帧）与 smoke
  画面；未运行人类终端交互式验收，也未对格式/可读性作人工判断。
- 前台 smoke 的 parent-record 检查由本轮修复为有界等待；该修复只影响验收脚本，不改变产品提交时序。
  未对产品侧“parent 提交晚于 child 一个 task”作性能声明。
- 维护性发现：两个前端仍保留近似重复的终端布局辅助实现（见 P34 项），记为展示绘制层债务。

## 命令与日志索引

- `logs/12-environment.txt`（HEAD、平台、冻结文件工作区/HEAD 字节）
- `logs/12-typecheck.log`
- `logs/12-partition-framework.log`
- `logs/12-partition-model-cost.log`
- `logs/12-model-cost-failures-rerun.log`
- `logs/12-measurement-focused.log`
- `logs/12-pi-foreground-smoke.log`、`-2.log`、`-3.log`（失败 → 修复后通过）
- `logs/12-pi-foreground-smoke-01-tree.log`、`-03-tree.log`、`-04-tree.log`、`-05-tree.log`、`-06-tree.log`、`-10-tree.log`、`-10-tree-keep.log`、`-prior-tree.log`（二分）
- `logs/12-pi-background-smoke.log`
- `logs/12-pi-close-out-smoke.log`
- `logs/12-dock.log`
- `logs/12-fulltest.log`
- `logs/12-pi-foreground-smoke-final.log`、`logs/12-pi-background-smoke-final.log`（最终门禁）
