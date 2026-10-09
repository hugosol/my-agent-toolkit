# model-cost 现状调查与迁移输入

这是 chart 会话的事实资产，不是已确认接口或迁移实现。源根目录为 `E:/Developer/myhub/my-omp-toolkit`，目标为当前仓库。调查覆盖源扩展全部 13 个 TS 模块、README、GLOSSARY、三个业务 ADR 与相关测试；目标覆盖 framework 的声明、协议、OMP adapter、生命周期行为、能力索引、支持记录及 connect-bot 先例。未修改源实现、正式 harness 配置或统计文件。

## 功能全貌及源码证据

下表源链接均指向原实现；迁移必须选定源 revision，不能把实时工作树链接视为冻结基线。

| 功能 | 实际行为 | 源证据 |
| --- | --- | --- |
| 模式选择 | official DeepSeek 已知模型计价；openai-codex provider 进入 Codex；非官方 provider 的 v4-pro/v4-flash 仅 token；其余隐藏 widget | [model-mode.ts](../../../../my-omp-toolkit/extensions/model-cost/model-mode.ts)，classifyModelMode |
| 上下文预算 | DeepSeek 默认 450K，可改至 1000K；Codex 固定 272K；只显示与告警，不限制请求、输出或压缩 | [index.ts](../../../../my-omp-toolkit/extensions/model-cost/index.ts)，buildWidgetLines、budget handler |
| Effort | 使用宿主实际生效且已解析／clamp 的思考强度；未知为 ?；只给值着色 | index.ts，readEffort、refresh |
| DeepSeek 价格 | 北京时间工作日 09:00–12:00、14:00–18:00 闭区间峰价；周末谷价；holiday 强制谷价；pro 与 flash 家族价格表 | [cost-calc.ts](../../../../my-omp-toolkit/extensions/model-cost/cost-calc.ts)，isPeakHour、resolvePriceTier |
| 每请求费用 | 发请求时锚定价格，assistant message 完成时以该请求 usage 累加；DeepSeek 不计 cacheWrite 费用 | [turn-cost.ts](../../../../my-omp-toolkit/extensions/model-cost/turn-cost.ts)，anchorRequest、addMessageCost；index.ts:682–714 |
| Total／Turn／Sum | Total 来自 session 累计；旧 UI 的 Turn 来自 agent_end 的累计差分，实际是 run 统计；另含 orchestration 用量 | index.ts:717–801；cost-calc.ts，buildStatusLine、buildChatGPTStatusLine |
| DeepSeek 余额 | bearer GET provider base 的 /user/balance，去除末尾 /v1；5 秒 timeout；取 CNY；低于 10／5 元告警色 | index.ts，fetchBalance:219–241 |
| 每日累计与分段条 | 按 session 维护 token 基线及费用，共享累计；≤20 元 fine、>20 元 coarse；clear 归档并开始新周期 | [daily-tracker.ts](../../../../my-omp-toolkit/extensions/model-cost/daily-tracker.ts)，recordTurnCost、archive；[segment-bar.ts](../../../../my-omp-toolkit/extensions/model-cost/segment-bar.ts) |
| Codex 估算费用 | 读取 model.cost 的 USD 价格；cacheRead/input/cacheWrite/output 四路；缺价格隐藏费用列但保留 token | cost-calc.ts，usdCost、buildChatGPTStatusLine、buildChatGPTTokenLine |
| 双额度窗口 | 5h 与 7d 同时显示 quota%／time%、20 格节奏条、倒计时及绝对时间；5h 分钟精度、7d 小时精度；未知、过期、无效 reset 区分；按终端宽度逐步降级 | [chatgpt-usage.ts](../../../../my-omp-toolkit/extensions/model-cost/chatgpt-usage.ts)，buildWindowUsagePart、getResetState、pacingColor |
| 窗口识别 | 从 primary/secondary 按报告时长 ±5% 识别 5h／7d，考虑账户匹配；不能把 primary 固定当 5h | chatgpt-usage.ts，pickWeeklyLimit、pickFiveHourLimit |
| quota ratio 与 left | 必须用同一 fetch／响应头的成对读数测量；5h 增长至少 50pp、两个窗口都有正增量且未饱和才更新 ratio；left 将剩余周额度换算为完整 5h 额度个数；无估计显示 estimating… | [quota-estimate.ts](../../../../my-omp-toolkit/extensions/model-cost/quota-estimate.ts)，observeQuotaReading、buildQuotaEstimateSegment；[业务 ADR](../../../../my-omp-toolkit/extensions/model-cost/docs/adr/0001-infer-codex-quota-ratio-from-observed-consumption.md) |
| 测量恢复及并发合并 | baseline 即刻写，ratio 最多每分钟写；新 baseline 优先，已知 ratio 不降为 null；窗口 rollover、过期与时间异常重建 baseline | [quota-estimate-store.ts](../../../../my-omp-toolkit/extensions/model-cost/quota-estimate-store.ts)，createQuotaEstimateStore |
| 命令 | /budget 数字或 K 设置显示预算（无 K 也乘 1000）；0 恢复默认；detail 内存切换；holiday 账户共享、跨重启；clear 清 holiday、归档 DeepSeek，但不清 Codex estimate | index.ts:535–616 |
| UI 与失败 | 余额／额度错误仅显示 widget，不弹通知；命令有反馈；render 不发请求／新 timer／写文档，但旧 buildWidgetLines 会更新 lastContextTokens，迁移必须解除这一耦合 | index.ts，refresh、buildWidgetLines；目标 [backlog](../../../framework/docs/semantic-extension-framework-backlog.md) |

## 观测与刷新链路

| 原生触发 | 旧动作 | 不能混同的职责 |
| --- | --- | --- |
| before_provider_request | 锚定当前请求价格档；刷新 UI | 请求时刻，而非响应结束时刻 |
| after_provider_response | 解析 Codex rate-limit headers，即时更新窗口与估计 | HTTP 元数据不等于 assistant usage |
| assistant message_end | 获取该响应 usage 累加费用；Codex 缓存超过 30s 时异步刷新 API | 工具结果不计；包含仅发起工具调用的 assistant 响应 |
| agent_start | 当前模式初始化、按 TTL 拉取、武装价格边界 timer | 低级 run 启动不一定是新 round |
| agent_end | run 差分、DeepSeek 落盘、当前模式强制余额／额度刷新 | 不能直接换成 framework round_end；willContinue 时仍可能有后续 run |
| session_start/branch/switch/tree | 重置 session token 基线与展示瞬态，模式初始化 | detail／自定义 budget 同一加载期间保留；quota estimate 不随 session 重置 |
| input 的 /model、/models、/switch | 两缓存任一过期就同时预取两数据源 | README 声称各 30s 不重复，但代码会重取尚新鲜的另一个源，需明确保留或改变 |
| 峰谷边界 timer | 自动刷新时段图标，边界 +1ms 后重排 | 不让 render 驱动副作用 |

Codex 主动拉取 single-flight 合并并发；API 失败会更新缓存时间，header 成功即时更新；失败时保留 header 值并附错误。render 路径不请求 API。

## 存储现状

旧目录 `~/.omp/cost-archive`：

- `deepseek-cost.json`：累计、session last* 基线、费用、起止余额及 holiday；clear 产生带时间的归档并开始新周期。
- `codex-usage-estimate.json`：成对 baseline 与 ratio；独立于 DeepSeek clear。
- 所有 mutation 在跨进程锁内重读与业务合并，再临时文件 + rename 原子发布；读按 size:mtime 缓存，损坏时保留最后快照，不能静默写成空数据。
- 旧锁依赖 `@oh-my-pi/pi-utils/file-lock`，不是 harness-neutral 实现；300×50ms 等待预算，Windows rename 有退避。迁移需真正提供通用协调，不把惰性原生 import 搬进共享 framework。
- 用户允许本次新统计从空开始，不要求兼容以上旧文档。旧文件不得自动删除或改写。新路径、格式、账户隔离尚待决策。

## 分层映射与缺口

| 归属方向（charter） | 现状 | 待决定的契约 |
| --- | --- | --- |
| extension shared logic | 计价、窗口／估计、缓存与刷新业务规则、数据 schema 和合并、显示内容 | 全量保留基线；README 缺失的 quota 功能也要纳入 |
| framework 通用 HTTP | 现无公共 HTTP；connect-bot assembly 注入 PushTransport；backlog 曾把 HTTP 归扩展自有 | 请求、取消／timeout、代理输入与错误模型；需同步政策，非 provider endpoint/parser 上移 |
| framework 通用文件 | 现有 config 只读 YAML；业务文件／原子发布／跨进程锁未实现 | 存储根、锁内 update、读新鲜度、损坏与失败；扩展保留合并规则 |
| framework adapter 观测 | HarnessPort 只有 label/diagnostic/session/round/runInitiation/command | 请求开始、HTTP metadata、assistant usage、turn/run 结束及关联身份 |
| framework adapter 事实 | 当前 delivery 不提供 model/provider/catalog price/effort/context/session usage | 事实快照与缺失语义、模型切换及 owner/subagent 统计归属 |
| credential/proxy seam | 源直接访问 modelRegistry、OAuth storage、pi-ai usage provider/proxy/parser | 通用身份与传输事实由谁提供；Codex parser/endpoint 仍是业务集成，不能随便纳入语义 core |
| command/state seam | framework 仅 toggle/direct­ed 与唯一 boolean activation；budget 不是 activation 命令 | 参数、操作与 detail/holiday 状态不能伪装成 directed.unrecognized |
| UI seam | framework marker 仅固定一行激活文本，源 widget 为动态多行与主题布局 | 本次是否扩充框架 UI，或 extension harness presentation；无 UI 业务仍更新 |
| lifecycle scope | session/round handler owner-only，子代理不派发 | 不可照搬门控漏算；orchestration、subagent、恢复/fork 的统计与去重须决定 |

目标权威来源：[架构 ADR](../../../docs/adr/0002-semantic-extension-framework.md)、[术语](../../../framework/GLOSSARY.md)、[协议](../../../framework/core/protocol.ts)、[OMP adapter](../../../framework/adapters/omp.ts)、[能力索引](../../../framework/docs/framework-capabilities.md)、[支持记录](../../../framework/docs/harness-support.md)。

## 本次已执行调查 smoke

直接用 Bun 导入源 `model-mode.ts` 与 `cost-calc.ts`，未挂载扩展、未发网络请求或写统计文件。实际输出：

```json
{"model":{"provider":"deepseek","id":"deepseek-v4-pro"},"mode":"deepseek"}
{"model":{"provider":"opencode-go","id":"deepseek-v4-pro"},"mode":"token-only"}
{"model":{"provider":"openai-codex","id":"gpt-6.1-sol"},"mode":"codex"}
{"model":{"provider":"other","id":"other"},"mode":"hidden"}
{"peak":{"input":9,"cacheRead":0.3,"output":27},"holiday":{"input":4.5,"cacheRead":0.15,"output":13.5}}
```

价格输入时刻为工作日北京时间 09:00。该输出仅证明以上纯逻辑路径，不证明完整 extension、HTTP、OAuth、并发锁、宿主事件或 TUI。本次未执行源／目标全套测试。研究中的 OMP 原生可用性是源码证据，须在验收票选定的实际版本上运行验证。

地图完成后运行了无落盘的 Bun tracker 校验：11 个决策票均 open 且未认领，依赖图无环，55 个本地链接目标存在；唯一初始 frontier 为「完整保留哪些业务行为，统计单位如何命名？」。
