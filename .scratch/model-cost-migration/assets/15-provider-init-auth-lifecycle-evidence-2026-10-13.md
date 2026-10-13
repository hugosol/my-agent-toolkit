# 15 — 并行初始化、当次鉴权与非阻塞调度：自动证据与真实贯通

Ticket: [`implementation/15-provider-init-auth-lifecycle.md`](../implementation/15-provider-init-auth-lifecycle.md)（P37、P40、P53；seam S1／S2／S5）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明或人工验收。全程未读取任何真实凭据、未触碰正式 OMP。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`extensions/model-cost/shared-logic/provider-balance.ts`](../../../extensions/model-cost/shared-logic/provider-balance.ts) | 新增 `prefetch()`：实例初始化时**一次**预取（每实例一次、永不 reject、返回该次查询的完成）；一条查询路径两种触发（`startup-prefetch`／`settled-request`），缺源规则按触发区分：宿主无法鉴权的源在 startup 下**不是一次尝试**（不出站、不记 failure），在 settled 下是**该次查询的失败**（`no-access`）；`beginQuery` 让在途查询被后续触发**合并**而非重复（含预取与 usage 互相合并），仍无主动取消（options 无 `signal`） |
| [`extensions/model-cost/shared-logic/runtime.ts`](../../../extensions/model-cost/shared-logic/runtime.ts) | `initialize` 在 baseline／estimate 读取后 `await Promise.all([balance.prefetch(), quota.startup()])`：两源**并行**发起，收口由较慢者决定而非两者之和；模块头与 `initialize` 契约注释同步 |
| [`extensions/model-cost/GLOSSARY.md`](../../../extensions/model-cost/GLOSSARY.md) | 「Provider balance reading」词条修订：CLI 启动一次预取、缺源不查（不尝试、不记 failure）、预取之后仍只有本 provider 的 settled 请求检查成功 TTL |
| [`tests/model-cost/runtime-initialization.test.ts`](../../../tests/model-cost/runtime-initialization.test.ts) | 新 S2 套件（13 例）：并行预取与请求形状、缺源不查、首请求门槛（成功／失败／超时都不 reject）、同 CLI 共用／独立 CLI 分开／切会话不重取、悬挂查询不阻下一次 run initiation 与在途合并、销毁后迟到结果不落地不重绘、当次凭据固定与替换、合成秘密哨兵 |
| [`tests/model-cost/provider-balance.test.ts`](../../../tests/model-cost/provider-balance.test.ts) | 既有 P38 套件按新契约**同票迁移**（12 例）：预取请求单独留证（`bound.prefetched`），用例自身的 `sent`／`resolved`／通知从预取之后起算，TTL 边界锚在预取的读数时刻（30000ms 前后各 1ms）；`respond` 的 index 仍是实例自始的序号 |
| [`tests/model-cost/codex-quota.test.ts`](../../../tests/model-cost/codex-quota.test.ts) | 既有 P39 套件**同票迁移**（15 例）：helper 的 access 只答 account API 的 provider（余额预取在此文件不查、不记），`resolved` 断言补上「两源都被问过」的观察；13 号票的 `no-access` 用例与其语义未改 |
| [`tests/harness-dock/model-cost-balance.test.ts`](../../../tests/harness-dock/model-cost-balance.test.ts) | S5 隔离真实宿主 smoke 扩到 6 例：读数与 TTL 内不再查（含 `arrivals()` 顺序：余额先于模型请求）、首请求门槛（持有答案时模型请求 3s 窗口内不出站、放行后才出站）、被拒与模型不被阻断、悬挂查询期间下一次 exchange 照常且合并而不重复、带在途查询退出、秘密哨兵 |
| [`tests/harness-dock/capture-server.ts`](../../../tests/harness-dock/capture-server.ts) | 加法式扩展：`balance.holdFrom`（持住第 N 次起的余额应答）、`arrivals()`（端点真实到达顺序）、`releaseBalance()`；既有 `requests()`／`balanceCalls()`／`responseHeaders` 形状未改 |
| [`tests/support/pending-query.ts`](../../../tests/support/pending-query.ts) | 新共享测试支持：`turn`／`drain`／`until`／`settled`／`heldAnswer`，全部**无墙钟等待**（`until` 以循环驱动并自报未成立的条件），供 S2 两套件复用 |

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 认证可读时一次**并行**预取已配置 DeepSeek／Codex，缺源不查，不依赖当前模型；首模型请求前成功／失败／超时有限收口，失败不阻断 | S2 新套件：①持有两源应答时 `sent` 同时为 `["…/user/balance","…/wham/usage"]`（顺序＝被询问顺序），且首个 run initiation 在任一应答前**不 settle**（`settled(firstRequest)` 为 false）——串行 `await` 会让第二个请求根本不出现；②access 只答一方或只给地址不给凭据时，该源**零请求**、余额结果为空（`{}`，既无读数也无 failure）；③两源都被拒（503／transport reject）时 run initiation 仍 settle，两结果各自记 failure 且不在 operator 通道留痕；④预取发生在 owner 会话节点、任何 Turn 事实之前（`binding.ts` 的 `session_start` 节点＋run-initiation 等待），地址取 provider 自身而非任何模型 |
| 同 CLI 子共用缓存／初始化，独立 CLI 各自独立；切模型／Session／tree／查看不全量预取或销毁有效缓存 | S2：子代理 session 与自身 run initiation 零新请求；一次普通切会话（`session_end(transferred)` ＋ `session_start(resume)` ＋ `session_facts`）零新请求且预取读数仍在；两个 runtime（＝两个 CLI）各 2 次请求、各带自己的宿主凭据（无跨实例共享）。框架侧「一实现一初始化、普通切换不销毁」由 `tests/framework/implementation-lifecycle.test.ts`（P56）持有 |
| 每次操作读取并固定当次已生效凭据及必要地址，替换不改在途操作；凭据／OAuth／原生接入失败只影响对应查询，不跨凭据借用、不填零 | S2：access 在查询开始时被读取并把地址／凭据**固定在当次请求**里——持住该查询期间替换宿主凭据，在途请求头仍是旧凭据（`Bearer balance-key`），下一次操作才是 `Bearer key-two`；只给地址不给凭据时不出站、不借另一 provider 的凭据（断言两请求各带自己凭据）；失败是分类事实（`no-access`／`unreachable`／`unreadable`／`misconfigured`）而非零读数 |
| 运行期悬挂网络不阻下一模型请求、工具、idle 或退出；通知时重读当前目标，销毁后迟到结果不反馈／重绘／进入新实例，不新增主动 HTTP 取消或退出排空 | S2：读数过 TTL 后触发的一次查询永不回答时，`initiateRun`（首个未完成初始化之后的「下一次模型请求」位置）照常 settle，其后的 settled 请求**合并**在途查询（`balanceCalls` 仍 2）；所有出站 options **无 `signal`**（无主动取消）。S5：悬挂余额端点期间第二个真实 exchange 照常发出并完成（`arrivals` = `balance,model,balance,model`，模型请求在查询仍未应答时到达端点），随后带在途查询 `session.stop()` 退出码 0 且未超时。销毁：会话结束（`session_end(disposed)`）后到达的两份迟到应答都不落地（`balance()`／`quota()` 仍为空、零通知），随后新建实例从自己的预取开始。「通知时重读当前目标」由展示／widget 既有实现持有（`tests/model-cost/display.test.ts`、dock `model-cost-modes`） |
| 合成秘密哨兵验证正确目标／鉴权、当次固定和局部失败；错误、日志、模型内容、文件与证据不含秘密，真实秘密不进入对话 | S2：哨兵只出现在它自己 provider 的请求头（`Bearer SENTINEL`），且**两条失败路径**（余额端点 503、account API transport reject 且 reject 信息本身含哨兵）之下：余额／额度结果 JSON、feedback、notices、port diagnostics、storage root 全部文件都不含哨兵——失败仍以分类 detail 可见（不抑制可见性）。S5：真实宿主 run 的 `stderr()`、session JSONL、载荷捕获的模型请求正文、widget 帧、扩展 storage 文件均不含哨兵，而 `GET /user/balance` 的 `authorization` 恰为 `Bearer SENTINEL`（隔离 run 自己的 fixture 凭据）。真实秘密：本会话从未读取任何真实凭据，文档与命令输出也不含真实秘密 |
| 通过公共绑定、S2、mock 网络及隔离实际 OMP 请求顺序验证并行／首请求门槛／非阻塞／销毁；使用网络悬挂场景而非仅 Promise 不抛断言 | 并行／门槛／非阻塞／销毁在 S2 用「永不回答的 promise」驱动（`heldAnswer`）＋生产 runtime ＋框架公共绑定（port double）＋注入的同形 HTTP；S5 用**真实**子进程＋真实 capture 端点：余额请求先于模型请求到达（`arrivals()`）、持有应答时模型请求 3s 窗口内不出站、悬挂期间 exchange 照常、带在途查询退出。所有断言都是「发生了什么／没发生什么」，不是「Promise 没抛」 |
| 通过批准的生产公共 seam 观察行为，预期来自合同／规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | 观察面＝S2 只读结果／变化订阅／出站请求记录／operator 通道／文件，S5 真实操作者入口（RPC、stderr、session JSONL、端点到达）。预期字面值：5000ms／10000ms 业务预算、30000ms TTL、`https://chatgpt.com/backend-api/wham/usage`、`<base 去尾 /v1>/user/balance`、文档化 `balance_infos` 与 `rate_limit` 文档形状、`Bearer <credential>`、端点到达顺序（`arrivals()`）——全部来自规格与被测协议文档，未用被测实现重算；永久 tests 的网络一律为注入的 mock／holding promise |
| 使用隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作 | S5 走 dock 隔离 baseline install ＋ `createRunRoot`（agent state／session／work／capture／user-home 全在 run root 内），provider override 只改隔离 run 的 baseUrl／apiKey（`dock-key` 与合成哨兵，均非真实秘密）；S2 全部 `mkdtemp` root。异步失败：两模块的失败都在自身只读结果自述、不 reject 初始化、不进 operator 通道；结果、日志、文件、widget、请求记录均已核对无凭据。本票自动检查已全部完成（见下表）；H3 条件性人工项未触发（见文末） |

## 实际运行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 0 errors |
| `bun test tests/model-cost/runtime-initialization.test.ts` | **13 pass / 0 fail**，53 expect（新 S2 套件） |
| `bun test tests/model-cost/provider-balance.test.ts` | **12 pass / 0 fail**，38 expect（P38 套件迁移后） |
| `bun test tests/model-cost/codex-quota.test.ts` | **15 pass / 0 fail**，45 expect（P39 套件迁移后） |
| `bun test tests/model-cost` | **173 pass / 0 fail**，642 expect，13 files |
| `bun test tests/framework` | **374 pass / 0 fail**，1969 expect，31 files（S1 门槛与生命周期未回归） |
| `bun test tests/harness-dock/model-cost-balance.test.ts` | **6 pass / 0 fail**，39 expect，20.9s（隔离真实宿主） |
| `bun test tests/harness-dock` | **56 pass / 2 fail**，589 expect，97.7s；2 个失败是本机既有 `baseline.test.ts` anchor 漂移（checkout 停在 `579da1d…`，记录锚为 `9348320…`），与 12 号证据／13 号 retro 记录的同两条一致，非本票引入 |
| `bun test`（全仓） | 见文末「全仓复跑」一节 |

## 故障注入（green 后的证据复核）

在被测实现／测试观察点上做定点注入（`edit`／`sed` 注入 → 复跑 → 还原），确认用例真的能抓住对应违规：

| 注入 | 观察 |
| --- | --- |
| `initialize` 改回串行（`await balance.prefetch(); await quota.startup();`） | S2 3 fail（并行案例的「两请求同时在途」不再成立）|
| 预取改成 fire-and-forget（`void Promise.all([...])`） | S2 2 fail（并行／门槛用例：首个 run initiation 不再等待预取；当次凭据用例同时失效）＋S5 门槛用例 fail：`expectNoArrival` 报 `a model arrival reached the endpoint inside the window: balance,model` |
| 去掉余额预取（`Promise.all([quota.startup()])`） | `runtime-initialization` ＋ `provider-balance` 共 24 例中 **17 fail / 7 pass**（并行、门槛、同 CLI、非阻塞、销毁、当次凭据、哨兵各点全部报出） |
| 缺源规则改成「一律记 `no-access`」（去掉触发区分） | S2 2 fail（缺源不查的两个用例：余额结果不再为空） |
| 去掉迟到读数的 `if (disposed) return;` | S2 1 fail（销毁后迟到结果不落地／不重绘） |
| 去掉在途合并（`beginQuery` 不再复用 `outstanding`） | `runtime-initialization` ＋ `provider-balance` 共 6 fail（其中「合并」用例不再合并） |
| 失败 detail 改成携带凭据（`fail(\`unreadable ${facts.credential}\`)`） | S2 2 fail（哨兵用例与失败语义用例一并报出） |
| 所有注入均已还原，还原后复跑 `tests/model-cost` 与 dock balance 套件：0 fail | 见上表 |

## S5 真实宿主 smoke 观察（脱敏）

`bun test tests/harness-dock/model-cost-balance.test.ts`（隔离 18.5.0 install ＋ 本机捕获端点，6 例）：

- **预取与读数**：真实 RPC 会话一次 `deepseek/deepseek-flash` exchange → `GET /user/balance` 收到 1 次调用（`authorization: Bearer dock-key`，隔离 run 自己的 fixture 键）→ widget 显示 `Balance: ¥110.00`（端点脚本金额）→ TTL 内第二次 exchange 仍 1 次调用、`requests()` 为 2；`arrivals()` = `balance,model,model`（余额查询先于两次模型请求到达）。
- **首请求门槛**：捕获端点持住余额应答 → 余额请求已到达、模型请求 3s 窗口内**未**到达、exchange 未完成；放行后模型请求到达、exchange `completed`、widget 显示端点金额。
- **被拒路径**：`/user/balance` 答 503 → 预取与随后 settled 请求各查一次（`balanceCalls()` = 2，因拒绝不是读数）→ widget `Balance: unavailable (unreadable)`、stderr 为空、无 notify 帧、exchange 仍 `completed`。
- **悬挂不阻塞**：端点永不回答时首个 exchange 只等余额业务预算即完成（预取以 `unreachable` 收口）→ 其 settled 请求开出的第二次查询被持住，第二个 exchange 的模型请求在该查询仍未应答时到达并完成（`arrivals` = `balance,model,balance,model`），未重复第三次查询；放行后读数被接纳。
- **退出**：端点持住第二次查询时 `session.stop()` → 退出码 0、`timedOut: false`。
- **哨兵**：`writeProviderOverride(..., apiKey: SENTINEL)` → `/user/balance` 头为 `Bearer SYNTHETIC-SENTINEL-…`，而 stderr、session JSONL、捕获的模型请求正文、widget 帧、storage 文件均不含该串。

## H1／H2／H3 与人工项

- 本票三条承诺（P37／P40／P53）的 Coverage 均为**自动＋条件性 H3**，没有具名 H1／H2 项。
- H3 条件性转交的条件是「真实 OMP 脚本多次失败或成本明显过高才可转人工」。本次运行的隔离真实 OMP 脚本（dock balance 6 例，其中门槛／悬挂／退出／哨兵均为真实子进程）**一次通过**，无重试、无超成本，因此**无 H3 转交项**，也没有待人工确认的条件项。
- 真实 provider 最终效果（P37 的「真实 DeepSeek／Codex 源」读取质量）不属本票：它是 H2 项，由 P38／P39 的证据与人工确认持有；本票只交付调度、门槛与非阻塞，不新增对真实服务的认证。

## P58／P52 具名责任

- **P58（受影响消费者迁移后原协议不变）**：本票没有改动框架公共 Interface —— `ProviderBalance.prefetch()` 是扩展 shared logic 内部（非 `framework/public.ts` 导出）的新方法，框架的 `ExtensionImplementation`／`HarnessPort`／`ProviderAccess` 形状未动。受影响的调用方是**测试面**（余额／额度两套 S2 的 helper 与断言），已在本票内同票迁移（见上表），connect-bot 与 codebase-tools 的公共接线未受影响：`tests/connect-bot`、`tests/codebase-tools` 的既有套件全绿（见「全仓复跑」）。既有业务语义未改：余额成功 TTL、在途合并、失败保旧值、无轮询／补发仍由迁移后的 P38 套件逐条断言。
- **P52（持久文档只含批准 schema，不增加账本）**：预取只写进程内存读数（`provider-balance` 闭包）；`consumption.json`／`codex-usage-estimate.json` 的字段、形状与版本未变，未新增任何持久项或第二权威。

## 未验证与限制

- **真实 provider 的最终读数质量**（真实 DeepSeek 余额、真实 Codex 额度窗口）不在本票：本票的 S5 证据只证明调度、门槛、非阻塞与凭据边界在真实宿主上成立，不宣称真实服务已验收。
- **S5 门槛用例的 3s 窗口**：它是本票唯一的真实时间量，用来观察「真实子进程在持有应答时确实没有发出模型请求」。用例随后放行同一请求并驱动其完成，以证明窗口是窗口而非停摆；已注释说明。若在极端负载下出现假红，应视为 dock 负载问题而非行为回归（13 号 retro 记录过同类现象）。
- **缺源规则的对称性**：余额预取在「宿主无法鉴权」时不出站且不记 failure；Codex account 查询（13 号票交付）在同况下记 `no-access` 自述。两者都满足「缺源不查」（零出站），但自述行为不同 —— 该差异是有意保留的：余额行在 widget 中不限模式显示，为未配置且未使用过的 provider 记失败会在无关模式的窗口里多出一行；account 失败自述 是 13 号票已交付并断言的契约，本票不改（已与 13 号 peer 确认）。
  - **已过时（superseded，2026-10-13）：该理由中的「余额行在 widget 中不限模式显示」不再成立。** 20 的 retry 已按批准范围（规格 §134：`token-only` 没有官方峰谷价格与余额；P8）把 `Balance:` 行门控到 monetary 通道 —— 依据与自动证据（S2／S5 两例回归＋反向注入）见 [`20-tui-boundary-timer-evidence`](20-tui-boundary-timer-evidence-2026-10-13.md) §9。本条观察到的**行为**（宿主无法鉴权时余额预取零出站、不记 failure；Codex account 记 `no-access`）**未改**，本段其余文字与全部运行读数按原样保留，未重跑也未改写为「未跑」结果。
- **宿主 access 解析耗时**：`ProviderAccess.resolve` 由宿主决定（OMP 为同步地址＋await 凭据）；本票只保证 HTTP 预算（5000ms／10000ms）界定的收口，不另行给宿主调用加超时。
- 本票不改变任何承诺；P37／P40／P53 是否完成仍由承诺完成情况、全部必需检查与人工确认共同派生。

## 全仓复跑

`bun test`（全仓）：**769 pass / 4 fail**，773 tests，85 files，235.0–236.0s（本会话跑了两次：一次在新增「切会话不重取」用例过程中、一次在最终树上；两次规模与失败集合一致）。4 个失败全部与 12 号证据同源且改动前已存在：
`tests/harness-dock/baseline.test.ts` 的 2 条记录基线锚漂移（本机 checkout 停在 `579da1d661c5cb8d43bc2ddd429ab72e67165ad8`，记录锚为 `9348320cc4a30a7195d36a1f05a6c11bcb701a17`），以及 `tests/connect-bot` 的 2 条真实面板用例（P23 整会话协议冻结、P25 未到达的 unregister 离线窗口，分别 20.2s／15.0s 真实面板超时，单跑 `bun test tests/connect-bot` = 142 pass / 2 fail 复现同一对）。
本票改动涉及的 `tests/model-cost`（173 pass）与 `tests/framework`（374 pass）全绿，dock 目录（56 pass / 2 fail）仅余同 2 条 anchor 红。
