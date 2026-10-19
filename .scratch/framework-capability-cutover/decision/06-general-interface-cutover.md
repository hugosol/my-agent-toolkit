# 确定 General 操作与内部配置 seam 的隔离

Type: grilling
Status: open
Assignee: unassigned
Blocked by: 01
Parent: ../map.md

## Handoff

- 已确认的努力范围与限制见地图 Notes；本票尚无 Lighthouse，没有具体设计获批。
- 当前恢复点：从下方 Question 开始；依赖票存在时，先读取其已发布 Lighthouse，并确认其结果满足前置条件。
- 候选方案与源码事实不是政策批准；只读调研不能替代实际行为验收。
- 证据入口：framework/public.ts:76、87、122-127；framework/modules/http.ts、files.ts；framework/core/config.ts；extensions/model-cost/shared-logic/foundation/session/consumption-document.ts:44；connect-bot panel/config.ts:9。
- 本票只作决策，不修改生产代码；发布遵循 Wayfinder，普通讨论先留在对话，整票完成或暂停/保存/切换时再发布。

## Question

HTTP、协调文件更新与 Extension configuration 各自应公开哪些操作/选项/错误，如何让扩展只从 General interface 使用已有深实现？

- HttpRequestOptions、文件更新选项与错误、配置声明/可见错误的 canonical 所有权怎样确定；运行时值使用统一原则的精确入口例外。
- ConfigReader、ConfigSource、readConfig、readConfigDocument、parser/transport 工厂等如何保留为内部 seam？ConfigLoadError 与 ExtensionConfigError 分别由谁观察，不能整体搬出 core/config。
- model-cost 从 core/config 导入 describeValue 用于业务文档诊断，应如何退出该依赖？候选是扩展自有小 helper；不是已批准新增公共工具。
- 区分 Extension configuration 与 Shared configuration；代理表、runtimeDir、pi 子代理配置不因此成为扩展可读的配置 interface。
- 保持 HTTP 代理/超时/错误语义、文件锁内重读/跨进程协调/原子发布/失败分类、配置读取校验时序。不把缓存时序收敛捆绑进本次契约切换。
- 确定真实 HTTP、跨进程文件操作与配置错误的验证方式，不把再导出测试当作行为证明。

## Comments

尚未认领或开始访谈。
