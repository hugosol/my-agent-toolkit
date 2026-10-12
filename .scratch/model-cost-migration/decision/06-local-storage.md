# framework 如何提供独立存储、原子更新与跨进程协调？

Type: grilling
Status: resolved
Outcome: [存储组织、JSON schema 与安全更新决议](../lighthouse/06-local-storage.md)
Assignee:
Blocked by: 01, 02, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Handoff

- 状态：resolved，claim 已清理。
- 当前范围：用户最终「可以，我确认json schema格式为以此为准」收口了本轮 Q25 定点重审与显式新原则；原 Q5–Q24／Q26 的协调、等待、失败和平台政策保留。本票无剩余存储决策问题；结案仅是规划，不是生产能力已完成。
- 结果权威：[存储 Q25](../lighthouse/06-local-storage.md#q25consumptionjson-的物理-schema归档与版本)持有唯一物理 schema；[数据的 Round 寿命主题](../lighthouse/12-state-data-contract.md#最近-roundtree-与恢复展示)持有 Session-only／正常上一 Round／resume-tree 取舍；[命令 holiday 原主题](../lighthouse/07-command-state.md#holiday-与-clear当前入口适用条件)持有首次开启切周期与幂等。消费渠道及 Codex 金额贡献为0继续消费[消费归属](../lighthouse/02-accounting-ownership.md#金额口径缺失与冲突边界)，不在本交接复制规则。
- 理由与拒绝：用户自行划定轻量文件保存范围；不保存 recentRound／轮次快照，不复制父含后代或全局总数；provider／model 桶因输入已有事实且统计方便保留；harness 优先，再 Session 扁平 list＋直接父 ID 贴近旧文件。扁平 map、嵌套持久树、sessions 在 harness 外层、取消模型分桶均未采用；旧账号键、请求前读、租约、复杂恢复不恢复。
- 来源与恢复：[本轮确认原话及证据](../assets/storage-schema-confirmation-2026-10-12.md)，[发布前完整票体／原权威](../assets/storage-schema-before-publication-2026-10-12.md)。下方旧恢复点已退役，独有理由／证据／历史问题仍可从该快照恢复；不以已取消候选重新开题。
- 证据限制：本轮核对旧 JSON 与命令源码，并运行纯内存周期拒绝算式；这些不证明生产 framework 文件更新、真实跨进程锁、崩溃原子性、陈旧锁或远端余额／TUI 已验收。固定基线仍 18.5.0；pi 仅存储命名空间预留，不实现或认证。
- 下游覆盖：展示票承接正常连续对话上一 Round、Session／子代理布局与无 UI 反馈；刷新票承接余额读数可用性／获取时点；装配票承接公共 harness／sessionId／parent 事实接线、Session list 保存恢复和通用文件 module；验收票承接边界余额、归档／首次 holiday、版本冲突与跨进程真实证据。它们的未决问题和 claims 保持，不在本会话代决。
- Backtracer：本轮变更的信号为「轻量 Session 恢复」「上一 Round 正常体验」「harness 身份」「起止边界信息」「首次 holiday 切周期」「同机安全更新」。原数据／命令／观察主题已按用户明确新旧 ruling 修订；展示／刷新／装配／验收原 Question 提供后续责任，无新增无主 gap、层违规或 peer asymmetry，不新增票、不批量同步消费者交接。旧 trace 完整记录留历史链接，不新增空报告。
- 下一 ready 问题：本票无 unanswered；按 tracker 选择下一 frontier，而非继续存储泛化或生产实施。

## Question

确定无账号身份键的 consumption.json 物理布局与完整归档／reset：harness 优先、Session 扁平 list、直接父 ID、provider／model 自身桶、周期／格式／保存版本及起止元数据，保证 Session 消费可保存恢复和旧周期提交拒绝。

本轮用户显式划定 Session-only 持久化范围，撤销原 recentRound 落盘；正常上一 Round 与恢复取舍在数据原主题，首次 holiday 切周期在命令原主题，见 Handoff。schema 已最终批准，原路径／文件组织／协调／失败／平台／同会话执行者政策保留。原始问题与发布前恢复点见[完整历史](../assets/storage-schema-before-publication-2026-10-12.md)，不是生产实施授权。

## Discussion approach

以既定数据记录与读写路径为前提，先看实际组织及调用方式，再决定操作级等待、锁与恢复；保持规划模式，不泛问整个 callback 同步／异步，不预建正常离开的额外保存钩子。

## Comments

### 本轮确认与发布

用户在 review 旧字段、Round 持久化定位、harness 分层、Session list、provider／model 桶、版本机制与派生总数后最终确认 schema。确认来源与证据限度见[本轮记录](../assets/storage-schema-confirmation-2026-10-12.md)；详细结果只在各原 Lighthouse。

### 历史探索与追踪

旧 Comments、历史暂停／resume 指针和 Q23–Q26 trace 全文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。独有理由与证据保留；当前恢复只读上方 Handoff 与原权威，不恢复最近 Round 落盘、账号键或旧待定 schema。
