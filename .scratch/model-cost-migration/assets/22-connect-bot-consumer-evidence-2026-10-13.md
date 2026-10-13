# 22 — connect-bot 统一接线与协议保留：自动证据与真实贯通

Ticket: [`implementation/22-connect-bot-consumer.md`](../implementation/22-connect-bot-consumer.md)（P58 的 connect-bot 分区）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明、真实 provider 结果或人工验收。

## 本次改了什么

| 位置 | 内容 |
| --- | --- |
| [`extensions/connect-bot/shared-logic/panel/client.ts`](../../../extensions/connect-bot/shared-logic/panel/client.ts) | 出站改为框架公共 HTTP：`request`（`framework/public.ts`），每请求声明 `proxy: false` 与该扩展自己配置的 `timeoutMs`；`PushTransport`／`PushFetchInit`／`PushHttpResponse`／`installPushTransport`／`setPushTransportForTest` 全部删除，不留兼容副本；留下的唯一 seam 是同接口的 `PanelRequest` + `setPanelRequestForTest` |
| [`extensions/connect-bot/harnesses/omp.ts`](../../../extensions/connect-bot/harnesses/omp.ts) | 删除 `platformTransport`（`globalThis.fetch`）与 `installPushTransport` 调用：assembly 不再提供任何传输 |
| `tests/connect-bot/*`（11 个 suite + `support/budget-probe.ts` + `support/probe-run.ts`） | 网络 mock 改为框架 `request` 同接口的假实现（返回原生 `Response`）；`init.signal`／`globalThis.fetch` 拦截式断言按“不重钉内部旧形状”删除或改钉在**声明的** `timeoutMs`／`proxy` 上；E17 那组“assembly 安装的传输是平台自己的”改写为“一条请求声明直连与自身预算” |
| [`tests/connect-bot/support/omp-bot.ts`](../../../tests/connect-bot/support/omp-bot.ts) | 隔离 panel 的会话窗口在自己那份 `omp-bot.toml` 里显式声明（`online_timeout_seconds = 30`、`offline_retention_seconds = 30`） |
| [`tests/connect-bot/harness-exit-budget.test.ts`](../../../tests/connect-bot/harness-exit-budget.test.ts) | 注册行改从 panel 自己发布的 `upsert` 帧读取，不再与依赖的异步转发抢跑 |
| [`extensions/model-cost/harnesses/omp/widget.ts`](../../../extensions/model-cost/harnesses/omp/widget.ts)、[`extensions/model-cost/harnesses/omp.ts`](../../../extensions/model-cost/harnesses/omp.ts) | 前端不再直接 `pi.on("session_shutdown", …)`；`releasingFrontendOnCleanup` 把前端释放组合进 binding 的唯一 `cleanup`（框架拥有的 dispose 前端），且前端只在 binding 被接纳时挂接 |
| 文档 | [`extensions/connect-bot/README.md`](../../../extensions/connect-bot/README.md)：新增“出站是框架公共 HTTP 模块”与 panel 两个窗口的真实缺省（10s／30s，固定 5s 扫描），删除过期的“30s 在线窗口”说法 |

业务协议一字未动：路由 `/api/sessions/events`、envelope `{sessionId, kind, data?}`、JSON 正文、四种 kind、`register` 回执形状、心跳 10s、失败预算 3 次、`working`／`idle`／`awaiting-input` 与“观测到 Round 结束才算完成”的语义都保持原样。

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑（本票分区用例） |
| --- | --- |
| 公共 factory／lifecycle（02）与订阅（05）已迁移，本票完成余 HTTP 接入；固定直连并沿自身超时，不改 endpoint/envelope/JSON | 结构性：`client.ts` 只导入 `framework/public` 的 `request`；`harnesses/omp.ts` 已无传输。[`arm.test.ts`](../../../tests/connect-bot/arm.test.ts)「an arm's requests state the direct connection and the extension's own budget (E17)」读**声明的** URL／`proxy:false`／`timeoutMs`；[`state-machine.test.ts`](../../../tests/connect-bot/state-machine.test.ts)、[`off.test.ts`](../../../tests/connect-bot/off.test.ts)、[`heartbeat.test.ts`](../../../tests/connect-bot/heartbeat.test.ts) 各自断言请求形状与正文 |
| 保留注册、心跳、失败预算、working／没见结束的 idle／真实结束 awaiting-input 及完成证据；统计截断／reset 不伪造完成 | [`arm.test.ts`](../../../tests/connect-bot/arm.test.ts)（注册与重注册）、[`heartbeat.test.ts`](../../../tests/connect-bot/heartbeat.test.ts)（10s cadence、停止后不再发）、[`failure-budget.test.ts`](../../../tests/connect-bot/failure-budget.test.ts)（三次连续失败自动断开、第一次告警一次）、[`state-machine.test.ts`](../../../tests/connect-bot/state-machine.test.ts)（round 边沿驱动的状态迁移与去抖）、[`session-switch.test.ts`](../../../tests/connect-bot/session-switch.test.ts)、[`budget-regression.test.ts`](../../../tests/connect-bot/budget-regression.test.ts) |
| 子事实不驱主效果，旧访问／清理不重建资源；失去独立职责的 PushTransport 与 assembly fetch 移除、无兼容副本 | 结构：`P58` 分区内不再有传输概念（`grep -rn PushTransport framework extensions entrypoints tests scripts docs` 零命中）。子事实：`state-machine.test.ts` 的子代理边沿用例证明子会话的 round 边沿既不驱父会话状态也不建记录。清理不重建：model-cost 前端释放改由 binding 的 `cleanup` 承担，`boundary-timer.test.ts` 新用例断言“先释放前端、再跑实例自身 cleanup”，且前端只在被接纳的 binding 上挂接 |
| 本票拥有 P58 connect-bot 覆盖与 tests：真实 loader／RPC／出站捕获验证注册协议、心跳、失败预算、State／Owner 效果；永久远端网络 tests mock，不重钉旧内部形状 | 真实 loader／RPC：[`harness-exit-budget.test.ts`](../../../tests/connect-bot/harness-exit-budget.test.ts)（隔离安装的真实 harness + 真 RPC + 真 panel + 真适配器）。真实 panel 贯通：[`budget-regression.test.ts`](../../../tests/connect-bot/budget-regression.test.ts) 的 interop、[`panel-registration-lifecycle.test.ts`](../../../tests/connect-bot/panel-registration-lifecycle.test.ts)。隔离出站捕获：[`request-timeout.test.ts`](../../../tests/connect-bot/request-timeout.test.ts)（独立进程 + 本地真实目标）。永久用例零远端网络：全套以同接口假实现注入 |
| P58 仅在 22 与 23 都完成后整体完成；本票不认领 codebase-tools tests、24 不重复认领业务用例 | **未认领**：codebase-tools（`P58` 的 23 分区）与 24 的架构验证用例均未改动；`P58` 整体仍未完成 |
| 通过批准的生产公共 seam 观察，预期来自合同／独立字面值／手算；永久网络 tests 用 mock | 观察面：OMP assembly（S1）+ 扩展自己声明的出站调用（S3 形状）+ 隔离真实宿主（S5）。预期来自 `config.yaml` 的独立字面值（`connectBotConfig()`）、协议常量与手算的 10 000ms 周期；无一处用被测实现重算 |
| 隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败、保留脱敏证据 | 真实运行全部隔离：`ensureIsolatedHarness` 的隔离安装、`createRunRoot` 的运行根、隔离进程自己的 `config.yaml`、panel 用临时目录 + 临时端口的独立实例；本机正式 OMP 配置与用户 panel 未被触碰；`.cache` 下的部署副本在 suite 结束时删除 |

## 实际运行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 0 errors（迁移后多次运行；含 tests 与 `scripts`） |
| `bun test tests/connect-bot` | **144 pass / 0 fail**，712 expect，19 files，76.8s |
| `bun test tests/connect-bot/request-timeout.test.ts` | 10 pass / 0 fail（91 expect，15.6s；每个场景一个隔离进程 + 本地真实目标） |
| `bun test tests/connect-bot/budget-regression.test.ts tests/connect-bot/panel-registration-lifecycle.test.ts` | 11 pass / 0 fail（108 expect，59.6s；含真实 omp-bot panel 的 interop 与 30s 窗口） |
| `bun test tests/connect-bot/harness-exit-budget.test.ts` | 1 pass / 0 fail（12 expect，约 1.4s；连跑两次） |
| `bun test tests/model-cost` | 266 pass / 0 fail（1156 expect，22 files，3.0s） |
| `bun test tests/harness-dock/model-cost-headless.test.ts` | 7 pass / 0 fail（58 expect，13.6s；同一 assembly 的 `--no-ui` 路径，确认 `cleanup` 组合未扰动无 widget 的运行） |
| `bun test tests/framework` | 385 pass / 0 fail（2004 expect，32 files，39.7s） |
| `bun test`（全仓） | **见下方“全仓基线”** |

## 本票修掉的两个历史失败（改动前就在）

| 失败 | 根因 | 修法（本票内） |
| --- | --- | --- |
| `budget-regression.test.ts` P23「a whole session … is what the real panel records and answers」 | 隔离 panel 用的是交付缺省窗口 **10s 在线**／30s 保留，而用例断言与心跳周期同值：每 10s 一跳的会话正好落在 10s 窗口边上，扫描会在两跳之间发布一次离线 `upsert`、下一跳再发布回在线，帧数比协议自身的 4 个多出 2 个 | 隔离 panel 自己那份配置显式声明 `[sessions] online_timeout_seconds = 30`，把观察对象交回扩展协议本身（见 `support/omp-bot.ts` 的注释） |
| `panel-registration-lifecycle.test.ts` P25「the blocked row stays registered and goes offline by the 30s window」 | 同一个根因：交付缺省是 10s + 5s 扫描，实测在 15 015ms 就发布离线，早于用例断言的 ≥29 000ms | 同上：窗口成为本运行自己声明的事实（30s + 5s 扫描），断言读的就是它 |

两处的期望值没有为了通过而改：`ONLINE_WINDOW_MS`／`EXPIRY_SCAN_MS` 仍是 30s／5s，变的是**隔离 panel 被显式配置成那两个数**（缺省则是 10s／30s，已写进 README 与用例注释）。

## 顺带修掉的全仓扫描失败（E14／P35，本票 test 文件）

`native-session-boundary.test.ts` 的全仓那一条（“`session_shutdown` 只允许出现在 adapter 里”）改动前命中
`extensions/model-cost/harnesses/omp/widget.ts`。按批准方向修在“统一 lifecycle 接线”上，而不是扩白名单或抑制用例：

- 前端删除自己的 `pi.on("session_shutdown", detach)`；
- `harnesses/omp.ts` 用 `releasingFrontendOnCleanup(...)` 把前端释放组合进 binding 返回实现的那**一个** `cleanup`（框架拥有的 dispose 前端，真实退出时由 adapter 把 `session_shutdown` 合成为 `disposed` 后调用）；
- 前端仅在 binding 被接纳时挂接，因此被拒的 binding 不会留下无人释放的 widget／drawing timer；
- 用例侧：`tests/model-cost/boundary-timer.test.ts` 里钉“前端自己订阅 shutdown”的那条按“旧内部形状按规则删、不重钉”替换为两条——前端返回的释放句柄确实取消 UI 持有的超时并清掉 widget；binding 自己的 `cleanup` 先释放前端、再跑实例自身的 cleanup。框架“在真实会话结束时恰好跑一次 cleanup”这一环由既有 `tests/framework/implementation-lifecycle.test.ts`（P56）与隔离宿主用例继续支撑，本票不重复认领。

## 未验证／限度（不得当作通过）

- **P58 整体未完成**：23 的 codebase-tools 分区不在本票范围，P58 需要 22 与 23 都完成后才算整体完成。
- 未接触任何真实 provider、真实凭据、真实 DeepSeek／Codex 请求；未运行正式 OMP，也未触碰用户正在运行的 panel。
- 真实 panel 贯通用的是**本机 sibling checkout 的 release 构建**在临时目录、临时端口上的独立实例（`OMP_BOT_BINARY` 可覆盖）；它证明的是扩展协议与 panel 的互操作，不是用户的正式部署。
- 永久用例的网络全部注入，因此它们证明的是**扩展声明的请求形状**（URL／method／headers／body／`proxy`／`timeoutMs`）；框架 HTTP 模块自己的连接、代理与预算语义由 `tests/framework/http.test.ts` 与 `scripts/http-transport-smoke.ts` 证明，本票不重复。
- 真实 harness（S5）那一条只覆盖“长预算不延长宿主自身退出”的一个场景；隔离宿主的其它模型路径未在本票重跑（属于各自票）。
- 未做人工项：H1／H2 与允许的条件性 H3 仍待用户确认，本票不记通过。

## 全仓基线

| 命令 | 结果 |
| --- | --- |
| `bun test`（全仓，改动冻结后） | **886 pass / 3 fail**，889 tests，100 files，285.0s |

三个失败都不在本票触及的文件内，且都不是本票引入：

- `baseline record > the checkout is at the recorded revision anchor`（`tests/harness-dock/baseline.test.ts`，锚点漂移，改动前就在；见 03 的证据同一项）；
- `baseline record > the run artifact stays byte-identical to the anchor for the recorded contract files`（同上，字节一致性漂移，改动前就在）；
- `the credential reaches its own query and no other surface of a real run (P53)`（`tests/harness-dock/model-cost-balance.test.ts`）：该用例自己的 `storageFiles()` 递归遍历存储根时，撞上并发写入方正在删除的 `.lock` 目录而 `ENOENT`。**单独重跑该文件：6 pass / 0 fail（19.7s）**，即一次计时相关抖动，与本票改动无关（本票未触及存储、锁或该用例）。

`tests/connect-bot`（本票分区）**144 pass / 0 fail**，`tests/framework` **385 pass / 0 fail**，`tests/model-cost` **266 pass / 0 fail**。

