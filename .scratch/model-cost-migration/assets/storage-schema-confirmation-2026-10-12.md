# 存储 schema 本轮确认来源（2026-10-12）

来源为本会话「请开始ticket 06」之后的现场 grilling。以下引用用户原话，不把 agent 推荐当用户决定。现行权威分别在原 Lighthouse；本文件仅保存确认来源与证据限制。

## 字段补齐与 holiday

- 用户："Q27 同意按旧文件补齐"。该轮明确列出周期开始、归档结束、可选 DeepSeek 起止余额、Session 名称；保留旧 id 的含义，取消旧 last* 差分基线和第二份全局累计。
- 用户："Q28 开启"。agent 随后明确复述为首次开启 holiday 先归档并重置整文件，新周期直接 holiday=true，影响 Codex 等消费但不清 estimate；已开启仍幂等，不串联两次活动文件发布。此候选在修订 JSON 中再次展示，最终 schema 确认包含此范围。

## Session-only 新原则与术语纠正

用户明确要求："Q29 应该由我来具体划定什么需要保存到文件，什么不需要"，并提出新原则优先于旧决策："参考旧的json文件，我确定只有session级别的信息需要记录到文件，包括总的会话消耗，subagent的消耗等。round的消耗仅通过文件记录或内存信息推断，UI上Round级别的统计尽量推断，硬性需求是正常连续对话的情况下，可以看到上一turn的统计消耗，但不要求/resume，/tree等情况能恢复turn级别的信息，但需要能恢复session级别的信息"。

Q30 用户更正："按照新的术语，指的应该是‘上一round’，我不小心用了旧extension的术语"。因此不持久化 recentRound 或 start/end 快照；正常连续对话须能显示上一 Round，自身口径与 Session 子代理汇总继续分开；resume/tree 须恢复 Session，不要求恢复 Round。

## 分桶、身份与父子关系

- Q31 用户："用尽量简单和贴近原始数据的方式保存即可，方便保存和恢复"。
- Q32 用户："我希望能分桶，如果数据传入时已经有provider/model信息，做这个分桶应该是很简单的操作，也更方便我们统计"；并重申 "codex的美元消耗不计入金钱cost中，被归类为额度消费，如果混用，金额消费应转换为0"。agent 澄清 Codex 对金额汇总贡献为0，不把混合 Session 全部金额归零，不抹掉其 token/美元参考费用；用户后续确认总cost派生与最终schema。
- 用户要求："分层应该先按harness标识区分，再在harness内区分不同的session"。采用 harnesses.<harness>.sessions，不采用 sessions.<harness>；标识不是宿主版本，不实现 pi。
- Q34 用户："同意‘扁平 list＋直接父 Session ID’"。Session 自身消费独立记录，父子树／含后代合计内存派生，parent 在同 harness 内解释；不嵌套持久树，不复制父汇总。

## 版本、总数与最终批准

agent 分别解释 schemaVersion（格式门槛，不随保存/clear递增）、periodId（重置代际）、saveVersion（同周期/harness/Session的快照序号及幂等/冲突）；用户答 "可以"。

用户询问 Session 总 cost 是否从各 model 求和；agent 解释求和已算费用、非按当前价重估，Codex贡献0、美元单独参考、父子不重复，可缓存内存视图；用户答 "可以，我确认json schema格式为以此为准"。最终批准的JSON不含recentRound，使用schemaVersion/periodId/start/可选start_bal/holiday/harnesses.<harness>.sessions[]及id/name/parent/saveVersion/own.<provider>.<model>，token四桶和分开的costCny/referenceCostUsd。

## 证据与限制

- 本轮读取旧 extension daily-tracker.ts 的 DailyData/DailySession、setHoliday/archive/ensureSession，以及 index.ts 命令入口，确认旧list、周期时间、起止余额和旧holiday不自动clear的实际行为；旧文件链接见[现状调查](current-state.md)。这是对照证据，不把旧实现当本轮新政策。
- 本轮运行无文件读写的 Bun 内存算式：无周期校验，p1版本9累计13会写入清空后的p2；有校验返回reject old-period snapshot。另演示已算10+4.5=14.5不按holiday重估。不是新文件module、跨进程锁或真实账单证明。
- 发布 smoke 实际输出：10 份变更文档的 271 个本地链接目标存在；权威 JSON 示例可解析，2 个 Session 的直接父关系可读取，自身人民币0.01、含子0.015，Codex美元参考0.02不混入人民币；示例不含 recentRound／totalCost，旧周期提交被拒绝。此为文档／算式校验，不是生产文件更新或锁认证。临时校验脚本执行后删除。
- 修订前原权威与工作票见[发布前快照](storage-schema-before-publication-2026-10-12.md)。本轮只发布规划，无生产代码、用户统计、凭据或正式配置变更。
