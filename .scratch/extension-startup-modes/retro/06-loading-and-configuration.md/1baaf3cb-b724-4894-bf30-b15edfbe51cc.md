# Retro — 06-loading-and-configuration.md

## Provenance

```json
{
  "feature": "extension-startup-modes",
  "ticket": "06-loading-and-configuration.md",
  "run_id": "1baaf3cb-b724-4894-bf30-b15edfbe51cc",
  "agent": "tdd",
  "agent_id": "06-loading-and-configurationmd-8b0f2426-5ac5-422",
  "session_id": "01a1603b-1043-7442-9cd8-9143a9d94102",
  "session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-21T20-04-26-123Z_01a16010-a58b-71a0-bc90-15f1bbbf0542\\06-loading-and-configurationmd-8b0f2426-5ac5-422.jsonl",
  "parent_session_id": "01a16010-a58b-71a0-bc90-15f1bbbf0542",
  "parent_session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-21T20-04-26-123Z_01a16010-a58b-71a0-bc90-15f1bbbf0542.jsonl",
  "workspace": "E:\\Developer\\myhub\\my-agent-toolkit",
  "execution_cwd": "C:\\Users\\hugos\\AppData\\Local\\Temp\\hyper-ticket-mLt3mH",
  "tdd_status": "completed",
  "started_at": "2026-10-21T20:50:45.928Z",
  "tdd_finished_at": "2026-10-21T21:09:15.186Z",
  "retro_finished_at": "2026-10-21T21:13:03.550Z"
}
```

## Retrospective

# Ticket 06 TDD 执行复盘

**复盘范围**：run `1baaf3cb-b724-4894-bf30-b15edfbe51cc`，agent `06-loading-and-configurationmd-8b0f2426-5ac5-422`，session `01a1603b-1043-7442-9cd8-9143a9d94102`。TDD 记录约从 2026-10-21 20:50:45 到提交复核的 21:09:00 UTC（约 18 分钟）；提交前可数到约 167 次工具调用（bash 83、read 56、edit 15、write 7、grep 3、wait 3）。以下 `【事实】` 来自该 session JSONL 与当前仓库文件；`【推断】`、`【未验证】` 单独标注。复盘时 worktree 已被集成推进到 `7fe1b7b`（合并 ticket 04），因此原始红测在最新状态的复现情况未在本轮重跑，不能把后续合并结果算作本 run 的证据。

**总体判断**：交付路径本身基本正确——先读 ticket/spec/contract，再读 framework 文档和真实宿主代码，用 S1 与真实 OMP dock 分层验证，最终提交了 5 个文件（`fd2a082`），并明确区分了本票失败与基线已有失败。真正值得改的不是“再加一条规则”，而是把已有规则变成可执行的 guardrail：本次三条已有指令（专用工具/MCP、长测试输出落盘、基线全绿）都没有改变行为，分别产生了额外检索、一次约 100 秒的重复套件，以及多轮失败分类。

## 高 1. 外部面板测试缺少版本/配置 preflight，当前 connect-bot 分区基线为红

`【事实】` `bun test tests/connect-bot` 为 146 pass / 5 fail（118.61s）。5 个失败全部来自真实 herdr-bot 二进制启动失败，错误为 `TOML parse error ... missing field 'herdr'`；`tests/connect-bot/support/herdr-bot.ts:121` 仍然写顶层 `listen_addr = "127.0.0.1:0"`，每次还要等 `START_TIMEOUT_MS` 的 20 秒。`docs/agents/testing.md` 没有列出 `HERDR_BOT_BINARY`、面板版本/配置 schema，或哪些测试文件依赖真实面板；agent 为看清失败先跑了两次非面板套件（各约 99 秒），又跑了一次完整分区（约 119 秒）。

`【推断】` 这是测试支持与外部二进制版本/schema 漂移，不是 ticket 06 的业务逻辑失败；具体二进制版本和期望 TOML 结构未验证。

**建议**：像 `framework/docs/harness-baseline.json` 固定 harness 一样，固定/记录一个可用的 herdr-bot 版本或 commit，并在 `startHerdrBot` 启动前做一次 `--version` 或最小配置 preflight，失败时立即给出“版本/schema 不匹配”的可操作信息，而不是等 20 秒 bind 超时。把 connect-bot 测试拆成不依赖外部二进制的 unit 分区与显式 panel 分区，并在 `docs/agents/testing.md` 或 `tests/connect-bot/README.md` 列出 `HERDR_BOT_BINARY`、面板版本和配置前提。没有面板时，显式 skip 并说明原因，不要让它混在普通分区里红。

## 高 2. 没有把已有检查变成基线 guardrail；`bun run test` 在基线上是红的

`【事实】` `bun test tests/framework` 为 655 pass / 1 fail（44.85s），失败在 `tests/framework/startup-requirements.test.ts:247`，错误是 `TypeError ... pi.on.bind`；单独运行该文件同样失败，因此不是并发或本票测试污染。`【事实】` 该 worktree 没有 tracked `.github/`、`.husky/`、pre-commit 或 Jenkins/GitLab CI 配置；`package.json` 只有 `test`、`typecheck`、`check:authoring`、`check:integrations` 等手动脚本。`【推断】` 根因是 `connectBotOmp` 的 `observeSessionContext` 在旧版本里无条件 `pi.on.bind`，导致“registration failed”路径变成 TypeError；测试期望框架报告失败，而不是启动崩溃。`【后续观察】` 当前 worktree 的 `extensions/connect-bot/harnesses/omp-assembly.ts:135` 已出现 `typeof pi.on === "function"` 守卫，集成合并 ticket 04 后可能已修复；本轮未重跑确认。

**建议**：先把 P60 失败在集成状态复核并修复，或至少用跟踪项明确隔离；然后增加一个最小的 tracked guardrail（pre-commit 或 CI），至少运行 `typecheck`、`check:authoring`、`check:integrations` 和一个不依赖外部面板的 unit 分区。这样“绿”才是可判定的信号。仓库已有 check 脚本，缺的是把它们接到一个自动入口，而不是再写一套检查。

## 高 3. `| tail` 让一次约 99 秒的套件白跑；日志落盘指令是 no-op

`【事实】` 提交前有 18 次 `bun test`，其中 20 条命令通过 `| tail` 截断输出。第一次 connect-bot 非面板套件跑了 99.7 秒，tail 只显示 4 个失败中的 1 个；agent 为看全失败又跑了同一套件 99.0 秒。`docs/agents/testing.md` 第 4 条已经明确要求“Save long-run output to a run-specific log”，但本次没有执行——说明这句话已是 no-op。

**建议**：不要重复这句话，直接提供一个低摩擦工具：例如 `scripts/test-log.ts` 或 `package.json` 的 `test:log`，把 `bun test <args>` 的完整输出 tee 到 `.cache/test-<label>.log`，结束时打印 pass/fail 计数和所有失败名称/位置；把 `docs/agents/testing.md` 的该条改成指向这个命令。这样既保留完整证据，也避免第二次长跑。

## 中 4. “已加载启动配置缺失”存在验收歧义：文件缺失还是块缺失？

`【事实】` ticket/contract 使用“已加载启动配置缺失”“受控缺失”，没有明确是所选 policy 文件不存在，还是已加载 extension 的 policy block 不存在。实现中 `framework/core/startup.ts:81-82` 对缺失 block 返回 `undefined`（不拒绝、不应用启动选择）；本次新增测试覆盖的是缺失文件、类型错误和不可解析 YAML，最后报告把“缺失”解释为文件缺失。agent 在 21:03 还专门用 `grep` 重读 contract/spec 的“block/块/缺失”措辞来确认。

`【未验证】` 验收原意是否包含“缺失 block 应拒绝”。如果是，当前实现会静默走默认值，测试也没有覆盖，属于真实缺口；如果否，也应把“缺 block = 无启动选择”的语义写清楚并加一个测试，避免下一个 agent 再猜。

**建议**：在 contract/ticket 中加一句明确区分：
- policy 文件不存在/不可解析 → 绑定拒绝；
- 已加载 extension 的 block 不存在 → 拒绝，还是按无选择处理并走 extension 自身默认值；  
并为选定的语义补一个 S1 用例。这个澄清比再加一个模糊测试更能防止实现漂移。

## 中 5. 专用工具/MCP 规则已经有，但没有被执行

`【事实】` 本次 0 次 codebase-memory-mcp 调用；同时有 22 次 shell `grep`、26 次 `sed`、6 次 `cat`、2 次 `find`，以及 1 次 `python - <<'PY'` 批量改测试（当时系统明确要求用 `edit`，禁止用 Python/sed 做单点编辑）。有一次 `cat` 多个 entrypoint 返回约 25.7k 字符，`cat package.json` 的输出还被渲染成了不可用摘要，随后改用 `read`。任务提示和系统提示都写了“优先使用专用工具/MCP”，但没有改变行为。

`【推断】` 这不是缺规则，而是缺执行机制：模型在探索时默认走熟悉的 shell，MCP 又只能通过 `write xd://...` 访问，摩擦较高。`【未验证】` codebase-memory-mcp 在本次环境中是否真的可用/索引是否新鲜，未做检查。

**建议**：
- 在宿主工具层加一个机械 guardrail：当 `bash` 命令是 `grep`/`cat`/`sed`/`find`/`python -c` 且存在对应专用工具时，拒绝或提示改写；这比在 AGENTS.md 里再写一句更可靠。
- 如果保留 MCP：提供一个 repo 级或 skill 级的一步入口（例如先 `search_graph`/`get_file_outline` 再读大文件），并在 ticket 模板中把它写成第一个检查项；否则这条提示只会继续是 no-op。
- 不要在未验证 MCP 可用性的情况下继续扩大规则文字；先测量一次“MCP 能否在 10 秒内给出目标文件的声明大纲”。

## 中 6. `check:integrations` 默认输出对 agent 过于冗长

`【事实】` 本次 `bun run check:integrations` 成功（exit 0），但默认报告约 290 行 / 18.7k 字符，agent 需要从大量 PROVIDED 条目里找结论。脚本已经支持 `--json` 和按 extension/adapter 过滤，但没有摘要模式。

**建议**：增加 `--summary` 或 `--failures-only`，默认打印每个 consumer 的 COMPLETE/GAP 计数和失败项；完整报告可写到 `.cache/integrations-<label>.log` 供需要时读取。这样既保留可追溯性，又降低每次检查的 token 成本。

## 中低 7. harness-dock 测试辅助重复，后续面板/部署漂移会重复发生

`【事实】` 新增的 `tests/harness-dock/startup-modes-loading.test.ts` 约 504 行，内嵌了 `RecordingPanel`、deployment 复制、`waitFor`、marker 读取、provider request 解析等辅助；现有 `tests/harness-dock/connect-bot-startup.test.ts` 与 `consumer-regression.test.ts` 已经有相近实现。`【推断】` 本次真实面板 helper 的 schema 漂移，正是这类复制在多个测试文件间不同步的表现之一。

**建议**：把可复用的 `materializeDeployment`、scripted panel、session/marker 读取抽到 `tests/harness-dock/support/`，新 dock 测试只组合这些 helper；在 review 规则中加一条“新增 dock 测试不得复制已有 deployment/panel helper，先找 support 目录”。这是 judgement call，适合 review agent，不需要 linter。

## 低 8. TDD 补证据时缺少“测试会红”的敏感性检查

`【事实】` 本票实现已在依赖票中完成，新增测试首次运行即绿（框架 5/1 后修正 fixture 再 6/0；connect-bot 10/0；dock 5/0）。agent 没有做临时 mutation/fault injection，也没有明确记录“为什么 inspection 足以证明测试会捕捉目标违规”。另有一处语义修正：最初期望 connect-bot 的 `startup` 写入 State，后来改为在测试 fixture 中模拟业务成功后写值——这是正确的，但也说明仅凭测试首跑绿不能证明场景设计正确。

**建议**：在 TDD 完成检查里加一个低成本动作：当实现已存在且测试首跑即绿时，对一个关键断言做一次临时破坏（改实现或 fixture 的一行），确认测试变红后恢复；或者明确写一句“inspection 已足以证明，因为 X”。这比再增加测试数量更能保证测试有敏感性，尤其适用于“配置拒绝”和“加载选择”这种容易写成同义反复的断言。

## 已有做法值得保留

- 先读 ticket/spec/contract，再读 `framework/docs/framework-capabilities.md` 和两个 extension README；本次在 20:51 已经这样做，方向正确。
- S1 用 framework port double，S2 用真实 OMP dock；没有用源码文本断言替代行为观察。
- 把 P60 和 panel 失败明确标为 pre-existing，没有伪称全绿；最终报告区分了“已验证”和“未完成”。
- 最终提交干净（5 个文件，`fd2a082`），并做了 typecheck、authoring、integration 静态检查和两个消费者分区。

## 未验证/边界

- 当前 worktree 已推进到 `7fe1b7b`；P60 的 `pi.on` 守卫是否已修复原始失败，本轮未重跑，不能下结论。
- 真实 herdr-bot 二进制的期望版本/TOML schema 未确认；只观察到 `missing field herdr` 的启动错误。
- “缺失”是否包含缺失 block，未从 contract/用户处得到明确确认；本复盘按“文件缺失”解释整理事实。
- codebase-memory-mcp 在本次环境是否可用、索引是否新鲜，未验证；0 次调用只是行为事实，不等于工具不可用。
- 仓库外是否另有 CI/流水线未验证；本 worktree 内没有 tracked CI/hook 配置。
