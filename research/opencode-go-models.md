# OpenCode Go 订阅模型名单、精确 ID 与 provider 映射（第一方来源事实）

> 用途：[model-cost 完整迁移地图](../.scratch/model-cost-migration/map.md) 下 research 票「OpenCode Go 当前支持哪些模型及其精确 ID？」与 [官方计价与 token-only 模型名单](../.scratch/model-cost-migration/decision/13-model-catalog-policy.md) 的取证；这是**来源核实事实资产，不是已批准契约**，不改变任何票的正文或状态，也不授权生产配置更新。（该 research 票文件 `.scratch/model-cost-migration/decision/15-opencode-go-models.md` 当时未提交，不在本分支上。）
>
> 证据日期：**2026-10-12**（UTC 约 15:18–15:45）。方法：只读抓取第一方文档、第一方运行时端点（**无凭据、只读 GET / 无名请求体探针**）与第一方源码/目录快照；未使用任何账户凭据，未登录，未发起计费请求。
>
> 本地源码快照：`E:/Developer/myhub/opencode-1.16.2`（源包版本 `packages/opencode/package.json` = `1.16.2`，文件时间 2026-06-05，**非 git 仓库、无 commit**）。线上仓库 `anomalyco/opencode`（原 `sst/opencode`，`dev` 分支头 `e41e7e9064f1cb380f0905dd19c611756a577e79`，2026-10-12T14:35:49Z，提交信息 `refactor(ai): rename OpenCodeZen provider to OpenCode (#54767)`）与 `anomalyco/models.dev`（`dev` 分支头 `9048f9fc6a6ba6ef9e6c5706a6759464c6ba9062`，2026-10-12T14:38:44Z），CLI 最新发布版本 `opencode-ai@1.19.0`（npm registry，2026-10-12 查询）。

## 0. 速览

| 事实 | 值 | 来源 |
| --- | --- | --- |
| Go provider ID（配置引用用） | `opencode-go`；模型引用 `opencode-go/<model-id>` | Go 文档 Endpoints 节；1.16.2 `use-providers.ts:9`、`dialog-provider.tsx:21` |
| Go 显示名 | `OpenCode Go` | models.dev `opencode-go` provider；`dialog-provider.tsx:61` |
| Go API 基址 | `https://opencode.ai/zen/go/v1`（文档端点表）与 `https://opencode.ai/inference/go/v1`（models.dev provider.toml）；两者 `/models` 返回同一 38 项列表 | 文档 + 2026-10-12 匿名 GET 实测 |
| Go 运行时模型数 | **38** 个精确 ID | `GET /zen/go/v1/models`、`GET /inference/go/v1/models`，2026-10-12 15:18Z |
| Go 文档端点表模型数 | **32** 个（全部包含于运行时 38） | Go 文档 Endpoints 表 |
| models.dev `opencode-go` 目录模型数 | **36**（其中 32 与文档/运行时三方一致） | models.dev `api.json`，2026-10-12 下载 |
| 与 Zen／按量计费的边界 | 独立 provider `opencode`（显示名已从 "OpenCode Zen" 改为 "OpenCode"）；运行时 83 个 ID | models.dev；`/zen/v1/models` = `/inference/v1/models` |
| 动态发现接口 | `GET https://opencode.ai/zen/go/v1/models`（匿名 200；仅 `id`/`object`/`created`/`owned_by`，**无名称、无价格**） | 端点实测 + 源码 `modelsHandler.ts` |
| Go 请求硬前提 | 必须带 `x-opencode-session`，否则 400 `MissingSessionID`；带会话头但无凭据则 401 `Go requires a credential` | 端点实测，2026-10-12 |
| Go 计价单位 | 文档为 **USD/1M tokens** 与 USD 月度额度；未见任何人民币字段 | Go 文档 pricing 节 |

## 1. Provider 身份、配置引用与发现接口

### 1.1 身份与引用（第一方）

- **Go 是独立 provider，不属于 Zen／按量计费名单。** Go 文档写明：连接后在 OpenCode 中以 `opencode-go/<model-id>` 引用模型，例如 `{"model": "opencode-go/kimi-k3"}`（[Go 文档 Endpoints 节](https://opencode.ai/v2/docs/console/go)）。
- **provider 元数据（models.dev 构建产物，2026-10-12 下载 `https://models.dev/api.json`）**：
  - `opencode-go`：`name="OpenCode Go"`、`env=["OPENCODE_API_KEY"]`、`npm="@ai-sdk/openai-compatible"`、`api="https://opencode.ai/inference/go/v1"`、`doc="https://opencode.ai/v2/docs/console/go/"`，36 个模型。
  - `opencode`（按量计费）：`name="OpenCode"`、`env=["OPENCODE_API_KEY"]`、`npm="@ai-sdk/openai-compatible"`、`api="https://opencode.ai/inference/v1"`、`doc="https://opencode.ai/v2/docs/console/models/"`，120 个模型（含大量 `-free`）。
- **provider.toml 原件**：`providers/opencode-go/provider.toml`（GitHub contents API，blob `sha=8c823dbf351b17092671a3d6bccae20c07f45aaa`，456 B）与 `api.json` 一致，并带注释：`/inference/go/v1` 与 `/inference/v1` 提供相同的 chat completions、responses、messages、Gemini 路径，但按 Go 订阅计费，且请求要求 `x-opencode-session`。（注意：CDN 镜像 `cdn.jsdelivr.net/gh/anomalyco/models.dev@dev/...` 返回的是旧版本，仍写 `api="https://opencode.ai/zen/go/v1"`、`doc="https://opencode.ai/docs/go"`——引用时须以 GitHub 原文/`api.json` 为准。）
- **CLI 侧证据（1.16.2 快照）**：`packages/app/src/hooks/use-providers.ts:9` 将 `"opencode-go"` 列为热门 provider；`packages/opencode/src/cli/cmd/tui/component/dialog-provider.tsx:21,61,376` 给 `opencode-go` 优先级 1、描述 "Low cost subscription for everyone"，提示打开 `https://opencode.ai/go` 获取 key；`packages/opencode/test/session/retry.test.ts:305` 以 `opencode-go` 作为 provider 参数。**CLI 没有为 `opencode-go` 注册 `opencode` 那样的自定义 loader（`provider.ts` 的 `custom()` 只以 `opencode` 为键）**，即其凭据走常规 API key 流程。
- **控制台源码（1.16.2 快照）显示 Go 与按量计费在服务端分层**：
  - `packages/console/app/src/routes/zen/go/v1/models.ts`：Go 的模型列表 = `Object.keys(ZenData.list("lite").models)`；`packages/console/app/src/routes/zen/v1/models.ts`：按量计费 = `ZenData.list("full")`。
  - `packages/console/app/src/routes/zen/util/handler.ts:115`：`"model.tier": opts.modelList === "full" ? "zen" : "go"`；Go 路由传 `modelList:"lite"`（`zen/go/v1/chat/completions.ts`、`zen/go/v1/messages.ts`）。
  - `handler.ts:57` 的计费来源枚举 `"anonymous" | "free" | "byok" | "subscription" | "lite" | "balance"`，`lite` 分支用 `LiteData.getLimits()`（周/月/滚动限额），`packages/console/core/src/lite.ts` 的 `planName()` 返回 `"lite"`、价格来自 `ZEN_LITE_PRICE` secret。
  - `packages/console/core/src/model.ts`（`ZenData`）从 `ZEN_MODELS1..30` 共 30 个 SST secret 拼接 JSON（`infra/console.ts:187+` 定义），内含 `zenModels`/`liteModels`/`providers`（含上游 provider、`priority`、`tpmLimit`、`payloadModifier` 等）。**Go 名单的真实定义在部署 secret 中，不在公开仓库**，公开仓库只能证明“lite 名单即 Go 名单”的管道。

### 1.2 动态发现接口（2026-10-12 实测）

| 请求 | 结果 |
| --- | --- |
| `GET https://opencode.ai/zen/go/v1/models` | **200**，`3181` B，`Date: Mon, 12 Oct 2026 15:18:00 GMT`；`{"object":"list","data":[{"id":"...","object":"model","created":1791818280,"owned_by":"opencode"}, ...]}` |
| `GET https://opencode.ai/inference/go/v1/models` | **200**，同一 38 个 ID（集合逐一相等） |
| `GET https://opencode.ai/zen/v1/models` 与 `GET https://opencode.ai/inference/v1/models` | **200**，各 83 个 ID，集合相等（按量计费名单） |
| `GET .../zen/go/v1/models` 带 `Authorization: Bearer sk-not-a-real-key` | **401**（列表接口对无效 key 拒绝；匿名仍可读） |
| `GET .../zen/go/v1/models/kimi-k3` | **404**（无逐模型元数据子路径） |
| `POST .../zen/go/v1/chat/completions`（`{"model":"kimi-k3","messages":[...]}`，无会话头） | **400** `{"type":"error","error":{"type":"MissingSessionID","message":"Request is missing x-opencode-session and cannot be routed efficiently. Please see https://opencode.ai/docs/go/#where-can-i-use-it"}}` |
| 同上 + `x-opencode-session: probe-2026-10-12`，无凭据 | **401** `{"error":{"type":"server_error","message":"Upstream request failed: Go requires a credential"}}` |
| `POST .../zen/go/v1/messages`、`.../zen/go/v1/responses`（同样无会话头） | **400**，同一 `MissingSessionID` 错误（路由存在） |
| `POST .../zen/v1/chat/completions` 与 `.../inference/openai/v1/chat/completions`（无凭据） | **401** `{"error":{"type":"server_error","message":"Upstream request failed: Rate-limited models require a workspace"}}`（与 Go 的错误文案不同） |

响应字段语义（源码证据，1.16.2 `packages/console/app/src/routes/zen/util/modelsHandler.ts`）：`buildModelsResponse` 把 `created` 设为 `Math.floor(Date.now()/1000)`（**请求时刻，不是模型创建时间**；实测 38 项 `created` 完全相同且等于请求时间），并过滤掉以 `alpha-` 开头的 ID。Go 文档给出的示例命令同样是匿名调用：`curl https://opencode.ai/zen/go/v1/models`（Go 文档 “Models” 节）。

**发现接口只给 ID**：无显示名、无上下文长度、无价格、无峰值时段；名称必须来自文档或 models.dev。是否要求 `x-opencode-session` 才能读列表：实测**不要求**（匿名 200）。

### 1.3 客户端使用前提（Go 文档，2026-10-12 抓取）

- 要求：发送典型编码代理流量；自带 UA（如 `my-coding-agent/1.0`）；**每次对话发送稳定的 `x-opencode-session`** 以便路由与提示缓存优化。
- 文档“Validated clients”列表包含 **Pi**（"Current builds send session information for OpenCode. Update older installations."）、Hermes、Claude Code、Codex、ZCode、jcode（≥ v0.81.6）、Kilo Code CLI；“Known problematic clients” 含 **DeepSeek Harness**（部分模型路径缺会话信息）、GitHub Copilot Chat、Kimi Code、MiMo Code。以上为文档陈述，未在本机客户端验证。

## 2. Go 当前精确 ID 清单（38，2026-10-12 15:18Z 运行时）

“文档名”= Go 文档 Endpoints 表给的显示名（32 行）；“目录名”= models.dev `opencode-go` 的 `name`（36 项）。空白表示该来源没有此项。

| # | 精确请求 ID | 文档名 | 目录名 | 文档端点族 |
| --- | --- | --- | --- | --- |
| 1 | `grok-4.7` | Grok 4.7 | Grok 4.7 | responses |
| 2 | `grok-4.6` | Grok 4.6 | Grok 4.6 | responses |
| 3 | `grok-4.5` | — | Grok 4.5 | — |
| 4 | `gpt-6-luna` | GPT 6 Luna | GPT-6 Luna | responses |
| 5 | `gpt-5.6-luna` | GPT 5.6 Luna | GPT-5.6 Luna | responses |
| 6 | `claude-haiku-5-5` | Claude Haiku 5.5 | Claude Haiku 5.5 | messages |
| 7 | `glm-5.3-flash` | GLM-5.3-Flash | GLM-5.3-Flash | chat/completions |
| 8 | `glm-5.3` | GLM-5.3 | GLM-5.3 | chat/completions |
| 9 | `glm-5.2` | GLM-5.2 | GLM-5.2 | chat/completions |
| 10 | `glm-5.1` | — | — | — |
| 11 | `kimi-k3` | Kimi K3 | Kimi K3 | chat/completions |
| 12 | `kimi-k2.7-code` | Kimi K2.7 Code | Kimi K2.7 Code | chat/completions |
| 13 | `kimi-k2.6` | Kimi K2.6 | Kimi K2.6 | chat/completions |
| 14 | `longcat-2.0` | LongCat-2.0 | LongCat-2.0 | chat/completions |
| 15 | `longcat-2.5-preview-free` | LongCat 2.5 Preview Free | LongCat 2.5 Preview Free | chat/completions |
| 16 | `step-5-preview-free` | Step 5 Preview Free | Step 5 Preview Free | chat/completions |
| 17 | `mimo-v2.6-flash` | MiMo-V2.6-Flash | MiMo-V2.6-Flash | chat/completions |
| 18 | `mimo-v2.6-pro` | MiMo-V2.6-Pro | MiMo-V2.6-Pro | chat/completions |
| 19 | `mimo-v2.5` | MiMo-V2.5 | MiMo V2.5 | chat/completions |
| 20 | `mimo-v2.5-pro` | MiMo-V2.5-Pro | MiMo V2.5 Pro | chat/completions |
| 21 | `minimax-m3` | MiniMax M3 | MiniMax-M3 | messages |
| 22 | `minimax-m2.7` | MiniMax M2.7 | MiniMax-M2.7 | messages |
| 23 | `minimax-m2.5` | — | — | — |
| 24 | `muse-spark-1.3-contributor` | Muse Spark 1.3 Contributor | Muse Spark 1.3 Contributor | responses |
| 25 | `muse-spark-1.2-contributor` | Muse Spark 1.2 Contributor | Muse Spark 1.2 Contributor | responses |
| 26 | `qwen3.8-max` | Qwen3.8 Max | Qwen3.8 Max | messages |
| 27 | `qwen3.8-flash` | Qwen3.8 Flash | Qwen3.8 Flash | messages |
| 28 | `qwen3.7-max` | — | Qwen3.7 Max | — |
| 29 | `qwen3.7-plus` | Qwen3.7 Plus | Qwen3.7 Plus | messages |
| 30 | `qwen3.6-plus` | — | Qwen3.6 Plus | — |
| 31 | `deepseek-v4.1-flash` | DeepSeek V4.1 Flash | DeepSeek V4.1 Flash | chat/completions |
| 32 | `deepseek-v4-pro` | DeepSeek V4 Pro | DeepSeek V4 Pro (New) | chat/completions |
| 33 | `deepseek-v4-flash` | DeepSeek V4 Flash | DeepSeek V4 Flash | chat/completions |
| 34 | `deepseek-v4-flash-vision-exp` | DeepSeek V4 Flash Vision Exp | DeepSeek V4 Flash Vision Exp | chat/completions |
| 35 | `deepseek-flash` | — | — | — |
| 36 | `hy4-preview` | Hy4 preview | Hy4 preview | chat/completions |
| 37 | `hy3` | Hy3 | Hy3 | chat/completions |
| 38 | `space-bunny` | Space Bunny | Space Bunny | chat/completions |
| — | `space-bunny-free` | — | Space Bunny Free | — |
| — | `omen-alpha` | — | — | — |

按字母序的完整 38 个运行时 ID（便于粘贴核对）：
`claude-haiku-5-5, deepseek-flash, deepseek-v4-flash, deepseek-v4-flash-vision-exp, deepseek-v4-pro, deepseek-v4.1-flash, glm-5.1, glm-5.2, glm-5.3, glm-5.3-flash, gpt-5.6-luna, gpt-6-luna, grok-4.6, grok-4.7, hy3, hy4-preview, kimi-k2.6, kimi-k2.7-code, kimi-k3, longcat-2.0, longcat-2.5-preview-free, mimo-v2.5, mimo-v2.5-pro, mimo-v2.6-flash, mimo-v2.6-pro, minimax-m2.5, minimax-m2.7, minimax-m3, muse-spark-1.2-contributor, muse-spark-1.3-contributor, omen-alpha, qwen3.6-plus, qwen3.7-max, qwen3.7-plus, qwen3.8-flash, qwen3.8-max, space-bunny, step-5-preview-free`

### 2.1 历史漂移证据（本地 1.16.2 快照，文件时间 2026-06-05）

`packages/opencode/test/tool/fixtures/models-api.json:28003` 是当时 models.dev 响应的固定件，`opencode-go` 只有 **14** 个模型：`minimax-m2.7, kimi-k2.5, mimo-v2.5-pro, glm-5, mimo-v2-omni, mimo-v2.5, qwen3.6-plus, glm-5.1, deepseek-v4-flash, kimi-k2.6, deepseek-v4-pro, minimax-m2.5, mimo-v2-pro, qwen3.5-plus`（provider 字段 `api="https://opencode.ai/zen/go/v1"`、`name="OpenCode Go"`）。约 4 个月后 models.dev 为 36、运行时为 38 ⇒ **名单变化频繁，任何硬编码清单都必须有更新路径**。

## 3. 三个来源的差异（同日抓取）

计数：运行时 38（`/zen/go/v1/models`）、文档端点表 32、models.dev 目录 36。**三者交集 = 32**，即文档表是运行时列表的真子集。

| 关系 | 集合 |
| --- | --- |
| 文档有、运行时无 | 无 |
| 运行时多出（文档无、目录无） | `deepseek-flash`、`glm-5.1`、`minimax-m2.5`、`omen-alpha` |
| 目录多出（运行时无、文档无） | `grok-4.5`、`space-bunny-free` |

结论：
- Go 文档 Endpoints 表**不是**完整名单，缺 4 个运行时 ID，其中 `deepseek-flash`、`omen-alpha` 在另外两个来源都不存在（**无第一方显示名**；`omen-alpha` 也未被 `alpha-` 前缀过滤规则排除，规则见 `modelsHandler.ts`）。
- models.dev 目录不是运行时名单的超集（缺 4 个），也不是子集（多 2 个）；CLI 的 `/models` 选择器与直接调用端点的可用集合**可能不一致**。
- 名称与 ID 必须分开：文档/目录给显示名，运行时只给 ID；两者部分名称格式不同（如 `DeepSeek V4 Pro` vs `DeepSeek V4 Pro (New)`；`MiniMax M2.7` vs `MiniMax-M2.7`；`GPT 6 Luna` vs `GPT-6 Luna`）。

## 4. Go 与 Zen／按量计费的边界

**是两条独立名单，不是同一名单的两种计费方式。** 证据：

1. provider 分离：`opencode-go`（`api=/inference/go/v1`，36 项目录）与 `opencode`（`api=/inference/v1`，120 项目录）。
2. 端点分离：`/zen/go/v1/*`（`modelList:"lite"`）与 `/zen/v1/*`、`/inference/v1/*`（`modelList:"full"`）；列表规模 38 vs 83。
3. 计费分离（源码）：`handler.ts` 的 `BillingSource` 把 `lite`（Go 订阅，走 `LiteData.getLimits()`）与 `balance`（按量余额）分开；遥测 `model.tier` 为 `zen|go`；Go 有独立的 Stripe 价格 secret `ZEN_LITE_PRICE`。
4. 错误文案分离：Go 无凭据 = `Go requires a credential`；按量计费无凭据 = `Rate-limited models require a workspace`。

**命名漂移（引用时避免歧义）**：

| 层 | 按量计费（PAYG） | Go 订阅 |
| --- | --- | --- |
| v1 文档页 `https://opencode.ai/docs/providers`（2026-10-12 仍 200） | 小节标题 **OpenCode Zen**，`/connect` 选 `OpenCode Zen` | 小节标题 **OpenCode Go**，`/connect` 选 `OpenCode Go` |
| v2 文档 | “Console”，模型页标题 Models；`/console/models` 说 “OpenCode pay-as-you-go provider” | `/console/go`，标题 Go，`/connect` 选 **OpenCode Go** |
| models.dev 当前 | provider `opencode`，`name="OpenCode"`，`api=/inference/v1` | provider `opencode-go`，`name="OpenCode Go"`，`api=/inference/go/v1` |
| models.dev 2026-06 快照（1.16.2 固定件） | `name="OpenCode Zen"`，`api="https://opencode.ai/zen/v1"` | `name="OpenCode Go"`，`api="https://opencode.ai/zen/go/v1"` |
| 线上 CLI 提交 | `refactor(ai): rename OpenCodeZen provider to OpenCode (#54767)`（`e41e7e9`，2026-10-12T14:35Z） | 无重命名 |

**已失效 URL**：`https://opencode.ai/docs/zen` 与 `https://opencode.ai/docs/go` 现在均为 **404**（models.dev 旧版 provider.toml/CDN 缓存仍指向它们）；当前地址是 `https://opencode.ai/v2/docs/console/models` 与 `https://opencode.ai/v2/docs/console/go`。

**按量计费（`opencode`）同日计数**：models.dev 目录 120；运行时 83（`/zen/v1/models` ≡ `/inference/v1/models`）；文档 `console/models` 端点表 88 行。差异：文档多出 `deepseek-v4-flash-vision-exp, exo-free, ling-3.0-flash-fin-free, mimo-v2.5-free, nemotron-3-ultra-free, qwen3.7-max, qwen3.7-plus`；运行时多出 `claude-opus-5-5-backup, muse-spark-1.2-contributor-free`。同一 ID（如 `deepseek-v4-pro`）在两名单里价格不同（Go 0.66/1.98/cache 0.022 USD vs 按量 1.74/3.84/0.145），**因此映射必须按 provider+model 复合键**。

## 5. Go 价格与额度事实（仅记录，不构成我们的计价口径）

Go 文档（`/console/go`）平台与限额（2026-10-12）：

- 计划：**Go $10/月**、**Go Plus $40/月**；同一模型清单，Go Plus 给更高额度。单成员工作区（Personal）才可订阅；订阅工作区不能邀请成员。
- 限额结构：每模型有 5 小时 = 月度限额的 20%、周 = 50%、月 = 100%；“月度限额”是**美元额度**，决定该模型用量如何计入各窗口。达到上限后可继续用免费模型；控制台可开 “Use balance” 让 Go 超额后回落按量余额。
- **token 价格对所有计划相同**；DeepSeek 系列区分 Peak／Off-Peak，峰值时段为 UTC 周一至周五 01:00–04:00 与 06:00–10:00，其余（含周末）为 Off-Peak（文档引用 `https://api-docs.deepseek.com/quick_start/pricing/`）。`deepseek-v4-flash-vision-exp` 的图片按尺寸折成输入 token 计费。
- models.dev 的 `opencode-go` 成本字段只保留**单一档位**（DeepSeek 系为 Off-Peak 值：`deepseek-v4-pro` in/out/cache_read = 0.66/1.98/0.022；`deepseek-v4-flash` 与 `deepseek-v4.1-flash`、`deepseek-v4-flash-vision-exp` 均 0.15/0.60/0.003），与文档的双档表不一致；**目录成本不能当作完整价格表**。

<details>
<summary>Go 计划（$10/月）完整价格表（USD/1M tokens，2026-10-12 抓取，逐行核对）</summary>

| Model | Input | Output | Cached Read | Cached Write | Monthly limit |
| --- | --- | --- | --- | --- | --- |
| GLM-5.3-Flash | $0.15 | $0.50 | $0.03 | - | $60 |
| GLM-5.3 | $1.40 | $4.40 | $0.26 | - | $15 |
| GLM-5.2 | $1.40 | $4.40 | $0.26 | - | $60 |
| Kimi K3 | $3.00 | $15.00 | $0.30 | - | $15 |
| Kimi K2.7 Code | $0.95 | $4.00 | $0.19 | - | $60 |
| Kimi K2.6 | $0.95 | $4.00 | $0.16 | - | $60 |
| LongCat-2.0 | $0.30 | $1.20 | $0.006 | - | $60 |
| LongCat 2.5 Preview Free | Free | Free | Free | - | Unlimited（limited time） |
| Step 5 Preview Free | Free | Free | Free | - | Unlimited（limited time） |
| MiMo-V2.6-Flash | $0.14 | $0.28 | $0.0028 | - | $60 |
| MiMo-V2.6-Pro | $0.435 | $0.87 | $0.003625 | - | $15 |
| MiMo-V2.5 | $0.14 | $0.28 | $0.0028 | - | $60 |
| MiMo-V2.5-Pro | $0.435 | $0.87 | $0.003625 | - | $15 |
| MiniMax M3 | $0.30 | $1.20 | $0.06 | - | $60 |
| MiniMax M2.7 | $0.30 | $1.20 | $0.06 | $0.375 | $60 |
| Muse Spark 1.3 Contributor | $0.10 | $0.20 | $0.002 | - | $60 |
| Muse Spark 1.2 Contributor | $0.10 | $0.20 | $0.002 | - | $60 |
| Qwen3.8 Max | $2.00 | $6.00 | $0.25 | $2.50 | $15 |
| Qwen3.8 Flash | $0.15 | $0.47 | $0.016 | $0.20 | $30 |
| Qwen3.7 Plus (≤ 256K tokens) | $0.40 | $1.60 | $0.04 | $0.50 | $60 |
| Qwen3.7 Plus (> 256K tokens) | $1.20 | $4.80 | $0.12 | $1.50 | $60 |
| DeepSeek V4.1 Flash (Off-Peak) | $0.15 | $0.60 | $0.003 | - | $80 |
| DeepSeek V4.1 Flash (Peak) | $0.30 | $1.20 | $0.006 | - | $80 |
| DeepSeek V4 Pro (Off-Peak) | $0.66 | $1.98 | $0.022 | - | $15 |
| DeepSeek V4 Pro (Peak) | $1.32 | $3.96 | $0.044 | - | $15 |
| DeepSeek V4 Flash (Off-Peak) | $0.15 | $0.60 | $0.003 | - | $30 |
| DeepSeek V4 Flash (Peak) | $0.30 | $1.20 | $0.006 | - | $30 |
| DeepSeek V4 Flash Vision Exp (Off-Peak) | $0.15 | $0.60 | $0.003 | - | $15 |
| DeepSeek V4 Flash Vision Exp (Peak) | $0.30 | $1.20 | $0.006 | - | $15 |
| Hy4 preview | $0.834 | $2.501 | $0.042 | - | $30 |
| Hy3 | $0.14 | $0.58 | $0.035 | - | $60 |
| Space Bunny | $0.15 | $0.60 | $0.03 | - | $30 |
| Grok 4.7 (≤ 200K tokens) | $2.00 | $6.00 | $0.50 | - | $15 |
| Grok 4.7 (> 200K tokens) | $4.00 | $12.00 | $1.00 | - | $15 |
| Grok 4.6 (≤ 200K tokens) | $2.00 | $6.00 | $0.50 | - | $15 |
| Grok 4.6 (> 200K tokens) | $4.00 | $12.00 | $1.00 | - | $15 |
| GPT 6 Luna (≤ 272K tokens) | $0.10 | $0.50 | $0.01 | $0.125 | $15 |
| GPT 6 Luna (> 272K tokens) | $0.20 | $0.75 | $0.02 | $0.25 | $15 |
| GPT 5.6 Luna (≤ 272K tokens) | $0.20 | $1.20 | $0.02 | $0.25 | $15 |
| GPT 5.6 Luna (> 272K tokens) | $0.40 | $1.80 | $0.04 | $0.50 | $15 |
| Claude Haiku 5.5 (≤ 100K tokens) | $0.10 | $0.50 | $0.01 | $0.125 | $15 |
| Claude Haiku 5.5 (> 100K tokens) | $0.50 | $2.50 | $0.05 | $0.625 | $15 |

（文档同时给出 Go Plus 的对应月度限额（如 GLM-5.3 $120、Kimi K3 $60 等）与按模型估算请求数表；额度表末注明“Usage limits may change”。）
</details>

与本项目的口径关系：以上全部为 **USD、Go 侧自有价目**；Go 端点/目录中**没有人民币字段**。用户已选择 Go = token-only ⇒ 本资产不主张把这些美元价接入“官方 DeepSeek 计价”，也不扩大为额度 API 实现。

## 6. 无法验证 / 已知限制

1. **无账户实测**：全程未使用凭据。**账户实测名单未取得**——匿名 `/models` 是服务端名单，不代表某账户在某地区实际可用或被计费的集合（例如文档说明 Muse Spark 受 Meta 地域政策限制）。
2. 带**有效** key 的 `/models` 是否返回更多项、是否附额外字段：未知（无凭据；仅验证了无效 key → 401）。
3. Go Plus 与 Go 在服务端的区分方式（是否同一 `lite` 名单 + 不同限额字段）：未验证；1.16.2 快照只有 `"lite"` 这一档键与 `planName() === "lite"`。
4. 上游 provider 映射（每个 Go 模型实际路由到哪家推理商、`priority`/`tpmLimit` 等）：定义在部署 secret `ZEN_MODELS1..30` 中，**公开仓库不可见**；本资产只记录了“存在该层”及其读取代码。
5. 双基址（`/zen/go/v1` 与 `/inference/go/v1`）均为官方支持的说法：文档端点表只写 `zen/go/v1`，models.dev provider.toml 注释写 `/inference/go/v1`；两者 2026-10-12 均 200 且返回相同列表，但**是否长期等价未验证**。
6. `deepseek-flash` 与 `omen-alpha`：运行时存在，文档与 models.dev 均无；其显示名、可用性、计费归属未验证。注意 `deepseek-flash` 与项目旧实现中**官方 DeepSeek provider** 的模型 ID 同名（`E:/Developer/myhub/my-omp-toolkit/extensions/model-cost/cost-calc.ts:30-32` 把 `deepseek-flash` 作为 "V4.1 Flash" 主 ID，并把 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 列为 legacy aliases；Go 侧三者为三个独立 ID）——**仅凭 model ID 无法判定归属，必须按 provider+model 复合键**。
7. 文档 `console/models` 的 USD 输出价与 models.dev 目录存在出入（例：按量 `deepseek-v4-pro` 文档 Output $3.48 vs 目录 3.84）⇒ 文档与目录各自维护，**价格类字段不可互相当作校验基准**。
8. 1.16.2 快照缺 `zen/go/v1/responses.ts` 路由文件（`zen/v1/responses.ts` 存在），但运行时 `POST /zen/go/v1/responses` 返回 400 `MissingSessionID`（路由存在）且文档列出该端点 ⇒ 快照落后于线上，源码行号仅供引用当时的读取逻辑。

## 7. 来源清单（含抓取时刻与修订）

第一方运行时（匿名，2026-10-12）：
- `GET https://opencode.ai/zen/go/v1/models` — 200，38 ID，`Date: Mon, 12 Oct 2026 15:18:00 GMT`（响应头 `access-control-allow-headers: Content-Type, Authorization, X-Api-Key, X-Opencode-Org-Id`）。
- `GET https://opencode.ai/inference/go/v1/models` — 200，同 38 ID。
- `GET https://opencode.ai/zen/v1/models`、`GET https://opencode.ai/inference/v1/models` — 200，83 ID，集合相等。
- `POST https://opencode.ai/zen/go/v1/{chat/completions,messages,responses}` — 400 `MissingSessionID`；带 `x-opencode-session` 无凭据 → 401 `Go requires a credential`。
- `POST https://opencode.ai/{zen/v1,inference/openai/v1}/chat/completions` — 401 `Rate-limited models require a workspace`。
- `GET https://opencode.ai/zen/go/v1/models/kimi-k3` — 404。

第一方文档（2026-10-12）：`https://opencode.ai/v2/docs/console/go`（Endpoints 表 32 行、价格表、Validated/Problematic clients、隐私表、DeepSeek 峰谷说明）；`https://opencode.ai/v2/docs/console/models`（按量计费端点表 88 行与价格）；`https://opencode.ai/v2/docs/console/api/inference`（`/inference/*` 系列端点与服务账号鉴权；免费 chat 模型可匿名调用）；`https://opencode.ai/v2/docs/console`（Console 概览，列 “OpenCode Go and Go Plus … $10 and $40”）；`https://opencode.ai/docs/providers`（v1 页仍 200，含 “OpenCode Zen” 与 “OpenCode Go” 两节）；`https://opencode.ai/docs/zen`、`https://opencode.ai/docs/go`（**均 404**）。

第一方目录：`https://models.dev/api.json`（2026-10-12 完整下载，5,388,930 B；`opencode-go` 36 项、`opencode` 120 项）；`https://api.github.com/repos/anomalyco/models.dev/contents/providers/opencode-go/provider.toml`（`sha=8c823dbf351b17092671a3d6bccae20c07f45aaa`）；`anomalyco/models.dev@dev` 头 `9048f9fc6a6ba6ef9e6c5706a6759464c6ba9062`（2026-10-12T14:38:44Z）；`anomalyco/opencode@dev` 头 `e41e7e9064f1cb380f0905dd19c611756a577e79`（2026-10-12T14:35:49Z）。

本地快照 `E:/Developer/myhub/opencode-1.16.2`（包版本 1.16.2，文件时间 2026-06-05）：
- `packages/console/app/src/routes/zen/go/v1/models.ts`（Go 列表 = `ZenData.list("lite")`）；`.../zen/v1/models.ts`（= `list("full")`）；`.../zen/util/modelsHandler.ts`（`created` = 响应时刻、过滤 `alpha-`）。
- `packages/console/app/src/routes/zen/util/handler.ts:57,115,768-833`（`BillingSource`、`model.tier`、lite 额度校验）；`packages/console/core/src/lite.ts`（`planName()` = `"lite"`、`ZEN_LITE_PRICE`）。
- `packages/console/core/src/model.ts:10-175`（`ZenData` 从 `ZEN_MODELS1..30` 拼接 JSON；`providers`/`zenModels`/`liteModels` 结构）；`infra/console.ts:187+`（30 个 secret 定义）。
- `packages/opencode/test/tool/fixtures/models-api.json:28003`（2026-06 时 `opencode-go` 14 项）；`packages/app/src/hooks/use-providers.ts:9`；`packages/opencode/src/cli/cmd/tui/component/dialog-provider.tsx:21,61,376`；`packages/opencode/src/provider/provider.ts`（`custom()` 仅以 `opencode` 为键）。

项目内对照：`.scratch/model-cost-migration/assets/current-state.md:74`（现基线 smoke 已把 `{"provider":"opencode-go","id":"deepseek-v4-pro"}` 判为 `token-only`）；`E:/Developer/myhub/my-omp-toolkit/extensions/model-cost/model-mode.ts:17,19-20`（token-only 名单现仅 `deepseek-v4-pro`、`deepseek-v4-flash` 两项）。

## 8. 对 decision 13 / 15 的事实层含义（非契约）

1. **要冻结的 Go 集**：以运行时 38 ID 为准（文档 32 只够显示名与端点族，models.dev 36 只反映 CLI 目录，且三源互不为超集）。文档表给名称、运行时给 ID ⇒ 名称/ID 映射需要两源合并，且 `deepseek-flash`、`omen-alpha`、`glm-5.1`、`minimax-m2.5` 目前**无第一方显示名**。
2. **映射键必须是 provider+model 复合**：同一 ID 在 Go 与按量计费两名单中价格/端点不同（`deepseek-v4-pro` 等），且 `deepseek-flash` 与官方 DeepSeek provider 的同名 ID 语义不一致。
3. **Go = token-only 不受 USD 价格影响**：Go 的美元价表与月度美元额度不进入我们的金额口径；token 累计只需识别 provider + 精确 ID。
4. **维护来源**：唯一机器可读的 ID 来源是 `GET /zen/go/v1/models`（仅 ID、无名称/价格、匿名可读、无效 key 401）；名称在文档/目录，价格在文档。四个月内 14→36/38 的漂移说明**集中映射必须有显式的刷新/失效策略**，但本资产不指定实现。
5. **使用前提**：任何经 Go 端点发起的请求都要 `x-opencode-session`（400 `MissingSessionID`），客户端 UA 也应自报；文档把 `Pi` 列为已验证客户端、把 `DeepSeek Harness` 列为会话头不全的问题客户端——若本项目将来直接调用 Go，这一点是硬前提；本次仅记录，不改变 token-only 决策。
