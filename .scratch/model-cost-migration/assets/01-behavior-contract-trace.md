## Trace Report: 完整保留哪些业务行为，统计单位如何命名？

来源：[行为契约决议](../lighthouse/01-behavior-contract.md)。已加载 map、全部原有决策票与本图唯一 lighthouse；两张新增票纳入复核。用户已确认将后续未决问题交由具名票承接，本轮只解决行为契约，不代答其他票。

### Intent gaps

- **Missing dependency**: “State 数据保存／声明与读取” → 原 assembly 票仅禁止冒用 boolean，并未拥有通用数据 State 的决策。已创建 [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)，保持 open；存储、命令、展示、刷新与装配票连接到它。
- **Missing operational surface**: “provider 分层不变，模型名单持续维护” → 原观测票拥有模型事实，未拥有支持名单与更新政策。已创建 [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)，保持 open；装配票等待它。

### Layer gaps

- **Missing prerequisite**: 文件存储／刷新／命令票涉及业务数据，却未先决定 State 与自有数据边界 → State 数据契约票已承接并加依赖，State 本身不等于文件持久化。
- **Missing prerequisite**: 最终装配需要支持名单与维护来源 → 模型名单票已承接并加依赖，不凭当前源 ID 冻结支持范围。

### Layer violations

- **Wrong layer**: 原观测票题目与 Question 有 Run 结算，易将原生边界当公共语义 → 已改为 Turn／Round 观测及工具执行，原生事实只作 adapter 映射输入。
- **Wrong layer**: 原展示票把无 UI 全量更新写成既定要求 → 已改成待决定问题，保留响应记账原则；无 UI 远端刷新由刷新／展示票共同明确。
- **Wrong layer**: assembly 的 boolean State 限制不应代替数据能力契约 → 独立 State 票承接公共能力，assembly 只映射已确定契约。

### Peer asymmetry

- **Missing from model-cost**: 通用 YAML／State 如何使用；connect-bot 有配置与激活字段，但不足以定义 model-cost 的业务数据 → State／刷新／名单票承接，既有配置机制不复制。
- 公共代理活动语义与 connect-bot 状态映射 → 观测票已有 handoff，未授权直接修改面板协议；消费者迁移影响仍由装配票及地图原 fog 推进。

### Covered signals and outcomes

| Intent / pattern signal | Decision owner | Recorded outcome |
| --- | --- | --- |
| 官网对照、逐请求计价、价格锚定、工具输入与去重 | [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) | 已追加场景与契约 handoff，未解决 |
| Turn／Round／Session 累计、子代理／orchestration、tree／恢复、跨峰谷历史价格不足 | [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md) | 已追加精确归属和不重算原则 |
| Request／response／工具／Round、代理状态、实际 Effort 与上下文 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md) | 公共术语与真实边界交接已记录 |
| provider account、鉴权／endpoint／代理 | [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md) | 原 Question 已覆盖，未新增承诺 |
| HTTP／timeout／取消、既有 PushTransport 对齐 | [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md) | 原 Question 已覆盖，无新增重试 |
| Codex 成对测量、ratio／left、窗口变化与存储恢复 | [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md) | 保留规则及数据寿命已有 handoff |
| 双窗口节奏／重置／宽度、累计分段条、告警、错误与 UI 标签 | [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) | Q9/Q10 视觉与取舍已有 handoff |
| budget 数字／K／0、detail／holiday／clear、反馈 | [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md) | 原行为基线与用户确认门槛已记录 |
| 旧文件不变、新统计根、累计归档、并发 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md) | Q10 数据与取舍已有 handoff |
| 事件更新、TTL 与限频、跨源、无 UI、YAML | [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md) | 不把 30s／独立 TTL 或 A/B 提议写成批准规则 |
| glossary 唯一权威、配置／能力声明复用、消费者责任与原生 import 边界 | [确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) | 原 Question 已覆盖，接入 State 与名单依赖 |
| source oracle、版本基线、真实请求／额度／TUI、完整验收与切换 | [什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) | 已追加有意改变与保留行为的验收区别 |

### Completion

两个已确认缺口已创建决策票，其余交接复用现有票；无未归属、需要额外 mode prompt 的问题。本轮不把 ticket handoff 当成已解决决策。地图原 fog 保留：竞态、缺观测降级、账户基线隔离和消费者影响仍需相关契约推进；新 State／名单问题此前未在 fog，故不删除其他 fog。
