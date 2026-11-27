# model-cost 的模型与价格数据：来源与维护

本扩展的模型覆盖、谷价与峰价系数只存在于一个地方：[`shared-logic/business/pricing/model-data.ts`](../shared-logic/business/pricing/model-data.ts)（`MODEL_PRICING_DATA`）。本文件记录这些取值从哪来、怎么更新、以及更新时还有哪些东西必须一起改。它不重复价格表本身。

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

`monetary` 为当前模型计算金额并显示峰谷或 holiday 标记。`token-only` 显示用量和上下文，不计算当前模型的金额、费用结构比例或峰谷价格。`hidden` 不创建 widget。余额和 Accrued 是共享 Total 的账户信息，不是当前模型的计价属性。只要 Total 有 `Cost:`，token-only 和额度视图也可显示这些信息。初始化时，有 DeepSeek 账户访问能力的实例会在首次模型请求前发起余额预取。详情见 [账户读数与展示](../README.md#provider-account-readings)。

## 当前覆盖与来源

| 覆盖 | 来源 |
| --- | --- |
| 官方 `deepseek`：`deepseek-v4-pro`（pro）、`deepseek-flash`（flash） | 鉴权 `GET https://api.deepseek.com/models`（2026-10-12）核对精确 ID。价格取自[官方模型与价格文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)（2026-09-10 12:00 北京时间调价后）。 |
| `opencode-go` token-only：`deepseek-v4-pro`、`deepseek-flash`、`deepseek-v4-flash`、`deepseek-v4.1-flash`、`deepseek-v4-flash-vision-exp` | [OpenCode Go 官方文档](https://opencode.ai/docs/console/go)和匿名 `GET https://opencode.ai/zen/go/v1/models`（2026-10-12）。 |
| `openai-codex` 全 provider 走额度渠道 | 参考金额来自 framework 提供的对应 provider／模型 catalog 价格，不在本数据内。 |
| 峰段 09:00–12:00、14:00–18:00（含端点）、周末与 holiday 谷价、共用系数 2 | DeepSeek [官方价格文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)和扩展的既有计价规则。不自动识别法定节假日。 |

发现名单只用于维护，不是价格、实际模型调用或账户权益的证据，也不承诺未来覆盖。只维护明确选定的精确 ID；费用结构比例从价格派生。

已退役、不得恢复的取值：官方旧 `deepseek-v4-flash`／`deepseek-v4-flash-vision-exp` 的默认支持、任意非官方 provider 的 pro／v4-flash 通配、全部 Go 模型、Zen／PAYG 金额、按当前价重算历史金额、独立比例配置表。

## 更新步骤

1. **取事实**：按上表的来源重新发现名单（官方接口需当次鉴权，秘密只用于该次请求、不打印、不写进仓库或证据）；价格只从官方价格文档读，不从模型名推断。记录获取时点、精确 ID、来源，以及与该文档不一致之处。
2. **明确决定范围**：新增／删除哪个精确 ID、属于哪个计价档或 token-only，是显式决定，不是自动跟随发现结果。新模型不会自动套用某一档。
3. **改数据**：只改 `model-data.ts` 里对应的条目。谷价变化就改 `tiers`；若未来峰价不再各项同比例变化，`peakMultiplier` 这一表达必须显式改掉（改成新的数据结构），不能继续乘同一个系数。
4. **改数据检查**：同步 `scripts/model-cost-data-smoke.ts` 的批准覆盖表（它是数据的隔离核对，随数据一起走；它是维护脚本，不是永久测试）。算法测试（`tests/model-cost/foundation/session/request-accounting.test.ts`）使用自造数据，**不要**把真实单价或真实名单写进去。
5. **改本文件**：更新上表的来源、时点与范围。
6. **跑**：`bun run smoke:model-cost-data`（数据与批准覆盖的核对）、`bun test tests/model-cost`、`bun test tests/harness-dock/model-cost-accounting.test.ts`、`bun run typecheck`。

## 不要做的事

- 不在 `config.yaml` 增加价格或名单字段，不新增第二份价格／比例配置。
- 不在运行期请求发现接口、抓价、热更新或缓存价格；发现接口只辅助上面的第 1 步。
- 不因数据更新补算、重估或删除已累计金额（请求价格在请求开始时锚定）。
- 不用真实常量写死算法测试，不把当前名单复制成快照断言。
