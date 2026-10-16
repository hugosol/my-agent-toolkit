# Retro — 15-period-reset.md

## Provenance

```json
{
  "feature": "model-cost-pi-migration",
  "ticket": "15-period-reset.md",
  "run_id": "c2d9a9db-99ed-48df-b368-bddb0f7dfbac",
  "agent": "tdd",
  "agent_id": "15-period-resetmd-d51c00f9-fcab-483a-94ed-13a7b2",
  "session_id": "01a143e4-52ad-7481-be54-ae097a251165",
  "session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-16T05-05-31-422Z_01a14319-df1e-77c0-a324-421dfc10d49e\\15-period-resetmd-d51c00f9-fcab-483a-94ed-13a7b2.jsonl",
  "parent_session_id": "01a14319-df1e-77c0-a324-421dfc10d49e",
  "parent_session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-16T05-05-31-422Z_01a14319-df1e-77c0-a324-421dfc10d49e.jsonl",
  "workspace": "E:\\Developer\\myhub\\my-agent-toolkit",
  "execution_cwd": "C:\\Users\\hugos\\AppData\\Local\\Temp\\hyper-ticket-tUXuwG",
  "tdd_status": "completed",
  "started_at": "2026-10-16T08:46:39.264Z",
  "tdd_finished_at": "2026-10-16T09:09:16.192Z",
  "retro_finished_at": "2026-10-16T09:10:54.651Z"
}
```

## Retrospective

# 复盘：model-cost-pi-migration / 15-period-reset（TDD 实现轮）

**范围**：本票自身执行轮（agent `15-period-resetmd-…d51c00f9`，分支 `…/15-period-reset-bfd000-…`，提交 `94651a9`），不涉及父 session、其他票据或集成轮。依据：本对话的工具结果 + 仓库现状抽查（`ls`/`read`）。会话日志用于统计工具调用量级（`read`/`bash`/`edit` 各约 40/48/28 次实际调用）。

**本轮实际运行**：`bun test tests/model-cost/pi-period-reset.test.ts`（15 通过）、`bun test tests/model-cost`（415）、`bun test tests/framework`（481）、`bun run typecheck`、`bun scripts/pi-model-cost-smoke.ts`（真实 pi 1.2.0，97 项全通过，exit 0）。失败与返工集中在下面第 1、2、5 条。

---

## 1【高】「预算耗尽」类用例必须用真实时钟——这条测试时钟规则没有任何地方写

**事实**
- `framework/modules/files.ts` 的等待预算全部按 `performance.now()` 判定（`acquireLock` 的 `remaining = deadline - performance.now()`、`untilTurn` 同形），而重试等待是 `setTimeout`。
- 我在假时钟（`vi.useFakeTimers`）下写的「归档已生成但新 activity 未提交」用例**永远到不了终态**：观测到 prepared lock 目录驻留约 30 个推进轮、installed lock 在第 40–50 个推进轮才出现，200 轮（5s 假时钟）后命令仍 pending；把该单例超时放宽到 90s 重跑，结果仍是测试超时而非失败断言。
- 对照组：共享套件 `tests/model-cost/period-switch.test.ts` 里同一场景用真实时钟，单跑该用例 **191ms 通过**；我改用真实时钟后整套 15 例 277ms 通过。

**推断**（未直接验证 `performance.now` 是否被 bun 的假时钟接管）：现象与「sleep 被伪造、预算时钟走真实时间」一致，因此预算在假时钟下不可推进。

**建议**：在 `docs/agents/testing.md`（`AGENTS.md` 已指向、每票必读）加一小节「Clock」，只写两件事：什么时候用假时钟（受控瞬时、能靠推进定时器到达状态）、什么时候必须用真实时钟（用例主题是**耗尽**某条预算：发布超时、锁等待、`IN_USE_ATTEMPTS` 重试），并给出可抄的两种写法（假时钟下保存落盘用 `vi.advanceTimersByTime(25)` + `setImmediate`；预算耗尽用真实时钟）。指针措辞建议只用「Clock」这一个 leading word，不再罗列同义场景。

## 2【高】没有「宿主 seam / 模板文件」索引，导航成本压在逐文件头注释上

**事实**：为确定「本票该在哪个文件、用哪种 seam」，我读了 6+ 个测试文件头部、2 个整文件（`pi-session-span.test.ts`、`pi-surface-double.ts`）、以及 2722 行的 `scripts/pi-model-cost-smoke.ts` 分 6 段读完。仓库里**没有任何文件**索引「测试面 ↔ 承诺/coverage ↔ 宿主 seam」：`docs/agents/testing.md` 只说「按受影响范围/分区跑」，从不点名 smoke 脚本；`framework/docs/extension-development-map.md` 只讲代码落在哪一层；`.scratch/<feature>/map.md` 是规划索引（destination/decision tickets），不含实现票的测试归属。

**事实（补）**：真实宿主入口是 `scripts/pi-*.ts` 一族（每个按功能一票增一个 phase），RPC 驱动器在 `tests/harness-dock/pi-session.ts`（`resolvePiCli`/`startPiRun`/`PiSession`），而这一族只被 `framework/docs/harness-support.md` 顺带提到一次。

**建议**：扩写 `docs/agents/testing.md` 的「real-host seam」小节，作为唯一索引（沿用已有指针，不新增常驻上下文）：
- 一行列出 pi 侧入口：`scripts/pi-model-cost-smoke.ts`（加载/记账/命令/provider/Round/锚价/读数/周期重置）、`pi-session-accounting.ts`、`pi-terminal-round-smoke.ts`、`pi-background-round-smoke.ts`、`pi-subagent-smoke.ts`；
- 一条惯例：「新票在对应 smoke 里加一个 phase，不新建脚本；跑完删除 run root，长输出落 `.scratch/<feature>/evidence/logs/<ticket>-<slug>.log` 并提交」；
- 一行「模板」指引（按主题抄最近的同类文件）：in-process pi 实现 → `tests/model-cost/pi-session-span.test.ts`（含「每用例自持 storage root、在套件自己的 factory 里覆盖 `storageDir`」这一关键手法，我这次是从它的头注释里学到的）；归档/存储/并发 → `tests/model-cost/period-switch.test.ts`；真实宿主 → 对应 smoke。

**未验证**：本机能否跑 OMP dock 分区（`tests/harness-dock/*`，需固定 OMP baseline 工件；我按「本票不触 OMP」跳过，未确认其环境前置）。建议该小节同时写明各分区在本机的前置（pi CLI、OMP baseline 工件与相应环境变量），这是本轮最缺的信息访问项。

## 3【中】新 worktree 没有 `node_modules`，首次测试以误导性错误失败

**事实**：worktree 里第一次 `bun test` 失败于 `Cannot find package 'yaml' from framework/core/config.ts`；`bun install --frozen-lockfile` 2 秒解决，此后无碍。

**建议**：真正的修复在宿主侧 worktree 供给（创建后即装依赖）。仓库内最便宜的兜底：`docs/agents/testing.md` 开头一行前置条件「新 worktree 先 `bun install --frozen-lockfile`」。（不建议加 `pre*` 脚本，bun 对它的触发语义不稳定，属未验证假设。）

## 4【中】仓库自己的检查没有接进任何门禁；`typecheck` 也抓不到死代码

**事实**：仓库内无 `.github`（无 CI）、无 biome/eslint/pre-commit 配置；`package.json` 只有 `test` / `test:dock` / `test:framework` / `test:codebase-tools` / `typecheck` 与各 smoke，**没有任何东西自动跑它们**。`tsconfig.json` 未开启 `noUnusedLocals`，因此我新文件里先写下的未用 `statSync` 导入与未用 `storedRecord` 辅助函数**通过了 `bun run typecheck`**，最终靠自查删除。

**建议**：(a) 加一个最小门禁——pre-commit hook 或 CI job 跑 `bun run typecheck`（可选再加受影响分区）；这是把「文档里要求 agent 自己记得跑」变成机械保证。(b) 探一次 `bun run typecheck` 加 `--noUnusedLocals`（或写进 tsconfig 后全量跑），通过即接线；**未验证**全仓是否已干净，若报错多则退化为只对新文件生效的检查。仓库无 lint 这一点本身是「长期未利用的机会」，但引入 linter 到 2.3 万行测试的仓库是独立投入，本轮不主张顺手做。

## 5【低】smoke 的等待谓词必须只由「本轮自己的产物」满足

**事实**：`scripts/pi-model-cost-smoke.ts` 的 Phase 6 用 `sessionsOf(document).length > 0` 等待本轮 entry 的保存，而共享 storage root 里**更早 run 留下的记录**已满足该谓词，于是 `/budget clear` 在该 entry 自身保存尚未收口时被敲入，真实宿主按既定规则拒绝（通知原文：`/budget clear 未执行：当前入口的消费保存尚未收口；本命令不排队，请稍后重试。`），随后 15s 等待超时，整轮停在 Phase 6，我因此损失一轮真实运行。（该轮日志已被第二轮覆盖；上述引文来自对话记录，无法再从仓库复现。）

**建议**：把这条作为一条可审查规则写进 `docs/agents/testing.md`（或该仓库相当于 `CODING_STANDARDS.md` 的位置）：「smoke 的 accept 谓词必须只被本轮 run 的产物满足（本轮新建的 id/周期），不得用共享根上任何历史状态判别」。代码侧本轮已用有界重敲（`periodCommand`）修好，可作范例。

## 6【低】宿主规则在首次 `write` 之后才告知，首次即成浪费

**事实**：本宿主的两条规则（`ts-no-tiny-functions`、`ts-set-map`）在我第一次 `write` 之后以「rule configured not to interrupt」形式提示；代码已落盘，只多一轮返工空间（本轮实际未返工）。

**建议**：在 `docs/agents/` 的一处（例如 testing.md 或新的极短 `code-style.md`）用一行记下本项目/本工作区实际强制的机械规则（辅助函数 ≥3 个调用点或具名契约、静态字符串键用 `Record`），让首次写入即合规。属于推断收益，优先级最低。

## 7【低】长跑日志与证据的落点只写了半句

**事实**：`docs/agents/testing.md` 已写「Save long-run output to a run-specific log」，但没说落在哪、是否提交。我是靠 `ls evidence/logs`（发现 `06-*.log`/`07-*.log`）才推断出 `<ticket>-<slug>.log` + 提交。

**建议**：把那半句补全为路径与提交要求。

---

## 无发现 / 明确不建议改的项

- **`AGENTS.md` 不需要搬移**：仓库根 `AGENTS.md` 只有 848B、4 条纯导航指针（issue tracker / triage labels / testing / domain），已是目标形态；上面所有新知识都应进它已指向的 `docs/agents/testing.md`，而不是常驻上下文。
- **`map.md` 不是实现票归属索引**：它是规划地图（destination + decisions + decision tickets），我未从中读测试归属并非遗漏，而是该信息本就不在其职责内——这正是第 2 条建议的对象。
- **`framework/docs/harness-support.md` 的 `lifecycle.input-acceptance` 行无需改**：它关于三值 `canAcceptInput()` 的陈述本就 harness-qualified，本轮改动只是让 pi 命令路径与之**一致**（原先该路径会以 `TypeError` 崩溃）。可选后续：把 pi 命令路径的证据补进该行 evidence 列（本票未做，避免与相邻票争同一行）。
- 本票真实运行**不需要 host patch**；余额/账户读数来自本机 capture endpoint，非真实账户（属 P53/票 24 的人类验收），这一点已在票据证据中写明。

## 未验证项

1. bun 假时钟是否影响 `performance.now()`（第 1 条的机制细说）；只验证了「假时钟下该用例到不了终态、真实时钟下 191–277ms 通过」。
2. 全仓 `--noUnusedLocals` 是否已干净（第 4 条的前置探针）。
3. OMP dock 分区在本机的可运行性与前置（第 2 条）。
4. codebase-memory MCP 的 outline/snippet 工具在本 worktree 是否可用且更省 token——本轮全程未尝试（宿主提示建议先用它看大纲），因此不主张任何改动。
