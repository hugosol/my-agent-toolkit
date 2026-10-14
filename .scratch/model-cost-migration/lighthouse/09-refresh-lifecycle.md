# 额度与余额在何时刷新，异步效果怎样跟随会话生命周期？：Lighthouse

> Question and discussion: [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)
>
> 整票由用户 Q21「确定」确认；[本轮原话、替代分支及运行证据](../assets/refresh-confirmation-2026-10-12.md)。本文件取代此前初始化部分稿，旧内容与恢复点保留在[发布前历史](../assets/refresh-before-publication-2026-10-12.md)。规划结案，不是生产实现、真实远端认证或多窗口问题已修复。

> 本次 Traverse 明确批准 clear／首次 holiday 的一次边界余额查询；[Traverse 确认来源](../assets/traverse-confirmation-2026-10-13.md)。其他自动调度与实例规则保留。

## Question

确定 CLI 启动两源预取、实际 provider 响应驱动的自动更新、clear／首次 holiday 的一次边界余额查询、成功读数 TTL 与查询合并、Codex 窗口／估计采样、实例与查看切换、无 UI、退出和峰谷自动重绘的最小业务调度。具体公共 interface、原生接线和生产验收分别由装配／验收决定。

## Discussion

### CLI 启动初始化与首次模型请求

初始化节点是 CLI 启动，不是每个 Round 的 agent_start 或普通会话切换。adapter／framework 提供启动时认证资料已可读取的公共入口；优先复用当前 `session_start(reason: initial)` 语义。现有源码提供入口线索，实际订阅、异步接线与首次请求等待仍由[装配](../decision/10-assembly-layout.md)落实。

每个 CLI 运行实例建立自身 provider 级内存缓存，并一次性并行查询已配置的 DeepSeek 余额与 Codex 额度；未配置的不查询，不依赖当前模型／首次消息选择来源。同一 CLI 内子代理不分别全量初始化；独立 CLI 有自己的缓存与初始化，不新增跨进程网络请求合并。重启／建立新运行实例重新初始化。

首次模型请求前等待初始化查询成功、失败或超时收口，可以先输入文字；查询失败不阻断模型执行、不显示为零。该等待延续[先前 filename 定向确认](../assets/provider-access-confirmation-2026-10-12.md)，不恢复首请求之后懒加载，也不扩张成所有运行阶段等待网络。普通切模型、切会话、查看子代理或 /tree 不清缓存、不重新全量预取。

### 运行期自动更新与显式命令查询

用户理由：usage 返回是 provider 刚发生消费的自然更新时机，请求已绑定 provider，故自动更新无需全量刷新或其他活动触发；本次 Traverse 明确批准下节 clear／首次 holiday 的一次显式命令边界查询。消费触发不等于查询接口必成功；读数可能有服务端延迟，失败按下述简单规则处理，不为此扩建机制。

- DeepSeek：usage 返回时按请求所属 provider 检查余额缓存 TTL，过期且无在途查询才后台查询余额。
- Codex：同一个 usage 返回入口按请求所属 provider 检查额度读数 TTL，过期且无在途查询才请求账户额度 API；初始化查询与运行期刷新共用同一请求入口（地址、认证、proxy、预算、parser 与窗口应用），仅触发时机不同。

不因活动开始、Round 结束、模型／会话切换额外查询，不建立定期网络轮询；clear／首次 holiday 的查询是下节明确的命令例外，不受自动 usage TTL 触发限制；render 不请求、建 timer、落盘或更新权威业务态。主／子代理根据真实请求 provider 进入同一实例的刷新入口，不按当前查看模型过滤或顺带查询另一 provider。

旧 → 新：旧会话／agent_start stale 拉取、原生 agent_end 强制查询、模型命令两源预取退役。本次（2026-10-14）明确取代 Q11 的 Codex API-only-init：Codex 运行期改回经同一账户 API 刷新，复用 DeepSeek 的触发入口、成功 TTL 与在途合并，不再接纳响应 headers。不是每次 usage 都无条件发 HTTP，而是响应驱动检查；不添防抖、重试队列或 TTL 到期 timer。

### clear／首次 holiday 的边界余额查询

普通 clear 或首次开启 holiday，在[命令权威](07-command-state.md#holiday-与-clear当前入口适用条件)的适用条件允许后、取得消费文件锁之前，尝试一次 DeepSeek 余额查询；holiday 已开启的幂等提示不查询。沿既有认证／业务 endpoint、proxy:false 与 5 秒预算，不持有文件锁等网络、不自动重试，不恢复其他已取消的查询触发。

成功取得的可靠人民币读数交给[存储 Q25](06-local-storage.md#q25consumptionjson-的物理-schema归档与版本)，本次同一读数用于旧归档 end_bal 与新活动 start_bal；它是本次边界查询结果，不以 TTL 已过期或查询失败后的旧缓存代替。失败／超时则两处省略，不填零、不因此阻止归档／重置；余额错误沿[展示错误承载](08-presentation.md#无-ui-记账与公共错误反馈)，动作成功仍只以消费活动文件实际提交为准。余额差不要求等于统计消费，查询成功也不等于归档／重置成功。

旧→新：此前运行期查询只允许 usage TTL、边界余额来源未定；本次显式保留旧 clear 的一次 best-effort 查询并应用到首次 holiday，不增加轮询或后台补做；Codex 运行期 API 刷新是另一条已批准策略，不属于本命令查询。用户 Q2“可以，查询一次”，原提案范围与确认见 [Traverse 确认来源](../assets/traverse-confirmation-2026-10-13.md)；失败后省略而继续操作是本次已确认范围，生产查询尚未验收。

### provider TTL、在途合并与失败

DeepSeek 默认 TTL=30000ms、Codex 默认 TTL=15000ms，各自通过既有扩展 YAML 机制独立配置（字段名由装配声明，不建立平行配置解析）。成功取得并接纳读数后重置该读数的 TTL；TTL 到期本身不查询，下一次 usage 再检查。

同一 CLI 运行实例的 provider 查询在途时，多个 usage 触发复用这次查询，不重复请求、不在完成后补发。成功则更新时间与读数；失败保留旧值和原获取时间，不重置 TTL、不设置失败冷却、不自动重试。之后的 usage 可以再次触发过期检查。接受此简单取舍，不以“模型请求成功”推断独立查询不可能失败。

本轮先前提出的 DeepSeek 30s／Codex 20s 分别配置，随 Q11 取消 Codex 运行期 API 一并取消；本次重新批准 Codex 成功 TTL，默认 15000ms 并独立配置。两种读数共用成功 TTL 与在途合并策略，失败均不设冷却、不重置 TTL、不自动重试。DeepSeek 5s、Codex 10s 的业务 HTTP 预算沿用[HTTP 权威](05-http-capability.md#超时预算与按需取消)，其可覆盖有限超时与无主动取消 interface 不变。

### Codex 窗口独立更新与成对估计

初始化查询与运行期刷新共用 model-cost 额度 module 的同一请求入口，读数带自己的接纳时间，不建立两份互相竞争的权威；同一实例在途只有一次账户 API 查询，运行期不按视图／模型另开查询。

5h／7d 按实际报告窗口时长识别，不以 primary／secondary 位置或套餐名硬编码。此次有有效 5h 就更新 5h，有有效 7d 就更新 7d，不等待另一个窗口。缺失窗口保留已有成功值与其原获取时间；没有则不可取得，不写零、不推断无限或 Pro 必定不适用。不同窗口可以分别展示已有读数，但不将它们伪装为同一次成对测量。

ratio／left 的新采样仍只使用同一次来源报告里的双窗口，不拼不同报告、新旧时刻或不同响应；单窗口报告不产生新估计、不触发 API 补查。已持久化估计的寿命、采纳阈值、窗口变化规则和文件协调消费[行为](01-behavior-contract.md#保留功能与已确认修剪)／[数据](12-state-data-contract.md#最小逻辑数据布局与查询路径)／[存储](06-local-storage.md)原权威，本票不更改估计算法或写入节流。

运行期刷新不建立跨来源绝对时序系统、不声称服务端测量时间可严格排序。请求失败、超时或答案不含可识别窗口时不清掉最近成功读数、不给失败设置冷却；下一次 usage 仍可按同一 TTL 规则重试。

撤回的提案：完整双窗口才能更新展示（Q15 明确接受独立更新）。运行期 headers 来源与「Codex API-only-init」在本次一并撤回；来源和理由见确认资产，不保留为并行政策。

### 业务运行实例、当前查看会话与退出

测量是 provider 级内存数据，不是 Session 消费累计或 framework State。普通切会话／模型／tree、消费 clear 不使仍有效实例的 DeepSeek 查询失效；成功可更新其 provider 缓存。消费 clear 的周期／在途丢弃与保存规则仅由数据／存储／命令权威持有，余额更新不复活已清消费，也不新增账号替换识别／隔离。

有 UI 时更新通知当前前端，由它读取[公共当前查看会话](10-assembly-layout.md#public-viewed-session-prerequisite)；不捕获取数开始时的旧 ctx 作为重绘目标。业务数据和 UI 目标的寿命分开，切换不取消 provider 缓存，当前查看不变更记账归属或 Owner 外部效果。

运行期远端查询不阻塞下一模型请求、工具执行或宿主 idle。运行实例销毁后停止接纳旧结果，不写缓存／新实例、不反馈或重绘；CLI 结束不等待余额／额度网络查询，不为此增加公共 HTTP 主动取消。已发查询仍受既定有限超时约束。该取舍不撤销消费保存或命令操作的等待／失败规则。

### 无 UI 使用同一业务逻辑与既有错误承载

用户 Q13 明确批准无 UI／RPC 运行相同业务后端：CLI 初始化两源、DeepSeek 与 Codex 的 usage TTL 刷新、estimate 继续；只是不创建 widget 前端、不执行仅用于绘制的布局／颜色／文本格式化。初始化收口例外保留，运行期网络仍非阻塞。

失败承载只消费[展示原权威](08-presentation.md#无-ui-记账与公共错误反馈)：有 UI 的余额／额度请求错误在 widget 显示、不弹通知；无 UI 通过 framework Extension feedback 输出 stderr，不进入模型上下文。没有 UI 不等于没有错误报告，不新增打印系统。普通消费保存暂停不自动停用独立余额／额度功能；实例销毁后的旧结果不越过退役效果权限。

### CLI UI 实例级单一峰谷边界 timer

用户要求跨界自动重绘且不愿轮询；最终采用每个 CLI UI 实例一个下一峰谷边界的一次性 timeout。UI 初始化安排，触发时通知当前前端重绘，再按实际当前时间安排下一未来边界。切模型／会话／tree 不取消重建这份 timer，子代理不分别 arm 或抢 timer；回调不保留旧会话 ctx，前端读取当前查看事实。

该 timer 只驱动时段相关展示，不查询远端、不写文件、不改变消费统计或切换计费状态。无 UI 不创建，UI／实例销毁清理；不同 CLI 各自拥有 UI timer，无跨窗口共享时钟要求。

请求计价始终按请求开始时真实时间与 holiday 锚定，timer 不改变已锚费用。既定北京时间峰谷含端点规则不变；端点后重绘，休眠／事件循环阻塞时不承诺精确准点，恢复执行按当前时间纠正并安排未来边界，不补播错过的切换。

撤回取消 timer、固定 1s 轮询建议；保留自动到点重绘，以实例归属／当前 UI 目标替代旧会话级 re-arm 和 ctx 捕获。用户报告多窗口不稳定，但旧闭包错位只是源码支持的调查方向，尚未复现实际根因或修复；由验收证明新路径，不扩建异常时钟系统。

## Decision

CLI 启动一次性并行预取已配置两源并在首请求前收口；运行期自动更新由 settled usage 按请求所属 provider 检查各自成功 TTL：DeepSeek 余额与 Codex 额度共用触发入口、在途合并与失败语义（DeepSeek 默认 30000ms，Codex 默认 15000ms，各自经既有扩展 YAML 可配置），clear／首次 holiday 另有一次 best-effort 边界余额查询；Codex 不再接纳响应 headers，窗口仍独立更新、估计同报告成对。无 UI 运行相同业务，网络不阻塞运行或结束；峰谷以 CLI UI 实例级单一边界 timer 自动重绘当前视图。

## User stories

1. As a 用户, I want CLI 启动时预取已配置两源并有限等待, so that 第一条模型请求前有读数或明确失败且不依赖先选模型。
2. As a 用户, I want usage 按真实 provider 驱动两种读数各自的成功 TTL 查询, so that 避免不必要的全量刷新与重复网络请求。
3. As a 用户, I want 查询失败保留最近成功读数并独立接纳可用窗口, so that 单窗口可用时仍能看见信息且错误不会被解释成零或无限。
4. As a 用户, I want 成对额度估计只消费同一次报告, so that 新旧／不同来源窗口不会被拼成错误 ratio／left。
5. As a 用户, I want 运行期与退出不等展示网络并使用当前 UI 目标, so that agent 不被展示拖住且切会话后不会重绘旧视图。
6. As a 用户, I want 无 UI 保留同一后端及错误反馈, so that RPC 仍能记账和维护额度估计而不依赖 widget。
7. As a 用户, I want 一个 UI 实例级边界 timer 自动重绘, so that 空闲跨峰谷界线仍更新图标且无需轮询或各会话争用 timer。
8. As a 用户, I want clear／首次 holiday 前尝试一次有界余额查询, so that 周期起止余额有本次读数而查询失败不阻止归档或重置。

## Preconditions

- [行为](01-behavior-contract.md)、[消费归属](02-accounting-ownership.md)、[数据](12-state-data-contract.md)提供 provider 单账号／单一范围、内存测量与持久 estimate、请求锚价、真实 provider 和成对估计基线，不恢复账号分区或多账号管理。
- [观察](03-observation-contract.md)提供逐实际 Session／请求 usage 与 headers、原请求 provider 和公共生命周期；用户批准不等于这些接口已实施。
- [账户访问](04-provider-access.md)提供启动及每次操作当前认证资料；[HTTP](05-http-capability.md)提供共享传输／代理／有限超时与无主动取消；model-cost 持有 provider 查询与 parser。
- [展示](08-presentation.md)、[装配局部权威](10-assembly-layout.md)提供共享后端／宿主前端、当前查看事实与反馈 seam；CLI 级实例创建销毁、启动等待、配置字段、原生公开出口及 UI 通知仍待装配。
- [命令](07-command-state.md)提供 clear／首次 holiday 的适用条件；[存储](06-local-storage.md)提供边界字段、归档／重置与 estimate 的独立文件及协调；[验收](../decision/11-acceptance-cutover.md)承担固定支持基线、真实查询／TUI／RPC／并发生命周期证据，不以 fixture 当账单或新实现证明。

## Postconditions

- 源票全 scope 已决定（本次 2026-10-14 将 Codex 运行期来源从 headers 改回同一账户 API 入口），无需继续 TTL／全量刷新／失败冷却／轮询或配对门槛访谈；具体 interface 与落地工作不使该决策票保持未决。
- 装配消费本权威落实启动入口与首次请求等待、CLI 级缓存／查询合并、provider 响应映射、两种读数的 YAML TTL、失效实例隔离与当前 UI 目标、单一边界 timer、clear／首次 holiday 的锁外有界查询；不新建复杂 widget／State／配置体系。
- 验收需覆盖初始化失败不阻断、无 UI 同后端、DeepSeek 与 Codex 各自的 TTL／在途合并／失败旧值、Codex 运行期经同一 API 刷新且不再读 headers、单窗口／成对采样、会话切换／clear 不清测量、多 CLI UI 自动跨界及退出迟到结果，并覆盖边界查询成功同值双用、失败／超时省略不阻止归档、已开启 holiday 不查询及不持锁等待网络。实际窗口缺失理由和多窗口根因不得凭本次源码猜测认证。
- 下游原问题／状态／claim 不因本票发布被改写；尚未决定模型名单和完整装配／验收仍由各原票持有。没有生产迁移、远端查询或支持版本升级。

## Invariants

- 遵循 [Happy flow 优先原则](03-observation-contract.md#happy-flow-优先的设计推进原则)：正常流程先收口，具体必要缺口再重审，不因假想失败扩建机制。
- model-cost shared logic 拥有调度、缓存、parser 与 estimate；framework 提供公共事实／配置／HTTP／反馈，native access 留 adapter／extension harness seam，遵守 ADR-0002，不透传 ctx 给 shared logic。
- 复用 framework 现有 YAML／公共 exports／Extension feedback／当前查看接口；不建立第二套配置、状态或 UI 系统，不扩大 connect-bot 等 Owner 外部效果。
- 缺失／失败／旧读数不等于零或无限；独立窗口不伪装为配对报告，成对 estimate 不拼时间或来源。
- render 只读；网络、timer、持久化副作用由相应业务／实例路径驱动。展示 timer 不改请求锚价或消费文件。
- clear／首次 holiday 的边界查询只在命令条件允许后于文件锁外执行一次，失败不重试、不冒充零或改用旧缓存；最终操作结果仍归存储／命令权威。
- 不新增网络轮询、失败冷却、自动重试、主动取消、账号替换隔离或跨进程网络合并；Codex 运行期刷新与初始化共用同一查询入口。
- CLI／UI／Session／Owner 寿命不混同；有效 provider 读数不因普通查看切换清空，销毁后的旧效果不进入新实例。
- 源码与隔离实验不是生产链路证明；支持基线仍 18.5.0，不认证 pi，不宣称多窗口问题已修复。
