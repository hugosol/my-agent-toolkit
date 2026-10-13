# 20 — 完整 TUI 与单一峰谷边界 timer：自动证据与 P41／P67 H1 材料

Ticket: [`implementation/20-tui-boundary-timer.md`](../implementation/20-tui-boundary-timer.md)（P41、P67；seam S2／S5）。
Contract: [P41／P67](../contract.md)；展示范围权威 [08-presentation](../lighthouse/08-presentation.md)；刷新与 timer 权威 [09-refresh-lifecycle](../lighthouse/09-refresh-lifecycle.md)；装配 seam 权威 [10-assembly-layout](../lighthouse/10-assembly-layout.md)。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明，也不是人工验收；H1 未确认项不记通过。支持基线未变：OMP 18.5.0 / Windows x64 / Bun 1.4.2。

本次是一个**新的独立 run**，承接同一工作树上一次 run（该 run 以需求预算停止、自报 INCOMPLETE）已落地的实现与测试，不向旧 run 续跑，也不重新做大范围审计。第 0 节只列本次补完的剩余项。

## 0. 本次补完的剩余项

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | **前端视觉套件缺失**（上次未写：主题 token 映射、余额 tint、分段调色板与细／粗块形状、组件路径的 host 宽度） | 新建 `tests/model-cost/widget-visual.test.ts`（20 例，S2／S5）。驱动生产前端 `attachModelCostWidget`，受控 host 以 `component` 形态交出记录型 theme 并按其宽度取行，逐字断言 token 与形状。 |
| 2 | **dock／detail 期望未对真实宿主复跑**（S5 未验证） | `bun test tests/harness-dock` 复跑三次（见第 3 节）：`detail-tree.test.ts` 因新增 accrued 行的位次迁移而失败，本次**同票迁移**该期望（过滤两条 process-wide 行，并新增 brief／detail 两帧的 accrued 行断言），第三次起全目录 61 pass / 2 fail，只剩与本票无关的既有 `baseline record` 一对。 |
| 3 | **组件形态下 `hidden` 会创建空 widget** | 视觉套件暴露的实现缺口：`render()` 原先对 `component` 形态无条件交出 factory，于是「无显示」的模式会被交给宿主一个渲染为空的行数组的组件（真实宿主 `extension-ui-controller.ts` 会为它加 `Spacer(1)` 并放进 widget 区），与「hidden 不创建 widget、清空既有」相违。已改为先读一次该会话的显示结果，无 widget 时交出 clear。见第 4 节反向注入。 |
| 4 | **Effort 整串着色**（含标签） | 规格 §135「Effort…只给值着色」与冻结旧实现的 `Effort: ${theme.getThinkingBorderColor(level)(level)}` 都只给**值**着色，而原实现给 `Effort: high` 整段上色。已拆为「标签纯文本 + 值带 `effort` emphasis」。纯文本输出不变（其余套件的 `Effort: ` 字面仍成立）。见第 4 节反向注入。 |
| 5 | **P41／P67 H1 材料与许可证记录** | 本文件第 5、6 节。 |
| 6 | **领域词条** | `extensions/model-cost/GLOSSARY.md` 新增 **Season boundary wait（峰谷边界等待）**、**Accrued bar（Accrued 分段条）**、**Widget drawing form（widget 绘制形态）**；`GLOSSARY-MAP.md` 的 model-cost 行同步。 |

> 本文件另有一个**后续 retry**（同日，承接 ticket 25 交回的批准范围缺口：`Balance:` 行不按模式门控）：修复、测试与反向注入见第 9 节；第 5.2、7 节已按该修复更新。

## 1. 本票交付的行为与落点

| 位置 | 内容 |
| --- | --- |
| `extensions/model-cost/shared-logic/request-price.ts` | 新增 `nextSeasonChange(data, at, holiday)`：该周期下一次季节改变的精确时刻，含端点（12:00:00.000 仍为峰，所以回答 12:00:00.001），holiday 周期无未来边界。 |
| `extensions/model-cost/shared-logic/presentation/display.ts` | `DisplayPeriod`＋`presenter.period()`（当刻季节／holiday／`at`／`nextChangeAt`）；`PeriodDisplaySource`；`DisplayAccrued`＋`presenter.accrued()`（周期内各 Session 自身 CNY 之和，按文档顺序，逐 Session 一段）；`DisplayEmphasis`／`DisplayPiece`／`DisplayLine`＋`lineText`（**强调是语义描述**，颜色由前端映射）；`seasonMark`（🏖️／🔥／🌙）；`barEmphasis`（36／64／82 四带）；`balanceEmphasis`（<5 error、<10 warning，严格小于）；`segmentBar`／`accruedLine`（≤20 元 5 分一细块、>20 元 1 元一粗块、八色循环、400／50 列上限）；`balanceLine`；`quotaWindowLine`／`presenter.quotaLines(width)`（20 格节奏条＋时间标记、quota／time%、倒计时、绝对 reset、未知／过期／无效 reset、四步降级后截断）；`budgetLine`（季节标记＋预算条＋Effort）；比例标签改名 CacheR／CacheW。 |
| `extensions/model-cost/harnesses/omp/boundary-timer.ts`（新） | 该 UI **唯一**的一次性边界等待：`attach`／`sync`／`dispose`，同一边界不重建、触发后按实际时钟重新安排、优先主会话的宿主 timer 面、注册全部消失即取消、无 UI 不 arm。 |
| `extensions/model-cost/harnesses/omp/widget.ts` | 组件／文本两种绘制形态；`WidgetTheme`＋`EMPHASIS_COLORS`（八色调色板＋四带＋两告警＋effort 按 level）；`widgetLayout`（共享显示结果）与 `widgetLines`（纯文本）分离；边界等待注册；`session_shutdown` detach；本次新增：**无 widget 先清空**、**Effort 只给值着色**；后续 retry 新增：**余额行只在 monetary 通道绘制**（见第 9 节）。 |
| `extensions/model-cost/harnesses/omp.ts` | 进程单例 boundary timer（schedule 读 `presentation.period()`）＋ `MODEL_COST_WIDGET_DRAWING = process.stdout.isTTY === true ? "component" : "lines"`。 |
| `extensions/model-cost/shared-logic/runtime.ts` | 把周期事实接进 presenter。 |
| 未改 | 存储 schema／`config.yaml`／命令面／`framework/**`（本票未触碰框架生产代码）。 |

自动覆盖落点（本票）：

| 套件 | seam | 用例数 | 覆盖 |
| --- | --- | --- | --- |
| `tests/model-cost/boundary-timer.test.ts` | S2＋S5（生产前端＋受控 host＋受控时钟） | 8 | 每 UI 单 timer、含端点后 1ms、切目标不重建、休眠后按实际时间纠正、holiday 不 arm、无 UI 不 arm／不绘制、shutdown 取消持有的句柄、边界不触网络／文件／账 |
| `tests/model-cost/quota-window-lines.test.ts` | S2（`presentation.quotaLines(width)`） | 6 | 节奏带、5h 分钟／7d 小时、估计只挂周线、未报与失败措辞、未知／过期／无效 reset、四步降级与截断 |
| `tests/model-cost/widget-visual.test.ts`（新） | S2＋S5（生产前端 `attachModelCostWidget`，组件与文本两种形态） | 20（＋retry 1） | 绘制形态选择（子进程读生产 assembly）、host theme／width 落到组件、文本形态无 token、预算条四带与两条逐字、Codex 预算、无显示则清空、无 UI 不绘制、季节标记（峰／谷／holiday／token-only／allowance）、余额两告警与 10／5 边界、**余额行只在 monetary 通道〔retry〕**、accrued 细块形状＋调色板＋跳过零段＋粗块＋两种上限＋仅 monetary 有该行、Effort 只给值着色与 `?`、Codex 窗口节奏带（含 muted）与四步降级 |
| `tests/model-cost/detail-widget.test.ts`、`viewed-session-widget.test.ts`、`tests/harness-dock/model-cost-modes.test.ts` | S5 | 已迁移（＋retry 1） | 固定时钟下的季节标记／accrued 行／CacheR・CacheW 新字面；**真实宿主上官方→Go→官方一次切换的余额行门控、缓存保持、保存与请求计数〔retry〕** |
| `tests/harness-dock/detail-tree.test.ts` | S5（冻结 artifact＋真实 RPC＋真实 task 委派＋本机 capture） | 1 | 真实宿主：brief 的 accrued 行金额＝该 run 文档两条记录自身 CNY 之和；`/budget detail` 后 Total／树／Round 位次与逐字内容不变；本票同时新增一条 `costCnyOf` 读取（只读该 run 自己的文档） |

## 2. 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 保留原布局／字体／色彩／context 条／Effort 值着色／峰谷 holiday、余额 <10／<5 元告警，以及 ≤20 元 fine、>20 元 coarse 的 Accrued／Session 分段条 | S5 视觉套件逐字／逐 token：预算条四带 `dim／success／warning／error` 在 36／64／82 的边界（`161999→dim`、`162000→success`、`288000→warning`、`369000→error`）；余额 `9.99→warning`、`4.99→error`、`10.00／5.00` 不着色；季节标记 🔥／🌙／🏖️ 与 token-only／allowance 无标记；**余额行只在 monetary 通道绘制**（token-only／allowance／hidden 在持有读数的同一进程里都不画该行，retry 第 9 节）；**Effort 只给值着色**（`Effort: «effort:high:high»`）且 level 由 host 的 `getThinkingBorderColor` 取；accrued 细块（0.05→1 块、0.10→2 块、0.45→`█▏`）、粗块（20.5／3 元→21／3 列，0.5 元无段）、八色循环顺序、400／50 列上限与最大段吸收误差。金额单位：CNY 两位／低于一分四位、USD 参考单列不混算（沿用 11 票套件与 `fieldsText`／`amountText`） |
| 保留 Codex 20 格节奏、quota/time%、倒计时／绝对 reset，5h 分钟／7d 小时精度，未知／过期／无效 reset 及窄宽降级；统一 CacheR／CacheW、Total／Round 与适用金额单位 | S5 视觉套件：20 格条＋时间标记（`━━━━━━━━━━━━━━━━│───`）、`85.0% / 80.0%`、节奏带 `success／warning／error／text／muted`（muted 含 `--%` 与 `reset unknown`）、宽 200／50／40／20／10 的四步降级与 `…` 截断；S2 `quota-window-lines.test.ts` 覆盖 5h 计分钟／7d 计小时、过期／无效 reset 的绝对时刻解析；`CacheR／CacheW` 与 `Total:`／`Round:` 字面由 `model-cost-modes.test.ts`（真实宿）与受控套件逐字断言；金额单位：真实宿断言 `Cost: ¥0.02`（`detail-tree.test.ts`）与 `Ref: $0.0050`（`model-cost-modes.test.ts`）分列不混算，视觉套件断言 CNY 两位／低于一分四位的写法（`¥0.15`／`¥0.0050`／`¥19.94`） |
| 每 CLI UI 仅一个下一峰谷边界一次性 timeout，含端点后通知并按实际时间安排未来边界；切目标不各自 arm，休眠／阻塞后纠正，销毁清理，headless 无绘制 timer | S2／S5 `boundary-timer.test.ts` 8 例：一次 arm、端点后 `+1ms`、切目标 arm 数不变、触发后从实际时钟重读并 arm 下一未来边界、holiday 不 arm、`hasUI:false` 不 arm 且不绘制、`session_shutdown` 取消手持句柄、边界回调不触网络／文件／账。视觉套件另证无 UI 时 `frames()===0` |
| render 只读同一权威结果，无网络／保存／timer／计价修改；timer 不发网络／写文件／改费用，前端只负责原生主题／布局／宽度 | 视觉套件的每次 `draw(width)` 都是「重读 `presentation.*` → 映射主题」；`boundary-timer.test.ts` 末例在触发边界前后比对消费文档与 `view.own()`；`readingOf` 只调用 presenter 的只读方法，前端不含计价／阈值判断（阈值全在 shared logic，前端只做 token 映射与宽度交给 host） |
| 自动验证对应字段、金额单位、告警阈值和降级内容；受控时钟证明单 timer／当前目标／销毁，不能以正确数字代替视觉保留 | 见上两行的 token／形状／降级断言；**「对应字段」含按模式取舍的行**：token-only／allowance／hidden 在持有余额读数时不画 `Balance:` 行（retry 第 9 节，S2＋真实宿各一例）；受控时钟＝`boundary-timer.test.ts` 的注入 `now` 与手算 delay；「不能以正确数字代替视觉保留」由视觉套件逐 token／逐形状断言兑现（例如 coarse 段无颜色时仍断言其列数与可见性） |
| 本票准备 P41／P67 H1 全部适用模式、主子 brief/detail 和宽窄场景的精确 artifact、隔离步骤、预期、自动结果及可获得截图／录屏；冻结旧 source oracle 仅作授权对照，复用前检查许可证 | 第 5 节（场景／逐字期望／隔离步骤／自动结果）与第 6 节（oracle revision `fd3b507` 只读对照与许可证检查结论）。**截图／录屏在本环境不可获得**（无交互 TUI），如实记录 |
| 通过批准的生产公共 seam 观察行为，预期来自合同／规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | 视觉套件只经 `createModelCostRuntime` ＋ framework 公共绑定 ＋ 生产前端；期望来自规格（450K／272K、`?`、两币种分列、只给值着色）、冻结旧实现的规则（四带、0.05／1.00／20／400／50、八色顺序）与本文手算（百分比、块数、列数、`¥19.94`）；无永久用例访问真实服务（HTTP 一律替换；Codex 窗口经 headers 事实交付） |
| 使用隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据 | 视觉套件与 S2 套件只在 `mkdtemp` 临时根内建 runtime；真实宿用例（dock）复用冻结 artifact `.cache/omp-baseline/18.5.0-viewed-session` 与 `createRunRoot` 的独立 agent state／session-dir／work／capture／user-home。未触碰正式 OMP、未重启、未改配置 |

## 3. 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost/widget-visual.test.ts` | **20 pass / 0 fail**（79 expect，0.25s） |
| `bun test tests/model-cost` | **255 pass / 0 fail**（21 文件，3.2s；上次 run 为 235／20 文件，新增本文件 20 例） |
| `bun test tests/framework` | **385 pass / 0 fail**（32 文件，39.8s，无回归；本票未改 `framework/**`） |
| `bunx tsc --noEmit` | 无输出（exit 0） |
| `bun test tests/harness-dock` | **61 pass / 2 fail**（63 例，104.5s）；两处失败为既有 `baseline record` 一对，本票相关用例全绿（见下） |
| `bun test tests/harness-dock/detail-tree.test.ts`（连续三次） | **1 pass × 3**（23 expect，各 2.6–2.7s），无抖动 |

> 上表是本次 run 当时的读数（含当时的用例数）。后续 retry（余额行模式门控）的读数与新增用例见第 9.4 节，两份都不改写。

### dock 复跑（真实冻结 artifact、真实 RPC）

| 次序 | 结果 | 说明 |
| --- | --- | --- |
| 本票改动前 | **60 pass / 3 fail**（63 例，105.1s） | 1 处本票相关 + 2 处既有 |
| 本票首次迁移后 | **60 pass / 3 fail**（109.3s） | 1 处仍失败：新加的 accrued 断言本身不成立（见下「期望修正」） |
| 最终（第 3 次） | **61 pass / 2 fail**（104.5s） | 只剩 2 处既有失败 |

**(1) 本票相关失败（已同票迁移）**：`tests/harness-dock/detail-tree.test.ts` 的 `detail[1]` 期望 Total 行，收到新加入的 accrued 行 —— monetary 通道在 Total 之前多画一条 accrued 行，位次迁移。迁移内容：brief／detail／back 三处列表过滤 `Balance:` 与 `⏳ Accrued:` 两条 process-wide 行（原有 Total／树／Round／请求计数断言**逐字未动**），并在 brief 与 detail 各加一条 accrued 行自身的断言：brief 那帧只固定「行本身」（措辞＋CNY 金额＋若有 bar 则只由八分块组成），detail 那帧（已在本次 run 的提交之后绘制）另固定它**带 per-session bar**。

**期望修正记录（不是把失败改成实现现值）**：首次迁移时我按「该 run 文档里所有 Session 的 `costCny` 之和」写死 accrued 金额，两次运行分别得到 `¥0.02 [▏▏]`、`¥0.0050 [▏]`、`¥0.0000`。原因是 `presentation.accrued()` 读的是**本实例已提交（load／commit）的文档记录**（`runtime.ts` 明确如此注释、`consumption-store.sessions()` 如此实现），而 widget 帧只在「变化通知」时重绘；一笔 commit 本身不通知（`request-accounting.save()` 成功后直接 return），所以某一帧的 accrued 金额取决于它落在哪次提交与哪次通知之间。因此该数字不是该 run 的稳定事实，dock 只固定**行的形态**与「提交之后那帧带 bar」，精确金额与形状改由固定文档的受控套件（`widget-visual.test.ts`、`detail-widget.test.ts`）逐字固定。旧 widget 在每个轮次结束提交后自行重绘并重新读文件，本迁移的 accrued 源是实例持有的文档；两者在同一重绘时机下读到的是同一份「已提交周期累计」，本票未改该来源（属 19 票的存储／周期语义）。

**(2) 与本票无关的既有失败**：`tests/harness-dock/baseline.test.ts` 两条 —— `the checkout is at the recorded revision anchor`（期望 `9348320…`，实到 `579da1d6…`）与 `the run artifact stays byte-identical to the anchor…`（4 个契约文件哈希漂移）。根因是 sibling 源码检查点 `../oh-my-pi` 已前移到 `wayfinder/model-cost-behavior-contract` 分支（`579da1d6`，2026-10-09），而记录锚点仍是 `v18.5.0`（`9348320`，2026-10-03）。08／17 票已记录同一对既有失败；本票未改 `framework/docs/harness-baseline.json`、未改检查点、未改 patch artifact（改记录锚点即等于「自动接受升级」，属支持基线决定，非本票权限）。

> 全目录并行数字只作诊断；本票相关的套件均已单文件全绿（`detail-tree.test.ts` 连跑三次稳定 1 pass）。

## 4. 反向注入验证（跑完即恢复）

| 注入 | 观察 | 恢复 |
| --- | --- | --- |
| `display.ts` 的 Effort 值改成再带前缀（`Effort: FAULT-INJECTION high`） | 视觉套件 **6 例失败**，含两个 Effort 例、两条逐字行、预算条与季节标记例 | 改回后复跑 20 pass |
| `widget.ts` 的 `render()` 恢复为「component 形态无条件交出 factory」（即本条缺口本身） | 恰好 **1 例失败**：`a mode this extension does not display is handed the clear, never an empty widget (P9, P67)` | 改回后复跑 20 pass |

可区分性说明（无需注入即可判定）：若四带边界被改成非严格小于，`161999／162000` 或 `288000` 例失败；若余额阈值改为 `<=`，`10.00／5.00` 例失败；若细／粗阈值不是 20 元，`19.94` 的细块例或 `24.00` 的粗块例失败；若上限不是 400／50，两种上限例失败；若调色板顺序或循环点改变，八色例失败；若某 Session 的零消费仍画段，`[▏▎]` 的 slot 例失败；若宽度不传到 `quotaLines`，宽 20／10 的两例失败；若季节标记在任何模式都画（或都不画），token-only／allowance 的逐字例失败。

## 5. P41／P67 H1 材料（人工确认用；**未执行**）

自动部分已覆盖：单 timer 的可控时钟证明（`boundary-timer.test.ts`）、全部适用模式的逐字文本与逐 token 着色、八色分段与两种块形、余额两档告警、Codex 四步窄宽降级（`widget-visual.test.ts`、`quota-window-lines.test.ts`）、真实冻结宿主上的逐字 widget（`tests/harness-dock/*`）。下面只留必须由人在**真实交互 TUI**上确认的部分。

**冻结 artifact。** `.cache/omp-baseline/18.5.0-viewed-session`（gitignored）：基线 `@oh-my-pi/pi-coding-agent@18.5.0`，checkout `9348320cc4a30a7195d36a1f05a6c11bcb701a17`；`patch.diff` 与 post-patch 哈希记在 [`host-patches/omp-18.5.0-viewed-session/record.json`](../../../host-patches/omp-18.5.0-viewed-session/record.json)，哈希不符则拒绝运行。本票未改该 artifact。

**隔离步骤（交互 TUI；本环境未执行）。**

1. 建 run root：`agent-state/`、`sessions/`、`work/`、`home/`；清空解析偏移量（`OMP_PROFILE`／`PI_PROFILE`／`OMPCODE`／`PI_CONFIG_FILES`／`XDG_*`／`PI_CODING_AGENT_DIR`／`OMP_AUTH_BROKER_*`），设 `PI_CODING_AGENT_DIR=<run>/agent-state`、`HOME=<run>/home`。
2. 启动（真 TTY，使 `process.stdout.isTTY === true`，扩展因此走 `component` 形态）：
   `bun <prefix>/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts --session-dir <run>/sessions --cwd <run>/work -e <repo>/entrypoints/omp/model-cost.ts --model <模型>`
3. 按第 5.2 表逐场景操作，与「逐字期望」对照；颜色对照第 5.3 表。
4. 窄宽场景：把终端列宽依次置为 ~200／50／40／20／10 列（或拖窄窗口），观察 Codex 两行按四步降级。
5. 峰谷场景：在北京时间峰谷边界前后各停留一次（可临时把手动时钟前移，或选一个距边界 1–2 分钟的启动时刻），观察标记与整块重绘。

### 5.1 自动可获得的证据（已在仓库内，无需重建）

| 场景 | 命令 | 观察 |
| --- | --- | --- |
| 真实宿主逐字 widget（RPC 文本形态） | `bun test tests/harness-dock/detail-tree.test.ts`、`model-cost-modes.test.ts`、`viewed-session-total.test.ts`、`viewed-marker.test.ts`、`period-switch.test.ts` | 逐字断言（含 accrued 行、季节标记、CacheR／CacheW） |
| 真实宿主一次模式切换的余额门控与缓存 | `bun test tests/harness-dock/model-cost-modes.test.ts -t "the balance the CLI holds"` | 官方→Go→官方：Go 帧无 `Balance:` 行、余额端点调用数不变、返回官方帧仍 `Balance: ¥110.00`，保存文档两通道各自记录 |
| 组件形态的 theme／width | `bun test tests/model-cost/widget-visual.test.ts` | 逐 token 与逐宽度 |
| 单 timer／端点／休眠纠正／销毁 | `bun test tests/model-cost/boundary-timer.test.ts` | 受控时钟与受控 host |

### 5.2 场景、逐字期望与来源（全部适用模式 × 主子 brief／detail × 宽窄）

本票自造 fixture（`XTS`，峰窗 [09:00,12:00] +08:00，预算 450K／272K）下的精确 artifact；每个字面都由自动套件在同一 fixture 上逐字断言过。

| 场景 | 期望（逐字） | 自动来源 |
| --- | --- | --- |
| DeepSeek 峰、brief、宽 | `🔥  [░░░░░░░░░░░░░░░░░░░░   0% (1,000/450.0K)]  Effort: high` / `⏳ Accrued: ¥0.05 [▏]` / `Total:  Cache: 50%  ¥Cache/In/Out：5:19:76  Sum: 30  Cost: ¥0.05` | `widget-visual.test.ts`（文本与组件两例） |
| DeepSeek 谷（13:00） | 首行以 `🌙` 开头，其余同上 | 同上（`OFF_PEAK_AT`） |
| 首次 holiday 周期 | 首行以 `🏖️` 开头，其余同上 | 同上（`holiday: true`） |
| token-only（Go 模型） | `[░░░░░░░░░░░░░░░░░░░░   0% (1,000/450.0K)]  Effort: high`（**无季节标记**）＋ `Total:` 行；**无 accrued 行**、无窗口行、**无余额行**（即使进程持有官方余额读数） | 同上（`widget-visual.test.ts`） |
| Codex allowance | `[░░░░░░░░░░░░░░░░░░░░   0% (1,000/272.0K)]  Effort: high`（无标记）＋ `5h ━━━━━━━━━━━━━━━━│─── 85.0% / 80.0% · resets in 1h (dd/HH:MM)` ＋ `7d …` ＋ `Total:`；**无余额行** | `widget-visual.test.ts`（Codex 两例＋四步例） |
| 主 detail | 首行同「预算条」；其下 `⏳ Accrued:`；再 `Total:`（逐字与 brief 相同）；再 `主会话` / `│  provider / model  …` / `└─ 子会话名  …`；**无 `Round:`／`Prev:`** | `detail-widget.test.ts`、`detail-tree.test.ts`（受控＋真实） |
| 子代理查看 | 固定 brief：该子自己的 `Round:` 行与自身当前模型结构；`Sum／Cost／Ref` 仍是主树 | `viewed-session-widget.test.ts`、`viewed-session-total.test.ts` |
| 不适用模式（hidden） | **没有 widget**：宿主收到的是 clear 而不是一个画空行的组件（widget 区不占位） | `widget-visual.test.ts`（组件形态的 clear 断言）、`model-cost-modes.test.ts`（真实宿的「无 widget 帧」断言） |
| 余额行（仅 monetary） | `Balance: ¥9.99`（warning 色）／`Balance: ¥4.99`（error 色）／`Balance: ¥10.00`（无色）；同一进程持有读数时，token-only、allowance 与 hidden 三种目标都不画该行 | `widget-visual.test.ts`（余额两例＋模式门控例）；真实宿：`model-cost-modes.test.ts`（官方→Go→官方切换） |
| 窄宽降级（Codex 5h 行） | 宽 200：含 20 格条与 `│` 时间标记、`85.0% / 80.0%` 与 `· resets in 1h (dd/HH:MM)`；宽 50：`5h 85.0% / 80.0% · resets in 1h (dd/HH:MM)`（条先降掉）；宽 40：`5h 85.0% / 80.0% · resets in 1h`（绝对时刻再降掉）；宽 20：`5h 85.0% / 80.0%`；宽 10：`5h 85.0% …` | `widget-visual.test.ts`（组件路径：宽 200／50／40／20／10 逐字）＋ `quota-window-lines.test.ts`（显示结果路径，同四步） |

### 5.3 颜色／形状对照（H1 需人眼确认的部分）

| 元素 | 期望 token（host theme 自己的颜色） |
| --- | --- |
| 预算条四带 | `<36% dim`、`36–63% success`、`64–81% warning`、`≥82% error` |
| 余额 | `<5 error`、`5–9.99 warning`、`≥10 不着色` |
| 节奏条（Codex） | 领先 ≤0 → `text`；≤15 → `success`；≤30 → `warning`；>30 → `error`；无可用 reset → `muted` |
| Accrued 分段 | 按文档顺序循环 `success, warning, error, thinkingHigh, thinkingXhigh, syntaxType, syntaxNumber, syntaxKeyword` |
| Effort | 只给**值**上色，颜色取 `host.getThinkingBorderColor(level)` |

**期望值来源。** 上述 token、四带边界、余额两档、`0.05／1.00／20／400／50`、八色顺序与四步降级顺序均来自冻结旧实现（`my-omp-toolkit@fd3b507` 的 `index.ts`／`segment-bar.ts`／`chatgpt-usage.ts`，只读对照，见第 6 节）与规格 §135／§192；百分比、块数、列数与金额为本文手算或 fixture 字面值。实际 TUI 上「host 把 token 映射成什么具体颜色／字体」由该 CLI 自己的 theme 与终端决定，不在本仓库内，因此必须人工确认。

**本环境未覆盖的部分（H1 之所以仍需人工）。** 本机可用的宿主运行都是 RPC（headless）宿主：没有独立视图、没有 focus 手势、没有 TUI 的字体／颜色／窄宽布局，因此「交互 TUI 里颜色真的按 host theme 画出」「真实焦点切换下 widget 随当前目标重绘」「真实窗口拖窄时的视觉降级」「真实时钟跨过峰谷边界时整块重绘且不触发网络」四类判断**只能人工确认**。截图／录屏在无交互 TUI 的环境下不可获得，本票如实记录而不伪造。自动侧已把可判定的一切固定为可证伪断言（第 3、4 节）。

**结论：P41／P67 的 H1 未验证——需用户确认。** 未确认不记通过。P41／P67 的条件性 H3（真实 OMP 脚本多次失败或成本明显过高才转人工）本次**未触发**：真实宿 dock 用例一次通过，无需要转交的具体场景（无则无）。

## 6. 旧 source oracle 的授权与许可证记录

- **revision**：`E:/Developer/myhub/my-omp-toolkit` @ `fd3b507f99d11f8a68b63446c45aa911f0ee5c84`（与规格 §207 冻结值一致；`git rev-parse HEAD` 已复核）。仅作**只读**对照（四带、调色板、细／粗块规则、四步降级顺序、pacing 颜色带、`Effort: <值>` 的着色范围），**没有运行时 import**、没有拷贝其源码进本仓库、没有把它并入任何构建或测试路径。
- **许可证检查（复用前）**：该 checkout 无 `LICENSE`／`COPYING` 文件，`package.json` 为 `"private": true` 且无 `license` 字段，`AGENTS.md` 内也无 licence／copyright／SPDX 声明（`grep -iE "license|copyright|SPDX"` 无命中）。结论：**未声明任何开源许可**，因此本次不复制其代码，只在同一作者的私有仓库间做行为对照，并把结论限定为「不引入其代码，仅以规则事实重写」。
- 本仓库内与视觉相关的实现（`display.ts` 的阈值／块规则／调色板顺序、`widget.ts` 的 token 映射）是**按上述规则事实重写**的独立实现，其正确性由本票套件与规格断言，不依赖 oracle 可用。

## 7. 平台事实与已知限制（**未验证项**）

- **真实 TUI 未跑**：见第 5 节末段；`process.stdout.isTTY → component` 这一分支由视觉套件在**子进程**中读生产 assembly 证明（TTY=true→`component`、管道→`lines`），但「真实 TUI 里该分支下画出来的颜色」仍属 H1。
- **余额行模式门控：已按批准范围修复（见第 9 节）**。上一次 run 观察到 `widgetLayout` 在**任何**模式下只要进程持有读数或失败就画 `Balance:` 行，而冻结旧实现只在 DeepSeek 模式画该行、规格 §134 也把「余额」列为 token-only **没有**的项。该观察当时记作待裁决；**这不是新的裁决**：P8 已批准「token-only 只提供批准的 usage 展示」，对应 `Delivers: P8、P67` 的前端侧本就应由本票修好，因此本票（retry）已按该批准范围把行门控到 monetary 通道，并把 `presentation.balance()`／TTL／进程级缓存原样保留（见第 9 节）。
- **真实宿 baseline 记录失败（与本票无关，已由 08／17 票记录）**：`baseline.test.ts` 的两条失败源于 sibling 检查点前移，见第 3 节。本票不改记录、不改检查点。
- **`Bal:` → `Balance:` 与行拆分是本次迁移的既有决定**：冻结旧实现把「标记＋预算条＋Effort＋余额＋Accrued 分段条」画在一行（`💰 Bal: …`），本迁移按 11／12／16 票已交付并已验收的形态画成「预算条行 / accrued 行 / Total 行 / Round 行 / 余额行」——其中余额行只属于 monetary 通道（第 9 节）。本票只保证**元素**（四带、阈值、形状、调色板、宽度降级）与旧视觉一致，并把该差异记在此处供人工在 H1 轮一并确认。
- **未触碰正式 OMP**：全部运行在 `.cache/omp-baseline/18.5.0-viewed-session` 与临时 run root／`mkdtemp` 内；未重启、未改配置、未对当前调度实例执行验证命令、未使用任何真实凭据。

## 8. P58／P52 中本票的具名责任

- **P52**：本票未新增／修改消费文档字段、`schemaVersion`、`periodId`、`harnesses.<h>.sessions` 形状或保存触发；只读文档。`detail-tree.test.ts` 的 `costCnyOf` 只读该 run 自己的文档并只用于期望值。独立 schema 核对仍由 06／24 票持有。
- **P58**：本票不改 `framework/**`、`extensions/connect-bot/**`、`extensions/codebase-tools/**`、配置或宿主补丁，也不改任何消费者可见协议；`attachModelCostWidget`／`widgetLines` 的调用方只有本扩展自己的 assembly 与测试（本票已同票迁移这两个测试面）。因此不存在需要迁移的外部调用方。

## 9. 后续 retry：`Balance:` 行的模式门控（批准范围缺口修复）

Ticket 25 的独立验证交回一项具体缺口：**生产 widget 的 `Balance:` 行不按模式门控**，于是 `token-only`（Go 入口）也会显示官方余额，而规格 §134 明确列出 token-only **没有**「官方峰谷／holiday 价格与余额」，冻结旧实现也只在 DeepSeek 模式画该行。这是 `Delivers: P8、P67` 本票范围内的前端缺陷（P8 已批准「token-only 只提供批准的 usage 展示」），不是新的裁决，因此本次 retry 直接修复。

### 9.1 改了什么、没改什么

| 位置 | 内容 |
| --- | --- |
| `extensions/model-cost/harnesses/omp/widget.ts` | `widgetLayout` 把余额行收进门控：`if (display.mode === "monetary") { …balanceLine(reading.balance)… }`，并同步函数文档注释（余额是该通道自身账户的事实；token-only 没有余额，allowance 通道的账户事实是它上面那两条窗口）。这与同函数里既有的 accrued（仅 monetary）、窗口（仅 allowance）、hidden（返回 `undefined` 并由前端清空 widget）三层门控同一处、同一风格。 |
| **未改（有意保留）** | `presentation.balance()` 与 `ProviderBalance`（预取、成功 TTL、在途合并、失败保旧值、无轮询／补发）**原样运行**：`tests/model-cost/provider-balance.test.ts`、`runtime-initialization.test.ts`、`detail-tree.test.ts`、`headless-feedback.test.ts` 直接读 `presentation.balance()` 的期望全部未动且全绿；本票没有关闭缓存、没有让 Go 入口停止记账、没有删除混合主树已知的 `Cost`／`Ref`（树行仍由 `fieldsOf` 的混合范围产出）。门控只作用于**绘制哪一行**。 |
| 调用方迁移 | 无：`widgetLayout`／`widgetLines` 的调用方仍是本扩展 assembly 与测试；`balanceLine(result)` 是 shared logic 的纯格式化函数，语义未变。 |

### 9.2 自动证据（新／改）

| 套件 | 用例 | 观察 |
| --- | --- | --- |
| `tests/model-cost/widget-visual.test.ts` | `the balance is the monetary channel's own line (P8, P67) > a held reading is drawn for the official pair and for no other mode of the same CLI`（新，S2／S5，走生产前端 `attachModelCostWidget` ＋受控 host 的记录型 theme 与宽度） | **同一进程持有读数**（官方目标先画出 `Balance: «text:¥110.00»`）后，依次把查看目标切到 Go token-only、Codex allowance、未收录 hidden：token-only 的首行仍是 `«dim:[…0% (1,000/450.0K)]»  Effort: «effort:high:high»`（无季节标记）且**无任何 `Balance:` 行**，allowance 帧同样无该行，hidden 收到 clear；最后切回官方目标，`Balance: «text:¥110.00»` **再次画出**，且三次 HTTP 记录里 `/user/balance` 仍**只有 1 次**（读数是被保留的，不是被清掉或被重查） |
| `tests/harness-dock/model-cost-modes.test.ts` | `the balance the CLI holds is the official channel's own line (P8, P67) > a held reading survives a real switch to a Go id and back, and only the official pair draws it`（新，S5，冻结 artifact ＋真实 RPC ＋本机捕获端点） | **同一个真实 CLI 实例**：官方 `deepseek/deepseek-flash` 一次 exchange → 帧含 `Balance: ¥110.00`、`balanceCalls()==1`；`set_model` 到 `opencode-go/deepseek-v4-pro` 后再 exchange → 帧含 `Sum: 6,000`、不含 `Cache/In/Out`、**无 `Balance:` 行**，而 `balanceCalls()` 仍为 1（Go 请求不是余额 provider 的请求，本阶段不触及余额端点）；再切回官方并 exchange → 帧再次含 `Balance: ¥110.00` 与 `Sum: 9,000`，`balanceCalls()` 仍为 1（run 全程远在 shipped 30000ms 成功 TTL 内）、模型请求 3 次；保存文档两通道并列：官方对 `2000/2000/0/2000` ＋ `costCny ≈ 0.01004`（两次请求各自锚价之和），Go 对 `1000/1000/0/1000` 且 `costCny`／`referenceCostUsd` 均 `undefined` |
| 既有余额套件（未改） | `tests/model-cost/widget-visual.test.ts` 的余额两告警例（9.99／4.99／10.00／5.00） | 仍绿：门控是模式，不是读数大小；monetary 通道的阈值行为与色 token 未变 |

期望来源：门控结论来自**规格 §134**（token-only 没有官方余额）与**冻结旧实现**（`my-omp-toolkit@fd3b507` `extensions/model-cost/index.ts` 的 `buildWidgetLines`：只有 DeepSeek 分支 push 余额，`codex` 分支走 `buildChatGPTWidgetLines`，`token-only` 分支提前 return），两条都是本仓库之外的依据；金额（`¥110.00`）与 token 数（`Sum: 6,000`／`9,000`、`2000/2000/0/2000`）分别是端点脚本字面值与请求次数×端点 scripted usage 的手算，调用次数由捕获端点自己的 `balanceCalls()`／`requests()` 读数给出，不以被测实现重算。

### 9.3 red → green 与反向注入

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| red（先写测试） | `bun test tests/model-cost/widget-visual.test.ts` | **1 fail**：`expect(tokenOnly.some(line => line.startsWith("Balance:"))).toBe(false)` 收到 `true`——即缺陷本身；同帧的前一条断言已证明读数确实被进程持有（`Balance: «text:¥110.00»`），失败不是夹具或 setup 问题 |
| green（最小实现） | 同上 | **21 pass / 0 fail**（86 expect） |
| 反向注入（把门控换回 `if (display.mode !== "hidden")`，即缺陷形态） | `bun test tests/harness-dock/model-cost-modes.test.ts -t "the balance the CLI holds"` | **1 fail**：真实宿上 Go 帧出现 `Balance:` 行（第 620 行断言），证明该 S5 用例确实能抓住这个错 |
| 反向注入（同一注入） | `bun test tests/model-cost/widget-visual.test.ts` | **1 fail**：S2 用例同样在第 635 行抓住 |
| 恢复后复跑 | 两个套件 | 再次全绿（见 9.4） |

### 9.4 本次 retry 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost/widget-visual.test.ts` | **21 pass / 0 fail**（86 expect，0.25s） |
| `bun test tests/model-cost` | **267 pass / 0 fail**（22 文件，3.07s；上次记录的 255／21 文件之外，其他票新增了文件，本票 retry 加 1 例） |
| `bun test tests/harness-dock/model-cost-modes.test.ts tests/harness-dock/detail-tree.test.ts` | **7 pass / 0 fail**（90 expect，15.96s） |
| `bun test tests/harness-dock/model-cost-modes.test.ts -t "the balance the CLI holds"` | **1 pass / 0 fail**（18 expect，1.95s） |
| `bun test`（全仓） | **864 pass / 0 fail**（98 文件，4820 expect，292.6s；＝上次全仓 862 加本票 retry 新增 2 例。**观察**：本票上一次 run 记录的两条既有 `baseline record` 失败在本次全仓运行中没有出现——本票未改 `framework/docs/harness-baseline.json`、未改检查点、未改 patch artifact，如实记录而不解释归因） |
| `bunx tsc --noEmit` | 无输出（exit 0；TypeScript 7.0.2，--listFiles 含本票改动的三个文件） |

隔离与权限：全部运行仍在冻结 artifact `.cache/omp-baseline/18.5.0-viewed-session` 与 `createRunRoot`／`mkdtemp` 的独立 agent state／session-dir／work／capture／user-home 内；未触碰正式 OMP、未重启、未改配置、未使用任何真实凭据。真实 provider `deepseek` 的 permission 仍由 dock 既有 fixture 充当（`writeProviderOverride` ＋ 本机 capture 端点，`Bearer dock-key` 是隔离 run 自己的 fixture 键）。

已知限制（与第 5、7 节相同，不因本次修复改变）：真实交互 TUI 的颜色／字体／窄宽布局与真实 DeepSeek 账户读数仍属 **H1／H2 待人工**；本环境只能给出上面这些可证伪的自动断言与逐字期望。相关但属于其他票的观察：`assets/15-…-evidence` 的一条理由文字（「余额行在 widget 中不限模式显示」）随之变成过时表述，其下已交付行为（宿主无法鉴权时不记余额 failure）未变；本票不改其他票的正文，仅在此记录并交回。

