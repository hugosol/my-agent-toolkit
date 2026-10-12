# 旧 model-cost 刷新调度事实（源码核实）

> 来源：只读审计旧实现 `E:/Developer/myhub/my-omp-toolkit/extensions/model-cost/`（含 `tests/model-cost/` 与 `docs/adr/0003`），2026-10-12 由 scout 子代理产出。这是源码事实资产，不是已批准契约；与本目录 `current-state.md` 的出入见文末。
>
> 用途：[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md) 的取证；发布前不改变该票正文。

## 1. TTL / timeout / debounce 常量及其来源

- **30s 是两源共享的单一内存缓存 TTL。** `CACHE_TTL_MS = 30_000` — `extensions/model-cost/balance-cache.ts:10`（硬编码字面量，无配置键）。新鲜度判定 `entry.fetchedAt !== null && now - entry.fetchedAt < CACHE_TTL_MS` — `balance-cache.ts:30-32`；由 `setCacheEntry` 以本地 `Date.now()` 打戳 — `balance-cache.ts:34-37`。
- **不存在逐源 TTL。** 两个消费者读同一常量：DeepSeek 余额见 `index.ts:491`、`index.ts:529`；Codex 额度见 `index.ts:498`、`index.ts:529`、`index.ts:706`。
- **DeepSeek 余额 timeout = 5s，内联无名字面量。** `signal: AbortSignal.timeout(5000)` — `index.ts:231`，位于 `fetchBalance`（`index.ts:219-243`）；它是 DeepSeek 唯一 HTTP 调用点（`index.ts:229`）。
- **Codex 额度 timeout = 10s，具名常量。** `const USAGE_TIMEOUT_MS = 10_000;` — `chatgpt-usage.ts:17`，用于 `chatgpt-usage.ts:276`（`signal: AbortSignal.timeout(USAGE_TIMEOUT_MS)`）。
- **Codex ratio 写入节流 = 60s。** `const RATIO_WRITE_INTERVAL_MS = 60_000;` — `quota-estimate-store.ts:62`；判定 `publishedAt !== null && now - publishedAt < RATIO_WRITE_INTERVAL_MS` — `quota-estimate-store.ts:267`。
- **ratio 采样容差（纯本地，无网络）：** `BASELINE_MAX_AGE_MS = FIVE_HOUR_MS` — `quota-estimate.ts:55`（新鲜度检查 `:136`）；`BASELINE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000` — `:63`（检查 `:137`）；`RESET_MOVE_TOLERANCE_MS = 30 * 60 * 1000` — `:68`（检查 `:156`）；`RESET_DROP_POINTS = 1` — `:70`；`QUALIFYING_SPAN_POINTS = 50` — `:72`；`SATURATION_POINTS = 100` — `:74`。
- **跨进程文件锁等待预算：** `const LOCK_OPTIONS = { retries: 300, retryDelayMs: 50 };` — `archive-store.ts:138`（=15s）；`RENAME_MAX_ATTEMPTS = 50` — `archive-store.ts:87`。
- **窗口模型常量（仅展示）：** `FIVE_HOUR_MS = 5 * HOUR_MS` — `chatgpt-usage.ts:16`；`WEEK_MS = 7 * DAY_MS` 与 ±5% 容差 — `chatgpt-usage.ts:312-318`（选择器 `:341-346`、`:349-357`、`:376-380`）；`WEEKLY_BAR_WIDTH = 20` — `:319`。
- **边界 timer 延迟不是常量：** 每次 arm 时计算——跨过含端点峰价结束取 `1` ms，否则 `nextBoundary(now) - now + 1` ms — `index.ts:461-464`。
- **无 debounce。** 扩展内不存在 debounce 常量、节流 timer 或 trailing-edge 调度器（只有 30s 缓存 TTL 门控与 60s ratio 写入节流）。
- **这些都没有 YAML／配置键。** 扩展从不调用配置 API（`registerConfig`／`getConfig`／`readConfig`／`.yaml`／settings 文件读取：全扩展零匹配）。provider base URL 来自宿主 `ctx.modelRegistry.getProviderBaseUrl(BALANCE_PROVIDER)` — `index.ts:226`。唯一环境输入是 `PI_PROXY_OPENAI_CODEX || PI_PROXY` — `chatgpt-usage.ts:142-144`。
- 备注：`index.ts:386` 的 `Timer` 是运行时全局（Bun/Node），非 import — `index.ts:33-65` 未 import `Timer`。

## 2. 每一个会发起网络请求的触发

声明的来源：**DeepSeek 余额**（`fetchBalance`，`index.ts:219`）与 **Codex 额度 API**（`fetchChatGPTUsageSnapshot`，`chatgpt-usage.ts:224`）。

1. **`session_start` / `session_branch` / `session_switch` / `session_tree`** — 注册到同一个 `onInit` handler `index.ts:660-663`；处理体 `index.ts:620-658`。调用 `initializeForModel`（`index.ts:640`）→ **TTL 门控**：DeepSeek `if (isCacheFresh(balanceCache.deepSeek)) … else await fetchBalance`（`index.ts:491-496`）；Codex `if (isCacheFresh(codex) && codex.value) … else await startChatGPTUsageRefresh`（`index.ts:498-503`）。**被 await**（`await modelInit`，`index.ts:657`）——所以会话初始化 hook 会在网络上阻塞至多 5s/10s。另在跨进程锁内 await `daily.ensureSession`（`index.ts:646-651`）。
2. **`agent_start`** — `index.ts:666-668`，`await initializeForModel(ctx)`：与 (1) 同样的 TTL 门控逻辑，**被 await**。测试：`tests/model-cost/extension.test.ts:1059-1104`（TTL 内第二次 `agent_start` 不发请求，两种模式）。
3. **`input` 匹配 `/^(model|models|switch)\b/`** — `index.ts:526-532`。条件 `if (!isCacheFresh(balanceCache.deepSeek) || !isCacheFresh(balanceCache.codex)) void refreshBoth(ctx)` — `index.ts:529-530`。**未 await（fire-and-forget，`void`）**。`refreshBoth`（`index.ts:510-523`）经 `Promise.all` **无条件同时取两源**（`index.ts:511-514`），随后给两个缓存打戳（`index.ts:515`，或 `applyChatGPTUsageSnapshot` `:518`）。测试：`extension.test.ts:908-985`（`/model`、`/models`、`/switch` 各 → 1 次 DeepSeek + 1 次 Codex），`:1018-1055`（TTL 内第二次 `/model` → 仍 1+1，即只覆盖"两源都新鲜"的情形）。
4. **assistant `message_end`** — `index.ts:696-714`。守卫：`isOpenAICodexModel(ctx.model) && event.message.role === "assistant" && !isCacheFresh(balanceCache.codex)` → `void refreshChatGPTUsage(ctx)`（`index.ts:703-709`）。**TTL 门控（30s）、未 await（fire-and-forget）**；注释写明网络调用绝不拖住 agent loop（`index.ts:697-702`）。`toolResult` 角色永不取数（`extension.test.ts:367-388`）。
5. **`agent_end`** — `index.ts:717-800`。Codex 分支：`await refreshChatGPTUsage(ctx)` **强制（忽略 TTL）、被 await**（`index.ts:757`）。DeepSeek 分支：`state.balance = await fetchBalance(ctx); setCacheEntry(balanceCache.deepSeek, state.balance)` **强制、被 await**（`index.ts:797-798`）。模式既非 official DeepSeek 也非 Codex 时两者都不发（`index.ts:733-737`）。测试：`extension.test.ts:245-261`（每完成一轮刷新一次）、`:1106-1180`。
6. **`/budget clear`** — `index.ts:541-544`：`const bal = await fetchBalance(ctx)` **强制、被 await**——且**不调用 `setCacheEntry`**，所以此路径不给缓存打戳（`index.ts:542-544`）。`/budget detail`、`/budget holiday`、`/budget <N>` **不**取数（`index.ts:559-616`）。
7. **`after_provider_response`** — `index.ts:671-679`：**不取数**。只做 `parseChatGPTUsageHeadersSnapshot(event.headers)`（`chatgpt-usage.ts:726-754`）+ `state.quotaEstimate.observe` + state 赋值 + `refresh`。handler 是 `async`，await 的是（模块加载、非网络的）parser（`index.ts:671-673`）。
8. **`before_provider_request`** — `index.ts:682-693`：**不取数**；锚定价格档（`anchorRequest`）并 `refresh`。
9. **峰谷边界 timer** — `index.ts:465-469`：**不取数**；回调只 `refresh` 后重新 arm。
10. **render** — `index.ts:366-372` → `readEffort`（`index.ts:156-161`）+ `buildWidgetLines`（`index.ts:255`）：**不取数、不建 timer、不写文档**。由 `tests/model-cost/feature-verification.test.ts:579-604, 657-661` 钉住。
11. **不存在其他触发：** 无 `model_changed` handler（只有 `input` 正则，见 `README.md:116`）、无 `pi.on("shutdown"/"exit")`、除上述会话／agent 事件外无别的 init hook。

## 3. single-flight：机制与精确范围

- 变量：`let chatgptUsagePromise: Promise<ChatGPTUsageSnapshot> | null = null;` — `index.ts:387`，声明在 `modelCost(pi)` 内（`index.ts:380`），即**范围 = 一个已挂载扩展实例**（不是 provider、不是 session、不是缓存键、不是 model）。
- 机制 — `refreshChatGPTUsage`（`index.ts:426-438`）：`if (!chatgptUsagePromise) { chatgptUsagePromise = fetchChatGPTUsageSnapshot(ctx).then(applyChatGPTUsageSnapshot…).finally(() => { chatgptUsagePromise = null; }); } return chatgptUsagePromise;`。并发调用者拿到**同一个在途 promise**（合并），且由于只在 `finally` 置空，settle 后**不会补发**。`startChatGPTUsageRefresh`（`index.ts:440-453`）另先置 `loading` state，再委派。
- **只有经 `refreshChatGPTUsage`／`startChatGPTUsageRefresh` 的 Codex API 取数被合并**：`session_*`／`agent_start`（`index.ts:502`）、`message_end`（`index.ts:708`）、`agent_end`（`index.ts:757`）。测试：`extension.test.ts:263-284`（重叠的 `session_start` + `agent_end` → `calls === 1`）、`:390-407`（在途期间两次 `message_end` → `calls === 1`）、`:245-261`（先 `session_start` 后 `agent_end` 顺序执行 → 2 次调用，即不跨 settle 合并）。
- **`/model` 预取绕过 single-flight**：`refreshBoth` 直接调 `fetchChatGPTUsageSnapshot(ctx)`（`index.ts:511-514`），不走 `refreshChatGPTUsage` ——所以输入预取可与在途请求并发发起第二个 Codex 请求。
- **DeepSeek 余额完全无 single-flight**：`fetchBalance` 在 `index.ts:494`、`index.ts:512`、`index.ts:542`、`index.ts:797` 被直接调用，无在途变量；两个并发触发会产生两次 HTTP 调用。

## 4. 来源优先级：header 通道 vs API 通道

- **响应头通道**（`index.ts:671-679`）：经 `applyHeaderWindowResult`（`index.ts:409-413`）写 `state.chatgpt`／`state.chatgptFiveHour`——字段来自 `usageStateFromLimit(..., "header")`（`chatgpt-usage.ts:150-169`）：`kind:"ok"`、`source:"header"`、`usedPercent`（来自 `usedFraction*100` 或 `used`）、`resetsAt = limit.window?.resetsAt ?? null`、`fetchedAt = report.fetchedAt`（parser 的 `now`，`chatgpt-usage.ts:738`）；此前 `error` 字段被沿用（`index.ts:412`）。它还喂 ratio 估计（`index.ts:675`）并重绘。**它不写 `balanceCache`**——handler 内无 `setCacheEntry`，所以 header 数据永不刷新 30s API TTL。header 的 `missing`／`idle` 快照被忽略（`index.ts:410-411`）。
- **API 通道**（`fetchChatGPTUsageSnapshot` → `applyChatGPTUsageSnapshot`，`index.ts:415-423`）：经 `applyChatGPTWindowResult`（`index.ts:389-407`）写 `state.chatgpt`／`state.chatgptFiveHour`，`state.quotaEstimate.observe`（`index.ts:416`），并 `setCacheEntry(balanceCache.codex, { weekly, fiveHour })` 以本地 `Date.now()` 打戳（`index.ts:419-422`）。字段 `source:"api"`、`usedPercent`、`resetsAt`、`fetchedAt = report.fetchedAt`（`chatgpt-usage.ts:291-296`），窗口缺失时为 `missingState("api", report.fetchedAt)`（`chatgpt-usage.ts:293,296`）。
- **优先级：** API 结果（`kind` 为 `ok` 或 `missing`）替换当前展示的一切——包括 header 数据（`index.ts:404-406`）；API **error**（`config`／`auth`／`transport`／`incompatible`）保留 header 来源的当前值但附错误串（`index.ts:396-402`）；否则 error 状态替换之（`index.ts:403`）。header `ok` 替换 API 值并保留先前 error（`index.ts:412`）。
- **API 失败时**（`index.ts:389-407` + `index.ts:419-422`）：**缓存时间戳被更新**（error 快照经 `setCacheEntry` 以本地 now 存入，因此对接下来 30s 算新鲜——`docs/adr/0003-refresh-codex-usage-on-assistant-message.md:15` 亦有记录）。**旧值仅在 `source === "header"` 时被保留**；旧值来自 **API** 则被丢弃、换成 error 状态。**会记录 error**——经 `errorState()` 写 `state.chatgpt.error`（`chatgpt-usage.ts:146-148`，由 `errorSnapshot` `:178-180` 包裹）；注意这些 error 状态在 state 对象内 `fetchedAt: null`，而缓存条目拿到本地时间戳。测试：`extension.test.ts:443-457`（强制失败保留 header 50% 并显示 `usage request failed`）、`:474-489`（成功刷新清除 error）、`:458-473`（缺代理 → 仅 widget 的 config 错误，无通知）。
- **DeepSeek 余额失败：** `fetchBalance` 在任何 error／非 2xx／无 CNY 时返回 `null`（`index.ts:233-241`）；该 null 被以新鲜时间戳存入（`index.ts:495`、`:515`、`:798`），因此 **30s 内不重试**；先前展示的余额**被丢弃**（`state.balance = null`），且余额**无 error 字段**。
- ratio 估计被**两个通道**喂入（`index.ts:416` API、`index.ts:675` header）；header 的 `fetchedAt` 与 API 的 `fetchedAt` 来源不同（parser `now` vs usage 报告自带 `fetchedAt`，`chatgpt-usage.ts:167`）。

## 5. 迟到响应／切换处理守卫

- **async 结果或已 arm 的 timer 上不存在 session／generation／identity 守卫**（全扩展 `generation`／`epoch`／`seq`／`cancel`／`AbortController` 零匹配；唯一取消机制是两处 `AbortSignal.timeout`，`index.ts:231` 与 `chatgpt-usage.ts:276`）。
- 在途请求在模型／会话变化时**不被取消**：resolve 回调写到共享 `state` 并**用取数开始时捕获的 `ctx`** 重绘（`index.ts:428-433` → `applyChatGPTUsageSnapshot(ctx, …)` → `refresh(state, daily, pi, ctx)` `index.ts:423`）；`refresh` 读 `ctx.model` 做模式分类（`index.ts:364-377`），所以迟到响应会以过期的 ctx 渲染。
- 会话切换处理：`onInit` 重置展示态（`state.balance = null`、`state.chatgpt`／`state.chatgptFiveHour` 回到 `idle`）于 `index.ts:633-635`，但**不动 `balanceCache`**，所以紧接着的 `initializeForModel` 会重新采纳仍新鲜的缓存值（`index.ts:498-500`、`index.ts:491-492`）。在途期间触发刷新只是把当前 state 置 `loading` 并返回**旧** promise（`index.ts:441-452`）。
- Timer：边界 timer 在每次 `initializeForModel` 时被清除并重新 arm（`index.ts:480` → `index.ts:456`），但**会话结束／`agent_end` 时从不被清除**（`scheduleBoundaryRefresh` 之外无 `clearTimer` 调用），其闭包持有 arm 它的会话的 `ctx`（`index.ts:465-469`）。进程结束时也无任何清理（无 shutdown／exit hook）。

## 6. 峰谷边界 timer

- **Arm 位置**：在 `initializeForModel` 内、任何 async 工作**之前**，明确为了让图标刷新在余额／额度取数慢或失败时也已武装（`index.ts:477-480`）；`initializeForModel` 由 `session_*`（`index.ts:640`）与 `agent_start`（`index.ts:667`）调用。
- **重新 arm**：在自己回调内、重绘之后——`boundaryTimer = ctx.setTimeout(() => { boundaryTimer = undefined; refresh(state, daily, pi, ctx); scheduleBoundaryRefresh(ctx); }, delay)` — `index.ts:465-469`。每次 arm 先取消前一个：`if (boundaryTimer) ctx.clearTimer(boundaryTimer)` — `index.ts:456`。
- **延迟**：`isPeakHour(now) && !isPeakHour(now+1ms) ? 1 : Math.max(1, nextBoundary(now).getTime() - now.getTime() + 1)` — `index.ts:461-464`（边界数学在 `cost-calc.ts:82-92`；含端点峰价于 `cost-calc.ts:56-64` 结束）。使用 `ctx.setTimeout`／`ctx.clearTimer`（`index.ts:456,465`）。
- **不发网络调用、不写文档**——回调体恰为 `refresh(...)` + 重新 arm（`index.ts:466-468`）；只重算本地展示（时段图标／派生视图）。测试：`tests/model-cost/boundary-timer.test.ts:53-84`（触发、翻转 🌙、恰好重新 arm 一个 timer）与 `:88+`（在慢余额取数 resolve 之前已武装）；`feature-verification.test.ts:537-541` 钉住一个会话一次 usage 取数 + 一个下一个峰价边界的 timer。

## 7. 阻塞行为

- **会话初始化阻塞在网络上：** `onInit` await `initializeForModel`（`index.ts:640`、`await modelInit` `index.ts:657`），后者 await `fetchBalance`（≤5s，`index.ts:494`）或 `startChatGPTUsageRefresh`（≤10s，`index.ts:502`），外加跨进程锁下的 `daily.ensureSession`（≤15s 预算，`index.ts:646-651`、`archive-store.ts:138`）。作用于 `session_start`／`session_branch`／`session_switch`／`session_tree`（`index.ts:660-663`）。
- **`agent_start` 同样阻塞在网络上：** `await initializeForModel(ctx)` — `index.ts:666-668`。
- **`agent_end` 阻塞：** `await refreshChatGPTUsage`（Codex，`index.ts:757`）或 `await fetchBalance`（DeepSeek，`index.ts:797`），外加锁下 `await daily.recordTurnCost`（`index.ts:772`）。
- **非阻塞路径：** `message_end`（`void refreshChatGPTUsage(ctx)`，`index.ts:708`）、`input`（`void refreshBoth(ctx)`，`index.ts:530`）、以及 ratio 估计持久化（`void publish(...)`，`quota-estimate-store.ts:268`）——后者是由两个刷新通道触发的、未 await 的跨进程文件写（`index.ts:416`、`index.ts:675`）。
- **不存在 init hook 与进程退出 hook**：扩展只注册上述十个 handler（`pi.on` 位置：`index.ts:526,660,661,662,663,666,671,682,696,717`）与 `pi.setLabel`／`pi.registerCommand`（`index.ts:381,535`）；没有任何东西等待或阻塞进程退出。

## 与先前资产（`current-state.md`）／README 的出入

1. **README 的"30 秒内不重复请求"逐源 TTL，在混合新鲜度情形下被违反。** `index.ts:529-530` 在**任一**缓存过期时重取**两源**，且 `refreshBoth` 无条件取数（`index.ts:511-514`）。所以仍新鲜的源会在 `/model`、`/models`、`/switch` 上被重新请求。资产已标出此点；唯一测试（`extension.test.ts:1018-1055`）只覆盖两源都新鲜的情形，该缺口未被测试。
2. **"single-flight 合并并发触发"仅限 Codex API，不是全局。** 资产"Codex 主动拉取 single-flight 合并并发"对经 `refreshChatGPTUsage` 的 Codex 流量成立，但 (a) 输入预取绕过它（`index.ts:511-514`），(b) DeepSeek 余额完全无去重（`index.ts:494,512,542,797`）。资产该行应读作窄于"主动用量刷新为 single-flight"（`README.md:51`）。
3. **"失败保留旧值"（README `:51`、ADR `:15` 邻近）只在旧值来自 header 时为真。** 旧值来自 API 时，API 失败会**替换**为 error 状态（`index.ts:396-403`）；只有 `source === "header"` 的值存活。资产"失败时保留 header 值并附错误"是精确的；README 措辞不精确。
4. **header 成功不延长 API 缓存 TTL。** 资产"header 成功即时更新"对展示为真，但 header 通道不做 `setCacheEntry`（`index.ts:671-679`），所以紧接着的 assistant `message_end` 仍看到 Codex 缓存过期并发起 API 取数（`index.ts:706`）。README `:49`/`:51` 与资产都未写明这一解耦。
5. **`agent_end` 的强制刷新被 await，可能阻塞 run 收尾**（`index.ts:757`、`index.ts:797`）——资产表描述了按模式强制刷新，但未说明它被 await（也未说明 `/budget clear` 的强制余额取数被 await 却不给缓存打戳，`index.ts:542-544`）。
6. **error 快照里的 `state.fetchedAt` 是 `null`，而缓存时间戳被打戳**（`chatgpt-usage.ts:147` vs `index.ts:419-422` + `balance-cache.ts:34-37`）——"失败也更新缓存时间"与 state 的 `fetchedAt` 是不同时钟／字段。
