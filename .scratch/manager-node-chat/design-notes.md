# manager-chat / node-chat 设计讨论

Status: contract-published

已发布 [spec](spec.md)（ready-for-agent）及[获批 contract](contract.md)。用户已依序批准 seams、审查方向和 Rapid iteration 验收模式；下一步为 /to-tickets。发布不表示产品实施或验收完成。以下讨论记录保留当时的确认边界，当前承诺与验收责任以 contract 为准。

## 已确认边界

2026-10-29，用户确认：

- 本次只实现 my-agent-toolkit 侧开发；用户说明 herdr-bot 侧开发已经完成。其实际接口仍需按代码核对，不以本说明代替验收证据。
- 以 herdr-bot 的实现确定对接契约，不自行猜测 HTTP 路由、请求响应字段或错误格式。
- manager-chat 与 node-chat 是两个独立的 auto 方式入口的 extension，分别给不同角色的 session 加载。不能将共享实现理解为合并入口或共享会话身份、内存与连接。

## 上游依据

- herdr-bot 仓库 `.scratch/workflow-map-runtime-design/spec.md`
- herdr-bot 仓库 `.scratch/workflow-map-runtime-design/contract.md`（approved）

沿用上游已批准行为：manager 工具为 run、collect；node 工具为 report。后端拥有归属检查与状态事实，扩展消费公共 Session、Prompt 和 HTTP 能力，不依赖 connect-bot 开关，不复制后端状态机。

## 当前状态

已静态核对后端实际协议和 toolkit 接入能力，未运行产品或测试。当前没有需要新增的产品行为选择，等待用户确认共同理解后才开始产品实现。本文件不是实施 spec、完整 wire contract 或产品验收报告。

## 核对结果

- 长期协议依据是 herdr-bot 的 `docs/workflow-runtime.md` 与 `docs/workflow-contract.md`，逐字段以实际后端请求类型为准。
- 工具 run 的 action 映射到 POST `/api/workflow/manager/<action>`，collect 与 report 分别为 POST `/api/workflow/manager/collect` 和 `/api/workflow/node/report`。扩展自动在 JSON 中携带 `sessionId`，模型不填运行归属。
- 实际 dispatch 字段为 `nodes`；recover/retry 还要求 `confirmed`。reconcile_dispatch 请求为 `nodeId/finding/reason`，created 分支根据后端保留的派发效果重新核实原生身份，不接受模型提交 Chat 引用。这比临时 spec 的参数描述更具体，按用户确认的后端实现为准。
- HTTP 200 不等于全部效果成功；需要保留逐项失败、`historyError`/`stateCommitted`、report 的保存/通知/诊断结果。非 2xx 正文也不能丢弃。取消不承诺撤销已接受的状态动作。
- collect 默认后端等待 5400 秒，长期文档建议调用方默认预算 5460000 毫秒；请求预算独立配置且大于后端期限。必须覆盖响应正文读取期间的取消，不重试、不伪造快照。
- herdr-bot 已固定引用 `entrypoints/omp-auto/manager-chat.ts` 与 `entrypoints/omp-auto/node-chat.ts`，未注入 endpoint 或请求预算。
- 两独立声明显式接入 auto startup policy；共用业务目录拟采用 `extensions/workflow-chat/`，各自拥有会话资源。配置以显式 config.path 和稳定 configBaseDir 定位，不依赖 node cwd。
- 公共 Prompt 的 first-enabled-run 和 Session 原生身份已有能力；公共 HTTP 缺调用方取消，需要补齐并贯通工具中断及会话结束。
- 静态 integration demand 检查目前假设一个收集范围仅一个 definition ID；双角色装配需一并处理实际检查器兼容，不能只建入口。

## 证据位置

后端：`backend/src/lib.rs:304-315`、`backend/src/runs/recovery.rs:21-80`、`backend/src/runs/collect.rs:29-89`、`backend/src/runs/reports.rs:97-138`、`meta-data/task-options.toml:67-82`、`docs/workflow-runtime.md:568-604`。

Toolkit：`entrypoints/startup/auto.yaml`、`framework/core/startup.ts:63-97`、`framework/core/config.ts:212-227`、`framework/interface/prompt.ts:13-23`、`framework/interface/general/http-contract.ts:2-24`、`framework/modules/http.ts:592-638`、`scripts/integrations/demand.ts:247-294`。

## 实施前最终确认

待用户确认：按已批准上游行为和上述实际协议，在 toolkit 交付两个独立 auto 角色扩展、必要公共能力及检查器适配、角色指引和长期对接文档；不修改 herdr-bot，不增加协议发现、自动重试或第二套状态机。真实对接证据与隔离检查分别报告，不将后端已完成解释为 toolkit 已验收。
