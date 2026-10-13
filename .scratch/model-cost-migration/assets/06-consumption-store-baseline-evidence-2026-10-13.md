# 06 — 消费文档安全保存与存储基线：自动证据与真实贯通

Ticket: [`implementation/06-consumption-store-baseline.md`](../implementation/06-consumption-store-baseline.md)（P44、P45、P47、P51，seam S2／S4／S5）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明，也不是人工验收；H1／H2 与允许的条件性 H3 未确认项不记通过（本票四条承诺的 Coverage 只含自动项与条件性 H3，无 H1／H2；见末节）。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`extensions/model-cost/config.yaml`](../../../extensions/model-cost/config.yaml) | 唯一可配置存储根 `storageDir: "~/cost-archive"`；字段局部 `~/`、相对路径与绝对路径规则写在文件注释里，文件是取值的唯一来源（无代码默认、无环境覆盖、无热切换） |
| [`extensions/model-cost/definition.ts`](../../../extensions/model-cost/definition.ts) | 纯声明：`id`、`displayName: "modelCost"`、配置需求 `{ storageDir: "non-empty-string" }`（本轮未声明命令／State／marker，那些由各自工单落） |
| [`extensions/model-cost/shared-logic/storage-root.ts`](../../../extensions/model-cost/shared-logic/storage-root.ts) | `resolveStorageRoot({ declared, configDirectory, userHomeDirectory })`：字段局部 `~/`（含 `~\`）＝ 用户主目录下 `.omp`，其他相对值＝配置文件所在目录，绝对值原样；从不看 cwd |
| [`extensions/model-cost/shared-logic/consumption-document.ts`](../../../extensions/model-cost/shared-logic/consumption-document.ts) | `consumption.json` 的批准 schema（根字段、扁平 `harnesses.<harness>.sessions`、`{id,name,parent,saveVersion,own}`、四类 token 与 `costCny`／`referenceCostUsd`）、`readConsumptionDocument`（不认的形状一律 unusable，不默认、不裁字段）、业务值比较（不按 JSON 排版／键顺序）与 `mergeSession`（按 id 替换或追加，旧版拒绝、同版同内容幂等、同版不同内容冲突） |
| [`extensions/model-cost/shared-logic/consumption-store.ts`](../../../extensions/model-cost/shared-logic/consumption-store.ts) | `ConsumptionStore`：`load()`（读基线／无文档＝新周期、创建根目录）、`commit(harness, record)`（经 `updateFile` 在协调范围内判定并合并）、只读回读（`period()`／`sessions()`／`session()`）、暂停状态与 `unusableBaselineNotice`；写入只有这一条路径，无同步第二入口、无消费专属锁或路径配置 |
| [`extensions/model-cost/shared-logic/runtime.ts`](../../../extensions/model-cost/shared-logic/runtime.ts) | 业务实例：由已校验配置解析存储根、`initialize(delivery)` 载入基线并把不可用基线经公共 feedback 报出（返回 load 结果供调用方使用） |
| [`extensions/model-cost/harnesses/omp.ts`](../../../extensions/model-cost/harnesses/omp.ts) + [`entrypoints/omp/model-cost.ts`](../../../entrypoints/omp/model-cost.ts) | 薄装配：`configBaseDir`＝本模块位置推出的仓库根、`configDirectory`＝`extensions/model-cost`、`userHomeDirectory`＝`os.homedir()`；入口只 re-export |
| [`tests/model-cost/`](../../../tests/model-cost) | `storage-root.test.ts`（6）、`consumption-document.test.ts`（18）、`consumption-store.test.ts`（12）、`storage-processes.test.ts`（9）、`support/store-child.ts`（独立进程驱动器） |
| [`tests/harness-dock/model-cost-store.test.ts`](../../../tests/harness-dock/model-cost-store.test.ts) | 3 例：真实隔离 OMP 装载本扩展入口，隔离用户主目录，观察初始化读取、坏基线反馈与“未写入／未创建” |
| 文档 | [`extensions/model-cost/GLOSSARY.md`](../../../extensions/model-cost/GLOSSARY.md) 增补 Storage root／Active consumption document／Storage baseline 三个词条（与既有 Accounting period／Session totals 词条同一词汇表） |

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 存储根初始化读取、重启生效：默认用户 .omp 主目录 cost-archive；仅 storageDir 的 `~/` 按 .omp 主目录解析，普通相对路径按配置目录，绝对路径直接使用，不随 cwd，不自动搬迁/合并 | `storage-root.test.ts`：默认值→`<probe home>/.omp/cost-archive` 且 ≠`<probe home>/cost-archive`；框架 `readConfig` 读本文件得到逐字 `"~/cost-archive"`（字段局部语义在本扩展，不在 framework）；相对值→`<config dir>/data/cost-archive` 且 ≠`<cwd>/data/cost-archive`；绝对值原样；`~\` 同规则；裸 `~` 不是例外。跨进程 `storage-processes.test.ts`：两个不同 cwd 的子进程用相对值落到同一 `<config dir>/data/archive/consumption.json`，两个 cwd 下都没有 `data/`；“~/ ”用例在隔离 USERPROFILE／HOME 下真实 `homedir()` 解析到 `<isolated home>/.omp/cost-archive/consumption.json`（子进程先自检 home，不符则拒绝运行）；改值后**新进程**用新根，旧根字节不变、两个根各自只有自己的文件（无搬迁／合并）。进程内“文件改了也要重启才生效”属 framework 既有覆盖（`tests/framework/config.test.ts`「read once per process」），本票不重复断言 |
| 活动文档采用批准 schemaVersion=1、periodId、start、可选 start_bal、holiday 和 harnesses；Session 为扁平 id/name/parent/saveVersion/own，保存可靠直接父关系且不要求父先保存 | `consumption-document.test.ts`：完整批准文档逐字段读回（含可选 boundary 缺失时 `"start_bal" in doc === false`）；`consumption-store.test.ts`：先提交子记录（parent=未保存的主会话）再提交父记录，重启后两记录与直接父关系逐字读回；`storage-processes.test.ts` 同根多进程后各记录及其 parent 逐字比对 |
| 只按负责 Session ID 替换/追加，保留其他记录；自身四类 token 及适用 Cost/Ref，不保存额外权威总数、账号键、Turn/Round 明细或历史价格；完整 P52 测试 owner 为 24 | `consumption-store.test.ts`「committing one session leaves every other record exactly as it was」：另一终端记录逐字不变，整份文档等于“原文档 + 本会话替换”；`consumption-document.test.ts`：记录上出现 `totalCost`／`totalTokens`、顶层出现 `accounts`、own 出现 `costUsd` 都判 unusable（不裁字段、不搬运）；own 的 `costCny` 与 `referenceCostUsd` 各自保留 |
| 版本作用域 periodId+harness+sessionId；旧周期/旧版拒绝，同版同业务内容幂等，同版不同内容冲突，比较业务值而非 JSON 排版，不相加/取最大/最后覆盖 | `consumption-document.test.ts`：旧版→`stale-version`；同版同内容→`unchanged` 且文档不变；同版另一内容（含仅改名）→`conflict`；键顺序打乱→仍判同一业务内容；另一 harness 同 id 同版→独立记录（作用域）。`consumption-store.test.ts`：旧版拒绝且文件字节不变；冲突后文件保持磁盘内容、内存读回仍是磁盘那条；另一周期提交→`stale-period` 且文件不变。`storage-processes.test.ts`：4 个独立进程同版不同内容并发→恰好 1 个 `saved`、3 个 `conflict`，文件只留写入者那一条（不相加、不取最大、不最后覆盖）；另一进程旧版→`stale-version` 且文件字节不变 |
| 损坏/不兼容/无有效基线明确反馈并暂停本实例消费统计/保存，不猜零覆盖；仅下一正常初始化再加载，不自动探测补写，独立 provider 测量不受暂停规则禁用 | `consumption-store.test.ts`：坏 JSON → `load` unusable＋`pauseReason` 有值＋`period()` 无值，`commit` → `paused`，文件字节不变且根目录只剩该文件（无临时／锁残留）；`schemaVersion:2` → 同款；把文件修好后**下一次 `load()`** 才恢复（此前无任何自动写）；`consumption-store.test.ts` 与 `storage-processes.test.ts` 都断言根目录列表只有一个文件＝没有后台探测／补写产物。真实 OMP：`model-cost-store.test.ts` 第一例——初始化读取把坏基线经公共 feedback 报出（level=error、消息含实际文件路径与“暂停”），文件字节不变；第二／三例——可读基线不重写、无文档时不创建。暂停的作用域：`pauseReason()` 只被本 store 的 load／commit 读取，扩展未声明任何 framework State／开关，`storage` 之外没有可被暂停牵连的表面（provider 测量的接线属 provider 工单，本票只交设计边界，见末节） |
| 生产公共存储调用通过真实临时文件和多独立进程验证并发保存、独立读回各 Session/父关系、冲突和坏基线保护；不同 cwd、根及目录别名验证实际位置 | `storage-processes.test.ts` 全部经 `tests/model-cost/support/store-child.ts`：子进程用框架 `findConfigFailure`／`getConfig` 读配置后 `createModelCostRuntime`＋`initialize`＋`store.commit`，走的就是生产入口与 `updateFile`（无内存替身）。6 进程并发各写自己会话→全部 `saved`、7 条记录全在、各自 parent 正确、根目录只剩文档；4 进程同版不同内容→1 saved／3 conflict；坏基线与旧格式→各自报告＋`paused` 且字节不变；不同 cwd／不同根／`~/`／目录链接别名（`store` 与 `store-link` 两种写法）的实际文件位置均以独立字面路径读回，且两种写法落进同一份文档。真实 OMP：`model-cost-store.test.ts` 在同机隔离安装上贯通同一路径的产品代码 |
| 复用公共非阻塞文件入口，不把同步 I/O 包 Promise，不建立消费专属锁或路径配置体系；为后续计费提供真实可初始化、保存和恢复的基线 | `consumption-store.ts` 的写入只有 `updateFile(this.consumptionFile, …)`（`framework/public.ts` 导出的公共入口），模块只 import `node:fs/promises`／`node:crypto`／`node:path`／framework modules／本扩展文件，无 `node:fs` 同步 API、无自建锁、无超时／路径配置项；存储根之外的路径由 `ConsumptionStore` 从根派生（固定文件名），没有第二套路径配置。可初始化／保存／恢复：`load()` → `commit()` → 新实例 `load()` 读回（`consumption-store.test.ts` 第二例），并由多进程与真实 OMP 用例各自确认 |
| 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | 业务用例只 import 生产模块（`ConsumptionStore`／`createModelCostRuntime`／`resolveStorageRoot`／文档函数）与 framework 公共入口，期望值是文件里写出的完整文档、字面路径、字面结果种类与合同常量，没有一处由被测实现生成期望；真实 OMP 用例 assert 的是 harness 自己的 notify 帧与磁盘字节。本票无网络面（HTTP／provider 属 03／12／13），未新增任何网络 test |
| 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作 | 数据／配置／主页／cwd 全在 `mkdtemp` 根下：业务用例不解析真实主目录（`~/` 用探针路径或子进程隔离 home，子进程会先校验 home 再运行）；dock 用例的 home、agent state、session、work、capture 目录都在 run root 下，正式 OMP 安装／配置／会话未被读写。子进程 stderr／退出码、store 结果、真实 harness 帧都被承接；失败用例会打印子进程 stderr 与 plan 结果。本文件即材料准备，末节列出待人工与未验证项 |

## 实际运行命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost` | 45 pass / 0 fail（4 文件，~2.2s）：`storage-root` 6、`consumption-document` 18、`consumption-store` 12、`storage-processes` 9 |
| `bun test tests/harness-dock/model-cost-store.test.ts` | 3 pass / 0 fail（~5.2s，真实隔离 OMP 基线安装已缓存） |
| `bunx tsc --noEmit` | 无输出（通过） |
| `bun test tests/framework/deployment.test.ts` | 14 pass / 0 fail（~5.4s，仓库形状断言已随本票新增入口迁移） |
| `bun test`（全仓） | 600 pass / 4 fail（68 文件，~161s）；4 个失败为既存环境项，与本次改动无关（见下节） |

## 全仓套件

- 本票新增 `entrypoints/omp/model-cost.ts` 与 `extensions/model-cost/`，因此断言仓库形状的 `tests/framework/deployment.test.ts`（C12 入口发现、N8 加载来源互斥）在本票一并迁移：入口集合加 `model-cost.ts`／`model-cost`，绑定标签集合加 `modelCost`，发现计数 2→3、3→4。迁移后该文件 14 pass / 0 fail。
- 全仓剩余的 4 个失败全部是既存环境项，且与 `.cache/full-suite.log` 中早前一次全仓记录完全一致：`tests/connect-bot` 两个用例需要本机 `omp-bot` 面板在 127.0.0.1:8787 运行（本机未运行面板），`tests/harness-dock/baseline.test.ts` 两个用例是本地 `../oh-my-pi` 检出/artifact 与记录不再逐字一致。本票未改动 framework、connect-bot、codebase-tools 的任何产物。

## 本轮注入验证（跑完即恢复，仓库内无注入残留）

| 注入 | 结果 |
| --- | --- |
| `OMP_HOME_SEGMENT` 由 `.omp` 改为 `omp` | `storage-root.test.ts` 2 例失败（默认值与 `~\` 用例）→ 断言能分辨“用户主目录下 .omp” |
| `mergeSession` 同版不同内容改为返回 `unchanged` | `consumption-document.test.ts` 冲突用例失败 |
| `ConsumptionStore` 去掉周期校验 | `consumption-store.test.ts` 另一周期用例失败 |
| `mergeSession` 去掉旧版拒绝 | `consumption-store.test.ts` 旧版用例失败 |
| `commit` 换成无协调的直接读改写（绕过 `updateFile`） | `storage-processes.test.ts` 两个并发用例 3/3 轮失败（根目录只有 1 条并发记录／恰好 1 个冲突的断言不成立）→ 真实多进程确实重叠，且这两条断言能抓住丢失更新 |
| 装配的 `initialize` 改为不调用 runtime | `model-cost-store.test.ts` 第一例失败（无反馈）→ 真实 OMP 用例能抓住“初始化没读取” |

## 平台事实（Windows x64 / Bun 1.4.2，本机本地文件系统）

- `os.homedir()` 在子进程内会跟随 `USERPROFILE`／`HOME`（隔离 home 用例实测：真实 `homedir()` 等于隔离目录，解析出 `<isolated home>/.omp/cost-archive`）。子进程驱动器仍带 `requireUserHome` 自检：home 不符时它只写一份 `home-mismatch` 结果、不做任何解析／创建／写入，因此该用例不可能误写别的主目录。
- 真实 OMP（18.5.0 隔离安装，`--mode rpc --no-extensions -e …`）在 home 指向隔离目录时正常启动并完成一次模型往返（dock 捕获端点，无真实网络）；extension 的反馈以 harness 自己的 notify 帧出现（`model-cost-store.test.ts` 读 `extension_ui_request`／`notify`）。
- 子进程并发确实重叠：6 个 `bun` 子进程在约 400ms 的会合点后各自提交，最慢的写入者仍看到全部先前记录；去掉协调即 3/3 轮失败。

## 未验证／待人工

- 本票 acceptance criteria 的复选框与 `closed` 状态留待维护者确认：实现与自动化检查已按上表完成，逐项支撑见本文件；按 [`docs/agents/triage-labels.md`](../../../docs/agents/triage-labels.md)，`closed` 还要求已合并，故本票文件只标 `in-progress`。
- 本票四条承诺的 Coverage 只含自动项与**条件性** H3（“仅本条真实 OMP 脚本多次失败或成本明显过高才可转人工”）。真实 OMP 贯通已在本票自动执行且通过（`model-cost-store.test.ts`），因此**没有**需要转人工的 H3 项，也没有 H1／H2 项；未确认项不记通过。
- 保存路径在真实宿主里的端到端（round_end 提交合并到 `consumption.json`）不在本票：那需要请求计价／自身累计／Round 事实与 handler 接线（07／08／09／10 等工单）。本票交付的是可初始化、可保存、可恢复的存储基线与其真实多进程安全。
- “独立 provider 测量不受暂停规则禁用”按设计边界验证（暂停是 store 局部状态、只被自身 load／commit 读取、扩展未声明任何 framework State 开关）；provider 模块接入后的跨功能确认属 12／13 工单，本票不代其断言。
- 归档（`archives/<id>.json`）与独立 Codex estimate 文件的本轮业务不在本票（19／14／24 工单）；P52 的完整跨文档测试 owner 为 24。
- 未做：其他操作系统、网络盘／云同步下的多机并发（规格 Out of scope）；本票的并发与锁证据仅覆盖 Windows x64／Bun 1.4.2／本机本地文件系统。
