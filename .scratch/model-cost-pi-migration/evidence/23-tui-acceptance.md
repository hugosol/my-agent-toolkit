# 23：真实 TUI 正常与窄宽度验收（记录）

**本文件是本票交付的验证记录**：P52（S2）的 Agent 半——内容/布局自动检查、隔离可运行入口、固定业务场景、宽度输出及可获得的截图/录屏——以及仍未确认的人类验收项。本文件不改承诺、不改 seam，也不重复认领其它票的条目。

- **入口（可重跑）**：
  - `bun scripts/pi-tui-acceptance.ts`（= `bun run accept:model-cost-tui`；默认宽度 `120,60`，默认落到本目录）
  - `bun scripts/pi-tui-acceptance.ts --interactive`（人类看真终端；隔离运行根保留待查）
  - `bun scripts/pi-tui-acceptance.ts --widths 120,80,60 --out <dir>`（本次证据用的宽度）
  - `bun test tests/model-cost`（所属分区）
  - `bun run typecheck`
- **源状态**：分支 `hyper/model-cost-pi-migration/23-tui-acceptance-e6bb1a-411dc288ea83`，起点 `39fdc3d`（本票的 blocker 21 合入本分支后的 tip，其实现提交为 `55290fc`）。改动只有四处，全部新增或一行：
  - `scripts/pi-tui-acceptance.ts`（新增，`sha1 bdc7060d22a585c76c5bfbffffb006de1a57fec7`）：隔离入口、两种模式、内容/布局检查与报告；
  - `scripts/support/tui-acceptance-fixture.ts`（新增，`c2e0dcc13da499b3889dc4d64eef364ac3d2c50a`）：固定业务场景、隔离运行准备、真实 TUI 逐帧捕获；
  - `scripts/support/terminal-screen.ts`（新增，`2f0faa25e1e078dcce0c90444d3a21461b18b6d4`）：按终端自己的单元格读回被捕获的帧；
  - `package.json`（1 行：`accept:model-cost-tui`，`e05afde5fe32e3a8b8bc87c902e172db635b493d`，与改动前仅多该行）。
  **本票未改**任何 `extensions/**`、`framework/**`、`tests/**`、其它 `scripts/**`（注入插桩/临时探针一律在工作树之外，见 §6）。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2；真实宿主 pi 1.2.0（`D:\nvm4w\nodejs\pi.cmd` → `@earendil-works/pi-coding-agent` 的 `dist/bundle/cli.js`，`sha256 e79626f2…`，由 node v24.18.0 运行）、第三方工件 `pi-subagents@0.78.0`（`node_modules/pi-subagents/index.js`，`sha256 3b6bd20d…`）；无 provider 凭据、无付费调用——本票的会话**不发任何模型请求**，账目内容全部来自固定场景文档，唯一的出站流量是扩展自身的余额查询，由本机捕获端点（`tests/harness-dock/capture-server.ts`）回答。OMP 宿主与 OMP 补丁条件本票不涉及。

## 1. 交付的行为

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 隔离可运行入口 | `scripts/pi-tui-acceptance.ts` | 真 pi 终端 UI（不是 RPC）：`--no-extensions -e entrypoints/pi/model-cost.ts -e node_modules/pi-subagents/index.js --no-mcp --no-approve`，隔离 agent state／session 目录／工作目录／用户 home（`%TEMP%\omp-dock-tui-acceptance-*`），本地捕获端点声明为 `deepseek` provider。`--interactive` 把终端交给操作者（`stdio: inherit`），运行根保留待查；默认模式跑捕获与检查。 |
| 固定业务场景 | `scripts/support/tui-acceptance-fixture.ts` | 一份写死的周期文档（`period-tui-acceptance`）：主会话（startup 快照 `deepseek/deepseek-flash(high)`、1,000/2,000/3,000 token、¥0.05、span 0:05:00）+ 5 个后代（两个深度、中文名与长 ASCII 名；一个 `runtimeGap: true` 的 45s 小计、一个 `run: 0ms` 且**无金额**、一个从未测量 `Run: —`、两个无 startup 快照 `?(?)`）。会话 id 由 `--session-id session-main` 钉住，所以真会话就是被画的那条记录。 |
| 宽度输出 | 同上 + `scripts/support/terminal-screen.ts` | 每帧一个 pi 进程、一个 PTY（`Bun.Terminal`），在请求宽度下画完即读回：`screen-<form>-<width>.txt` 是该帧的屏幕字符，`recording-<form>-<width>.ansi` 是该进程写出的全部字节（可回放），`report.json` 记录源、场景文档、宽度、观察项与工件清单。detail 形态由操作者自己的 `/budget detail` 触发（一次写入一行 + 回车；见 §5）。 |
| 单元格几何 | `scripts/support/terminal-screen.ts` | 帧按**终端自己的单元格**读回：宽字符占两个单元格（尾格留标记），所以「字段在第几列」是设备给的列而不是字符计数——中文名、emoji 与进度条块都算得准。 |
| 内容/布局自动检查 | `scripts/pi-tui-acceptance.ts` | 逐帧核对：账号行（季节标、预算条与 Effort、余额读数、Accrued）、Total 行（Cache 份额、比例、树金额、Session span）、brief 无树／detail 有树、每个后代自己的金额与耗时标记、`?(?)` 只出现在该出现的位置、未知金额行不写 `Cost:`、每个深度组把 `Run:` 落在同一单元格列且更深的组缩进更深、按父先行后子、狭窄帧仍完整保留最宽帧的每个数字（省略号只吃名字与快照的模型半边）、brief 与 detail 的 Total 是同一行。 |
| 截图/录屏 | 同上 | 录屏＝每帧的原始 ANSI 流（`recording-*.ansi`）；截图＝把该帧单元格渲染成 PNG（`screen-*.png`，headless Chrome/Edge，可用 `PI_TUI_SCREENSHOT_TOOL` 指定；本机无浏览器时报告如实写「unavailable」而不伪造）。 |

## 2. 自动证据（本票真实运行）

```
$ bun run typecheck                     # tsc --noEmit，无输出，exit 0（日志 logs/23-tui-acceptance-typecheck.log）
$ bun test tests/model-cost             # 463 pass / 0 fail（40 files, 2524 expect, 7.90s，日志 logs/23-tui-acceptance-partition.log）
$ bun scripts/pi-tui-acceptance.ts --widths 120,80,60
                                        # 46 ok / 0 failed，exit 0（日志 logs/23-tui-acceptance-capture.log）
```

捕获运行的真实宿主事实（`report.json` 的 `source`）：pi 1.2.0 由 `cli.js` 报告、入口与第三方工件都由 pi 自己的 loader 加载（终端里 `[Extensions]` 一行为 `model-cost.ts, pi-subagents`）、终端无 `error:` 行、四类帧（brief/detail × 3 宽度）全部捕获。

**交互入口实跑（人类验收材料本身也验证过）**：`bun scripts/pi-tui-acceptance.ts --interactive` 在本机以真实控制台启动（进程 11960，随本机 pty 服务运行）：隔离根 `%TEMP%\omp-dock-tui-acceptance-interactive-*` 建立、pi 1.2.0 接管终端、`[Extensions]` 列出 `model-cost.ts, pi-subagents`，brief 形态直接画出固定场景（`Balance: ¥12.34  ⏳ Accrued: ¥0.07`、`Total: … Cost: ¥0.07  Span: 0:05:00`），输入行接受 `/budget detail`（§5 记录了脚本化输入的第二条命令行为）；随后按服务方式结束并保留运行根。

**P52 的 Agent 半（S2）逐条**：

- **brief**：120/80/60 三宽度下都画出账号行（`Effort:`、`Balance: ¥12.34`、`Accrued: ¥0.07`）与 `Total: Cache: 67% ¥Cache/In/Out：0:8:92 Cost: ¥0.07 Span: 0:05:00`，且**没有**任何会话行（树只属 detail）。
- **detail（树）**：三宽度都画出主会话与 5 个后代；每个记录自己的金额（`¥0.05 / ¥0.0040 / ¥0.01 / ¥0.0020 / ¥0.0010`，且 `run: 0ms` 那条**没有** `Cost:` 字段）与自己的耗时标记（`8m / 45s / 30s / 0ms / —`）都在；`?(?)` 恰好 2 处（两个无 startup 快照的记录）。
- **已知/未知/不完整**：`Run: —`（从未测量）与 `Run: 0ms`（可靠零）分开；未知金额不与已知小计混同；`runtimeGap: true` 的记录按其**已知小计** `45s` 绘制（该缺口是持久化事实，绘制面没有额外标记——见 §4）。
- **布局（120 列，一帧一行）**：5 条会话行＝5 个后代（无组内折行），浅层组 `Run:` 同在单元格列 86，深层组同在 83，`details-under-the-first-child` 画在其父 `检索定价核查表` 之后。
- **宽度退化（120 → 60）**：最宽帧上的 6 个金额与 5 个耗时标记在最窄帧上**全部完整**保留；60 列帧出现 `…`（名字与快照模型半边被缩，`(high)`/`(medium)` 级别保留）；brief 与 detail 在每个宽度上的 `Total:` 行逐字节相同。

## 3. 本次证据的工件

`evidence/tui-acceptance/`：`screen-{brief,detail}-{120,80,60}.txt`（6 份宽度输出）、`recording-{brief,detail}-{120,80,60}.ansi`（6 份原始流＝录屏）、`screen-*.png`（6 张截图）、`report.json`（源/场景/观察项）。日志在 `evidence/logs/23-tui-acceptance-{typecheck,partition,capture}.log`。

## 4. 未完成与未确认项（不得据此判为通过）

- **人类验收未确认**：真终端的格式、间距、窄宽度与**观感**由人判断（P52 的人类半），本票不代判。已备材料：`bun scripts/pi-tui-acceptance.ts --interactive`（操作者自己的终端，固定场景已入位）+ 本目录的屏幕文本/截图/录屏。位置与间距上的唯一非自动结论是肉眼观感。
- **截图是渲染而非窗口抓取**：`screen-*.png` 由 headless Chrome 把该帧的**单元格文本**渲染成图（本机 `C:/Program Files/Google/Chrome/Application/chrome.exe`）。浏览器对 emoji（🌙💰⏳）与进度条块字符的字形度量与终端不同，故 PNG 的视觉列可能与终端略有差异；**忠实形式是 `screen-*.txt` 与 `.ansi`**（后者可在真终端 `cat` 回放）。
- **本机工作树缺少依赖目录时的前置**：本 worktree 起初没有 `node_modules`，仓库固定工件的路径 `node_modules/pi-subagents/index.js` 不存在；本票以 `bun install --frozen-lockfile` 物化本 worktree 的依赖目录（13 个包，`bun.lock` 字节未变，`git hash-object bun.lock` 运行前后同为 `cc3c49a6290c153455675028023bebc5b6f62d35`）。未执行该步的机器上入口会明确报「pinned provider artifact 缺失」并给出 `--provider <path>`。
- **覆盖范围**：只覆盖本机 win32 + bun 1.4.2 + pi 1.2.0 + `pi-subagents@0.78.0` 与 `--tui-mode regular`；未覆盖 POSIX、fullscreen TUI 形态、其它版本 pi/工件，也未覆盖真实模型请求（本票会话不发请求，账目来自固定文档）。这些不泛化为已支持。
- **不是 RPC**：本票证据全部来自真 pi 终端 UI（PTY 内的 TUI 进程）；未用 RPC/`--print` 输出替代。RPC 侧形态由 18 的 `tests/model-cost/pi-presentation.test.ts` 覆盖，不在此重申。

## 5. 观察到的一条宿主行为（记录，不当作缺陷结论）

脚本化输入在同一 TUI 会话里发第二条 `/budget <form>` 时，**参数会丢**：框架答的是裸命令的帮助（`Error: /budget — 费用统计与展示管理…`），随后一次回车又在同一会话里执行了**上一次**的参数（实测：`/budget detail` → 切换 detail；紧接 `/budget brief` → 帮助；再一次写入 → 才切到 brief）。以人工节奏逐键输入（80–250ms/键、回车前停 0.25–1.5s）复现同样结果；会话第一条命令总正常。这不是本票的实现或验收结论的对象（输入编辑器属宿主），故捕获**每帧起一个全新进程、只发一条命令**（也顺便避免 regular 模式的历史回滚内容混进帧）。真人在真键盘上是否同样如此未验证，属人类验收时的观感面。

## 6. 隔离与清理

捕获运行全部在 `%TEMP%\omp-dock-tui-acceptance-*\` 下（隔离 agent state、session 目录、工作目录、`user-home/.omp/cost-archive` 与捕获端点目录），运行结束即释放；`--interactive` 的运行根**保留**并打印路径，由操作者自行删除。迭代期间的临时探针、ANSI 屏、png 渲染页面都在工作树之外（`%TEMP%`），未写入仓库；未操作集成工作区、未切换分支、未新建 worktree、未 reset、未调用 retro，也未自行合入 `pi-adapter`。
