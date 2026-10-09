# 什么证据才算完整迁移，如何安全验收并切换？

Type: grilling
Status: open
Assignee:
Blocked by: 10
Prerequisites: [确定的新能力与 model-cost 如何组织、声明和装配？](10-assembly-layout.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- 验收以[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)的有意简化替代旧交接的历史 Round 查询／补账／持续完整性要求：聚合＋最近快照、tree Round 不可用、resume 本周期、接受未成功保存的强杀损失；不按旧测试反向要求完整账本。
- 覆盖正常结束重复通知、实际重发、已处理身份不在 round_end 清空、旧实例隔离；失败／取消可靠 usage 入账，无 usage 跳过；有 usage 缺价只缺费用且不猜补，Codex 参考缺价不影响额度。
- 覆盖真实父子／孙关系恢复、启动轮筛选、迟到旧子不污染当前轮、混模型／账户归属与 no double count；不能把已有零 usage fixture 作为真实非零账单证明。
- 覆盖账户 clear 归档／reset／关闭 holiday（空消费也关闭）、之后 resume 不读回旧归档、clear 前在途丢弃／之后旧子新请求正常统计；其他账户／已有归档／Codex estimate／detail 不误清；旧排队保存不能复活已清数据。具体并发／失败验收依赖存储及命令机制，不宣称已通过。
- 覆盖预算修改移除与固定显示／告警保留、入口 detail 的切换／tree 保留与重载 brief、只读 renderer；新统计从空开始、旧文件不删除和 OMP 正式基线继续约束。

## Question

定义完整迁移的可观察验收：真实宿主请求／响应／多 Turn／工具执行／Round 事件关联、计价边界、模型切换、各模式命令、headless 更新、renderer 无业务副作用、跨进程存储、安全失败、真实余额／Codex 额度与视觉 TUI。

明确使用框架当前 18.5.0 基线还是显式选择其他版本；不能把当前安装版本或源码检查当验证。哪些自动 smoke、哪些需要凭据或用户交互？如何分离框架升级报警与扩展业务回归，并处理旧测试中实现细节断言？

确定新统计从空开始的验收、保留旧文件、原新实现加载互斥、正式配置与进程重启的用户动作、切换失败回退及完成记录。图外实施必须完整交付，不以 scaffold／测试 green 宣称完成。此票输出验收与切换标准，不修改正式配置或执行切换。

## Trace handoff

来源：[行为契约决议](../lighthouse/01-behavior-contract.md)。验收必须区分逐响应计价正确与统一 Round 边界正确。覆盖工具指令／工具结果输入、自动续跑、跨峰谷费用求和与恢复信息不足；对照冻结 source oracle 验证保留行为与每项用户确认的有意改变。覆盖 Codex 双窗口、ratio／left、命令／累计／分段条基线，不把无 UI 远端刷新策略或最新模型名单视作既定规则。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 验收交接：逐个区分主会话自身与每个子代理，覆盖嵌套／异构子代理、orchestration 请求与汇总不双计；模型／账户切换不重解释旧请求。
- 覆盖取消后修改重发（可靠 usage 入账、无 usage 提示跳过）、旧子新消费原启动归属、重复通知、乱序及观察票将决定的已知冲突规则；崩溃仅读成功保存聚合、接受未落盘损失，不猜历史价格、不补账、不把跳过解释成免费。
- 覆盖 resume／switch／tree／fork、tree 后该位置 Round 不可用、恢复仅最近快照，Session 本周期跨路径不回滚；账户 clear 显式归档重置，resume 不恢复旧归档；覆盖多 main 同进程、多进程同账户并发增量不丢失／不重复／不覆盖、不同账户隔离、同 session 第二执行者拒绝与正常恢复。
- 覆盖计费金额／额度消费／无统计口径／未知的领域区别及缺失提示／跳过边界，不强制持续完整性状态或缺失计数；Codex 美元仅参考，账户额度不分摊给 Session，上下文不跨代理累计；clear 并发场景在命令与存储契约确定后验收。以上是验收要求，不是本次已运行的生产证据。

