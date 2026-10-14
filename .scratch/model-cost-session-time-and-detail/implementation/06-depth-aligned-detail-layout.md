# 06: 按树深度对齐与窄终端布局

**What to build:** detail 的子代理名称、启动模型、思考强度、累计运行耗时和原有保留统计字段，在同一树深度内纵向对齐；不同深度独立列宽。缺失值不挤走后续列，中文、颜色、长文本和窄屏均保持组内一致布局，完整保存数据不受显示缩略影响。

**Delivers:** P30, P31, P32, P33；P24 的布局覆盖项。

**Test owner for:** P24 的本票覆盖项；其他变化与组合路径由 01/02/05/07 各自负责，全部覆盖项完成才完成整个 Promise。

**Blocked by:** 02 — 子代理原生运行耗时的累计与落盘；03 — 正确任务名称与不可变启动快照；05 — 移除 Sum，保留消费字段语义。

**Status:** in-progress（实现、自动化检查、真实终端设备证据与集成分支 tip 的合入已完成；仅 P33 的可读性判断留给用户，关闭待父级验收）

Source: [approved contract](../contract.md) · [spec](../spec.md)

## Acceptance criteria

- [ ] P30：同深度不同名称长度、同深度不同父代理均共享字段起始显示列；孙代理及更深层级各自独立列宽，不按直接父节点拆对齐组，不用全树单一网格。
- [ ] P30：保留静态 Agent tree、实际直接父关系、深度及一 Session 一条逻辑记录；不增加聚合节点、展开操作、代理查询或重新排序。
- [ ] P31：同深度交错缺模型、思考强度、耗时或上下文时保留列槽和正确占位，后续字段不左移；分别检查字段起始终端显示列。
- [ ] P32：中文／ASCII 混合名称、有／无主题颜色的实际输出按终端显示宽度对齐，不用字符串字符数替代；提供真实终端输出证据。
- [ ] P33：长名称与长模型必要时带省略标识；缩略仍无法容纳时，同深度组统一采用续行布局，不让各行独立自动换行破坏对齐。宽度改变后重新绘制仍符合组内布局。
- [ ] P33/P24：自动检查统一续行、列位置、resize 结果、保留字段读数和实际 JSON 中完整名称／模型／启动事实；缩略或续行不得改变完整数据或业务数值。
- [ ] 完成自动化布局检查、所属分区与受影响消费者、TypeScript typecheck 和实际终端 smoke；准备中文、长名称／模型、多层级、不同父节点、缺失字段以及宽窄终端证据，逐项记录实际观察宽度。
- [ ] 最终交付明确列出 P33 尚待用户确认的实际省略／续行可读性及已准备证据。用户确认前只此人工判断保持未验证；实现、所有自动检查和其他可执行票据不因此暂停。

## Coverage partition owned here

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P24 | 对齐、缩略、续行及 resize 不改变读数和完整数据 | 06 | 06 |

## Boundaries

使用 S2 实际 widget 和 S3 完整保存值观察；共享业务展示结果与宿主绘制的职责边界保持不变。确切列标题、单位、阈值和布局算法为实现自由。不要求不同深度、Total、主会话 model 行与子代理行共用列宽，不改 omp 或新增补丁，不建立新交互或持久化显示偏好。P33 自动部分及证据归本票，human-led 可读性由用户判断。

## Execution record（agent，2026-10-14）

分支 `hyper/model-cost-session-time-and-detail/06-depth-aligned-detail-layout-21acbd-e5951e40ed62`：实现提交 `3a660ee`，集成分支 tip `d05703d` 合入为 `ce58ade`（无冲突，GLOSSARY.md 自动合并）。仅本地 Git。

**实现**：detail 子代理行由前端按「同 depth + 同行种类」分组为列网格（`extensions/model-cost/harnesses/omp/widget.ts`）：组内每列取组内最宽单元格，字段以字段标识对齐（行缺失的字段保留该列空白），不同 group 无共同列宽；列宽按终端显示列计（东亚宽字符 2 列，零宽 0 列，导出 `textColumns`）；宿主给出宽度时先按组统一缩略（名称／模型值带 `…`，标签保留），仍不足则整组在该组字段起始列按同一断点续行，续行只画字段、名字仅出现一次；所有缩略／续行只作用于绘制，共享展示结果与 JSON 不变。共享侧只新增导出 `fieldsColumns`（原有的列投影），行为未变；`fieldsText` 因不再有消费者删除。

**自动化证据**（`tests/model-cost/detail-layout.test.ts`，7 用例、138 断言，期望列全部手算）：

| 验收项 | 覆盖用例 | 观测到的实际列（fixture：depth1 名称列 14、depth2 名称列 10） |
|---|---|---|
| P30 同深度共享字段起始列；不同父代理同组；不同深度独立 | 「the same depth's rows align…」 | depth1：Model 19 / Effort 49 / Cache 63 / Cost 75 / Run 88；depth2：Model 18 / Effort 48 / Cache 64 / Cost 76 / Ctx 89 / Run 115；两组互不相等；行序＝树序（不因分组重排） |
| P30 保留静态树、直接父关系、深度、一 Session 一行 | 同上 | 树行 6（根 + 1 model 行 + 4 session 行），名称序列 `[检索定价核查表, a, pricing-scan, 孙子代理乙]` |
| P31 缺模型／强度／耗时／上下文保留列槽 | 「a field a row has none of keeps its own column」 | 缺 Cost 的行 Run 仍在 88（`Cache: 40%` 后 15 空格），非 75；缺 Ctx 的行 Run 与有 Ctx 行同列；`?` 行与已证行 Model/Effort/Cache/Run 同列 |
| P32 中文与主题颜色按终端显示宽度 | 「columns are terminal columns…」 | 7 个中文字＝14 列（字符数方案会是 17）；5 个中文字＝10 列（字符数方案会是 13）；带主题绘制的可见输出与无色输出逐列一致 |
| P33 缩略标识、组内统一续行、resize | 「a name and a model identifier…」「a group that cannot fit…」「a width change is a fresh layout」 | 100 列：depth2 名称列 10→7（`孙子代…`）、Model 列 28→8（`Model: …`），后续列 15/25/41/53/66/92 两行一致，depth1 保持全形；125 列：两组均无 `…`；60 列：每行 2 行（`[1,1,2,2,2,2]`），depth1 续行列 Run=9、depth2 续行 Cost=12/Ctx=25/Run=51，缺 Ctx 行 Run 仍 51；无行超过该宽度；160→60→160 两次 160 输出逐字节相同 |
| P33/P24 缩略／续行不改变完整数据与业务数值 | 「the figures, the whole names…」 | 两种宽度下图数相同；`agentTree` 仍含全名、`official / model-beta`、runtimeMs 480000/0、costCny 0.02/0.01；storage root 的 JSON 逐字节未变且仍含全名、startup 快照与 runtimeMs |

**故障注入**（闭合前自检，随后恢复并确认 7 pass）：把分组 key 换成行序号（不共享列宽）→ 4 个用例失败；把 `textColumns` 换成字符数 → 4 个用例失败（含 P32）。

**实际运行的命令与结果**：

- `bun run typecheck` → 通过（合并后重跑）。
- `bun test tests/model-cost` → 339 pass / 0 fail（26 文件；本票所属分区）。
- `bun test tests/harness-dock/detail-tree.test.ts` → 3 pass / 0 fail（真实受支持宿主 RPC 帧，含子代理行的 `Model/Effort/Cache/Cost/Ctx/Run` 解析与恢复进程的 runtime 行）。
- `bun test tests/harness-dock/viewed-session-total.test.ts tests/harness-dock/model-cost-modes.test.ts` → 8 pass / 0 fail（widget 消费者）。
- `bun test tests/framework tests/codebase-tools tests/connect-bot` → 531 pass / 5 fail；5 个失败全在 `tests/connect-bot`，原因是本环境没有 `../omp-bot` 的 release 二进制（`the interop run needs the actual omp-bot panel, but no binary is at …\omp-bot.exe`），与本票改动无关。
- `bun run smoke:model-cost-detail-layout --widths 120,100,80,60,40` → 全部 PASS；观测宽度与列（120：depth1 `Model=19 Effort=53 Cache=67 Cost=79 Run=94`，depth2 `Model=35 Effort=45 Cache=61 Cost=73 Ctx=86 Run=112`；100：depth2 `Model=15 Effort=25 Cache=41 Cost=53 Ctx=66 Run=92`；80/60/40 亦已记录），并验证「同宽度重绘一致」「主题不增加列」。

**未完成／限制（不阻塞其余工作）**：

1. **P33 人工可读性未验证**（唯一留给用户的门禁）：缩略后的 `…` 与组内续行的可读性需用户在真实终端目视判断。已备证据：`bun run smoke:model-cost-detail-layout`（在真实终端运行时打印真实宽度下的帧、每行显示宽度与每字段观测列，并在 120/100/80/60/40 列下自检），以及上面 fixture 的逐项观测宽度。
2. **真实终端设备缺失**：agent 环境 `process.stdout.isTTY` 为 false（`TERM=dumb`、`pty requested but unavailable`），smoke 的帧与观测列是同一生产前端在同一宽度下的输出，但没有在真实终端设备上显示过；用户运行上述命令即可补齐这一目视证据。
3. **dock 与本 checkout 的行尾**：`host-patches/omp-18.5.0-*/patch.diff` 在工作树里是 CRLF（本地 `core.autocrlf=true`），`patchTouchedFiles` 的正则因此解析不到文件，dock 套件在本 checkout 会直接报 `patch.diff touches no file`；上面两个 dock 文件是在把两个 patch 临时转为 LF 后跑通的，随后已 `git checkout` 恢复（工作树干净）。这是环境／checkout 问题，不是本票改动，未在本票修改共享 harness。
4. 本票未改 spec／contract／其他票据，未建补丁、未新增加依赖（`package.json` 只新增一个 smoke 脚本，`bun.lock` 未变）。

## Execution record（agent，2026-10-14，真实终端设备证据）

上节第 2 条（真实终端设备缺失）已由本轮补齐；实现代码未变，只新增设备侧证据工具与本次观测。

**新增／改动**：`scripts/model-cost-detail-layout-terminal-smoke.ts`（新，设备侧 smoke，`bun run smoke:model-cost-detail-layout-terminal`）；`scripts/support/detail-layout-fixture.ts`（新，把原 smoke 的 fixture（树文档、记录型宿主、主题、读列辅助）提出来，两个 smoke 共用一套；原 `scripts/model-cost-detail-layout-smoke.ts` 改为引用它，输出与改动前逐字节相同，见下）；`package.json` 新增该 npm script。未触碰扩展实现、spec、contract、omp 与宿主补丁。

**测量方式（都是设备自己的数）**：在真实 Windows 控制台（ConPTY＝conhost）里运行；每个宽度先让控制台变成该宽度（`SetConsoleWindowInfo`＋`SetConsoleScreenBufferSize`，无会话模式；或由客户端 `ResizePseudoConsole` 改宽度，`--device-session` 模式），随后读 `GetConsoleScreenBufferInfo` 得到**设备自报宽度**并按它绘制，再把帧写进控制台，最后用 `ReadConsoleOutputCharacterW`＋`ReadConsoleOutputAttribute` 读回**设备自己的单元格**：字段起始列＝标签首字符所在单元格的下标（标签是 ASCII，1 字符 1 格），中文名的宽度＝设备花在它上面的格数（宽字符的首格带 `0x0100`、次格带 `0x0200`，次格不画字符），颜色＝该格的前景属性。逐行测量时先读光标行再写该行，写完先读回该行才换行，因此滚动不会移动已读的内容。无会话模式由进程自己让控制台变宽；`--device-session` 模式由客户端（模拟终端窗口 resizing）改宽度，进程每见设备宽度变化就重画一次。为无终端环境准备了 ConPTY 驱动器（`CreatePseudoConsole`＋`CreateProcessW(PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE)`；子进程不继承本进程的管道句柄并清空 std handle，控制台才把伪句柄给它；`ClosePseudoConsole` 在本机阻塞，故读完流即以进程退出收尾），本票不使用它作为交付物，只用于本轮自动证据。

**观测证据**（同一 fixture；设备列＝`cellWidth/字段列`，均与前端声明列完全相等）：

| 宽度（设备自报） | depth1（检索定价核查表／pricing-scan） | depth2（两个孙代理，父不同） | 中文名设备跨度 | 颜色 |
|---|---|---|---|---|
| 120 | Model 19 / Effort 53 / Cache 67 / Cost 79 / Run 94 | Model 35 / Effort 45 / Cache 61 / Cost 73 / Ctx 86 / Run 112 | 主会话=6、检索定价核查表=14、孙子代理乙=10 格（7 字＝14 格） | 树行全是设备默认属性 7；账户行 2/3/5/6/7 四段色，着色前后列与宽度不变 |
| 100 | Model 19 / Effort 52 / Cache 66 / Cost 78 / Run 93 | Model 15 / Effort 25 / Cache 41 / Cost 53 / Ctx 66 / Run 92（名称 `detail…`、模型 `deepseek / deepseek-fla…`） | 主会话=6、检索定价核查表=14 | 同上 |
| 60 | Model 9 / Effort 19 / Cache 33 / Cost 45；续行 Run 9 | Model 12 / Effort 22 / Cache 38；续行 Cost 12 / Ctx 25 / Run 51（无 Ctx 的行 Run 仍 51） | 主会话=6 | 同上 |
| 120（重画） | 与首次 120 逐格相同 | 同上 | 同上 | 同上 |

同一轮 36 项设备检查全 PASS，含：设备按声明宽度整行画完（树行每行占一行、格宽＝前端声明宽度）；每个字段的设备列＝前端声明列；同深度各行设备列相同、不同深度列不同（120：depth1 19/53/67/79/94，depth2 35/45/61/73/86/112）；缺字段的行后续字段仍在原列（无 Cost/Ctx 的孙行 Run 仍 112，60 列时仍 51）；主题只加颜色不加列（着色帧与无色帧同列同宽）；中文名每字 2 格；各宽度保留字段读数相同（14 个值）；重画回原宽度格内容逐格一致；storage JSON 1384 字节逐字节未变且仍含全名、`deepseek-flash` 启动快照与 `runtimeMs:480000`。

**resize 证据**：两次真实运行都是 120→100→60→120 四个 pass 全 PASS——(a) 无头 ConPTY 会话，客户端 `ResizePseudoConsole` 改宽度；(b) 真实 Windows Terminal 窗口，由进程让控制台改宽（`--size`/`--report` 之类参数会被 `wt.exe` 自己吃掉，故无参数启动，报告写到系统临时目录）。两轮报告分别为 `conpty-report.json`、`windows-terminal-report.json`（本轮证据目录）。注意：bun 的 `process.stdout.columns` 在设备改宽后仍是旧值（两轮都报 120），本 smoke 因此始终用设备自报宽度绘图并在报告里如实记录该字段。

**故障注入**（随后恢复并确认 36 PASS）：把 `textColumns` 换成「字符数」→ 36 项里 15 项失败，含「同深度共享设备列」（`Model=24 … | Model=17 …`）、「字段设备列＝前端声明列」（`Cache=30 Cost=65 vs Cache=30 Cost=64`）、「整行画完」（6 行中仅 2 行合规）。说明设备读数确实能判出宽度函数错误。

**实际运行的命令与结果**：

- `bun run typecheck` → 通过。
- `bun test tests/model-cost` → 339 pass / 0 fail（26 文件）。
- `bun run smoke:model-cost-detail-layout --widths 160,120,100,80,60,40` → 输出与抽出共用 fixture 之前逐字节相同（`diff` 无差异）。
- `bun run smoke:model-cost-detail-layout-terminal`（无头 ConPTY，`--device-session --session-passes 4`，宽度序列 120,100,60,120）→ 4 pass / 36 项检查全 PASS，流 26726 字节。
- 同上无参数在真实 Windows Terminal 窗口运行 → 4 pass / 36 项检查全 PASS。
- `bun test tests/harness-dock/detail-tree.test.ts` → 本 checkout 仍 0 pass / 1 fail，失败在启动即 `patch.diff touches no file`（上节第 3 条的 CRLF 环境问题，与本票改动无关；本票本轮未改共享 harness，故未再临时改行尾）。

**未完成／限制**：

1. **P33 人工可读性仍未验证**（唯一留给用户的门禁）：缩略 `…` 与组内续行的可读性需用户目视判断。证据已备：`bun run smoke:model-cost-detail-layout-terminal` 在用户自己的终端里就会按 120/100/60/120 重画并读回设备格；另有上面的逐宽度设备列与 `bun run smoke:model-cost-detail-layout` 的帧。
2. **无显示级像素证据**：本轮是控制台设备级证据（conhost 的屏幕缓冲与属性），不是屏幕截图，也没有人眼看过；agent 环境无交互 TTY，真实窗口是脚本拉起后自动关闭的。用户在自己终端跑一次即可补上目视证据。
3. **设备把非 BMP 字符画成 U+FFFD**：账户行的 🌙 在控制台缓冲里就是 U+FFFD（占 2 格），是 conhost 的表现，不是前端截图问题；对本票的列与数值无影响。
4. **Total／账户行不随终端变窄**：60 列时 Total 行本身超过控制台宽度、由控制台折行；本票边界明确不要求 Total 与子代理行共用列宽，故本 smoke 的列检查只作用于树行，未对 Total 行作任何断言。
5. bun 不发出 resize 通知（两轮都是 0 次）；宽度改动的证据是设备自报宽度与逐 pass 重画，不是事件。（真实宿主自行决定何时以新宽度重画，属宿主职责。）
