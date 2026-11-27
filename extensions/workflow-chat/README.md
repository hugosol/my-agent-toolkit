# Workflow Chat：chief-chat、manager-chat 与 node-chat

节点执行者面向 Map Run 的一次实际执行，只负责工作与报告，不因加载工具获得管理者状态操作权。[领域词汇](GLOSSARY.md)区分 Run、执行者和交接完成。两种角色保留独立声明、实例与自动入口，不是一个工具的角色切换参数。普通 manager-only／node-only Session 仍只加载自身入口；合法嵌套管理者在同一原生 Session 同载两入口，以管理内部 Run 并向外层父 execution 报告。

部署者从[长期部署与故障处置](OPERATIONS.md)开始；实际协议与角色语义由本文维护，操作手册不建立另一套协议。隔离配置、恢复/重试、真实材料交接及通知失败的复核步骤见操作手册的[隔离配置与处置演练](OPERATIONS.md#5-隔离配置与处置演练)。

## chief-chat 固定入口与委派能力

chief 是跨需求的澄清与能力选择角色，不是 Run manager 或业务执行者。两个固定 auto 入口独立于 Suite：

```text
omp -e /absolute/my-agent-toolkit/entrypoints/omp-auto/chief-chat.ts
pi -e /absolute/my-agent-toolkit/entrypoints/pi-auto/chief-chat.ts
```

与其他角色一样部署本仓库的 framework、adapters、workflow-chat、entrypoints 和 YAML 依赖；使用下文同一个稳定 `config.yaml`，不读取当前业务 cwd 的配置。共享声明／实现位于 `chief-chat/`，宿主文件仅选择公共 adapter、配置根和自动启动策略。首次指引以 `chief-chat:tools` 写入原生历史；它说明先澄清、优先按 Bot.when 寻找能力、不亲自执行业务。指引被消费不等于真实模型遵从职责。

只读工具 `chief_definitions` 只读取已交付的 herdr-bot 公开定义接口，原样返回后端 JSON 和 HTTP 状态，不缓存或伪造命中：

| 输入 | 既有读取接口 |
| --- | --- |
| `{"kind":"bots"}` | `GET /api/scheduler/bots`（包含 when 与执行目标，仍需检查定义问题） |
| `{"kind":"tasks"}` / `{"kind":"tasks","id":"task-id"}` | `GET /api/tasks` / `GET /api/tasks/{id}` |
| `{"kind":"maps"}` / `{"kind":"maps","id":"flow.json"}` | `GET /api/scheduler/maps` / `GET /api/scheduler/maps/{name}` |
| `{"kind":"zones"}` | `GET /api/zones` |

`id` 只用于 Task 或 Map 详情，Map 使用定义文件名；工具不接受路径、endpoint、身份或额外字段，不向 GET 添加 Session 请求体。只读调用仍绑定活动原生 Session 的取消生命周期与 `requestTimeoutMs`。读取失败保留真实错误，不返回空列表冒充成功、不自动重试。

### 澄清、复用与能力缺口

首次指引把需求判断与工具启动分开：已知匹配按 Bot.when 说明复用理由，再读取实际 Task／Map 与登记 zone，核对用途、输入和材料；含糊需求先澄清，不借当前 cwd 或唯一候选暗补，不把读取失败当作无匹配。Map 明确 manager Task 与 manager zone，保留内部节点位置。

用 Bot 的 `when`、`description`、`input_rule`、`output_rule` 发现和比较能力，以实际 Task／Map 定义核实调用约束。发现能力缺口时与用户确定下一步，不内置能力建设入口。能力建设与执行原业务是不同委派，前者的批准不授权后者。缺必要信息先澄清，缺原生批准不启动。收到结果不自动扫描积压、补派工作或启动业务。

这些是模型职责指引，不是自然语言授权解析器或本机安全沙箱。

`chief_read_report {"id":"原报告ID"}` 仅在用户明确要求查看时，通过 `POST /api/chief/reports/{id}/view` 以活动原生 Session 读取完整原报告及持久接收事实；后端实时检查当前 chief，失权返回真实拒绝。只接受非空 id，不接收 Session 或归属参数，不新建接收授权（`process:false`），不重派业务。接替后的 chief 依据完整报告呈现背景、实际执行、结果、交付及待决事项，无需记得原委派。`deliverables` 是文字说明，`outputs` 提供命名成果的实际文件地址；需要理解成果时按地址读取实际文件，不从 ID 推测内容。文件不可读或含义不明就如实说明，不重做原业务。已有权威报告时不自动重复查询，也不依据读取结果擅自重发、接收确认或追加委派。

本入口不注册能力定义写入或 chief 报告发送占位工具，也不能通过 run/report 冒充其他角色；委派使用下述 chief_delegate 原生确认，不建议直接 HTTP 绕过确认。加载本入口不建立后端当前 chief 身份，herdr-bot 固定角色装配、发起／恢复与有效身份需要跨仓联调。

### 可靠接收与呈现中断

两个 chief 原生入口在 `input` admission 识别后端 `Chief report\nReport: ID` 通知，在任何模型请求前以实际活动 Session 调用 `POST /api/chief/reports/{id}/receive`。通知正文不授予资格；后端实时核验当前 chief 并持久保存接收事实。仅有效的 `received:true,process:true`、对应完整原报告与包含 `reportId/sessionId/claimId/at` 的持久接收记录可进入模型；首次处理的接收 Session 必须是本原生 Session。使用后端权威正文而非通知正文。`process:false` 的重复输入由原生层吸收，只提示已接收，不再次触发模型或询问。拒绝、存储/传输/解析失败或不完整确认同样不进模型，保持不确定事实，不重试。原生 admission 请求受部署 HTTP 预算与 20 秒上限中较小者约束，先于 OMP 的 30 秒 handler 截止；不是新的轮询或重投策略。

只有就绪／等待／暂停指示、尚无业务需求时，chief 简短回应并等待，不因新会话或角色加载查询 Bot／zone、扫描报告或启动工具。

接收确认不是模型已呈现、用户已读或业务验收。接收后、呈现前崩溃保留后端接收事实，不自动重播；用户可在当前 chief 明确要求 `chief_read_report` 查看原报告，不迁移旧上下文，不重新派发业务。入口没有启动扫描、积压队列、轮询或重试，chief 创建/恢复/重新登记及后端重启不调用这些报告操作。

## chief 报告发送

独立执行者通过固定 `entrypoints/omp-auto/chief-report.ts` 或 `entrypoints/pi-auto/chief-report.ts` 加载 `chief_report`；直接 Map manager 在原 manager-chat 中加载同一个 common 静态工具与 Session 绑定原生确认。chief-report 不冒充 node 角色，不与 manager-chat 同载；内部 node-chat 不加载 chief 工具，合法 nested manager 仍同载 manager+node。后端固定扩展登记须在实际 chief 委派的独立 Chat 启动及恢复时装配对应宿主 chief-report 入口，不因加载入口新建委派或重播业务输入；普通独立 Task 不因此获得委派关联。跨仓装配验收独立于本仓原生工具协议。工具仅向 `POST /api/chief/reports` 提交 `{sessionId,body}`，Session 取实际原生身份，后端以真实委派关联授权；工具可见、相同 Task 或模型不授予资格。不提供接收者／归属参数，内部节点仍用原 `report` 向自己的 manager 报告，嵌套 finish/can_complete 门禁不变。

`body` 保留非空 `background`、`execution`、`summary`，`result: "success"|"failure"|"blocked"`，以及文字 `deliverables: string[]` 与 `pendingDecisions: string[]`（无项明确 `[]`）。Task 通过可选 `outputs: [{id,path}]` 提交实际文件绝对地址，成功文件交付必须满足本次委派的输出要求；失败或受阻可如实报告实际部分文件，也可以不附文件。Map 正式文件由后端从已完成 Run 取得本次要求的公开子集，不重复提交地址，不缩减 Map 自身必交项。未完成的 Map 可以无文件报告失败或受阻；不为发报告强行 `finish`，也不对所有 success 设置统一 `finish` 门禁。

manager-chat 与独立 chief-report 共享同一报告指引、工具和动态回执。每次原生对话框展示包含实际 Session 的完整 HTTP JSON，只有该次明确批准才发送；聊天同意、业务完成或节点 auto 策略不替代。拒绝、关闭、取消、超时及无确认能力均不发送，不自动重试。普通 node `report` 不加入发送确认。

分别解释 `saved`、原 `report`、`notification` 与不确定事实：明确的保存失败保留后端拒绝，无有效保存回执先核实实际结果。`saved:true` 后的通知失败不撤销报告，不重做业务、不重复提交或自动补投。`submitted` 仅为 Herdr 接受输入，不是可靠接收、呈现、已读或验收。通知 `uncertain` 或请求传输／解析失败不证明外部效果未发生或回滚。


只有用户在原发送方 Chat 明确要求重发时，调用 `chief_resend_report {"id":"原报告ID"}`（独立 chief-report 与直接 manager 共用）。工具先 `GET /api/chief/reports/{id}` 核对并预览完整原 ID/原内容，再原生确认本次 `POST /api/chief/reports/{id}/resend`；请求仅加入实际 Session，不接受 body、身份或批准参数。拒绝、关闭、取消、超时、不可用、Session 结束不重发；原生迟到批准无效。未发送本次重发不抹去已读回的原保存事实，返回 `saved:true,report,sent:false`，不是撤销原报告。后端沿真实持久委派关联授权恢复的发送方；同 Task 的其他 Chat 不获资格。改内容使用 `chief_report` 的新确认和新报告身份。已接收时后端只反馈原接收事实，不再通知；`received:true` 不是呈现完成、用户已读或业务验收。不确定结果不解释成外部效果回滚，也不自动重新确认或发送。

发送、重发和接收的复核命令见[验证入口](#验证入口与已验证范围)。跨仓兼容与安全后端要求见 [Chief report compatibility acceptance](../../docs/agents/testing.md#chief-report-compatibility-acceptance)。人工恢复、崩溃后查阅、重启去重和旧 chief 失权须另用配对 herdr-bot 的真实模型专项：

```sh
python scripts/accept-chief-recovery.py --herdr-bot-worktree "$HERDR_BOT_WT" --toolkit-worktree "$TOOLKIT_WT" --backend "$HERDR_BOT_BINARY" --hosts omp,pi --paths-file "$ISOLATED_PATHS" --model-config "$GPT6_LUNA_CONFIG" --evidence-dir "$NEW_EVIDENCE_DIR"
```

从配对后端根运行。使用实际参与的源码产物、显式绝对路径、隔离配置、授权模型和新证据目录。具体配置与故障代理见后端测试说明；不要使用正常服务、用户 Chat 或用户认证。受控 dock 不能代替这一矩阵。

### 原生确认式委派

`chief_delegate` 同时支持 Task 型与 Map 型 Bot，不注册占位工具或通过 run/report 冒充其他角色。模型仅提供业务参数：

```json
{"botId":"draft-summary","zoneId":"work/worker","input":"只总结用户已修订的草稿","materials":[{"id":"draft","zoneId":"work/source","path":"draft.txt"}],"output_rule":[{"id":"summary"}]}
{"botId":"review-flow","zoneId":"work/manager","managerTaskId":"review-manager","input":"执行已确认的复核流程","materials":[]}
```

`chief_definitions(kind="zones")` 返回的 `creation.available` 仅描述新建 zone 是否可用，不是创建 Task／Map／Bot 能力的开关；已有登记 zone 仍可用于委派，创建能力按 Bot.when 与实际定义核对。

`botId` 逐字使用目录中 Bot 的 `id`，不从名称或 Map 文件名拼接；查询 Map 定义时逐字使用 `map_file`（保留 `.json`），派发前先成功读取实际 Task／Map 执行定义。`zoneId` 是已登记的稳定 ID；Map 时它只指定 manager 目录，内部节点仍使用自己的 zone。`materials` 必须显式给出（无材料为 `[]`），每项严格为 `{id,zoneId,path}`；材料路径在其登记 zone 内解析，Map 材料 ID 对应 `map_input_rule.files`；管理者可以先启动，缺少的必需材料在派发前准备齐全。Map 必须明确提供 manager 类型 `managerTaskId`，Task 禁止该字段。可选 `output_rule: [{id}]` 指定本次所需文件，不是 Bot 的文字摘要；省略表示无文件要求，Map 只可选择自己声明的公开输出。工具在预览中以 `outputRule` 传输并核对该要求，后端随委派持久保存。工具拒绝身份、previewId、批准 boolean、endpoint 和其他额外字段，不能用模型参数伪造用户批准。

工具以公共活动原生 Session 发 `POST /api/chief/delegations/preview`，加入真实 `sessionId`；后端返回 `{previewId,facts}`。工具核对 facts.request 与冻结的本次请求一致，完整展示后端解析的 Bot、Task、Map/manager、zoneBindings、材料与实际输入，以及即将提交的 `{previewId,sessionId}` JSON。完整事实不从模型摘要重构。仅当前原生批准才发 `POST /api/chief/delegations`，提交单次预览 ID，不允许批准后再指定替代业务参数。后端消费预览并重核当前 chief 资格、定义、目标、zone 和材料语义；变更返回 `delegation-preview-stale`，不自动重新预览或把旧批准转授新工作。用户重新要求后，重新核对受影响参数并取得新确认。

批准等待复用共同 `reportConfirmationTimeoutMs`（部署默认 20000ms），独立于 `requestTimeoutMs`；每次调用都重新确认。聊天同意、业务批准、能力创建批准均不替代本次原生批准。拒绝、关闭、取消、超时、无 UI、交互异常或 Session 结束不提交；迟到批准无效。预览请求不启动 Chat/Run；不提交的预览不得人工直接发 HTTP 复用。

Task 的 HTTP 202/`stage:starting` 仅表示启动请求已接受；Map 的 HTTP 201 仅表示 Run 启动结果，都不是业务完成。工具不等待执行者、不自动轮询或重试。启动失败保留后端完整 HTTP、Run/Chat、阶段与部分效果；提交后传输/解析错误保持结果不确定，不能解释为未发生或回滚。新调用需要用户的新决定与原生确认。创建结果不自动授权新业务；不提供裸定义写入、chief 报告发送或可靠接收确认占位工具。

门禁只约束该工具的委派操作，不是任意 HTTP/本机能力安全沙箱；加载入口不建立后端当前 chief 身份。固定角色装配、发起／恢复和实际有效身份仍由后端权威负责。

委派协议命令见[验证入口](#验证入口与已验证范围)。真实模型 Task 委派使用配对 herdr-bot 的 `python scripts/accept-chief-task.py`。按后端测试说明显式指定两仓、实际后端、隔离路径、授权模型和新证据目录，选择 `--hosts omp,pi`。不可用确认复用原生 headless 检查，其结果只证明协议而非真实模型行为。

## 安装与自动加载

独立交付入口仅提供 auto 模式：

| 宿主 | manager-chat（`run` / `collect`） | node-chat（`approve` / `report`） |
| --- | --- | --- |
| OMP | [`entrypoints/omp-auto/manager-chat.ts`](../../entrypoints/omp-auto/manager-chat.ts) | [`entrypoints/omp-auto/node-chat.ts`](../../entrypoints/omp-auto/node-chat.ts) |
| Pi | [`entrypoints/pi-auto/manager-chat.ts`](../../entrypoints/pi-auto/manager-chat.ts) | [`entrypoints/pi-auto/node-chat.ts`](../../entrypoints/pi-auto/node-chat.ts) |

角色 ID 分别是 `manager-chat`、`node-chat`，实例和首次指引身份各自独立，不提供手动启用命令。同载时两角色读取同一公共原生 Session 身份，后端依据明确父子关联分别授权，不由模型自报身份或选择 Run。Pi 原生验收使用本地已安装 CLI 和 workflow-chat 范围的版本下限，不要求历史精确版本。见 [Pi acceptance versions](../../docs/agents/testing.md#pi-acceptance-versions) 与 [workflow-chat 验证基线](../../framework/docs/harness-support.md#pi-workflow-chat-verification-baseline)。部署须保留本仓库的 `framework/`、`adapters/`、`extensions/workflow-chat/`、`entrypoints/startup/auto.yaml` 及 YAML 依赖；只复制入口文件不构成部署。`framework/.runtime/` 中的 owner-access 记录及原子写入暂存文件属于运行中的源 Session，不属于部署输入。

herdr-bot 的 manager/node 类型 Task 应按各自宿主固定选择对应自动入口；同一 Run 可由 OMP/Pi Task 自然组合，不另设混合模式。部署者应把后端 Task 选项目录中的角色入口指向其实际绝对路径。普通单角色的独立加载示例：

```text
omp -e /absolute/my-agent-toolkit/entrypoints/omp-auto/manager-chat.ts
omp -e /absolute/my-agent-toolkit/entrypoints/omp-auto/node-chat.ts
pi -e /absolute/my-agent-toolkit/entrypoints/pi-auto/manager-chat.ts
pi -e /absolute/my-agent-toolkit/entrypoints/pi-auto/node-chat.ts
```

入口加载后按公共启动策略自动启用；首次启用轮次由公共 Prompt 注入对应角色的完整工具指引，普通后续轮次不额外重复注入。不要同时加载另一份同 ID 扩展。无需加载或启用 connect-bot，不建立面板登记连接。**加载成功不等于已关联到 Run**：身份必须先由后端的合法派发流程关联；直接启动的任意会话会收到后端无关联拒绝，客户端不绕过该规则。

### 同一原生 Session 的双角色

合法嵌套 manager 同时使用对应宿主的两个正常入口（不是新 wrapper 或角色参数）：

```text
omp -e /absolute/my-agent-toolkit/entrypoints/omp-auto/manager-chat.ts -e /absolute/my-agent-toolkit/entrypoints/omp-auto/node-chat.ts
pi -e /absolute/my-agent-toolkit/entrypoints/pi-auto/manager-chat.ts -e /absolute/my-agent-toolkit/entrypoints/pi-auto/node-chat.ts
```

`run`／`collect` 定位内部 Run，`report` 定位外层对应父 execution。所有调用只提供各工具现有的业务参数；公共原生 Session observation 提供同一真实身份，后端以明确关联决定授权和层级。工具存在不证明关联合法，不能添加 session、Run、execution、from/to 或接收者字段绕过拒绝。普通单角色继续只加载自己的入口。

两独立实例各有 `manager-chat:tools`／`node-chat:tools` 首次指引身份，均追加到原生历史，不覆盖对方；普通轮次与恢复原 Session 不重复注入。内部 `finish` 不是 `session_end`：不关闭 Chat、不自动发报告、不批准或完成父节点。内部 finish 后须按父 execution 冻结模式独立 `approve {}`，再 `report` 交接。父层正式文件由后端从已结束子 Run 的公开成果中按父 `outputRule` 取得同名子集；子管理者不传 `outputs` 改写地址。父管理者另行显式 `complete`；中途报告用 `can_complete:false`，可不带文件，也不提前登记 Map 成果。

可复现的同载机制检查、原始材料保存方式及证据边界见 [运行手册的双角色原生 dock](OPERATIONS.md#双角色原生-dock机制验证)。这不是后端授权、真实模型遵从或完整嵌套承诺已通过的声明。

## workflow-chat 源码职责与依赖

以下分层仅约束 workflow-chat，不是 framework 的通用目录规则；本节是这些职责与依赖的唯一说明。自动发现入口、角色 ID、工具名、协议与 `config.yaml` 的定位不因源码重组改变。

```text
extensions/workflow-chat/
├── config.yaml
├── common/
│   ├── config.ts
│   ├── chief-report.ts
│   ├── requests.ts
│   ├── report-result.ts
│   └── tool-result.ts
├── chief-chat/                   # 同样的 definition/shared-logic/harnesses 分层，能力与报告查询、确认式委派
├── chief-report/                 # 独立执行者报告能力，不赋予 node 身份
├── manager-chat/
│   ├── definition.ts
│   ├── shared-logic/
│   │   ├── actions.ts
│   │   ├── implementation.ts
│   │   ├── tools/index.ts
│   │   └── prompts/
│   │       ├── index.ts
│   │       └── init.md
│   └── harnesses/
│       ├── omp.ts
│       └── pi-auto.ts
└── node-chat/
    ├── definition.ts
    ├── shared-logic/
    │   ├── report.ts
    │   ├── implementation.ts
    │   ├── tools/index.ts
    │   └── prompts/
    │       ├── index.ts
    │       └── init.md
    └── harnesses/
        ├── omp.ts
        └── pi-auto.ts
```

- `common/` 是角色共同复用的实现：`config.ts` 维护共同配置声明，`requests.ts` 通过公共 Session/HTTP 处理真实身份、请求预算、取消与响应解析。`get(sessionId, route, signal)` 使用同一活动 Session 的取消与结果解释，但不发送 JSON 请求体或内容类型。其 `postConfirmed(sessionId, route, params, {title,message}, signal, confirm)` 固定包含原生身份的完整 JSON 载荷，展示后只发送这份载荷；`confirm` 必须来自公共工具 delivery，不能用业务 boolean 或聊天同意替代。拒绝的本地 `notSent` 标记与 HTTP 结果分开，批准期间 Session 结束则不发送。`report-result.ts` 的 `workflowReportResult` 共同解释保存/通知结果：明确 `saved=false` 为错误，已保存而通知失败不撤销保存，非法回执保持不确定。common 不承载 manager 动作或 node 的参数/报告策略规则，不依赖角色目录、私有 framework 或原生 harness SDK。
- 各角色的 `definition.ts` 持有自身声明与注入策略，复用共同配置声明；首次指引正文与加载入口归 `shared-logic/prompts/`。`shared-logic/tools/` 集中工具名、label、工具和参数 description、共同参数结构及执行接入，消费 [Tool interface](../../framework/interface/tool.ts)，不维护两份宿主参数定义。
- `shared-logic/implementation.ts` 通过公共 `defineImplementation` 的静态 `tools` 槽声明工具，与会话订阅共用业务状态和清理生命周期。manager 的动作参数、路由选择与 collect，node 的 report 参数与请求仍由各自业务 module 处理；`common/tool-result.ts` 只负责共享业务结果到公共工具结果的映射。业务依赖 `common/` 和 framework interface，不依赖原生 harness SDK。
- 各角色的 `harnesses/omp.ts` 与 `harnesses/pi-auto.ts` 仅选择公共 adapter、共享声明与实现、配置根和启动策略。原生工具注册、参数映射及实际执行身份归顶层 `adapters/`；扩展不再提供原生注册或 TypeBox 声明。两宿主的角色订阅都限定 `owner`：普通角色各用自身主会话，嵌套 manager 主会话合法同载两实例，不向普通子代理传播管理权或角色入口。
- **共享实现，不共享实例**：各角色可导入同一份配置与请求代码，但各自装配独立的请求资源；配置绑定、Session 身份和请求取消资源不跨角色共用。请求生命周期按实际 Session 隔离，不以进程级或角色级单例保存共同状态。

## 首次工具指引与输入边界

三种输入各有唯一职责：`Task.prompt` 固定角色职能；后端供给基本流程事实及本次输入：管理者读取本 Run 的 Map 副本和实际 `mapInput`，普通节点分开取得 `mapInput.runInput` 的 Run 背景、节点委托、已解析材料地址与输出要求；扩展的公共 Prompt 只说明工具使用。后端把固定文本与本次工作组合为启动输入，扩展不重拼、不替换或另发固定文本，不复制 Bot 文档、整张 Map、上游完整聊天或业务文件正文。普通节点按本次委托在条件满足时读取适用业务文档，并执行与检查本次成果。管理者不加载 Map 专属业务标准，不重复验收节点；结束节点只将 Chat 交给用户继续，不加载普通节点指引、`approve` 或 `report`。

### plan_workflow 的真实业务验收

在参与的 herdr-bot worktree 先按其测试指引构建独立 `CARGO_TARGET_DIR` 后端及静态资源，并准备显式隔离依赖根和已授权真实模型。运行：

```powershell
$env:HERDR_BOT_REPO = $HERDR_BOT_WT
python (Join-Path $HERDR_BOT_WT 'scripts/test-workflow-file-handoff.py') `
  --backend (Join-Path $env:CARGO_TARGET_DIR 'debug/herdr-bot.exe') `
  --toolkit $TOOLKIT_WT --scenario plan-workflow --paths-file $ISOLATED_PATHS
```

按配对后端的测试指引准备迁移 Map、Task、Bot、隔离模型配置和只读 Skill（`grill-with-docs`、`grilling`、`domain-modeling`）。不复制用户会话或认证。使用公开 `completion` 时，在后端 `CompletionTransport` 示例选择 `plan-workflow` 场景；真实模型选择工具，Pi 执行调用并保留历史。结果只覆盖实际使用的宿主与模型传输。

分别核对用户确认方案和[成果批准](#approve-成果批准)。`report` 登记 `id=outline` 的输出并声明真实 `can_complete`，不能代替批准。manager 明确完成和派发，generate_map 从初始化命名地址读取。另核对能力缺失时保持阻塞，不自动创建 Task 或 Bot；缺少新业务管理者配置时不沿用自举配置。保留 `business-requirements.json`、`evidence.json`、真实文件和服务读回。受控 dock 不能代替这个业务验收。

完整指引由 [manager init.md](manager-chat/shared-logic/prompts/init.md)与 [node init.md](node-chat/shared-logic/prompts/init.md)持有，由各自声明引用，不要求部署者再复制到 Task。根与子管理者使用同一份工具指引；子管理者另加载节点报告指引来向父层交接。管理者与独立 chief-report 入口使用同一份 chief 报告工具指引，仅实际委派可以向 chief 报告，由后端确认资格。OMP/Pi 不分别维护业务政策。

两条隐藏、持久化的 Prompt 身份分别为 `manager-chat:tools` 与 `node-chat:tools`，使用公共 `first-enabled-run` 的分支历史规则，不另存“已注入”标记。普通轮次保留历史中的一份指引，不追加副本；切换回来也不重置。公共自动启动策略每进程只消费一次，切到新的未启用 owner 不会再次自动启用；历史分支不带该身份时，由公共规则决定首次贡献，不由角色代码另建状态机。

## 稳定配置

配置是 [`config.yaml`](config.yaml)，声明显式指定 `extensions/workflow-chat/config.yaml`，装配以自身文件位置确定仓库根目录。即使节点 cwd 中有同名配置，也不会选择它；不按 `node-chat` ID 推导其他目录，不使用环境变量或 endpoint 自动发现作业务配置回退。

```yaml
endpoint: http://127.0.0.1:18787
requestTimeoutMs: 30000
reportConfirmationTimeoutMs: 20000
approveConfirmationTimeoutMs: 60000
collectTimeoutMs: 5460000
```

- `endpoint` 为 herdr-bot 基地址；按实际部署修改后重启 Session。
- `requestTimeoutMs` 是 report 等普通请求的完整传输预算，包含响应正文。
- `reportConfirmationTimeoutMs` 是 chief 人工报告与 chief 委派的原生确认等待预算，默认 20000 毫秒。
- `approveConfirmationTimeoutMs` 仅用于 `approve` 的人工成果确认，默认 60000 毫秒，与报告确认和普通 HTTP 请求（默认 30000 毫秒）的预算独立。两个确认预算都是必填部署配置，不是模型参数；升级时须补齐部署配置，修改后重启 Session。
- `collectTimeoutMs` 是管理者长等待的独立预算，节点 report 不使用它。后端默认 5400 秒，建议客户端 5460000 毫秒（91 分钟）；没有自动同步握手，预算较长也不保证所有网络请求成功。
- 文件缺失、非法 YAML、缺少或错误类型的字段会由公共配置机制明确拒绝绑定；不静默换用 cwd 配置或其他 endpoint。正整数毫秒范围是 1..2147483647。

框架公共网络配置仍由框架维护；角色只通过[公共 HTTP](../../framework/interface/general/http.ts)请求，不复制 connect-bot 私有客户端或后端状态机。

## run 输入准备

管理者可在必需材料未齐时启动。准备输入以本 Run 冻结 Map 的 `map_input_rule.description` 和 `map_input_rule.files` 为准；实际原始说明与绑定分别从 `snapshot.mapInput.runInput` 和 `snapshot.mapInput.files` 读取。审阅已有说明和材料，只追问缺项；经授权可将材料写成文件并绑定声明的输入 ID。`inputsReady` 是独立状态；无文件及嵌套 Run 也使用同一准备动作。

```json
{"action":"prepare_inputs","fileInputs":[{"id":"source","path":"E:/work/source.txt"}],"confirmed":false,"reason":"尚缺用户确认的范围"}
{"action":"prepare_inputs","fileInputs":[{"id":"source","path":"E:/work/source.txt"}],"confirmed":true,"reason":"已按 Map 输入要求审阅现有文本和文件内容"}
```

工具使用 `POST /api/workflow/manager/prepare_inputs`，仅自动加入公共 `sessionId`；模型必须提交 `fileInputs`、boolean `confirmed`、字符串 `reason`，严格拒绝额外字段（包括绑定条目内）。`fileInputs` **完整替换** `mapInput.files`：遗漏旧 ID 删除旧绑定，`[]` 清空；不改写 `mapInput.runInput`。false 可保存有效的部分绑定，即使仍缺必需文件，且始终使 `inputsReady=false`；true 需非空 reason、全部必需文件可读，并由 agent 如实声明语义审阅完成。后端不实现逐流程内容校验；任何 supplied 绑定仍须合法、已声明、无重复且可读。

检查错误、`changed`、`stateCommitted`、`historyError` 和 `snapshot.inputsReady` 后才能派发；普通成功可用 `changed:true` 加就绪快照确认，不要求存在仅可能在部分失败时提供的 `stateCommitted`。错误/历史错误须保留处理，不当作干净成功；不确定先 status，不自动重提。dispatch/retry 在未就绪时被后端拒绝，所有必需输入须在任何业务节点启动前齐备。已执行不锁定后续输入编辑，但不会修改已冻结 execution 输入。本门槛只针对输入；Run 公开成果通过 `finish` 提交，业务成果检查仍由节点承担。

## 无 Chat 的 TypeScript 脚本节点

manager 使用原 `run`／`collect` 和自动公共 Session 身份；不新增脚本执行或接收工具，不让模型填写 Run、execution、来源或接收者。后端继续检查真实 manager 归属；chief 入口及权限不变。

后端在原 `snapshot.nodes[nodeId].execution` 返回 `kind:"typescript"`、`script` 相对路径、独立 `id`、真实 `zone`、冻结 `inputRule`／`outputRule`／`inputs`、`autoApproved:true`、`autoClose:false`。该分支**没有** taskId、agent、chat、childRunId，不补 null 或假身份，也没有节点 Session、Tab 或 Chat 可寻找或关闭。普通 Task/Map execution 仍保留原 Chat、recover、嵌套角色和 自动／人工成果批准语义；不要把所有 retry 改成无 Chat。

- `dispatch` 返回只表示已派发，不表示业务已结束。`execution.lifecycle` 的 running／succeeded／failed 与外层 node 的 pending／running／failed／completed 分开解释；生命周期结束不修改节点交接状态。逐项保留原结果、拒绝与实际效果，不因没有 Chat 判失败。
- 脚本由后端自动报告，进入原通知与 collect；无需节点模型 report 或 manual 发送确认。collect 不含正文时按 pendingReports 的报告 ID 读取已给定 messages.jsonl 或 Run 详情，不寻找脚本 Chat。报告保留原 id、type、at、runId、nodeId、executionId、body、canComplete、outputs、真实 manager to；`from:null` 加必需 `source:{kind:"typescript",script:"相对脚本路径.ts"}` 表示后端来源，不是缺少待补的发送身份。普通 Task/Map 报告仍使用原真实 Chat from，不要求新增 source。
- 脚本成功要求明确返回 success、正常退出且全部声明输出真实可读；具体业务校验由脚本实现，不能从通用成功状态推定 Bot 保存或业务材料读回。不默认要求 manager 重复脚本已完成的确定性校验。manager 阅读结论、限制、部分效果与干预事项，当前执行最新 true 只允许、而不强迫显式 complete。报告成功、业务结束和交接不同；不自动 complete 或派发下游，旧执行 true 不能完成新执行。
- 失败报告 false 不自动 fail。读取原 body 和已有的 `execution.lifecycle.failure`；通用 failure 是可选诊断，不要求固定业务结构。创建／保存 Bot 脚本提供的 stage、code、message、effects 应原样保留，分别呈现 write、readBack、materials 的 succeeded／failed／not_attempted／unknown，不把未知、缺失诊断或失败说成未发生。先显式 `run action=fail`，再按原 confirmed／reason 人工确认规则 retry；paused 先显式 resume。脚本 retry 有新 execution、无新 Chat，保留旧历史和副作用，不继承旧输出／完成资格；已结束脚本不适用 recover。Task/Map retry 仍创建新 Chat，recover 仍保留可继续的原执行与 Chat。
- Bot 保存成功而 saved/handoff 材料失败，不撤销已保存事实；不自动回滚、刷新 baseline 或因正文相同判成功，原 baseline 重跑仍可能 revision 冲突。报告保存／通知失败和业务效果分别保留，不因辅助通知失败重投业务。传输不确定先 status／记录核实，不自动重试。

在 OMP 中，直接调用 `collect` 时 ANSI 工具卡会在等待期间显示转动的 `Running…`，静默脚本或日志连接断开也不影响该指示；结束后静态显示 `Finished` 或 `Error`，并保留最终脚本日志。TSP 使用宿主原生状态。两种 OMP 视图均不展示 Collect 的原始结果 JSON（包括无日志或发生错误时），模型内容、详细结果和后端流程不变；Pi 保持原有展示。`Finished` 只说明本次等待已返回，不代表脚本或节点业务成功。

OMP 的 manager-chat 将符合后端固定 `Workflow report`／`Run:`／`node:`／`Report:` 信封的通知显示为 `📋 Workflow report`。仅原输入的文本增加前缀（同时体现在会话历史和模型上下文），正文与附件不变，不拦截、不重发，也不额外创建 widget。普通、格式不完整或已带前缀的消息不变。显示与输入回归见 `bun test tests/harness-dock/manager-script-output.test.ts`。

两宿主的受控原生专项入口是 `bun test tests/harness-dock/manager-script-protocol.test.ts`。它实际加载 OMP/Pi 正常 auto 入口（含嵌套同载），调用 run／collect 和宿主原生 read，读取真实临时 messages.jsonl，并在后续 provider 请求中观察原执行、报告、错误和部分效果；覆盖显式 complete、fail／confirmed retry、旧报告拒绝透传和身份字段拒绝。工具、adapter、HTTP 与 Session 保持真实，provider 和 HTTP 对端的结果／拒绝是受控条件。它不证明后端实际执行 TypeScript 脚本、真实状态门禁、真实模型理解或人工会话验收。保存材料及跨仓接入步骤见 [运行手册](OPERATIONS.md#无-chat-脚本的原生协议专项)。

## run 基础状态动作

manager 的 `run` 工具以 `action` 选择显式动作。传输为 `POST /api/workflow/manager/<action>`，工具移除 `action` 路由选择字段并由公共 Session 加入真实原生 `sessionId`，不接受模型自报身份。当前基础动作的独立字面样例：

```json
{"action":"status"}
{"action":"complete","nodeId":"A","reason":"按当前执行最新 true 报告显式交接；原 Chat 仍无害收尾"}
{"action":"fail","nodeId":"B","reason":"已核实缺少源文件；保留原 Chat 与部分产物"}
{"action":"pause"}
{"action":"resume"}
{"action":"finish","map_output":{"files":[{"id":"summary","path":"E:/results/q3.md"}]}}
{"action":"finish"}
```

| 动作 | 后端事实与边界 |
| --- | --- |
| status | 原样返回 `snapshot`、`ready`、`blocked`、`canFinish`；不是客户端缓存或第二套派发状态。A/B→C 中 C 必须等 A 与 B 都 completed，ready 不是已执行。 |
| complete | 首次完成要求当前 execution 最新报告的 `can_complete` 严格为 true，并继续满足 running 或执行阶段 failed 等既有状态规则；`reason` 非空且原文保留。无报告、历史缺字段、最新 false 或旧执行 true 均不能绕过门禁，人工补齐也不例外。解除依赖，不制造报告、不传材料、不启动下游、不终止原 Chat。 |
| fail | 仅将 running node 记为执行失败，保留原执行与首次原因。不暂停 Run、不重试、不终止实际 Chat。 |
| pause | 只禁止新执行，已有工作、report、核实和 complete 仍可继续；不等已有 Chat 退出。 |
| resume | 只恢复派发资格，不是普通 Chat Resume，不自动派发、重试或补发输入。 |
| finish | 以 `canFinish` 为准显式结束。结束节点成功派发仅表示将 Chat 交给用户继续，不等待其报告或完成。按 `map_output_rule.files` 一次提交所有必交的 `{id,path}` 绑定；无声明文件可省略 `map_output`。终态不重新打开 Run。 |

`finish` 将 `map_output` 作为 HTTP `mapOutput` 提交。后端检查无重复、均为已声明 ID、全部必交项和文件合法可读；拒绝不代表完成。公开读回为 `snapshot.mapOutput.files`；重复 `finish` 保留首次成果，不分批或提前登记。结束节点未来对话不能补交本次必交成果。重复 complete/fail 保留首次事实，重复 pause/resume 不重复转换；终态拒绝变更。工具保留后端 `changed`、拒绝 code/原因、`reports`、`pendingReports`、`historyError`、`stateCommitted` 与已发生效果，不把 HTTP 200 或动作取消解释成全部成功/回滚。

OMP 使用等价的 singleton object type union 避免宿主把显式可选 null 删成省略；开放命名映射与标量保留原值，校验仍由 shared logic 负责。所有动作严格拒绝额外身份或不适用字段（如 status 的 nodeId、complete 的 confirmed）。OMP 18.5.0 会修复 closed schema 并删除未知字段，因此原生 schema 刻意保留未知键供工具逐 action 拒绝，避免非法调用被“修好”后意外执行；这不是业务参数扩展。Pi schema 对业务值保留原值并说明准确类型，防止宿主在执行前转换参数，由同一份 shared logic 严格校验；例如字符串 `"false"` 不得变成确认值，数字 body 不得变成字符串。Pi 同样保留额外键以拒绝整次非法调用，而非删除身份字段后执行。缺失/非字符串字段由宿主或工具拒绝，空白 reason 的业务拒绝交由后端，不复制状态机。

管理者阅读报告中的结论、阻塞、部分效果、限制和必要干预进行编排，不默认读取成果正文做业务验收；合并、转换和必要验收由 Map 安排的 node 承担。当前执行最新 true 只允许、不强迫管理者显式 complete；人工补齐也不能绕过门禁。complete 拒绝后保留拒绝与相关最新报告信息，使用既有 collect 等待新报告，不反复对同一报告 complete；不能把 report/停轮/退出当作完成。派发、故障核实和报告等待是各自独立职责，基础动作不会代替它们。失败或不确定结果先查询现场，不自主重试。

## collect 长等待与报告待办

manager 的 `collect` 没有业务参数，调用样例为 `{}`。实际传输是 `POST /api/workflow/manager/collect`，仅自动加入公共 Session 的原生 `sessionId`；模型不得填写 Run、node、执行或接收者。它使用独立的 `collectTimeoutMs` **完整请求预算**（包括等待与正文读取），不复用 `requestTimeoutMs`。后端默认 5400 秒 = 5400000 毫秒，建议客户端 5460000 毫秒，比默认期限多 60000 毫秒；这不是自动同步配置或所有网络等待成功的保证。修改后端期限时，部署者须自行核对客户端预算。

| `reason` | 含义与处理 |
| --- | --- |
| `paused` | Run 已暂停，立即返回当前现场；已有报告及交接仍可处理。 |
| `completed` | Run 已显式结束，立即返回终态现场，不重新打开工作。 |
| `notification` | 有已保存、尚未经过 collect 检查的报告；辅助通知投递失败也不影响收取，多个通知可合并。 |
| `no-running` | 没有未检查通知且没有 running node，避免空等；根据现场显式派发、核实失败或 finish。 |
| `timeout` | 后端配置的等待期限正常到期，不改变 Run/node 状态。客户端预算耗尽是错误，不是这个正常原因。 |

结果保留后端 `snapshot`、`ready`、`blocked`、`canFinish` 和 `pendingReports`，**不包含 `reports` 或报告正文**。仍有 running node 且没有新通知时，即使有 ready node 也可能等待；扩展不轮询或自动重试业务 collect，也不强制提前返回。

请直接调用原生 `collect {}`。等待期间，工具向 `POST /api/workflow/manager/script-output` 发送同一公共 `{sessionId}`，立即读取一次，然后成功后约每 500 ms 刷新当前 Run 同层 TypeScript 节点各自最近五个逻辑行（包括未换行片段），按执行隔离，不递归子 Run，不消费通知。原生工具结果区显示节点执行状态以及距最后输出的时间，长行截断或单行横览，不折行；不使用 widget。正常结束时尽可能取得最后一帧，只在工具 `details.scriptOutput` 保留，状态与时间冻结，模型仍只收到原业务 `content`。取消或任一采样失败立即停止并标注，不取消脚本、不自动重连；新的 collect 从服务端当前尾部重新读取。原有失败诊断仍走原 Run/报告通道。

OMP 使用原生 ANSI/TSP 的同一直接调用；Pi 将 collect 注册为只供模型直接调用，即使 Suite 为 `only` 也不把该工具藏入 codemode。宿主内置的 codemode/eval 不为显式嵌套调用提供 collect 输出行，不通过 wrapper 调用，也不回退到 widget。

原生回归：`bun test tests/harness-dock/manager-script-output.test.ts tests/workflow-chat/pi-native.test.ts`。只检查渲染入口时，用 `bun test tests/harness-dock/manager-script-output.test.ts --test-name-pattern "renders native ANSI"`：从真实适配器注册的 collect 定义取得 ANSI/Pi 的 `renderResult(...).render(width)` 与 OMP 的 `describeResult(...)`，分别以旧/新帧验证原位替换、不折行和 TSP 单行模式，不访问真实用户会话或外部模型。完整回归另用已安装 OMP/Pi 和受控 HTTP/provider 验证真实更新帧、正常结束／取消／连接失败以及 UI-only 隔离。

`pendingReports` 是 node → 最新适用报告标识。按标识读取已提供的 `messages.jsonl` 或已有 Run 详情，阅读报告结论、阻塞、部分效果和限制作编排判断，不默认打开输出正文验收。collect/读取/辅助通知均不等于交接，不清除未完成待办；只有后端显式 complete 等事实改变适用待办。completed 后原执行仍可报告收尾，但不会重开待办；retry 后旧执行报告仍属旧执行历史，不能以全局最新报告替代新执行依据。旧/新报告交错、待办移除与通知检查均由后端决定，客户端不缓存或重算适用性。pendingReports 保留同一报告并非新通知，门禁拒绝不制造通知；已有通知检查后有 running 节点时 collect 继续等待新报告或正常到期。
## run 批量派发与故障恢复

以下四个动作使用同一个 `run` 工具和当前管理者原生 Session 身份，不接受额外 Run、执行、Chat 引用或目标状态。字面调用示例：

```json
{"action":"dispatch","nodes":["A","B","C"]}
{"action":"reconcile_dispatch","nodeId":"A","finding":"uncertain","reason":"人工尚不能确认原 Chat 是否创建，保留现场"}
{"action":"reconcile_dispatch","nodeId":"A","finding":"not_created","reason":"人工查阅启动拒绝并确认没有原生 Chat"}
{"action":"reconcile_dispatch","nodeId":"B","finding":"created","reason":"人工已定位原派发 agent，原 Chat 可跟踪"}
{"action":"recover","nodeId":"A","confirmed":false,"reason":"尚未核实修复，不应恢复"}
{"action":"recover","nodeId":"A","confirmed":true,"reason":"人工已补齐源文件，确认原 Chat 可以继续"}
{"action":"retry","nodeId":"A","confirmed":false,"reason":"尚未检查旧副作用，不应重试"}
{"action":"retry","nodeId":"A","confirmed":true,"reason":"人工已检查原 Chat 与部分输出，同意另起独立执行，旧副作用保留"}
```

这些是不同现场的示例，不是自动顺序执行的恢复脚本。`confirmed` 和 `reason` 必须显式提供；工具原样传递 `false`，不补成 `true`，也不替人判断自然语言依据是否充分。后端要求确认与非空依据，否则返回 `recovery-confirmation-required` / `retry-confirmation-required`。

| 动作 | 先看什么、结果意味着什么 |
| --- | --- |
| dispatch | 显式列出 `nodes`；后端逐目标落实批次。检查每个 `results` 项的 running/rejected/failed、拒绝原因、失败阶段、`effects` 与快照中的可得执行关联。一个目标失败不代表其余目标没有执行；成功项不保证携带冗余 Chat 字段，以实际快照/效果为准。 |
| reconcile_dispatch | 仅派发阶段 failed。`uncertain` 保持失败；`not_created` 在人工确认未创建且没有已知原生关联时恢复 pending，仍需另行显式 dispatch；`created` 由后端只读核实原派发效果中的 agent，关联原执行并恢复 running。不接收模型自填 Chat；无法核实身份则保持失败，不制造身份、不新建 Chat、不补发初始指示。 |
| recover | 仅 Task/Map 执行阶段 failed，人工修复并确认原 Chat 可继续；paused 也可用。保留原执行 ID、Task、zone、Chat，只恢复跟踪，不启动/Resume 进程、不补发输入、不撤销失败历史；已结束脚本不适用。 |
| retry | 仅 running Run 的执行阶段 failed；paused 返回 `run-paused`，先明确 resume（它本身不派发）。人工检查部分产物、旧副作用及 Task/Map 的旧 Chat 后，另起新执行；Task/Map 有新 Chat，脚本没有 Chat。保留旧执行历史和副作用。结果是单项 `result`，仍需核对失败阶段、已发生效果与可得关联，Task/Map 不能因失败声称没有新 Chat。 |

处置顺序先查看 status、产物与实际执行（Task/Map 还须查原 Chat）：派发不确定先 reconcile_dispatch，不用 retry 的确认跳过核实；Task/Map 执行失败而原 Chat 可继续用 recover；已结束脚本先显式 fail，必须独立重做才按确认规则 retry；人工处理后仍须当前执行最新 true 报告才允许 complete，reason 记录编排依据和限制，不伪造报告。四种动作都不撤销旧副作用，不自动重试或启动下游。HTTP 200、网络错误或取消都不等于所有目标未执行，先查事实再做下一次显式决定。

## 文件规则与派发快照

Map node 的 `input` 保留本次委托。文件 `input_rule` 可引用固定文件 `{id,type:"file",path,zone_id?}`、上游节点 `{id,type:"node",source_node_ref,node_output_ref}` 或本 Run 的单项文件输入 `{id,type:"run",run_file_ref}`。`id` 是本节点的输入身份，`*_ref` 引用来源，来源名与本地名可以不同。`run_file_ref` 引用 `mapInput.files` 中的一项，不引用 `mapInput.runInput` 文字；`node_output_ref` 必须结合 `source_node_ref` 定位。`output_rule` 只声明 `{id}`；每侧 ID 独立，材料引用不补 `blocked_by`。旧来源字段不受支持，旧 Run 离线保留，不恢复或重试，后续工作另起新 Run。派发冻结 `inputRule`、`outputRule` 及解析出的 `inputs: [{id,path}]`。Run 始终按自己的 Map 副本工作，后续输入替换不改写已派发 execution。父输入仅按同名公开 ID 接入子 Map，不寻址子图内部节点；父输出只要求子 Map 已声明公开输出的同名子集。

## report 协议与交接

模型业务参数是字符串 `body`、必填严格 boolean `can_complete` 和普通 Task 节点可用的 `outputs`（`{id,path}` 数组，id 为本次执行冻结 `output_rule` 中的局部输出 ID，不是文件名）：

```json
{"body":"摘要已生成，可供下游使用；限制：未经过生产验证。","can_complete":true,"outputs":[{"id":"summary","path":"E:/artifacts/summary.txt"}]}
{"body":"源数据不全，需要用户补齐后继续。","can_complete":false}
{"body":"已结束子 Run 并批准父成果，公开摘要可交接。","can_complete":true}
```

详细成果由业务工具或程序生成并留在文件中；body 只保留结论、阻塞、失败、部分效果、限制及必要干预，不要求重复完整成果、输出地址或框架已知身份。省略 outputs 或未提及某 ID 保留本 execution 已登记输出；同 ID 更新地址，新增 ID 按登记顺序追加，重试的新 execution 不继承。重复 ID 或冻结声明外的 ID 整份拒绝，不部分保存。Task 节点登记不是生成、复制或业务验收；地址是本次实际绝对路径。子 Map 不用报告登记地址：中途报告 `can_complete:false` 可不附文件，正式交接只从已完成子 Run 的 `mapOutput.files` 取得父层所需同名文件，不接受报告覆盖地址。

使用公共 Session 观测取得原生 sessionId，传输为 `POST /api/workflow/node/report` 的 JSON `{sessionId, body, canComplete, outputs?}`；模型字段 `can_complete` 映射为既有 HTTP camelCase `canComplete`，后端报告记录和结果也使用 `canComplete`。不让模型填写 Run、node、执行、来源或接收者，不用 Owner key、名称或 cwd 猜身份。OMP 自身可能在模型工具 schema 中加入全局追踪字段 `i`；这是宿主元数据，不是角色业务字段，OMP 在执行前移除它。

后端唯一决定并生成报告 `id`、毫秒时间 `at`、`type=report`、`runId`、`nodeId`、`executionId`、`from`、`to`，扩展原样返回，不在本地改写归属。新请求缺 can_complete、字符串 "false"、错误 body/outputs 类型或额外身份字段均拒绝，不做类型转换、补 true 或删字段后执行。body 保留既有字符串限制，包括空字符串合法；后端校验绝对路径与调用归属。历史报告缺新增字段仍可读取，但不能据此放行新请求或首次完成。部署须配套更新 toolkit 与 herdr-bot；没有旧形状新请求兼容放行。

普通 Task 报告的 `outputs` 是本次登记而非全 execution 累计快照；中途无文件报告可以省略 `outputs`。子 Map 的正式报告即使请求不带 `outputs`，也可返回后端从公开成果取得的文件。

结果保留 `saved`、`report`、`notification`、`diagnostic`、`guidance`：

| 现场 | 如何处理 |
| --- | --- |
| 保存失败：`saved=false`，通知 `not-attempted` | 保留后端 code、原因和 HTTP 错误正文，先排查保存问题；没有“已保存”的成功保证。 |
| 保存成功、通知 `failed` | 报告已提交。保留报告 ID 和通知原因，让管理者直接读取已保存报告；**不要仅因通知失败重新 report**。 |
| 保存成功、诊断 `failed` | 诊断失败不撤销报告，也不改变通知的真实结果；不自动重报。 |
| 保存成功、通知 `submitted` | 只表示辅助输入提交，不证明已阅读、严格顺序、打断 collect 或强制续轮。 |

工具文本与 details 保留后端报告、通知、诊断及拒绝事实；HTTP 状态保留于 details。已保存与结果不确定分别有明确 `guidance`，无回执不声称未保存。辅助通知或诊断失败不会把已保存报告标成工具提交失败。每次显式 report 都可能追加独立报告，不是客户端幂等更新；有新结果或需更正正文时才明确再次提交。

## approve 成果批准

两宿主提供无参数 `approve {}`，模型不提交身份、报告引用、说明、产物或摘要。正常成果先 approve 再 report；进度、问题和失败可先报告，report 不查询批准模式、不打开发送确认，也不改变批准事实。

工具使用公共 Session 请求 `POST /api/workflow/node/context {sessionId}`，读取后端真实角色对应 execution 冻结的 `executionId`、boolean `autoApproved`、`approved` 和 `approvalSource`。查询或协议错误原样保留，不推定自动、不从当前 Map 或提示词猜模式。工具在等待之前绑定该 execution，之后不重新解析身份目标。

- `autoApproved=true`：直接 `POST /api/workflow/node/approve {sessionId,executionId,source:"auto"}`，不打开确认或触发等待提醒。
- `autoApproved=false`：原生确认只问“当前会话的成果是否已达到预期，可以交接并推进后续流程？”，不要求说明或展示报告。确认实际呈现时触发 Herdr 原生等待状态提醒，不改变普通完成音。仅显式 Yes 才以 `source:"manual"` 提交原 execution。
- 拒绝、取消、超时、会话结束或无 UI 返回未批准，不将执行标为 failed；可继续工作或 report，不自动重试。仅用户后续主动请求才重新确认。等待使用独立的 `approveConfirmationTimeoutMs`（默认 60000 毫秒），期间没有后端请求或 Run 锁。
- 后端仍检查真实身份、执行新旧及冻结模式，retry 期间迟到的 Yes 不得批准新执行；原拒绝和持久化错误保留。成功回执须含原 `executionId`、`approved:true` 和匹配的 `approvalSource`；异常回执结果不确定，不声称成功或回滚。
- 批准提交不生成报告或后端通知，不自动 complete、dispatch 或 finish，也不等于 manager 验收。不需要报告或输出才能批准；批准后材料修改和追加报告不自动撤销批准。新 retry 不继承旧批准。结束节点无 node 批准职责。

已有 Chat 的持久指引不热更新；配套升级 toolkit/herdr-bot 后使用新 Chat/Run，不迁移、猜测或补写旧 Run 批准状态。chief 委派、chief 报告及原报告重发仍保留完整载荷预览和独立原生确认。

**report、停轮、退出都不等于 node completed。** 管理者须阅读报告作编排判断并显式 complete，不默认验收输出正文；普通工作节点还须本 execution 已批准；true 不自动完成或派发下游。节点等待用户确认本身不能作为 complete 依据，不由管理者替节点绕过原生确认批准，report 本身随时可发。人工补齐执行失败结果后也须当前执行最新 true 报告，不保留无报告人工完成旁路。暂停新派发不撤回既有工作。旧执行的补充报告只保留其原执行事实，不替代新执行结果。

## 故障、取消与信任边界

- 无关联、歧义、错误角色及其他准入拒绝由后端决定，扩展保留响应，不修补身份或新建连接。
- 非 2xx 结构化正文不会被压缩成状态码；已发生的保存或其他部分效果不被描述为回滚。HTTP 200 也不是整批成功保证：逐项查看 `results`、`effects`、`historyError` 和 `stateCommitted`。`stateCommitted=true` 且历史追加失败表示当前状态已经提交，不应为补历史重复执行动作。
- 已接受状态动作、dispatch 或 report 后再断开，客户端通常只能得到不确定结果。先显式 `run status` 或读取 Run 详情核对状态、执行关联、报告 ID 与外部 Chat/材料；不要把取消当成“未执行”，不要立即重做。尤其 report 可能已经保存而通知/诊断失败，重复提交会产生另一份报告。存活 Session 可接收新的显式调用，其请求不沿用上一工具的取消状态；这属于用户决定的新请求，不是自动重试。
- 网络/正文读取失败、预算耗尽、取消或非法 JSON 不生成假成功报告，也不自主重试；HTTP 200 的报告回执若不是带 boolean `saved` 的对象，同样保持结果不确定并保留原始响应。来自 HTTP 的 `sent=false` 不能伪造本地“未发请求”的证据。请求被取消不保证后端未接受。先核实已保存事实，再明确决定后续动作。
- 每个实际 Session 持有独立请求取消资源，工具 AbortSignal 和该 Session 结束信号传入公共 HTTP；工具中断、切走 Session 及进程正常结束都会终止仍在接收正文的 collect。取消覆盖完整交换，不在收到 HTTP 响应头时解绑；不能把本地返回取消等同于后端回滚。
- 正常后端到期是成功正文的 `reason: "timeout"`。主动取消为 `error.kind: "cancelled"`，客户端完整预算耗尽为 `"timeout"`，连接/正文断流为 `"transport"`，完整收到但 JSON 非法为 `"parse"`；错误不附加推测快照。HTTP 200 响应头不是成功凭证；不完整分块或 Content-Length 正文均是传输失败，不是假成功或正常到期。
- 多个终止事件竞争时保留公共 HTTP 已采用的原因，不规定“取消始终胜出”等全局优先级。工具结果含相应错误 message；Session 已被切换时，omp 可能丢弃原 Session 的工具结果，不能为它补造成功/取消快照。重新打开原 Session 后显式收取/查询保存事实。
- 后端同机来源限制不是认证；sessionId 不是秘密，沿用同机进程可能冒用身份的信任模型，不新增 token 或远程信任承诺。

## 验证入口与已验证范围

以下命令用于复核角色协议与真实宿主边界；每次运行须记录自己的环境、结果与限制。自动检查通过不等于真实模型协作或人工整体验收已通过。

```text
bun test tests/workflow-chat
bun test tests/harness-dock/node-report.test.ts
bun test tests/harness-dock/native-node-report.test.ts
bun test tests/framework/tool-confirmation-adapters.test.ts
bun test tests/harness-dock/manager-state-actions.test.ts tests/harness-dock/manager-resume-finish.test.ts
bun test tests/harness-dock/manager-collect-budget.test.ts tests/harness-dock/manager-collect-pending.test.ts
bun test tests/harness-dock/manager-collect-lifecycle.test.ts
bun test tests/framework/http-collect-budget.test.ts tests/framework/http-collect-termination.test.ts
bun test tests/harness-dock/manager-dispatch-recovery.test.ts
bun test tests/harness-dock/manager-script-protocol.test.ts
bun test tests/harness-dock/uncertain-effects.test.ts
bun test tests/harness-dock/role-prompts.test.ts tests/harness-dock/role-guidance-rehearsal.test.ts
bun run typecheck
```

- Prompt dock 核对指引与业务输入分离，以及首次、后续轮次和会话切换的原生历史。记录型 Herdr CLI 不证明真实 Herdr 发起会话。配置、报告已保存但通知失败、报告门禁及 recover/retry 的完整演练见 [操作手册](OPERATIONS.md#5-隔离配置与处置演练)。
- Report dock 核对无确认仍可报告、已保存和辅助通知失败并存，以及取消或丢失回执时保留不确定性。成果批准的原生 UI、真实门禁与交接顺序须按 [双宿主操作核对](OPERATIONS.md#成果批准运维核对omp-与-pi-分别执行) 单独验证。
- Collect 与公共 HTTP 检查区分正常到期、客户端正文预算、取消、断流和解析失败。生命周期 dock 在已收到响应头但没有正文时验证连接释放，恢复原 Session 后验证下一份报告仍可收取。它不证明取消撤销提交，也不测内部观察者数量。
- 状态、派发和恢复 dock 使用真实隔离后端，核对依赖、部分提交、身份拒绝和原 execution 与新 execution 的区别。不确定结果检查区分显式后续查询与自动重试；有界观察不能证明无限期无动作。受控 provider 或外部 CLI 不证明真实模型决策或生产网络行为。

Chief 原生协议与兼容回归：

```text
bun test tests/harness-dock/chief-role.test.ts
bun test tests/workflow-chat/chief-delegation.test.ts tests/harness-dock/chief-delegation.test.ts
bun test tests/harness-dock/native-chief-report.test.ts tests/harness-dock/native-chief-resend.test.ts tests/harness-dock/native-chief-reception.test.ts tests/harness-dock/chief-read-report.test.ts
bun test tests/workflow-chat/chief-report-recovery.test.ts tests/harness-dock/native-chief-receipt-backend.test.ts
bun test tests/harness-dock/node-report-contract.test.ts tests/harness-dock/nested-role-completion.test.ts
```

受控 native dock 覆盖原生加载、确认、结构化参数和回执、按实际文件地址读取、本地接收与去重；绑定安全壳的 dock 另核对其对应版本的后端持久接收和故障表现。两者都不是新版配对产品的端到端证据，也不证明真实模型职责或实际业务验收。跨仓范围、匹配安全壳及具名证据设置见 [Chief report compatibility acceptance](../../docs/agents/testing.md#chief-report-compatibility-acceptance)。

真实后端 dock 需要同级 herdr-bot checkout（或测试环境 `HERDR_BOT_REPO`），并先在该 checkout 构建：

```text
cargo build --manifest-path backend/Cargo.toml --example safe_shutdown_shell --bin herdr-fixture
```

`HERDR_BOT_REPO` 必须指向本次配套后端 worktree；不要选择另一份旧 checkout。并行维护多个源码副本时，可设置绝对 `CARGO_TARGET_DIR` 后构建，dock 同样从该目录读取 debug fixtures，避免使用别的 worktree 产物。

此 dock 只启动安全壳、隔离数据和记录型 Herdr CLI，实际运行 node 工具、公共 Session/HTTP、后端路由、身份关联与报告落盘；通过公开详情确认报告仍可读取、待办保留且 node 仍 running。通知失败来自真实后端调用被明确拒绝的外部 CLI。它不验证真实 Herdr 启动模型、真实模型选择材料/报告质量、manager 完整链路、跨阶段取消或 A/B→C 汇合；这些不得从该 dock 的成功推断。诊断失败受控响应只证明呈现分支，不证明真实 stderr 故障注入。

### Rust 两能力跨仓组合

从参与 herdr-bot worktree 根运行其 `python scripts/accept-rust-script-bots.py --herdr-bot-worktree "$HERDR_BOT_WT" --toolkit-worktree "$TOOLKIT_WT" --backend "$PRODUCTION_BACKEND" --static-dir "$HERDR_BOT_WT/backend/static" --native-entry "$TOOLKIT_WT/scripts/rust-script-acceptance.ts" --isolation-config "$ISOLATION_JSON" --evidence-dir "$NEW_EVIDENCE_DIR"`。所有路径绝对，证据目录全新。该入口记录两仓源码／锁文件、当前页面／二进制／安装身份、逐命令退出码、原始失败和清理结果。

`ISOLATION_JSON` 显式指定 `externalMode:"controlled-protocol-only"` 和 `bun`（1.4.4）、`node`、`piCli`、`piNode`、`ompBaselineRecordRoot`、`chrome` 的安装绝对路径；不含或发现凭据。参与 worktree 的 frozen-lock 依赖及精确 OMP dock 安装须先准备。专项原生 enabling 命令为 `bun test tests/harness-dock/manager-script-protocol.test.ts`（两宿主正常 auto 入口／嵌套同载、run／collect／read、true／false、部分效果、显式 complete／fail／retry 和旧报告拒绝）。该用例 HTTP 结果受控，不代表后端门禁或真实模型理解。

组合业务由本仓 `scripts/rust-script-acceptance.ts` 使用参与 Herdr worktree 的既有生产进程／文件夹具和本仓 `dualRoleDock`（显式真实 endpoint）执行：交付八节点 Map 的 Rust 创建、真实三路命名文件消费、Rust 合并保存、完整 Bot／目标与 revision／baseline／saved／handoff 读回，再由原生 read 消费输出、原生 manager 显式 complete。另在真实保存后制造 handoff 碰撞，实际 fail／confirmed retry，读回原 baseline 的 revision 冲突、新旧 execution／报告／输出。外部编写者和 provider 明确受控；不伪造 Rust 写入、报告或脚本 Chat，不新增接收工具，不宣称真实模型遵从。每例先保留完整文件／原生历史／HTTP／错误，再确认宿主、后端及 fixture 退出并清理临时活目录。

本仓验证命令为 `bun run typecheck`、`bun run test`、`bun run check:integrations`。关机回归必须使用配对构建的 `safe_shutdown_shell.exe` 和隔离 metadata，不能使用真实业务专项所选的后端可执行文件。安全壳、fixture 与环境变量见 [操作手册](OPERATIONS.md#无-chat-脚本的原生协议专项)。两仓结果独立。

保存证据到独占目录，不修改被测源码。人工验收须得到用户授权并在真实 manager Session 观察通知、collect、工具结果和脚本没有自己的 Chat 或 Tab。受控协议通过不是人工签收。完整步骤见配对 Herdr 仓 `docs/usage.md` 的 Rust script cross repository acceptance。
