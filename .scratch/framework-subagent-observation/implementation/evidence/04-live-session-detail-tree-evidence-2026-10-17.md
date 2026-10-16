# 04 证据：detail 展示未提交会话、嵌套后代与续跑身份（P2、P3、P9）

平台：Windows 10.0.26200（win32 x64）；bun 1.4.2；TypeScript 7.0.2。所有命令在本 worktree 内运行。

## 实现（做了什么）

**S1 —— 扩展经 framework 公共消费面读到的会话身份，现在是"已保存 ∪ 本进程观察到的登记"。**

- `extensions/model-cost/shared-logic/request-accounting.ts`：`RequestAccountingInputs.registrations`
  接受 framework 的会话观察源（`framework/core/observations.ts` 的 `SessionObservations`，窄接口
  `SessionObservationSource`：`read` / `snapshot`）。`identityOf` 的事实来源改为
  `factsOf(sessionId)`：**观察记录里该会话的事实优先**，本实例自己交付过的 `reported` 只补记录里没有的成员，
  最后才落到文档记录（名称链与父关系规则不变）。选记录优先是因为它按构造更新得更勤：本进程每一次会话交付
  都会写它，另一个进程交付的每一条读数（包括只带事实、不带读数的那一条，以及读数重复因而没有事件的那一条）
  也都会写它。
- `ConsumptionView.identities()`：在原顺序（文档记录 → 本实例交付过的）之后追加**进程观察到而本实例从未交付过**
  的会话（每条一次，按进程首次观察顺序），跳过没有事实、因而不构成身份的条目。
- `inclusiveTotalsOf`：`known` 集合同样纳入这些登记会话，使"某个只登记、尚未提交的子会话之下已提交的孙"仍
  在正确的子树里计入 —— 自身／含后代口径不因观察交付方向改变。
- `extensions/model-cost/shared-logic/runtime.ts`：观察源在构建 accounting **之前**建立并作为
  `registrations` 传入（生产装配本来就把它交给 runtime），`sessionContext` 仍读同一个源。
- 没有新增持久化、schema 或迁移；读数与身份一律只在本实例内存与 framework 的进程观察源里。

## 验收对照

| 票据条目 | 证据 | 结果 |
|---|---|---|
| 主、子、孙分处实际进程；孙直接向 Owner 提供读数、树仍三级、孙不挂根（P2） | `tests/model-cost/detail-tree-process-sources.test.ts`：真子进程（`tests/framework/support/observation-access-child.ts`）经真 named pipe 向本进程 `createOwnerAccessPublisher` 服务的 seat 交付；另见 `detail-tree-live-sessions.test.ts` 两条用例（含"已提交孙挂在只登记的子之下"） | pass |
| 同一实际 session 经两个 run／进程来源交付只有一行；run／进程身份与实际 session 身份不混用（P3） | 同上文件的三条用例：续跑改名后仍是该会话一行、同名不同会话仍是两行、`identities()` 无重复项 | pass |
| 首轮提交前已展示会话行与独立给定非零上下文；缺失消费按缺失表达、不显示虚构零（P9） | 同上：`Ctx: 10% (45,000/450.0K)`、`?(?)`、`Run: —`，行上无 `Cost:`／`Cache:` 列，文档字节不变且只含主会话记录 | pass |
| 已保存与实时登记按实际身份合并；直接父关系与自身／含后代口径不被观察交付方向改变 | 同上（记录与登记同名一次、`tree.sum` 6007 含孙的 7 token） | pass |
| 不为未提交身份新增持久化或 schema 迁移；观察值不落入消费文档 | 各用例均断言文档字节前后相同；实现无写盘路径 | pass |
| 分区、受影响消费者、typecheck 与真实表面／进程证据 | 见下 | pass（限制见末） |

## 运行的命令与结果

- `bun run typecheck` → exit 0（改后多次）。
- `bun test tests/model-cost` → **473 pass / 0 fail**（43 files；新增 7 个用例：`detail-tree-live-sessions.test.ts` 6 个 +
  `detail-tree-process-sources.test.ts` 1 个；改前该分区基线 466）。
- `bun test tests/framework` → **538 pass / 0 fail**（与票据 03 记录一致）。
- 真实宿主展示消费者：`bun test tests/harness-dock/detail-tree.test.ts` → **3 pass / 0 fail**（26.6s，真 patched
  OMP host，真 `setWidget` 帧）；`bun test tests/harness-dock/session-ownership-tree.test.ts` → **3 pass / 0 fail**（9.6s）。
- 变异注入（每条注入后还原并复测绿）：①`factsOf` 忽略观察记录 → 6 条用例全红；②`identities()` 去掉登记并集 → 4 条红；
  ③会话行伪造 `costCny: 0` → 3 条红（含 P9 的"不显示虚构零"）；④树按**名称**去重 → 同名两行用例红；
  ⑤并集去掉 `seen` 去重 → 续跑一条的用例红；⑥`inclusiveTotalsOf` 不纳入登记 → 已提交孙用例红。6 条都被捕获。
- 真机 pi（见下）。

## 真机（S3）

命令与日志：`bun scripts/pi-subagent-smoke.ts --background-only --expect-pi-version 1.3.0`
→ `evidence/logs/04-pi-subagent-smoke-background.log`（本票运行，55.6s）。观察到的结果与票据 03 的记录完全一致：

- `ok the spawned session registered with the owner's process before its first Round ended`
- `ok the identity it registered with is the one the host's own session file states`
- `ok the owner's own observation source holds the reading that arrived`

其后停在同一处既有失败 `the asynchronous child's consumption is saved`（P27／票据 05），本票未触碰该路径。
即：真机 pi 1.3.0 上，另一个进程的子会话读数仍按原路径进入 Owner 进程的观察源，本票改动不改变该交付。

**限制（未验证项，不当作通过）**：
- 真机只覆盖 Windows 10.0.26200 + pi 1.3.0；POSIX 载体与其他宿主版本未运行。
- 本票的真实嵌套证据来自"两个真实交付进程 + 本进程作为 Owner（真 seat、真端点）"，不是"真 pi CLI 跑出孙会话"
  （pi 后台阶段的既有 P27 失败使该阶段无法走到孙会话）。
- 只登记、未提交事实的会话在**下一次宿主重绘**时才出现在画面上（框架对只带事实的读数不派发任何事件，本票不改
  框架派发；展示结果本身即时包含该行），`detail-tree-live-sessions.test.ts` 的同名两行用例按此读取。
- `tests/harness-dock` 的补丁工件在本 worktree 因 `core.autocrlf=true` 检出成 CRLF，dock 的 patch 解析会失败
  （既有环境问题，非本票引入）；本票把 `host-patches/*/patch.diff` 在工作区规整为 LF 后运行了上述两个真实宿主
  用例（规整后文件内容与提交 blob 一致，sha256 与 record 相同）。
