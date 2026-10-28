# Workflow Chat：node-chat

节点执行者面向 Map Run 的一次实际执行，只负责工作与报告，不拥有管理者状态操作权。[领域词汇](GLOSSARY.md)区分 Run、执行者和交接完成。管理者与节点是独立 Session、独立声明、独立自动入口，不是一个工具的角色切换参数。

## 安装与自动加载

交付入口是 [`entrypoints/omp-auto/node-chat.ts`](../../entrypoints/omp-auto/node-chat.ts)，扩展 ID 为 `node-chat`。当前仅支持 omp，不提供手动启用命令或 pi 入口。部署须保留本仓库的 `framework/`、`adapters/`、`extensions/workflow-chat/`、`entrypoints/startup/auto.yaml` 及 YAML 依赖；只复制入口文件不构成部署。

herdr-bot 的 node 类型 Task 固定选择此自动入口，部署者应把后端 Task 选项目录中的 node 入口指向该文件的实际绝对路径。独立加载示例：

```text
omp -e /absolute/my-agent-toolkit/entrypoints/omp-auto/node-chat.ts
```

入口加载后按公共启动策略自动启用；首次启用轮次由公共 Prompt 注入节点工具指引，普通后续轮次不额外重复注入。不要同时加载另一份同 ID 扩展。无需加载或启用 connect-bot，不建立面板登记连接。**加载成功不等于已关联到 Run**：身份必须先由后端的合法派发流程关联；直接启动的任意会话会收到后端无关联拒绝，客户端不绕过该规则。

固定 Task 职能、后端传入的本次工作与扩展工具指引保持分工；扩展不重拼启动输入，不复制 Bot 文档、整张 Map 或 user_input。

## 稳定配置

配置是 [`config.yaml`](config.yaml)，声明显式指定 `extensions/workflow-chat/config.yaml`，装配以自身文件位置确定仓库根目录。即使节点 cwd 中有同名配置，也不会选择它；不按 `node-chat` ID 推导其他目录，不使用环境变量或 endpoint 自动发现作业务配置回退。

```yaml
endpoint: http://127.0.0.1:18787
requestTimeoutMs: 30000
collectTimeoutMs: 5460000
```

- `endpoint` 为 herdr-bot 基地址；按实际部署修改后重启 Session。
- `requestTimeoutMs` 是 report 等普通请求的完整传输预算，包含响应正文。
- `collectTimeoutMs` 是管理者长等待的独立预算，节点 report 不使用它。后端默认 5400 秒，建议客户端 5460000 毫秒（91 分钟）；没有自动同步握手，预算较长也不保证所有网络请求成功。
- 文件缺失、非法 YAML、缺少或错误类型的字段会由公共配置机制明确拒绝绑定；不静默换用 cwd 配置或其他 endpoint。正整数毫秒范围是 1..2147483647。

框架公共网络配置仍由框架维护；角色只通过[公共 HTTP](../../framework/interface/general/http.ts)请求，不复制 connect-bot 私有客户端或后端状态机。

## report 协议与交接

模型业务参数**只有**字符串 `body`：

```json
{"body":"结果：E:/artifacts/summary.txt；UTF-8。用法：只读引用；限制：未经过生产验证。"}
```

使用公共 Session 观测取得原生 sessionId，传输为 `POST /api/workflow/node/report` 的 JSON `{sessionId, body}`。不让模型填写 Run、node、执行、来源或接收者，不用 Owner key、名称或 cwd 猜身份。OMP 自身可能在模型工具 schema 中加入全局追踪字段 `i`；这是宿主元数据，不是角色业务字段，OMP 在执行前移除它。

后端唯一决定并生成报告 `id`、毫秒时间 `at`、`type=report`、`runId`、`nodeId`、`executionId`、`source`、`target`，扩展原样返回，不在本地改写归属。正文应有实际可读地址、用法和限制；这是交接责任，不是额外地址校验。实际后端只要求 body 为字符串，扩展不发明空字符串拒绝。

结果保留 `saved`、`report`、`notification`、`diagnostic`、`guidance`：

| 现场 | 如何处理 |
| --- | --- |
| 保存失败：`saved=false`，通知 `not-attempted` | 保留后端 code、原因和 HTTP 错误正文，先排查保存问题；没有“已保存”的成功保证。 |
| 保存成功、通知 `failed` | 报告已提交。保留报告 ID 和通知原因，让管理者直接读取已保存报告；**不要仅因通知失败重新 report**。 |
| 保存成功、诊断 `failed` | 诊断失败不撤销报告，也不改变通知的真实结果；不自动重报。 |
| 保存成功、通知 `submitted` | 只表示辅助输入提交，不证明已阅读、严格顺序、打断 collect 或强制续轮。 |

工具文本为后端 JSON；HTTP 状态及原始解析结果也保留于工具 details。辅助通知或诊断失败不会把已保存报告标成工具提交失败。每次显式 report 都可能追加独立报告，不是客户端幂等更新；有新结果或需更正正文时才明确再次提交。

**report、停轮、退出都不等于 node completed。** 管理者须读取材料、核实真实交接并显式 complete。结果已可交接时可以先报告，再继续不影响结果的收尾；暂停新派发不撤回既有工作。旧执行的补充报告只保留其原执行事实，不替代新执行结果。

## 故障、取消与信任边界

- 无关联、歧义、错误角色及其他准入拒绝由后端决定，扩展保留响应，不修补身份或新建连接。
- 非 2xx 结构化正文不会被压缩成状态码；已发生的保存或其他部分效果不被描述为回滚。
- 网络/正文读取失败、预算耗尽、取消或非法 JSON 不生成假成功报告，也不自主重试；请求被取消不保证后端未接受。先核实已保存事实，再明确决定后续动作。
- 每个实际 Session 持有独立请求取消资源，工具 AbortSignal 和该 Session 结束信号传入公共 HTTP。真正断线的跨阶段取消能力由公共 HTTP 实现提供，不能把本地返回取消等同于后端回滚。
- 后端同机来源限制不是认证；sessionId 不是秘密，沿用同机进程可能冒用身份的信任模型，不新增 token 或远程信任承诺。

## 验证入口与已验证范围

```text
bun test tests/workflow-chat
bun test tests/harness-dock/node-report.test.ts
bun run typecheck
```

测试通过真实隔离 omp 18.5.0 加载交付入口；受控 provider 仅发出预先指定的工具调用，不冒充真实模型自主工作。受控 HTTP 分别验证保存失败、已保存但通知失败、诊断失败以及空正文不被客户端拒绝；150ms 有界窗口内观察无额外请求，不证明无限期无动作。

真实后端 dock 需要同级 herdr-bot checkout（或测试环境 `HERDR_BOT_REPO`），并先在该 checkout 构建：

```text
cargo build --manifest-path backend/Cargo.toml --example safe_shutdown_shell --bin herdr-fixture
```

此 dock 只启动安全壳、隔离数据和记录型 Herdr CLI，实际运行 node 工具、公共 Session/HTTP、后端路由、身份关联与报告落盘；通过公开详情确认报告仍可读取、待办保留且 node 仍 running。通知失败来自真实后端调用被明确拒绝的外部 CLI。它不验证真实 Herdr 启动模型、真实模型选择材料/报告质量、manager 完整链路、跨阶段取消或 A/B→C 汇合；这些不得从该 dock 的成功推断。诊断失败受控响应只证明呈现分支，不证明真实 stderr 故障注入。
