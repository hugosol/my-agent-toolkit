# nicobailon 隔离验证：零费用预检

关联：[nicobailon 子代理扩展的本机隔离验证](../../decision/07-nicobailon-runtime-validation.md)。本报告为阶段证据，不是完整票据结论或提供方批准。

## 固定环境与观察

- Windows，本机 Node v24.18.0，实际 pi CLI 版本 1.2.0。
- npm 工件 `pi-subagents@0.78.0`，以 `npm install --prefix E:/Developer/pi-playground/wf07-iso/install --ignore-scripts --no-audit --no-fund pi-subagents@0.78.0` 隔离安装，退出 0。当前 registry 返回 npmmirror tarball；integrity/shasum、入口及依赖完整保存在 `preflight-environment.json`。安装成功不代表所有 runner 路径可运行。
- 发布入口为 `index.js`，公开 required-child-extensions 入口为 `src/api/required-child-extensions.js`，不同于源码检出的 TS 入口。
- 独立 agent、sessions、project、install、logs；显式 `--no-extensions --no-skills --no-prompt-templates --no-context-files --no-mcp`，仅加载工件和 `harness/preflight.mjs`；完整 argv 在环境记录中。环境剔除名称包含 API_KEY/TOKEN/SECRET/CREDENTIAL 的变量，未读取或注入凭据。
- 实际 RPC 宿主退出 0，成功轮 stderr 为空，无 extension_error。日常 `~/.pi/agent` 的文件路径/大小/mtime_ns 快照前后相同。

## 实际结果

- 工具注册：`subagent`、`contact_supervisor`、`bg_wait`、`subagents_enable`、`subagent_supervisor`，另有宿主内置工具。
- `subagents:rpc:v1:ready` 与 `ping` 实际返回 v1、9 个方法及 capabilities，包括 async status snapshot、fleet、必需扩展加载证据相关能力。
- `status` 返回 0 active children 和空 asyncSnapshot；`cost` 返回父/子/总计零值，unresolvedAsyncChildren=0。这里只证明无请求会话的读数，不证明付费运行费用完整。
- 真实根 session id/header 可取；公开 `registerRequiredChildExtensions` 在真实 session_start 中成功登记最小探针、requireForAllRunners=true，在 session_shutdown dispose。
- 首轮探针误用含斜杠 id `wf07-observer/v1`，候选拒绝为 unsafe id；修正为 `wf07-observer` 后通过。首轮失败证据保留，不将探针错误计作候选兼容失败。
- 未发送 prompt；没有 before_provider_request 观测，零真实子代理 execution，零 provider 调用。

## 未证明与下一步

根会话登记成功不证明子会话加载、嵌套、跨进程父链、逐请求用量、workflow、调度、续跑、取消或完整基线覆盖。需另获真实调用模型、累计 execution 次数、费用上限及未知费用/无硬上限的停止策略后继续。

原始证据：`raw/preflight-{1,2}.stdout.jsonl`、`raw/preflight-{1,2}.observer.jsonl`；工件及命令：`preflight-environment.json`；观察入口：`harness/preflight.mjs`。隔离安装暂保留供后续运行，两个预检宿主进程均已退出，未创建后台子代理或定时任务。
