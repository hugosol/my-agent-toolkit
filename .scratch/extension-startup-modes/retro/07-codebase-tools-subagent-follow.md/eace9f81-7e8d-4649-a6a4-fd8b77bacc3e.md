# Retro — 07-codebase-tools-subagent-follow.md

## Provenance

```json
{
  "feature": "extension-startup-modes",
  "ticket": "07-codebase-tools-subagent-follow.md",
  "run_id": "eace9f81-7e8d-4649-a6a4-fd8b77bacc3e",
  "agent": "tdd",
  "agent_id": "07-codebase-tools-subagent-followmd-4ea17dfe-7d3",
  "session_id": "01a1602a-4c8f-7611-ac2c-7d0af850b4ba",
  "session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-21T20-04-26-123Z_01a16010-a58b-71a0-bc90-15f1bbbf0542\\07-codebase-tools-subagent-followmd-4ea17dfe-7d3.jsonl",
  "parent_session_id": "01a16010-a58b-71a0-bc90-15f1bbbf0542",
  "parent_session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-21T20-04-26-123Z_01a16010-a58b-71a0-bc90-15f1bbbf0542.jsonl",
  "workspace": "E:\\Developer\\myhub\\my-agent-toolkit",
  "execution_cwd": "C:\\Users\\hugos\\AppData\\Local\\Temp\\hyper-ticket-ylv0Qa",
  "tdd_status": "completed",
  "started_at": "2026-10-21T20:32:27.243Z",
  "tdd_finished_at": "2026-10-21T20:49:49.037Z",
  "retro_finished_at": "2026-10-21T20:52:22.817Z"
}
```

## Retrospective

# 复盘：07 codebase-tools 子代理 follow（TDD 执行轮）

范围：本 ticket 的 TDD 执行会话，基于原对话与工具输出。验收结果见 ticket 的 Evidence 段；本文只谈可复用的环境改进。标记约定：`[事实]` 有工具输出/文件为据；`[推断]` 由事实推出但未实跑；`[未验证]` 缺证据。

本轮值得保留的做法：在 S1/S2 既有 seam 上测试；绿后做两次定向故障注入（follow 读取改为默认值 → 2 例失败；owner gate 应用到 inherited → 4 例失败），确认测试能检出违规后还原；用 `HEAD` 临时副本证明 manual smoke 的退出失败是既有问题；最终 smoke 把 provider temp root 重定向到 run root。

## 1. 高 — 真实宿主证据的 provider 版本源不唯一

**事实**：`package.json` 固定 `pi-subagents@0.78.0`，smoke 通过 `-e node_modules/pi-subagents/index.js` 加载扩展；`framework/config.yaml` 的 `pi.subagents.packagePath` 指向本机 `C:/Users/hugos/.pi/agent/npm/node_modules/pi-subagents`（该安装是 0.80.0），adapter 的 `loadPiSubagentProvider` 默认读这份配置。该配置已提交（`6bb8785 fix pi 3rd party path`）。本次运行靠共享的 `Symbol.for("pi-subagents.required-child-extensions.v1")` 注册表跨版本工作，launch record 与 child 加载都成功。

**推断**：换机/换用户时该绝对路径不存在，adapter 的 `settle` 会落入 registration failure，子进程不会加载 mode entrypoint，follow smoke 会以“没有 child/没有贡献”失败；即使路径存在，扩展与 adapter 也可能不是同一版本，真实宿主证据混用两个 provider。

**建议**：让 provider 路径只有一个来源。移除 shipped config 中的绝对路径（保留注释示例），或让 smoke 从同一配置解析 `-e` 路径并在启动前断言两者一致/版本一致；在 smoke preflight 中显式打印 provider 路径与版本。

**置信度**：事实（版本、路径、提交）；推断（换机失败路径未实跑）。

## 2. 高 — 真实宿主运行的 Node 前置条件没有在运行点强制

**事实**：默认 `node` 为 24.18.0；`bun scripts/pi-codebase-tools-smoke.ts --mode manual` 在第一个 phase 的 EOF close 以 exit 9（`UV_HANDLE_CLOSING`）失败，用 `HEAD` 版脚本临时副本复现，确认非本 ticket 引入。`framework/docs/harness-support.md` 的 pi evidence 与 version-verification runbook 都写明 Windows 验证组合是 Node 22.19.0、Node 24.18.0 会撞该断言；`docs/agents/testing.md` 只指向 runbook，真实宿主段落没有内联这条前置条件。同一会话中 auto smoke 在 Node 24 上通过，说明触发条件是会话形态/长度，不是每次运行。改用 `PI_NODE=<nvm v22.19.0>/node.exe` 后，manual 67/0、auto 46/0。

**推断**：agent 先读 testing.md 并按 tier 直接运行，未在第一次真实宿主运行前点开 runbook；这是 pointer 的触发词没有覆盖“运行前”分支，而不是文档缺失。

**建议**：在 smoke 启动处对已知不兼容的 Node 版本 fail fast（可带显式 override），或至少在 `docs/agents/testing.md` 的真实宿主句子里内联“pi smoke：`PI_NODE` 指向 Node 22.19.0；Node 24.18.0 有已记录的 libuv 断言”。脚本已打印 runtime；把“已验证/不兼容组合”放在同一行更有效。

**置信度**：事实（失败、文档、修复命令）；推断（pointer 是主因）。

## 3. 中高 — 真实宿主/分区运行的 quiet-window 规则没有机械化

**事实**：`docs/agents/testing.md` 要求 “Agree on a quiet window with peers for real-host or full-repository runs”；本会话 peer roster 显示其他 subagent 在运行；执行 `bun test tests/codebase-tools`（包含真实 OMP dock，95.88s）和两次真实 pi smoke 前后，没有向 peer 发消息或声明窗口。运行全部通过。

**推断**：共享 CPU 上的真实宿主运行可能因负载产生 timing/cleanup 波动；本次未观察到失败，但这是测试文档明确要求而执行未落实的规则。

**建议**：把规则变成可执行的：一个锁定/槽位（例如 `.cache/run-slots/real-host.lock` 或 `scripts/with-real-host-slot.ts`），或由调度方在 dispatch 时分配窗口；对包含 dock 的分区提供 serial 入口并在测试文档中指明。若维持人工约定，至少在 tier 表旁给出“发消息给 peers/等待窗口”的具体步骤。

**置信度**：事实（未协调）；推断（风险）；未验证（是否曾因并发导致失败）。

## 4. 中 — ad-hoc 真实宿主探针缺少既有模式与隔离提示

**事实**：第一次临时探针的 responder 在请求仍包含 `PARENT DELEGATE` 时无条件返回 tool call，没有 once-only guard；父上下文增长后每次请求都触发委派，探针输出中出现大量 background scout 完成通知（父请求里可见 119 条完成汇总，capture 索引到 504）。修正版用 `delegated` 集合修复。仓库已有 `scripts/pi-subagent-smoke.ts` 的 `delegationOnce()` 与 `async: true` 背景委派；第一次探针写在阅读该脚本之前，修正时采用了等价的 once-only 思路。第一次探针也未设置 `PI_SUBAGENTS_TEMP_ROOT`，provider 把 async run 目录写到用户级临时存储 `%TEMP%/pi-subagents-user-hugos/async-subagent-runs`；最终 phase 将其重定向到 run root。

**推断**：新的 ad-hoc 真实宿主探针会重复两类问题：重复委派造成循环，以及共享 temp store 的残留。

**建议**：在 `docs/agents/testing.md` 的真实宿主段或 `harness-support.md` 的背景委派记录旁放一个 navigation pointer：写临时实时探针时先看 `scripts/pi-subagent-smoke.ts` 的 once-only/async 模式，并把 `PI_SUBAGENTS_TEMP_ROOT` 指向本次 run root。另：两个 smoke 目前各自实现 `sessionFiles`/`sessionHeader`/child-session 发现；把通用的只读发现提取到 `tests/harness-dock/` 的共享 support 模块，能同时降低探针错误和脚本重复。

**置信度**：事实（循环、119 汇总、共享 run dir、最终修复）；推断（未来重复）。

## 5. 中低 — fresh worktree 的 setup 成本没有写明

**事实**：第一次 `bun test tests/codebase-tools/startup-modes.test.ts` 失败：`Cannot find package 'yaml' from framework/core/config.ts`；`bun install --frozen-lockfile` 后通过（14 packages，2.21s）。`.cache/omp-baseline/18.5.0` 在首次 dock 运行前不存在，`bun test tests/codebase-tools` 首次运行耗时 95.88s 并成功（包含真实 OMP dock）。

**推断**：新 worktree 的第一次测试运行会先遇到依赖缺失；包含 dock 的分区第一次还会 materialize baseline，耗时更长。这是可预测的 setup 成本，不是测试失败。

**建议**：在 `docs/agents/testing.md` 的 tier 说明或 worktree bootstrap 中加一行：fresh worktree 先 `bun install --frozen-lockfile`；首次 dock/真实宿主分区会安装 `.cache/omp-baseline/<version>`，留出时间。

**置信度**：事实（失败、安装、耗时）；推断（其他 worktree 同样）。

## 6. 低中 — codebase-memory 对当前 ticket worktree 不可用

**事实**：`list_projects` 返回 27 个项目，没有当前 worktree `hyper-ticket-ylv0Qa`；agent 随后用 `read`/`bash cat` 读取长源码与测试文件，部分 `bash cat` 输出被摘要并指向 artifact，增加了二次读取。

**推断**：steering 要求“grep/read 前先考虑 codebase-memory”，但在未索引 worktree 中该分支不可达；agent 的读取选择是正确的 fallback，但 graph-first 的收益没有获得。

**建议**：如果 ticket worktree 期望 graph-first，在创建 worktree 时索引（或提供快速 `index_repository` 步骤）；如果索引成本不划算，在测试/agent 文档中明确 ticket worktree 通常未索引，直接使用带范围的 `read`，避免把一次 `list_projects` 当成失败。

**置信度**：事实（项目列表、读取方式、摘要）；推断（索引收益/成本）；未验证（索引该 worktree 的实际耗时）。

## 7. 低 — 没有机械化的 style guardrail

**事实**：新测试里的 `lastRendering` 一表达式 helper 触发了 harness 的 built-in “tiny functions” 规则，agent 将其 inline。`package.json` 没有 lint 脚本，checkout 根目录没有 lint 配置，未观察到 `.github/workflows`；现有 guard 是 `tsc`、`check:authoring`、`check:integrations` 和测试。共享 git dir 的 pre-commit hook 未检查（worktree 的 `.git` 是文件）。

**推断**：如果团队把该规则作为标准，当前只有实现 agent 的 harness 提示，没有可重复的仓库级检查；如果只是 harness 偏好，则不应为一次事件引入 linter。

**建议**：先决定该规则是否属于团队标准。是：把 lint 命令接进 `typecheck`/CI（Biome/ESLint 或现有静态检查的扩展）；否：不新增检查，由 reviewer 的 judgement 规则处理。

**置信度**：事实（触发、无 lint 观察）；未验证（共享 hook/外部 CI 配置）。

## 8. 低 — reviewer 与证据约定（可选）

**事实**：`startup-modes-follow.test.ts` 重新声明了 startup policy/assembly helper，与 `startup-modes.test.ts` 的 `policyOf`/`assemblyWith` 形状相近；ticket evidence 表记录了日期、命令和版本，但没有每个 smoke 运行对应的 source commit/tree state，且 full-mode 运行发生在最后一次 `--follow-only`/summary 编辑之前（follow 行为代码未变，follow-only 在编辑后重跑）。

**推断**：若第三处需要同一 double，复制会漂移；证据表缺 source state 会让集成 agent 难以判断运行对应哪棵树。两者都很小，适合 review/工作流约定，不适合自动化检查。

**建议**：给 reviewer 一条 judgement 规则：startup-policy double 出现第三个使用者时提取到 `tests/codebase-tools/support/`；在 evidence 模板中加一行 “source commit/tree state + host/Node/PI versions”（testing.md 已要求记录 source/environment state，可在 ticket 模板中体现）。

**置信度**：事实（重复、缺 commit）；推断（漂移/复现成本）。

## 不建议的改动

- 不建议向 `AGENTS.md` 增加 Node/PI 前置条件或 provider 路径说明：这些是分支条件，应留在 `docs/agents/testing.md`/`harness-support.md` 的 pointer 后面；AGENTS.md 目前只做导航，保持精简。
- 不建议为本次一次性的 tiny-function 事件直接引入完整 linter；先确认团队标准。

## 未验证

- provider 0.78.0/0.80.0 跨版本共享 required-child registry 是否在所有路径上都有保证；本次只验证了本机的 follow 运行。
- 换一台没有 `C:/Users/hugos/.pi/...` 的机器时，adapter 的 registration failure 具体诊断与 smoke 的失败形态。
- 共享 git dir 的 pre-commit hook / 外部 CI 是否运行 lint；本次只观察了 package.json 和 worktree 根目录。
- quiet-window 并发是否曾在本仓库造成真实 flaky；本次运行未失败。
