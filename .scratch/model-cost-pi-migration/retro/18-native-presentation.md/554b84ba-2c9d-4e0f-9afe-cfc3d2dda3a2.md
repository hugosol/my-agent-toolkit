# Retro — 18-native-presentation.md

## Provenance

```json
{
  "feature": "model-cost-pi-migration",
  "ticket": "18-native-presentation.md",
  "run_id": "554b84ba-2c9d-4e0f-9afe-cfc3d2dda3a2",
  "agent": "tdd",
  "agent_id": "18-native-presentationmd-e90e7b86-e773-4a29-9646",
  "session_id": "01a14415-1cc2-77d1-bf8d-ce8e235eda45",
  "session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-16T05-05-31-422Z_01a14319-df1e-77c0-a324-421dfc10d49e\\18-native-presentationmd-e90e7b86-e773-4a29-9646.jsonl",
  "parent_session_id": "01a14319-df1e-77c0-a324-421dfc10d49e",
  "parent_session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-16T05-05-31-422Z_01a14319-df1e-77c0-a324-421dfc10d49e.jsonl",
  "workspace": "E:\\Developer\\myhub\\my-agent-toolkit",
  "execution_cwd": "C:\\Users\\hugos\\AppData\\Local\\Temp\\hyper-ticket-FSo4Py",
  "tdd_status": "completed",
  "started_at": "2026-10-16T09:39:56.724Z",
  "tdd_finished_at": "2026-10-16T10:01:32.114Z",
  "retro_finished_at": "2026-10-16T10:02:46.136Z"
}
```

## Retrospective

# 复盘：ticket 18「两端原生展示与实时 context」TDD 执行轮

**范围与来源**：本文件只复盘本 ticket 的执行轮（agent `18-native-presentationmd-e90e7b86`，worktree `C:\Users\hugos\AppData\Local\Temp\hyper-ticket-FSo4Py`，集成分支 `pi-adapter`）。依据是本轮会话与工具结果：`bun install --frozen-lockfile`、`bun run typecheck`（exit 0）、`bun test tests/model-cost`（443 pass / 0 fail）、`bun test` 6 个 pi 套件（35 pass）、提交 `acd18d2`，以及本轮临时调试脚本的输出。未取到的历史（其他 ticket、父 session 的决策过程）不补造；推断与未验证项逐条标注。

**本轮结果（事实）**：交付了 `framework/adapters/pi.ts`（`mode`/组件形态类型）、重写的 `extensions/model-cost/harnesses/pi/widget.ts`（component/lines 双形态、自持列布局、宽度适配、主题映射、已处置 ctx 处理）、`harnesses/pi.ts` 的 `observeSessionContext`（逐 binding 公开 context 读数 + 释放），以及两个新套件与共享 host（12 + 3 例全绿）。**未完成**：真实宿主运行与 evidence 文件、组装级「子会话读数画进主会话树」的核对（改以 registry 级断言替代）、P46 的 OMP 侧复跑、文档同步、故障注入复核。收尾由宿主的请求预算上限（200）强制触发。

## 建议（按严重度）

### 1. 仓库没有任何守卫（guardrail）——建议补上 typecheck 钩子与一条 CI job

本轮的机械性错误（调试期把 `SessionFacts` 传给了 `expect HostSession` 的 `command()`，`tsc` 报 TS2739）碰巧被我自己记得跑 `bun run typecheck` 拦住；如果当轮没有跑，它会被提交进去。而仓库现状是：无 `.github/`（无 CI）、无 husky、`git config core.hooksPath` 未设置、本 worktree 连 `.git/hooks` 目录都不存在；`package.json` 里 `typecheck` / `test` 脚本齐备却没有任何东西调用它们。

建议：加一个 pre-commit 钩子跑 `bun run typecheck`（秒级、确定性、覆盖全部 TS 变更），再给 CI 加一条 job 跑分区测试（`bun test tests/framework tests/model-cost` 之类）——全仓 `bun run test` 成本高（既有 evidence 记录约 400+ s，且 dock 需要 `OMP_BOT_BINARY` 与去除 CRLF 的检出条件），所以 CI 先跑「框架 + 扩展」两个分区、把全仓留给最终门禁更贴合本仓现实。这类「票据要求每次 typecheck、却无人强制」的缺口，靠每张票的纪律无法收敛，只能由守卫兜住。

### 2. codebase-memory 的索引没有跟随本 ticket 的 worktree——存在「静默答错」风险

任务提示明确要求优先用 codebase-memory 工具，但 `list_projects` 显示本仓只索引了 `E:/Developer/myhub/my-agent-toolkit`（`branch: pi-adapter`，即**集成分支的主检出**）与一个更早的 `hyper-ticket-wK2iNw` 临时 worktree；本轮的 `.../hyper-ticket-FSo4Py` **不在列表里**，其 `index_status`（project `my-agent-toolkit`）返回的 `root_path` 也是 `E:/Developer/myhub/my-agent-toolkit`。也就是说，在本 ticket worktree 内调用图工具，回答会来自另一个检出、另一条分支，且返回的是 `E:\...` 路径。

本轮没有真的用图工具查符号（用的是 `grep` / `read`），所以这是一次**未命中的险情**，不是已发生的错误结论；但配置事实是确定的。建议：宿主在派发 ticket worktree 时把该 worktree 也索引（或提供一张「worktree → project」映射），或者在 `AGENTS.md` 用一行指针说明「本仓图索引指向主检出，回答先行核对 `list_projects` 的 `root_path` 是否等于当前 worktree」。后者成本极低，且能挡住最坏的情况：一个看起来合理、实际来自别的树/branch 的答案。

### 3. pi 装配的单测脚手架被重复推导 8 次，且两条关键规则无处可查

`grep -rln "configBaseDir: REPOSITORY_ROOT" tests/` 命中 8 个文件（`pi-budget-actions`、`pi-period-reset`、`pi-runtime-gaps`、`pi-session-accounting`、`pi-session-span`、`pi-terminal-rounds` 与两个 dock fixture），因为框架「每个进程只读一次某扩展的配置」（`framework/core/config.ts` 的 `validatedConfigs` 按 extension id 缓存），每个套件都得自己手拼装配并把 `storageDir` 覆盖成本套件的临时根。我第 9 次重写它时踩到两条**没有任何文档提到**的规则：

- **（事实）** runtime 的 `harness` 必须与种子文档的 `harnesses` 键同名，否则 `view.identities()` / `periodSessions()` 全为空。我用临时脚本验证：`harness: MODEL_COST_HARNESS`（`"pi"`）对 `harnesses["pi-context-harness"]` → 打印 `[] []`；换成同名后同一组合立刻读出两条 identity 记录与两条 session 记录。代价是：树一直画不出东西，我先怀疑文档 schema、再怀疑初始化节点，最后才怀疑分区键。
- **（事实）** 同一个 `piAdapter` 工厂被绑定两次时共享缓存下来的 runtime——这是「一个进程一个业务实例」的正面用法，但同样只存在于读代码。

**未验证**：把测试文件的 `harness` 改成同名后，该 fixture 的 identity/period 仍然是空（调试打印 `[] []`），我在预算耗尽前没有查明原因；所以不能把第 1 条当成它的完整解释。

建议：把这段脚手架收进 `tests/model-cost/support/pi-assembly.ts` 一处（隔离 config 根、覆盖 `storageDir`、`harness` 与文档同名、两 binding 共享 runtime 四条注释写清），并让它在读完种子文档后**立刻断言** `view.identities().length > 0`。一行 fail-fast 把「静默画空树」变成有名字的失败，这比再多写一段说明更值；同时把 `docs/agents/testing.md` 里「pi 装配为何要手拼」补一句指针，因为那正是本轮最贵的探索。

### 4. 把「seam 先行」写进执行顺序：昂贵且决定验收的核对不要留到最后

本轮把预算几乎全部投给 hermetic 层的布局/主题打磨（列对齐、缩写、换行、主题 token），而本票验收的核心是「**两端实际运行**」：真实 pi 进程读 `setWidget` 帧、真实 OMP dock 回归。真正会阻塞这一条的，是「组装级 fixture 文档不加载」与「本票尚无真机脚本」——两者都在收尾前才浮出水面，此时预算已尽。这是执行顺序问题（推断），但对结果的杀伤最大。

建议：在 `docs/agents/testing.md`（本仓已有、且本轮确实读到的文件）加一句命名阶段，例如 **seam 先行**：先让「真实宿主 / 跨进程 seam 的最小路径」跑通或明确失败，再打磨确定性细节。用词比句子有力：一个已经活在该文件里的短语，就能让后续 agent 把最贵的未知项排在第一位。票据里同义的要求已经写了（「实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径」），重复一遍不如给这个顺序一个名字。

### 5. 票据样板与 evidence 形态：单一来源 + 指针

**（事实）** 25 个 implementation 票据里 25 个都带同一段「执行与证据约束」（`grep -c` 计数 25/25），内容与 `docs/agents/testing.md` 存在重叠；而「本轮证据写进 `.scratch/.../evidence/<NN>-*.md`、按源/版本/命令/结果/未覆盖项分节」这一形态，只能靠打开既有 evidence 文件反推——`docs/agents/` 下只有 `domain.md`、`issue-tracker.md`、`testing.md`、`triage-labels.md`，没有执行约定与证据模板。结果：每张票都要重述一遍政策（易漂移、且淹没了该票真正的 delta），证据文件则全靠模仿。

建议：把共享约束收进 `docs/agents/ticket-execution.md`（或并入 `testing.md`）+ 一个 evidence 模板，票据只留一行指针；这既是去重，也是把「本轮该留什么证据」从认知负担变成可查事实。

### 6. 新 worktree 的 `node_modules` 前置条件写进 AGENTS.md

**（事实）** 本 worktree 起始没有 `node_modules`，第一次 `bun run typecheck` 直接以 `bun: command not found: tsc` 失败，需先 `bun install --frozen-lockfile`。这是 agent 只能「撞到才发现」的事实，正好是 `AGENTS.md` 该缓存的那类：一行「每个 ticket worktree 先跑 `bun install --frozen-lockfile`」即可。现有 `AGENTS.md` 只有 848B / 四个指针，加这一行不会挤掉别的。

### 7. 两处宿主级摩擦（供宿主自身修补，不必落到仓库）

- **规则提醒在写入之后到达**：`write` 整个 `harnesses/pi/widget.ts` 时，`ts-set-map` / `ts-no-tiny-functions` / `ts-no-inline-cast-access` 三条内置规则是在文件已落盘后才以 reminder 形式返回（其中 `ts-no-inline-cast-access` 那处随后被我回头改成一次性构造），意味着「按规则写」要靠 agent 事后自查一轮。建议让这些规则在写入前可见（或作为一次 lint pass 报出），并把它们接到第 1 条的守卫里——如果它们是硬标准，就该由确定性检查执行，而不是靠每轮提醒。
- **`bash` 参数校验不稳**：两次带 `ready: false` 的调用被拒（`- ready: ready must be an object (was boolean)`），`ready: null` 通过；布尔值在「object 或 null」的 schema 下本应稳定失败，实际表现像间歇性错误，每次多花一个往返。

## 本轮确实有效的部分（保持）

- `AGENTS.md` 的四个指针与 `docs/agents/testing.md` 的分层（迭代用受影响文件、票完成用分区、最终集成用全仓 + typecheck）在需要时都能直接命中，没有浪费探索；`GLOSSARY-MAP.md` 与多上下文 glossary 的组织也清楚。
- 票据/契约/spec 随任务自动加载，本轮的实现依据（P43/P44/P46 的 seam 与覆盖要求）无需再去翻上游文档，方向没有跑偏。
- 共享支持文件的既有约定（`tests/<area>/support/*`、`portDouble`、`uiBoundaryTimer`）让新套件能自认领一份 host double 并复用既有夹具风格；本轮新增的 `tests/model-cost/support/pi-host.ts` 正是沿这条约定走的。
