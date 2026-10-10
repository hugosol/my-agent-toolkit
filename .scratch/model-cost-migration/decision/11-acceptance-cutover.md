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

## Handoff from partial storage decision

[存储组织与唯一消费源局部决议](../lighthouse/06-local-storage.md)确认消费单活动 JSON、独立归档和独立 Codex estimate；Session 自身累计与最近轮快照来自同一聚合，round_end 同次保存。聚合／schema／保存模型属于 model-cost，framework 文件 module 仅提供安全更新，其他 extension 可采用不同模型。具体 schema、协调、保存完成／失败、clear 一致性仍待存储票，不把该局部结论视为整个依赖已满足或生产能力已实现。

## Handoff from storage Q5

[存储局部决议](../lighthouse/06-local-storage.md)确认提前提交非阻塞保存、独立逻辑继续、handler 完成前等待结果。验收覆盖稳定快照不被后续内存修改、正常及异常返回无脱离保存任务、保存拒绝有接收；不将 Promise 包同步 I/O 当作非阻塞证明，不承诺未测量的重叠耗时收益。失败反馈与同文件协调仍待存储票。

## Handoff from storage Q6

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。

## Handoff from storage Q7

[存储局部决议](../lighthouse/06-local-storage.md)Q7 已确认：验收同进程同文件按提交顺序更新、一次失败不阻断后续、不同文件不统一排队、空闲协调记录释放及跨进程互斥下重读／合并／原子发布；不要求全局 FIFO。现有纯 Promise 探针仅说明轻量机制，不取代实际文件／多进程／平台证据。

## Handoff from storage Q8 / Q9

[存储局部决议](../lighthouse/06-local-storage.md)Q8／Q9 确认：并发保存保留其他会话／账户，旧周期／旧版本不能覆盖，同版本同快照重复不追加；等待超时或取消后即使锁后来释放也不能写入，读改写开始后不表面超时脱离实际结果。resume 版本、同版本内容冲突、单执行者、预算值及 clear 多文件一致性仍待后续决定，尚无生产验证。

## Handoff from storage Q10 / Q12

[存储局部决议](../lighthouse/06-local-storage.md)Q10／Q12 确认默认排队＋取锁合计 15 秒、可覆盖、超时不迟到写入；同版本异内容保留磁盘并报告冲突，不相加／最后覆盖／取最大值。不是文件操作硬超时；Q11 恢复语义待澄清，不当成已满足契约。

## Handoff from storage Q11 confirmed

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。

## Handoff from revised failure policy

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。 验收普通失败丢弃未保存部分、基线恢复与后续新消费，不再测试旧失败保留内存政策；文件竞争与正常消费仍需实际路径证据。

## Handoff from storage Q13 / Q14

[存储局部决议](../lighthouse/06-local-storage.md)Q13／Q14 已确认：归档失败不重置／不关 holiday，重置未提交报告失败且不自动补做，允许残留失败备份但不恢复合并；实际活动提交才成功。基线不可读暂停消费统计／保存而模型与独立余额／额度不自动停用，下次正常初始化再加载，不补暂停期消费。不要求未批准事务日志／后台恢复。实际文件／多进程路径仍需实施验收。

## Handoff from storage Q15

[存储局部决议](../lighthouse/06-local-storage.md)Q15 确认 clear 的输入仅锁内最新已保存数据；验收磁盘 1.20、内存另有未保存 0.10 时只归档 1.20，并丢弃 0.10，即使响应已完成也不强制排空／补账。不要求跨进程内存收集或复杂恢复；跨进程新请求正常接入仍依赖后续机制，不把已批准 clear 损失扩大为正常并发丢失。

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

