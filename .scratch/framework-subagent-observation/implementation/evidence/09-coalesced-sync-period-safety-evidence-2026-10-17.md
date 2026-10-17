# 09 — 合并同步不漏更新，并保护周期与在途累计（P18、P20）

日期：2026-10-17
分支：`hyper/framework-subagent-observation/09-coalesced-sync-period-safety-ef5a9e-e98ea402077c`
平台：Windows 10.0.26200（x64），Bun 1.4.2；未在 POSIX 或其他宿主版本上运行。

## 交付的行为

`extensions/model-cost/shared-logic/runtime.ts` 的 `session_commit` 处理器不再每条提示各读一次文件，改由
`synchronizeOnCommit` 合并：

- 同一 turn 内到达的提示共用一次只读同步（首个提示把读取安排在本 turn 末，后到的提示加入同一 run）。
- 同步进行期间到达的提示不清空、不丢弃，而是标记「还需要一次读取」；当前读取结束后再读一次，因此
  读取开始后才落地的写入仍会被采用。
- 提示的交付 promise 在文件被采用之后才 settle，关闭/处置等待该读取的调用方语义不变。
- 每次读取仍是既有的 `synchronize`：不写文件、不取锁、不创建临时提交、不重跑初始化；缺失与无效文档
  继续沿用既有政策；换 period 的文档继续触发 `accounting.periodSwitched()`，旧周期在途量被丢弃，
  同周期文档只采用磁盘基线。

`extensions/model-cost/README.md` 的提交提示段落补记了「同批提示共用一次读取、读取中的提示触发下一次读取」。

## 验收覆盖

测试文件：`tests/model-cost/coalesced-sync-period-safety.test.ts`（6 例）。

| 票据验收项 | 覆盖用例 | 证据要点 |
|---|---|---|
| 多个可合并提示减少同步次数，最终采用独立给定最新记录；分别记录提示与同步次数 | 第 1 例 | 3 条提示、1 次 `storage.synchronize`（计数包装 `runtime.storage`），三条记录均按磁盘最新内容可读；文件字节与目录项不变，`commit`/`load` 调用为 0 |
| 受控暂停一次同步，期间另一真实进程提交并通知，恢复后新记录可见、提示不永久丢失 | 第 2 例 | 第一次读取完成后暂停（包装 `storage.synchronize` 的门），真实子进程（`tests/model-cost/support/store-child.ts`，走框架 safe-file/lock）提交记录；暂停中再投递提示，恢复后共 2 次读取，子进程记录出现在 Owner 的 `runtime.view` |
| 同周期刷新只采用磁盘基线，不提交、丢弃或重复累计本地在途量 | 第 3 例 | 本地 1 笔已保存 + 1 笔在途；外部记录 6 笔；刷新后 `view.own(main)` 仍为 2 笔、`inclusiveTotals` 8 笔、磁盘文档字节不变、`commit` 为 0 |
| 外部换周期后只保留新周期允许记录，迟到提示不带回旧累计 | 第 4 例 | 旧周期在途 2 笔；外部文档换为 `period-replaced` 且仅含 3 笔记录；刷新后 main 的 own/roundTotals 为空、accrued 只含新周期 3 笔、文件不变；迟到提示再读后仍不带回；旧 Round 结束不产生提交 |
| 只读同步不取写锁、不建临时提交、不改文档；复用缺失/无效文档政策，不重跑初始化 | 第 5、6 例 | 第 5 例：真实子进程 + FS instrument 得到 `{reads: 2, publishes: 0, locks: 0}`，文件字节与目录项不变。第 6 例：缺失文档的提示不创建文件、period 与本地记录保持；无效文档暂停、文件不变；两次刷新后 `load` 调用仍为 0 |
| 受控并发、周期边界、所属存储/计费分区、typecheck、真实进程写入与 Owner 可见结果 | 全部用例 + 下列命令 | 第 2 例为真实子进程写入 + Owner 采用；第 3、4 例为周期/在途边界；分区与 typecheck 见日志 |

## 命令与结果

- `bun test tests/model-cost/coalesced-sync-period-safety.test.ts` → 6 pass / 0 fail（`logs/09-focused-suite.log`）。
- `bun test tests/model-cost` → 509 pass / 0 fail，51 files，19.3s（`logs/09-model-cost-partition.log`）。
- `bun test tests/framework` → 579 pass / 0 fail，48 files，58.7s（`logs/09-framework-partition.log`）。
- `bun run typecheck` → exit 0（`logs/09-typecheck.log`）。

## 变异注入（逐项注入后已还原，还原后重跑绿）

1. 去掉本 turn 末的延后（读取立即开始）：第 1 例变红，3 条同批提示变成 2 次读取。
2. 把合并循环改为只读一次（`while` → `if`）：第 2 例变红（暂停期间到达的提示未被再次读取）。
3. 换 period 时不调用 `accounting.periodSwitched()`：第 4 例以断言失败变红（旧周期在途量被保留）。
4. 同周期文档变化也调用 `periodSwitched()`：第 3 例以断言失败变红（本地在途量被丢弃）。

## 未验证 / 限制

- 本票未运行真实 pi / OMP 宿主端到端会话；P18/P20 的消费提示轴由框架既有测试与真实子进程覆盖，
  宿主退出与展示路径属于其他票据。真实进程证据是本机的独立 `bun` 子进程（同一 safe-file/lock 入口），
  不是宿主适配器进程。
- 仅在 Windows 上运行；POSIX 载体的锁/重命名行为未在本轮验证。
- 未执行全仓 `bun run test`；由集成阶段按项目约定执行。
