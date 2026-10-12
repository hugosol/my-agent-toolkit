# Trace Report: /budget 的参数、操作与状态如何在新框架表达？

## Sources and scope

本轮发布：[命令 Lighthouse](../lighthouse/07-command-state.md)与[确认来源](command-confirmation-2026-10-12.md)。原权威修订为[消费归属](../lighthouse/02-accounting-ownership.md)、[账户访问](../lighthouse/04-provider-access.md)、[数据归属](../lighthouse/12-state-data-contract.md)、[存储](../lighthouse/06-local-storage.md)，功能基线同步消费这些来源，观察契约改为引用现行支持范围而非旧账号隔离承诺。Glossary 的 feedback 补齐 warning，Accounting period 定义不再承诺识别账号或账号独立周期。

本轮事实：[OMP](omp-session-process-model.md)与[pi](pi-session-process-model.md)独立启动实测不同 PID，同实例切会话保持 PID；旧 detail 入口无 provider 检查、已有三类 renderer 读取偏好、hidden 不显示 widget。此为源事实，不是新框架验收。

## Signals and coverage

| 类型 | 从已发布 story／invariant 抽取的信号 | provider／coverage |
| --- | --- | --- |
| intent | budget 前缀、少记 detail 命令 | 命令权威决定；[装配](../decision/10-assembly-layout.md)接线、[验收](../decision/11-acceptance-cutover.md)证明 |
| intent | 纯数据声明、实现分离、不重复解析、不泄漏原生对象 | 现有 defineExtension／binding／adapter 分工，命令权威确定动作路由；装配票冻结 seam／exports／实现注入 |
| intent | 合法／非法输入、完成再返回、统一异常、warning | 命令权威确定规则；装配／验收已覆盖框架公共能力与各模式命令 |
| intent | 当前入口 Round／保存收口、idle、未知不猜 | [观察权威](../lighthouse/03-observation-contract.md)提供可靠活动／重读事实；业务保存状态由数据／存储提供；装配接线并验收 |
| intent | detail 不强迫全部 provider usage UI | [展示](../decision/08-presentation.md)、[模型覆盖](../decision/13-model-catalog-policy.md)已有问题；无 UI 远端调度由展示／[刷新](../decision/09-refresh-lifecycle.md)持有，未提前批准 |
| intent | provider 单一统计范围、不存账号／Key、当前认证 | 消费归属与账户访问原主题已按用户 Q13–Q15 修订，未创建第二份政策 |
| intent | 多 CLI 正常并发、旧提交不复活 | 存储 Q7／Q8／Q24／Q26 既有协调保留；来源含真实多进程探针，不把单账号当单进程 |
| intent | 整文件归档／重置、零消费同流程、不误清独立 estimate | 存储 Q13／Q15 已修订；数据逻辑范围同源；物理替代 schema 存在下述未收口项 |
| pattern | declaration → binding → adapter registration；旧 toggle／directed | 现有能力被引用但语义未改；不要求旧插件改成新 actions；共享反馈扩展的回归属于装配／验收，未另开重复票 |
| pattern | FeedbackTransport／publishNotice、UI／stderr、handler 失败捕获 | 公共通道已存在；新增 Promise 等待及错误承接由装配与验收完成，不复制打印 module |
| dependency | 当前 provider、实际 Session／Round、保存完成事实、有效 JSON、安全更新 | 观察／访问／数据／存储都有具名原权威；代码尚未实现并非新的规划缺口 |

## Confirmed upstream gap and assigned follow-up

**取消账号键后的物理 schema 尚未收口。** 用户 Q13–Q15 明确取消 accounts／providerAccountId、账号独立分区，批准整文件 clear；它使存储原 Q25 的具体账号布局失效。但用户未决定替代布局：provider／模型口径放在哪里，periodId／holiday／sessions 是全文件还是 provider 分桶，以及 reset 对完整消费聚合的具体表示。

- 原 provider：[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)的 Q25，用户 Q21 已授权仅恢复物理布局问题，源票现 open、未认领；本轮未处理或解决该票。
- 新权威状态：只撤销已确认取消的账号结构并保留其它安全规则，明确替代结构未批准；未擅自选择扁平或分桶结构。
- 受影响输入：命令的归档／重置实现及装配的最终物理模型。装配不能把早期 source Handoff 的“Q25 已冻结”当新 schema；实际读本轮原 Lighthouse。
- 已裁决／handoff：用户“Q21 可以”授权存储原题仅对 Q25 定点重审，以不新增账号处理、保留多 CLI 协调与 whole-file clear 为约束，其他 Q5–Q24／Q26 不重开。[原票当前 Handoff](../decision/06-local-storage.md#handoff)已记录唯一 ready 问题，后续独立会话处理。

## Disposition and follow-up

- 未发现需要另开票的路由／反馈／展示或全局账号管理缺口；现有装配、验收、展示、刷新、模型覆盖问题已经持有其范围，仍未决，不宣称输入已实现。
- 身份隔离／target-account clear 与新政策的旧冲突已回原权威处理；保留历史快照，不把消费者的历史交接当有效政策。除用户明确授权的存储 Q25 恢复外，本轮未同步改写消费者 ticket 的 Handoff 或 claim。
- Q25 已按用户授权恢复原题，不新增重复 schema 票。命令语法／效果／门控／反馈的决策范围已完整确认，所依赖的整文件操作语义也已发布；字段编码未定是原存储题的独立跟进，不能据此重问命令政策。命令票 resolved、清理 claim，不宣称存储依赖对装配已全满足。
- 本轮 trace follow-up 已完成：唯一确认缺口有原题 owner 与恢复点，没有未分配 batch 或待授权冲突；物理 schema 本身仍未解决。地图未完成，装配依赖继续受开放存储票阻挡，不做生产修改。
