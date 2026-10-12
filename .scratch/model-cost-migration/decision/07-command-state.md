# /budget 的参数、操作与状态如何在新框架表达？

Type: grilling
Status: resolved
Assignee:
Blocked by: 01, 06, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Lighthouse: [通用动作与预算命令契约](../lighthouse/07-command-state.md)

## Handoff

- 状态：本票 resolved（2026-10-12），命令决策范围与 Q21 缺口授权均已收口，claim 已清理。用户“Q21 可以”授权将原存储票仅对 Q25 物理布局恢复为 open、未认领；该跟进未解决，不宣称其对装配的依赖已满足。
- 已发布命令结果只在[命令 Lighthouse](../lighthouse/07-command-state.md)；单账号支持、取消账号统计身份与替换隔离只在[消费归属原主题](../lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)，当前认证资料只在[访问原权威](../lighthouse/04-provider-access.md)，整文件 clear／零消费／失败顺序只在[存储原权威](../lighthouse/06-local-storage.md)，逻辑数据与 detail 寿命只在[数据原权威](../lighthouse/12-state-data-contract.md)。不得从旧交接恢复账号键／定点 clear，也不把一个 provider 单账号误当只有一个进程。
- 后续 ready 票：[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)，只收口取消账号键后的物理布局，下一会话先认领。Q21 授权已记录，不再重问；[该票当前 Handoff](06-local-storage.md#handoff)是精确恢复点。本会话不认领或解决第二张决策票。
- 本票命令无剩余语法／模式／detail／holiday／clear 反馈问题；所需的整文件归档／reset 操作语义已有批准原权威，未定字段编码交给已授权的存储原题，因此不重开本票。delivery 字段、实例与公共 exports、宿主 await／异常接线由原[装配票](10-assembly-layout.md)持有，不要求先实施。全部 provider 的新 usage UI 不在本票批准范围。
- 理由与拒绝分支：保留 budget 为前缀匹配便利；detail toggle 少记命令；动作表取代自由参数 handler，取消数字／K／0、默认动作、缩写、额外参数、业务配置语言、原生 handler 绕路、后台 action 模式及各扩展重复打印。holiday／clear 只拒绝当前 Round／保存未收口，不是整个 Session 禁用，不增加全局活动检测或延期队列。用户最常见多 CLI，故保留轻量跨进程协调。
- 证据与限度：[确认原话／旧源码](../assets/command-confirmation-2026-10-12.md)、[OMP 进程调查](../assets/omp-session-process-model.md)、[pi 进程调查](../assets/pi-session-process-model.md)。旧 detail 入口没有 provider 检查、既有 renderer 消费偏好，hidden 不显示；授权沿旧行为不等于给所有 provider 新增 UI。探针版本与支持基线不同，未发模型请求，不证明生产 actions／warning／文件锁／TUI 已实现；正式基线仍 18.5.0。
- Trace：[本轮 Backtracer 记录](../assets/command-trace-2026-10-12.md)已列 signals／coverage 与唯一 schema 跟进；用户已授权恢复原存储题，无重复新票，不修改其他消费者的恢复点或 claim。旧独有理由、交接和原 Question 全文保存在[本轮发布前快照](../assets/command-ticket-before-publication-2026-10-12.md)，只作溯源。

## Question

在取消数字／K／0 预算修改的前提下，确定保留 detail、holiday、clear 的命令名、完整语法、适用条件、状态寿命与成功／拒绝／失败反馈，选择最小 framework 通用命令模式。当前生产框架仅 toggle／directed 与 boolean activation，不能借 unrecognized 回调或原生命令集成伪装通用 action。

本票已确认新增纯数据一层 actions 声明与注入 shared logic 实现，统一等待及异常报告，补齐公共 warning；不升级通用业务 State。操作规则以 Lighthouse 为唯一批准权威，不将保存失败策略、整文件 clear 或单账号政策复制进本票。Q21 已授权原存储 schema 定点重审且有恢复点，本票完成；替代 schema 的候选仍未批准，不把本票结案当作物理存储或生产迁移完成。

## Comments

### 本轮发布边界

Q19 用户授权“如果旧 extension 的回答也是 yes，可以跟随”，已核实无 provider 门控与三种既有 renderer；Q20 明确零消费也按最简单统一流程归档。所有确认与批准修订已回原权威；未修改正式源码、认证、统计或实施票。

### 依赖与恢复历史

本轮发布前的多份 Trace／Handoff 已收束到当前单一 Handoff；先前树级 clear、账号隔离／定点重置、未决存储 Q8–Q15 的旧描述不作为当前约束。旧已批准的去重／正常多会话、Session-only 子汇总、固定预算显示、独立 estimate 与旧数据保护继续有效，细则消费各原权威。

