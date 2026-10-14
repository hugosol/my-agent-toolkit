# 04: 消费周期重置与旧执行隔离

**What to build:** 用户执行允许的 clear 或首次 holiday 重置后，活动消费文档中的主／子时间随原有消费周期一并清除；同一新周期只从下一条新输入和新的子代理执行累计。重启、旧历史或迟到旧执行均不能将已清除的时间带回。

**Delivers:** P20, P21

**Blocked by:** 01 — 主会话 Session span 的采集、保存与展示；02 — 子代理原生运行耗时的累计与落盘。

**Status:** in-progress

Source: [approved contract](../contract.md) · [spec](../spec.md)

## Acceptance criteria

- [x] P20：分别运行 clear 与首次 holiday，在既有整份归档／新周期提交中一并清除活动时间；读取实际新文档及重新加载结果，均不带旧主时间或子累计。→ `tests/model-cost/period-switch.test.ts`：`clear takes the committed span and the descendant's runtime out of the new document, and a reload holds neither`；`the first holiday clears them the same way and opens a period that holds no time`（port double 的 S1 事实 + 真实 `/budget` 命令 + 真实归档／新文档 + 第二次 bind 作为重新加载）。
- [x] P20：已处于 holiday 时不再次重置，不新增时间写入；保留原先先归档后提交、失败终止及消费重置结果，不从归档回读恢复时间。→ 同文件：`an entry already in a holiday period is not reset again, so its time is neither written nor archived`（文件字节不变、无归档、读数保持）、`a switch that could not archive writes no time and keeps the readings it had`（失败终止）；归档先于提交、失败分级仍由该文件既有的 P35 用例覆盖。
- [x] P21：旧输入 10:00，重置后尚无新输入时主时间不可用；11:00 新输入、11:03 round_end 后得到 180,000 ms，不扫描历史重建起点。→ 同文件：`the main session's time starts at the next input after the switch, not at the input it closed with (P21)`（重置后不可用 → 新输入后仍不可用 → 11:00/11:03 = 180,000 ms，且 `startAt` 为新输入）。
- [x] P21：重置前旧原生执行的迟到进度／结束不得带回已清除耗时；重置后新执行 120,000 ms 则新累计为 120,000 ms，随既有提交保存、重新加载后仍一致。→ 同文件：`an execution the closed period measured is not the new period's time, however late its readings arrive (P21)`（旧执行 `exec-closed` 的迟到 ended/running 读数均不贡献；新执行 `exec-new` 120,000 ms 为全部累计，随 Round end 提交为数值毫秒 `runtimeMs: 120000`，重新加载一致）。
- [x] 使用实际 Session 与消费周期边界验证隔离，不用改名或创建新的展示行掩盖旧执行污染。→ 上述用例全程使用同一 `session-sub`／同一详情行（`└─ 子代理` 行先 `Run: —` 后 `Run: 2m`），并在 widget 行、`view.runtime`、实际文档三处断言；未改名、未新建行。
- [x] 保留现有动作准入：自身 DeepSeek 入口、可靠 idle 且无自身待完成保存才允许；不排队、不延迟到未来 round_end 执行，不改 clear／holiday 原有消费语义。→ 该文件既有的 P34／P35 准入与失败用例未改动，本轮全文件 26 用例通过（含 provider 警告、busy/unreported、pending-save 拒绝、归档优先级）。
- [x] 完成主／子时间的重置、提交和恢复自动化检查、所属分区与受影响消费者、TypeScript typecheck；实际通过 /budget 操作及文件／widget 观察证明两个重置路径，不只调用内部 helper。→ 命令与结果见下。

## Acceptance evidence（本票执行记录）

命令与实际结果（工作树 `hyper/model-cost-session-time-and-detail/04-...`，集成分支 tip `aa5e44b`，已本地合入，`Already up to date.`）：

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost` | 322 pass / 0 fail（25 files），exit 0 |
| `bun test tests/harness-dock/period-switch.test.ts` | 1 pass / 0 fail（真实宿主 `/budget clear`／首次 holiday，28 expects），exit 0 |
| `bun test tests/harness-dock/model-cost-session-span.test.ts` | 3 pass / 0 fail（真实宿主 Session span），exit 0 |
| `bun run typecheck` | exit 0 |

红→绿与故障注入（用于确认测试真能发现违规，而非构成通过）：

- 实现前 P21 迟到执行用例在 `expect(view.runtime(SUB)).toBeUndefined()` 处收到 `210000`（red）；实现后绿。
- 注入故障（把 `knownExecutions()` 改为只返回已结束的执行、不退役切换时仍打开的 `exec-closed`）后同一断言再次收到 `210000`；恢复后绿。
- 注入类型错误确认 `bun run typecheck` 真覆盖本票文件（exit 1 → 恢复 exit 0）。

实现要点：`SubagentRuntimes.knownExecutions()`（`subagent-runtime.ts`）暴露该累计见过的执行标识；`request-accounting.ts` 在周期被替换时（`discard(undefined)`，即 `periodSwitched()` 与提交发现周期已被替换）把这些标识移入 `closedExecutions`，并在 `subagentRuntime()` 中丢弃属于已关闭周期的读数——只保留标识，不保留数值，不落盘、不新增写入。`spans.clear()`、归档先于提交、失败分级与动作准入均未改动。

未完成／未验证：

- 集成与人工验收未做（本票只提交实现；集成分支合并由 Main 决定）。
- `tests/harness-dock/detail-tree.test.ts` 在本工作树无法运行：`host-patches/*/patch.diff` 以 CRLF 检出，而 `tests/harness-dock/host-patch-artifact.ts` 的 `patchTouchedFiles` 只按 `\n` 分行，导致 `diff --git` 行尾带 `\r` 而不匹配并抛 `touches no file`；另 `host-patches/omp-18.5.0-viewed-session-codex-response/` 目录在本分支中没有被跟踪的 `patch.diff`。两者均为本票改动之外的既有环境／仓库状态问题，故未修改（该文件中当前无本票相关断言）。
- 真实宿主在 `/budget clear` 之后绘制的是新周期自己的读数（命令本身的提交即“下一条新输入”，观测为 `Span: 0:00:00`），而非已清除周期的读数；亚秒级闭区间使 dock 侧无法把该读数与污染读数区分开，因此 dock 只断言文件侧事实（归档保留关闭周期已提交的时间、新活动无任何 Session），widget 侧的清除判定由受控时钟的 S2 用例承担。

## Boundaries

复用 S1/S2/S3 和 Accounting reset 的既有整文档协调操作。不建立跨周期时间保留区、时间文件、补存或逐执行账本；不修改 omp 或新增补丁。归档只保留既有提交事实，不为重置额外采集旧时间，不撤销原本已发生的消费。内部周期／执行标记形状保持实现自由，以旧值不能污染新周期的结果验收。

## Comments

### 集成分支同步与验收复跑（集成助手，2026-10-14）

- 同步对象：`wayfinder/subagent-enhance` 的 `1c80f19`（ticket 03「任务名称与启动快照」合入后的 tip；本分支同步前为 `f25530e`，其祖先只到 `aa5e44b`）。`git merge wayfinder/subagent-enhance` → **无冲突**（`ort` 自动合并 `extensions/model-cost/GLOSSARY.md` 与 `shared-logic/request-accounting.ts`——两个特性改的是同一文件的不同区域）。合并提交 `0e2c1b2`（parents：`f25530e` + `1c80f19`）。集成分支工作区 `E:/Developer/myhub/my-agent-toolkit` 全程未被操作；未 reset、未丢弃任何既有提交（`3c749cc`／`f25530e` 均在）。
- 关键交叉点（两轴都在，互不覆盖）：① `request-accounting.ts` 中本票的 `closedExecutions`、`discard(undefined)` 回收执行标识、`subagentRuntime()` 丢弃已关闭周期读数，与 03 的 `startups`／`startupOf`／`started()`／`taskName` 命名选择各自完整保留；② `snapshotOf` 的同一快照仍同时携带 `startup`（03）与 `runtimeMs`（02）；③ `GLOSSARY.md` 的「Subagent runtime」条目保留本票的迟到读数句，03 的「Startup snapshot」「Agent tree」条目原样在。合并后相对集成 tip 的差集 = 本票自己的 7 个文件（`git diff 1c80f19..0e2c1b2 --stat` → 7 files, +531/−20），没有把别的票据改动带回或回退。
- 合并后的树（HEAD `0e2c1b2`，工作树干净）上的重跑：
  - `bun run typecheck` → exit 0。
  - `bun test tests/model-cost` → 332 pass / 0 fail（25 files，1497 expect，4.9 s；含本票 `period-switch.test.ts` 26 例）。
  - `bun test tests/model-cost tests/framework` → 702 pass / 0 fail（56 files，3300 expect，39.8 s）。
  - 本票 dock 文件（真实宿主）：`tests/harness-dock/period-switch.test.ts` → 1 pass / 0 fail（28 expect）；`tests/harness-dock/model-cost-session-span.test.ts` → 3 pass / 0 fail（31 expect）；`tests/harness-dock/detail-tree.test.ts` → 3 pass / 0 fail（73 expect，真实 patched host）。
  - `bun run test:dock` → 86 pass / 0 fail（23 files，1023 expect，204.7 s；含受影响消费者 `session-ownership-tree`／`model-cost-persistence`／`model-cost-session-span`）。
  - `bun run test` → 949 pass / 5 fail（954 tests，104 files，286.9 s）。5 处全部是 `tests/connect-bot/` 的真实面板 interop 环境失败，错误同一：`no binary is at C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`（需 `cargo build --release`），与 03 记录的同类环境失败同源；03 记录过的 `session-span` 负载型竞态本轮未出现。
- 工作区字节归一化（属环境状态，不是仓库内容改动）：本工作区把 `host-patches/**` 与 `bun.lock` 以 CRLF 检出（全局 `core.autocrlf=true`），而 dock 依据要求 LF——`patchTouchedFiles` 只按 `\n` 分行（`host-patch-artifact.ts:224`），`framework/docs/harness-baseline.json` 记录的 `bun.lock` sha256 也是 LF 字节的；同级工作区（集成工作区、03 工作区）均为 LF。首轮 dock 因此为 84 pass / 2 fail（`baseline.test.ts` 的 lockfile 记录断言、`session-driver.test.ts` 的 lockfile 校验），且 `detail-tree.test.ts` 在 `host-patch-artifact.ts:224` 抛 `touches no file`。把这两个路径的工作树字节改写为提交内容后（与 index blob 一致：`git hash-object --path` 相等、`git diff` 为空、`git status` 干净），上述 dock 全部分区转绿。本票提交不含这些路径的任何改动。
- 评审起点对照：`git diff --stat e3a1d0ea..0e2c1b2` → 52 files changed, 6742 insertions(+), 332 deletions(-)。
- 未验证／未决：集成分支的最终合并与人工验收由主 agent 决定（Status 保持 `in-progress`）；`bun run test` 的 5 处 connect-bot 环境失败需本机 `cargo build --release`（未做）；真实宿主 `/budget clear` 后 widget 画新周期自身读数的既有 caveat 不变（动机与替代覆盖见上文验收记录）；dock 对 `host-patches/**`／`bun.lock` 的 LF 字节依赖是本仓库的既有检出条件，未在本票修复。
