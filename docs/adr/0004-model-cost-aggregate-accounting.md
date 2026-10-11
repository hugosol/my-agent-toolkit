---
status: accepted
---

# model-cost 采用扩展自有聚合，而不是通用业务账本

model-cost 选择在 harness-independent shared logic 中逐响应按请求锚价计算、按实际会话独立聚合，并在 framework `round_end` 触发保存；每个会话只保留最近 Round 的开始／结束累计快照，不建立历史 Round／Turn 明细账。它以无法查询历史轮次、异常退出可能丢失未落盘消费，以及缺 usage／价格时只提示并跳过对应指标、不维护缺失计数或补算记录为代价，换取接近旧方案的复杂度与交互开销；这些是 model-cost 的业务取舍，不是所有 extension 必须采用的框架政策。Round、response usage、实际会话及父子关系通过 framework 的宿主无关接口提供，adapter 映射原生事实，其他 harness 复用同一 shared logic；不为本方案升级通用业务 State，也不让 UI 维护另一套权威累计。

## 子代理汇总的进一步简化

本次用户放弃父 Round 含子消费口径，保留直接父 Session 关系与自身聚合；不再为追加任务、在途切界或迟到响应维护父 Round 启动标签／消费归属段。代价是不能查看某个父 Round 包含哪些子消费，收益是同一子会话持续执行仍可用稳定关系汇总 Session，不需要第二套分配数据。各实际会话自身 Round 与保存行为保留；上下文分支选择不撤销实际发生的 Session 消费。批准修订、唯一规则与原话在[数据归属 Lighthouse 的逐代理主题](../../.scratch/model-cost-migration/lighthouse/12-state-data-contract.md)，旧规则保留在[修订前历史](../../.scratch/model-cost-migration/assets/observation-revisions-before-pause-2026-10-11.md)。

## 账户周期与恢复

只保留账户级 clear：归档目标账户的活动聚合并重置，成功时关闭该账户 holiday。Session 累计为该账户本周期内该会话跨各 Round 的消费，Round 累计仅属于该轮；普通 resume 恢复已保存活动聚合，clear 后不合并旧归档、不按宿主历史 token 以当前模型／费率重算，不维护跨周期 Session lifetime total。旧值保留在归档，clear 前在途消费允许丢弃，后续新请求正常统计；以此换取直接的重置／恢复模型。其他账户、已有归档、Codex quota estimate 与入口 detail 不随该账户消费清理删除。物理更新与成功／失败边界仍由存储及命令票收口。

## 账号接入的进一步简化

本次用户选择按实际单账号需求接入 adapter，而不实现多账号管理，并接受 DeepSeek 凭据身份的限制，以无法自动识别同账号换 Key 为代价减少账号识别机制。唯一支持范围、身份规则与旧到新修订在[消费归属 Lighthouse 的账户主题](../../.scratch/model-cost-migration/lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)，接入 seam 在[账户访问 Lighthouse](../../.scratch/model-cost-migration/lighthouse/04-provider-access.md)，确认原话在[本轮证据](../../.scratch/model-cost-migration/assets/provider-access-confirmation-2026-10-12.md)。本 ADR 不改变 Provider account 的领域定义，不以单账号取消同账号多会话／跨进程协调。

## 概念与实现承诺

[framework glossary](../../framework/GLOSSARY.md#facts-and-measurement-semantics)定义未知、无统计口径、确认零、指标完整性与已知小计，供各 extension 分析边界；术语存在不要求实现对应枚举、计数或恢复机制。[model-cost glossary](../../extensions/model-cost/GLOSSARY.md)只定义消费领域的专有含义，不用词义定义承载本次取舍。跳过费用不代表实际免费，已知小计不承诺覆盖 provider 的全部收费。

## 决议范围与溯源

本 ADR 记录用户确认的聚合架构取舍与理由；[数据归属与账户周期 Lighthouse](../../.scratch/model-cost-migration/lighthouse/12-state-data-contract.md)现为本票最终决议及历次暂停的完整溯源。数据票已 resolved，但迁移尚未实现；详细边界、替代关系与未决落地契约以正式 Lighthouse 及其具名交接票为准。它不改变已有账户隔离、正常响应去重、主／子代理分别统计或并发正确性要求；运行期请求详情／去重标记的寿命已确定；存储格式、保存等待／失败、可靠原生身份／实例隔离映射及最终 UI 布局仍由对应票决定。framework 的分层与 native import 责任继续遵循[语义扩展框架 ADR](0002-semantic-extension-framework.md)，本次只落地 OMP，不实现或认证其他 harness adapter。
