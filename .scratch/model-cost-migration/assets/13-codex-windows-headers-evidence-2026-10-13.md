# 13 — Codex 响应 headers 与独立额度窗口：自动证据与真实贯通

Ticket: [`implementation/13-codex-windows-headers.md`](../implementation/13-codex-windows-headers.md)（P39、P65；seam S2／S5）。
2026-10-13 本会话实际执行记录（retry：补上宿主侧响应边界，见下）。每行都是已运行命令与其观察结果，不是支持声明、真实 Codex 账户结果或人工验收。真实宿主运行使用 dock 的本地捕获端点与隔离 install，从不到达任何 provider。

## 本 retry 修的是什么

前一版证据把「真实 OMP 18.5.0 的 Codex Turn 没有 HTTP 响应事实」记为发现的缺口并留给验收决定。本 retry 按原批准把这条**生产差异**修掉：在冻结的 18.5.0 install 上做一个最小宿主 patch，让 Codex 的 SSE 传输把它本来就持有的响应状态与 headers 交给扩展（与 chat-completions／Responses／Anthropic／native 各路径同一个 `notifyProviderResponse` 通道），于是 `after_provider_response → adapter → S1 turn_end 的 HTTP facts → 生产 codex parser` 这条链路在真实 loader／RPC 下走通。冻结了新 patch／hash／可运行 record；不改支持记录、不自动升级版本、不传 native 对象、不读取 private controller／UI，也**不**做传输拦截、不观察 SDK 隐藏的 retry。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`host-patches/omp-18.5.0-codex-response-boundary/`](../../../host-patches/omp-18.5.0-codex-response-boundary) | 新冻结宿主 patch：`patch.diff`（4 hunks、**新增 12 行、未删任何行**、1 个文件 `pi-ai/src/providers/openai-codex-responses.ts`）、`record.json`（patch sha256 `4ec9ad0d…` ＋ 该文件补丁前 `42238589…`／补丁后 `a47d8410…`）、`README.md`（发布什么、冻结基线、物化／再冻结配方、隔离加载步骤、证据、限度、P39/P65 人工检查步骤）；artifact 物化于 `.cache/omp-baseline/18.5.0-codex-response-boundary`（gitignored，`codex-response-host.json` 记 install／apply exit 0） |
| [`tests/harness-dock/host-patch-artifact.ts`](../../../tests/harness-dock/host-patch-artifact.ts) | 新增：宿主 patch artifact 的共用物化器（装精确版本 → `git apply -p1` → 对着 record 校验前后 hash → 写 manifest／record）。patch root 可指定，因此一个 patch 可以改同一版本里另一个已安装包（本例 `@oh-my-pi/pi-ai`） |
| [`tests/harness-dock/codex-response-harness.ts`](../../../tests/harness-dock/codex-response-harness.ts) | 新增：本 artifact 的命名与 patch root，导出 `ensureCodexResponseHarness()` |
| [`tests/harness-dock/viewed-session-harness.ts`](../../../tests/harness-dock/viewed-session-harness.ts) | 改为同一共用物化器上的薄描述（导出名与冻结语义不变；Viewed session artifact 的三个套件复跑通过） |
| [`tests/harness-dock/codex-response-artifact.test.ts`](../../../tests/harness-dock/codex-response-artifact.test.ts) | 新增：artifact 冻结证据（锚点 revision、base hash＝精确 18.5.0 install 的字节、物化字节＝record 的补丁后 hash、改动只有这一个文件） |
| [`tests/harness-dock/model-cost-codex-quota.test.ts`](../../../tests/harness-dock/model-cost-codex-quota.test.ts) | 重写为对着**patched artifact** 的真实宿主 smoke（3 例：单份报告的真实 headers 接入、一次会话三份报告的独立更新与 ratio、以及**未打补丁基线**的对照） |
| [`tests/harness-dock/capture-server.ts`](../../../tests/harness-dock/capture-server.ts) | `responseHeaders` 现在可以是 `(request) => headers`，因此一次运行里可以按请求脚本化一串报告 |
| [`tests/harness-dock/fixtures/codex-quota/entrypoint.ts`](../../../tests/harness-dock/fixtures/codex-quota/entrypoint.ts) | 新增 `estimate` 观察行（与 `quota` 同一通知），用来观察两份报告驱动的 ratio 结果 |
| [`extensions/model-cost/shared-logic/codex-quota.ts`](../../../extensions/model-cost/shared-logic/codex-quota.ts)＋[`runtime.ts`](../../../extensions/model-cost/shared-logic/runtime.ts)＋[`presentation/display.ts`](../../../extensions/model-cost/shared-logic/presentation/display.ts) | 上一版已交付并保留：一个进程一份额度窗口、两个来源**同一个业务 parser**、±5% 按时长识别、有效单窗独立更新、缺失保留原值与原时间、运行期无 TTL／兜底／轮询、`turn_end` 只读**该请求自身 provider** 为 `openai-codex` 的 Turn 的 `end.http.headers` |
| 文档 | [`framework/docs/harness-support.md`](../../../framework/docs/harness-support.md)（`turn.provider-response-boundary` 行：生产差异由本地 patch 修复、支持记录不变、patch 之外还剩什么）、[`framework/docs/framework-capabilities.md`](../../../framework/docs/framework-capabilities.md)（Turn 事实段落同步）、[`host-patches/omp-18.5.0-codex-response-boundary/README.md`](../../../host-patches/omp-18.5.0-codex-response-boundary/README.md) |

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 初始化 API 与响应 headers 用同一业务 parser；API 仅启动使用；初始化选命名 codex 代理、10000ms 预算、地址／headers 由业务持有、不借推理 base URL | S2 永久用例（上一版，本版未改）：两个来源先各自归约为同一 `ReportedWindow`，再由同一个 `windowsOf`／`chosenWindow`／`apply` 读取；逐字断言出站 `{url:"https://chatgpt.com/backend-api/wham/usage", options:{method:"GET", headers:{…}, timeoutMs:10000, proxy:"codex"}}`（宿主地址故意设为 `https://host.example/codex`）；`startup()` 的 `started` 守卫保证只启动一次。S5 侧：真实运行里那一次启动查询按**未配置的命名代理**被拒（`failure.detail === "misconfigured"`），全程没有直连、也没有第二次查询 |
| 按报告时长沿 ±5% 识别 5h／7d，不固定 primary／secondary；有效单窗口独立更新；缺失保留原成功值和原时间；没有则不可用 | S2：17100s／18900s／18120s 识别、18901s 不识别；API 侧 7d 放 `primary_window`、5h 放 `secondary_window` 仍得正确两窗口；headers 侧交换位置同样正确；单窗批次只改该窗口；从未报告即 `{}`。**S5（本版新增真实贯通）**：真实 Turn 的 headers 把 `fiveHour`／`weekly` 更新为端点脚本化的字面值（如 70%／30%），reset 为脚本给出的绝对秒；同一会话里第三份**只带 5h** 的报告把 5h 更新为 45%（`obtainedAt` 前进），而 `weekly` 与上一读数**整体相等（含 `obtainedAt`）**——缺失不清空、不补零、不重记时间 |
| 未知／过期／无效 reset 使用独立预期；headers 按接收序处理；不建绝对时序系统 | S2：`unknown`／`expired`／`invalid`／`valid` 各一例，`resetsAt` 逐字保留不重写；非数字与 `0` 不算可用时刻；同批等距双候选按接收序取先出现者，实现里没有瞬时比较与跨来源排序 |
| 运行期无 API TTL／兜底／轮询／切换额外查询；mock 与出站捕获验证位置交换、单窗、缺失和更新次数，真实 adapter 接入使用正常 Turn headers | S2：出站计数在 1 次启动查询后跨多个 Turn／Round／10 天时间快进恒为 1。**真实 adapter 接入（本版新增）**：真实 Codex Turn 现在交付该响应的 headers，`runtime.ts` 只从 `delivery.end.http.headers` 读——S5 断言 `hasHttpFacts === true`（3 个 Turn 全部）、header 名集合含端点脚本化的六个 `x-codex-*` 名字，且三次 prompt 之后 `/codex/responses` 之外的请求数为 0（`capture.requests()` 全部是模型请求，stderr 无额度查询痕迹） |
| 准备 P39／P65 H2 的脱敏来源、窗口结果或跳过原因与正常使用观察步骤；发现 API、mock 或 RPC 不认证真实额度效果 | 见下方「H2 材料」（`host-patches/…/README.md` 亦收录同一步骤）。本版把「跳过原因」从**通道缺失**改成**可观察但尚未观察真实账户**：通道已由本票交付并在隔离宿主上验证，真实账户读数仍待人工 |
| 通过批准的生产公共 seam 观察行为，预期来自合同／规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock | S2 全部走生产 runtime ＋ 框架公共绑定 ＋ 公共 HTTP seam 注入，只读 `runtime.presentation.quota()`；断言用的 header 名、字段名、时长、±5% 边界、reset 时刻都是文件字面值与算术。S5 的预期同样来自本文件字面值（脚本化的百分比与 reset 秒）与手算（`ratio = 60 / 10 = 6`、`left = (100 − 30) / 100 × 6 = 4.2`）；永久用例零真实网络，捕获端点是 `127.0.0.1` 上的一次性本地端口 |
| 使用隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据 | 全部运行在隔离 prefix（`.cache/omp-baseline/18.5.0-codex-response-boundary` 与未打补丁的 `.cache/omp-baseline/18.5.0`）＋ `createRunRoot` 的临时 agent state／session／work／capture／user-home；扩展的 `~/cost-archive` 落在 run root 的 user-home 内；`models.yml`／`config.yml` 只写 run 自己的 agent state（合成 JWT `acct-dock-13`，非秘密）。扩展内的异步失败由实现内部 catch ＋ 只读结果自述，测试侧无未处理拒绝 |

## 实际运行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun -e 'import { ensureCodexResponseHarness } from "./tests/harness-dock/codex-response-harness"; …'` | 物化成功：`bun install` exit 0、`git apply -p1` exit 0（记于 `codex-response-host.json`），prefix `.cache/omp-baseline/18.5.0-codex-response-boundary`，随后冻结 `record.json`。除首次物化外未再安装 |
| `bun run typecheck` | 首轮报 7 条 `error TS2550`（`Array.prototype.at` 不在本项目 lib 目标内，出自我新写的 smoke）→ 改为索引取值后 `tsc --noEmit` **0 error** |
| `bun test tests/harness-dock/model-cost-codex-quota.test.ts tests/harness-dock/codex-response-artifact.test.ts` | **6 pass / 0 fail**，67 expect，5.64s（3 例 smoke ＋ 3 例冻结） |
| red 复核（把第一个用例的宿主临时换成未打补丁基线后复跑） | **1 fail**：`expect(turn.hasHttpFacts).toBe(true)` 收到 `false`，即该断言确实由补丁决定；随即还原并复跑通过。未打补丁基线在套件里也永久留作对照例 |
| `bun test tests/harness-dock/viewed-session.test.ts tests/harness-dock/viewed-session-host.test.ts tests/harness-dock/model-cost-modes.test.ts` | 16 pass / 0 fail，144 expect，17.22s（共用物化器改动后，Viewed session artifact 的冻结与真实宿主行为不变） |
| `bun test tests/harness-dock`（整目录，15 文件） | **52 pass / 2 fail**，564 expect，74.47s。2 fail 是既有的 `baseline.test.ts` 记录基线漂移（本机 `oh-my-pi` checkout 已越过记录锚点，比对 `runner.ts`／`types.ts`／`session-manager.ts`／`model-registry.ts` 与锚点记录），与本票无关 |
| 同上，本票改动前的一次中间状态 | 先把 4 例 smoke（4 个真实会话）放进整目录时 **3 fail**：多出的一例是 `session-recovery.test.ts` 的重启用例在并发负载下 20s 内没等到第二进程的 save；把两个 report 场景合成一次三报告会话（3 个真实会话）后整目录回到 **2 fail（只剩既有 anchor 红）**。该重启用例单独运行 **4 pass / 0 fail**（10.41s），即它是并发负载下的等待预算问题，不是本票改动引入的行为失败 |
| `bun test`（全仓） | **752 pass / 4 fail**，756 tests，84 files，219.95s，exit 1。4 个失败与本票无关且均已记录：2 个 `harness-dock/baseline.test.ts` anchor 漂移（同上）＋2 个 connect-bot 真实面板用例（P23 冻结协议、P25 unregister 窗口；`bun test tests/connect-bot` 单跑 142 pass / 2 fail 确认是同样两条）。相对 12 号记录（729 tests／82 files）增加 27 例、2 文件，其中本票为 smoke 的第 3 例与新增的 3 例冻结用例；其余增量来自共享工作区里其它在途票的改动 |

## S5 真实宿主 smoke 观察（脱敏）

`bun test tests/harness-dock/model-cost-codex-quota.test.ts`（隔离 18.5.0 install ＋ 本机捕获端点，`providers.openaiWebsockets: off` pin 到 SSE，合成 JWT 作 fixture 凭据）。端点按协议在真实响应上送出本文件脚本化的 headers；一次三报告会话（A 10%／20%、B 70%／30%、C 只带 5h 45%）里 fixture 实际打印（`turnId` 的会话 UUID 以 `<run>` 代）：

```
[model-cost] turn {"turnId":"<run>#t2","provider":"openai-codex","outcome":"completed","hasHttpFacts":true,
  "headerNames":["cache-control","content-length","content-type","date","x-codex-primary-reset-at",
  "x-codex-primary-used-percent","x-codex-primary-window-minutes","x-codex-secondary-reset-at",
  "x-codex-secondary-used-percent","x-codex-secondary-window-minutes"],"unavailable":[]}
[model-cost] quota {"fiveHour":{"usedPercent":70,"resetsAt":1791872977000,"resetState":"valid","obtainedAt":1791865779114},
  "weekly":{"usedPercent":30,"resetsAt":1792038577000,"resetState":"valid","obtainedAt":1791865779114},
  "failure":{"at":1791865778995,"detail":"misconfigured"}}
[model-cost] estimate {"ratio":6,"left":4.199999999999999,"text":"left≈4.2×5h · ratio≈6.0"}
[model-cost] quota {"fiveHour":{"usedPercent":45,"resetsAt":1791872977000,"resetState":"valid","obtainedAt":1791865779122},
  "weekly":{"usedPercent":30,"resetsAt":1792038577000,"resetState":"valid","obtainedAt":1791865779114},
  "failure":{"at":1791865778995,"detail":"misconfigured"}}
```

（上表为便于阅读换行，实际每行是一条 JSON。）

- 三段 Turn 行的 `hasHttpFacts` 均为 `true`，`unavailable` 为空；第三份报告只带 5h 时，那一段 Turn 的 `headerNames` 也只剩三个 primary 名字——端点确实按请求送了不同的 header 集合。
- 未打补丁基线上同一脚本仍为 `hasHttpFacts: false`、`unavailable: ["HTTP response facts"]`、`headerNames: []`，且没有任何窗口出现：差异由 patch 决定。
- 额度行里 `failure.detail` 恒为 `misconfigured`：本仓共享配置没有 `codex` 代理条目，那一次启动查询被配置拒绝、绝不直连，且它与 headers 读数并存（不是零、不是替代）。
- 端点记录：三份报告对应三次 `/codex/responses` 模型请求，没有 `/wham/usage` 之类的额度查询，也没有第二次启动尝试。
- 只读结果在一次变化里会被重绘数次（同一读数重复出现），因此用例断言的是**出现过哪些读数**以及首／末读数，而非某一序号。

## H2 材料：真实效果的观察方法（待用户）

**P39（真实 Codex 响应 headers 接入）与 P65（真实 5h／7d 最终效果）的当前状态＝待人工观察，理由不再是通道缺失：**

1. 通道已交付并在隔离宿主上验证（见上「S5」）：真实 Codex Turn 会交付该响应的 headers，生产 parser 按它们更新窗口。真实账户的读数本身仍未观察——本票的运行从不到达任何 provider。
2. 观察步骤：在有真实 ChatGPT/Codex 凭据的机器上正常跑一次 Codex 模型请求 → 读本扩展的只读结果（`presentation.quota()`；P67 落地后读 widget 的 5h／7d 行）→ 期望两个窗口分别等于该响应 `x-codex-primary-*`／`x-codex-secondary-*`（或 `/wham/usage` 文档）报告的值与 reset，且窗口按**报告时长**而非位置归属；再正常继续使用，期望每次响应后各自独立更新、缺失的一侧保持不变，且 Turn 之间没有额外额度查询。
3. 脱敏来源：只需该账号自己的 `x-codex-*` 取值与 reset（不含 token、账号 id、邮箱）；要比较的字段是 `usedPercent`／`resetsAt`／`obtainedAt`。
4. **明确：API、mock、RPC 都不认证真实额度效果。** 本票的 mock 只证明解析与更新规则，S5（含 patched artifact）只证明宿主与扩展两侧的接线；真实 5h／7d 与 P39 的真实 headers 接入仍待用户在有凭据时确认，未确认不记通过。若届时仍只有 mock／RPC 结果，则如实记跳过并写明原因。

## 未验证／限度

- 真实 Codex 账户的任何取值、真实 5h／7d 效果、真实账户下的 headers：未验证（见上「H2 材料」）。
- WebSocket 传输未观测（两端都 pin 到 SSE）；非 2xx 响应不发布边界（传输抛错，不是它发布的事实）。两点都写在 patch README 与 capability-difference 行的「patch 之外还剩什么」里。
- 宿主 patch 是本地 artifact：未合并进任何上游 checkout，支持记录仍是 18.5.0；它是否成为验收 artifact 仍属验收决定。上游若自行修好同一缺口，本 patch 变为冗余而非错误。
- 整目录 dock 里的 `session-recovery.test.ts` 重启用例对并发负载敏感（上方命令表记了带／不带本票 smoke 的两次结果，单跑通过）；本票通过减少自己的并发会话使整目录回到既有红之外，但该用例 20s 等待预算本身没有改动（属 10 号票的文件）。
- 本票不改变任何承诺；P39／P65 是否完成仍由承诺完成情况、全部必需检查与人工确认共同派生。
