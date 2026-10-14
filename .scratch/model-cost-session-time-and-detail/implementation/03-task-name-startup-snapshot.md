# 03: 正确任务名称与不可变启动快照

**What to build:** 用户在子代理 detail 行看到可靠任务命名句柄或明确 Session 名称，以及能够证明的启动实际模型和初始有效思考强度。完整启动事实随既有消费文档保存、恢复，不随后续设置或追加执行改写；未知历史事实如实显示“?”。

**Delivers:** P26, P27, P28, P29；P19, P22 的下列启动事实覆盖项。

**Test owner for:** P19, P22 的本票覆盖项；其余覆盖项由 01/02 负责，全部覆盖项完成才完成整个 Promise。

**Blocked by:** None (can start immediately).

**Status:** in-progress — implemented and tested on this ticket's branch（可靠任务命名句柄／明确 Session 名称与不可变启动快照）；集成分支 `wayfinder/subagent-enhance` 最新 tip `aa5e44b`（ticket 02 子代理运行时合入后）已合入本分支（10 处冲突全部按「两条轴并存」解决，合并提交 `45d16c8`），并已在合并后的树上重跑本票验收与相关回归；等待合入集成分支并由主 agent 验收。证据见 `## Comments`。

Source: [approved contract](../contract.md) · [spec](../spec.md)

## Acceptance criteria

- [ ] P26：类别 task、句柄“检索定价”、后续明确 Session 名称“定价核查”时，实际输出采用正确句柄并尊重明确名称。用 scout 等非 task 类别证明修正来源映射／名称选择，而非特判字符串 task。
- [ ] P27：启动 model-A / high 时实际输出对应组合；auto 仅采用可可靠证明的初始有效强度，不能将配置标签或当前设置冒充启动事实。使用受控场景及支持范围内真实 omp 来源证据。
- [ ] P28：后续 model-B / medium、强度调整或同 Session 追加执行后，显示及成功保存的启动快照仍为 model-A / high，不建立多模型／强度组合历史。
- [ ] P29：旧文档没有快照、仅存在当前 model-B / medium 时，无法证明的启动字段显示“?”；部分缺失也逐字段保持未知，不从当前值反推。
- [ ] P19：完整名称、模型标识及可靠启动快照随既有消费提交保存；新 runtime／进程从同一文档恢复完整启动事实，不只保留被缩略的显示文本，也不因快照到达新增专属保存。
- [ ] P22：缺新增启动字段的旧有效文档保留原 tokens、cost、parent 并继续提交；新增事实未知不等于消费文档损坏。
- [ ] 名称仅作为显示数据，不改变实际 Session 身份、直接父关系或消费归属；保留静态 Agent tree 和 descendant 一 Session 一条逻辑记录。
- [ ] 完成所属测试分区、受影响公共事实消费者、TypeScript typecheck、真实 omp 来源及实际 detail／恢复 smoke；受控 adapter 不替代真实宿主证据。

## Coverage partition owned here

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P19 | 新 runtime／进程恢复完整启动模型／有效强度快照 | 03 | 03 |
| P22 | 旧文档缺启动字段，保留有效消费且启动事实未知 | 03 | 03 |

## Boundaries

遵守 S1/S2/S3：framework adapter 提供可靠事实，shared logic 拥有快照和名称业务选择，宿主前端绘制。不猜宿主私有字段或透传完整对象，不改 omp 或新增补丁，不以当前设置补造历史事实。与 01/02 协调公共事实和可选文档字段，不固定内部 schema 字段拼写。实际终端列布局及缩略／续行由 06 交付，本票提供完整数据。

## Comments

### 集成分支同步与验收复跑（集成助手，2026-10-14）

- 同步对象：`wayfinder/subagent-enhance` 的 `aa5e44b`（ticket 02「子代理运行时」合入后的 tip；本分支同步前为 `dfa198c`，其祖先只到 `8a882f7`）。`git merge wayfinder/subagent-enhance` → 10 个文件冲突：`extensions/model-cost/README.md`、`harnesses/omp/widget.ts`、`shared-logic/{consumption-document,request-accounting,runtime,presentation/display}.ts`、`framework/adapters/omp.ts`、`tests/harness-dock/{detail-tree,model-cost-persistence}.test.ts`、`tests/model-cost/detail-widget.test.ts`。全部是「可加的相撞」：两个功能各改同一处（同一文档键集、同一 `save` 快照、同一交付处理器集合、同一行布局、同一行期望）。逐块按双方意图合并后提交 `45d16c8`（parents：`dfa198c` + `aa5e44b`）。集成分支工作区 `E:/Developer/myhub/my-agent-toolkit` 全程未被操作；未 reset，未丢弃任何既有提交（`b3eef9e`/`e93732f`/`d1633b8` 均在）。
- 关键解决（保持本票语义不被 02 覆盖，也不丢 02 的事实）：① 记录键集取并集 `{id,name,parent,startup,saveVersion,own,runtimeMs,span}`（源与 dock 校验器同步）；② `save` 的同一快照同时携带 `startup`（本票）与 `runtimeMs`（02），`session_start` 与 `subagent_runtime` 两个交付处理器并存；③ 行布局 `└─ <名称>  Model: …  Effort: …  Cache: …  [Ctx: …]  Run: …`（启动对在前，运行时字段在最后）；④ 命名仍按本票规则 `facts.name → facts.taskName → 文档名 → facts.agentName → facts.agentId → sessionId`（`request-accounting.ts` 的 `identityOf` 未被 02 触碰，自动保留本票版本）；⑤ 宿主 detail-tree 文件保留 3 例：基础树用例 + 本票的「启动事实→行/文档/下一进程」真实宿主用例 + 02 的「重启进程画已存运行时」真实宿主用例；⑥ dock 的 `startRun` 合并为单一入口 `(label, {runRoot?, home?, extraExtensions?})`，`stopRun` / `disposeRun(run, {keepRoot?})` 语义统一（谁自建根、谁负责释放）。测试侧把双方对同一行的期望合并成一条（本票 `Model: ?  Effort: ?` 前缀 + 02 的 `Run: …` 后缀），双方断言均未削弱。
- 合并后的树（HEAD `45d16c8`，工作树干净）上的重跑：`bun run typecheck` → exit 0；`bun test tests/model-cost tests/framework` → 696 pass / 0 fail（3242 expect，56 files，39.1 s）；`bun test tests/harness-dock/detail-tree.test.ts` → 3 pass / 0 fail（73 expect，11.1 s，真实 patched host 的 `setWidget` 帧）；`bun run test:dock` → 86 pass / 0 fail（1021 expect，23 files，171.8 s，含受影响公共事实消费者 `session-ownership-tree` / `model-cost-persistence` / `model-cost-session-span`）。
- 全仓库：`bun run test` → 942 pass / 6 fail（948 tests，104 files，286 s）。6 处均与本次合并无关：5 处是 `tests/connect-bot/` 的真实面板 interop 用例，错误为本机没有 `%TEMP%/omp-bot/backend/target/release/omp-bot.exe`（该目录不存在，需 `cargo build --release`），与 01 记录的同类环境失败同源；1 处是 `tests/model-cost/session-span.test.ts` 的 P36 用例在 104 文件并发下超时（5 s 轮询上限），该文件单跑 18 pass / 0 fail、该用例定向跑 3 pass / 0 fail，判为负载型既有竞态（本票合并未触碰 `framework/modules/files.ts` 与该文件）。
- 另一次不稳定观察同样已排除：首轮并行跑 `bun test tests/model-cost tests/framework` 时 `session-span.test.ts` 的「an unfinished Round … writes nothing」在 `readdirSync(root)` 等值断言上失败一次（在写锁释放前读到目录清单），随后同命令重跑 0 fail。
- 环境：本工作区 `bun.lock` 与 `host-patches/**/patch.diff` 的检出字节为 LF（CR 行数 0），`%TEMP%` 下已有 `oh-my-pi`、`my-omp-toolkit` 同级 junction，故本轮 dock 分区无需任何归一化即全绿；两项都是机器/工作区状态，不属仓库内容。
- 评审起点对照：`git diff --stat e3a1d0ea..45d16c8` → 48 files changed, 6201 insertions(+), 315 deletions(-)。
- 未验证／未决（沿用既有）：真实宿主上「已存在会话被冷恢复重绑」的 sub 会话外形仍无 dock 用例（受控 adapter 用例 + 宿主 revive 路径源码为证）；`/budget clear` 与首个假日重置后的启动事实仍待重置票；P33 人工可读性属 06；本票验收勾选与合入集成分支由主 agent 决定，故 Status 保持 `in-progress`。
