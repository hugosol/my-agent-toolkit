# model-cost 的模型与价格数据：来源与维护

本扩展的模型覆盖、谷价与峰价系数只存在于一个地方：[`shared-logic/model-data.ts`](../shared-logic/model-data.ts)（`MODEL_PRICING_DATA`）。本文件记录这些取值从哪来、怎么更新、以及更新时还有哪些东西必须一起改。它不重复价格表本身。

维护是**显式**的：数据随扩展源码更新，下一个进程用更新后的数据。运行期不查 `/models`、不抓价、不热更新、不自动接受未来模型，也不读取用户价格配置。已经锚过的请求与已经累计的金额不因数据更新而重算、补算或删除。

## 数据里有什么

| 内容 | 位置 |
| --- | --- |
| 精确 provider + Model ID → 模式（`monetary`／`token-only`） | `models` |
| 额度渠道（按 provider，与模型 ID 无关） | `allowanceProviders` |
| 各计价档的**谷价**（币种单位内每百万 token） | `tiers` |
| 峰价系数（峰价＝谷价 × 系数，不另存峰价表） | `peakMultiplier` |
| 计价时区偏移与峰段（含端点的两个工作日窗口） | `zoneOffsetMinutes`、`peakWindows` |
| 币种与单位（展示与目录快照用） | `currency`、`unit` |

未列出的 provider／模型对一律 `hidden`（不记账、不展示），不按 base URL、`owned_by`、前缀、后缀或别名升级分类。

模式是展示门控本身：`monetary` 的入口才有官方金额、峰谷／holiday 标记与官方余额行，`token-only` 只有批准的 token usage／上下文／Effort／Session／Round 与既定 detail（没有自身金额、结构参考比例、峰谷价格或余额），`hidden` 不创建 widget。给一个 ID 标错模式，等于给它标错整块展示。

## 当前覆盖与来源

| 覆盖 | 来源 |
| --- | --- |
| 官方 `deepseek`：`deepseek-v4-pro`（pro）、`deepseek-flash`（flash） | 实际鉴权 `GET https://api.deepseek.com/models`（2026-10-12，秘密只用于该次请求，未打印、未入库）＋ 用户确认的收窄范围；价格取自[官方模型与价格文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)（2026-09-10 12:00 北京时间调价后） |
| `opencode-go` 五个 token-only ID：`deepseek-v4-pro`、`deepseek-flash`、`deepseek-v4-flash`、`deepseek-v4.1-flash`、`deepseek-v4-flash-vision-exp` | [OpenCode 一方文档](https://opencode.ai/v2/docs/console/go) ＋ 匿名 `GET https://opencode.ai/zen/go/v1/models`（2026-10-12）；该接口返回 38 个 ID，其中只有这五个 DeepSeek 家族 ID 获批 |
| `openai-codex` 全 provider 走额度渠道 | 既有行为；其金额来自 framework 提供的对应 provider／模型 catalog 价格，不在本数据内 |
| 峰段 09:00–12:00、14:00–18:00（含端点）、周末与 holiday 谷价、共用系数 2 | 既有行为与官方价格文档；不自动识别法定节假日 |

以上范围的确认链（2026-10-12，用户逐项确认后批准发布）：

- **官方两 ID**：来自一次经用户授权的实际发现请求 `GET https://api.deepseek.com/models`（凭据只用于该次请求，未打印、未入库；未鉴权调用返回 401）。返回的 Model ID 恰为 `deepseek-v4-pro` 与 `deepseek-flash`（各自 1048576 context／393216 max output／`effort.supported_levels=[low,high,max]`，响应没有任何价格／币种／峰谷字段，也没有另外两个旧别名）；用户随后明确把官方名单限定为这两个 ID，不补旧别名、不自动支持未收录模型。
- **Go 五 ID**：来自匿名的 `GET https://opencode.ai/zen/go/v1/models`，返回 38 个条目，其中 DeepSeek 家族恰为表中五个 ID；用户确认只取这五个、按 token-only 维护，不取全部 38 个、不接 Zen／PAYG 金额。发现字段 `owned_by=opencode` 不等于接入 provider ID；provider 身份按第一方文档映射为 `opencode-go`。
- 比例由价格派生（不维护第二套比例配置）、缺价策略与「单元测试用自造数据、不固定真实价格／名单」等决定同样出自本轮确认，见上表与下文。

发现只辅助开发维护，**不**证明模型调用、账单或账户权益；时点证据不构成未来名单保证。原始访谈原话、完整 38-ID 快照与证据限度随迁移工作材料保存，本文件只保留维护所需的事实。

已退役、不得恢复的取值：官方旧 `deepseek-v4-flash`／`deepseek-v4-flash-vision-exp` 的默认支持、任意非官方 provider 的 pro／v4-flash 通配、全部 Go 模型、Zen／PAYG 金额、按当前价重算历史金额、独立比例配置表。

## 更新步骤

1. **取事实**：按上表的来源重新发现名单（官方接口需当次鉴权，秘密只用于该次请求、不打印、不写进仓库或证据）；价格只从官方价格文档读，不从模型名推断。记录获取时点、精确 ID、来源，以及与该文档不一致之处。
2. **明确决定范围**：新增／删除哪个精确 ID、属于哪个计价档或 token-only，是显式决定，不是自动跟随发现结果。新模型不会自动套用某一档。
3. **改数据**：只改 `model-data.ts` 里对应的条目。谷价变化就改 `tiers`；若未来峰价不再各项同比例变化，`peakMultiplier` 这一表达必须显式改掉（改成新的数据结构），不能继续乘同一个系数。
4. **改数据检查**：同步 `scripts/model-cost-data-smoke.ts` 的批准覆盖表（它是数据的隔离核对，随数据一起走；它是维护脚本，不是永久测试）。算法测试（`tests/model-cost/request-accounting.test.ts`）使用自造数据，**不要**把真实单价或真实名单写进去。
5. **改本文件**：更新上表的来源、时点与范围。
6. **跑**：`bun run smoke:model-cost-data`（数据与批准覆盖的核对）、`bun test tests/model-cost`、`bun test tests/harness-dock/model-cost-accounting.test.ts`、`bun run typecheck`。

## 不要做的事

- 不在 `config.yaml` 增加价格或名单字段，不新增第二份价格／比例配置。
- 不在运行期请求发现接口、抓价、热更新或缓存价格；发现接口只辅助上面的第 1 步。
- 不因数据更新补算、重估或删除已累计金额（请求价格在请求开始时锚定）。
- 不用真实常量写死算法测试，不把当前名单复制成快照断言。
