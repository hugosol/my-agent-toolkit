# 取得不修改宿主的 OMP 扩展路径运行证据

Type: task
Labels: wayfinder:task
Status: open
Interaction: AFK
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 01, 02

## Question

在已选择的候选运行组合中，实际运行现有扩展或临时 extension 探针，取得后续 State、贡献和部署决策所需的宿主事实；哪些必要机制能通过扩展接口实现，哪些存在确切阻碍？

本票是执行验证以解除决策阻塞，不选择业务策略、不实现框架，也不是以重复源码阅读代替执行。前置票解决后再认领。

### 工作与完成证据

- 使用隔离配置、临时会话和原始未改动宿主。先使选定真实 loader/runner 路径可执行，记录来源、版本、命令、平台与失败阶段。不修改 agent 源码或用户全局配置；需要用户提供凭据或安装授权时说明精确前提并暂停该路径，不用 mock 宣称通过。
- 验证薄 entrypoint 导入发现目录之外的 TypeScript 及 Markdown 文本资源、依赖解析与独立扩展发现。Markdown 文本 import 不是宿主 prompts capability 发现，不据此要求改用扩展包目录。
- 经真实会话验证命令、状态 entry、启动/切换/恢复、消息追加顺序和 UI 标记；按候选模式分别记录实际可见 UI 与无 UI 条件。验证前置票选定的 restart/reload 路径。
- 经 OMP 内建子代理执行路径观察工厂绑定、身份与 parent 关联、独立 init 进度和可观察生命周期；多 owner 隔离与恢复设计需要什么信息？不要把手工传入假身份的 runner 测试称作真实 task 子代理验证。
- 捕获候选 provider 路径的真实出站消息形态，检查角色、位置、持久化与后续请求保留。可使用隔离的本地协议捕获端点，但须明确它只证明序列化/请求路径，不证明真实服务或模型服从性。观察 hook 重入、中止或准备失败时的事件/提交顺序，为后续策略提供事实，不在探针中提前实现框架事务。
- 对每条路径分别给出已观察、源码推断、未验证及阻碍；临时探针与日志作为资产从本票链接，证据进入宿主记录的单一事实来源。清理临时配置、会话与进程，不留下运行时脚手架充当产品代码。

### 已知失败与入口

绘图阶段在原仓库运行 `bun tests/codebase-tools/smoke-omp.ts`，退出码为 1，错误为 `Export named 'createRatchetPrelude' not found .../src/ratchet/prelude.js`。失败发生在宿主导入期，未进入扩展行为断言；原因未诊断，不将其归因于迁移，也不视为已知必需修补宿主。

[原 smoke](../../../../my-omp-toolkit/tests/codebase-tools/smoke-omp.ts) 使用机器相关安装路径，只能作起点，不能替代真实 UI、task、出站角色或旧新往返验收。[既有宿主证据](../../../docs/host-support.md) 与 [提示词研究](../../../docs/research/prompt-injection-research.md) 指明需要补足的证据级别。

若出现可通过额外外部知识调查解决的未知，另建精确 research 票；若候选确实无法满足要求，把阻碍交回候选支持决策，不改变用户边界。
