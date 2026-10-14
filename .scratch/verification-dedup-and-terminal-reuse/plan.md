# 实施计划：验证去重与 Windows 终端设施复用

日期：2026-10-15

状态：实施方案，尚未实施。用户已确认以下两个优化方向的优先级；本文的接口、切片和验收标准是据现有实现提出的设计，不表示已完成实现或获逐项批准。本文不是已发布的 implementation tickets。

## 1. 目标、依据和范围

### 1.1 用户确认的两个重点

1. 重复验证优先优化：此前存在约 **25.75 agent-minutes** 的无源码变化同步阶段大范围检查。
2. 终端设施应当能够下次继续复用：首次建设与调试约 **29.9 分钟**，而成功后的三次设备复测合计仅 **3.81 秒**。重点是消除再次研究启动方法的成本，而不是压缩几秒钟的设备测量。

数字来自此前对 17 次实现、14 次集成子会话的日志分析，是历史观测，不是性能 SLA，也不能直接相加换算成主会话提前结束的时间。

### 1.2 本次交付边界

- 本次仅记录实施计划，不修改生产代码、工作流、测试或临时启动器。
- A 方向主要落在 **oh-my-wayfinder** 的 Hyper-Auto-Coding 实现；本仓库负责适用的测试约定与使用说明。
- B 方向落在 **my-agent-toolkit** 的已有 smoke、fixture、运行脚本和说明。
- 两个方向可以并行实施，最后共同做端到端验收。

### 1.3 不做什么

- 不重新设计工作流恢复、retry 派发和预算策略。
- 不建设跨项目、跨机器的通用测试结果缓存；先只复用当前工作流可追溯的验收证据。
- 不减少合同明确要求的真实宿主、最终全量检查或人工验收。
- 不建设跨平台 TUI 测试框架，不新增 Linux/macOS adapter。
- 不重写已成功的 Windows 设备测量实现，不通过伪造 TTY 或打印文本冒充设备证据。
- 不把 model-cost fixture smoke 称为真实模型请求、真实会话生命周期的宿主取证。

## 2. 现状与实施落点

| 范围 | 已有资产或机制 | 当前问题 |
|---|---|---|
| 工作流集成 | `oh-my-wayfinder/extensions/hyper-auto-coding/workflow.ts` 的票据集成、同步和合并后验证 | 无实际内容变化时仍可能派发同步 agent，重新探索并跑大套件 |
| 工作流报告与 Git 操作 | 同目录的 `subagent-host.ts`、`git.ts`、`orchestration-tool.ts` | HEAD 与文字总结不足以证明环境和测试输入未变化，不能直接用来安全跳过检查 |
| 测试证据约定 | [docs/agents/testing.md](../../docs/agents/testing.md) | 已允许条件满足时复用，但执行层尚需可靠落实，避免仅重复抄总结而重新运行 |
| 文本布局 smoke | [scripts/model-cost-detail-layout-smoke.ts](../../scripts/model-cost-detail-layout-smoke.ts) | 可 headless 运行，但只是输出文本层面的证据 |
| 真实 Windows 设备 smoke | [scripts/model-cost-detail-layout-terminal-smoke.ts](../../scripts/model-cost-detail-layout-terminal-smoke.ts) | 已支持 report、widths、device-session，但要求进程连接 console |
| 场景数据 | [scripts/support/detail-layout-fixture.ts](../../scripts/support/detail-layout-fixture.ts) | 可复用 model-cost 场景，不应把业务断言搬进通用启动器 |
| 成功的 ConPTY 启动代码 | `%TEMP%/term-evidence/conpty-session.py`、`conpty.py` | 仍在临时目录，不是新 checkout 可依赖的项目资产 |

外部仓库路径和临时文件路径仅用于实施前定位；不得成为新运行入口的隐含依赖。

## 3. A：安全地消除重复验证

### 3.1 方案原则：先删除无内容可同步的那一轮

现有 `workflow.ts:337-362` 在 `#integrate` 内依次运行：票据 worktree 的同步 agent → `mergeTicket` → 集成工作区的合并后验证 agent。实现派发说明本身已要求实现者完成前先合入最新集成分支。因此，部分同步 agent 实际没有任何内容可合入，却再次运行整套验收。

第一阶段仅解决这个场景：**当前已验收票据已包含集成 tip，工作区稳定，没有同步工作需要做，直接执行真实合并和原有合并后验证。**

这里必须区分：

- **结构性跳过同步**：Git 证明没有内容需要同步，少派发一轮同步 agent；合并后仍有本次实际验证。这是本计划要实施的优化。
- **复用旧测试结果而不执行当前检查**：必须证明相关源码、fixtures、依赖和环境一致，条件严格得多。只沿用现有测试规范，**本计划不建设自动化通用缓存，也不取消合并后验证**。

因此不需要先建设完整环境指纹平台才能取得第一阶段收益。未知环境不能被宣称与旧环境相同；由保留的合并后检查核实当前环境下的实际行为。若某条验收要求必须在合并前重新验证，则不能用快路径绕过该要求。

### 3.2 快路径准入与失效规则

必须同时满足：

1. 票据已经由主代理显式 accept，报告存在且能定位，不是仅凭 agent 自述自动接受。
2. 延续现有 clean 与 accepted-head 门禁；当前票据 HEAD 与被接受的 HEAD 一致，两个工作区没有影响验收的脏内容或残留 merge 状态。
3. 用真实 Git 判断集成 tip 是票据 HEAD 的祖先，明确返回 no-op。返回 needed 时用原同步流程；未知或异常时不做乐观跳过。
4. 记录判定时的 integration tip、ticket head/tree，并在真实合并前重新核实；中途推进、切分支或源码改变时停止当前判定，不能使用过期结论。
5. 没有必须在该阶段重新执行的明确验收要求，也没有尚待修复或待调查的问题被快路径隐藏。
6. `mergeTicket`、合并后验证、主代理 confirm、后续 review/verify/finish 均保留。

已有 clean/accepted-head 失败继续报错并要求恢复正确的工作区或重新验收，不把未验收的新代码自动送去合并。证据缺失或祖先关系无法证明时不启用快路径；不能把 Git 的异常返回码当作 no-op。

第一阶段不加入 doc-only 豁免：票据记录改变了 HEAD 也仍受现有接受流程约束，不能因为是 `.md` 就跳过。将来若要放宽，必须单独证明允许排除的路径不会被 fixture、prompt、配置或测试读取，不能统一忽略所有文档。

### 3.3 最小证据与报告身份

复用现有报告存储和执行记录，新增范围保持最小：

| 信息 | 要求 |
|---|---|
| 报告来源 | 原始报告路径、run/attempt 身份，区分当前执行和沿用的历史说明 |
| 实际执行位置 | role、cwd、对应 repository/worktree 的 HEAD 和 tree；不能一律记集成工作区的 HEAD |
| 稳定性 | 运行前后源码身份和 clean 状态；运行中已知输入改变则标记不能作为最终证据 |
| 同步决策 | `agent-sync` 或 `no-op-sync`，判定所用 integration tip、ticket head/tree 和原因 |
| 实际检查 | 沿用已有命令/结果记录要求，保留 run-specific 完整日志、真实退出码和未验证项 |
| 后续验收 | 合并结果和本次合并后验证报告，明确当前真正运行了什么 |

具体注意点：

- 现有 `#run` 在 `workflow.ts:469-471` 使用 `git.head()` 保存报告，即使运行 cwd 是票据 worktree，也可能得到集成分支的身份。先修正该来源歧义；不能把它当成被测票据内容的证明。
- no-op 是调度决策，不是新启动的 agent。记录进现有 workflow 决策/元数据或专门的 sync-decision 字段，不伪造 `SingleResult`，也不塞进与真实 executions 一一对应的 attempts 列表。
- 合并后 prompt 当前引用 `sync.path`；快路径必须改为可引用 no-op 判定证据，不能保留一个不存在的同步报告路径。
- 不能为了增加字段引入新的持久化工作流恢复系统；沿用当前报告输出与 status 表达。
- 缺日志、失败、未完成观察、环境未知和人工判断不能被旧总结改成 pass。

#### 对已有测试证据复用规则的落实

如果 agent 想沿用某条测试结果，仍必须按 `docs/agents/testing.md` 证明相关 source、fixtures、dependencies、environment 未变，并引用原命令范围与来源。HEAD/tree 相等不代表环境相等，跨 checkout 尤其不能直接套用。lockfile、宿主 patch、真实 binary、行尾、Bun/宿主版本和有效配置发生变化时，相应结果必须重新验证；无法确认也必须重验。

环境说明不得保存 token/API key 明文；动态外部 provider 状态无法稳定识别时不能承诺结果可复用。第一阶段不增加复杂环境扫描，只在现有记录中诚实保留这些限制，并依靠真实合并后/最终检查完成本次验收。

### 3.4 决策结果的可见性

no-op 时输出简短、可审计的结果，例如：

> 本轮未派发同步 agent：integration tip X 已在 accepted ticket head Y 的祖先链中，无待同步内容。未声称本轮重跑票据验收；接下来实际合并，并执行合并后检查。历史结果及其限制仍引用报告 Z。

报告必须区分三个事实：没有待同步内容、引用了哪些历史说明、当前确实执行了哪些检查。不得虚构一次“新的全绿”。

### 3.5 实施切片

| 切片 | 阻塞 | 实施内容 | 独立验收结果 |
|---|---|---|---|
| A1 判定与来源可追溯 | 无 | 在 `git.ts` 提供 no-op/needed/unknown 的只读同步判定；修正报告实际 cwd 的源码身份；保存明确来源与完整日志 | 真 Git 场景能判定是否有同步工作，报告绑定正确 worktree，不因截断摘要重跑 |
| A2 no-op 预同步快路径 | A1 | 在 `#integrate` 接入判定，不派发无内容同步 agent；补 status/报告和 postmerge prompt 的 no-op 表达 | 无变化票据少启动一轮 agent 与其大套件，`mergeTicket` 和合并后验证仍发生 |
| A3 失效与真实集成 | A2 | 覆盖非祖先、脏状态、报告不符、判定期间变化、真正 merge/冲突、合并后失败；保留现有状态转移 | 不把过期判定用于合并；需要同步的票据走原流程；失败后仍能正确修复/重验 |
| A4 使用约定与整体实测 | A3 | 对齐两个仓库的说明，真实本地分支 smoke；核对证据与调度记录的一致性 | 少了哪些进程有直接证据，最终验收仍由当前真实执行完成 |

### 3.6 验收矩阵

| 场景 | 预期 |
|---|---|
| accepted head 稳定且干净，integration 是其祖先 | 不启动同步 agent；仍真实合并、运行 postmerge 并等待 confirm |
| head 相同但工作区源码已改，或有新未跟踪测试文件 | clean 门禁拒绝，不依赖 commit tree 掩盖实际内容 |
| 已验收后新提交，即便只有票据记录 | 延续 accepted-head 门禁，不能未经重新接受就合并 |
| 依赖/宿主环境变了，但结构性没有内容可同步 | 不宣称旧测试仍有效；当前环境中的 postmerge/明确要求检查仍实际执行 |
| accepted report 缺失、来源身份不正确 | 不走快路径；先补足可追溯性或重新验收 |
| integration 包含票据未获取的真实变化 | 使用原同步路径，不能以相似 tree 或 doc-only 推测代替 |
| 判定后 integration tip 或 ticket head 改变 | 中止旧判定，重新按当前状态处理，不做带竞态的合并 |
| merge 冲突产生新内容 | 保留冲突现场，按原修复路径处理并验证最终解决内容 |
| 运行中输入改变，或 postmerge 检查失败 | 不确认集成通过；保留失败和恢复/重验流程 |
| 明确要求独立 final acceptance 或 premerge 检查 | 真正执行要求，不用 no-op 判定替代 |
| 原记录有失败、缺失项或人工项目 | 不因少派一轮 agent 而变为通过 |

现有 `workflow.test.ts` 的真实临时 Git 仓库和假 host 可观察派发次数，需增加 cwd 观测，以区分同为 integrate role 的同步与 postmerge。覆盖决策、状态和进程是否派发，不只断言报告字串。`git.test.ts` 用真实 Git 验证祖先/非祖先及冲突场景。最后再做一次非 mock 的临时本地分支 smoke，核实少派同步但仍合并/验证；不建立依赖代码文本搜索的永久测试。

## 4. B：把终端设施变成下一次可直接运行的资产

### 4.1 方案原则：沿用成功实现，隐藏启动复杂度

保留现有设备测量与 model-cost fixture，把 ConPTY 生命周期、resize、流读取、超时与清理收敛到一个启动模块。调用方只需要知道运行哪个 smoke、宽度序列、输出目录和超时，不需要掌握 Win32 句柄或自行寻找窗口。

优先保留现有成功的 Python `ctypes` 路径，避免同时移植到新的 FFI 实现。Python 是显式前提，版本和发现方式必须在实施实测后记录；不能假定所有 agent 已安装。

两个临时 Python 文件是独立版本，不互相 import。选择支持 checkpoint/resize 的 `conpty-session.py` 作为迁入基础；早期 `conpty.py` 只作历史参照，不作为第二个必须安装的依赖。建议新增 `scripts/support/conpty-session.py` 和 `scripts/model-cost-detail-layout-headless-smoke.ts`：前者管理 Windows console 会话，后者检查参数/平台、调用驱动并核验现有设备报告。这些均为待创建文件。

迁入不是原样复制：当前临时版本用裸 `" ".join(argv)` 拼命令；缺 checkpoint 后仍可最终 `os._exit(0)`，且没有可靠传播子进程退出码。必须在新入口首次交付前消除这些假绿和参数问题。已有注释还记录 `ClosePseudoConsole` 在本机可能阻塞，需通过有界进程生命周期实测，而不是假设普通 finally 一定完成清理。

- 通用启动模块负责真实 ConPTY、进程生命周期和传输。
- 现有设备 smoke 负责读取 console cell、实际列宽、颜色及 device-session。
- model-cost fixture 与业务断言仍在原脚本，不复制到启动模块。
- 第一阶段只服务现有场景，不引入配置插件系统或多种终端 adapter。

### 4.2 建议的用户接口

保留现有直接 console 运行命令，新增 headless 入口，建议命名：

```sh
bun run smoke:model-cost-detail-layout-headless --widths 120,100,60,120 --output-dir <run-directory> --timeout-ms 30000
```

这是待实现命令，目前 `package.json` 中不存在。具体文件名在实现时沿用 `scripts/` 与 `scripts/support/` 约定。

Interface 约束：

1. 在 Windows、已安装受支持 Bun/Python、没有附着 console 的情况下可直接运行。
2. 不依赖 Windows Terminal、`wt.exe`、桌面窗口或旧临时文件，不自行安装软件。
3. package 命令从仓库运行；底层脚本直接调用时从自身位置解析 repository root，不依赖调用者 cwd，支持空格与中文路径；不声称任意目录都能直接解析本仓库的 package 命令。
4. 使用 `process.execPath` 定位当前 Bun；跨进程用安全的 argument vector 和 Windows command-line quoting 传递参数，不拼接未经转义的 shell 命令。显式设置子进程 cwd，并补全 Python `CreateProcessW` 的参数类型声明。
5. `widths` 必须是有效、有限、受设备支持的正整数序列；超时也必须有界。当前协议依赖宽度变化，第一阶段拒绝相邻重复宽度；首尾重复如 120→100→60→120 用于验证恢复，允许保留。
6. 默认在 `.scratch/verification-dedup-and-terminal-reuse/runs/<run-id>/` 创建唯一输出目录；用户可指定目录，但不得覆盖已有结果。始终显式传入设备脚本的 `--report`，不使用它当前的固定临时报告名。

建议退出语义：0 表示本次设备测量与全部自动断言通过；1 表示场景/子进程/报告验证失败；2 表示参数错误或平台/依赖前提不满足；124 表示超时。Windows 不支持或 Python 缺失必须是明确的非通过结果，不能静默 skip 后计入绿灯。

### 4.3 启动、resize 和报告协议

1. 在加载设备脚本的 `kernel32.dll` 之前预检 Windows；再检查 Bun、Python、必要 ConPTY 能力以及输出目录，失败立即返回。
2. 建立唯一 run，创建 ConPTY 与管道，启动真实设备 smoke，并并发排空输出，避免输出缓冲阻塞。沿用既有成功的 std-handle 处理和继承配置，不能因为重组启动代码又退回没有真实 console handle 的状态。
3. 强制传入 `--device-session --session-passes N --report <本次路径>`，其中 N 等于 widths 数。沿用 `# pass N done, device width W` checkpoint，核对顺序、分段读取和重复情况，不靠固定 sleep 猜完成。
4. 每个 checkpoint 到达后，核对其设备实际宽度再执行下一次外部 resize。宽度以 `deviceState()` 的设备读取为准，不能用 resize 后可能不刷新的 `process.stdout.columns` 替代。
5. 有限 `--session-passes` 是正常完成的主约束：最后一次 pass 后子进程自行写完整报告并退出，驱动等真实退出码，不再无条件向已退出子进程写 `done`。stdin 的 done/EOF 只用于主动中止或原交互式路径，不允许通过提前结束把不完整 session 变为通过。
6. 验证子进程退出码、checkpoint 完整性和报告内容同时成立，才返回通过；驱动退出 0 本身不是设备通过的充分条件。
7. 外层启动入口负责整个进程树的总 deadline；无 checkpoint、创建失败、驱动卡在关闭句柄、用户取消都必须有界结束。结束前保存可取得的流和阶段错误，终止本 run 的后代进程，不能只杀 Python 而留下 Bun 子进程。

应在 B1 就交付完整有限会话、真实退出码和基本超时；B2 再通过故障与并发场景硬化，不把无条件 exit 0 或无限等待作为可交付的第一版。

### 4.4 最小证据产物

每个 run 保留：

- 完整 console stream；失败时也保留，不能只截取最后几行。
- 现有设备测量 JSON，不以启动器自己计算的文本宽度冒充 console cell 观测。
- 一份简短运行清单：run ID、源码身份、OS/Bun/Python 版本、命令及 cwd、时间、退出码、宽度序列、报告身份和自动验收结论。
- 没有成功报告时，运行清单明确写失败阶段和原因，不生成虚假的设备 pass 报告。

报告必须证明属于本次运行、位于本次独立输出目录、结构完整、涵盖全部预期宽度且全部相关观测通过。现有 JSON 没有足够关联字段时，在设备脚本和启动器中增加最小 run 关联，不以 mtime 单独证明新鲜度。

### 4.5 资源、依赖与范围

- 把临时驱动作为候选代码正式审查后迁入版本控制；保留原始来源直到新入口实测通过，不能直接把临时实验当成已达到生产要求的实现。
- 最终只保留硬化后的 session 驱动这一条受支持启动路径，不把早期定时 kill 版本并列发布；不删除本次实施以外、不属于自己的临时文件。
- 清理自己创建的进程、线程、pipe、ConPTY 句柄和 fixture 临时目录；不清理其他 run 的输出或共享缓存。显式传递/记录本 run 的 fixture 路径用于失败清理，不通过扫描并删除“运行期间新出现的所有 TEMP 目录”实现清理，以免误伤并发调用。
- 两个并发调用必须有独立输出、进程与 run ID，不共享固定临时文件名。
- 第一阶段仅宣称在实际验证的 Windows/Bun/Python 组合上可用，记录版本；不从一次通过推断全部 Windows 版本兼容。
- ConPTY device 证据不是 Windows Terminal GUI 的视觉证据。P33 的人工可读性判断仍然保留；字体、复杂 emoji 的观感不能由当前自动断言背书。

### 4.6 实施切片

| 切片 | 阻塞 | 实施内容 | 独立验收结果 |
|---|---|---|---|
| B1 入库并跑通真实 headless 路径 | 无 | 迁入 session 驱动并修正裸命令拼接、退出码、有限 pass、基本超时与清理；增加单命令入口及本次报告关联，连接现有设备 smoke | 无 console、不调用 wt.exe，完成 120→100→60→120 并生成真实设备报告；缺 pass/子进程失败不能返回成功 |
| B2 失败与资源生命周期 | B1 | 用故障和并发场景硬化取消、进程树清理、输出排空、报告新鲜度和隔离 | 启动失败/卡住/报告不完整都明确失败，没有无限轮询或遗留进程 |
| B3 干净 worktree 验收与使用说明 | B2 | 在新 worktree、新输出目录、旧临时设施不可访问的条件下运行；在 model-cost README 记录命令/前提/证据类型，在 testing.md 加发现入口 | 新 agent 只按入库说明即可完成设备检查，不再需要恢复历史启动脚本 |

### 4.7 验收矩阵

| 场景 | 预期 |
|---|---|
| 新 worktree，无附着 console，无旧临时文件参与 | 一条命令成功运行并产出本次报告 |
| 含空格、中文的 repository 和输出路径 | 参数不截断，不经 shell 错误解释 |
| 120→100→60→120 外部 resize | 每个 pass 有实际设备宽度和观测；恢复宽度后的列位置符合既有断言 |
| 中文名称、同 depth 对齐、missing 字段、颜色、窄屏续行 | 沿用现有业务观测，并验证完整数值/文档未被截断改写 |
| Python/Bun 缺失或平台不支持 | 明确 prerequisite failure，不能计入通过 |
| 子进程不存在、启动失败或提前退出 | 及时退出，保留原因，不继续等 report |
| 缺 checkpoint、子进程卡住或输出量大 | 有界超时或正常排空输出，不死锁；终止并清理本 run |
| 旧报告、缺报告、损坏 JSON 或缺少一个 pass | 明确失败，不沿用旧成功结果 |
| 两个并发 run | 产物不覆盖，身份不串线，互不清理资源 |
| 人工判断可读性 | 明确列为待人工确认，不由自动 pass 代替 |

决策/参数/错误处理可用少量确定性行为测试覆盖；最终必须有真实无 TTY 的 ConPTY smoke，不能只靠 mock 子进程通过。平台专用测试与现有全量套件保持隔离，非 Windows 的明确不支持不能伪装成设备通过。

## 5. 总体顺序、验证与交付

### 5.1 依赖图

```text
A1 → A2 → A3 → A4 ─┐
                   ├→ 联合验收与交付
B1 → B2 → B3 ──────┘
```

A 与 B 互不阻塞。B 的设备 smoke 必须真实执行；A 的复用规则不能借本次计划跳过 B 的第一次干净环境验收。

### 5.2 验证执行策略

- 迭代运行受影响文件，TypeScript 变动执行 typecheck；Python 变动验证实际启动行为，不仅检查语法。
- 切片完成运行所属分区与受影响 consumer；宿主可观察行为变更按实际影响选择对应真实 dock。
- 昂贵检查在共享工作区串行，测试开始前完成并恢复故障注入；运行中不修改相关输入。
- 保存首次完整输出；需要失败详情时读取日志，不为摘要再跑套件。
- 两个仓库分别按各自现有规范做最终验收：先核对 oh-my-wayfinder 的真实 check 入口，不能套用本仓库不存在于该仓库的脚本。
- my-agent-toolkit 最终执行 `bun run typecheck`、`bun run test` 和新 headless smoke，保留运行记录。明确任务要求的其他检查仍执行。
- 本文是文档交付：本次只核对引用和计划完整性，不声称上述实现验收已执行。

### 5.3 完成定义

A 完成：真实 no-op 场景没有启动同步 agent 和其大套件；证据引用可追溯；失效场景可靠回到原路径；最终验收未被绕过。

B 完成：新 worktree 中，从无 TTY 的 agent 进程运行一条入库命令，不依赖旧 TEMP/wt.exe 即取得本次真实设备报告；错误、超时和资源清理均有可观察验证。

联合交付保留：改动位置、实际命令与退出码、输入/环境身份、原始日志和设备报告、仍需人工判断的项目。不能只交“所有检查通过”一句话。

### 5.4 效果评估

- A 比较同样内容条件下的同步 agent 派发次数、大范围检查启动次数及进程时间；首要成功指标是重复执行次数归零，而不是承诺节省固定 26 分钟。
- B 比较新 agent 首次完成一次设备验收需要的命令数及人工/临时操作数；首要成功指标是一条命令且不需要历史文件，而不是承诺未来每次节省 30 分钟。
- 同时报告 agent 时间与主流程墙钟，不把并行任务时长直接相加当作关键路径收益。

## 6. 实施前风险与处理

| 风险 | 处理 |
|---|---|
| 现有报告可能绑定错误 worktree 或缺少来源 | 先完成 A1；无法证明 accepted 内容与来源时不启用快路径，不强制先建设完整环境指纹系统 |
| 外部 provider、动态宿主配置无法稳定识别 | 不宣称旧测试仍适用；保留当前 postmerge/最终实际检查，不为减少执行次数降低正确性 |
| 原临时 ConPTY 代码含一次性假设 | B1 先审查协议与 Win32 错误处理，再做新 worktree 真实验证 |
| Python 不在执行环境中 | 明确前提与版本，失败即停；不自动安装、不默默换另一套实现 |
| 跨两个仓库落地不一致 | A4 同步规则说明；每个仓库独立验证，分别记录版本，不把一个仓库的通过当另一个通过 |
| 新入口被误称完整视觉/宿主验收 | 明确 console cell 证据、fixture 场景、真实宿主证据、人工判断四者的差别 |

## 7. 参考

- [现有测试分层与证据复用规则](../../docs/agents/testing.md)
- [本仓库运行命令](../../package.json)
- [已有终端设备 smoke](../../scripts/model-cost-detail-layout-terminal-smoke.ts)
- [已有布局文本 smoke](../../scripts/model-cost-detail-layout-smoke.ts)
- [共享布局场景](../../scripts/support/detail-layout-fixture.ts)
- [原功能合同](../model-cost-session-time-and-detail/contract.md)
- [原功能实现与复盘记录](../model-cost-session-time-and-detail/retro/)
