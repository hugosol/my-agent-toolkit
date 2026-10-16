# 03 产品能力与项目健康对照：tintinweb `@tintinweb/pi-subagents` 0.22.0 vs nicobailon `pi-subagents` 0.78.0

Source: [选择 pi 子代理扩展及缺口处理路线](../decision/03-subagent-provider-choice.md)。本票只产出事实对照，不选定提供方，不编辑 ticket / map / lighthouse / decision。研究日期按项目语境记为 2026-10-16。

## 0. 取证口径、时间戳与计入方法

- **抓取时刻**：本机工具时钟 UTC `2026-10-15T18:12:01Z`（对应 UTC+8 的 2026-10-16）。GitHub 服务端可见的最新 push 为 `2026-10-15T13:51:30Z`（nicobailon）与 `2026-10-13T18:37:53Z`（tintinweb）。星标/下载是抓取时刻的点值，不是区间均值。
- **近 30 天提交窗口**固定为服务端过滤 `2026-09-15T18:12:01Z → 2026-10-15T18:12:01Z`，按 commit committer 时间；窗口起点随抓取时刻变化，复算需固定该时刻。
- **提交计数方法**：`GET /repos/{slug}/commits?since=…&until=…&per_page=100`，跟随 `Link rel="next"` 翻页至无下一页，计数 = 收齐后的条目数（tintinweb 1 页 24 条；nicobailon 4 页 100+100+100+55=355 条）。**含 merge commit**；nicobailon `main` 有合并提交，tintinweb `master` 为线性历史。仓库总量用 `GET /repos/{slug}/commits?per_page=1` 的 `Link rel="last"` 页号。
- **“活跃日”单独列**：窗口内 committer 日期去重后的天数，避免把同一日的多次 push 当活跃度；与提交数、发布频率三者互不替代。
- **issue 与 PR 必须分开**：`GET /repos/{slug}` 的 `open_issues_count` **包含 PR**（tintinweb 107 = 63 issue + 44 PR）。故另取 `GET /search/issues?q=repo:… type:issue|type:pr state:open|closed`；检索 API 有独立限流，nicobailon 的 30 天 issue 开/关数改用 `GET /repos/{slug}/issues?state=all&sort=created` 列表统计，非检索总数。
- **发布计数**：`GET /repos/{slug}/releases?per_page=100`（+`page=2` 确认截断），按 `published_at` 以抓取时刻为基准折算 30/90/180 天。nicobailon 共 144 个 release（page1 100 + page2 44，page1 最旧 2026-04-16），30/90/180 天窗口完全落在 page1 内，计数不受截断影响；tintinweb 共 58 个（page2 为空）。
- **npm**：`registry.npmjs.org/<pkg>` 的 `time` 字段与 `dist-tags.latest`；下载量 `api.npmjs.org/downloads/point/last-week|last-month`（窗口 `2026-10-06→10-12`、`2026-09-13→10-12`）。
- **研究钉住版本**（本票所有能力断言只对这两个 commit 成立，不对两个仓库的当前 HEAD 成立）：
  - tintinweb `@tintinweb/pi-subagents@0.22.0` = `85a704cb8f35c96c0cabfa665b572bab296942e5`（= 本地检出 HEAD = tag `v0.22.0`）
  - nicobailon `pi-subagents@0.78.0` = `a4c8ced69a8176cdf4179b127feddc8875e3418f`（= 本地检出 HEAD = tag `v0.78.0`）
- **未做**：安装、构建、测试、模型调用、Windows 实跑。nicobailon 无运行时验证；tintinweb 的付费运行时证据见 [06 真实调用阶段验证记录](06-runtime-validation/report-live.md) 与 [report-nofee.md](06-runtime-validation/report-nofee.md)，本票只做引用不重复。

## 1. 项目健康对照表

来源：`GET /repos/{slug}`、`/releases`、`/contributors`、`/commits`、`/search/issues`、npm registry 与 npm downloads（均于上列时刻抓取）。

| 指标 | tintinweb/pi-subagents | nicobailon/pi-subagents |
| --- | --- | --- |
| stars / forks / watchers(subscribers) | 1310 / 317 / 1 | 3931 / 804 / 13 |
| 创建 → 最新 push | 2026-03-05 → 2026-10-13T18:37:53Z | 2026-01-07 → 2026-10-15T13:51:30Z |
| archived / disabled / license | false / false / MIT | false / false / MIT |
| 默认分支 / 仓库名 | `master` / `@tintinweb/pi-subagents` | `main` / `pi-subagents` |
| 总提交数（Link last） | 310 | 2062 |
| 近 30 天提交数 | **24**（1 页） | **355**（4 页） |
| 近 30 天活跃日 | **4**（10-09/11/12/13） | **27** |
| 近 30 天提交者分布 | tintinweb 19、其余 5 人各 1 | nicobailon 272、quifox 13、qsgy-edge 6、其余 3 人各 ≤4 |
| 贡献者（GitHub User） | 31 人 / 307 次提交 | 173 人 / 2051 次提交 |
| 首作者提交占比（含 owner）/ ≥10 次提交者数（含 owner） | 87.3% / 1 人 | 83.1% / 5 人 |
| 开放 issue（排除 PR） | 63（已关闭 100） | 1（已关闭 1123） |
| 开放 PR / 已关闭或合并 PR | 44 / 173 | 0 / 1782 |
| 近 30 天新建→已关闭 issue | 29 新建 / 11 关闭 | 45 新建 / 44 关闭 |
| 已关闭 issue 关闭时延（近 30 天样本） | 中位 215 h、最大 336 h（n=11） | 中位 2.5 h、最大 47.6 h（n=44） |
| release 总数 / 近 30 / 90 / 180 天 | 58 / 3 / 16 / 37 | 144 / 14 / 57 / 96 |
| 是否含 prerelease | 全部正式（0 预发布） | 全部正式（0 预发布） |
| npm 版本总数 / 近 30 / 90 天 | 59 / 3 / 16 | 146 / 14 / 57 |
| npm 最新版（抓取时） | 0.22.0（2026-10-13T12:15:01Z） | 0.78.0（2026-10-13T05:39:09Z） |
| npm 最新版 = 本票钉住版本？ | 是 | 是 |
| npm 近 7 天 / 近 30 天下载 | 11,184 / 36,247 | 109,063 / 614,158 |
| CI 平台与范围 | GitHub Actions，`ubuntu-latest` 单平台：build（lint+typecheck+test）+ `compat-floor-pi`（Pi 1.1.0，硬失败）+ `compat-latest-pi`（Pi latest，`continue-on-error`） | GitHub Actions，`ubuntu-latest`×2 分片 + `windows-latest`×4 分片矩阵；另有 `workflow_dispatch` 手动发布 |
| 发布流水线 | 无 `release.yml`；靠 `prepublishOnly`（lint+typecheck+test+build）本地发布 | `release.yml`：`workflow_dispatch` + GitHub `environment: release` 人工批准 + `npm publish --provenance`，发布前跑 `test:all` |
| 测试/源码文件规模 | 128 个 test 文件 / 59 个 src 文件 | 558 个 test 文件 / 321 个 src 文件 |

**读法提示**：星标、fork、下载量是采用度而非可靠性证据；两者不可互换（0.22.0 有 3 次发布而下载 1.1 万/周，0.78.0 有 14 次发布而下载 10.9 万/周）。

## 2. 维护者与贡献集中度

- **两者提交高度集中于单一作者，但“bus factor = 1”不能由提交占比推出**：tintinweb 占 268/307 次提交（87.3%），nicobailon 占 1705/2051（83.1%）；31 人中的 24 人、173 人中的 118 人只有 1 次提交。提交占比只说明“谁在写代码”，不说明决策权、发布权、知识分布或离开后的可接管性——**本票不结论 bus factor，只结论“单作者主导提交”**。
- **nicobailon 的外部贡献面明显更宽**：含 owner 共 5 人达到 ≥10 次提交（nicobailon 1705、loss-and-quick 15、quifox 13、qsgy-edge 13、xz-dev 11），已合并 PR 1782 个、开放 PR 0 个；30 天窗口内 83 次提交来自 owner 之外。
- **tintinweb 外部参与更浅且更集中**：除 owner 外最高仅 3 次提交（benrhodeland / rylwin / xz-dev），44 个 PR 未合并、63 个 issue 未关闭。
- **issue 卫生口径不同（样本小、口径粗，主会话不应据此做结论）**：nicobailon 近 30 天 45 个新建 issue 中 44 个已关闭、样本内中位关闭时延 2.5 小时（n=44），抓取时仅 1 个开放 issue；tintinweb 29 个新建 / 11 个关闭、样本内中位 215 小时（n=11）。两者都可能受 backlog 政策、重复项合并、机器人关闭影响，且样本只取最近 100 条 items；nicobailon 的 `VISION.md`/`AGENTS.md` 把 VISION 定为 backlog 判定依据，属于政策差异而非纯响应能力差异。
- **匿名/机器人身份**：contributors 含 `anon=1` 与 `claude`（7 次提交）等身份，无法据此推断真实人力；本表按 GitHub User 计数、不含匿名条目。

## 3. 钉住版本、最新发布与未发布提交

- **两个钉住版本都等于抓取时刻的 npm `latest`**，因此“研究版本 ≠ 现行发布”不成立；但**两个默认分支都领先于钉住 tag**：
  - tintinweb `master` 领先 `v0.22.0` **5 个提交**（`ahead_by: 5`），全部在 2026-10-13T14:58–18:37Z：`feat(usage): per-message subagents:usage event for every agent 与 subagents:disposed`、`docs(changelog)`、`feat(rpc): subagents:rpc:steer`、`fix(resume): enforce max_turns and count turns on resumed agents`、`fix(resume): stoppable inline resume, spawn budget kept, nested max_turns`（HEAD `ca93a5247e72`）。→ 这些修复**都不在 0.22.0**；钉住树上对应的 resume 行为只有“inline resume 可被工具调用 signal 中止”，而 commit 标题中的 `spawn budget kept` 语义本次未核查（raw.githubusercontent 在本机被连接重置，未取到 master 源码）。
  - nicobailon `main` 领先 `v0.78.0` **16 个提交 / 48 个文件**（`ahead_by: 16`），例如 `fix: restore async widgets after a mid-run auto-compaction`、`feat: report each step's model in the RPC async-status snapshot`、`fix: let forked subagents reuse the parent's prompt cache`、`fix: stop re-processing acknowledged mission results`（HEAD `475600bc8156`，2026-10-15T13:51:18Z）。→ 钉住树缺少这些修复，其中“background subagents 在 Pi 1.2.0 上再次可用”已在 **0.78.0** 的 CHANGELOG Highlights 中（`CHANGELOG.md` 0.78.0 段）。
- **发布节奏**：nicobailon 14 次/30 天、57 次/90 天（版本号 0.78.0，146 个版本）；tintinweb 3 次/30 天、16 次/90 天（0.22.0，59 个版本）。nicobailon 的节奏意味着“钉住 0.78.0”会较快落后；tintinweb 的节奏更慢，但未合并 PR/issue 积压更大。
- **发布工件形态不同**：nicobailon 的 `package.json` 标 `"private": true`、`exports` 指向仓库内 `./index.ts`，发布走 `build:pkg` 生成 `dist-pkg`（文档亦说明“published npm package uses the compiled `index.js` entry”）；tintinweb 直接 `tsc` 到 `dist` 并以 `./src/index.ts` 作为 pi 扩展入口。**因此“本地 git 里读到的 TS 入口”不等于“npm 安装后运行的入口”**，这适用于两者，尤其 nicobailon。
- **宿主/平台约束**：
  - tintinweb：`peerDependencies` `@earendil-works/pi-ai|pi-coding-agent|pi-tui` 均 `>=1.1.0`，devDeps 钉 1.1.0；CI 有三个 job 分别验证 1.1.0 下限与 latest 前向 canary；本项目宿主 pi 1.2.0 满足。README「Other hosts」只列 dsh 第三方适配，明确“不测试、不覆盖 CI”。
  - nicobailon：`@earendil-works/pi-ai >=0.86.1`，其余 peer 为 `*` 且全部 `optional`；`docs/standalone-background.md` 明确“官方验证目标 = Pi 0.86.1 Linux x64”，Windows 仅“experimental（识别 Bun 虚拟入口前缀）”，完整 standalone 生命周期矩阵未在 Windows 验证。其 CI 在 `windows-latest` 上跑测试（4 分片），但不等于 standalone 后台运行器在 Windows 已验证。
  - Windows 相关性（本机 win32）：**本票不新增任何运行时证据**，因此本票不能宣布任一候选“已在本机端到端可用”。既有证据的不对称必须写清：tintinweb **有** ticket 06 的真实 Windows 运行证据（06 无费用阶段记录 `Windows 10.0.26200` / `node v24.18.0` / `pi 1.2.0`，`runs.json` os 字段亦为 `Windows-10-10.0.26200`，载体是固定 npm 工件 `@tintinweb/pi-subagents@0.22.0`），但**范围有限**：只覆盖 06 列出的场景/矩阵，且 06 自己列出未覆盖项（强制 error 终态、逐请求公开出口、workflow 子代理身份、查看席位等），另其 CI 无 Windows job。nicobailon 相反：CI 在 `windows-latest` 上跑单测（4 分片），但**本票未见其在本机 Windows 的真实运行证据**，其 standalone 后台运行器在 Windows 仍标 experimental。

## 4. 五项能力对照（只对钉住版本）

### 4.1 模型自主调用（autonomous tool use）

| 维度 | tintinweb 0.22.0 | nicobailon 0.78.0 |
| --- | --- | --- |
| 注册给模型的工具 | `Agent`、`SubagentWorkflow`、`get_subagent_result`、`steer_subagent`（`src/agent-runner.ts:44-49`；注册点 `src/index.ts:2457-2458,2735,2885-2886,2974-2975`） | `subagent`（`src/extension/index.ts:666`）、子会话安全的 `subagent`（`src/extension/fanout-child.ts:222`）、`subagents_enable` 装载器（`src/extension/tool-activation.ts:14`）、`bg_wait`（`src/runs/background/wait-tool.ts:50`）、`subagent_supervisor`、`contact_supervisor`、`watchdog_warn/ask`、`structured_output` |
| 模型能否自主决定派发 | 能；工具由 `pi.registerTool` 注册、描述走 `promptSnippet`/`promptGuidelines`（`src/index.ts:1699-1707,2565-2570`），并在工具描述里写明“一条消息多个 `Agent` 调用会并发”（`src/index.ts:1591-1600`、`README.md:65`） | 能；`subagents_enable` 是**工具可用性闸门**，不是权限判定：模型能拿新工具时新会话先只有装载器，授权式请求由 Pi 自行调用后下一次模型请求才出现 `subagent`（`README.md:39,47`；`docs/configuration.md:83-87`）。文档化的 `toolActivation`（`docs/configuration.md:89-110`）：`auto`（默认；仅当模型 compat 支持会话中加工具时才用装载器，否则 `subagent` 直接可用）、`dynamic`（所有新会话都用装载器）、`eager`（**不注册装载器**，`subagent` 首次请求即 active）。`eager` 取消的是这个可用性闸门，**不等于**移除工具描述里的授权规则（`complexity alone is not authorization` 等文本，`src/extension/tool-activation.ts:105-106`、`src/extension/tool-description.ts:17-21`）；本票未验证 `eager` 下的实际派发行为 |
| 用户面入口 | 仅 `/agents` 一个命令（`src/index.ts:4210-4213`）、`@handle` mentions（`pi.on("input")`）、CLI `--subagents-workflow-file` | `/run`、`/parallel-review`、`/council`、`/prompt-workflow` 等，文档明确为便利而非必需闸门（`docs/workflows.md:36-48,438-440`） |
| 关键参数 | `prompt/description/name/subagent_type`（必填）、`model/thinking/max_turns/run_in_background/resume/isolated/inherit_context`、条件展开 `isolation`、`schedule`；`run_in_background` **默认 true**（`src/index.ts:1278-1280`） | 顶层 `agent/task/workflow/args/async/model/cwd/worktree/output/action/id/message`，其余入 `options`；`async` **默认开启**（`docs/tool-reference.md:70,99-123`）；**无子代理 `name` 参数** |
| 是否注册了面向模型的停止工具 | **无**（见 §4.3） | 有：`subagent({action:"stop"|"interrupt"})` |

要点：两者都是“模型自主调用”，差别在**授权语义**：tintinweb 直接把 `Agent` 放进工具表（后台为默认，首个回合就能派发），nicobailon 用 `subagents_enable` 装载器把“派发”做成需授权的两步，并显式拒绝“任务复杂即授权”。nicobailon 的闸门是为 prompt cache 与成本控制设计的；tintinweb 的等价控制是“默认后台 + 每消息批量并发 + 并发池”。

### 4.2 嵌套委派（opt-in 与深度）

| 维度 | tintinweb 0.22.0 | nicobailon 0.78.0 |
| --- | --- | --- |
| 默认 | 关；子代理默认拿不到 `Agent` | 关；子会话默认不注册 `subagent`（`docs/workflows.md:21-22`） |
| 开启方式 | 自定义 agent frontmatter `allowed_subagents: all` 或白名单（`src/types.ts:63-67`、`src/custom-agents.ts:339-345`、`README.md:364-384`） | `tools: subagent` 或 `allowNestedSubagents: true`，可用 `allowedAgents` 收窄（`docs/agents.md:420-421,513-514,534-535`；实现 `src/runs/shared/child-tool-plan.ts:330-336`） |
| 深度默认 | 2（main=0 → 子=1 → 孙=2），`maxSubagentDepth` 可改，上限 16，`0/1` 全局关闭（`src/nested-tools.ts:45-48`、`src/settings.ts:221-227,389`、`src/index.ts:3743-3748`） | 2 层（main → subagent → sub-subagent）；`PI_SUBAGENT_MAX_DEPTH` → `config.maxSubagentDepth` → agent frontmatter（**只能收紧**）（`docs/workflows.md:533-551`、`docs/configuration.md:539-545`） |
| 越界行为 | 子代理在到达上限时不再注入嵌套工具，调用被拒并提示直接完成（`src/agent-runner.ts:942-960`、`src/nested-tools.ts:195-200`） | 同样在上限处阻止并提示直接完成（`src/runs/foreground/subagent-executor.ts:1802-1804`） |
| 宽度/预算 | **只有深度上限，没有宽度或 spawn 预算**（`src/agent-manager.ts:104-106`、`README.md:382` 明说“bounds how deep … not how wide”） | 多层预算：`maxSubagentSpawnsPerRun` 默认 64、`globalConcurrencyLimit` 默认 20、`maxSubagentSpawnsPerSession`/`maxActiveAsyncRunsPerSession` 默认不设（=无限，文档示例给 100/4），spawn claim 不可退还（`docs/configuration.md:438-492`） |
| 嵌套可见性 | 嵌套子代理**被过滤出总线与注册表**：`subagents:completed/failed/started/compacted` 有 top-level 守卫、`created` 仅顶层；父结束时子被 `abortOwnedChildren` 停止（`src/index.ts:577-587,620-634,1181-1186`、`src/agent-manager.ts:1015-1024,503-507`）。session 文件按**默认+可覆盖**理解：`rememberAgents`（默认 true）让**顶层**子代理落 pi session 文件，但“由另一个 agent 派生的 agent”被明确排除（`README.md:707`），故嵌套子代理默认不落独立 pi session 文件；自定义 agent 可用 frontmatter `persist_session: true`（+`session_dir`）覆盖该默认（`README.md:346-348`，用户已批准把该路径作为 fallback 而不是本票结论）。06 运行时实测的那次嵌套（`allowed_subagents: all`、未设 `persist_session`）确无独立 session 文件、`details={}` 不含子 id（06 报告“嵌套子代理身份”行） | 嵌套运行在 `status` 中以树出现，且 `status`/`interrupt`/`resume` 可按嵌套 id 定位（`docs/tool-reference.md:315-316,366-368`、`docs/workflows.md:533-551`）；外部 CLI runner 不能嵌套（`docs/tool-reference.md:529`） |
| 其他限制 | 子代理会话不激活本扩展 → 嵌套会话里没有 `/agents`、没有 RPC、不发射 `subagents:ready`（`README.md:384`）；isolated agent 永不获得嵌套工具 | 子代理的嵌套能力由“解析后的内建工具含 `subagent`”决定；`allowNestedAgents` 类开关不放宽上限 |

**这是本票最重要的能力差异之一**：对“观察子代理”的下游（本项目 model-cost）而言，nicobailon 的嵌套运行有可寻址 id 与状态树，tintinweb 的嵌套子代理在公开面上是不可见的（消耗只折算进父记录）。

### 4.3 并行 / resume / cancel

| 维度 | tintinweb 0.22.0 | nicobailon 0.78.0 |
| --- | --- | --- |
| 并行方式 | 一条消息里多个 `Agent` 调用并发；后台池 `maxConcurrent` 默认 10、前台池 `maxConcurrentForeground` 默认 0=无限（上限 1024），FIFO 队列（`src/agent-manager.ts:56,68,1030-1055`、`src/settings.ts:386`） | `runs.all`（有序数组）与 `runs.lanes`；`globalConcurrencyLimit` 默认 20、`parallel.maxTasks/concurrency` 默认 8/4（`docs/configuration.md:438-446,510-521`） |
| 并发/预算边界 | workflow 有自己的并发上限 `max(1, min(16, cpus-2))`（`src/workflow/runtime.ts:48-50`）；定时触发**绕过** `maxConcurrent`（`src/schedule.ts:251-253`） | workflow 并发上限 `globalConcurrencyLimit` 20；spawn 预算 64/run；排队子代理保留稳定 key，claim 不退（`docs/configuration.md:442,468`） |
| resume 语义 | `Agent(resume=<id>)`；后台 resume 会 detach，inline/foreground resume 转发工具调用 signal（`forwardAbortSignal`，已中止则跳过）；对运行中的代理 resume 被拒（`src/index.ts:1744-1750,2102-2130,2103-2114`、`src/agent-manager.ts:1237-1257,1196-1204`）。运行时实测：resume 复用同一 id 并重发 `created`+`started`；RPC 面无 resume（06 报告） | `subagent({action:"resume"})`：从持久 `.jsonl` 复活 paused/completed/failed 为**新**子代理，需跨进程 session 排他租约，`resume` 与 `agent` 互斥；**stopped 不可 resume**；保留子代理（最近 10 个）带 `resumable` 标记（`docs/tool-reference.md:169-188,362-370`） |
| cancel 语义 | 模型无停止工具；停止路径为 UI（viewer `x` 两次、`/agents → Running agents`）、RPC `subagents:rpc:stop` → `manager.abort`（**对 nested/workflow-owned 拒绝**）、`abortAll`、父结束时 `abortOwnedChildren`（`src/agent-manager.ts:1471-1490,1572,1015-1024`、`src/cross-extension-rpc.ts:170-181`） | `interrupt`（顶层；嵌套需显式 id）、`stop`（终态、不可 resume，仅顶层 async，或按 `childId`）、`command.cancel`（bash 调用级，`cancel_requested`→`cancelled`）；状态 `pending→running→complete\|failed\|paused\|stopped`（`docs/tool-reference.md:315-336,337-382`、`docs/workflows.md:466-493`） |
| 运行时替换/中断 | Esc 不停止已启动的代理，需从 UI 停止（README） | `/reload`、切会话会停止 async workflow（`runtime-replaced`）与进程内前台子代理；**后台子会话继续运行**；Esc 只停父与前台子（`docs/workflows.md:78-82`、`docs/observability.md:5-20,135`） |

运行时补注（tintinweb，来自 06）：in-flight `stop` 实测成功并产出 `subagents:failed{status:"stopped"}`，但**取消运行的终态 `usage/tokens` 为 `null`**（重试一次仍为 null）——对成本观察有直接后果，且属于钉住版本已发布行为，不是未发布修复。

resume 不等价提示（避免把两家的 resume 或宿主 fork 当成同一件事）：tintinweb 的 `resume=<id>` **复用同一 agent id** 并重发 `created`+`started`（06 实测），运行结束后可再被 resume；nicobailon 的 `resume` 从持久 `.jsonl` 复活为**新 child**、保留其存储的 agent/model/tool 契约、需跨进程 session 租约，且 **stopped 不可 resume**。此外 pi 宿主自身的 `parentSession` fork/clone 是会话来源标记，不等于任一扩展的 resume。本票**未做身份延续/重复执行的运行时验证**，因此不认定任何一方与另一方的 resume 语义（或与 OMP keep-alive）等价。

### 4.4 workflow 设计

| 维度 | tintinweb 0.22.0 | nicobailon 0.78.0 |
| --- | --- | --- |
| 形态 | 模型编写的**确定性 JS**（vm+worker，非确定性调用直接抛错），`SubagentWorkflow` 工具，纯字面量 `export const meta`，脚本落盘到 `.pi/workflows/` 等（`docs/workflows.md:1-5,369`、`src/workflow/meta.ts:31-37,216-230`、`src/workflow/saved.ts:64-70`） | 模型编写的**JS 代码块**（同一条回复里的 ` ```js workflow ` + `subagent({workflow:true})`），沙箱内无 fs/shell/宿主全局，helpers 为 `runs.run/all/lanes/steer/status/ref` + `emit` + mission `state`（`docs/workflows.md:52-75,97-101`） |
| 触发 | 工具被模型调用；**没有 `/workflows` 命令**；`workflowsEnabled` 默认 auto，遇同名 `Workflow`/`SubagentWorkflow` 工具自动让位（`docs/workflows.md:23`、`README.md:315-317`、`src/index.ts:2737-2755`） | 同一个 `subagent` 工具的 `workflow: true` 或脚本路径；字符串含 `/` 视为脚本文件，否则视为具名资源（`review`/`run-ci`/`parallel`）（`docs/tool-reference.md:11`、`docs/workflows.md:52-75`） |
| fan-out/fan-in | `parallel()`（有 barrier）与 `pipeline()`（无 barrier）；`phase()` 分组；嵌套 `workflow()` 一层；上限 1000 agents/run、4096 items/parallel\|pipeline（`docs/workflows.md:270-295`、`README.md:528`、`src/workflow/runtime.ts:25-50`） | `runs.all`、`runs.lanes`（32 lanes/16 stages/64 stages/64 KiB）、滚动 `Promise.race` + `runs.steer`；聚合靠脚本 `return` 或 mission `state.get/set`（256 KiB）（`docs/tool-reference.md:11,58-66,138-168`） |
| 确定性步骤 | `gate: "npm test"` 用命令验证子代理结果（而不是再问一个模型）；`schema` 为“施压”而非强制（`README.md:24`、`docs/workflows.md:405-425`） | 具名 typed steps：`external-cli`、`run-ci` 宿主命令、typed JSON gates；`action:"validate"` 静态校验不启动子代理（`docs/workflows.md:224-278`、`docs/tool-reference.md:15,430-455`） |
| 交互/覆盖 | 运行卡片与 `/agents → Workflows` 两层检查器，`p` 暂停（停止启动新 agent）、`s` 跳过；workflow 子代理被过滤出 fleet/widget/menus 且不占并发槽（`README.md:87-88,155`、`CHANGELOG.md:87-91`） | 支持 steering 运行中的子代理（`runs.steer`，`mode: steer\|follow_up\|auto`）；worktree 隔离按 child 开启；复合 workflow **没有默认顶层 deadline**（`docs/tool-reference.md:107,138-158`、`docs/workflows.md:118-179,442-465`） |
| 迁移/兼容 | 自述为 Claude Code `Workflow` 工具移植，脚本“unchanged 可跑”，`budget.total` 恒为 null，工具名改为 `SubagentWorkflow`（`docs/workflows.md:405-425`、`test/workflow-claude-code-compat.test.ts`） | 旧的顶层 `chain`/`tasks`/`parallel`/`/chain`/`.chain.md` 全部移除，改为 JS 脚本（`disabledFeatures:["workflow-scripts"]` 例外）（`docs/workflows.md:367-370`） |
| 上下文成本（自述） | 工具描述约 22 KB ≈ +5k tokens（`CHANGELOG.md:74`）；`workflowsEnabled` 关闭即不注册、无工具规格成本 | `subagents_enable` 装载器即为此设计（避免 provider 丢 prompt cache，`README.md:47`） |

### 4.5 调度与 workflow/任务边界（scheduling restrictions）

| 维度 | tintinweb 0.22.0 | nicobailon 0.78.0 |
| --- | --- | --- |
| 调度载体 | `Agent` 工具的 `schedule` 字段（字符串），依赖 `croner ^10.0.1`（唯一消费者 `src/schedule.ts`） | 仅 workflow：`subagent({action:"schedule.create"/…})`，持久在 `.pi/subagents/schedules/<id>/`（`docs/missions.md:87-130`） |
| 时间表达 | 6 字段 cron（`0 0 9 * * 1`）、interval（`5m/1h/30s/2d`）、一次性相对（`+10m`）、一次性绝对 ISO（`README.md:98-104`、`src/schedule.ts:328-352`） | `at`（一次）、`every`（`m/h/d/w`）、`day`/`week` + `HH:mm` + **显式 IANA timezone**；**cron 明确推迟**（"Month/year recurrence, cron, queue/replace overlap … intentionally deferred"）（`docs/missions.md:100-160`） |
| 作用域与持久化 | **会话作用域**：`<cwd>/.pi/subagent-schedules/<sessionId>.json` + PID 文件锁；`/new` 重置、`/resume` 恢复；`session_start` 装填、切换/关闭时停止（`src/schedule-store.ts:14-18,52-54`、`src/index.ts:776-783,844,1104-1107`、`README.md:112`） | **项目作用域为默认**：项目内任一 pi 会话先认领即触发并把通知给该会话；`sessionOnly: true` 绑定创建会话；`storeRoot` 可移出仓库；多会话须版本兼容（`docs/missions.md:87-108,150-160`、`docs/configuration.md:494-508`） |
| 是否真的会跑 | **会**：到点调用 `manager.spawn(..., {isBackground:true, bypassQueue:true})`，结果走普通后台完成通知（`src/schedule.ts:245-270`、`README.md:106`） | **会**：每次 fire 都走常规显式 launch，始终 async + 全新上下文；失败/停止仍唤醒会话，`quiet`（仅 recurring，成功且不唤醒父会话）（`docs/missions.md:110-160`） |
| 冲突/补跑策略 | 无重叠策略相关文档；一次性时间点已过则不再触发（`src/schedule.ts:186-191`） | `overlap` **固定为 `skip`**（不可配）、`catchUp` = `latest`(默认)/`none`；手动 `schedule.run` 会“消费”下一次自然触发（`docs/missions.md:150-160`） |
| 组合限制 | 与 `inherit_context`/`resume` 互斥；`run_in_background: false` 被拒（定时任务总是后台）；绕过 `maxConcurrent`；`pi -p` headless 不等待定时子代理；**没有 scheduled workflow**（`README.md:117-120`、`src/index.ts:2048-2052`、`docs/workflows.md`） | schedule 必须指向 workflow；无 `missionId` 时禁用 mission 创建、无 `state` 全局；mission 必须先存在（只接受既有 `missionId`） |
| 守护进程/外部触发 | 只有进程内 timer：**没有 pi 会话持有 scheduler 就不会触发** | 同样不是 daemon，但提供 `schedule.run-due` 供外部启动器触发到期工作（`docs/missions.md:158-159`） |
| 总开关与成本 | `schedulingEnabled`（默认 true）关闭时从 `Agent` 工具规格中剥离 `schedule`（“zero LLM-context cost”）（`README.md:114`、`src/index.ts:1282-1290`） | `scheduledRuns.enabled=false` 同时从 `subagent` 工具移除 schedule 参数并从所有入口拒绝 `schedule.*` action（`docs/configuration.md:494-508`） |
| 相关但非调度的循环 | 无 mission/goal 概念 | missions = 持久记录 + 交付 receipt + 目标模式；**目标 mission 只发 needs-attention 通知，绝不自行启动或重规划**；watchdog 是 opt-in 对抗式复核者（边界/节奏/LSP），**无 idle timer 复核**（`docs/missions.md:7-80`、`docs/watchdog.md:3-14,145-190`） |

**重要澄清（避免把我们的验证缺口当成产品限制）**：tintinweb 的 `schedule` 在钉住版本里**确实会触发真实后台运行**（`src/schedule.ts:245-270`）。06 运行时验证只观察到 `subagents:scheduler_ready {sessionId, jobCount:0}`（即“装填/发现”），**从未真正 fire 过定时任务**——这是本方验证覆盖缺口，不是候选的“仅发现不触发”限制（`06-runtime-validation/report-nofee.md:43`、`runs.json`）。

## 5. 有意义的取舍（不是功能计数）

1. **调度语义是两种产品哲学**。tintinweb 把 cron 放进模型可调用的 `Agent` 工具、会话内、进程内 timer：轻、可被模型自主安排，但**没有会话就没有触发**，且没有冲突/补跑策略。nicobailon 把调度做成项目级持久定义 + mission 账本（`state.get/set`、receipt、goal 通知），有 tz/日历/`skip`/`catchUp`/`quiet`，但没有 cron，并显式声明“不做 daemon”、goal 绝不自动开工。需要“模型自己安排一次未来执行”时 tintinweb 更直接；需要“可恢复、可审计、跨会话的重复工作”时 nicobailon 的模型更完整，代价是脚本必须是 workflow 且多会话版本兼容。
2. **取消与成本读数的耦合**：tintinweb 的成功取消会让终态 `usage/tokens` 归 null（06 实测，0.22.0 已发布行为），且模型侧**没有停止工具**。**null 不能被当作完整性豁免**：它只是该通道在取消场景下的读数缺失，成本观察需要独立捕获（例如子会话转录/其他可用通道）并单独标注归因；缺读数不等于该执行无成本，也不因为这里读不到就被判为“已覆盖”或被排除在完整性判定之外。nicobailon 提供模型可见的 `stop`/`interrupt`，并把“stopped 不可 resume”写进契约，但本票未验证其取消终态的用量读数行为。
3. **嵌套的可观察性差异是结构性的**：nicobailon 嵌套运行有 id 与状态树、可 `status`/`interrupt`/`resume`；tintinweb 嵌套子代理被刻意过滤出总线/注册表，消耗只折算进父记录，且默认不落独立 session 文件（可由 per-agent `persist_session` 覆盖）。对以“观察每个子代理执行”为目标的下游，前者可寻址，后者在公开面上不成立——这不是“功能多少”，而是证据可达性的差别，且 tintinweb 侧的可达性取决于该 fallback 路线是否成立，本票不预先认定它成立。
4. **自主调用的可用性闸门**：nicobailon 默认 `auto` 下用 `subagents_enable` 装载器（仅对支持会话中加工具的模型生效，`dynamic` 强制装载器、`eager` 不注册装载器），目的是避免 provider 丢 prompt cache；tintinweb 直接注册 `Agent` 且默认后台，首回合即可并发派发。这是**可用性/上下文成本**的差别：装载器不执行派发也不从关键词推断授权，`eager` 也未被本票验证会改变工具描述中的授权规则文本；tintinweb 的等价约束落在并发池与 join 模式上。
5. **宽度治理 vs 深度治理**：tintinweb 只有深度上限，明确不设宽度/spawn 预算（“bounds how deep, not how wide”）；nicobailon 有 per-run 64、并发 20、可选 per-session 与 active-run 上限、不可退还 claim、以及可授予的追加预算。对成本可预测性，nicobailon 是**按构造受限**，tintinweb 依赖“每次 spawn 要花父代理一个回合”这一间接约束。
6. **发布面与积压的方向相反**：nicobailon 30 天 14 次发布、0 开放 PR，但版本号快速滚动（0.78.0，146 个版本）意味着钉住版本会快速落后（main 已领先 16 个提交）。tintinweb 30 天 3 次发布、63 开放 issue + 44 开放 PR，版本面小、变更少。**两者的共同点只有“提交高度集中单一作者”（87.3% / 83.1%）**，bus factor 未知；issue 关闭时延样本小且口径不一，本票不作为结论。
7. **宿主兼容证据强度**：tintinweb 用 CI 明确钉住下限 1.1.0 并跑 floor job（硬失败）+ latest canary（软失败），但 CI 无 Windows job；nicobailon 的 peer 范围更宽（`*` + optional），standalone 后台目标窄（Pi 0.86.1 Linux x64），Windows 仅 experimental，单测 CI 覆盖 `windows-latest`。**本票不新增运行时证据**：tintinweb 的 Windows 可用性证据只来自 ticket 06 的有范围实跑（Windows 10.0.26200、固定 npm 0.22.0、06 自列未覆盖项），nicobailon 在本机 Windows 无运行时证据；因此不能说任一候选“已在 Windows 端到端可用”。nicobailon 的 0.78.0 明确修复了 Pi 1.2.0 上的后台子代理不可用问题。

## 6. 限制与未验证

- 星标/fork/下载量是采用度指标，**不能当可靠性**；下载量还包含 CI、镜像与重复安装。
- 近 30 天提交窗口按 committer 时间服务端过滤，rebase/cherry-pick 会移动时间；计数含 merge commit，因此“提交数”不等于“变更数”，与“活跃日”“发布数”三者不能互相替代。
- issue 计数：仓库字段 `open_issues_count` 混入 PR，故用检索 API 拆分；检索总数可能滞后于实时列表，nicobailon 的 30 天 issue 数取自 items 列表（最新 100 条内统计），非检索总数。
- 贡献者统计只含 GitHub User（`anon=1` 条目未计入），且含 `claude` 等疑似自动化身份；**提交占比只能证明“单作者主导提交”，不能推出 bus factor、决策权、发布权或知识分布**——本票不结论 bus factor。
- 已关闭 issue 的“关闭时延”只覆盖近 30 天、最近 100 条 items 内的样本（tintinweb n=11，nicobailon n=44），不是全量分布，且受 backlog 政策、重复合并、机器人关闭影响；该指标口径粗，主会话不应据此做维护质量结论。
- 能力断言全部是**钉住 commit 的静态证据**（文档 + 源码行）：未安装、未构建、未测试、未调用模型；nicobailon 完全没有运行时验证，tintinweb 的运行时结论只来自 06 的受限场景（并明确列出了未覆盖项）。
- Windows 证据：**本票不新增任何运行时证据**。唯一的本机 Windows 实跑来自 ticket 06（`Windows 10.0.26200`、`node v24.18.0`、宿主 pi 1.2.0、固定 npm `@tintinweb/pi-subagents@0.22.0`），其覆盖面由 06 的未覆盖清单限定；nicobailon 在本机 Windows 无运行时证据（只有 `windows-latest` 单测 CI）。因此任一候选“在 Windows 可用”的强度都取决于它自己的那份证据，不能互相推论。
- 两个仓库的“本地 git TS 入口”与“npm 发布工件入口”不一致（尤其 nicobailon 走 `build:pkg`），本票未逐字节比对 dist 与源码；钉住版本 = npm `latest` 仅指版本号相同，不构成工件等价证明。
- 本票未评：安全模型深度、代码质量、真实 fork/PR 质量、license 之外的法律事项、跨平台端到端可用性、两个扩展在同一会话内的互操作性（已知两者都有 `Workflow`/`SubagentWorkflow` 让位逻辑，但未验证共存）。
- 时间口径：本机工具时钟为 UTC 2026-10-15T18:12Z，而项目日期语境为 2026-10-16（UTC+8）；服务端 `pushed_at` 与 release 时间与该时钟一致（最新 push 2026-10-15T13:51:30Z），未发现时钟偏移，但所有“近 N 天”数字都以该时刻为基准。

## 7. 证据文件

- GitHub API 原始响应（本次抓取）：`research/raw/tintinweb-{repo,releases,tags,contributors,commits-30d}.json`、`research/raw/nico-{repo,releases,tags,contributors,contributors-p2,commits-30d}.json`。
- 逐候选能力原始笔记：`research/raw/notes-tintinweb-capability.md`、`research/raw/notes-nico-capability.md`（由两条 scout 产出，含逐行 `路径:行号` 证据）。
- 内部运行时证据（tintinweb）：[report-live.md](06-runtime-validation/report-live.md)、[report-nofee.md](06-runtime-validation/report-nofee.md)、`06-runtime-validation/live-runs.json`、`runs.json`。
- 上游主源：`tintinweb/pi-subagents@v0.22.0`（`README.md`、`docs/workflows.md`、`docs/rpc.md`、`docs/packages.md`、`CHANGELOG.md`、`src/**`、`.github/workflows/ci.yml`、`package.json`）；`nicobailon/pi-subagents@v0.78.0`（`README.md`、`docs/workflows.md`、`docs/missions.md`、`docs/tool-reference.md`、`docs/configuration.md`、`docs/standalone-background.md`、`docs/observability.md`、`docs/watchdog.md`、`CHANGELOG.md`、`VISION.md`、`AGENTS.md`、`src/**`、`.github/workflows/{test,release}.yml`、`package.json`）。
- 未使用：gotgenes 旧对照材料（按票要求不作为现行证据）。
