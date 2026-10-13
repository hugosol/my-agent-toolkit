# 19 — holiday 与 clear 的完整周期切换：自动证据与 P36 H2 材料

Ticket: [`implementation/19-period-holiday-clear.md`](../implementation/19-period-holiday-clear.md)（P30、P31、P32、P33、P34、P35、P36；seam S1／S2／S3／S4／S5）。
Contract: [P30–P36](../contract.md)；命令范围权威 [07-command-state](../lighthouse/07-command-state.md)；存储与归档权威 [06-local-storage Q13／Q15／Q25](../lighthouse/06-local-storage.md)；边界余额查询权威 [09-refresh-lifecycle](../lighthouse/09-refresh-lifecycle.md)；刷新／装配 seam 权威 [10-assembly-layout](../lighthouse/10-assembly-layout.md)。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明，也不是人工验收；H1／H2 与允许的条件性 H3 未确认项不记通过。支持基线未变：OMP 18.5.0 / Windows x64 / Bun 1.4.2。

## 1. 本票交付的行为与落点

| 位置 | 内容 |
| --- | --- |
| `framework/core/protocol.ts` | 命令交付新增**可靠入口事实** `provider`（`CommandInvocation` 与其 `actions` 交付 `ActionDelivery`）：本命令所在 Session 当前运行的 provider，由 adapter 在调用时读取；surface 报不出当前模型时为 `undefined`，不猜。 |
| `framework/adapters/omp.ts` | `registerCommand` 把 `ctx.model?.provider` 映射进调用事实（与既有 `hasUI`／`canAcceptInput` 同一处）。 |
| `tests/framework/support/harness-port-double.ts` | 双精度端口建模该事实（`CommandRunOptions.provider`），并把一次调用的自身完成交给套件（`CommandRun.completion`），使「写入落盘前不作任何宣告」可被观察。 |
| `extensions/model-cost/definition.ts` | `/budget` 动作表现在同时声明 `holiday`（「开启假日计价」）与 `clear`（「归档并重置统计」）——与实现成对，无空声明。 |
| `extensions/model-cost/shared-logic/consumption-archive.ts`（新） | **消费归档文档**与写出：活动文档原样＋ISO `end`＋可选 `end_bal`，写到 `<root>/archives/<crypto.randomUUID()>.json`，以独占创建（`wx`）拒覆盖；目录不可建／写入失败作为可判别拒绝（`ArchiveFailure.refused` 只在名字已被占用时为真）。 |
| `extensions/model-cost/shared-logic/consumption-store.ts` | 新增 `reset({holiday, endBal?, at})`：**一个协调范围内**读取当前活动文档→写归档→发布新周期（`emptyActivity`）；结果可判别（`reset`／`unusable`／`archive-failed`／`archive-written`／`failed`），成功时本实例采纳新周期；根上无文档＝本实例自己的新周期（沿用既定「空根不是坏基线」）。 |
| `extensions/model-cost/shared-logic/provider-balance.ts` | 新增 `boundaryReading()`：**锁外一次**余额查询，只回答本次尝试得到的 CNY 读数（失败／超时／无 CNY 为 `undefined`）——不返回已持有读数、不重试、不适用成功 TTL；查询内部改为回答「本次尝试」的读数（既有预取／TTL 行为不变）。 |
| `extensions/model-cost/shared-logic/request-accounting.ts` | 只读接口新增 `savePending()`：本实例已提交、尚未落盘的快照计数（在 commit 前后计数），即「本入口保存是否收口」；并新增 `periodSwitched()`：重置真正落地后丢弃本实例为被关闭周期累计的全部 state（各 Session 自身累计与全部 Round 边界对），保留宿主已报告的 Session 身份事实与已处理 Turn 身份——否则被关闭周期的消费会被下一次快照重新绑进新周期。不新增队列、不强制保存。 |
| `extensions/model-cost/shared-logic/period-switch.ts`（新） | `/budget holiday`／`clear` 的业务规则与文案：入口 provider、可靠 idle（三值，未报不为空闲）、保存收口、已开启 holiday 的幂等；允许后先做一次锁外边界读数，再交给 store 收口，并按阶段如实反馈（成功只在新活动提交后，归档已生成而发布未成时保留阶段），失败经 `throw` 交 framework 单报；`reset` 落地后回调 `onReset`，让记账层放弃被关闭周期的累计（`request-accounting.periodSwitched()`）。 |
| `extensions/model-cost/shared-logic/runtime.ts` | 建立该切换并把 `holiday`／`clear` 接到 `implementation.commands.budget`；未接线的动作不声明。 |
| `extensions/model-cost/GLOSSARY.md`、`GLOSSARY-MAP.md`、`framework/docs/framework-capabilities.md`、`framework/docs/harness-support.md` | 新增领域词条 **Accounting reset（统计周期重置）**、**Consumption archive（消费归档）**、**Boundary balance reading（边界余额读数）**；更新 map 的 model-cost 行；capabilities 的两行命令事实与 harness-support 新增 `session.current-model-provider` 行。 |
| 未改 | `extensions/connect-bot/**`、`extensions/codebase-tools/**`、存储 schema 字段（`schemaVersion`／`periodId`／`start`／`start_bal`／`holiday`／`harnesses`／归档 `end`／`end_bal` 均为已批准形状）、`config.yaml`、State／marker／Owner 机制、`framework/modules/files.ts`（协调能力既有，未改）；无命令别名、flags、多层解析、`holiday off`、pending 操作。 |

自动覆盖落点：

| 套件 | seam | 用例数 | 覆盖 |
| --- | --- | --- | --- |
| `tests/model-cost/period-switch.test.ts`（新） | S1（真实注册的 `/budget` 经 port double 驱动）＋S2（`createModelCostRuntime`）＋S3（注入的 `httpRequest` 单次捕获）＋S4（真实文件、真实协调） | 20 | 见第 2 节逐条 |
| `tests/harness-dock/period-switch.test.ts`（新） | S5（冻结 baseline install＋真实 loader／RPC／agent state＋本机 capture endpoint） | 1 | 真实宿主：入口 provider/idle 事实真的来自运行中的 Session；命令链真的等待效果（prompt 返回时归档与新周期已在盘上）；边界余额查询真的离开进程（`/user/balance`＋当次凭据）；`clear`／首次 `holiday`／重复 `holiday`（幂等不切周期、不再查询）三连 |

## 2. 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 仅当前 DeepSeek 入口可靠 idle 且保存已收口允许；busy／pending-save warning、unknown error 拒绝，不排队／延期，不要求其他 CLI／子全空闲，不清真实活动或 Owner | S2 例：`provider: "plan-provider"` 与 `provider: undefined` 各一次 warning 且文档逐字未变、无归档、除启动预取外零请求、`persisted === []`；`idle: "busy"` warning、`idle: "unreported"` **error**（不猜空闲），两者文档与归档均未动、零余额查询，且事后同一会话再跑命令仍不执行（无 pending／队列）。「保存未收口」例：真实交付一轮 Turn 后以 `updateFile` 占住活动文档，Round 结束的保存真的在途（同一进程 FIFO 保证提交顺序）→ `clear` 只回一条 warning、无归档、零余额查询；放行后那次在途保存**正常落盘**（`saveVersion` 3→4），文档仍在旧周期。命令路径只经 `feedback.notify`／`throw`，不写 State、不触 owner 效果（`persisted` 为空、无 marker 更新）。 |
| 首次 holiday 新周期直接 true，clear 新周期 false；已开启 holiday info 幂等不切周期不查余额，无 off | S2 例：首个 `holiday` 后活动文档逐字段等于 `{schemaVersion:1, 新 periodId, start=end, start_bal, holiday:true, harnesses:{}}`，**只发一条 info**、只生成一个归档（不是先 clear(false) 再 setHoliday）；`clear` 得到同形状但 `holiday:false`；基线已是 holiday 的文档上跑 `holiday` → 一条 info、`periodId` 不变、无归档、请求数仍为 1（零余额查询）。不存在的 `off` 参数与任何非整名参数由 framework 的整名匹配拒绝：本票另有例 `holiday off` → 一条 error＋help、文档逐字未变、无归档、除启动预取外零请求（通用规则由 `framework/actions-routing` 既有例覆盖）。S5 例在真实宿主上复现同一三连。 |
| 允许后、文件锁前只尝试一次 5000ms 余额，可靠同值作旧 end_bal 和新 start_bal；失败／超时省略两处仍 reset，不用旧缓存／零／重试 | S3 捕获例：预取答 `12.50`、边界查询答 `7.75` → 归档 `end_bal = 7.75` **且**新周期 `start_bal = 7.75`（不是缓存里的 12.50），请求数恰为 2；请求的 URL 为 `https://host.example/user/balance`（host baseUrl 去 `/v1`）、`authorization: Bearer probe-key`、`timeoutMs: 5000`、`proxy: false`。锁外次序例：以 `updateFile` 占住活动文档后驱动命令，边界查询的请求在**文档仍被占住时**已被外部观察到，且此时无归档、`periodId` 未变（= 查询不在锁内、不等锁）。失败例：边界查询抛错 → 归档与新文档**都没有** `end_bal`／`start_bal`、请求仍恰为 2（不重试）、`holiday:false`／`harnesses:{}` 照常切换（操作由文件提交决定）。 |
| 权限内重读最新完整有效活动文档，先生成唯一拒覆盖归档含 end，再原子发布新活动，跨 provider 全文件且零消费也归档；只归档已保存数据 | S2＋S4 例：归档逐字段等于**运行前写入的整份文档**（含 `deepseek` CNY 记录与 `plan-provider` USD 参考记录）＋ `end`＋`end_bal`——即锁内读到的完整已保存 JSON，不含任何内存追加；`end` 为可解析 ISO 且等于新文档 `start`。零消费例（`harnesses:{}`）同样归档同一流程；「根上还没有文档」例把该实例的**新周期**如实归档并切新周期。拒覆盖例：连续两次切换产生两个归档，第一个归档前后**逐字节相同**（后一次不覆盖前一次）。 |
| 归档失败不 reset；归档已生成但活动发布失败保留归档并准确报告阶段，只在实际新活动提交后成功；宿主命令等待真实完成，同步／异步错误单报，不补做／事务日志 | 归档失败例：`archives` 位置上放一个文件 → 命令只有**一条 error**（framework 加前缀 `/budget clear failed: `，含「归档未生成」），活动文档逐字节未变（未 reset）。发布失败例：归档目录可写而活动文档的发布被平台拒绝（win32：目标文件只读属性；POSIX：目录不再接受新临时文件）→ 只有一条 error（含「归档已生成」与「未提交」，无成功文案），**归档保留**（内容为被关闭周期的 `periodId`），活动文档逐字节未变。等待例：占住文档时命令已读出余额但 `run.feedback` 为空、无归档、`periodId` 未变；放行后 `run.completion` 结束才出现唯一 info，且盘上已是新周期。错误只报一次由 framework 的 actions 路由既有例（`/budget clear failed: …` 一条）与本票失败例共同证明；无重试／补做／事务日志（失败例后文档与归档都没有第二次尝试的痕迹）。**无有效基线**另有例：以 `schemaVersion: 2` 的异物文档绑定（初始化据既有规则暂停并报一次 notice）后跑 `clear` → 命令本身只回一条 `error`（含「没有可用的消费存储基线」）、文件逐字未变、无归档、且**一次余额查询都没有多**（连边界读数都没发）。**发布无法开始**另有例：加载后把整个 storage root 改名 → 协调连目标目录都解析不到 → 一条 `error`（含「消费活动未提交」）、被改名的根里文档逐字未变、无归档（即 `failed` 与 `archive-failed` 两种「未发生改动」都被读回确认）。S5 例：真实宿主 prompt 返回的**同一时刻**归档与新周期已在盘上（读取前无任何等待）。 |
| 新 periodId 拒绝旧周期／在途提交，不收集其他进程内存／强制保存／终轮，不复活旧消费；不清旧归档、独立 estimate 或 detail | 周期／版本拒绝由既有存储套件持有（`consumption-store`／`storage-processes`／`session-recovery`，本票未改其规则）；本票例额外证明：切换**只**动活动文档与 `archives/`——手工放置的旧归档与 `codex-usage-estimate.json` 前后逐字节相同，`/budget detail` 的入口偏好切换后仍为 `detail`（且 `archiveNames` 由 1 变 2 而非覆盖）。归档输入只取锁内已保存 JSON（上面的整份文档对照），无不落盘内存、无强制保存／终轮、无补账路径。「不复活旧消费／不强制保存」专例：先在仍属旧周期的一轮里真的记入一次消费（`view.own` 手算 0.031＋0.0001＝0.0311），`clear` 后该次归档逐字段仍等于**运行前写入的文档**＋`end`＋`end_bal`（这份尚未保存的内存累计既没被收进归档、也没被强制保存出去），而 `view.own` 对该 Session 立刻回答 `undefined`；跨切换仍开着的那个 Round 结束时**不发布任何记录**（新活动文档的 `harnesses` 仍为 `{}`，独立读回确认）；此后新一轮的请求重新累计并保存为该 Session 在新周期的 `saveVersion 1`（`own` 只含新请求的 10/10 token 与手算 ¥0.0001）。 |
| 本票写 P30–P36 全部业务 tests，经公共命令／S2、mock 单次查询捕获和真实文件独立读回验证顺序／归档／幂等／失败／保留；完整跨文档 P52 验证由 24 负责 | 本文件第 1–2 节即 20＋1 例的落点与逐条对照；读回一律用 `readFileSync`／`readdirSync` 直接读文件（不经 store 的内存视图），网络一律注入的单次捕获。P52 的跨文档 schema／重启恢复验证不在此声明。 |
| 准备 P36 H2 边界余额脱敏读数或跳过原因与归档检查步骤；人工结果未确认不记真实余额贯通通过 | 见第 5 节：准备的是可执行步骤＋记录格式＋本环境的跳过原因；本文件**不**声明真实余额贯通已通过。 |
| 通过批准的生产公共 seam 观察行为，预期来自合同／规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | 观察只用：真实注册的 `/budget` 命令（port double 驱动）＋`createModelCostRuntime`＋注入的 `httpRequest`＋真实文件；S5 只用真实 loader／RPC／capture endpoint。期望值全部是本文手写字面值（`12.50`／`7.75`／`12.5`／`schemaVersion:1`／`harnesses:{}`／`plan-provider` 的 0.02 等）或规格固定形状，没有一处从被测实现回读后当作期望；永久用例的"provider"是本机注入函数，S5 例的 provider 是本机 loopback capture endpoint。 |
| 使用隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作 | S2 例各自 `mkdtempSync` 独立根（`storageDir` 指向它、无 `~/`）；S5 例用 `.cache/omp-baseline/18.5.0` 冻结 install＋`createRunRoot` 的独立 agent state／session dir／work／capture／user-home（扩展 `~/cost-archive` 落在该 user-home 内），凭据是本 run 自己的 fixture key（`dock-key`／`probe-key`），无秘密、无正式环境路径；失败信息带真实文件内容／子进程 stderr。未触碰正式 OMP、未重启、未改配置、未对当前实例执行验证命令。 |

## 3. 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost/period-switch.test.ts` | 20 pass / 0 fail（119 expect，0.27s） |
| `bun test tests/model-cost` | 221 pass / 0 fail（18 文件，2.79s）——含 01–17 既有各套件，无回归 |
| `bun run typecheck`（`tsc --noEmit`） | 无输出（exit 0），在最后一次源码改动之后运行 |
| **收尾全量（最终源码＋最终测试）**：`bun test tests/model-cost tests/framework tests/harness-dock/period-switch.test.ts tests/harness-dock/detail-tree.test.ts` | **608 pass / 0 fail**（52 文件，3036 expect，51.1s）——本票新例＋全框架（`provider` 事实回归）＋真实宿主上新增命令路线与既有 `/budget detail` 路线 |
| `bun test tests/harness-dock/period-switch.test.ts`（单独） | 1 pass / 0 fail（26 expect，约 1.9s）；共单独跑过 6 次，全部 1 pass |
| `bun test tests/harness-dock/{period-switch,detail-tree,model-cost-balance,model-cost-store,model-cost-accounting,model-cost-modes,model-cost-codex-quota}.test.ts`（7 文件并行，最终源码） | 23 pass / **0 fail**（57.8s）；另两次同批分别 22/1 与 22/1，失败的都是 `model-cost-balance` 的 P53 哨兵例（`the synthetic sentinel authenticates the balance query and appears in nothing else this run produced`），该例单独复跑过一次 5/1、随后两次 6/0——与 17 票记录的同类环境性失败一致，且与周期切换路径无关（该套件不执行任何 reset，也不调用本票新增的接口） |
| `bun test tests/framework tests/model-cost tests/connect-bot tests/codebase-tools`（一次并行大跑，本票早期状态） | 768 pass / **2 fail**，两处失败均在 `tests/connect-bot`（见下）；`tests/framework` 与 `tests/model-cost` 无失败 |
| `bun test tests/connect-bot/panel-registration-lifecycle.test.ts tests/connect-bot/budget-regression.test.ts`（单独复跑，无并发压力） | 9 pass / **2 fail**，同两处：`an unregister that never arrives leaves the row to the panel's own window (P25) > the blocked row stays registered and goes offline by the 30s window`（实测保留 15003ms，用例写 30_000ms）与 `the protocol the actual omp-bot panel receives is the frozen one (P23) > a whole session … is what the real panel records and answers`（面板记录多 2 帧）。二者都只涉及 connect-bot 面板的服务端窗口与冻结协议帧，**与本票改动无关**（本票未触碰 `extensions/connect-bot/**`），且单独复跑同样失败＝不是并发干扰 |

> 全目录并行数字只作诊断；本票相关套件（`tests/model-cost`、`tests/framework`、dock 的 model-cost 六文件）均已全绿。

## 4. 反向注入验证（跑完即恢复；恢复后用 `grep` 与 `tsc --noEmit` 确认回到注入前）

| 注入 | 预期被抓 | 实际结果 |
| --- | --- | --- |
| `period-switch.ts`：`if (inputs.savePending())` → `if (false && …)`（忽略保存未收口） | 「保存未收口拒绝」例应失败 | 失败：该例在占住文档下不再拒绝、命令挂到占住处，用例 5s 超时判失败（`0 pass / 1 fail`） |
| `period-switch.ts`：idle 的两个分支都改成 `if (false)`（忙碌与未报都当空闲） | busy／unknown 两例应失败 | 失败 2 例：`an activity state the harness cannot report …` 期望 `error` 得到 `info`、`a working entry is warned …` 期望文档未变而实际切换（`2 pass / 2 fail`） |
| `provider-balance.ts`：`boundaryReading()` 改为 `return Promise.resolve(reading?.total)`（用已持有缓存） | 「边界查询失败省略两字段」例应失败 | 失败：`expect("end_bal" in closed).toBe(false)` 得到 `true`（旧缓存 12.5 被写进归档） |
| `consumption-store.ts`：把 `publishArchive` 的失败 catch 掉并继续发布新周期（归档失败仍 reset） | 「归档未生成不动活动」例应失败 | 失败：期望 `error` 得到 `info`（归档失败也 reset 并报成功） |
| `period-switch.ts`：在边界查询前先补一条成功 info（提前宣告成功） | 「只报一次且不提前成功」应失败 | 失败：`expect(feedback).toHaveLength(1)` 得到 2（归档失败例同时看到提前的成功与随后的错误） |
| 自然红→绿：先写「关闭周期累计不复活」用例、尚未做丢弃 | 该例应失败 | 失败（实测）：`clear` 成功后 `view.own` 仍答 0.0311（旧累计随实例留进新周期）；补上 `onReset`／`periodSwitched()` 后该例通过 |
| `period-switch.ts`：`unusable` 与 `failed` 两个阶段改为「notify info 并返回」（假报成功） | 「无有效基线」与「发布无法开始」两例应失败 | 失败 2 例：两例都期望一条 `error`＋`/budget clear failed: ` 前缀，实际得到一条 `info`（`0 pass / 1 fail` 各一次） |

可区分性说明（无需注入即可判定）：若归档输入取内存追加值，整份文档对照（含两个 provider 记录）失败；若 `end`／`start` 不是同一时刻，`closed.end === opened.start` 失败；若新周期继承任何 Session 或 `holiday` 初值写错，逐字段 `toEqual` 失败；若归档目录/名字被覆盖，第二个归档出现时第一个文件不再逐字节相同；若切换误清 estimate／旧归档／detail，第 2 节 criterion 行里那三处逐字节／形态断言失败；若边界查询在锁内或重试，锁外次序例（查询已在盘上无归档）与请求计数（恰为 2／3）失败；若 `provider` 事实被猜成 `deepseek`，`provider: undefined` 与 `plan-provider` 两例失败。

## 5. P36 H2 材料准备（人工确认项）

**为什么是人工**：P36 的 H2 是「真实可靠余额贯通」——真实 DeepSeek 账号的一次边界读数被同一值写进归档 `end_bal` 与新周期 `start_bal`。本环境没有可用真实凭据，也没有对本机网络发起真实 provider 请求的授权，故 H2 **未执行**，本文件不把它记为通过（`P62` 亦要求真实效果不得由 mock／RPC 替代）。

**跳过原因（本会话）**：无隔离环境可用的真实 DeepSeek 凭据；本票自动用例一律用注入的单次捕获（S2）与本机 loopback endpoint（S5），不触真实 provider。若人工侧同样没有可用凭据，按同一理由记「跳过」即可。

**人工执行步骤（隔离环境，勿动正式 OMP）**：
1. 隔离根：新建临时 user-home／work 目录，`storageDir` 指向其中（如 `<tmp>/.omp/cost-archive`），确保正式 `~/.omp/cost-archive` 不被写入；配置里只放该隔离根与本扩展自己的字段。
2. 启动该隔离实例（真实凭据只供这次鉴权），确认启动预取已能取到余额（widget 的 `Balance:` 行）。
3. 让主会话发出至少一次真实模型请求（消费要真的被保存），等该请求的 Round 结束后再继续。
4. 在同一入口（provider 为 DeepSeek、可靠空闲）输入 `/budget clear`；若先得到「保存尚未收口」的 warning，等片刻后重试一次（这是真实宿主的保存时机，不是命令失败）。
5. 输入 `/budget holiday`，再输入一次 `/budget holiday` 观察幂等。

**要读的脱敏读数（记录格式，勿贴完整值）**：
- 命令反馈：`info` 一条（clear 的 `holiday=false`／holiday 的 `holiday=true`），重复 `holiday` 为一条 info 且 `archives/` 数量不变、无新 provider 请求。
- `archives/<本次新出现的文件名>.json`：`end`（ISO）与 `end_bal`；把余额只记成两位掩码（如 `1X.XX` 或区间），不记原文。
- `consumption.json`：`periodId` 与切换前不同、`holiday` 符合动作、`harnesses` 为空（或新周期首轮之后的记录）、`start_bal` **与上一条 `end_bal` 完全相同**（这是本 H2 的核心断言）。

**归档检查步骤**：切换前后各记录 `archives/` 的文件名清单与活动文档的 `periodId`；切换后确认清单只多出本次一个文件、旧文件内容未变（可用文件大小／摘要），并且新活动文档的 `start` 等于新归档的 `end`。

**边界读数来源（供人工核对）**：一次 `GET <host resolved deepseek baseUrl 去掉 /v1>/user/balance`，`Authorization: Bearer <当次凭据>`、`proxy: false`、`timeoutMs: 5000`；失败或超时则该次归档与新周期都省略两个余额字段，操作仍然成功（自动用例已分别覆盖成功与失败两条路径，人工只需确认真实服务下成功路径的**同值双写**）。

**H3（条件性）**：本票未触发——没有出现「真实 OMP 脚本多次失败或成本明显过高」的情形，因此无脚本转人工项；永久 test cases 均已完成。

## 6. 未确认与未验证

- **P36 H2 未执行**（无真实凭据）：真实余额贯通不算通过，只准备了上面第 5 节。
- **H1 与本票承诺无关**：P30–P36 的 Coverage 未把视觉判断分给本票（命令文案为文本，已在 S2／S5 读取）；视觉与 TUI 由 20 票的 P67 持有。
- **P52 的完整跨文档验证由 24 负责**：本票的归档／活动文档断言只覆盖本票承诺（整文件归档、`end`／`end_bal`、零消费、拒覆盖）；schema 全量核对、重启恢复与"无账本"检查不在本文件声明。
- **S5 例中「首次被拒绝」的时机不固定**：真实宿主的保存在 Round 结束后继续在后台发布，命令可能先得到一次「保存尚未收口」的 warning 再被接受；用例只断言"最终被接受且只宣告一次成功"与"从未成功的更早宣告"，不断言是否发生过该次 warning（它由宿主真实时机决定）。
- **观察到的无关失败**：并行大跑与单独复跑中，`tests/connect-bot/panel-registration-lifecycle.test.ts`（面板 30s 窗口实测约 15s）与 `tests/connect-bot/budget-regression.test.ts`（冻结协议帧多 2 帧）各失败一次；两者都在 connect-bot 面板域、与本票未触碰的文件无关，本票不认领。
- **另一处无关波动**：`tests/harness-dock/model-cost-balance.test.ts` 的 P53 哨兵例在 7 文件并行批次里失败两次（该例单独复跑亦出现过一次 5/1，随后两次 6/0）；它是 17 票已记录的同类环境性失败，该套件不执行 reset、不调用本票新增接口，本票不认领，也不把它算作本票通过项。
