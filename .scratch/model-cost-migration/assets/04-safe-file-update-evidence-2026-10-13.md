# 04 — 安全文件更新与锁恢复：自动证据与真实贯通

Ticket: [`implementation/04-safe-file-update.md`](../implementation/04-safe-file-update.md)（P48、P49、P50，seam S4）。
2026-10-13 本会话实际执行记录，含 review retry（锁回收竞争）。每行都是已运行命令与其观察结果，不是支持声明或人工验收；H1／H2／允许的条件性 H3 未确认项不记通过（本票无此类项，见末节）。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`framework/modules/files.ts`](../../../framework/modules/files.ts) | 单一异步公共入口 `updateFile(target, update, options?)`、`SafeFileUpdateOptions`、`SafeFileUpdateError`／`SafeFileUpdateFailureKind`；协调键（现有父目录 realpath＋文件名，win32 折叠大小写）、进程级队列（提交顺序，进程 global 共享，空闲键释放）、跨进程锁**目录**（临时目录＋独占 entry 装入，`rename` 原子排他；持有者 entry 名 `<pid>-<num>-<time36>`；仅确认退出才回收；回收＝`unlink` 该持有者自己的 entry ＋ `rmdir` 空目录，两步对后来者惰性）、权限内重读解析、同目录临时文档 + rename 发布；本平台“名字正被占用”的瞬时拒绝（发布 rename、释放/回收的 unlink）一律以有界步进（6×25ms）越过，越不过就报 `io` |
| [`framework/public.ts`](../../../framework/public.ts) | 公开导出 `updateFile`／`SafeFileUpdateError`／类型（本轮未改，仍是共享逻辑直接 import 的那个入口） |
| [`tests/framework/files.test.ts`](../../../tests/framework/files.test.ts) | 17 个永久用例：真实临时本地目录、真实子进程、真实 pid 与真实存活／退出；无内存锁模拟。本轮新增两条：多进程同时回收同一死锁（4 轮 × 12 进程）与“回收后成为活持有者不被抢”；删除 `AsyncFunction`／导出列表形状断言 |
| [`tests/framework/support/file-update-child.ts`](../../../tests/framework/support/file-update-child.ts) | 子进程驱动器（`write`／`increment`／`hold`／`hold-forever`），经 `framework/public.ts` 的公开入口更新并逐行汇报 JSON 事件 |
| [`tests/framework/definition.test.ts`](../../../tests/framework/definition.test.ts) | 按 review 删除运行时导出列表形状断言（本票上轮为 `updateFile`／`SafeFileUpdateError` 扩过该断言）；其余公共面行为用例未动 |
| 文档 | [`framework/docs/framework-capabilities.md`](../../../framework/docs/framework-capabilities.md#general-safe-file-module)（锁与恢复整段重写为目录锁语义、seam 段补两条新场景、“never creates directories”改为“绝不创建调用方自己的目录”、发布段补释放/回收的同款有界步进）、模块头注释（锁形状、回收判据、后来者惰性、瞬时拒绝的有界步进、平台边界） |

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 单一异步入口接绝对目标和更新函数；现有父目录 realpath 加文件名协调别名，同键进程内 FIFO、不同文件独立、空闲键释放、失败不毒化后续队列 | `files.test.ts` → “the published entry”（非绝对路径报 `io`、目录不存在报 `io`）、“one document in one process”（提交顺序 `["enter 1"…"leave 4"]`、字面结果 `[{count:1}…{count:4}]`；拒绝后同一文档继续可写）、“two spellings of its directory are one document”（别名与正名同键、顺序 `["plain","alias"]`）、“a document being updated never holds another one”（被占文件不拖住另一文件，<1500ms 完成） |
| 跨进程锁原子排他、权限内重读/解析最新文档再调用业务更新函数、同目录临时文档原子替换；读者只见完整旧/新文档，损坏时不调用更新且不覆盖 | “two independent processes updating it lose no update”（两独立进程各 10 次、各持锁 20ms，最终字面 `{count:20}`）、“every process that races to recover one dead lock commits, and the count proves none lost”（4 轮 × 12 独立进程同时回收同一 SIGKILL 遗留锁，每轮字面 `{count:expected}` 且每进程 `done`，末轮后锁不存在）、“republishing a document never shows a reader a partial one”（300 次真实读全部为完整文档；发布后目标文件 ino 改变＝被替换而非就地重写）、“the target document itself”（非 JSON → `corrupt`、更新函数未调用、原文一字未改，随后有效文档仍可继续更新） |
| 进程内排队与跨进程取锁默认合计 15 秒、可覆盖；等待超时/取消不迟到写；更新开始后等真实结果、不假报取消、不承诺整次硬时限 | “the budget covers the in-process queue…（`timeoutMs: 300` → `timeout`，更新函数未进入，`{count:1}` 未被覆写）”、“a live holder is never taken over…（400/500ms 覆盖值实测＝500–3000ms 内失败，且此后文件仍是持有者内容）”、“an aborted wait is cancelled…（`cancelled`，更新函数未进入，文件仍为持有者内容）”、“a signal aborted after the update began is not a cancellation（中途 abort 仍以真实结果 `{count:1}` 收口并已发布）”、“with no declared budget the wait is the contract's 15000ms”（无覆盖值实测 ≥15000ms 且 <25000ms 才失败） |
| 返回可判别等待超时/取消、IO、损坏与业务拒绝；不理解消费 schema；不增同步第二入口、后台重试、持久队列或 native file-lock 依赖 | 失败种类在用例中逐一命中：`timeout`（4 例）、`cancelled`（1 例）、`io`（目录不存在、相对路径）、`corrupt`（1 例）；业务拒绝原样穿透（`expect(errorOf(outcome)).toBe(refusal)`，非 `SafeFileUpdateError`）；“publishes what it returns, whatever its shape”证明模块不解释 schema；模块只 import `node:fs/promises`、`node:path`、`../core/config`（无第三方／native 锁）；**没有任何上报后的重试**：仅有的重试是本平台瞬时拒绝（reader 占着目标、系统占着名字）上的有界步进，发生在上报之前，且不把工作推给后台 |
| 只有可靠确认持有进程退出才回收锁；不能凭年龄抢活锁；未知活性有限失败；失效锁恢复后可提交；失败释放自身资源且不长期堵塞后续 | “a live holder is never taken over”（存活持有者不被抢：`timeout` 且不写）与“the process that recovered a dead lock is a live holder no peer takes it from”（先 SIGKILL 留下死锁，下一个子进程**回收**它后持锁工作 2500ms：期间同级调用 `timeout` 不写，持有者 `done` 后文档为它写的 `{count:6}`，随后同一文档继续可写 `{count:7}`）；“a lock whose holding process died is recovered”（SIGKILL 后 5s 预算内提交 `{count:1}` 且锁消失）；年龄从不作为判据（`holderLiveness` 只认 `ESRCH`；空锁目录＝无持有者、非本模块写入的锁名＝`io` 有限失败，不猜测）；释放/回收对“本平台瞬时拒绝删除”做有界步进，因此正常路径不会把本调用自己的锁留给后来的调用（见本轮 probe 修复） |
| 用真实临时本地目录和独立进程验证存活/退出、别名竞争、FIFO、不同文件进展、完整读回、失败后继续以及受控占锁/排队取消；内存锁模拟不能替代 | 全部 17 例都在 `mkdtemp` 根上；跨进程 10 例用真实子进程（`spawn` 本进程可执行文件 + 公共入口脚本），存活/退出用 `process.kill(pid, 0)` 判据与 SIGKILL 制造；受控占锁＝子进程 `hold`／`hold-forever`；同时回收＝多子进程并发同一死锁（永久用例 12 进程 × 4 轮，独立探针 16 进程 × 20 轮）；排队取消＝本进程 `AbortController`；无任何内存锁替身 |
| 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | 所有用例 import `updateFile`／`SafeFileUpdateError` 自 `framework/public.ts`，只观察公开调用、真实文件字节与真实进程事件；期望值是字面值、计数器与合同数字（15000ms、失败种类、`{count:n}`），无一处调用被测实现计算期望，也不再断言运行时导出列表或 `AsyncFunction`（本轮按 review 删除）；本票无网络用例（唯一相关永久网络面属 ticket 03） |
| 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备 | 无真实安装/配置/Session 根参与：能力是 harness-independent 的，用例只在 `mkdtemp` 数据根上经公共入口运行，子进程 cwd 即该根；无凭据、无真实 provider、无正式 OMP 目录写入；所有异步失败均被 `outcomeOf`／`finally`／`waitFor` 承接（`waitFor` 超时的报错带上已收到的子进程事件），子进程失败逐行上报并以非零退出码结束；本文件即材料准备 |

## 本轮（review retry）：竞争风险的独立验证

| 实验（一次性，跑完即恢复，仓库内无注入残留） | 结果 |
| --- | --- |
| 旧实现（`rename` 移动＋比对＋放回/无法放回丢弃）＋在“读到死记录→回收”处注入 120ms、在“放回”处注入 180ms：1 个落后进程 + 4 个快进程竞争同一死锁 | **3/3 轮 `{"count":3}`（应 5）**＝两处 lost update；同一实验去掉注入 3/3 轮 `{"count":5}`。即：活持有者的锁真的会被移走并丢弃 |
| 旧实现无注入独立探针：16 进程 × 20 轮同时回收同一死锁 | 320 次竞争 0 丢失（11.3s）→ 该交错在黑盒下几乎不可达，风险必须靠上面的注入才可证伪；但“几乎不可达”不等于可以接受 |
| 新实现（目录锁）同一注入（在“读锁→回收”之间注入 120ms） | **3/3 轮 `{"count":5}`，5 个进程全部 `done`**：回收对后来者惰性，落后进程无法再移动/丢弃别人的锁 |
| 新实现无注入独立探针：16 进程 × 20 轮同时回收同一死锁 | 320 次竞争 0 丢失、0 失败（12.3s，与旧实现 11.3s 同量级，无吞吐回退） |
| 新实现 16 进程 × 5 轮逐轮体检（`diag`：每轮打印每个子进程事件） | 每轮 `document={"count":16}`、`failed=[]`、`pending=0`、`done=16` |
| 注入：`acquireLock` 直接返回（无跨进程锁） | “two independent processes … lose no update”失败、“every process that races to recover one dead lock commits…”失败（各 1 fail） |
| 注入：回收判据改为“永不可确认” | “a lock whose holding process died is recovered”失败（`kind: "timeout"`） |
| 上轮记录、本轮未改的代码路径：进程内队列去掉同步占位 / 发布改为就地写 | 结论不变（FIFO 顺序错乱 / 目标 ino 未改变）；本轮只把发布重试的码集合提为常量，未改其行为 |

### 本轮 probe 暴露并修复的一个真实缺陷

16 进程并发回收的第一次独立 probe（与其它测试并行跑）实测到一条**假 `io`**：

```
{"event":"failed","kind":"io","detail":"the recovered lock \"…\\counter.json.lock\" could not be removed:
 EPERM: operation not permitted, unlink '…\\counter.json.lock\\10740-1-mv5txm4i'"}
```

即本平台会在“名字正被占用/扫描”时瞬时拒绝 `unlink`（1/48 次写者）。原写法把它当 `io` 上报，写者直接失败。修复：`in-use` 码（`EPERM`/`EACCES`/`EBUSY`）在回收里表示“这次没删掉”，交回等待循环重试（受预算约束，幂等）；释放的 entry 删除加上同款有界步进（否则本调用自己的锁会一直留到进程退出＝长期堵塞后续）。修复后复测：5 轮 × 16 进程 `diag` 全轮 `failed=[]`，20 轮 × 16 进程 probe 0 丢失。这条缺陷是“真实多进程 + 真实平台”才暴露出来的，故一并记入本文件。

## 平台事实（Windows x64 / Bun 1.4.2，本机本地文件系统）

- **锁目录语义（本轮实测）**：`rename(目录, 空名)` 成功（这是原子装入的凭据）；`rename(目录, 既有目录)` 无论目标空与否都报 `EPERM`（故空遗留目录先 `rmdir` 再重试装入）；`rmdir(非空目录)` 报 `ENOTEMPTY`（这正是“回收删不掉活持有者锁”的平台凭据）；`rmdir(不存在)` 报 `ENOENT`；`unlink(不存在)` 报 `ENOENT`。回收用到的两步因此在活持有者面上都是空的：`unlink(新持有者的 entry 名)` 报 `ENOENT`（名字不在），`rmdir(有新 entry 的目录)` 报 `ENOTEMPTY`。
- **删除也会被瞬时拒绝**：本平台在名字被占用/扫描时对 `unlink` 报 `EPERM`（16 进程 probe 实测 1/48）。故回收把它当作“这次没删掉、下次再试”，释放对它做 6×25ms 有界步进。
- **rename 被 reader 拒绝**：Reader 持有目标文件时本平台 `rename` 报 `EPERM`。隔离探针（一个进程持续 `writeFile(temp)+rename`、另一进程 45k 次读）实测 writer 1984/6927 次被拒，reader 0 次错误、0 次部分文档。据此发布处加入**有限步进重试**：它不是上报后的自动重试，也不把发布推给后台，只是让一次发布不被瞬时占用误杀；仍失败则报 `io`。
- **读者可见性下限**：同一探针下把发布换成 200KB 的**非原子就地写**（15716 次读）也未被 reader 观察到部分内容——即本平台上“读者只见完整文档”对该错误不具区分力。因此该 criterion 的区分性证据由**目标文件身份**给出（`stat().ino`：rename 替换会改变、就地重写不改），已由上面的注入确认会被抓住。
- **存活判据**：`process.kill(pid, 0)` 在本平台对已退出/不存在 pid 报 `ESRCH`、对存活进程成功（探针实测），故“确认退出”判据可用。
- **已消除的交错（不是接受）**：旧实现的“`rename` 移动＋比对＋放回，无法放回则丢弃”在“读到死记录 → 别人完成回收并装入 → 再移动”的三方交错下会移动并丢弃活持有者的锁（上面的注入实测 lost update）。新实现把回收改成“只删该持有者自己的 entry ＋ 只删空目录”：两者对活持有者都是惰性的（平台事实见上），装入本身是 `rename` 独占，因此**不存在**能移动或丢弃活持有者锁的交错，落后的回收进程只会什么也没删、回到等待。这是结构性结论，并由同注入实验（3/3 轮无丢失）与 16×20 探针（0 丢失）作证。

## 实际运行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 0 errors（改写后的锁实现、释放的有界步进、新增用例、删除形状断言后的 `definition.test.ts`） |
| `bun test tests/framework/files.test.ts` | **17 pass / 0 fail**，667 expect，27.5s（含 15000ms 默认预算那项的真实等待与 4 轮 × 12 进程回收竞争） |
| `bun run test:framework` | **325 pass / 0 fail**，28 files，38.3s（删除 2 条形状断言、新增 2 条场景，净数不变；`definition.test.ts` 的 13 条行为用例在内） |
| 旧实现加宽注入（1 落后 + 4 快进程，3 轮） | 3/3 `{count:3}`（应 5）；去掉注入 3/3 `{count:5}` |
| 新实现同注入（3 轮，最终修订） | 3/3 `{count:5}`，全部 `done` |
| 旧实现 / 新实现探针 16 进程 × 20 轮 | 各 320 次竞争 0 丢失；新实现另有 0 失败、耗时 12.3s |
| 新实现 `diag` 16 进程 × 5 轮 | 每轮 16/16 `done`、`failed=[]`（修复瞬时 EPERM 之后复测） |
| 注入 5 条（无跨进程锁 2 例、永不可确认 1 例、两条窗口加宽） | 每条都按预期失败；恢复后 `files.test.ts` 复跑 green，`grep SAFE_FILE_`／`grep WIDEN` 确认仓库无残留 |

## 未验证与人工项

- 本票 Delivers（P48／P49／P50）在合同 Coverage 列均为 **S4 自动**，无 H1／H2／条件性 H3 项：无“真实 OMP 脚本多次失败”需要转人工的情形，也没有未确认就记通过的项。
- `P52`／`P58` 不在本票 Delivers 内（二者分别是持久文档 schema 与消费者迁移的具名责任），本票不实现、不改动其范围。
- 未在真实 OMP 进程内驱动该能力：model-cost extension 尚未实现（本票是它的前置框架能力）；本票的“适用宿主贯通”即上表 17 例与各次注入／探针在本机真实文件系统、真实进程上的观察。
- 本轮不修改 `tests/codebase-tools`、`tests/connect-bot` 涉及的任何源码或测试：全仓库只有 `framework/public.ts` import `framework/modules/files.ts`，故那两棵树的已知基线（166 pass / 2 fail）未受影响，本轮未复跑。
