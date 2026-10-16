# 17：budget 动作与入口展示偏好（P4、P5、P6、P47；P57 的 P4 项）

本票把 `/budget` 的**既有命令面**（framework `behaviors/actions.ts` 的规范化/帮助/路由 + 本扩展 `definition.ts` 的动作表）
落到**实际 pi 入口**上，并补上唯一发现的生产缺口：pi 入口在「无子代理模式」下仍会切换展示偏好并执行 detail 的后续效果。
框架已把「本入口子代理接入的结论」在初始化节点交给实现（`InitializationDelivery.subagents`，05 号票交付），
但没有任何消费者读它；本票是第一个消费者。

## 生产改动

| 文件 | 改动 | 理由 |
|---|---|---|
| `extensions/model-cost/shared-logic/runtime.ts` | 新增可选输入 `subagentIntegrationMode?: () => SubagentIntegration["mode"] \| undefined`；`budget.detail` 在该答案为 `"none"` 时只报一条警告通知并返回（不 toggle、不 state provider failures 之外的任何后续效果） | 规则属于扩展业务：detail 形态列的是本 entry 观察到的后代会话，无子代理模式没有可画的内容，因此动作改为回答操作者。只有 `"none"` 被拦：`subagents` 照旧、`failed` 不是「正常无子代理形态」（P3 的区分），未结出答案前（初始化尚未完成）动作保持原样。OMP 装配不传该输入（它绑定的每个 entry 都已接入），因此 OMP 原路径不新增分支，其他两个 budget 动作与 P37 的条件完全复用 15 号票的实现。 |
| `extensions/model-cost/shared-logic/presentation/display-preference.ts` | 新增 `displayFormUnavailableNotice()` | 唯一一处操作者可读文案，与 `displayFormNotice` 同一词汇表；消息点名命令、模式、以及偏好未动。 |
| `extensions/model-cost/harnesses/pi.ts` | 装配在 factory 内记录框架交出的 `delivery.subagents.mode`（`implementation.initialize` 包一层），并经运行时输入交给 shared logic；模块文档补一段 | pi 装配本来就声明 `childEntry`（要加载到子会话里的入口），因此「这一次接入的结论」由它记录；模块文档说明 OMP 为何不声明。 |
| `extensions/model-cost/GLOSSARY.md` | `Entry display preference` 词条补一句：唯一不被提供 flip 的 entry 是子代理接入结为 no-subagent mode 的那个，条件是「已结出的接入模式」，不是 provider／活动状态／保存／子记录数量 | 领域词，读者最先查这里。 |
| `extensions/model-cost/README.md` | `Timing and detail behavior` 补一条 bullet，说明 detail 只提供给接入成功的 entry，OMP 恒为真；无子代理模式回答未执行且不动偏好 | 扩展的 README 本就描述 `/budget detail` 行为。 |
| `scripts/pi-model-cost-smoke.ts` | Phase 2 改写为无子代理形态的真实宿主检查（空参数＝声明自己的帮助；`/budget detail` 只报该通知、不重绘 widget、不发请求、不动文档；未声明参数被框架路由拒绝且不动作）；Phase 11 的 run 加载固定 provider（该 phase 要画 detail 树／要核对偏好），并新增两条观察：操作者自己的 detail 形态画出该 pair、**同一 storage root 的第二个真实进程答 brief**；头部「断言清单」与 provider 常量注释同步 | 该脚本的被测入口正是生产 pi 装配：P4 的两半（无子代理拒绝／成功接入照旧）都在真实宿主上留证；偏好「不持久化、新进程回 brief」只能在新旧两个真实进程之间观察。 |
| `scripts/pi-session-accounting.ts` | 恢复进程（第三个 phase）与会话一并加载固定 provider，头部第 3 条注明原因 | 该 phase 断言「恢复进程画出 detail 树」；无子代理形态下 detail 不再提供，树要画出来就必须是接入成功的 entry。 |
| `tests/model-cost/pi-budget-actions.test.ts`（新增 694 行） | 本票的 pi 主要套件（6 用例，见下） | 用真实框架交付结出的接入结论驱动，而不是用字面量假称模式。 |
| `tests/model-cost/pi-session-accounting.test.ts` / `pi-session-span.test.ts` / `pi-period-reset.test.ts` | 各自的手工装配显式声明 `subagentIntegrationMode: () => "subagents"`（一行 + 注释） | 这三个装配本来就驱动 detail／树；它们不是生产装配（生产装配见 `harnesses/pi.ts`），所以显式声明「本组合模拟的是接入成功的 entry」，避免「靠输入缺失而默认不过滤」的隐性依赖。 |

**没有**新增兼容别名、第二套动作算法或接线 shim；`period-switch.ts`、`actions.ts`、动作表与 P35–P37 的事务/条件测试均未改。

## 红→绿证据

1. **无子代理拒绝（P4）**：新套件首条用例先写成「框架结出 `none` 时 detail 必须只回答、不动偏好」，
   改动前失败于 `expect(notice?.level).toBe("warning")` 收到 `"info"`（即真的翻转成 detail，用时 313ms＝入站 provider 公告预算）。
   本次实现后通过：警告文案含 `/budget detail 未执行`／`无子代理模式`／`brief`，`presentation.of(target).form` 仍为 `brief`，
   自命令前标记起没有任何 `setWidget` 帧，provider 出站 0 次，storage root 无文件、无 archives；会话忙（`idle: false` + 有排队消息）时回答同一条文案。
2. **真实宿主**：迁移前的 smoke 在 Phase 2 停在该 phase 的旧断言
   （`SmokeFailure: check failed: the command announces the form it switched the display to`，原文通知＝`/budget detail 未执行：本次入口为无子代理模式，未接入子代理观察，没有可展示的代理树；展示保持简略（brief）。`）。
   这同时证明**生产 pi 装配**（`-e entrypoints/pi/model-cost.ts`，无 provider 进程）真的把接入结论记进运行时并触发该分支。
   改写后整轮 `100 checks passed, none failed`。

## 本票拥有的证据

环境：本 worktree（Windows 10.0.26200，x64，Bun 1.4.2，`bun install --frozen-lockfile` 装好 `yaml@2.9.1`／`pi-subagents@0.78.0`）。
被测源状态：本票分支 `hyper/model-cost-pi-migration/17-budget-actions-f0c4c2-411dc288ea83`，基线 `5581010`（本票提交前的 tip）之上的工作树内容；
下表命令全部在提交前同一份源码上跑完，其间未再改源码。
**host patch 条件**：pi 真实运行不需要任何 host patch（本票路径不经 OMP 补丁链）；OMP 侧只跑了既有 dock 消费者，用的是仓库既有补丁工件与版本，未改动它们。
pi CLI：已安装 1.2.0（`pi --version` → `1.2.0`，`resolvePiCli` 解析到 `D:\nvm4w\nodejs\pi.cmd`）。

| 命令 | 结果 |
|---|---|
| `bun run typecheck` | 无输出（通过） |
| `bun test tests/model-cost tests/framework/actions-routing.test.ts` | **434 pass / 0 fail**，36 files，2292 expect（含本票新文件 6 用例） |
| `bun test tests/harness-dock/detail-tree.test.ts tests/harness-dock/model-cost-headless.test.ts tests/harness-dock/period-switch.test.ts`（OMP 侧受影响消费者） | **11 pass / 0 fail**，167 expect，30.0s |
| `bun test tests/framework/pi-session-facts.test.ts`（引用：同 owner 的 pi reload 不是边界） | 17 pass / 0 fail（`sessionStarts(session, "reload")` 交付为空，见该文件 353 行） |
| `bun scripts/pi-model-cost-smoke.ts`（真实 pi 1.2.0，28 个隔离 run） | **100 checks passed, none failed**，exit 0，51.8s；日志 `evidence/logs/17-budget-actions-smoke.log` |
| `bun scripts/pi-session-accounting.ts`（真实 pi + 固定 provider 一次后台委派） | exit 1；`12 observations held, 6 required facts missing`，62.9s；日志 `evidence/logs/17-budget-actions-accounting.log`。缺失项与 08 号票记录**同一组**（子进程自身记账未落盘：见下「未覆盖」） |

**新套件 `tests/model-cost/pi-budget-actions.test.ts` 的接缝**：真实 pi adapter + 真实 definition + 真实 runtime + 真实前端；
接入结论由**固定 provider 自己的发布通道**（`subagents:rpc:v1:ready`）驱动——不公告＝框架结出 `none`，公告＝结出 `subagents`，
所以两种模式都是框架真实结出的答案，不是本套件声称的字符串。两个自持事实与生产装配等价：storage root，以及 provider transport（两个 provider 查询都在本地回答，不出网）。

**S1**：命令经 pi 自身 `registerCommand` 注册的路径进入，事实全部由 pi 原生事件驱动（`session_start`／`input`／`before_agent_start`／`session_shutdown`）＋表面自身阅读（`isIdle`／`hasPendingMessages`／`model`／`modelRegistry`）；框架的规范化、帮助、错误上报与 `/${cmd} {action} failed:` 都在生产路径上。
**S2**：观察面＝pi 命令入口、`ui.notify` 通知、`setWidget` 帧、`runtime.presentation.of(target)` 只读展示结果；真实宿主另由 smoke 的 5 条 Phase 2 检查 + 2 条偏好检查覆盖。
**S3**：每个用例自持 storage root，活动文档／archives 用普通文件系统调用读回；smoke 的 Phase 11 由**两个真实 pi 进程**共享同一 root，恢复进程证据见 08 号票脚本。

## 承诺 → 证据

### P4（S2、S3）无子代理模式的 `/budget detail` 提示后不改变偏好、不执行后续 detail

| 检查 | 证据 |
|---|---|
| 调用前后偏好对应输出 | 套件 `the command answers a notice, changes no preference, issues nothing and writes nothing`：`form` 调用前后皆 `brief`，警告文案含模式与 `brief`，且不含「已切换为详细」 |
| provider 出站次数 | 同上：命令前后 `queries.length` 不变（FakeTransport 记录）；真实宿主 Phase 2 用 capture endpoint 的请求计数核对「不发请求」 |
| 写入/发布次数与文件内容 | 同上：`consumption.json` 不存在、`archives/` 不存在；真实宿主 Phase 2 逐字节比对文档；**P57 的 P4 项**即此组「外部效果计数＋文件前后对照」，不以 widget 数值不变代替 |
| 提前返回不影响其他 budget 动作 | 套件 `the period switch still closes the period after the early return`：同 entry 之后 `/budget clear` 照常归档并开新周期（`holiday=false`、`periodId` 变、1 个 archive）；Phase 2 的非法参数不触发任何动作 |
| 秒级即时性、不查 provider／idle／save／UI | 套件同用例第二条：会话 `idle: false` 且有排队消息时回答同一条文案；实现上该分支只读一个已结出的模式 |

### P5（S2）子代理模式中零子记录仍能切 detail

| 检查 | 证据 |
|---|---|
| 实际成功接入 | 套件 `the provider's own statement settles the mode, and the action switches to the main session's tree`：先断言 `bound.integration() === "subagents"`（框架交给实现的答案），再执行动作 |
| 核对主会话 detail | 通知为「展示已切换为详细」、`form === "detail"`、`agentTree` 恰为 `[["root", 0]]`（零后代）、widget 画出 Total 与主会话行 |
| 不能按子代理数量拒绝 | 上一条：后代行为 0 仍切换；隐藏断言「与记录数无关」由同一用例的 `detail` 形态成立 + 「真实宿主 Phase 11」在有子记录时同样成立 |

### P6（S2）帮助、参数拒绝与动作效果

| 检查 | 证据 |
|---|---|
| 空参数＝声明自己的帮助 | 套件 P6 用例：info 级、含 `/budget — 费用统计与展示管理` 与 `detail — `／`holiday — `／`clear — ` 三行；真实宿主 Phase 2 同项 |
| 空白/大小写规范化 | 同一用例：`"  DETAIL \n"` → 详细、`" detail "` → 简略（两次都真的执行了动作）；`"CLEAR"` → 归档并开普通周期 |
| 非法参数只报帮助错误、不调用动作 | 同一用例：`det`／`detail on`／`on`／`off`／`focused`／`holidays`／`clear!`／`not-an-action` 逐条 error 级且文案**等于**空参数那份帮助；随后 form 仍 `brief`、无 archives、文档逐字节不变、provider 请求数不变；真实宿主 Phase 2 同项 |
| 全部声明动作 | 同一用例：`holiday` 开假日周期（`holiday=true`、1 个 archive）、再次 `holiday` 幂等（归档数不变）、`clear` 开普通周期（`holiday=false`、2 个 archive）；重置动作的额外条件（P37）由 15 号票套件与真实宿主 Phase 11 覆盖 |

### P47（S2、S3）偏好跨普通会话/模型保留；新进程与适用重载回 brief；子入口固定 brief

| 检查 | 证据 |
|---|---|
| detail 后普通切换 | 套件 `an ordinary session or model change keeps it…`：同存续实例上换模型对（`deepseek-reasoner`）仍 `detail`；pi 的会话转移（`sessionStarts(other,"new")` → `subagents` 身份的新会话）与回到主会话后仍 `detail` |
| 无存储/State 偏好字段 | 同一用例：`MODEL_COST.state === undefined`；pi 自身持久化调用 `appendEntry` 全程 0 次；storage root 文档逐字节不变 |
| 实际新进程 | 同一用例：同一 root 上新建 entry（新 runtime）答 `brief`（主会话身份由文档读出，排除「身份未知也答 brief」的巧合）；**真实宿主**：Phase 11 第二个真实进程在第一个进程处于 detail 的同时答 brief（widget 无 `deepseek / deepseek-flash` 树行），而第一个进程自己的 detail 形态画出该行 |
| 适用重载 | 同一用例：处置旧 entry（`session_shutdown` → 框架 cleanup）后新建 entry（本进程内重载的等价形态：宿主重新求值入口 ⇒ 新装配/新 runtime）答 `brief`，并且新 entry 重结接入答案 `subagents`。同 owner 的 pi reload 在框架映射里不是边界（`tests/framework/pi-session-facts.test.ts` 353 行，17 pass），因此它不替换实例、也无从改变偏好 |
| 子入口固定 brief | 套件 `a subagent's own display answers the brief while the entry is in the detail form`：pi 自己的 lineage 链（`parentSession` 指向主会话文件）让子会话有直接父，绑定转到该子会话后其自身展示为 brief（widget 无自身名的树行、仍有 Total），回到主会话恢复 detail 树。既有跨宿主用例 `tests/model-cost/detail-tree.test.ts` 的 P26 条同样断言该规则（本票运行通过） |

### P57（仅本票分区项：P4 无子代理 detail 提前返回）

见 P4 表：以「provider 出站计数 + storage root 文件前后 + 通知文本 + 无重绘帧」四项外部效果与负向证据区分
「没有副作用」与「没有可见数值变化」；观察只用于验证，未新增常驻遥测。其余六项（P17／P33／P45／P48／P49／P51）不属本票。

## 未覆盖 / 未验收

- **真实 pi 的 `/reload` 命令本身**未驱动：本容器可用 RPC 面没有触发宿主级 reload 的手段。可核对的替代事实有两处：同 owner 的 reload 在框架映射里不构成边界（引用上表 `pi-session-facts.test.ts`），而「实例真的被替换」的形态由套件（处置+新建）与真实新进程（Phase 11 第二进程）覆盖。
- **`scripts/pi-session-accounting.ts` 的 6 条 FAIL 不减不增**（子进程自身记账未落盘，连带直接父链与树行）：与 `evidence/08-session-accounting.md` 记录的是**同一组**缺失（该记录：`11 observations held, 7 required facts missing`；本轮：`12 held / 6 missing`，多出的一条是本票让恢复进程真的接入后「画出树」相关的一条不再缺失）。本票不认领该缺口，也不把它写成通过。
- **OMP dock 的补丁工件在本 worktree 需要本地把 `host-patches/*/patch.diff` 归一成 LF 才能跑**：`git config core.autocrlf=true` 让工作树是 CRLF，而 `patchTouchedFiles` 的正则 `^diff --git a/… b/…$(.+)$` 里的 `.` 不匹配 `\r`，于是判成「touches no file」；冻结记录里的 sha256 正是 LF 字节，所以本地归一不会让工件校验失败，但会让 `git status` 显示这两个文件被改（提交前已用 `git checkout --` 还原）。这是环境/工件问题，不是本票改动，未在本票内修 dock 解析器。
- **未在真实账户侧核对任何 provider 事实**（P53 不属本票）；smoke 的余额/额度答案是脚本自己的文档。
- **TUI 可读性**（P52）不属本票。
