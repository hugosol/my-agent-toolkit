# 23 — codebase-tools 统一接线与历史保护：自动证据与真实贯通

Ticket: [`implementation/23-codebase-tools-consumer.md`](../implementation/23-codebase-tools-consumer.md)（P58 的 codebase-tools 分区）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明、不是真实 provider 结果、也不是人工验收。

## 本次改了什么

**生产代码：无。** codebase-tools 在 02 原子迁移公共契约后已经站在新的公共接线上，本票的“剩余语义接入”经结构性检查确认没有遗留项可接——它是一个纯声明式消费者（`defineExtension` 声明 State／命令／两个 prompt 槽／marker 文本），没有自己的工厂、订阅、传输或装配类型可迁：

| 位置 | 本票的处置与依据 |
| --- | --- |
| [`extensions/codebase-tools/definition.ts`](../../../extensions/codebase-tools/definition.ts) | 不变。声明只含 `state: { inheritance: "follow" }`（激活字段 `enabled`，`session-entry` 持久化）＋一个 `toggle` 命令＋两个 prompt 槽＋marker 文本；没有 `factory`，也不需要（规格明说“不强迫简单扩展模拟 model-cost 内部结构”）。唯一导入是 `framework/public.ts` 的 `defineExtension` |
| [`extensions/codebase-tools/harnesses/omp.ts`](../../../extensions/codebase-tools/harnesses/omp.ts) | 不变。整份 OMP 装配是 `ompAdapter(CODEBASE_TOOLS)` 加一次 `bound` 观察；不注入工厂、不声明 `requiredSemantics`、不安装任何传输，因此没有旧 `events`／`actions` 装配形状、没有 `PushTransport` 式双轨、也没有 owner-only 通用过滤可删 |
| [`entrypoints/omp/codebase-tools.ts`](../../../entrypoints/omp/codebase-tools.ts) | 不变。薄入口只 `export { default } from "…/harnesses/omp"`，是 loader 唯一发现的 codebase-tools 文件（无聚合 `index.ts`） |
| [`extensions/codebase-tools/shared-logic/prompts.ts`](../../../extensions/codebase-tools/shared-logic/prompts.ts) | 不变。两个 Markdown 资源按 text 导入，注入文本就是资源本身 |
| `tests/codebase-tools/**` | 只动了一处：[`subagent-owner.test.ts`](../../../tests/codebase-tools/subagent-owner.test.ts) 在既有真实委派场景里补 4 条断言（子会话自己那次出站请求中，prompt 落在该会话自己的用户消息之后、位于对话尾部、角色为 `user`），把 criterion 2 的“真实主/子请求验证 prompt 与历史顺序”在**子请求**上也变成被观察事实；场景、既定期望、其它 6 个套件一字未动。7 个套件全部由真实 loader／RPC／出站捕获／Session JSONL 观察；既无内部转发断言，也无旧类型形状断言（见下“结构性检查”）。`outbound-role.test.ts` 的 3 行改动来自 22 的 dock capture-server 接口调整（`protocol` 参数），不是本票语义改动 |

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 02 已原子迁移公共契约，本票完成剩余语义接入；保留原命令行为、prompt、历史保护和激活 State，不改变既有业务契约 | 结构：上面表格（唯一生产入口是公共 `defineExtension` ＋ OMP 适配器装配，无内部私有组装接口被扩展使用）。行为：`bun test tests/codebase-tools` **24 pass / 0 fail**（迁移后的 framework 工作树）：prompt（[`init-injection.test.ts`](../../../tests/codebase-tools/init-injection.test.ts)、[`reminder-injection.test.ts`](../../../tests/codebase-tools/reminder-injection.test.ts)、[`outbound-role.test.ts`](../../../tests/codebase-tools/outbound-role.test.ts)）、历史保护（同上及 [`session-boundaries.test.ts`](../../../tests/codebase-tools/session-boundaries.test.ts)）、激活 State（[`command-toggle.test.ts`](../../../tests/codebase-tools/command-toggle.test.ts)、session-boundaries）、原命令行为（command-toggle、[`marker-lifecycle.test.ts`](../../../tests/codebase-tools/marker-lifecycle.test.ts)）逐条通过，业务契约（注入文本、槽身份、State 记录形状与通知文案）一字未动 |
| follow 仍 live 读取 Owner 当前值、none 使用默认，子不获写权限；真实主/子请求验证 prompt 与历史顺序 | [`subagent-owner.test.ts`](../../../tests/codebase-tools/subagent-owner.test.ts) 两例（真实 built-in `task` 委派）：①owner 关闭时生成的子会话零投递、且**不写任何 State**（子会话 JSONL 无任何 `codebase-tools:*` 条目）；owner 启用后生成的子会话**按 owner 当前值 live** 初始化自己的分支（1 个 init，其后每轮 1 个 reminder），且同样不写 State——子不获写权限。②嵌套子代理向上两级解析同一 owner，各在自己分支初始化、各不写 State。none／默认侧由同一套件与 session-boundaries 覆盖：新 Session、无 State 分支的 fork 都从默认 off 起（`session-boundaries.test.ts`“a new session…”“a fork … carries no State starts off”），逐 Session 的 init 进度各自独立（每个子分支都自己 init 一次）。prompt 与历史顺序：init/reminder 的**落点顺序**由 journal 的挂点与请求尾位置断言（`init-injection.test.ts` 断言注入条目在用户消息之后且 `parentId` 指向它、`reminder-injection.test.ts` 断言三条投递的 `parentId` 依次等于三个用户消息条目、`outbound-role.test.ts` 断言注入文本是请求最后一条消息且未混进 system 消息），**子请求**一侧由 `subagent-owner.test.ts` 本轮新增的断言承担（子会话自己那次出站请求里，注入文本位于该会话自己用户消息之后、是请求最后一条消息、角色 `user`——与主路径记录的事实一致），历史只追加不改写由两个套件的 `expectAppendOnly` 断言 |
| 使用生产公共入口与真实 loader/RPC/出站及 Session 记录验证，不保留旧 owner-only blanket gate 或测试专属 dispatch | 生产公共入口：`entrypoints/omp`（真实 loader 发现）＋隔离安装的真实 OMP 进程（`ControlledSession` 走真实 RPC 帧 / `--resume` / `new_session` / `branch` / `fork`）。出站：本机捕获端点逐字节记录 harness 自己序列化的请求体。Session 记录：真实 JSONL 逐条读回。旧 gate／专属 dispatch：全分区不存在订阅声明（codebase-tools 只有 prompts、marker 与一个 toggle，无事件组），因此没有 owner-only 通用过滤可留；框架 S1 侧的 owner gate 由 02 的 `tests/framework/owner-gate.test.ts` 持有，本票不重复认领 |
| 本票拥有 P58 的 codebase-tools 覆盖与 tests：prompt/历史保护/State/follow-none/原命令行为；保留有效场景，删内部转发或旧类型形状断言，不重钉旧内部预期 | 分区覆盖矩阵见下节。有效场景全部保留、既定期望一条未改写（唯一改动是 `subagent-owner.test.ts` 上**追加**的 4 条观察，见“本轮补的 4 条断言”，并以临时变异验证其敏感性后还原）；`tests/codebase-tools` 中不存在内部转发或旧类型形状断言（结构性检查一栏给出判据：测试只导入 harness-dock 与扩展自己的 prompt 资源，不导入任何 framework 模块，`events:`／`actions:`／`PushTransport`／`installPushTransport` 零命中） |
| P58 仅在 22 与本票都完成后整体完成，本票不重复认领 connect-bot tests，也不迁移 framework 内部私有组装接口给扩展使用 | 本票改动集不含 `tests/connect-bot/**` 与 `extensions/connect-bot/**`；`extensions/codebase-tools/**` 未新增对 `framework/core/**`、`framework/behaviors/**` 的导入（结构性检查）。P58 整体状态见“未验证／限度” |
| 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | 观察面是 S5（隔离真实宿主：CLI／RPC／stderr／出站捕获／Session 记录／UI 帧）。期望值全部是合同与记录事实的字面值：`codebase-tools:init`／`:reminder`／`:state` 身份、`{ enabled: true }` 记录、`codeBaseTools enabled|disabled` 通知、区域 key `semantic-extensions`／placement `aboveEditor`／文本 `◈ codeBaseTools`、记录的两条 provider 路径角色（`user`／`developer`）、以及从磁盘读出的 prompt 资源文本本身（资源，不是对实现的复述）。没有任何期望由调用被测框架／扩展重新计算。永久用例不访问远端：出站只到本机捕获端点（`openai-completions` 脚本应答） |
| 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作 | 每次运行由 `ensureIsolatedHarness(readBaselineRecord())` 使用 `.cache/omp-baseline/18.5.0` 的隔离精确安装，`createRunRoot` 在系统临时根下新建 agent-state／sessions／work／captures 四个目录（本会话运行期间可见 `%TEMP%\omp-dock-*` 路径），显式 `-e` 只加载 `entrypoints/omp` 与 dock fixture。未读取或改写 `~/.omp/agent/config.yml`、未触碰正在运行的 agent／panel。凭据：dock fixture 用合成 key（`dock-key`）、provider 覆盖用合成串，codex 探针是自造 JWT 形状 token；本票无真实秘密进入输出。自动检查与证据已在本轮完成；H1／H3 属人工项，未因此暂停任何可执行工作 |

## 分区覆盖矩阵（P58 codebase-tools，全部 S5 真实宿主）

| 覆盖项 | 用例 | 观察到的行为（字面期望） |
| --- | --- | --- |
| prompt：init 一次、每轮一次 reminder | [`init-injection.test.ts`](../../../tests/codebase-tools/init-injection.test.ts)（3 例）、[`reminder-injection.test.ts`](../../../tests/codebase-tools/reminder-injection.test.ts)（4 例） | 一个 `codebase-tools:init`（`content` 等于资源文本、`display: false`、`attribution: agent`），其后每启用轮恰好一条 `codebase-tools:reminder`；工具续跑只在同一 run 内重放、不重复注入；journal 中进度不落 State（无 `initInjected`） |
| prompt：投递角色与位置是记录事实 | [`outbound-role.test.ts`](../../../tests/codebase-tools/outbound-role.test.ts)（3 例） | `openai-completions`：system 消息不含注入文本，注入是**最后一条** `user` 消息；`openai-codex-responses`（shape-only 第 1 层）：`instructions` 不含注入文本，注入是尾部 `developer` input item；两条路径都投递，角色不是门禁 |
| 历史保护 | init-injection（resume 用例 `expectAppendOnly`）、reminder-injection（off/on 与工具续跑用例）、session-boundaries（legacy 记录不被改写） | 先前条目逐条原样、同序保留；新记录只追加；resume 重放而不是二次注入 |
| 激活 State | [`command-toggle.test.ts`](../../../tests/codebase-tools/command-toggle.test.ts)、[`session-boundaries.test.ts`](../../../tests/codebase-tools/session-boundaries.test.ts)（6 例）、marker-lifecycle（恢复值用例） | 干净 Session 无记录、无投递；每次 toggle 追加 `{enabled: …}` 并只发一条通知；重启／`new_session`／tree／branch／fork／无 State 分支的 fork 恢复语义与默认 off 一致 |
| follow／none／子写权限 | [`subagent-owner.test.ts`](../../../tests/codebase-tools/subagent-owner.test.ts)（2 例） | owner off 时子静默且不写 State；owner on 后子按当前值 live 初始化自己分支；嵌套子代理同样解析同一 root owner；所有子会话 `codebase-tools:state` 条目为空；子会话自己那次出站请求里，注入文本位于其自身用户消息之后、位于请求尾部、角色 `user`（与主路径记录一致） |
| 原命令行为 | command-toggle、marker-lifecycle | `/codebase-tools` 不触发模型（`agentInvoked: false`）、两次调用持久化两个值、通知文案与顺序 `codeBaseTools enabled`→`disabled` |
| marker 生命周期（本扩展自己的线，不是统一出口） | [`marker-lifecycle.test.ts`](../../../tests/codebase-tools/marker-lifecycle.test.ts)（3 例） | 默认 off 渲染空区域；toggle 出版一行 `◈ codeBaseTools`；启用轮重绘同一行；off 清除（`widgetLines` 缺省）；恢复的启用值在会话边界就带线；`--no-ui` 下不产生 widget 帧、反馈走 stderr 且退出码 0 |

## 结构性检查（非运行时观察，逐条已运行）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| codebase-tools 生产路径只走公共入口 | `grep -rn "framework/" extensions/codebase-tools entrypoints/omp/codebase-tools.ts` | 命中 3 处且都在公共面：`definition.ts` → `framework/public`、`harnesses/omp.ts` → `framework/adapters/omp`（装配层，与 connect-bot／model-cost 相同）、README 链接；无 `framework/core/**`／`framework/behaviors/**` 私有组装接口 |
| 分区内无旧传输／旧装配形状／测试专属 dispatch | `grep -rn "PushTransport\|installPushTransport\|setPushTransportForTest\|events:\s*{\|actions:\s*{" extensions/codebase-tools entrypoints/omp tests/codebase-tools framework/public.ts framework/core/definition.ts framework/core/assembly.ts` | 零命中 |
| 分区测试不导入 framework 模块 | `tests/codebase-tools/*.ts` 的导入面 | 只导入 `bun:test`、`node:*`、`../harness-dock/**` 与扩展自己的 `shared-logic/prompts`（资源文本） |
| 无 owner-only 通用过滤遗留 | `grep -rn "blanket" framework extensions tests entrypoints` / `grep -rn "scope:" extensions/*/harnesses/*.ts` | 零命中；唯一声明订阅范围的是 connect-bot（22 分区，`owner`），codebase-tools 无订阅 |
| 装载源互斥（真实 loader） | `bun test tests/framework`（C12／N8 用例） | 385 pass / 0 fail；本仓库 OMP 根绑定 3 个入口（codebase-tools／connect-bot／model-cost），各一入口、无聚合 index |

## 本轮补的 4 条断言（红绿纪律）

criterion 2 把“真实主/子请求验证 prompt 与历史顺序”写进本票，而子会话那一侧此前只有投递**计数**断言。补的断言加在既有真实委派场景里（`subagent-owner.test.ts` 第一例），只观察已经抓到的出站请求体：

- 补断言前：该文件属于首次 `bun test tests/codebase-tools` 的 **24 pass / 0 fail** 运行，即该行为本来已满足，没有可制造的 red；
- 补断言后再跑（单文件）→ **2 pass / 0 fail**，41 expect；
- 敏感性检查（临时把角色期望改成 `developer` 这一处变异）→ 该例 **fail**：`Expected: "developer" / Received: "user"`，该次运行 1 pass / 1 fail、38 expect（首例在角色断言处中止，其后 3 条未执行），证明这 4 条断言确实在读取子会话真实发出的请求体，不是空跑；
- 还原后重跑 → **2 pass / 0 fail**；整套 `bun test tests/codebase-tools` → **24 pass / 0 fail（334 expect）**。

期望值来自合同记录的事实（该序列化路径下持久化自定义消息的角色是 `user`，注入追加在尾部），不是由被测实现重算。

## 实际运行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 0 errors（补断言前后各一次） |
| `bun test tests/codebase-tools/subagent-owner.test.ts` | **2 pass / 0 fail**，41 expect，3.4s（补断言后）；变异检查时 1 pass / 1 fail |
| `bun test tests/codebase-tools` | **24 pass / 0 fail**，334 expect，7 files，42.8s |
| `bun test tests/framework` | **385 pass / 0 fail**，2004 expect，32 files，39.6s |
| `bun test`（全仓） | 见下节“全仓基线” |

## 全仓基线

| 命令 | 结果 |
| --- | --- |
| `bun test`（全仓，补断言后冻结工作树） | **886 pass / 3 fail**，889 tests，100 files，4928 expect，284.4s |

3 个失败全部在本票改动集之外，也与 22／03 记录的基线逐条一致：

- `baseline record > the checkout is at the recorded revision anchor`（`tests/harness-dock/baseline.test.ts`，anchor 漂移，改动前就在）；
- `baseline record > the run artifact stays byte-identical to the anchor for the recorded contract files`（同上，四个 contract 文件字节漂移，改动前就在）；
- `the credential reaches its own query and no other surface of a real run (P53)`（`tests/harness-dock/model-cost-balance.test.ts`）：该用例自己的 `storageFiles()` 递归遍历时撞上并发写入方删除中的 `.lock` 目录而 `ENOENT`——计时抖动，与本票改动无关。

`tests/codebase-tools`（本票分区）**24 pass / 0 fail**；`tests/framework` **385 pass / 0 fail**。

## 未验证／限度（不得当作通过）

- **P58 整体仍未完成**：分区表要求 22 与本票都完成。本票分区（真实 loader／RPC／出站／Session 记录下的 prompt、历史保护、State、follow/none、原命令行为）已全部通过；connect-bot 分区由 22 的证据承担，本票不认领、也不重复其用例。
- **marker 统一出口属 18**：本票只保留本扩展自己的 marker 生命周期观察（线、清除、重绘、恢复值），没有、也不重复 18 的统一出口与查看席位（Viewed session seat）用例。
- **未接触真实 provider／凭据**：出站是**本机捕获端点**（mock，`openai-completions` 脚本应答；codex 路径为 shape-only 第 1 层）。真实服务的最终效果属 H2，本票不作任何断言。
- **未跑 patched viewed-session artifact**：本分区永久套件跑固定 18.5.0 隔离安装（未打补丁），因此本分区不覆盖查看席位的 State 投影（18 的分区）。
- **人工项未做**：H1（交互 TUI 视觉：默认无 marker、toggle 通知与 marker 出现、每轮重绘、清除）与 H3a（永久切换 codebase-tools，先决是 H1 通过）仍是 `unverified`，未经用户确认不记通过；本票只把自动等价物与证据准备到可复核的程度（见分区矩阵最后一行与 [`extensions/codebase-tools/README.md`](../../../extensions/codebase-tools/README.md) 的 H1／H3a 清单）。
- **文档指针**：`extensions/codebase-tools/README.md` 与 `framework/docs/**` 中指向 `.scratch/codebase-tools-omp-v1/…` 的 H1／角色证据链接属于上一次迁移的规划目录，本票未改（材料与切换收口由验收/切换票持有）。
