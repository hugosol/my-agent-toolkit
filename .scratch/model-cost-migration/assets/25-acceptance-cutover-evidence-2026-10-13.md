# 25 — 独立兼容性证据与人工切换交接：自动证据与材料准备

Ticket: [`implementation/25-acceptance-cutover-handoff.md`](../implementation/25-acceptance-cutover-handoff.md)（Delivers **P60**、**P61**、**P62**、**P63**、**P64**）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果：不是支持声明，不是真实 provider 结果，也不是人工验收。**H1／H2 未经用户确认不记通过**；本文件不把绿色套件当作完整迁移认证。

> **本轮为独立最终 retry（2026-10-13，承接 20 的 token-only 余额门控修复）。** 动作：①在 20 的修复落地后的当前树上重跑独立验证（候选记录、`typecheck`、全仓套件、组合 host 持久化），把 §3／§5／§8 的读数刷新为修复后的实测值；②修正候选脚本的一处记录缺陷（§1 最后一行）；③对已被后续票取代的跨票证据理由（15 §88、07、11、14、21）在**原处**加显式 superseded 标注并保留其历史读数（§10）；④H1／H2 状态、H3「无转交」、手动切换／回退清单与支持声明**不变**。本文件不重跑、不改写其他票的既有运行数据。

## 0. 逐 criterion 支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 运行既有独立验证，记录精确宿主版本／revision／artifact、framework／extension 源码 revision、依赖／lockfile／环境和验证范围；正常启动无版本／shape／report 门禁，保留必要配置和业务失败 | §2（行为证明＋结构扫描）、§3（记录字段与记录文件）、§8（实跑命令）；`scripts/verify-omp-candidate.ts` 记录 |
| 从首票起保持独立安装／进程／配置／工作／Session／数据根，本票核对全部验证隔离证据 | §4（机制、19 份证据票声明、本票命令无一条指向正式 OMP、记录自述字段） |
| 汇总必需 tests、本地传输／文件／进程 smoke、OMP 脚本、少量真实 smoke 与 H1／H2，逐项区分通过／失败／跳过／待人工；mock／RPC／发现结果不能认证真实服务或视觉 | §5（分类表）、§6／§7（H1／H2 待人工）、§8（命令与结果） |
| H1 场景及材料来自 P11／P23／P26／P27／P41／P67 对应 delivering tickets；H2 来自 P36／P38／P39／P65／P66，沿合同核对，缺证据不判通过 | §6／§7：六个 H1 与三个 H2 各自指向 11／17／18／20 与 12／13／14 的材料文件与段落，全部记 **待人工**（无一记通过） |
| H3 仅对应合同允许条目的真实 OMP 脚本多次失败或成本明显过高时转交 | §8「H3：无转交项」：各 delivering ticket 记录其条件性 H3 未触发，本票不制造人工项 |
| 全部实现／自动检查先完成再人工轮；准备充分材料后明确列剩余确认 | 本票全部自动工作已在本轮（最终树）完成并重跑（§8）；剩余确认＝§6／§7 的 H1／H2，§10.1 列出的已关闭／已被取代项**不再计入未决清单**（P66 的人工项本身仍在 §7 待确认） |
| 交付用户手动停机／备份／空数据准备／旧新加载互斥／启动／正式确认清单；失败停新实例、保留新数据、恢复旧配置备份后重启，不合并新旧统计 | §9 与 [`extensions/model-cost/README.md#cutover-and-rollback`](../../../extensions/model-cost/README.md#cutover-and-rollback)（六步清单与失败回退） |
| 仅隔离演练切换／回退，不自动迁移／删除旧数据或执行正式切换；维护者按完整证据明确支持，不预造或扩大支持声明 | §9「本票未执行正式切换」与「隔离演练」；§10「支持声明未变」 |
| 具体缺口带脱敏证据请求裁决并记录未决，不静默删功能／缩范围或重开已批准原则扩建假想机制；真实秘密不进入对话、日志或 tracker | §10 第一条（`Balance:` 行模式门控：本票记录并请求裁决，20 的 retry 已按同一条 P8 原则关闭并留证）；本票全程未读取任何凭据，无秘密进入任何输出 |
| 通过批准的生产公共 seam 观察行为，预期来自合同／规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | §2 的用例全部经批准的 adapter／binding 公共 seam 观察，期望是本套件自选字面（`0.0.0-not-a-supported-version`）与支持记录；全仓永久套件的网络均为 mock（`tests/framework/http.test.ts`），真实 loopback 只在 smoke 脚本内 |
| 使用隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，不因计划人工验收暂停可执行工作 | §4＋§8；dock 的等待均有截止（`disposeRun`／`session.stop`），归档名冲突等不可达分支由既有用例覆盖并如实记录（见 24）；本票自动工作未因 H1／H2 等待而暂停 |

## 1. 本票改了什么

| 位置 | 内容 |
| --- | --- |
| [`framework/core/requirements.ts`](../../../framework/core/requirements.ts)（新） | 旧 `core/admission.ts` 的**声明词汇**保留为 verification input：`RequiredSemantic`、`FRAMEWORK_REQUIRED_SEMANTICS`、`DeclarableRequiredSemantic`。版本轴、facts、outcome、process-global 决策全部去掉 |
| `framework/core/admission.ts`、`framework/core/baseline.ts`、`framework/behaviors/admission.ts`（删除） | 旧启动准入路线本体：版本成员判定、unlisted-version 通知、必需语义拒绝、`SUPPORTED_HARNESS_VERSIONS` |
| [`framework/behaviors/binding.ts`](../../../framework/behaviors/binding.ts) | 绑定不再有 admission 参数、判定步骤与通知发布；保留配置校验、声明/实现配对与初始化失败 |
| [`framework/core/protocol.ts`](../../../framework/core/protocol.ts)、[`framework/core/assembly.ts`](../../../framework/core/assembly.ts)、[`framework/adapters/omp.ts`](../../../framework/adapters/omp.ts)、[`framework/public.ts`](../../../framework/public.ts) | 去掉 `required-semantics` 失败种类与 `describeBindingFailure` 分支；`OmpSdkSurface.VERSION` 与 `reportedVersion`／`missingRequiredSemantics` 观察函数删除；`requiredSemantics` 文档改为 verification input |
| [`tests/framework/startup-requirements.test.ts`](../../../tests/framework/startup-requirements.test.ts)（新，10 例） | 正常启动无版本／shape／report 门禁的行为证明；保留的配置／业务失败；结构性扫描（生产源码不再命名旧路线符号，也不读候选验证记录） |
| [`tests/framework/support/harness-port-double.ts`](../../../tests/framework/support/harness-port-double.ts) | port double 去掉 `version`／`missingRequiredSemantics`／`requiredSemantics` 选项 |
| 删除的旧用例 | `tests/framework/admission.test.ts`、`admission-notice.test.ts`、`admission-process-decision.test.ts`、`admission-module-copy.test.ts`、`tests/connect-bot/admission-refusal.test.ts`、`tests/harness-dock/fixtures/admission-probe/`、`tests/harness-dock/fixtures/admission-notice-peer/` |
| [`tests/harness-dock/fixtures/second-extension/entrypoint.ts`](../../../tests/harness-dock/fixtures/second-extension/entrypoint.ts)（新） | 承接 `model-cost-headless.test.ts`「同进程第二个扩展」用例：一个只声明身份、绑定即写一行 stderr 的最小扩展（原用例借用的 admission probe 已随路线删除） |
| [`scripts/verify-omp-candidate.ts`](../../../scripts/verify-omp-candidate.ts) | 记录补齐 P60 要求的报告面：revision anchor、源码 revision（base commit ＋ 工作树 digest ＋ 变更路径）、lockfile 比对、运行环境、执行与未覆盖范围；`certification` 文案去掉已删除的 `SUPPORTED_HARNESS_VERSIONS`。**本轮 retry 修正**：`source.changedPaths` 由 `git status --porcelain` 逐行切列而来，而 `gitText` 的 `.trim()` 会吃掉第一行的状态列，把第一个变更路径写成缺一个字符的名字（此前记录为 `LOSSARY-MAP.md`）；改为 `.trimEnd()`（只去尾部换行），现记为 `GLOSSARY-MAP.md`。`workingTreeDigest` 取自 `git ls-files` 清单＋逐文件 sha256，不受该修正影响 |
| [`extensions/model-cost/README.md`](../../../extensions/model-cost/README.md)（新） | model-cost 的**人工验收 runbook**（H1／H2 逐项场景与已备材料）与**手动切换／回退清单**（P63） |
| 文档同步 | `framework/README.md`（布局、H4、升级步骤 4、model-cost 验收轮指引）、`framework/docs/harness-support.md`（cutover 已实施）、`framework/docs/framework-capabilities.md`（声明要求章节、失败种类、no supported-version）、`framework/GLOSSARY.md`（Declared requirement／Independent compatibility verification）、根 `README.md`（contexts 表与脚本索引） |

**没有**新增 DI／扫描／注册体系或第二套验证框架：验证入口仍是既有 dock 与候选脚本，且删除的「有意义检查」由已有的 dock 用例（真实隔离宿主上的 session／round／history 行为）承担。

## 2. 旧启动门禁的清 cutover（P60）

原路线＝**版本成员判定＋一次性通知＋必需语义拒绝**三件事；现在生产启动**三件都没有**：

| 观察 | 证据 |
| --- | --- |
| 报告一个不在支持记录里的版本（本票自选字面 `0.0.0-not-a-supported-version`，与记录里的 `18.5.0` 独立比对）仍正常绑定、注册，UI／stderr／会话条目／请求贡献里没有任何版本判定 | `startup-requirements.test.ts`「a version outside the recorded support set binds and is reported on no channel」 |
| 表面完全不报告版本时同样不判定 | 同文件「a surface that reports no version at all is not judged either」 |
| 表面缺少 append-only 记录路径（旧行为下必然拒绝）时仍绑定并注册 | 同文件「a surface without the append-only recording path still binds and registers」 |
| 声明 `session-lifecycle-events`／`round-lifecycle-events` 的**部署 assembly**（connect-bot）在无法生命周期订阅的表面上不再被「必需语义」拒绝：失败的只是注册本身（`registration failed`），且不出现任何语义 verdict | 同文件「a declared semantic the surface cannot honor is metadata, not a refusal」 |
| 声明与否不影响绑定结果（同一 harness、同一注册序列、无通知） | 同文件「an assembly may state the semantics it depends on, and nothing judges the statement」 |
| 生产源码（framework／extensions／entrypoints）不再命名 `SUPPORTED_HARNESS_VERSIONS`、`announceUnlistedVersion`、`unlisted-version`、`required-semantics`、`missingRequiredSemantics`、`admit`，也不读 `candidate-verification` 报告 | 同文件「the removed startup route is absent from production source」两例 |

**保留的必需处理**（不得随门禁一起删掉）由同文件三例与既有套件继续守着：非法声明的配置在注册前拒绝（`configuration`）、声明了实现却未注入时整票拒绝（`initialization`）、绑定只做注册（不跑命令、不写条目、不画区域）。配置与文件语义的完整覆盖仍在 [`tests/framework/config.test.ts`](../../../tests/framework/config.test.ts) 与 `files.test.ts`。

red→green 事实：本票先写 `startup-requirements.test.ts` 并运行，得到 **5 pass / 4 fail**（版本通知、缺 append 路径、声明语义、结构扫描四例失败）；完成 cutover 后 **10 pass / 0 fail**。

## 3. 精确 artifact／revision／依赖／环境与验证范围（P60）

| 事实 | 值 | 来源 |
| --- | --- | --- |
| 宿主版本／revision anchor／artifact | `@oh-my-pi/pi-coding-agent@18.5.0`；checkout `9348320cc4a30a7195d36a1f05a6c11bcb701a17`（`v18.5.0`）；隔离精确安装 `.cache/omp-baseline/18.5.0`（含预编译 win32-x64 native） | [`framework/docs/harness-baseline.json`](../../../framework/docs/harness-baseline.json)；本票记录 |
| 冻结宿主补丁组合（人工轮使用） | `viewed-session` ＋ `codex-response-boundary` 两 patch 链，9 个文件 pre/post sha256 记于 [`host-patches/omp-18.5.0-viewed-session-codex-response/record.json`](../../../host-patches/omp-18.5.0-viewed-session-codex-response/record.json) | 24 产物，本票只引用 |
| 本仓库源码 revision | base commit `b48bb63b9d3b4802b883e4775524ef6bb0a525b4`；**工作树 dirty**（`git status --porcelain` **167** 条路径），工作树 digest `015be455e2782f11c53bb545c15d0fde3d5bc9670fe4ae712205839157d0dbaf`（记录 `recorded` ＝ `2026-10-13T10:45:05.367Z`；首个变更路径现记为 `GLOSSARY-MAP.md`，见 §1 末行的脚本修正） | 候选脚本记录 `source` 字段（本票本轮在 20 的修复后的最终树上写出）；**未提交事实如实记录，不把 HEAD 当作已实现源码，也不自动 commit** |
| 依赖／lockfile | 本仓库 `bun.lock` sha256 `9e9f4833…` **matches**；oracle `my-omp-toolkit` 的 `bun.lock` sha256 `ddf372c5…` **matches** | 候选脚本记录 `lockfiles` 字段（`verifyLockfile`） |
| 环境 | `win32 x64`，Bun `1.4.2`，无 native 构建（用预编译包） | 候选脚本记录 `environment` 字段 |
| 验证范围（本次实际执行） | 记录内该次运行执行：`bun test tests/framework`（**351／0**，1752 expect，29 files，33.94s）；同一次 retry 本票另行执行（§8）：model-cost／connect-bot／codebase-tools／harness-dock 分区、组合 host 持久化、两个本地 smoke、`typecheck`、全仓 `bun test`。记录内 `coverage.unverified` 明列：dock 套件、扩展行为套件、真实 provider 请求、交互 TUI、patched Viewed session 宿主 artifact 的人工运行 | `.cache/omp-baseline/18.5.0/candidate-verification.json`（`coverage.executed`／`coverage.unverified` 字段） |

记录文件本身：`.cache/omp-baseline/18.5.0/candidate-verification.json`（gitignored；本票本轮写出**两次**：先在本轮改动后的树上运行（`recorded` `2026-10-13T10:33:14.146Z`，digest `c4f0e51abcdd7ecb92ad245e7ef0d05dc8830eed3434567f090c587ecc54846e`），再在全部证据文档编辑完成后重跑（`recorded` `2026-10-13T10:45:05.367Z`，digest 见上表），使记录与被验证的那棵树一致）。记录写出之后本票只改动**证据文档**（本文件与 §10.1 标注的 15／07／11／14／21 资产），生产源码与测试一字未动。**它不是启动门禁**：没有任何生产模块读它（见第 2 节扫描），它只是维护者决策输入。

本轮重点文件的 sha256（独立于 `workingTreeDigest` 的算法，可逐文件复核；写出记录后未再改动）：

| 文件 | sha256 |
| --- | --- |
| `scripts/verify-omp-candidate.ts` | `ff8cc4be03a908ec04e8361d077880fde70397af9a309c2caab1b60a6dd9c38e` |
| `extensions/model-cost/harnesses/omp/widget.ts`（20 的门控修复所在） | `4363e342f938f1aef27b69791bce55f1e082c593ddda3534b8b3275e7c26074e` |
| `tests/model-cost/widget-visual.test.ts`（S2 回归） | `f46ab5f3c147ea09720d21f6a204b3b52cd7a103f41a54ac78aeaaf87e2fb9df` |
| `tests/harness-dock/model-cost-modes.test.ts`（S5 回归、真实 patched 宿主） | `c240ebf4ae333a8aef57b28df5eff4716062f03086b4db0777a1b675ab90c9dc` |
| `tests/harness-dock/model-cost-persistence.test.ts`（组合 host 持久化） | `53bd6b501de045f499994c52c710ceb5a901b8ec188ab112506bed09ee59c43c` |

## 4. 隔离证据核对（P61）

- **机制（自首票起同一套）。** dock 把一次性精确安装放在 gitignored 的 `.cache/omp-baseline/<version>`；每个用例／脚本 `createRunRoot` 造临时 run root（`agent-state`／`sessions`／`work`／`captures`）与 `mkdtemp` 的隔离 home；启动子进程前剥掉解析偏移量（`OMP_PROFILE`、`PI_PROFILE`、`OMPCODE`、`PI_CONFIG_FILES`、`XDG_*`、`PI_CODING_AGENT_DIR`、`OMP_AUTH_BROKER_*`）并把 `PI_CODING_AGENT_DIR` 指向该临时目录（[`tests/harness-dock/env.ts`](../../../tests/harness-dock/env.ts)、`run-root.ts`、`agent-config.ts`）。
- **各证据票的隔离声明**：19 份 implementation 证据（03、04、06、07、08、09、10、11、12、13、15、16、17、19、20、21、22、23、24）各自记录「未触碰正式 OMP／未重启／未改配置／未使用真实凭据」，本票沿同一机制运行并**逐票引用而不改写**。存储根证据另见 24（组合 host 上的真实 loader／RPC／磁盘读回）。
- **本票自己运行的命令没有一条指向正式 OMP**：`bun test ...`（含本轮 retry 的 `tests/framework`／`tests/model-cost`／`tests/connect-bot`／`tests/codebase-tools`／`tests/harness-dock`／`tests/harness-dock/model-cost-persistence.test.ts` 与全仓）、`bun run typecheck`、`bun run smoke:http-transport`（全部 loopback 目标与代理）、`bun run smoke:model-cost-data`（纯数据校验）、`bun scripts/verify-omp-candidate.ts`（含 `--dry-run`；只写 `.cache/omp-baseline/18.5.0/`）。没有向正式实例发验证命令、没有重启、没有改配置／加载列表／凭证，也没有使用任何真实统计。
- **凭证例外未使用**：本票没有读取任何凭证文件、没有发出真实 provider 请求；`13` 票交付的 Codex 真实 headers 通道与 `12`／`14` 的真实读数材料仍是人工项。
- **记录的隔离自述**：候选记录 `isolation` 字段为 `prefixUnderIsolatedBase: true`、`defaultGlobalInstallTouched: false`、`formalConfigurationTouched: false`、`runningAgentTouched: false`、`agentState: "temporary directory per run (dock)"`。

## 5. 逐项结果（通过／失败／跳过／待人工）

| 类别 | 项 | 结果 |
| --- | --- | --- |
| 必需 tests | `bun test tests/framework` | **PASS**（脚本内隔离运行 351／0，1752 expect，29 files；本轮两次运行 33.49s／33.94s，后者即最终记录；见第 3 节） |
| 必需 tests | `bun test tests/model-cost` | **PASS**（267／0，1163 expect，22 files，3.09s；＝本票首轮 266 加 20 的 retry 新增 1 例回归） |
| 必需 tests | `bun test tests/connect-bot` | **PASS**（142／0，689 expect，18 files，76.47s；比 24 记录少 2 例＝本票删除的 `admission-refusal.test.ts`） |
| 必需 tests | `bun test tests/codebase-tools` | **PASS**（24／0，334 expect，7 files，42.70s） |
| 必需 tests | `bun test tests/harness-dock` | **PASS**（80／0，882 expect，22 files，129.71s：真实隔离安装上的 loader／RPC／真实存储文件；含本票改过的 `model-cost-headless.test.ts`「同进程第二个扩展」用例，以及 24 的组合 host 真实持久化文件 `model-cost-persistence.test.ts` **4／0**，87 expect，11.29s 单跑） |
| 必需 tests | `bun test`（全仓） | **PASS**（**864 pass / 0 fail**，98 files，4820 expect，292.25s；= framework 351 ＋ connect-bot 142 ＋ codebase-tools 24 ＋ model-cost 267 ＋ dock 80） |
| typecheck | `bun run typecheck` | **PASS**（0 errors，含 tests 与 scripts） |
| 本地传输 smoke | `bun run smoke:http-transport` | **PASS** 18／18（真实 loopback 目标／HTTP＋HTTPS 代理／CONNECT 隧道／环境陷阱 0 请求／超时覆盖正文／非 2xx／拒绝选代理不回退直连；**不出本机、无真实服务**） |
| 本地数据 smoke | `bun run smoke:model-cost-data` | **PASS** 20／20（批准名单、谷价、共享峰价系数、北京时间窗口、币种 CNY） |
| OMP 脚本（独立验证入口） | `bun scripts/verify-omp-candidate.ts`（真实隔离安装上驱动真实 loader 的框架套件） | **PASS**，`regressionAlarm: green`；记录见第 3 节 |
| 真实 smoke（少量、自主） | 本票**未执行**（0 条）：没有读取凭证、没有真实 provider 调用 | **跳过**（如实记录；不是失败） |
| H1（真实交互 TUI） | 6 项，逐项见第 6 节 | **待人工**（未确认不记通过） |
| H2（真实 provider 效果） | 3 项，逐项见第 7 节 | **待人工**（未确认不记通过） |
| H3（条件性脚本转人工） | 0 项，见第 8 节 | **无转交**（无则无） |

**证据类别不互换**（P62）：mock／RPC／发现结果只证明各自 seam 的语义；真实服务效果与视觉仍由 H1／H2 的人类判断持有，本表不复述为已通过。

## 6. H1 清单（真实交互 TUI 的最终判断；材料来自对应 delivering ticket）

| Promise | delivering ticket 与材料 | 本票核对 |
| --- | --- | --- |
| P11 实际 Effort 可见性 | 16：[`16-viewed-session-total-evidence`](16-viewed-session-total-evidence-2026-10-13.md) §5（隔离步骤、逐字期望、自动对照） | 材料在位；status **待人工** |
| P23 主 detail 静态代理树、无 Round 行 | 17：[`17-detail-tree-view-preference-evidence`](17-detail-tree-view-preference-evidence-2026-10-13.md) §5 | 材料在位；status **待人工** |
| P26 子代理查看自身 context／Round、固定 brief、返回恢复主偏好 | 17：同上 §5（+ `tests/harness-dock/detail-tree.test.ts` 的真实宿主断言） | 材料在位；status **待人工** |
| P27 唯一 Marker area 跟随 Viewed session | 18：[`18-viewed-state-marker-evidence`](18-viewed-state-marker-evidence-2026-10-13.md) | 材料在位；status **待人工** |
| P41 单一峰谷边界 timer 重绘当前目标 | 20：[`20-tui-boundary-timer-evidence`](20-tui-boundary-timer-evidence-2026-10-13.md) §5.2 | 材料在位；status **待人工** |
| P67 批准视觉、告警与窄宽降级 | 20：同上 §5.2–5.3（逐字期望与颜色对照）＋ §9（`Balance:` 行现在只属于 monetary 通道：token-only／allowance 视图不画该行） | 材料在位；status **待人工** |

执行入口与隔离步骤见 [`extensions/model-cost/README.md#h1--the-real-interactive-tui`](../../../extensions/model-cost/README.md#h1--the-real-interactive-tui)（使用冻结组合 artifact `.cache/omp-baseline/18.5.0-viewed-session-codex-response`）。**截图／录屏在本环境不可获得**（无交互 TUI），如实说明而不伪造。

## 7. H2 清单（真实 provider 效果的最终判断）

| Promise | delivering ticket 与材料 | 本票核对 |
| --- | --- | --- |
| P36／P38 DeepSeek 真实余额与 TTL 效果 | 12：[`12-deepseek-balance-ttl-evidence`](12-deepseek-balance-ttl-evidence-2026-10-13.md)「H2 材料」（脱敏结果或跳过原因＋正常 usage 观察方法） | 材料在位、通道已交付并在隔离宿主上验证；真实账户读数 **待人工** |
| P39／P65 真实 Codex headers 与 5h／7d 最终效果 | 13：[`13-codex-windows-headers-evidence`](13-codex-windows-headers-evidence-2026-10-13.md)「H2 材料」（跳过原因已从「通道缺失」改为「可观察但尚未观察真实账户」） | 材料在位；**待人工** |
| P66 真实 ratio／left 正常使用效果 | 14：[`14-codex-ratio-estimate-h2`](14-codex-ratio-estimate-h2-2026-10-13.md) §3（手算序列期望，独立于实现） | 材料在位；**待人工**（不为凑样本消耗额度；样本不足如实待确认） |

沿合同核对：三条 H2 都只要求「少量真实冒烟／正常使用观察」，不要求凭证回写、登录或改变正式配置；本票不新增豁免，也不把 mock／RPC 结果当作真实服务证据。

## 8. H3 与本次实际命令

**H3：无转交项。** 合同只允许「真实 OMP 脚本多次失败或成本明显过高」时转人工；各 delivering ticket 均记录其条件性 H3 未触发（11、16、17、18、19、20、21 等票的 evidence 末节「无则无」），本票不复述、不制造人工项，也不因计划中的人工验收暂停任何可执行工作。

本轮（20 的余额门控修复落地后，retry 在**最终树**上）实际运行的命令与结果：

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 0 errors（TS 7.0.2，含 tests 与 scripts；本票本轮在最终树上重跑） |
| `bun test tests/framework/startup-requirements.test.ts` | 10 pass / 0 fail（47 expect，49ms；red 阶段为 5 pass / 4 fail，见第 2 节） |
| `bun test tests/framework` | 351 pass / 0 fail（1752 expect，29 files；33.94s＝最终记录，另一轮 33.49s；由候选脚本在隔离安装上运行） |
| `bun test tests/model-cost` | 267 pass / 0 fail（1163 expect，22 files，3.09s） |
| `bun test tests/connect-bot` | 142 pass / 0 fail（689 expect，18 files，76.47s） |
| `bun test tests/codebase-tools` | 24 pass / 0 fail（334 expect，7 files，42.70s） |
| `bun test tests/harness-dock` | 80 pass / 0 fail（882 expect，22 files，129.71s） |
| `bun test tests/harness-dock/model-cost-persistence.test.ts` | 4 pass / 0 fail（87 expect，11.29s；组合 host 上的真实生产写出／独立校验／重启恢复） |
| `bun test`（全仓） | 864 pass / 0 fail（98 files，4820 expect，292.25s） |
| `bun run smoke:http-transport` | SMOKE SUMMARY: 18 passed, 0 failed, 0 observation(s) |
| `bun run smoke:model-cost-data` | SMOKE SUMMARY: 20 passed, 0 failed, 20 checks |
| `bun scripts/verify-omp-candidate.ts --dry-run` | 打印解析结果（版本／支持记录／隔离前缀／套件／记录路径／隔离声明）；未安装、未运行任何套件 |
| `bun scripts/verify-omp-candidate.ts` | 隔离安装 18.5.0；框架套件 351／0；`regressionAlarm: green`；写 `.cache/omp-baseline/18.5.0/candidate-verification.json`（字段见 §3） |

## 9. 交付给用户的手动清单（P63）与隔离演练

- **清单**：[`extensions/model-cost/README.md#cutover-and-rollback`](../../../extensions/model-cost/README.md#cutover-and-rollback) 交付停机 → 备份正式配置与旧统计（`~/.omp/cost-archive` 整目录）→ 空数据准备（清空或改指 `storageDir`，说明新旧同名 estimate 文件为何必须先清）→ 加载互斥（`entrypoints/omp` 新根 ＋ 去掉被取代实现）→ 启动与逐项确认 → 失败时停新实例、保留新数据、恢复配置备份后重启、不合并新旧统计。共享步骤在 [`framework/README.md#h3--permanent-cutover-and-cutover-smoke`](../../../framework/README.md#h3--permanent-cutover-and-cutover-smoke)。
- **本票未执行正式切换**：没有停止正式实例、没有备份或改动正式配置与统计、没有删除或迁移旧数据，也没有自动切换支持声明。
- **隔离演练（已做／不可做）**：
  - 已演练：新扩展在**隔离精确安装**上经真实 loader 绑定并按 new root 写全新文档（`tests/harness-dock/model-cost-*`、24 的组合 host 持久化用例）；**旧新加载互斥**在同一隔离安装上由 [`tests/framework/deployment.test.ts`](../../../tests/framework/deployment.test.ts) 的 `load-source mutual exclusion (N8)` 四例证明（显式根只见本仓库实现、loader 不按名去重、两源同时在发现范围内会都绑定）。
  - 不可在本环境演练：对「正式实例」的停机／备份／恢复流程本身，以及真实账户下的效果（H1／H2）。不伪造这两类结果。

## 10. 缺口与限度（P64）

### 10.1 已关闭／已被取代（本轮 retry 刷新；全部在原处留证，历史读数不改写）

- **`Balance:` 行模式门控缺口：已由 20 的 retry 按批准范围关闭（不是新裁决：P8「token-only 只提供批准的 usage 展示」本就要求如此），本轮在该修复后的同一棵树上重跑了读数。** 本票记录时的状态（承 20 §7）：widget 在任何模式下只要进程持有读数或失败就画余额行，而规格 §134 明确 `token-only` **没有**「官方峰谷／holiday 价格与余额」；本票当时不改功能、如实记录并请求裁决。20 的 retry 随后把门控收回 `widgetLayout`（`display.mode === "monetary"` 才画，`presentation.balance()`／预取／成功 TTL／在途合并／失败保旧值／进程级缓存原样运行，混合主树的 Cost／Ref 未删），并新增两例回归：S2 `tests/model-cost/widget-visual.test.ts`（同进程持有读数时 token-only／allowance／hidden 均无 `Balance:` 行，切回官方仍画出且 `/user/balance` 调用数恒为 1）与 S5 `tests/harness-dock/model-cost-modes.test.ts`（真实宿官方→Go→官方：Go 帧无 `Balance:`、`balanceCalls()` 恒为 1、back 恢复 `¥110.00`）。两例在缺陷形态下都会失败（20 已注入验证并恢复）。材料见 20 的 [`资产第 9 节`](20-tui-boundary-timer-evidence-2026-10-13.md)。**本轮 retry 已重跑该修复后的读数**：`tests/model-cost` **267／0**、`tests/harness-dock` **80／0**（含该 S5 例）、全仓 **864 pass / 0 fail**、`tsc --noEmit` exit 0（§5／§8）——即 20 报告的计数在本轮独立复现；首轮的 266／862 读数已由 §5／§8 的新值取代（原文保留在 §5／§8 的对应行说明里）。**结论：缺口已关闭并留证；待人工的仍只有 §6／§7 的 H1／H2。**
- **跨票证据里已被取代的理由与缺口：本轮在各自原处加显式 superseded 标注，不改写其历史命令与读数。** 逐条：
  - [`15`](15-provider-init-auth-lifecycle-evidence-2026-10-13.md) **§88**：以「余额行在 widget 中不限模式显示」解释「宿主无法鉴权时不记余额 failure」的对称性差异——该**理由**随 20 的门控修复（20 §9）不再成立，15 交付的**行为**（零出站、不记 failure；Codex account 记 `no-access`）未变，已在原处标注 superseded 并保留其全部运行读数。
  - [`07`](07-request-price-accounting-evidence-2026-10-13.md)：记录过「真实 RPC 会话不派发 `round_end`，故 Round 提交在真实宿主不可观察」（第 89／99 行，当时记作需要裁决的既有 gap）。该限度已被 24 的组合 host 实测关闭（两次 prompt 各自落盘 `saveVersion >= 2`，24 亦在其材料里写明「07 evidence 的旧限度已被取代」）；已在原处标注 superseded。
  - [`11`](11-modes-currency-metrics-evidence-2026-10-13.md) **第 66 行**：记录过「Codex 参考金额／比例的价源当前不可达，纯 Codex 会话不会出现 `Ref:`」。该缺口已由当前 adapter 的 host catalog 映射关闭——生产证据是 `tests/harness-dock/model-cost-modes.test.ts` 的 allowance 例（真实 patched 宿主，run 自己的 `models.yml` 四桶价对 run 自己的读数，手算 `Ref: $0.0050`）与同一文件的「先 CNY 后切 Codex」例（`Cost: ¥0.0055` ＋ `Ref: $0.0050` 并列）；已在原处标注 superseded。
  - [`14`](14-codex-ratio-estimate-h2-2026-10-13.md) **§4 第 4 步**：写明「录制的基线上真实 Codex Turn 不携带 HTTP 响应事实」。这仍是**未打补丁基线**的性质；在冻结的 Codex 响应边界补丁（13 的 `model-cost-codex-quota.test.ts`，以未打补丁安装作对照）与 24 的组合 artifact（`model-cost-persistence.test.ts` 断言 settled Codex Turn 带响应自身 headers）上不再成立；已在原处标注 superseded，且明确 **P66 的人工项本身仍待用户确认**。
  - [`21`](21-headless-rpc-feedback-evidence-2026-10-13.md) **§7／§8**：记录的全仓 5 条失败（2 项 `baseline` anchor 漂移 ＋ 3 项 connect-bot，其中含 `native-session-boundary.test.ts` 命中 `extensions/model-cost/harnesses/omp/widget.ts` 的**跨票缺口**）在当前工作树里都已消失——2 项由 24 改比对「记录 revision 自身的 blob 字节」关闭，其余由 22 的改动与工作树修好（24 如此记录、不认领其修法），另一项 balance ENOENT 由 24 容忍原子发布瞬态且未再复现；已在原处标注 superseded。**本轮实跑复核：全仓 864 pass / 0 fail、`tests/connect-bot` 142 pass / 0 fail。**

### 10.2 仍然未决（本票的代理工作完成不等于这些项通过）

- **真实 provider／视觉**：全部为 H1／H2 待人工（第 6、7 节）；本票的自动结果不能认证真实服务可用或视觉正确。
- **支持声明未变**：仍为 `18.5.0 (@9348320) + win32-x64 + Bun 1.4.2`；组合 host artifact 是本地补丁 artifact，未并入上游，也不更改支持记录。人工轮通过后是否更新支持声明由维护者显式决定。
- **源码 revision 是 dirty 工作树**：§3 的 digest 与变更路径取自候选记录 `source` 字段（本票未 commit 任何文件）。记录写出后本票只改动证据文档（本文件与 §10.1 标注的 15／07／11／14／21 资产，皆非生产源码）；如涉及提交，须重新生成 digest 再引用。
- **观察到的偶发项（首轮记录；本轮两次全绿运行均未复现）**：首轮一次 `bun test tests/framework` 整目录运行中，`files.test.ts` 的「republishing a document never shows a reader a partial one」出现一次 inode 复用断言失败；该文件单跑 17 pass／0 fail，隔离脚本的框架套件 351 pass／0 fail，首轮最终全仓 862 pass／0 fail，均无该失败。**本轮 retry**：`tests/framework` 351／0（候选脚本内，1752 expect）与全仓 864 pass／0 fail 也都没有该失败。如实记录，未为掩盖而放宽断言。
- **既有文档断链（非本票引入；本轮实测复查）**：`framework/README.md`、`framework/docs/harness-support.md`、`framework/docs/framework-capabilities.md`、根 `README.md` 中共 **8 处**引用指向已不存在的目录 —— `.scratch/codebase-tools-omp-v1/…` 与 `.scratch/connect-bot-migration/…`（当前 `.scratch/` 下只有 `model-cost-migration/` 与 `omp-probe/`）；同一批链接里的 oracle 路径 `../my-omp-toolkit/extensions` 本身存在。本票只核对并修复自己改动文本中的链接（新增与改动的两处文档全部解析通过），不改写这些历史出处、不为此新建链接检查脚本或门禁，如实记录待裁决。
- **票状态**：本票的自动工作已在本轮完成、剩余项全为**人类动作**（§6／§7 的 H1／H2 轮与 §9 的手动切换／回退），故 `implementation/25-acceptance-cutover-handoff.md` 的 `Status:` 由 `ready-for-agent` 改为 **`ready-for-human`**（triage 词汇：剩余部分需要人执行）。**这不等于本票整体通过**：验收复选框未勾选，H1／H2 未获确认。
- **本票不触发任何 retro／不等待它**；P58／P52 的具名责任仍在 22／23／24，本票只运行其分区并如实记录。

## 11. P58／P52 中本票的具名责任

- **P58（消费者迁移后协议／State／prompt／历史与效果不变）**：本票**不改** `extensions/connect-bot/**`、`extensions/codebase-tools/**` 的任何生产源码、配置或消费者可见协议；自动 coverage 仍是 22（connect-bot）与 23（codebase-tools）的分区，本票只运行它们并记录结果（142／0、24／0）。**P58 没有任何无条件人工门禁**：合同里它只有原本的条件性 H3，本票不新增「用户确认」类门禁，也不把它列进 H1／H2。
- **P52（持久文档只含批准 schema 与独立 estimate）**：本票**不改** `extensions/model-cost/shared-logic/consumption-*.ts`、`codex-estimate-store.ts` 的 schema、`schemaVersion`、`periodId` 或归档语义；该承诺的自动 owner 仍是 24（组合 host 上的生产写出／独立 schema 校验／重启恢复），本票只运行 `tests/harness-dock`（80／0，含 24 的 `model-cost-persistence.test.ts` 4／0）与 `tests/model-cost`（267／0）并记录，不重复认领其业务用例。
- **宿主贯通**：本票适用的宿主贯通是「真实隔离安装的 loader／RPC 上绑定并落盘」——由 dock 套件与候选脚本承担（§5、§8）；它不替代真实 provider 与视觉的人工确认。
