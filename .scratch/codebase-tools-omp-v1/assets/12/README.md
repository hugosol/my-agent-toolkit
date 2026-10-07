# 12 — 两套自动化套件在 18.5.0 全绿的验收证据

> 本文件是本票（P33）的**结果记录**，不是 runbook（票 14）或支持记录（`docs/agent-runtime-support.md`）。
> 结论：`tests/harness/`、`tests/framework/`、`tests/codebase-tools/` 三套在固定基线上全绿；
> B1–B11、C1–C14、N1–N10 均有对应检查或记录类结论；C15 为文档审阅项，见 §5。

## 1. 固定基线与可重复运行命令

| 项 | 值 |
|---|---|
| 运行/验收产物 | 隔离精确安装 `@oh-my-pi/pi-coding-agent@18.5.0`（`.cache/omp-baseline/18.5.0`） |
| 修订锚点 | 本地 checkout `oh-my-pi@9348320`（= 18.5.0），与产物在 6 个契约文件上 byte-identical（`docs/agent-runtime-baseline.json`） |
| 平台 | win32 x64 + Bun 1.4.2 |
| 隔离 | 每次运行 temp `PI_CODING_AGENT_DIR` / session dir / cwd / capture dir；`--no-extensions -e <path>`；清 `OMP_PROFILE`、`PI_PROFILE`、`XDG_*`、`OMP_AUTH_BROKER_*`（`tests/harness/{env,run-root,session}.ts`） |

命令（仓库根，`bun install` 一次后即可重复执行）：

```
bun run test:harness          # tests/harness       — 基线记录 + 受控会话驱动自检
bun run test:framework        # tests/framework     — C1–C15 必须语义（兼升级回归警报）
bun run test:codebase-tools   # tests/codebase-tools— B1–B11 消费者可见行为
bun test                      # 全部
bun run typecheck             # tsc --noEmit
```

观察到的结果（原始输出即本目录下同名 `.txt`）：

| 命令 | 结果 | 原始输出 |
|---|---|---|
| `bun run test:harness` | 9 pass / 0 fail（2 files, 2.30s） | `harness-suite.txt` |
| `bun run test:framework` | 78 pass / 0 fail（10 files, 4.3s） | `framework-suite.txt` |
| `bun run test:codebase-tools` | 24 pass / 0 fail（7 files, 35.8s） | `codebase-tools-run1.txt`（连续第 2、3 次：`codebase-tools-run2.txt`、`codebase-tools-run3.txt`，均 0 fail） |
| `bun test` | 111 pass / 0 fail（19 files） | `all-suites.txt` |
| `bun run typecheck` | 无诊断输出 | `typecheck.txt` |

重复性：真实运行时套件（codebase-tools）连续 3 次独立运行（各自新建 run root / 临时 agent state）均 0 fail。

## 2. 覆盖矩阵（本票核对的 B/C/N → 检查位置）

观察面只有消费者可见面：真实运行时套件读 session JSONL、出站请求、UI 帧（marker/notify）、stderr、loader 发现；
框架套件在已批准的 S2 seam（`defineExtension` / `ompAdapter` + 可注入 test adapter / loader 形态的 native double）上读框架决策效果。

### A. codebase-tools 消费者可见行为（tests/codebase-tools/）

| ID | 覆盖位置 | 观察到的判据 |
|---|---|---|
| B1 | `command-toggle` "a session that never toggles records no state and contributes nothing"；`marker-lifecycle` "a default-off session shows no marker; the toggle shows…" | 无 state 条目、无 `codebase-tools:*` 贡献、无 notify/setWidget 帧；同轮出站无 init/reminder |
| B2 | `command-toggle` "two runs of /codebase-tools persist each new value and announce it"；`marker-lifecycle` 同上 | `{enabled:true}`/`{enabled:false}` 各一条 + `codeBaseTools enabled`/`disabled` + marker 显示/清除 |
| B3 | `init-injection` "one hidden persisted init is appended once per user turn, across a tool continuation" | 恰好 1 条 `codebase-tools:init`，`display:false`、`attribution:"agent"`、尾部（挂在当轮 user 条目下） |
| B4 | `reminder-injection` "three enabled turns inject one init and then exactly one reminder per turn" | 分支上 `[init, reminder, reminder, reminder]`，每条挂在各自的 user 轮 |
| B5 | `init-injection` "the persisted init is replayed on resume and no second init is injected" | 随轮落盘、resume 重放同一条、历史 append-only |
| B6 | `marker-lifecycle` 3 个 test | 每启用轮重设、off 清除、resume 后首轮才渲染、`--no-ui` 整体 no-op（通知走 stderr） |
| B7 | `reminder-injection` "the off turn injects nothing and the re-enabled turn carries the reminder, not a second init" | off 轮无注入、历史/进度不清除、再 on 走 reminder |
| B8 | `session-boundaries` 7 个 test | resume 读回新写值；旧 `{on}` 不读 → off；new → off；`/tree` 只重算 init 不改 `enabled`；branch/fork 从目标 branch seed；无 State 的 fork → off |
| B9 | `subagent-owner` 2 个 test | 真实内建子代理实时跟随 owner（off→静默，on→各自 init 进度）、嵌套逐级上溯、子代理无 State 写入 |
| B10 | `init-injection` "the turn's tool set is unchanged by enabling…"；`framework/injection` "each slot's text is its own resource file, loaded unmodified" | 两个 `.md` 独立按文本加载；启用只加文本，工具集前后一致（不探测/裁剪能力） |
| B11 | `reminder-injection` "navigating the tree back past the init puts the next run back to init, then to reminder"；"a tool continuation inside the run leaves the reminder count at one" | 同一 run 多请求只注入一次；branch 缺 init 时重新 init |

### B. 框架能力（tests/framework/，兼升级回归警报）

| ID | 覆盖位置 |
|---|---|
| C1 | `import-boundary` 3 个 test（core/behaviors 与扩展共享源不 import 运行时类型；escape hatch 只出现在 adapters/runtimes；薄入口只 re-export） |
| C2 | `control` "two sessions keep independent values even though they share the registry label"、"the read view exposes no mutation…"、"a transition updates the owner it names…"；`owner-inheritance` "a command in a subagent writes nothing and announces nothing" |
| C3 | `owner-inheritance` 3 + 3 个 test；`subagent-owner`（真实路径，见 B9） |
| C4 | `session` 7 个 test；`session-boundaries`（新写 `{enabled}` → resume 读回；legacy `{on}` 不读） |
| C5 | `control` "persistence is attempted before the marker and feedback…"、"feedback goes to stderr when the session has no UI, and the command still completes" |
| C6 | `session` "a tree navigation reseeds nothing…"（tree 非边界）；`reminder-injection` tool-continuation；`init-injection` tool continuation |
| C7 | `injection` 13 个 test（槽位策略、一槽位一规则、一 run 至多一条贡献、声明顺序无关） |
| C8 | `init-injection` append-only + resume 重放；`injection` "a re-entered delivery plans the same contribution and writes no State" |
| C9 | `outbound-role` 3 个 test（deepseek=`user`、codex=`developer`（shape-only 层1）、角色不作门槛） |
| C10 | `marker` 5 个 test（单一框架 key、按 `id` 稳定排序、State 驱动、无 UI no-op） |
| C11 | `injection` "each slot's text is its own resource file…"；`deployment` "…Markdown text and bare dependency resolve with 0 errors" |
| C12 | `deployment` 8 个 test（只发现一个薄入口、无根 `index.ts`、发现目录外解析、真 CLI 隔离运行） |
| C13 | `admission` 13 个 test；`admission-notice` 2 个 test（真实运行时） |
| C14 | `admission` "a missing required semantic refuses the binding and registers nothing"（可注入 test adapter **真跑**拒绝路径）、"…refuses even when the version is also unlisted, and the two are not conflated"（两触发不混同）、"a native surface without the framework's append-only paths is refused, not degraded"（OMP native double） |
| C15 | **无自动检查** — 文档审阅项，见 §5 |

### C. 负例（N1–N10）

| # | 覆盖位置 / 记录 |
|---|---|
| N1 | `admission-notice` 2 个 test（真实运行时：每 main 会话一次 warning，随后继续；无 UI 走一行 stderr）；`admission` unlisted-version 组 |
| N2 | `admission` required-semantics 组（显式拒绝、无部分注册） |
| N3 | 记录类：`control` "a failed record does not change the feedback or the authoritative current value" — 断言的是「扩展侧不可观测落盘失败、内存当前值权威」，故按 §10 记为不可由扩展断言，不作 durability 证据 |
| N4 | `owner-inheritance` "an unresolvable owner degrades to off" 组（父链离开进程 → off、不可 toggle、一次 best-effort stderr） |
| N5 | `session` "missing, unknown, or malformed State data falls back to off"；`session-boundaries` legacy `{on}` 不恢复 |
| N6 | `definition` "configuration conflicts (P16, N6)" 组：同名命令 / 同字段双写者 / 同槽位多规则各自显式错误，且不中断运行时 |
| N7 | `definition` "initialization and binding failures (P17, N7)" 组：放弃 binding、不留部分注册、正确实现可继续绑定 |
| N8 | `deployment` "load-source mutual exclusion (N8)" 组：explicit-only 根不发现 sibling 旧实现；loader 不按名去重（所以互斥只能来自装载来源） |
| N9 | `marker-lifecycle` headless；`framework/marker` "a session with no UI"；`control` stderr 路径；`admission-notice` headless |
| N10 | 记录类：`docs/agent-runtime-support.md`「First-release limitation: one main session per process」+ `docs/semantic-extension-framework-backlog.md`；**无测试断言该形态**（`tests/framework/owner-inheritance.test.ts` 头部显式声明 N10 为记录而非断言） |

## 3. 断言审查

方法：对 `tests/**` 全量逐文件审阅 + 定向检索（`toBeGreaterThan|not.toThrow|toBeTruthy|toBeDefined|toMatchSnapshot|skip|todo|only`），逐条核对「期望值是否有独立来源」。

| 类别 | 结论 |
|---|---|
| wiring / copies / forwarding | 无。真实运行时套件只读消费者可见面（JSONL、出站请求、UI 帧、stderr、loader 发现）；框架套件在 S2 seam 上读框架决策效果（落盘值、通知文案、widget 内容、binding failure kind），不读内部实现形状 |
| mock echo | 无。double 记录调用、不回放被测值；断言对象是框架行为。mock 不冒充 provider / task / TUI（`capture-server.ts` 头注释、`outbound-role` shape-only 标注） |
| 源码文本 | 仅 `tests/framework/import-boundary.test.ts` — C1 判据本身是模块依赖图与薄入口形状，无法由运行观察，故读源（并在头注释说明理由） |
| 套套逻辑 | 未发现。期望值来自契约/验收矩阵字面量（身份 `codebase-tools:init|reminder|state`、通知文案、`{enabled}` 值、`binding` failure kind），或来自独立资源文件（`extensions/codebase-tools/prompts/*.md` 的字节） |
| 仅非空类 | 存在若干 `toBeGreaterThan(0)` / `toEqual([])`，逐条核对后**全部是防空洞对照或守卫**（如「turn 真的跑了，所以上面的空断言不是空会话」「检查有主语」「0-error 结果的对照」），且与具体值断言成对出现；无一处是某个判据的唯一证据 |
| 跳过 / 待办 / 快照 | 无 `skip`、`todo`、`only`、`toMatchSnapshot` |
| 临时探针 | 未提升为永久回归：`.scratch/.../assets/03|11` 的探针与本次诊断探针 `.cache/probe-subagent-order.ts`（已删除）都不在 `tests/` |

## 4. 本票发现并修复的问题

1. **真实子代理解析的排序 flake（已修）**：`tests/codebase-tools/subagent-owner.test.ts` 用 `spawnedSessionFiles` 的 mtime 顺序把两个同层子代理文件映射成 off/on 角色。
   实测同一轮的兄弟子代理 session 文件由运行时**成批 flush**（探针观测 mtime 相差 1.5 ms），顺序不保证 → 断言间歇性失败（一次 `codebase-tools` 套件运行中 `childOff` 收到 1 条 init）。
   修复：新增 `spawnedSessionFileCarrying(sessionFile, marker)`（`tests/harness/session-log.ts`），按「该子代理自己记录的那一轮文本」识别它；断言改为比对识别结果与被发现的文件集合，并把 hazard 写进 reader 文档。嵌套层级仍按 depth 排序（可靠）。
   修复前的失败原始输出：`codebase-tools-failure-before-fix.txt`；修复后 `codebase-tools-run{1,2,3}.txt` 连续 3 次 0 fail。
2. **N10 记录/断言的区分（已修）**：`owner-inheritance.test.ts` 的 describe 曾带 N10 标签，实际断言的是「父链离开进程」的 N4 场景；改为 P8/N4，并在文件头显式说明 N10 属记录类结论（`docs/agent-runtime-support.md`），本套件不断言同进程多 main 形态。

## 5. 未覆盖 / 未验证 / human-led（不得作为通过证据）

| 项 | 状态与理由 |
|---|---|
| **C15**（能力与选项清单文档） | **未满足**。该判据的证据类型是文档审阅，产物 `docs/framework-capabilities.md` 属票 13，当前仓库中不存在；本票不能以测试覆盖它（任何文档内容断言都会 pin 文案，且对缺失产物必然红）。 |
| H1 交互 TUI 视觉（marker 渲染/notify/命令） | human-led（票 15）。自动面只有等价 UI 帧（`marker-lifecycle`），不得当作视觉验收。 |
| H2 openai-codex 层 2 真凭据送达 | `unverified`。`outbound-role` 只做层 1 shape-only；真实往返由人提供凭据后执行（票 11/15），不得用本地 capture 冒充。 |
| 真实后台 fork（`/tan`） | 无自动路径（运行时无 `before_subagent_spawn` 通道）；框架侧按 N4 降级覆盖，真实 fork 记 unverified。 |
| 持久化落盘失败（N3） | 扩展侧不可观测，按记录类结论处理（见 §2.C/N3）。 |
