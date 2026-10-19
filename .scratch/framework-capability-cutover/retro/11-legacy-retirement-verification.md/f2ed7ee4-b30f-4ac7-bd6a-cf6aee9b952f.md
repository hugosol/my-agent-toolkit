# Retro — 11-legacy-retirement-verification.md

## Provenance

```json
{
  "feature": "framework-capability-cutover",
  "ticket": "11-legacy-retirement-verification.md",
  "run_id": "f2ed7ee4-b30f-4ac7-bd6a-cf6aee9b952f",
  "agent": "tdd",
  "agent_id": "11-legacy-retirement-verificationmd-39b57f6a-294",
  "session_id": "01a1542a-32e2-776a-b359-fafa1fa3077e",
  "session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-19T10-03-06-014Z_01a1539d-639e-70ea-9249-f5515c657de5\\11-legacy-retirement-verificationmd-39b57f6a-294.jsonl",
  "parent_session_id": "01a1539d-639e-70ea-9249-f5515c657de5",
  "parent_session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-19T10-03-06-014Z_01a1539d-639e-70ea-9249-f5515c657de5.jsonl",
  "workspace": "E:\\Developer\\myhub\\my-agent-toolkit",
  "execution_cwd": "C:\\Users\\hugos\\AppData\\Local\\Temp\\hyper-ticket-zsv7sz",
  "tdd_status": "completed",
  "started_at": "2026-10-19T12:36:54.082Z",
  "tdd_finished_at": "2026-10-19T12:50:31.223Z",
  "retro_finished_at": "2026-10-19T12:52:35.159Z"
}
```

## Retrospective

# Ticket 11 TDD 执行复盘

## 范围与总体判断

- **事实**：本次复盘基于本票子代理会话日志（656 行，session_id `01a1542a-32e2-776a-b359-fafa1fa3077e`）及工具结果，未读取父 session。分支为 `hyper/framework-capability-cutover/11-legacy-retirement-verificatio-821241-e1e098c5b064`，最终提交 `6abdefe`，工作树干净。
- **事实**：变更仅 7 个文档 + 1 个 evidence README，没有生产或测试源码改动。最终验证：typecheck 0；framework 633/0；codebase-tools 24/0；connect-bot 142/0（真实 panel）；model-cost 518/0；`check:integrations` 0；临时探针 `failures: []`。
- **事实**：本次共 231 次工具调用，其中 bash 156、edit 43、read 17、eval 11、write 3、yield 1；`codebase-memory-mcp` 调用 0 次。
- **结论**：交付与证据链总体完整。主要改进空间集中在：把一次性静态审计变成仓库守卫、稳定一个 flaky test、处理临时探针规避掉的 actions 边界，以及补齐文档链接和交接自动化。

以下均为建议，本轮未执行，也未修改代码、检查配置、技能或代理指令。

## 建议（按严重度）

### 1. [高] 扩展现有 import-boundary 守卫到 `scripts/`、`tests/`，并补 Session/General 的 canonical 归属用例

**事实**：`tests/framework/import-boundary.test.ts` 的 `SCANNED_ROOTS` 只有 `adapters`、`framework`、`extensions`、`entrypoints`；已有 Feedback、State、Host facts、Prompt/Marker、Command、Authoring、Subagent 的归属用例，以及“legacy framework entries 不能再导出 Session”的用例，但没有“Session 声明只由 Session interface 发布”的完整用例，也没有 General 的 HTTP/files 导出集合用例。本票要求覆盖 script/test 消费者，执行者只能另写一次性 Python 扫描；该扫描发现 0 个违规导入，但不是仓库可重复运行的命令。

**影响**：未来若 `scripts/`、`tests/` 或某个内部分支重新导入公开声明，现有测试仍可能全绿；P51/P01 的静态证据会停留在一次性记录，而不是持续守卫。

**建议**：沿用同一个 lexical alarm，扩展扫描根并增加两个归属用例；对测试内部 seam 保留显式、精确的允许清单，而不是宽放整个 `tests/`。这属于扩展现有检查，不需要新增扫描工具或永久源文本/布局测试。

**类型**：自动化检查。

### 2. [高] 让 `pi-disposal-round-close` 的保存等待确定化

**事实**：第一次 `bun test tests/model-cost` 为 517 pass / 1 fail，失败在 `tests/model-cost/harnesses/pi/pi-disposal-round-close.test.ts` 的 `savedRecord`：`no record for pi-disposal-child was published ...; it holds undefined`，在 200 次 `setImmediate`/假时钟推进后仍未读到记录。同一文件随后单独失败一次（4/1），再单独运行通过（5/0），隔离该用例通过（1/0），整个 model-cost 分区下一次 518/0。源码、fixtures 与 lockfile 均未变化。

**推断**：更像是共享机器负载或测试间残留运行时/定时器导致的时序脆弱，而不是产品回归；用例级 `afterEach` 只清理文件与 liveness registry，没有显式释放 widget/runtime，且多个用例共用一个模块级 `STORAGE_ROOT`。

**建议**：用确定性的提交完成信号替代 200 次轮询，例如等待 `updateFile`/commit 的真实完成，或由 runtime 暴露一个“本次保存已发布”的 promise；若仍保留轮询，至少使用真实时间上界并给出更有区分度的失败信息。同时考虑每个用例独立 storage root，并在 `afterEach` 释放 runtime/widget。**未验证**：根因尚未证明；当前只是不可稳定复现的时序观察。

**类型**：自动化检查/测试稳定性。

### 3. [高] 处理 `actions` 命令中动作名 `run` 的歧义，并把探针中的规避记录为发现

**事实**：临时探针最初给 actions 命令声明并实现了动作 `run`，绑定报错：`command "probe-actions" declares control kind "actions", but its injected implementation carries no action table (missing: "run")`。原因是 `isDirectedImplementation` 只按形状判断 `{ run: fn }`，`missingActions` 因而把合法 action table 当成 directed implementation；随后执行者把探针动作改名为 `go` 并继续，没有把该异常记为票据发现。

**影响**：`ActionsCommandImplementation` 类型允许任意动作名，但名为 `run` 的动作实际无法绑定，错误信息还会说“missing run”，对扩展作者有误导。现有 actions 覆盖没有这个用例，因此这是一个被探针规避掉的真实边界。

**建议**：用声明中的 `command.type` 解释实现表（绑定处已经知道它是 `actions`），消除形状歧义；或者明确保留 `run` 这个名字，给出清晰的绑定错误并写入文档。无论选哪种，都在 `actions-routing.test.ts` 增加一个消费者可见的用例。另建议在测试约定中加一句：临时探针若通过改名/改输入绕过了绑定或校验失败，必须把该异常记录为发现，而不是只在探针里消化。

**类型**：测试缺口/正确性。**未验证**：项目是否已有意保留 `run` 为保留动作名；现有文档未说明。

### 4. [中高] 给现有检查加 CI 或 pre-commit 入口

**事实**：在该 worktree 根目录的 `ls -la` 中未观察到 `.github`；`package.json` 有 `typecheck`、各测试分区、`check:integrations` 等脚本，但没有聚合的 `check`/`lint` 脚本。**未验证**：仓库外 CI、`.git/hooks` 或其他自动化入口是否存在。

**建议**：增加一个薄的 `bun run check`（typecheck + import-boundary/definition/integration-check，必要时加各消费者分区），并接入 CI 或 pre-commit；dock/真实宿主等昂贵运行保持在 CI 的独立阶段。这样可以避免每个 ticket 依赖执行者“记得跑齐”。

**类型**：自动化检查/仓库守卫。

### 5. [中] 增加文档链接与引用一致性检查

**事实**：执行者用一次性 Python 脚本检查本次改动文档的相对链接，发现 `docs/adr/0002-semantic-extension-framework.md` 中指向已删除 `framework/public.ts` 的历史链接；随后把该链接改为纯代码文本，保留历史语境。另在 `framework/docs/framework-capabilities.md` 手工修正了 9 处 `protocol.ts#L...` 的过期标签。

**建议**：增加一个轻量 docs link check，覆盖改动文档的相对目标；对源码行锚点 `#L123` 跳过，对 Markdown 锚点采用与 GitHub 一致的 slug 规则或允许显式排除。它可以直接接在现有检查入口，不需要新建文档体系。

**类型**：自动化检查。

### 6. [中低] 在 ticket 模板/tracker 中写明 worktree 预检与 evidence 路径

**事实**：票据只写了“本票交接证据（P52）”，没有给路径；执行者通过列出 `.scratch/framework-capability-cutover/evidence` 并阅读 ticket 10 的 README 才确定格式。新 worktree 没有 `node_modules`，第一次 `bun run typecheck` 以 `bun: command not found: tsc` 失败，执行 `bun install --frozen-lockfile`（13 个包）后恢复。

**建议**：在 `docs/agents/testing.md` 或 issue-tracker/ticket 模板中加两行：fresh worktree 先跑 `bun install --frozen-lockfile`；交接证据写到 `.scratch/<feature>/evidence/<ticket-number>-<slug>/README.md`，并列出必需字段。成本很低，能减少每个执行者的重复发现。

**类型**：导航/信息访问。

### 7. [中低] `codebase-memory-mcp` 指令在本次是 no-op

**事实**：系统提示和用户消息都要求在 grep/read 大文件前考虑 `codebase-memory-mcp`，`session_init` 也确实挂载了 `mcp__codebase_memory_mcp_*` 工具；但 231 次调用中 MCP 为 0，实际使用了 156 次 bash 和 17 次 read。**未验证**：该 worktree 是否已建立索引、索引是否覆盖这些源码。

**建议**：先核对 `index_status`/coverage；如果索引不可用，把指令收窄为“仅在 index_status 显示已索引时优先使用”，否则它会变成每次运行都无法执行的噪声；如果索引可用，在仓库 `AGENTS.md` 或相应 skill 中给出具体工具与触发条件（例如 `search_graph`、`get_file_outline`）以及 fallback，让指令可操作。

**类型**：no-op/工具经济。

### 8. [低] 在 port double 文档中注明 initialize 的异步结算

**事实**：临时探针在 `deliverSession` 后立即读取初始化 delivery，得到空数组；补上 `await Promise.resolve()` 后才观察到 `owner/hasUI/feedback/subagents`。`tests/framework/implementation-lifecycle.test.ts` 中已有同样的等待写法。

**建议**：在 `PortDouble.deliverSession` 的 JSDoc 中注明“初始化在 microtask 中结算，测试需要 await”，或提供一个小的 `awaitInitialization()` 辅助；这是隐藏依赖，靠读现有用例才能发现。

**类型**：信息访问/测试支持。

## 较小观察

- **事实**：共 156 次 bash 调用，后半段用一次 `eval` 完成全仓静态扫描，成本明显更低。可考虑把常用审计命令固定写入 `docs/agents/testing.md` 的“本票验证”段，而不是每次临时拼 grep；是否固化成脚本需尊重 spec 对“不新增扫描工具”的限制。
- **事实**：一次 `perl -pi` 修改临时探针，违反了“不要用 sed/perl/python 通过 bash 做单点编辑”的既有规则；后续已改用 `edit`。规则本身已存在，本次不建议为此加钩子，但若反复出现可考虑 shell 层拦截 `perl -i`/`sed -i`。
- **事实**：全仓 ownership 扫描把扩展本地的 `SessionFacts`、`SessionStartup` 与框架公开声明同名计为噪声；它们并非公开声明，也没有被消费者当作框架契约导入。可考虑改名，或在审计规则中显式说明“扩展本地同名类型不算重复归属”，避免未来误报。
- **事实**：evidence README 初稿把 `framework/docs` 下的文件数写成 4（实为 3），随后 amend 修正。可由模板提供 source-state 清单，减少这类笔误。

## 未验证项

- 仓库外 CI、`.git/hooks` 是否存在，未检查。
- `codebase-memory-mcp` 的索引状态与覆盖率，未检查。
- model-cost 失败的确切根因未复现或证明；只能确认源码未变、隔离/重跑通过。
- actions 动作名 `run` 是否属于有意保留名，未在文档或校验中找到依据。
- 本票未运行 `bun run test`、dock 或真实五入口回归；这是票据 12/13/14 的范围，本次未外推。

## 建议顺序

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8。前 3 项直接影响后续票的证据可信度；4/5 是长期守卫；6/7/8 是低成本的信息与工具改进。
