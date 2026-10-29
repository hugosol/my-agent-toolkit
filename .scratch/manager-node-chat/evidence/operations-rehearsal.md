# 长期部署说明：P29 技术审查与隔离演练记录

日期：2026-10-29。此记录用于长期维护及整体使用验收的技术证据汇总，**不代表 H1 已通过**。操作入口是 [OPERATIONS](../../../extensions/workflow-chat/OPERATIONS.md)，协议权威是 [README](../../../extensions/workflow-chat/README.md)。不依赖临时 spec、讨论或工作票。

## 环境与归属

- Windows 10.0.26200 x64，Bun 1.4.2；真实宿主测试使用机器基线指定的隔离 omp 18.5.0，不使用全局 agent 配置。
- toolkit 行为源码：`ca5bfb64381b770009643f91a1a6489c08736f1a`；本次仅修改长期文档与导航，没有 TypeScript 或业务行为改动。
- herdr-bot checkout：`005bad373db779639cf384e57d205423fb6cec1e`；Rust cargo 1.98.1。后端生产数据、服务配置与集成分支工作区均未修改。
- seam：独立自动入口在真实 omp 中的工具调用，以及真实后端公开详情/报告；外部 provider 和 Herdr CLI 为受控边界。不是调用内部实现代替验收。

## 部署与示例技术核对

1. 通过 `git archive HEAD` 仅导出部署所需的 framework、adapters、workflow-chat、entrypoints、package.json、bun.lock、tsconfig.json 到独立临时目录；未复制源树运行时记录或生产 Session。
2. 在该部署目录实际运行 `bun install --frozen-lockfile`：退出 **0**，14 packages installed；确认没有 `framework/.runtime`。这证明本机上锁定依赖的独立源码部署安装，不是独立入口文件自包含。
3. 使用部署中实际安装的 `yaml` 解析其 `extensions/workflow-chat/config.yaml`：读到 endpoint `http://127.0.0.1:18787`、普通预算 `30000`、collect 预算 `5460000`。这是配置文件解析，不单独声称该固定端口存在生产服务；真实请求在下面的随机端口演练中验证。
4. 用 Python `tomllib` 解析手册的 TOML 示例，对照后端实际选项目录：两条目的 id/label/agent/kind/taskType 一致，manager/node 各自的相对交付入口存在。示例绝对根路径须按部署替换。
5. 对 README 的 JSON 字面参数示例逐行执行 `json.loads`；核对长期说明、README 与仓库文档地图的本地链接及标题/显式锚点。工具检查先补充对 HTML 显式锚点的识别后通过；该过程没有发现需修改的产品行为。

## 文档完整性审查

| P29 所有技术项 | 已审查的长期归属与结论 |
| --- | --- |
| 安装、独立自动装配、稳定配置 | OPERATIONS 第 1 节提供固定提交/锁文件、依赖安装、绝对入口和 Task 固定目录片段；README 持有配置定位和启用规则。 |
| 实际协议、角色与输入职责 | README 持有 run/collect/report、身份、首次 Prompt、Task.prompt/本次 input/工具指引分工；手册链接到权威段落，不复制状态机或全量 schema。 |
| 普通/collect 预算、错误与取消 | 手册第 2/3 节和 README 的协议/故障章节区分完整正文预算、正常后端到期、客户端错误、已发生效果与人工后续决定。 |
| 信任边界、受控/真实验证范围 | 手册第 4/6 节明确 sessionId 不是秘密认证凭据、同机来源不是认证；无新增远程安全或宿主支持承诺。 |
| 长期独立可用与链接 | README 顶部和 DOCS-MAP 可发现操作手册与本记录；部署与协议理解不必打开临时文件。后端长期运行说明/选项目录是边界文档，不是本仓库协议的副本。 |
| 配置与故障演练、修正复验 | 使用已有 S1 交付入口/真实后端演练，按操作手册的独立结果判据检查；本次无实现改动，纯文档执行示例及链接检查。具体实测如下。 |

## 实际配置与处置结果

以下命令均实际执行；测试通过 Python subprocess 传入与手册 PowerShell 示例相同的两个测试环境变量并保存原始 stdout/stderr，没有修改测试或提供伪成功结果。

| 命令/检查 | 实际结果 |
| --- | --- |
| herdr-bot 根：`cargo build --manifest-path backend/Cargo.toml --example safe_shutdown_shell --bin herdr-fixture` | 退出 0；已有 dev 构建完成，1.05 秒。 |
| 演练 checkout 根：`bun install --frozen-lockfile` | 退出 0；安装 14 个依赖，1.91 秒。 |
| `bun test tests/harness-dock/role-guidance-rehearsal.test.ts` | 退出 0；1 pass / 0 fail，20 assertions，19.77 秒。复用已有 P26/S1 用例作为 P29 操作说明的实操验证，不重复造一份协议测试。 |
| `bun test tests/harness-dock/node-report.test.ts tests/harness-dock/manager-collect-budget.test.ts` | 退出 0；3 pass / 0 fail，31 assertions，6.59 秒。 |
| 本地 Markdown 链接/标题及显式锚点扫描；TOML/JSON 示例解析与实际目录对照 | 通过：66 个本地链接/锚点、15 个 JSON 样例、2 个 TOML 角色条目及全部文档测试路径；最终扫描包括本文、OPERATIONS、README、DOCS-MAP。 |

具体步骤与观察：

1. manager/node 使用各自交付的自动入口、独立复制部署与 Session，配置真实随机回环 endpoint；普通请求 2000ms、collect 5460000ms。node cwd 另放故意错误的配置（127.0.0.1:1、1ms），实际报告仍送达正确后端，排除按 cwd 误装配。
2. 材料 `handoff-26.txt` 被实际写入并读取为 `交接材料 26：UTF-8；只读样本；非生产证据。`。node 报告保存为 **`bc-d1b1077e1164`**，`saved=true`、通知 `failed`、诊断 `written`。管理者 collect 返回 `reason=notification`、`pendingReports.A=bc-d1b1077e1164`；公开详情只有一份报告，A 仍 running。没有为通知失败重新 report。
3. 原执行 **`bc-67c88ea9bd8d`** 进入执行 failed；confirmed=false 的 recover 得到 `recovery-confirmation-required`。核实可继续后 recover 恢复 running，完整 execution（含 Task、zone、Chat）与原值相同；没有新建执行。
4. 再次 failed 后，未确认 retry 得到 `retry-confirmation-required`；暂停后确认 retry 得到 `run-paused`。显式 resume 后再确认 retry，得到新执行 **`bc-3ef689a9fc7d`**，新受控原生 Chat 标识为 `rehearsal-fresh-execution-26`；previousExecutions 保留原执行。受控 CLI 的新身份不是在测试外真实启动模型的证明。
5. Agent/测试控制的人工处理实际写入并读取 `人工补齐材料 26：UTF-8；只读引用；仍未经过生产验证。`，complete.reason 写入真实地址、编码、只读用途、限制和人工补齐依据。结果 A completed，报告总数仍为一份，没有把旧报告伪造成新执行报告。这是真实文件读写与显式交接，不是生产工作质量验收。
6. 普通 60ms / collect 3000ms 时，1 秒后端期限得到正常 `reason=timeout`、完整快照，虽然另有 ready 节点也未提前返回；普通 3000ms / collect 200ms 时得到客户端 `error.kind=timeout`，没有伪造 reason/snapshot，公开后端事实不变。

### 暴露问题与修正复验

第一次调用 rehearsal 在启动场景时失败：当前测试 checkout 没有 `node_modules/yaml`（ENOENT），0 pass / 1 fail；这不是行为红灯，也不是后端/工具缺陷。此前安装的是另一份独立部署，不能满足此 checkout 中 dock 复制依赖的要求。随后在**实际运行测试的 checkout** 安装锁定依赖，上述 1+3 用例全部通过。操作手册同步补充明确 cwd、安装命令与安装失败中止检查，避免把“另一份部署已安装”误认为测试环境也已就绪。无需修改实现；最终链接/示例检查在文档修正后执行。

### 原始证据与范围

本机原始证据目录：`C:\Users\hugos\AppData\Local\Temp\workflow-operations-evidence-st9uy97g`，保存成功及初次依赖缺失的日志、后端构建日志和 `guidance-rehearsal.json`。JSON 含实际注入指引、14 条步骤观察、13 条真实工具 HTTP 记录和 16 条外部 CLI 记录；它不是模型自主决策日志。本记录保留关键观察，部署与协议理解无需依赖该临时证据目录；独立集成/汇总代理在本机可据原件核对。

`guidance-rehearsal.json`：1,922,563 bytes，SHA-256 `3ce3e83604ac141f5f080c7764bf494232d1cf79eeb2df2f2b7a75c7539a30d8`。

本次没有 TypeScript 或业务改动，因此未运行 typecheck、全仓分区或与修改无关的取消/派发 smoke。真实宿主加载、HTTP、后端落盘和文件读取均在上述隔离环境实际执行；provider/Herdr、工具选择和材料内容受控，不证明真实模型自主工作、真实 Herdr 启动模型、生产配置、跨平台支持或无限期无重试。node-report 对额外外部 CLI 调用的观察窗口为 150ms，不能据此宣称无限期静默。

所有 P29 技术项已有上面的文档审查或 S1 实操证据；未决的只有不属于本票技术签收的整体 H1 使用判断。版本支持状态仍由 [Harness support](../../../framework/docs/harness-support.md) 维护；本记录不自动提升版本、OS 或 pi 支持，也不替代新环境上线检查。
