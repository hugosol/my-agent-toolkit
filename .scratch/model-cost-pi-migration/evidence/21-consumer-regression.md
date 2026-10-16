# 21：共同路径消费者与真实宿主回归（P50）

**Status:** implemented（实现 + 自动检查已完成；合并由集成子代理执行，本票不自行合入）

## 1. 本票范围与实际变更盘点

本票只做 P50：共同公共语义（S1）与生产路径（S2/S3）变更后，OMP 端及受影响扩展的既有消费者行为保持正确。本票新增的唯一实现是其自身的跨消费者/完整装配回归（`tests/harness-dock/consumer-regression.test.ts`）；其余为按分区执行既有承诺测试与真实宿主验证，不重写、不复制认领他人用例（P57 用例保持原负责人与原文）。

### 变更盘点（`git diff master...HEAD`，基点 HEAD `8c86378` = `pi-adapter` 尖端）

- 共享路径新增/重写：`framework/behaviors/{actions,lifecycle,subscriptions,turn-events,binding,marker,round-events,session-events,state-scope,control}.ts`、`framework/core/{assembly,protocol,state,definition,config,followed-owners,owner-lives,violations}.ts`、`framework/adapters/omp*.ts`、`framework/adapters/pi*.ts`、`framework/modules/{files,http,local-access}.ts`。
- 共享路径移除（干净切换）：`framework/core/admission.ts`、`framework/behaviors/admission.ts`、`framework/core/baseline.ts`，以及 `tests/{framework/admission*.test.ts,connect-bot/admission-refusal.test.ts}` 与三个 admission fixture。现树零引用：`grep -rn "core/admission\|behaviors/admission\|core/baseline" framework extensions entrypoints tests scripts` 无命中。
- 受影响消费者改动：`extensions/connect-bot/harnesses/omp.ts`（-31/+22）与 `extensions/connect-bot/shared-logic/panel/client.ts`（弃用 admission 路由，改走公共 `request`）、`extensions/codebase-tools/harnesses/pi.ts`（新增 pi 装配；OMP 装配未改）、`extensions/model-cost/*`（新增）+ `entrypoints/{omp,pi}/*`（薄再导出，每文件 9 行）。

## 2. 消费者分区（按实际变更列明，并已执行）

| 分区 | 共享实现 | 消费者 | 分区执行证据 |
|---|---|---|---|
| State | `core/state.ts`、`behaviors/state-scope.ts`、`behaviors/control.ts` | connect-bot（自有 `enabled` 记录 + 三态）、codebase-tools（`enabled` + `session-entry` 持久化 + `follow`）、model-cost（展示偏好） | `tests/framework`（control、owner-follow、owner-follow-processes、owner-inheritance、declared-value-write）、`tests/connect-bot/state-machine`、`tests/codebase-tools/{command-toggle,session-boundaries}`、`tests/harness-dock/{session-recovery,detail-tree}` |
| 观察/权限 | `behaviors/subscriptions.ts`、`core/followed-owners.ts`、`core/owner-lives.ts` | model-cost（子代理作用域）、codebase-tools（owner 形状 + follow）、connect-bot（仅主会话且有 UI 才能行动） | `tests/framework`（subscription-scope、owner-gate、owner-capability、local-access、turn-facts）、`tests/connect-bot/{guards,native-session-boundary}`、`tests/codebase-tools/subagent-owner` |
| marker | `behaviors/marker.ts` | codebase-tools、connect-bot（唯一两个声明 marker 的消费者） | `tests/framework/{marker,marker-module-duplication,viewed-marker,declared-value-write}`、`tests/codebase-tools/marker-lifecycle`（真实宿主）、`tests/harness-dock/viewed-marker*` |
| 初始化/清理 | `core/assembly.ts`、`behaviors/{binding,lifecycle}.ts` | 三个扩展 | `tests/framework/{implementation-lifecycle,definition,config,deployment}`、`tests/harness-dock/binding-lifecycle`、`tests/connect-bot/{registration-lifecycle,panel-registration-lifecycle,harness-exit-budget}`、`tests/model-cost/{runtime-initialization,pi-assembly-lifecycle}` |
| 取消/失败终止 | `behaviors/{round-events,session-events}.ts`、`core/state.ts` 的 owner 生命 | connect-bot（round 边驱动自身状态/失败预算）、codebase-tools（轮内注入规则）、model-cost（轮末保存） | `tests/framework/{round,round-events,session-events,pi-background-rounds}`、`tests/connect-bot/{state-machine,failure-budget}`、`tests/harness-dock/round-facts` |

两端真实宿主：OMP = `tests/harness-dock`（隔离精确安装 18.5.0 + 两个本机补丁）与 `tests/codebase-tools`（真实 OMP 加载本仓库 `entrypoints/omp` 发现根）、`tests/connect-bot` 中依赖真实面板二进制者；pi = `scripts/pi-model-cost-smoke.ts`、`scripts/pi-codebase-tools-smoke.ts`（真实 pi 1.2.0）与 `tests/framework/pi-*.test.ts`（pi 适配器面）。本票不据此推断其他版本/POSIX/跨用户支持。

## 3. 干净切换与共同组织审查

- 旧接线/别名/shim：无。移除的 admission/baseline 模块在全树零引用；`entrypoints/{omp,pi}/*` 仅再导出扩展自身的 harness 装配，没有第二份接线；扩展继续经 `framework/adapters/{omp,pi}`、`core/*`、`modules/*` 消费公共 interface（迁移前同一约定）。
- 受影响消费者全部迁移：connect-bot 的 OMP 装配与面板客户端、codebase-tools 的 pi 装配、model-cost 的两端装配均在位并被上表分区覆盖。
- 本票新增测试只断言消费者可见面（widget 区域帧、operator 通知、面板线信封、provider 出站请求、RPC prompt 结果），**未**重钉旧内部 duration、旧原生事件名或接线副本。

## 4. 本票新增的唯一回归（跨消费者 / 完整装配，OMP 真实宿主）

`tests/harness-dock/consumer-regression.test.ts`（3 例，61 expect()，38.4s）：在运行根内复制本仓库 `framework/`、`extensions/{connect-bot,codebase-tools,model-cost}`、`entrypoints/omp` 的**原样部署**（只替换运行自己的 connect-bot `config.yaml`，指向本进程脚本化面板端点；`.cache/` 下，因为框架的 YAML 依赖需从仓库解析），在隔离宿主的 RPC 会话里加载**部署发现根**（框架从它绑定三个消费者），断言只有在多消费者装配中才能观察的 S1/S2 事实：

1. **一个 marker 区域装每个消费者自己的行**：`/codebase-tools` 开启后区域仅 `◈ codeBaseTools`；面板以登记回执接受后 `/connect-bot` 加入 `◐ connectBot`，两行按扩展 id 顺序；第三个消费者（model-cost，未声明 marker）的 `/budget` 既不加行也不清区域（其 help 从自身声明动作表回答）。
2. **一个消费者的 State 不是另一个的**：`/connect-bot off` 只移除自己那行，codebase-tools 的激活与行仍在；`/codebase-tools` 关闭后区域清空（两扩展同名字段 `enabled`，任何按字段而非按扩展共享的存储会在此失败）。
3. **一个消费者的接入失败不改变其他消费者**：面板以 503 拒绝登记时，操作者收到该扩展自己的文案（`无法连接 omp-bot，未启用；请确认面板已启动`）、区域不出现其行、面板恰好收到一次登记请求，会话与其旁消费者继续服务后续回合；面板恢复后再 arm 成功（`已接入 omp-bot 面板（当前 1 个在线会话）`）。
4. **同一个 round 轴为各消费者结束被取消的回合**：持住一次交换的模型答复（请求已在线上且未答复，可证），`abort` 后该回合以 `aborted` 结束，已接入消费者收到**新的** `round_end` 状态上报（`awaiting-input` 离开进程），codebase-tools 的激活与两行存活，下一回合照常服务。
5. **失败终止同理**：本会话先以 RPC 关闭宿主自动重试（运行自己的会话级设置，明确记录而非等待其退避），提供方以 503 拒绝该交换的尝试，回合以 `error` 终止；已接入消费者收到新的 `round_end` 上报，两扩展激活与区域不变，会话继续服务下一回合。

面板是脚本化的本机端点（只回答该扩展线协议声明的登记回执），支付真实面板路径的是 connect-bot 自己分区里的真实 `omp-bot` 二进制；provider 为 dock 捕获端点，无凭据、无外网。

## 5. 验证结果（命令、退出状态、来源状态）

环境：Windows win32/x64；bun 1.4.2；node v24.18.0（pi 冒烟运行时）；工作树 `C:\Users\hugos\AppData\Local\Temp\hyper-ticket-SgtXkc`，分支 `hyper/model-cost-pi-migration/21-consumer-regression-8e5b8d-411dc288ea83`，基点提交 `8c86378`（= `pi-adapter` 尖端），本票改动仅新增 `tests/harness-dock/consumer-regression.test.ts` 与本记录（`git status` 另列三处行尾归一，见下）。新检出先执行 `bun install --frozen-lockfile`（`bun.lock` 字节不变）。

**归一检出**（`core.autocrlf=true`；三份文件还原为已提交 LF blob 字节，与 `git cat-file blob HEAD:<path>` 逐一相等，运行期间保持）：`bun.lock` `a5d37ab28396324e…`、`host-patches/omp-18.5.0-viewed-session/patch.diff` `66195465cc0c56c7…`、`host-patches/omp-18.5.0-codex-response-boundary/patch.diff` `4ec9ad0de31b0796…`。真实面板二进制 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`（本机既有 release 构建，非本票产物）。

| 命令 | 退出 | 结果 | 日志 |
|---|---|---|---|
| `bun run typecheck` | 0 | 无诊断 | — |
| `bun test tests/harness-dock/consumer-regression.test.ts` | 0 | 3 pass / 0 fail，61 expect()，38.4s | `.cache/cr-logs/consumer-regression.log` |
| `bun test tests/framework` | 0 | 481 pass / 0 fail，2250 expect()，38 文件，39.4s | `.cache/cr-logs/partition-framework.log` |
| `bun test tests/model-cost` | 0 | 463 pass / 0 fail，2524 expect()，40 文件，7.5s | `.cache/cr-logs/partition-model-cost.log` |
| `bun test tests/connect-bot` | 0 | 142 pass / 0 fail，689 expect()，18 文件，76.7s | `.cache/cr-logs/partition-connect-bot.log` |
| `bun test tests/codebase-tools` | 0 | 24 pass / 0 fail，334 expect()，7 文件，46.6s | `.cache/cr-logs/partition-codebase-tools.log` |
| `bun test tests/harness-dock` | 0 | 90 pass / 0 fail，1100 expect()，25 文件，264.0s | `.cache/cr-logs/partition-harness-dock.log` |
| `bun run test`（第 1 次） | 1 | **1198 pass / 2 fail**，1200 tests / 128 文件 / 391.2s | `.cache/cr-logs/full-test.log` |
| `bun run test`（第 2 次，同一树与同一环境） | 0 | **1200 pass / 0 fail**，6897 expect()，128 文件 / 396.8s | `.cache/cr-logs/full-test-2.log` |
| `bun scripts/pi-model-cost-smoke.ts` | 0 | pi 1.2.0：100 checks passed / none failed，28 隔离 run，54.9s | `.cache/cr-logs/smoke-pi-model-cost.log` |
| `bun scripts/pi-codebase-tools-smoke.ts` | 1 | pi 1.2.0：25 checks passed 后停在下述既有失败 | `.cache/cr-logs/smoke-pi-codebase-tools.log` |
| `bun scripts/verify-omp-candidate.ts` | 0 | 隔离 18.5.0 上 framework 套件 481 pass / 0 fail；写出 `.cache/omp-baseline/18.5.0/candidate-verification.json` | `.cache/cr-logs/verify-omp-candidate.log` |

来源状态记录（`candidate-verification.json`）：`baseCommit = 8c863788d0667271d4a02a076a3c58fd2a6609e5`，`workingTreeDigest = 291793414e4ce71c934e98f5f9851521e4dda133a7b6019b93a9f1dbaa90c73f`，`changedPaths = [bun.lock, host-patches/omp-18.5.0-codex-response-boundary/patch.diff, host-patches/omp-18.5.0-viewed-session/patch.diff, .scratch/model-cost-pi-migration/evidence/21-consumer-regression.md, tests/harness-dock/consumer-regression.test.ts]`，环境 win32/x64 + bun 1.4.2。

两次全仓运行之间没有任何源码或 fixture 改动（其间只做失败分析与只读核对，本记录的定稿在第 2 次运行之后）；本票新增文件两次都在树内，`bun run test` 两次都在同一源码状态下执行。

本票新增文件在第 2 次全仓之后仅补过一次文档注释（不含任何断言或辅助函数改动），随后该文件单独重跑为 **3 pass / 0 fail（38.4s）** 且 `bun run typecheck` exit 0；此后未再改动源码或 fixture。

## 6. 失败与限制（明确列出，不隐藏）

### 第 1 次全仓的两个失败（均在第 2 次全仓消失，且各自单独重跑为 0 fail）

1. `tests/model-cost/pi-period-reset.test.ts:888`，用例「the closed period's unsaved work is dropped rather than carried, and no session is forced to save for the switch」（P35，归属其他票据）：`savedDocument` 的 1000 次 `setImmediate` 让步被耗尽，文件当时为 `{"schemaVersion":1,…,"harnesses":{}}`；错误签名 `no consumption document the case expects was published at …/consumption.json; it holds {...}`。单独重跑该文件：**15 pass / 0 fail（273ms）**。机制：该等待以事件循环让步次数为界，而保存经真实的文件协调与 fake 时钟推进落地，并行满载时可先耗尽让步——属负载时序，非本票改动面（P35 归档/发布路径）。
2. `tests/model-cost/session-span.test.ts:675`，用例「an unsettled Turn fabricates no end, and time moving or waiting writes nothing」（P8/P14）：`readdirSync(root)` 期望 `["consumption.json","consumption.json.lock"]`、实得 `["consumption.json"]`。单独重跑该文件：**20 pass / 0 fail（129ms）**。签名与各前轮已记录的同形观察一致（收尾瞬间锁目录是否仍在场取决于本机平台时序；本机为 win32）。仍明确列出，不追究为本票改动引入。

两次失败都不在共享路径变更的实现面上，且第 2 次全仓 0 fail；本票不据此宣称套件绝对稳定（满载下仍见时序敏感）。

### 既有失败（场景/签名/条件匹配才引用）

- `bun scripts/pi-codebase-tools-smoke.ts`：pi 1.2.0 的 25 项消费者可见检查全过后，停在该脚本的既有「the session exits cleanly when its input closes」——子进程 `exit 9`，stderr `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94`。场景（同一脚本同一用例）、签名（exit 9 + `UV_HANDLE_CLOSING` / `win\async.c:94`）、平台（win32）与前轮记录一致；**后续阶段（新建会话、恢复、切会话）因此未执行**，不标为通过。其 pi 适配器映射另由 `tests/framework/pi-*.test.ts` 覆盖（hermetic，绿），OMP 侧由 `tests/codebase-tools` 覆盖（真实宿主，24 pass）。

### 未覆盖 / 不属本票

- P51（效率/复杂度最终判断）、P52（真实终端可读性）、P53（真实账户侧核对）为人类验收，本票不含；本票无付费调用、无凭据使用。
- 真实 `omp-bot` 面板证据来自 connect-bot 分区（`OMP_BOT_BINARY` 指向本机既有构建）；本票新增测试里的面板端点是对该扩展线协议的可控输入，**不是**关于 omp-bot 本身的证据。
- 全部证据仅覆盖 win32/x64、bun 1.4.2、隔离 OMP 18.5.0（含两个本机补丁）与 pi 1.2.0；不推广到其他版本、POSIX 或跨用户。
- 本票不新增 OMP/pi 原生会话互通、Round/Turn 明细或 provider 账户事实的结论。

## 7. 承诺与 seam 对应（P50）

- **S1**（扩展消费 framework 公共 interface）：`tests/framework` 全绿 481/481（identity/owner/State/订阅范围/marker/生命周期/Round），本票新增文件在此之上验证三消费者同进程时的公共语义隔离。
- **S2**（实际加载后的 model-cost 操作 interface，本票扩为三消费者）：`tests/harness-dock` 90/90（真实 OMP + 补丁安装）、`tests/codebase-tools` 24/24（真实 OMP + 部署发现根）、`tests/connect-bot` 142/142（含真实面板二进制）、本票新增 3/3；pi 端 `pi-model-cost-smoke` 100/100。
- **S3**（存储根持久化文档）：由复用的消费者分区承载——`tests/model-cost`（consumption-store/document、storage-processes 真实多进程、shared-storage-refresh、period-switch、session-recovery）463/463，`tests/harness-dock` 的 model-cost-persistence/store/detail-tree 等真实宿主读回在其 90/90 内；本票未新增 S3 断言，不重复认领其它票据的持久化承诺。

**P50 结论**：共同路径变更后，OMP 端与两个受影响扩展的既有消费者行为在分区与真实宿主路径上均保持（上表逐项），且新增的跨消费者/完整装配回归在三消费者同进程时成立；pi 端通过不替代 OMP 端（两边证据分别给出，上述既有失败与限制如实保留）。
