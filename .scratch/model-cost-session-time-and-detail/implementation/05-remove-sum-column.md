# 05: 移除 Sum，保留消费字段语义

**What to build:** 用户在 brief／detail 的 Total、Round、主会话 model 行及所有相关 descendant 行不再看到 Sum；其余消费字段保留原有意义和数值，Round 不新增时间列。

**Delivers:** P23, P25；P24 的字段精简覆盖项。

**Test owner for:** P24 的本票覆盖项；其他变化与组合路径由 01/02/06/07 各自负责，全部覆盖项完成才完成整个 Promise。

**Blocked by:** None (can start immediately).

**Status:** in-progress — implemented and tested on this ticket's branch (Sum removed from Total, Round and every detail row); the integration tip `wayfinder/subagent-enhance` (`e3a1d0e`) is already contained (`git merge` = `Already up to date.`, no conflicts) and acceptance plus related regressions were re-run on this exact state (dock partition 81/0 after the environment artifacts below), so nothing had to be changed on the branch; awaiting merge into the integration branch and acceptance.

Source: [approved contract](../contract.md) · [spec](../spec.md)

## Acceptance criteria

- [ ] P23：检查实际 widget 的 brief／detail、多种既有展示模式、Total、Round、主会话 provider/model 行和所有 descendant 行，用户可见字段集均无 Sum；验证字段而非整行固定空格。
- [ ] P25：实际 brief Round 输出不新增时间字段，不把 Total 主时间或子耗时放入 Round。
- [ ] P24：用独立给定的 Cache、费用、参考费用、上下文及直接／含后代累计期望值，证明字段移除没有重定义消费算法或改变保留数值；覆盖相关模式及 model／descendant 行。
- [ ] 不因隐藏 Sum 而无条件删除其他保留字段仍依赖的内部计算，不把费用与时间互换，不改变消费归属或存储格式。
- [ ] 完成所属输出测试分区与受影响消费者、TypeScript typecheck、实际 widget smoke；验证受影响显示表面，不仅检查源代码是否含 Sum 字符串。

## Coverage partition owned here

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P24 | 移除 Sum 后各模式保留字段的业务数值不变 | 05 | 05 |

## Boundaries

使用现有 S2 输出 seam。字段选择由 model-cost shared logic 决定，主题与终端布局在宿主绘制层；不改 omp 或新增补丁，不新增命令、聚合节点或查询 UI。时间功能由 01/02 交付，最终子代理列宽及窄屏布局由 06 交付；本票可独立完成。

## Comments

- 集成分支最新 tip `wayfinder/subagent-enhance` = `e3a1d0e` 即本票分支的 merge-base；`git merge wayfinder/subagent-enhance` 报 `Already up to date`，无冲突可解。
- 在 tip `d267d95` 上重跑（工作树干净，`git status` 无输出）：`bun test tests/model-cost` → 280 pass / 0 fail；`bun run typecheck` → exit 0；`bun test tests/harness-dock/detail-tree.test.ts tests/harness-dock/model-cost-modes.test.ts tests/harness-dock/viewed-session-total.test.ts tests/harness-dock/viewed-session.test.ts tests/harness-dock/viewed-session-host.test.ts` → 20 pass / 0 fail（真实 patched host 的 `setWidget` 帧）。
- 整个 `tests/harness-dock` 分区为 76 pass / 5 fail，5 个失败均先于本票存在且与显示字段无关：4 个 `baseline.test.ts` 需要同级的 `../my-omp-toolkit` oracle checkout（本机不存在），1 个 `session-driver.test.ts` 的 lockfile 录制哈希校验。
- 该 lockfile 失败与先前 15 个 dock 失败同源：本机 `core.autocrlf=true`（`D:/Program Files/Git/etc/gitconfig`）把 `host-patches/**/patch.diff` 与 `bun.lock` 检出成 CRLF，使 `patchTouchedFiles` 读不到文件、录制 sha256 对不上（已提交 blob 均为 LF）。本地把工作区的两份 `patch.diff` 归一化为 LF 后（字节与已提交 blob 相同，`git status` 仍干净），dock 分区从 39/15 变为 76/5；归一化未提交，也未改动任何被录制的仓库内容。（剩下的 `bun.lock` 与缺失同级 checkout 两项见下节：本轮已修复，dock 分区 81/0。）
- 未验证：P33 的人工可读性判断不由本票负责（06/人工验收）。

### 集成分支同步与验收复跑（集成助手，2026-10-14）

- 集成分支 `wayfinder/subagent-enhance` 的最新 tip 仍是 `e3a1d0e`，即本票分支的 merge-base（`origin/wayfinder/subagent-enhance` 反而停在更早的 `1a3dc17`，本地分支才是最新）。`git merge --no-edit wayfinder/subagent-enhance` → `Already up to date.`（exit 0）：无冲突、无新提交，也没有 reset 丢弃任何工作；本票因此无需任何源码修复。
- 在该状态（工作树干净，`git status --porcelain` 无输出）复跑本票验收与相关回归：`bun run typecheck` → exit 0；`bun test tests/model-cost` → 280 pass / 0 fail（1200 expect，23 文件）；受影响 dock 五文件（`detail-tree`、`model-cost-modes`、`viewed-session-total`、`viewed-session`、`viewed-session-host`）→ 20 pass / 0 fail（210 expect，真实 patched host 的 `setWidget` 帧）；整个 `bun test tests/harness-dock` → 81 pass / 0 fail（943 expect，22 文件，189s；日志 `.cache/runs/dock-full-05.log`）。用例级证据：`baseline.test.ts` 6 例 + `session-driver.test.ts` 3 例（含第 90 行 `verifyLockfile`）全通过，JUnit 里 0 个 failure。
- 相关消费者：`bun test tests/framework/deployment.test.ts` → 14 pass / 0 fail（model-cost 入口点的装载与发现；本票只改展示字段，入口点集合未变，`display.ts` 的导入方只有 `widget.ts`、`runtime.ts` 及两个分区的测试）。
- 先前记录的 5 个 dock 失败本轮全部消除；它们都属环境而非仓库内容，两处修复都在工作区/机器层面、未提交：① `bun.lock` 被 `core.autocrlf=true` 检出成 CRLF，与录制 sha256 `9e9f4833…` 不符 → 恢复为已提交 blob 的 LF 字节，与 `E:\Developer\myhub\my-agent-toolkit` 里的字节一致（现在 `git hash-object bun.lock` = `HEAD:bun.lock`、`git diff --quiet` exit 0、`git status` 干净）；② 4 个 `baseline.test.ts` 需要同级 `../oh-my-pi`、`../my-omp-toolkit`，而票据工作区位于 `%TEMP%` 下解析不到 → 建两个目录 junction：`C:\Users\hugos\AppData\Local\Temp\oh-my-pi` → `E:\Developer\myhub\oh-my-pi`、`C:\Users\hugos\AppData\Local\Temp\my-omp-toolkit` → `E:\Developer\myhub\my-omp-toolkit`（只读使用；oracle 记录的 revision `34d7c406` 是该 checkout 的历史提交，其 `bun.lock` sha256 正是录制值 `ddf372c5…`）。
- 注意：这两处都不是仓库内容，不随分支提交，新建的 `%TEMP%` 票据工作区会再次出现同样的 CRLF 与同级 checkout 解析失败（机器级 `core.autocrlf=true`，加上工作区不在 `E:\Developer\myhub` 的同级目录）；集成分支工作区本身不受影响，那里同级目录天然可达。
- 未验证：P33 的人工可读性判断不由本票负责（06/人工验收）；P25 与 Total 主会话时间共存的观察要等 01/02 合入集成分支（本票分支尚无时间字段）。
