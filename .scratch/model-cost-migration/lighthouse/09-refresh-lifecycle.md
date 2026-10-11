# 额度与余额在何时刷新，异步效果怎样跟随会话生命周期？：Lighthouse

> Question and discussion: [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)
>
> 部分发布：只确认初始化两源预取及首次模型请求前的收口条件；来源为[账户访问会话的 filename 定向确认](../assets/provider-access-confirmation-2026-10-12.md)。本票仍 open、未认领，Question、依赖、Handoff 与其他问题不变。

## Question

明确余额／额度的初始化、响应后更新、TTL、来源覆盖、single-flight、切换／timer／退出调度；此处只发布初始化确认，不替余下调度作答。

## Discussion

### 初始化两源预取与首次模型请求

用户要求「在发出第一条信息前，agent初始化的时候，已经要获取余额和额度信息」，并对明确归属 `09-refresh-lifecycle.md` 的提案回答「同意，非常准确」。会话初始化时，对已配置的单个 DeepSeek 账号与单个 Codex 账号并行查询余额和额度，不依赖当前模型／首次消息触发；未配置的 provider 不发查询。

首次模型请求执行前，等待初始化查询成功、失败或超时收口；可以在等待期间输入文字，不要求禁止输入。远端不可用不能保证取得数值，但必须有确定失败／超时结果；查询失败不阻断模型执行、不显示为零余额或零额度。访问资料的独立失败规则由[账户访问权威](04-provider-access.md)提供，不在此重新决定。

这不是首次模型请求之后再懒加载，也不是仅初始化当前模型的数据源。旧 onInit await 按当前模型初始化是源码事实参照，不证明新的两源预取／首请求屏障已实现。具体 hook／入口绑定、请求合并和 timeout／取消由本票与 HTTP／装配继续收口，不自行冻结旧 5s／10s 或 30s。

### 未确认范围

其他阶段的 TTL／single-flight、API 与 header 覆盖顺序、失败旧值保留、模型／会话／账号切换、迟到响应与 timer、运行期刷新等待／退出、headless 的完整调度与提示仍未决定；不能用本次初始化等待推导「所有生命周期都等待全部网络效果」。

## Decision

初始化并行预取已配置的 DeepSeek 余额与 Codex 额度，并在首次模型请求前等待查询成功／失败／超时；查询失败不阻断模型执行，输入可先进行。其余刷新生命周期与具体接线仍待本票。

## User stories

1. As a 用户, I want 初始化已尝试取得两源余额／额度, so that 第一条模型请求前就有读数或明确失败而不依赖先发消息。
2. As a 用户, I want 查询有失败／超时收口且允许先输入, so that 网络问题不会无限阻止 agent 启动或把失败伪装成零。
3. As a 开发者, I want 初始化预取独立于当前模型, so that 切换模型不成为首次取得另一 provider 读数的前提。

## Preconditions

- [账户访问](04-provider-access.md)需在初始化取得宿主当前已生效的单账号访问资料；不依赖模型请求选择账号。
- [HTTP 部分决议](05-http-capability.md)提供代理原则，其完整 timeout／取消 interface 尚未决定。
- 公共初始化事件与首次模型请求执行的等待接线由[装配决策](../decision/10-assembly-layout.md)落实，固定基线真实路径由[验收决策](../decision/11-acceptance-cutover.md)验证。

## Postconditions

- 后续不能恢复「只查询当前模型」或「首次模型请求后才预取」的初始化方案。
- 查询成功／失败／超时收口与消费保存、宿主 idle、framework Round 的完成分别处理；本确认不撤销观察权威的不设全局保存屏障。
- 原票仍未完成，其他调度问题保留；没有新增生产初始化屏障或真实远端运行证明。

## Invariants

- model-cost 调度与业务读数由 shared logic 管理，render 不请求远端、不建 timer 或更新权威态。
- 余额／额度仍是账户级内存读数，同源成对；初始化不建立第二套持久读数权威。
- 缺失／失败不等于零；局部失败不取消另一 provider 的查询，不改变宿主模型认证策略。
- 不将初始化网络等待泛化为所有观察 handler 等待全部效果，也不把输入 UI 的可用性与模型请求执行混同。
