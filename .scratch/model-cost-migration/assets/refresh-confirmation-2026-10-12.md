# 刷新生命周期确认与证据

> 对应 [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)。这是确认来源及事实资产，不是另一份政策权威。最终政策只在 [刷新 Lighthouse](../lighthouse/09-refresh-lifecycle.md)；发布前恢复点见 [历史](refresh-before-publication-2026-10-12.md)。

## 确认来源

本次 wayfinder 访谈从用户「请开始ticket09」开始，工作票先 claimed，最终用户对 Q21 的整票草案回答「确定」，授权本次结案发布。没有可用的会话永久 locator，以下保留决定相关原话及问题含义；按本轮 Q 编号查找，而非跨会话编号。

- Q1–Q3：用户确认按实际 provider 的响应活动更新、展示效果不阻塞 agent、保留最近成功读数。原话：「usage返回的时候已经绑定了余额/额度更新，所以不需要其他主动刷新机制」「展示用的组件不应阻塞agent功能」。usage 是消费触发事实，不等于查询接口必成功；独立查询仍可能失败，用户选择不为此设计额外失败冷却／重试。
- TTL：用户要求「TTL门控时长可以分别配置，DeepSeek为30s，codex为20s」。这是后续 Codex 简化之前的选择；DeepSeek 默认 30s 可配置保留，Codex 20s 查询限频由 Q11 明确取消。
- Q6：用户明确「这个初始化的节点是‘CLI启动’，我需要adpter提供这个时间点的事件给我，切模型，会话这些都不清缓存，不重新全量预取」。初始化所有已配置 provider，独立 CLI 独立缓存，同 CLI 子代理不各自全量初始化；首次模型请求前查询收口消费先前已确认的 [初始化来源](provider-access-confirmation-2026-10-12.md)。
- Q7–Q8：用户曾提出 headers／API 共享成功读数 TTL、API 作兜底；失败「不进入限制」，希望不为极端情况扩建设计。header/API 运行期兜底是随后替代的讨论，不是最终规则。
- Q11：用户提出「usage时仅从header获取，api只负责初始化获取」。agent 明确说明取消 Codex 运行期 API 兜底及 20s 限频、headers 缺失保留旧读数且不补查，用户回答「采用」。
- Q12／Q15：用户指出「不能等两个额度都返回才更新」，询问单窗口与 Pro 5h 限制。agent 撤回双窗口齐全才更新的建议，提出 5h／7d 独立接纳、缺失保留旧值及其时间，不将 missing 推成无限或套餐无此限制；ratio/left 的新采样只取同一次报告双窗口、不拼新旧。用户回答「Q15 同意」。
- Q13：用户确认「无UI运行同样逻辑」。保留初始化两源、DeepSeek usage TTL 查询、Codex headers 与 estimate 业务；不创建 widget／绘制工作。错误承载消费 [展示权威](../lighthouse/08-presentation.md#无-ui-记账与公共错误反馈)，未批准 UI 查询错误弹通知。
- Q16–Q18：用户要求跨界自动重绘，指出多窗口不稳定；明确「当时就是因为不想用轮询才选择timer方案」。agent 撤回固定节拍／取消 timer 的提案，提出 CLI UI 实例级单一下一边界 timeout，与会话／模型解耦、不捕获旧 ctx，当前前端读取当前查看会话；销毁清理、无 UI 不建。用户回答「同意」。多窗口根因未复现，旧 context 捕获仅调查方向，不宣称修复。
- Q19：用户「同意」仍有效实例的余额查询跨会话／模型／tree／消费 clear 更新 provider 缓存；不复活已清消费、不新增账号身份隔离，不把查询开始时 ctx 当当前 UI 目标。
- Q20：用户「同意，查询不阻塞结束」。实例销毁后不接纳旧结果、不反馈或重绘；CLI 结束不等远端，不增 HTTP 主动取消；DeepSeek 5s、Codex 初始化 10s 预算沿用。
- Q21：agent 展示六部分完整决议：CLI 单次初始化；DeepSeek usage TTL 与 Codex header-only；成功 TTL／在途合并／失败不冷却；窗口独立展示与同报告成对估计；实例失效／无 UI／退出；单一峰谷 timer。用户回答「确定」。完整语义由 Lighthouse 持有，本资产不复制规则表作为第二权威。

## 源码证据

### 刷新与窗口

[旧刷新调度事实](refresh-scheduling-facts.md)是本次复用的源码调查，不是新行为已实现的证明。旧 extension 的 `chatgpt-usage.ts`：

- `fetchChatGPTUsageSnapshot`（224–301）从单个 API report 选取 5h／7d，各自映射 source=api 或 missing。
- `parseChatGPTUsageHeadersSnapshot`（726–753）从同一响应 headers report 选取窗口；无 report 返回 null，有一窗则另一窗可 missing。
- `pickWeeklyLimit`／`pickFiveHourLimit`（325–346／360–381）按 primary/secondary 主额度窗口的报告时长识别，并非 primary 固定 5h、secondary 固定 7d；不按套餐推断窗口存在。
- OMP `parseCodexRateLimitHeaders` 解析 `x-codex-{primary,secondary}-used-percent`、`window-minutes` 与 `reset-at`；任一窗存在可产出报告，两个都没有返回 null。API 与 headers 都用主额度窗口构造逻辑，不证明远端真实数值或时刻完全一致。

### 初始化与展示

当前 repo `framework/adapters/omp.ts` 的原生 `session_start` 映射 `initial`；`framework/core/protocol.ts` 的 initial 指该 binding 本进程启动首次服务的会话。源码是可复用入口线索，不证明新两源初始化和首请求等待已实施；其真实调用与认证时序交装配／验收。

旧 extension `index.ts`：`scheduleBoundaryRefresh`（455–470）持有 ctx、到点 refresh 再 arm；`initializeForModel`（476–507）每次会话／活动初始化重新 arm；`refresh`（348–374）注册的 renderer 也捕获 ctx。因此旧 ctx 可能与当前查看会话错位是合理调查方向，但多窗口实际根因未复现。宿主 TUI requestRender／scheduleRender 是已有重绘请求的调度，不是空闲自动时钟保证。

## 本次实际运行

### 双通道隔离协议实验

命令：`bun .scratch/omp-probe/quota-source-probe.ts`，最终 exit 0。脚本已清理，没有添加永久测试或修改旧 extension。

运行实际旧 extension 转换函数与 `.cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-ai/src/usage/openai-codex.ts` 的实际 parser/provider；注入的是本地 transport 与虚构认证资料，不是伪造 parser 的返回值。Bun loopback 随机端口提供协议 fixture，所有 HTTP 指向本地；API provider 发出的 `/backend-api/wham/usage` 和可选 `/backend-api/accounts/verified_access` 均被隔离，后者 404 不影响主额度转换。

| 输入 | API | headers |
| --- | --- | --- |
| 完整 fixture | 5h=24%、7d=61%，各 reset 时间 | 同一 fixture 的对应百分比与 reset 时间一致；source=header，API source=api |
| 只有 5h | fiveHour ok、weekly missing | fiveHour ok、weekly missing |
| 空 headers | 不适用 | null |

断言覆盖百分比、reset、来源、单窗口缺失与空 headers，全部通过。此实验只能证明协议／转换行为；不能证明真实账户同源、每次响应字段齐全、真实服务端值一致或时序。首次尝试从本地 OMP checkout 导入 provider 失败（未构建 pi_natives）；随后改用固定 18.5.0 安装成功，没有复制／构建原生 addon。

### 峰谷端点实验

命令：`bun .scratch/omp-probe/peak-boundary-probe.ts`，exit 0，旧 `isPeakHour`／`nextBoundary` 实际执行；脚本已清理。

- 北京时间工作日 08:59:59 谷、09:00 峰、12:00 峰、12:00:00.001 谷、14:00 峰、18:00 峰、18:00:00.001 谷；周日 10:00 谷，断言全部通过。
- 按旧边界延迟公式，12:00／18:00 端点的下一唤醒 delay=1ms；08:59:59 的 delay=1001ms。周末旧代码仍可能安排无变化的边界唤醒，不宣称新版已优化。
- `resolvePriceTier` 与 `anchorRequest` 源码证实请求开始锚定费率，展示 timer 不负责计费切档；本次没有运行新计费链路或新 UI timer。

## 外部资料限度

实际读取 [OpenAI 帮助页](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)，其说明套餐／窗口取决于当前限制，未给出足以确认本次 Pro 5h 适用性的完整当前表。官方开发者 pricing 页返回 403，迁移定价页访问超时；搜索结果含 Pro 暂无 5h 的二手说法，不提升为正式证据。最终设计按实际报告窗口处理，不硬编码 Pro 必定有或没有 5h。

## 未运行／未证明

无真实 provider／OAuth／账单查询、新 framework HTTP、完整 CLI 初始化屏障、新 shared logic、多主／子并发刷新、真实多窗口 TUI、休眠恢复、销毁迟到结果或生产迁移验收。本次证据不升级 OMP 18.5.0 支持基线；不认证 pi。该票结案是决策完成，不是这些能力已交付。
