# /budget 的参数、操作与状态如何在新框架表达？：Lighthouse

> Question and discussion: [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)
>
> 本轮命令范围已确认并发布（2026-10-12），确认原话与事实边界见[本轮确认来源](../assets/command-confirmation-2026-10-12.md)。源票保留 claim 至发布／Backtracer 缺口跟进收口；本文件不是生产实现证明。原先仅确认 clear 执行条件的局部结果已合入当前主题。

## Question

如何用 framework 的最小通用 command 能力表达 `/budget detail/holiday/clear`，并明确命令语法、执行完成、状态寿命、适用条件与结果反馈？统计支持范围由[消费归属原权威](02-accounting-ownership.md#账户隔离多会话与额度)持有，整文件归档／重置与协调由[存储原权威](06-local-storage.md)持有，不在本票复制替代 schema。

## Discussion

### 通用命名动作：framework 路由，shared logic 执行

新增一层命名动作的 `actions` command 类型，沿现有 `defineExtension` 的纯数据声明与注入实现分离模式。配置包括 `type: actions`、命令 `name`、可选命令说明及动作名到说明的动作表；另提供命令名／动作名对应的 shared logic 实现。framework 负责注册装配、参数匹配、帮助、路由、等待完成和通用异常报告；adapter 只映射宿主注册与必要公共事实，不解析预算业务。

示例只说明已批准配置形态，不冻结尚未收口的装配参数名：

```ts
commands: [{
  type: "actions",
  name: "budget",
  description: "费用统计与展示管理",
  actions: {
    detail: "切换简略／详细展示",
    holiday: "开启假日计价",
    clear: "归档并重置统计",
  },
}]
```

动作实现表由 shared logic 提供，例如 `budget: { detail: toggleDetail, holiday: enableHoliday, clear: archiveAndReset }`。通用动作不绑定 framework 激活 State；detail／holiday／统计数据仍归业务逻辑，不升级通用业务 State。模式、活动条件、文件更新及结果文案都由 shared logic 管理；不在配置增加 idleOnly、accountScope、persist 或 archive 等业务规则。不借 `directed.unrecognized` 伪装动作。现有 toggle／directed 的语义不由本票改写；不预建多层命令、flags、数字参数或复杂解析器。

### 命令名与路由

沿用 `/budget`，用户理由是 `/cost` 前缀会与许多单词碰撞；不增加 `/cost` 或兼容别名。数字／K／0 修改预算已被取消，不恢复。

framework 对动作参数去首尾空白、忽略大小写，完整匹配单个动作名；`DETAIL` 可识别，`det`、`detail on` 不识别。只允许命名动作，不缩写、不做模糊匹配、不接受额外参数。空参数根据动作表显示帮助，不执行动作；其他未匹配参数报告 error 并显示同一份帮助，不进入 shared logic。无需重复配置 usage、默认动作或 unrecognized handler。

### 完成语义与统一错误／反馈

action 可以直接返回或返回 Promise；framework 统一等待完成，宿主命令调用链必须传递并等待这一结果。所谓“同步操作”是用户得到结果后再继续，不是阻塞文件 I/O；配置不区分 async，不提供 fire-and-forget 或后台 action 模式，保留已确认的安全异步存储 interface。

framework 捕获未处理的同步抛错与 Promise rejection，经既有公共反馈／诊断通道报告一次 error，不自动重试、回滚、写业务状态或发成功通知。extension 不自行打印错误；如果业务必须清理或将底层失败转换为清楚的操作背景，可在 shared logic 做后重新抛出，不先打印再抛造成双报。存储 module 的可判别失败结果仍由业务 action 转换，不强迫其改成异常 interface。成功通知与正常业务提醒由 shared logic 通过公共反馈通道发出。

公共 Extension feedback 补齐 `info / warning / error`，复用 `FeedbackTransport`、adapter 的 `publishNotice` 和现有 handler 异常报告模式，不新建打印系统。有 UI 时映射通知级别，无 UI 时送 stderr；不进入模型上下文。

### detail：只切换入口偏好，不承诺新增展示覆盖

`/budget detail` 每次在 brief／detail 间切换，并反馈当前模式，不增加 brief 或 detail on/off。入口偏好寿命由[数据归属的 detail 主题](12-state-data-contract.md#holiday预算修改与入口-detail)持有：入口内存、普通切会话／tree 保留，重载／重启回 brief，独立入口互不影响，不按会话持久化或子代理继承。

用户 Q19 授权跟随旧实现；已核对旧命令入口无 provider 限制、DeepSeek／Codex／token-only renderer 使用 detailMode，hidden 返回空 widget。因此 detail 动作不检查 provider，也不加 Round／保存门控；hidden 或无 UI 只更新偏好与公共反馈，不强制创建 widget。此选择不承诺所有 provider 都有 usage UI。具体展示布局／headless 行为由[展示票](../decision/08-presentation.md)决定，provider／模型名单由[模型覆盖票](../decision/13-model-catalog-policy.md)决定，不由命令票扩大。

### holiday 与 clear：当前入口适用条件

二者仅在当前 provider 为 DeepSeek 时可执行；clear 的 provider 检查只是适用限制，不再用于选择账号。holiday 保留幂等开启：已开启提示 info，不反转、不新增 off；成功持久化后反馈开启，不追溯已有消费或已锚价请求。其业务寿命由数据权威持有。

当前入口 Round 未结束，或结束后保存处理尚未收口时，holiday／clear 直接拒绝；不建立 pending 操作、不排队、不在未来 round_end 自动执行。既有历史会话只要当前可靠 idle 且没有待完成保存就允许；刚启动可靠 idle 也允许，不要求先发生 round_end。活动未知不默认 idle。

用户选择禁止 Round 中 holiday 是为简化本入口一轮内的切界；这不是整个 Session 生命周期禁止，不限制宿主切会话／模型。检查只针对当前入口，不保证其他 CLI／子代理都 idle，不新增全局活动登记或等待所有实例。每 provider 单账号支持与多个 CLI 正常使用的范围见消费归属权威；跨进程锁／周期／版本校验继续由存储权威持有。

### 业务反馈与 clear 提交结果

| 情况 | 反馈／操作 |
| --- | --- |
| holiday／clear 的当前 provider 不是 DeepSeek | warning 说明仅 DeepSeek 适用，不执行 |
| 当前入口 Round 中或保存未收口 | warning 提示空闲后重试，不执行、不延后 |
| 不能可靠判断活动状态 | error 拒绝，不猜 idle |
| holiday 已开启且条件允许 | info 已开启，不反转 |
| 无有效存储基线，读取／更新／归档失败 | shared logic 将失败转为带操作背景的错误，framework 报告，不猜零覆盖 |
| 操作完成 | 实际持久化提交后，shared logic 经公共通道发 info；detail 是内存操作，切换后反馈 |
| clear 归档已生成、但重置未提交 | 报告“归档已生成，重置未成功”，不假报 clear 成功、不自动补做／恢复 |

整文件归档／重置、有效零消费同流程、未保存消费丢弃、先归档后提交与独立 estimate／旧归档／detail 保护，只消费[存储原权威](06-local-storage.md)；不将 clear 失败套为普通消费保存的成功，也不借内存初始化伪装已提交。

## Decision

framework 新增声明式一层 `actions` 路由与统一等待／异常报告，补齐 warning，shared logic 持有业务效果。沿用 `/budget`；detail 切换入口偏好，holiday／clear 仅 DeepSeek 且当前入口 idle、保存收口时执行，整文件 clear 语义消费原存储权威。

## User stories

1. As a 用户, I want 沿用 /budget 且一条 detail 命令切换, so that 前缀输入方便且少记命令。
2. As a extension 开发者, I want 动作表声明和 shared logic 实现分离, so that 不重复写解析代码、不泄漏原生宿主对象。
3. As a 用户, I want 空参数帮助和非法参数明确拒绝, so that 不因模糊匹配误执行业务。
4. As a 用户, I want action 完成后再返回结果, so that 文件操作没有后台迟到写入或虚假成功。
5. As a 开发者, I want framework 统一承接错误与三个反馈级别, so that extension 不各自打印或重复报告。
6. As a 用户, I want holiday／clear 在本入口工作中直接拒绝而 idle 时可用, so that 不维护一轮内重置／切界或延期队列，也不要求新建会话。
7. As a 用户, I want detail 跟随旧实现而不强迫所有 provider 新增 UI, so that 展示覆盖仍由自己的决策负责。
8. As a 用户, I want 归档成功但重置失败被准确报告, so that 知道当前活动统计没有清零而不误以为 clear 成功。

## Preconditions

- framework 提供当前 provider、可靠 Round／活动事实，shared logic 知道自身保存是否收口；具体 observation／command delivery 接线消费[观察权威](03-observation-contract.md)，由[装配](../decision/10-assembly-layout.md)落实，不把原生 canAcceptInput 单值冒充全部保存状态。
- [存储权威](06-local-storage.md)提供安全异步读改发布和整文件归档／重置；本轮取消账号布局后的 Q25 物理 schema 仍有定点收口问题，未获批字段结构不由命令示例冻结。
- 每 provider 单账号但多 CLI 同机共享的支持前提由[消费归属原权威](02-accounting-ownership.md#账户隔离多会话与额度)持有；当前运行期认证资料由[账户访问权威](04-provider-access.md)持有。
- 此为迁移规划，支持基线不因本轮 OMP／pi 进程探针改变，不实施 pi adapter。

## Postconditions

- [装配票](../decision/10-assembly-layout.md)把同步／异步 action 的完成与错误从公共入口传到宿主，动作实现放 shared logic；复用既有声明、绑定、adapter 注册和公共反馈路径。
- [验收票](../decision/11-acceptance-cutover.md)覆盖合法／非法输入、Promise 完成与失败、三个反馈级别、无 UI 输出、provider／当前入口门控、零消费归档及归档成功重置失败；生产验收尚未执行。
- 展示与模型覆盖消费入口 detail 偏好，不将此票解释为所有 provider 的新 usage UI；无 UI 远端调度仍由展示／刷新票决定。
- 账号统计隔离政策在原权威修订；命令票只链接，物理 schema 缺口由 Backtracer 提请原题定点重审，不默选候选。

## Invariants

- framework 负责通用路由／等待／错误反馈；业务状态、provider 条件、计价、文件规则留 shared logic，不升级通用 State 或复制原生 handler。
- 延续 `defineExtension` 的纯数据声明与注入实现分离、binding 与 adapter 分工；不借 directed.unrecognized，不默改 toggle／directed 的行为。
- 复用既有 `FeedbackTransport`／`publishNotice` 和 handler 失败报告模式；通知不进入模型上下文，不新增错误打印系统。
- holiday／clear 不取消模型、不伪造 Round 结束、不维护 pending 操作；当前入口 idle 不代表所有进程静止。
- 不恢复数字预算修改，不新增 /cost 别名、多账号管理、默认动作或复杂参数解析；不把调查资产当生产验证。
