# nicobailon 子代理扩展的本机隔离验证：Lighthouse

> Question and discussion: [nicobailon 子代理扩展的本机隔离验证](../decision/07-nicobailon-runtime-validation.md)

## Question

固定 nicobailon 发布工件在本机 Windows + pi 1.2.0 上能否兑现用户所需子代理用法，并让 model-cost 可采用的内置观察入口取得完整基线需要的原生事实？本发布记录真实通过、缺失及未覆盖范围，不选择提供方或交付生产迁移。

## Discussion

### 授权来源与运行范围

用户在本票会话先要求“请开始ticket07”，随后对明确列出的四项授权回答“全部同意”：使用 deepseek/deepseek-flash 和既有密钥文件、最多16次子代理 execution、累计¥5软限额（含根和自动继续），费用缺失只重读一次、仍未知即停止后续真实调用。授权限于本票隔离短任务，不批准正式安装、生产配置变更或无限重试。

实际执行14次，包括启动失败、嵌套父子及续跑；根/子共59次 provider 请求，pi 报告费用 $0.015280488，无未知费用请求。逐场景、命令、原始证据、全部 F-/O-/N- 行去向与验证限制唯一详录于 [真实运行报告](../research/07-runtime-validation/report-live.md)，不在本权威复制完整表格。零费用部分见 [预检](../research/07-runtime-validation/report-nofee.md)。

### 实际可执行与可观察的路径

运行对象是 npm `pi-subagents@0.78.0` 发布工件（JS入口），宿主实机版本1.2.0、Node v24.18.0。模型真实自主调用前台、后台、显式 opt-in 嵌套（含背景父内嵌套）、并发 workflow、完成后续跑、fork、一次性定时调度、在途取消和 follow-up；不是用根 RPC spawn 替代模型委派。

公开 `registerRequiredChildExtensions` 在根、前台、后台、嵌套和 workflow/调度子会话实际加载探针，运行时 acknowledge 与独立会话/元数据相互印证。前台同进程与后台独立进程均可观察实际 session 身份、有效模型/effort、请求开始、响应边界及逐请求用量。子会话父文件与 run meta 的 parentSessionId 按实际委派路径核对，可恢复直接父链；不将所有 pi fork 的来源 header 泛化成委派关系。

续跑产生新 run/进程但复用原 actual session id/file，且 startup reason 并不证明首次开始。fork 的继承历史与新请求可由首次绑定 branch 的持久化 entry id 分开；这些事实是后续适配输入，不是 framework 生命周期/Owner 的现成实现。

### 汇集可行性与边界

每进程/实际 session 独立 JSONL，加上只读归并，得到59个真实请求；与独立 pi session 转录逐请求比较，无缺失或 usage mismatch。排除18条 fork 继承 assistant 响应；重复回放全部59个响应不改变总账或每 session 账。根自身42个请求不重复纳入子费用。

这证明本票最小观察与离线归并可行，不证明 model-cost 生产共享 JSON 的并发锁、原子写、崩溃恢复、增量回传、实例寿命或公共 State 继承已实现。其他 provider 的 responseId/用量及 HTTP 在途取消仍未验证。

候选公开累计 `cost` 在本轮快照中比同一时点的独立请求账少 $0.000240924，对应两条嵌套叶及一条定时 workflow 叶；累计接口不能充当全部 owner 后代的账本。具体证据在报告链接的费用范围对照，不把报告中的事实差异转成未经批准的上游修改或接口路线。

### 未解决的完整基线与资源收尾

Viewed read/subscribe 在实际 pi context 均不存在，JSON、viewer 或 status 不替代查看席位。运行期 idle/pending、settled、活动快照与自动继续事实存在，但 caps/所有后台来源/延迟关轮的完整等价规则未证明。执行器 meta 中部分路径有 durationMs，探针还能测 agent 活跃区间；活跃区间可能漏 setup，不能混作完整 execution，运行中读数亦未证明。仅由这些事实不能触发或扩大已批准的耗时例外。

改名、根导航/owner 转移、跨 owner 寿命、生产根专用 initialize/cleanup、State follow、目录价/providerAccess、托管 timer、实际绘制及发现入口仍留在后续票范围。没有通过验证的项已明确列出，不用本轮成功用例宣称完整覆盖。

真实宿主退出0，最后0 active、无排队消息或活动调度，已观测 worker/runner PID 全部退出；日常 agent 目录文件快照未变。已删除隔离安装及本轮7个系统 Temp async目录，只保留脱敏封存、驱动入口与复现说明；[清理记录](../research/07-runtime-validation/cleanup.json) 含 archive 校验和与资源证据。

## Decision

发布 nicobailon 固定工件在本机 Windows/pi 1.2.0 上的真实用法、必需子扩展观察、身份/父链及逐请求归并证据，同时明确累计费用范围与完整基线缺口。验证范围完成，最终提供方、缺口处置和生产组织仍未决定。

## User stories

1. 作为迁移决策者，我需要两个候选同轴的真实运行和观察证据，以便选择依赖及缺口路线而不将静态接口或未测项当作通过。
2. 作为适配设计者，我需要真实 session/直接父、请求边界、续跑和 fork 历史的区分，以便复用公共语义并避免跨进程漏账或重复计账。
3. 作为 model-cost 维护者，我需要明确最小探针和生产汇集的差别，以便在后续组织及验收中落实并发、寿命与未解决的宿主事实，而不误认已完成迁移。

## Preconditions

- 使用 [完整能力基线](01-capability-baseline.md)、[候选公开事实](02-pi-subagent-candidates.md)及 [选型部分确认](03-subagent-provider-choice.md) 的版本、范围与例外；本发布不重写这些政策。
- 内置观察的组织范围以 [已确认组织原则](04-third-party-adapter-organization.md) 为准；本轮探针不新增独立观察产品或通用插件系统。
- 保存的固定工件元数据、原始转录和验证入口可取；不同版本、平台、provider 或未经实测的路径须重新验证。

## Postconditions

- [选择 pi 子代理扩展及缺口处理路线](../decision/03-subagent-provider-choice.md) 的本票验证前置已提供；恢复最终选择时须消费实际缺口和证据限制，而不是默认选择 nicobailon。
- 适配组织票与完整迁移验收票继续承接跨进程事实归一、生产汇集、根专用生命周期、完整关轮/Viewed/runtime 等问题；没有自动批准私有 API、fork、降级或新的生产代码。
- 证据与隔离安装分离，清理不删除可恢复的脱敏原始材料；真实调用额度不能无条件复用于后续工作。

## Invariants

- Session、直接父、Owner、Viewed session、run/agent handle 和 execution 保持不同含义；不能按标签、进程或时间猜身份。
- framework 继续拥有 scope/Turn/Round/State/capability 与生命周期语义，model-cost shared-logic 继续复用；候选与探针提供事实，不建立第二套公共语义。
- 未知费用、已知零、累计 usage、逐请求读数与请求锚价保持区分；部分覆盖和未测项不构成完整基线豁免。
- 本票只交付规划所需运行事实，不提前执行地图 Destination 的生产迁移或替用户选型。
