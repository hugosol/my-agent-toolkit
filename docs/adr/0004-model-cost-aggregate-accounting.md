---
status: accepted
---

# model-cost 采用扩展自有聚合，而不是通用业务账本

model-cost 选择在 harness-independent shared logic 中逐响应按请求锚价计算、按实际会话独立聚合，并在 framework `round_end` 触发保存；文件只记录 Session 自身聚合与直接父关系；最近一 Round（进行中或刚结束，进行中尚未产生数据时保持上一轮读数）的连续对话展示通过运行期信息推断，不持久化最近轮快照，resume/tree 只要求 Session 恢复，不建立 Round／Turn 明细账。它以无法查询历史轮次、异常退出可能丢失未落盘消费，以及缺 usage／价格时只提示并跳过对应指标、不维护缺失计数或补算记录为代价，换取接近旧方案的复杂度与交互开销；这些是 model-cost 的业务取舍，不是所有 extension 必须采用的框架政策。Round、response usage、实际会话及父子关系通过 framework 的宿主无关接口提供，adapter 映射原生事实，其他 harness 复用同一 shared logic；不为本方案升级通用业务 State，也不让 UI 维护另一套权威累计。

## 子代理汇总的进一步简化

本次用户放弃父 Round 含子消费口径，保留直接父 Session 关系与自身聚合；不再为追加任务、在途切界或迟到响应维护父 Round 启动标签／消费归属段。代价是不能查看某个父 Round 包含哪些子消费，收益是同一子会话持续执行仍可用稳定关系汇总 Session，不需要第二套分配数据。各实际会话自身 Round 与保存行为保留；上下文分支选择不撤销实际发生的 Session 消费。唯一规则（用户 Q27 确认）：子代理消费只汇总到父 Session，不分配到父 Round；Round 汇总只统计本实际会话自身请求，子代理保留自身 Round 与 round_end 保存，其消费沿直接父 Session 链参与父 Session 自身／含后代口径且每笔响应只计一次。旧规则要求的父 Round 启动标签、启动实例身份，以及同一子会话复用时的消费归属段，已随本次修订取消，仅作历史记录；修订前的完整规则不再作为有效要求。

## 账户周期与恢复

消费活动数据集中在一份本地 JSON（consumption.json）；清除为整份归档／重置，不再按账号清理，先归档后提交、失败终止。动作触发条件（2026-10-11 批准）：holiday 与 clear 仅在当前 provider 为 DeepSeek 时可执行；当前入口 Round 未结束，或结束后保存处理尚未收口时直接拒绝，不排队、不在未来 round_end 自动执行；既有会话只要当前入口可靠 idle 且无待完成保存即可执行；活动状态不能可靠判断时按错误拒绝，不猜 idle。普通 clear 归档完整活动 JSON 并重置，新活动 holiday=false；首次开启 holiday 复用同一归档／重置流程，新周期直接 holiday=true，影响所有 harness／provider 的消费累计，但不先 clear(false) 再单独开启，也不清独立 Codex estimate、旧归档或 detail；已开启时幂等提示，不重复归档／重置、不反转、不新增 off。有效零消费同样归档／重置。Session 累计限当前消费统计周期，Round 仅运行期推断：resume 仅读取本周期已成功保存的 Session 聚合，不合并归档、不重估、不维护 lifetime。旧账户定点 clear、按账号分区，以及「最近 Round 快照随 round_end 保存、resume 可展示已保存最近轮」均为已替代历史。

本轮用户要求自己划定轻量文件保存范围，以放弃轮次恢复换取 Session-only；provider／model 分桶仍保留。物理结构：根为 schemaVersion、periodId、start、可选 start_bal、holiday 与 harnesses.<harness>.sessions 扁平 list（harness 优先，而非 sessions.<harness>）；Session 记录为 id、name、parent、saveVersion 与 own.<provider>.<model>，token 分 input／cacheRead／cacheWrite／output 四桶，DeepSeek 金额 costCny 与 Codex 参考费用 referenceCostUsd 分开保存；parent 为同 harness 内直接父 Session ID，主会话为 null，树与含后代合计按关系派生，不保存 totalCost／totalTokens，也不保存 recentRound、Round／Turn 明细或轮次快照。Round 只在运行期推断：进行中 = 当前自身累计 − 开始快照，已结束 = 结束快照 − 开始快照；正常连续对话要求显示最近一 Round（进行中或刚结束，进行中尚未产生本轮数据时保持上一已完成 Round 读数、不显示 0），resume／tree 只要求恢复当前周期的 Session 自身／子代理／含后代消费；缺可靠快照时隐藏 Round，不扫描历史、不补账、不猜零。保存时机仍为 framework round_end。

## 账号接入的进一步简化

本次用户选择按实际单账号需求接入 adapter，而不实现多账号管理，并接受 DeepSeek 凭据身份的限制，以无法自动识别同账号换 Key 为代价减少账号识别机制。唯一支持范围：framework 每 provider 只支持一个使用中的账号，不提供账号列表、选择、轮换或持久化统计身份；model-cost 不按 Key／凭据指纹／Codex 账号身份分区统计、holiday 或 estimate；同账号换 Key 不自动开始新范围，真正换账号也不自动识别、隔离或重置旧数据，用户需自行开始新数据。接入 seam：adapter 按需提供宿主当前 provider、本次操作可用认证资料与已解析 base URL（隐藏 OAuth 更新与 credential storage），每次操作读取并固定用于本次操作，只供运行期认证、不写入统计文件；DeepSeek 余额路径与缺省官方地址、Codex 额度 endpoint／协议与 parser 留在 shared logic。本 ADR 不改变 Provider account 的领域定义，也不以单账号取消同账号多会话／跨进程协调：多 CLI 同机并发仍是支持范围，跨进程锁、周期与版本校验不变。旧到新修订：原按账号／非秘密凭据身份隔离、替换身份即启用独立周期与数据的政策已被本单账号范围取代。

## 概念与实现承诺

[framework glossary](../../framework/GLOSSARY.md#facts-and-measurement-semantics)定义未知、无统计口径、确认零、指标完整性与已知小计，供各 extension 分析边界；术语存在不要求实现对应枚举、计数或恢复机制。[model-cost glossary](../../extensions/model-cost/GLOSSARY.md)只定义消费领域的专有含义，不用词义定义承载本次取舍。跳过费用不代表实际免费，已知小计不承诺覆盖 provider 的全部收费。

## 决议范围与溯源

本 ADR 记录用户确认的聚合架构取舍与理由；本迁移的数据归属与账户周期决议（含逐代理修订、整文件周期与历次暂停的替代关系）是最终决议记录。数据票已 resolved，但迁移尚未实现；账号隔离已由 provider 单账号修订取消；正常响应去重、主／子代理分别统计和同机多 CLI 并发正确性继续有效；运行期请求详情／去重标记的寿命已确定（sessionId + turnId 标记仅内存留至观察实例销毁、不在 round_end 清空、不落盘）；存储物理 schema、保存等待／失败取舍（提交后 handler 返回前等待结果、失败丢弃未保存部分并从磁盘有效快照初始化、同进程 FIFO 与跨进程互斥合计默认 15 秒等待预算、旧版本不覆盖／同版本不同内容拒绝）已在存储决议确认；可靠原生身份／实例隔离的实际接线及最终 UI 布局仍由装配／展示／验收票落实；决定不是生产实现证明。framework 的分层与 native import 责任继续遵循[语义扩展框架 ADR](0002-semantic-extension-framework.md)，本次只落地 OMP，不实现或认证其他 harness adapter。
