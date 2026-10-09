# 什么证据才算完整迁移，如何安全验收并切换？

Type: grilling
Status: open
Assignee:
Blocked by: 10
Prerequisites: [确定的新能力与 model-cost 如何组织、声明和装配？](10-assembly-layout.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

定义完整迁移的可观察验收：真实宿主请求／响应／多 Turn／工具执行／Round 事件关联、计价边界、模型切换、各模式命令、headless 更新、renderer 无业务副作用、跨进程存储、安全失败、真实余额／Codex 额度与视觉 TUI。

明确使用框架当前 18.5.0 基线还是显式选择其他版本；不能把当前安装版本或源码检查当验证。哪些自动 smoke、哪些需要凭据或用户交互？如何分离框架升级报警与扩展业务回归，并处理旧测试中实现细节断言？

确定新统计从空开始的验收、保留旧文件、原新实现加载互斥、正式配置与进程重启的用户动作、切换失败回退及完成记录。图外实施必须完整交付，不以 scaffold／测试 green 宣称完成。此票输出验收与切换标准，不修改正式配置或执行切换。

## Trace handoff

来源：[行为契约决议](../lighthouse/01-behavior-contract.md)。验收必须区分逐响应计价正确与统一 Round 边界正确。覆盖工具指令／工具结果输入、自动续跑、跨峰谷费用求和与恢复信息不足；对照冻结 source oracle 验证保留行为与每项用户确认的有意改变。覆盖 Codex 双窗口、ratio／left、命令／累计／分段条基线，不把无 UI 远端刷新策略或最新模型名单视作既定规则。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 验收交接：逐个区分主会话自身与每个子代理，覆盖嵌套／异构子代理、orchestration 请求与汇总不双计；模型／账户切换不重解释旧请求。
- 覆盖取消后修改重发（有 usage 入账、无 usage 未知零贡献）、迟到补齐、乱序、重复通知、已知数据冲突、崩溃恢复与无可靠历史价格；不将未知当免费或为补账自动重发。
- 覆盖 resume／switch／tree／fork、选中 Round 中途节点显示完整历史 Round、Session 跨路径不回滚；覆盖多 main 同进程、多进程同账户并发增量不丢失／不重复／不覆盖、不同账户隔离、同 session 第二执行者拒绝与正常恢复。
- 覆盖计费金额／额度消费／无统计口径／未知可组合状态及各指标完整性，Codex 美元仅参考，账户额度不分摊给 Session，上下文不跨代理累计；clear 并发场景在命令与存储契约确定后验收。以上是验收要求，不是本次已运行的生产证据。

