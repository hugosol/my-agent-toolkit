# 账户凭据、provider 地址和代理如何跨 seam 提供？

Type: grilling
Status: resolved
Assignee: hugos（本会话 agent 协助讨论）
Blocked by: 01, 02
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Lighthouse: [账户访问决议](../lighthouse/04-provider-access.md)
Outcome: [按需 adapter 接入、当前单账号访问资料与业务查询 seam](../lighthouse/04-provider-access.md)

## Handoff

- **状态／收束**：2026-10-12 用户对 Q12 结案摘要及发布程序回答「确认」。本票 resolved，仅规划结案；不代表生产迁移／稳定标识／真实 OAuth 或正式基线已验证。
- **唯一权威**：[账户访问决议](../lighthouse/04-provider-access.md)持有 adapter 按需接入、当前资料获取、查询地址与局部失败；原[消费归属的账户主题](../lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)持有单账号／DeepSeek 凭据身份修订。数据／存储使用其当前解释，不保留第二套多账号要求。
- **跨票确认**：`05-http-capability.md` 的[HTTP 部分 Lighthouse](../lighthouse/05-http-capability.md)持有独立配置、多代理／逐请求选择、缺配置直连与运行失败不直连重试；`09-refresh-lifecycle.md` 的[刷新部分 Lighthouse](../lighthouse/09-refresh-lifecycle.md)持有初始化两源并行预取／首次模型请求前收口。两张目标票未改正文、status、assignee 或其他未答范围，本会话不认领它们。
- **本票剩余问题／next**：没有待用户裁决的账户访问原则；下一 frontier 为[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)，先读取已发布代理结果，再讨论最小 request／response、配置／选择 interface、timeout／取消／错误和注入 seam。其余刷新、命令、展示、模型覆盖、装配、验收不因本票结案自动完成。
- **落地输入与既有 owner**：稳定非秘密且跨进程一致的 DeepSeek 统计标识、Codex 可靠账号事实／更换后重新取值、最小 access interface 和 native 接入由[装配决策](10-assembly-layout.md)既有账号解析／dependency injection／模块范围承接；实际账号切换、查询、代理与初始化时序由[验收决策](11-acceptance-cutover.md)承接。具体算法与原生映射是落地未完成，不恢复多账号选择或热检测保证。
- **理由／退役分支**：用户正常各 provider 一个账号，反对为可能的多账号过度设计；即使本地查找廉价也不忽视 interface／状态／验证成本。放弃 DeepSeek 同账号换 Key 识别，接受新统计范围。撤回原生环境变量代理兜底、统一单代理和 Codex 缺代理拒绝；也未批准测速／轮换／故障转移／代理运行失败后直连重试。
- **原交接的仍有效约束**：身份不是 Owner／agent 名称／进程；新操作不重解释旧归属，clear 仅影响当前目标统计范围，不误清其他身份旧数据／Codex estimate。周期、关系与持久化由数据／存储权威提供。同账号多会话／子代理与同机跨进程安全不因单账号取消。旧交接中的混账号全面支持和必须平台账号 ID 要求已被显式收窄，理由／原话在下方证据。
- **证据**：[确认来源与源码核对](../assets/provider-access-confirmation-2026-10-12.md)保存关键原话、目标 filename、源码方法与版本限制；[旧等待探针](../assets/old-observer-waiting-smoke.md)只是旧链路参照。本轮没有新真实 provider、HTTP／OAuth、TUI、账号替换或性能运行证据。
- **追溯结果**：本轮按已发布 User stories／Invariants／依赖回查账户／数据／存储／观察权威及当前决策范围；账号替换与秘密身份由装配／验收、代理与配置由 HTTP／装配／验收、初始化等待由刷新／装配／验收、提示由展示提供，均有现有 owner，无新增未归属 gap，不生成空报告或重复票。初始化首请求等待不等于观察权威的全局保存屏障。上游同 Session 双执行者检测措辞冲突不属于本轮新结论，仍沿观察 Handoff 的既有装配入口处理；不自行裁决。

## Question

在 DeepSeek／Codex 各自单账号、允许前后替换的本次范围内，确定 adapter 如何按需提供当前已生效身份／凭据／provider 地址，framework 如何以小 interface 隔离 native context，model-cost 保留哪些余额／额度 endpoint、parser 与窗口业务。局部访问失败不阻断模型，认证秘密不入日志／tracker／统计；不接入无消费者的账号管理。

原题的多账号选择、OMP 环境变量代理发现和 Codex 无代理拒绝属于被替代探索，不是当前要求。HTTP 的具体代理／传输契约和初始化调度由其 filename 定向确认的原票持有。

## Comments

### 本轮收束与政策修订

完整确认源见[本轮证据](../assets/provider-access-confirmation-2026-10-12.md)。Q1／Q10 确认按需三层职责；单账号支持经用户修正覆盖两 provider 且允许替换；Q3 接受 DeepSeek 凭据身份 tradeoff；Q5 澄清 base URL 不一律硬编码；Q11 确认查询失败独立收口。HTTP／初始化的部分确认及被撤回提案只在其 Lighthouse 发布，不在本票存政策副本。
