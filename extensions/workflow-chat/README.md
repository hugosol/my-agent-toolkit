# Workflow Chat：chief-chat、manager-chat 与 node-chat

节点执行者面向 Map Run 的一次实际执行，只负责工作与报告，不因加载工具获得管理者状态操作权。[领域词汇](GLOSSARY.md)区分 Run、执行者和交接完成。两种角色保留独立声明、实例与自动入口，不是一个工具的角色切换参数。普通 manager-only／node-only Session 仍只加载自身入口；合法嵌套管理者在同一原生 Session 同载两入口，以管理内部 Run 并向外层父 execution 报告。

部署者从[长期部署与故障处置](OPERATIONS.md)开始；实际协议与角色语义由本文维护，操作手册不建立另一套协议。隔离配置、恢复/重试、真实材料交接及通知失败的复核步骤见操作手册的隔离配置与处置演练章节。

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

无匹配时，单执行者缺口选择既有完整创建 Task 能力 Bot，多步骤缺口选择完整创建 Map 能力 Bot，按 when 和实际定义而非名称或创建者自身执行类型判断；无有效能力则说明受阻，不发明工具或保存裸 Task。仅否决复用时等待，明确创建 Task／Map 才核对相应能力，明确放弃则停止。缺必要信息先澄清，缺原生批准不启动。创建 input 不夹带创建后执行业务的指令，既有每阶段审批仍生效，创建授权不代替新业务批准。启动回执不是最终交付；最终结果后呈现、询问是否满足并等待，不自动检索下一方案、请求下一执行确认或启动新业务。

这些是模型职责指引，不是自然语言授权解析器或本机安全沙箱。`tests/harness-dock/chief-role.test.ts` 检查真实原生 provider 请求中的指引消费；受控 provider 不证明 GPT-6-luna 实际澄清／选择／等待。

`chief_read_report {"id":"原报告ID"}` 仅在用户明确要求查看时，通过 `POST /api/chief/reports/{id}/view` 以活动原生 Session 读取完整原报告及持久接收事实；后端实时检查当前 chief，失权返回真实拒绝。只接受非空 id，不接收 Session 或归属参数，不新建接收授权（`process:false`），不重派业务。新 chief 可仅凭报告的 background、execution、result、summary、deliverables、pendingDecisions 呈现成功、失败、受阻或能力创建结果，逐项明确说明原始需求背景与授权限制、实际执行对象、结果、交付物及待判断项；受阻或无交付物也不省略背景与执行对象。未知明确说未知，呈现后询问是否满足要求并等待，不发起下一执行确认、不启动业务。已给出完整权威报告时直接据此呈现，不调用 read、shell、HTTP 等工具自行读取或核验交付物，不重做报告中的操作；按报告来源转述，未知保留为未知。

本入口不注册能力定义写入或 chief 报告发送占位工具，也不能通过 run/report 冒充其他角色；委派使用下述 chief_delegate 原生确认，不建议直接 HTTP 绕过确认。加载本入口不建立后端当前 chief 身份，herdr-bot 固定角色装配、发起／恢复与有效身份需要跨仓联调。`bun test tests/harness-dock/chief-role.test.ts` 的受控 provider 只证明两宿主原生加载、指引消费和真实后端定义读回，不认领真实模型职责或完整发起／恢复验收。

### 可靠接收与呈现中断

两个 chief 原生入口在 `input` admission 识别后端 `Chief report\nReport: ID` 通知，在任何模型请求前以实际活动 Session 调用 `POST /api/chief/reports/{id}/receive`。通知正文不授予资格；后端实时核验当前 chief 并持久保存接收事实。仅有效的 `received:true,process:true`、对应完整原报告与包含 `reportId/sessionId/claimId/at` 的持久接收记录可进入模型；首次处理的接收 Session 必须是本原生 Session。使用后端权威正文而非通知正文。`process:false` 的重复输入由原生层吸收，只提示已接收，不再次触发模型或询问。拒绝、存储/传输/解析失败或不完整确认同样不进模型，保持不确定事实，不重试。原生 admission 请求受部署 HTTP 预算与 20 秒上限中较小者约束，先于 OMP 的 30 秒 handler 截止；不是新的轮询或重投策略。

只有就绪／等待／暂停指示、尚无业务需求时，chief 简短回应并等待，不因新会话或角色加载查询 Bot／zone、扫描报告或启动工具。

接收确认不是模型已呈现、用户已读或业务验收。接收后、呈现前崩溃保留后端接收事实，不自动重播；用户可在当前 chief 明确要求 `chief_read_report` 查看原报告，不迁移旧上下文，不重新派发业务。入口没有启动扫描、积压队列、轮询或重试，chief 创建/恢复/重新登记及后端重启不调用这些报告操作。

## chief 报告发送

独立执行者通过固定 `entrypoints/omp-auto/chief-report.ts` 或 `entrypoints/pi-auto/chief-report.ts` 加载 `chief_report`；直接 Map manager 在原 manager-chat 中加载同一个 common 静态工具与 Session 绑定原生确认。chief-report 不冒充 node 角色，不与 manager-chat 同载；内部 node-chat 不加载 chief 工具，合法 nested manager 仍同载 manager+node。后端固定扩展登记须在实际 chief 委派的独立 Chat 启动及恢复时装配对应宿主 chief-report 入口，不因加载入口新建委派或重播业务输入；普通独立 Task 不因此获得委派关联。跨仓装配验收独立于本仓原生工具协议。工具仅向 `POST /api/chief/reports` 提交 `{sessionId,body}`，Session 取实际原生身份，后端以真实委派关联授权；工具可见、相同 Task 或模型不授予资格。不提供接收者／归属参数，内部节点仍用原 `report` 向自己的 manager 报告，嵌套 finish/can_complete 门禁不变。

body 必须完整包含非空 `background`、`execution`、`summary`，`result: "success"|"failure"|"blocked"`，以及 `deliverables: string[]`、`pendingDecisions: string[]`（无项明确 `[]`）。每次原生对话框展示包含实际 Session 的完整 HTTP JSON，只有该次明确批准才发送；聊天同意、业务完成或节点 auto 策略不替代。拒绝、关闭、取消、超时及无确认能力均不发送，不自动重试。

分别解释 `saved`、原 `report`、`notification` 与不确定事实：保存不等于通知；`submitted` 仅为 Herdr 接受输入，不是可靠接收、呈现、已读或验收。`failed`／`not-attempted` 不撤销保存，`uncertain` 及传输／解析错误不证明未发生或回滚。工具不为通知失败重提业务报告，不自动补投。


只有用户在原发送方 Chat 明确要求重发时，调用 `chief_resend_report {"id":"原报告ID"}`（独立 chief-report 与直接 manager 共用）。工具先 `GET /api/chief/reports/{id}` 核对并预览完整原 ID/原内容，再原生确认本次 `POST /api/chief/reports/{id}/resend`；请求仅加入实际 Session，不接受 body、身份或批准参数。拒绝、关闭、取消、超时、不可用、Session 结束不重发；原生迟到批准无效。未发送本次重发不抹去已读回的原保存事实，返回 `saved:true,report,sent:false`，不是撤销原报告。后端沿真实持久委派关联授权恢复的发送方；同 Task 的其他 Chat 不获资格。改内容使用 `chief_report` 的新确认和新报告身份。已接收时后端只反馈原接收事实，不再通知；`received:true` 不是呈现完成、用户已读或业务验收。不确定结果不解释成外部效果回滚，也不自动重新确认或发送。

原生发送/恢复协议回归：`bun test tests/harness-dock/native-chief-report.test.ts tests/harness-dock/native-chief-resend.test.ts tests/harness-dock/native-chief-reception.test.ts tests/harness-dock/chief-read-report.test.ts`。两宿主使用真实原生加载、Session、工具、input admission 与确认，只替换 provider 和 HTTP 对端；受控接收用例持有后端确认，观察确认前无模型请求，并检查重复通知不再调用模型。

`bun test tests/harness-dock/native-chief-receipt-backend.test.ts` 保留原生路径并连接配对真实后端/隔离持久存储，区别 Herdr 接受输入和可靠接收；外部 Herdr CLI 及 provider 仍受控，不证明真实模型职责。

共同工具边界与失权/修改内容拒绝见 `bun test tests/workflow-chat/chief-report-recovery.test.ts`。原生重发拒绝用例明确配置 HTTP 与确认预算各 500ms，每次拒绝/关闭/取消/超时/Session 结束及迟到批准后观察 600ms 无 POST；该入口没有维护定时器。接收用例通过持有确认的事件同步证明顺序，不以即时断言声称覆盖时间流逝或重启。

跨仓恢复矩阵由参与的 herdr-bot worktree 中 `python scripts/accept-chief-recovery.py --herdr-bot-worktree "$HERDR_BOT_WT" --toolkit-worktree "$TOOLKIT_WT" --backend "$HERDR_BOT_BINARY" --hosts omp,pi --paths-file "$ISOLATED_PATHS" --model-config "$GPT6_LUNA_CONFIG" --evidence-dir "$NEW_EVIDENCE_DIR"` 执行。显式绝对路径、当前源码产物、独占定义／存储／原生进程／Herdr／HOME／APPDATA／XDG 和全新证据目录；实际 GPT-6-luna 再次原生批准／拒绝原报告、接收后呈现前终止进程、新 chief 明确查看、并发／丢失回执／后端重启去重，以及独立 Chat／直接 manager 新进程恢复分别留证。每次无自动行为窗口46秒，覆盖45秒服务就绪与10＋30＋5秒维护上界、30秒请求／原生启动、20秒确认，不添加产品等待／重投策略。受控故障只证明机制；缺任一宿主、实际模型返回身份或进程退出证据均非零，不以本仓 dock 通过代替矩阵。模型配置、验收专用通知故障代理构建与独立只读授权 Codex 传输见配对 Herdr 的现有测试说明；正常服务／用户 Chat／认证不作为可变夹具。

全链路人工恢复/崩溃/无自动行为和旧 chief 跨宿主失权须使用对应真实模型专项，不从这些协议检查推断。已有节点兼容检查仍由 `native-report-confirmation.test.ts`、`node-report-contract.test.ts`、`nested-role-completion.test.ts` 维护。

### 原生确认式委派

`chief_delegate` 同时支持 Task 型与 Map 型 Bot，不注册占位工具或通过 run/report 冒充其他角色。模型仅提供业务参数：

```json
{"botId":"draft-summary","zoneId":"work/worker","input":"只总结用户已修订的草稿","materials":[{"id":"draft","zoneId":"work/source","path":"draft.txt"}]}
{"botId":"review-flow","zoneId":"work/manager","managerTaskId":"review-manager","input":"执行已确认的复核流程","materials":[]}
```

`chief_definitions(kind="zones")` 返回的 `creation.available` 仅描述新建 zone 是否可用，不是创建 Task／Map／Bot 能力的开关；已有登记 zone 仍可用于委派，创建能力按 Bot.when 与实际定义核对。

`botId` 逐字使用目录中 Bot 的 `id`，不从名称或 Map 文件名拼接；查询 Map 定义时逐字使用 `map_file`（保留 `.json`），派发前先成功读取实际 Task／Map 执行定义。`zoneId` 是已登记的稳定 ID；Map 时它只指定 manager 目录，内部节点仍使用自己的 zone。`materials` 必须显式给出（无材料为 `[]`），每项严格为 `{id,zoneId,path}`；材料路径在其登记 zone 内解析，Map 的 ID 对应 `input_files`。Map 必须明确提供 manager 类型 `managerTaskId`，Task 禁止该字段；用途与必需材料由后端权威检查。工具拒绝身份、previewId、批准 boolean、endpoint 和其他额外字段，不能用模型参数伪造用户批准。

工具以公共活动原生 Session 发 `POST /api/chief/delegations/preview`，加入真实 `sessionId`；后端返回 `{previewId,facts}`。工具核对 facts.request 与冻结的本次请求一致，完整展示后端解析的 Bot、Task、Map/manager、zoneBindings、材料与实际输入，以及即将提交的 `{previewId,sessionId}` JSON。完整事实不从模型摘要重构。仅当前原生批准才发 `POST /api/chief/delegations`，提交单次预览 ID，不允许批准后再指定替代业务参数。后端消费预览并重核当前 chief 资格、定义、目标、zone 和材料语义；变更返回 `delegation-preview-stale`，不自动重新预览或把旧批准转授新工作。用户重新要求后，重新核对受影响参数并取得新确认。

批准等待复用共同 `reportConfirmationTimeoutMs`（部署默认 20000ms），独立于 `requestTimeoutMs`；每次调用都重新确认。聊天同意、业务批准、能力创建批准均不替代本次原生批准。拒绝、关闭、取消、超时、无 UI、交互异常或 Session 结束不提交；迟到批准无效。预览请求不启动 Chat/Run；不提交的预览不得人工直接发 HTTP 复用。

Task 的 HTTP 202/`stage:starting` 仅表示启动请求已接受；Map 的 HTTP 201 仅表示 Run 启动结果，都不是业务完成。工具不等待执行者、不自动轮询或重试。启动失败保留后端完整 HTTP、Run/Chat、阶段与部分效果；提交后传输/解析错误保持结果不确定，不能解释为未发生或回滚。新调用需要用户的新决定与原生确认。能力缺口只能委派已存在的完整创建能力 Bot，创建结果不自动授权新业务；不提供裸定义写入或 chief 报告/接收占位工具。

门禁只约束该工具的委派操作，不是任意 HTTP/本机能力安全沙箱；加载入口不建立后端当前 chief 身份。固定角色装配、发起／恢复和实际有效身份仍由后端权威负责。

`bun test tests/harness-dock/chief-role.test.ts` 覆盖原生加载、指引消费与真实定义读回。`bun test tests/workflow-chat/chief-delegation.test.ts tests/harness-dock/chief-delegation.test.ts` 覆盖本工具的受控协议／故障，包括两宿主 Task/Map 批准、拒绝、取消、超时、不可用、会话结束、迟到批准、完整预览与启动/不确定结果。原生子进程不能使用测试进程的假时钟：协议用例明确设置确认与 HTTP 预算 2000ms，在工具结果后观察 2100ms 无新增提交；chief 无后台维护/重试周期。受控 provider/HTTP 不证明 GPT-6-luna 职责、真实后端变更检测或真实 Task/Map 模型验收；跨仓专项另行承担。Task 专项入口是参与 herdr-bot worktree 的 `python scripts/accept-chief-task.py`（显式两仓、后端、paths、GPT-6-luna 配置与新证据目录，`--hosts omp,pi`）；真实模型自行选择工具并修正 zone/业务要求，原生拒绝/取消/超时/目标与位置变化不得派发，批准后的独立执行者未完成时 chief 仍能处理下一输入。不可用确认直接复用这里的两个 Task headless case，不复制场景；`WORKFLOW_PROMPT_EVIDENCE_DIR` 同样保留 Pi headless 的原始 JSON 输出、退出状态、provider capture 和原生历史。该材料明确标注受控协议，不当作 GPT-6-luna 行为成功。

## 安装与自动加载

独立交付入口仅提供 auto 模式：

| 宿主 | manager-chat（`run` / `collect`） | node-chat（`report`） |
| --- | --- | --- |
| OMP | [`entrypoints/omp-auto/manager-chat.ts`](../../entrypoints/omp-auto/manager-chat.ts) | [`entrypoints/omp-auto/node-chat.ts`](../../entrypoints/omp-auto/node-chat.ts) |
| Pi | [`entrypoints/pi-auto/manager-chat.ts`](../../entrypoints/pi-auto/manager-chat.ts) | [`entrypoints/pi-auto/node-chat.ts`](../../entrypoints/pi-auto/node-chat.ts) |

角色 ID 分别是 `manager-chat`、`node-chat`，实例和首次指引身份各自独立，不提供手动启用命令。同载时两角色读取同一公共原生 Session 身份，后端依据明确父子关联分别授权，不由模型自报身份或选择 Run。Pi 本次验证基线为精确 `1.4.0`，不替换 OMP 基线；验证范围与环境见 [Harness support](../../framework/docs/harness-support.md#pi-workflow-chat-verification-baseline)。部署须保留本仓库的 `framework/`、`adapters/`、`extensions/workflow-chat/`、`entrypoints/startup/auto.yaml` 及 YAML 依赖；只复制入口文件不构成部署。`framework/.runtime/` 中的 owner-access 记录及原子写入暂存文件属于运行中的源 Session，不属于部署输入；角色 dock 复制源码时同样排除此目录，避免全局并行测试复制正在被重命名的暂存文件。

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

两独立实例各有 `manager-chat:tools`／`node-chat:tools` 首次指引身份，均追加到原生历史，不覆盖对方；普通轮次与恢复原 Session 不重复注入。内部 `finish` 不是 `session_end`：不关闭 Chat、不自动生成外报或完成父节点，随后仍可独立 report。外层 `report_policy=manual` 只约束本 Session 的外报，每次仍须由 report 工具在当前 Chat 展示待发送内容并取得用户明确发送批准；内部 auto 报告、内部 finish 或业务确认均不替代外报发送确认，也不改变内部节点自己的策略。

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

三种输入各有唯一职责：`Task.prompt` 固定角色职能；后端本次 input 提供本次 `userInput`、node 业务 input、已解析的命名输入地址、运行说明及状态/历史/报告记录的路径；扩展的公共 Prompt 只说明工具使用。后端把固定文本与本次工作组合为启动输入，扩展不重拼、不替换或另发固定文本，不复制 Bot 文档、整张 Map、上游完整聊天或业务文件正文。node 按已给定命名地址消费文件，不自行筛选报告猜路径；缺失输出由业务 node 报告阻塞。

### plan_workflow 的真实业务验收

在参与的 herdr-bot worktree 先按其测试指引构建独立 `CARGO_TARGET_DIR` 后端及静态资源，并准备显式隔离依赖根和已授权真实模型。运行：

```powershell
$env:HERDR_BOT_REPO = $HERDR_BOT_WT
python (Join-Path $HERDR_BOT_WT 'scripts/test-workflow-file-handoff.py') `
  --backend (Join-Path $env:CARGO_TARGET_DIR 'debug/herdr-bot.exe') `
  --toolkit $TOOLKIT_WT --scenario plan-workflow --paths-file $ISOLATED_PATHS
```

入口加载参与 worktree 的实际迁移 Map、规划／转换 Task、Bot 与本仓实际角色入口，保留隔离部署的所有路径、宿主和模型映射。只读 Skill 依赖是显式 `pi_agent/skills` 下的 `grill-with-docs`、`grilling` 和 `domain-modeling`，不复制用户会话／auth。若使用公开 `completion` 真实文本传输，按 herdr-bot 测试指引的 `CompletionTransport` 示例启动，仅把场景改为 `plan-workflow`；传输不预设工具调用或模拟结果，实际 Pi 执行工具并维护原生历史。结果只适用于实际被测宿主／模型传输，不自动扩展到 OMP。

规划业务的用户确认不归角色工具推断：实际 outline Chat 先收需求，再接收修订，用户明确确认九章节当前方案后，还须单独确认 manual 报告发送。`report` 登记 `outputs` 中 `id=outline` 的条目 并声明真实 `can_complete`，不能替代任何确认；manager 读取报告后显式完成与派发，generate_map 读取初始化命名地址而非报告搜索。主成功链路预置真实合法汇总／核对能力；另一独立缺口场景必须保留真实能力阻塞，不创建 Task/Bot 或派发能力创建者。新业务管理者配置未提供时不挪用自举配置、不预检，也不自动发起生成 Map。

证据由 `business-requirements.json` 的启动前独立业务要求和 `evidence.json` 的 P27/P28 映射组织，包含原生用户确认输入、全部工具／HTTP、真实文件与服务读回、报告／执行／完成引用以及所有干预和失败。缺依赖、确认未发生、未真正保存／读回或不合法推进均非零；普通角色／dock 回归不能代替真实业务验收。两仓检查、隔离配置与清理要求沿用各自测试指引。

完整指引由 [manager init.md](manager-chat/shared-logic/prompts/init.md)与 [node init.md](node-chat/shared-logic/prompts/init.md)持有，由各自声明引用，不要求部署者再复制到 Task。manager 的首次指引覆盖全部十一种 run action、collect 五种 reason 与完整等待预算、报告标识查阅、依赖与终态、派发核实、recover/retry、当前执行最新报告完成门禁、拒绝后 collect 等待及部分效果；node 的首次指引覆盖报告策略、如实声明 can_complete、简短编排报告、命名 outputs、允许后续收尾、报告不等于完成，以及已保存但通知失败不重报。

两条隐藏、持久化的 Prompt 身份分别为 `manager-chat:tools` 与 `node-chat:tools`，使用公共 `first-enabled-run` 的分支历史规则，不另存“已注入”标记。普通轮次保留历史中的一份指引，不追加副本；切换回来也不重置。公共自动启动策略每进程只消费一次，切到新的未启用 owner 不会再次自动启用；历史分支不带该身份时，由公共规则决定首次贡献，不由角色代码另建状态机。

## 稳定配置

配置是 [`config.yaml`](config.yaml)，声明显式指定 `extensions/workflow-chat/config.yaml`，装配以自身文件位置确定仓库根目录。即使节点 cwd 中有同名配置，也不会选择它；不按 `node-chat` ID 推导其他目录，不使用环境变量或 endpoint 自动发现作业务配置回退。

```yaml
endpoint: http://127.0.0.1:18787
requestTimeoutMs: 30000
reportConfirmationTimeoutMs: 20000
collectTimeoutMs: 5460000
```

- `endpoint` 为 herdr-bot 基地址；按实际部署修改后重启 Session。
- `requestTimeoutMs` 是 report 等普通请求的完整传输预算，包含响应正文。
- `reportConfirmationTimeoutMs` 是 manual 报告与 chief 委派的用户确认等待预算，默认部署值 20000 毫秒；统一配置，不是模型参数。升级时须在部署配置中加入此字段，修改后重启 Session。
- `collectTimeoutMs` 是管理者长等待的独立预算，节点 report 不使用它。后端默认 5400 秒，建议客户端 5460000 毫秒（91 分钟）；没有自动同步握手，预算较长也不保证所有网络请求成功。
- 文件缺失、非法 YAML、缺少或错误类型的字段会由公共配置机制明确拒绝绑定；不静默换用 cwd 配置或其他 endpoint。正整数毫秒范围是 1..2147483647。

框架公共网络配置仍由框架维护；角色只通过[公共 HTTP](../../framework/interface/general/http.ts)请求，不复制 connect-bot 私有客户端或后端状态机。

## run 输入准备

所有新 Run（包括无文件的 Run）及历史缺少 `inputsReady` 的 Run 均从输入未就绪开始。manager 先读取该 Map 唯一的 `input_requirements`（缺省 `""`），审阅已提供的文本和文件正文，只追问缺项；经授权将材料写入明确命名的文件，并绑定 Map 声明的输入 ID。`request`、`materials` 等 ID 没有特殊语义。嵌套 Run 使用同一规则，不能借用外层准备状态。

```json
{"action":"prepare_inputs","fileInputs":[{"id":"source","path":"E:/work/source.txt"}],"confirmed":false,"reason":"尚缺用户确认的范围"}
{"action":"prepare_inputs","fileInputs":[{"id":"source","path":"E:/work/source.txt"}],"confirmed":true,"reason":"已按 Map 输入要求审阅现有文本和文件内容"}
```

工具使用 `POST /api/workflow/manager/prepare_inputs`，仅自动加入公共 `sessionId`；模型必须提交 `fileInputs`、boolean `confirmed`、字符串 `reason`，严格拒绝额外字段（包括绑定条目内）。`fileInputs` **完整替换** Run 绑定：省略旧 ID 删除旧绑定，`[]` 清空。false 可保存有效的部分绑定，即使仍缺必需文件，且始终使 `inputsReady=false`；true 需非空 reason、全部必需文件可读，并由 agent 如实声明语义审阅完成。后端不实现逐流程内容校验；任何 supplied 绑定仍须合法、已声明、无重复且可读。

检查错误、`changed`、`stateCommitted`、`historyError` 和 `snapshot.inputsReady` 后才能派发；普通成功可用 `changed:true` 加就绪快照确认，不要求存在仅可能在部分失败时提供的 `stateCommitted`。错误/历史错误须保留处理，不当作干净成功；不确定先 status，不自动重提。dispatch/retry 在未就绪时被后端拒绝，所有必需输入须在任何业务节点启动前齐备。已执行不锁定后续输入编辑，但不会修改已冻结 execution 输入。本门槛只针对输入，不增加输出复核或输出就绪规则，成果验收仍由 Map 的 node 承担。

## 无 Chat 的 Rust 脚本节点

manager 使用原 `run`／`collect` 和自动公共 Session 身份；不新增脚本执行或接收工具，不让模型填写 Run、execution、来源或接收者。后端继续检查真实 manager 归属；chief 入口及权限不变。

后端在原 `snapshot.nodes[nodeId].execution` 返回 `kind:"rust_script"`、`rustScript:"create_blank_bot"|"save_bot_guides"`、独立 `id`、真实 `zone`、冻结 `inputRule`／`outputRule`／`inputs`、`reportPolicy:"auto"`、`autoClose:false`。该分支**没有** taskId、agent、chat、childRunId，不补 null 或假身份，也没有节点 Session、Tab 或 Chat 可寻找或关闭。普通 Task/Map execution 仍保留原 Chat、recover、嵌套角色和 auto/manual 报告确认语义；不要把所有 retry 改成无 Chat。

- `dispatch` 返回只表示已派发，不表示业务已结束。`execution.lifecycle` 的 running／succeeded／failed 与外层 node 的 pending／running／failed／completed 分开解释；生命周期结束不修改节点交接状态。逐项保留原结果、拒绝与实际效果，不因没有 Chat 判失败。
- 脚本由后端自动报告，进入原通知与 collect；无需节点模型 report 或 manual 发送确认。collect 不含正文时按 pendingReports 的报告 ID 读取已给定 messages.jsonl 或 Run 详情，不寻找脚本 Chat。报告保留原 id、type、at、runId、nodeId、executionId、body、canComplete、outputs、真实 manager to；`from:null` 加必需 `source:{kind:"rust_script",rustScript:能力值}` 表示后端来源，不是缺少待补的发送身份。普通 Task/Map 报告仍使用原真实 Chat from，不要求新增 source。
- Rust 的 true 建立在确定性业务检查、合法保存、完整读回和必要材料检查之上；不要求 manager 模型重复确定性 Rust 业务验收。manager 阅读结论、限制、部分效果与干预事项，当前执行最新 true 只允许、而不强迫显式 complete。报告成功、业务结束和交接不同；不自动 complete 或派发下游，旧执行 true 不能完成新执行。
- 失败报告 false 不自动 fail。读取原 body 和 `execution.lifecycle.failure:{stage,code,message,effects}`，分别呈现 write、readBack、materials 的 succeeded／failed／not_attempted／unknown，不把未知或失败说成未发生。先显式 `run action=fail`，再按原 confirmed／reason 人工确认规则 retry；paused 先显式 resume。脚本 retry 有新 execution、无新 Chat，保留旧历史和副作用，不继承旧输出／完成资格；已结束脚本不适用 recover。Task/Map retry 仍创建新 Chat，recover 仍保留可继续的原执行与 Chat。
- Bot 保存成功而 saved/handoff 材料失败，不撤销已保存事实；不自动回滚、刷新 baseline 或因正文相同判成功，原 baseline 重跑仍可能 revision 冲突。报告保存／通知失败和业务效果分别保留，不因辅助通知失败重投业务。传输不确定先 status／记录核实，不自动重试。

两宿主的受控原生专项入口是 `bun test tests/harness-dock/manager-script-protocol.test.ts`。它实际加载 OMP/Pi 正常 auto 入口（含嵌套同载），调用 run／collect 和宿主原生 read，读取真实临时 messages.jsonl，并在后续 provider 请求中观察原执行、报告、错误和部分效果；覆盖显式 complete、fail／confirmed retry、旧报告拒绝透传和身份字段拒绝。工具、adapter、HTTP 与 Session 保持真实，provider 和 HTTP 对端的结果／拒绝是受控条件。它不证明后端 Rust 执行、状态门禁、真实模型理解或 H1/P34、H2/P35 会话闭环已完成，也不重复认领后端验收。保存材料及跨仓接入步骤见 [运行手册](OPERATIONS.md#无-chat-脚本的原生协议专项)。

## run 基础状态动作

manager 的 `run` 工具以 `action` 选择显式动作。传输为 `POST /api/workflow/manager/<action>`，工具移除 `action` 路由选择字段并由公共 Session 加入真实原生 `sessionId`，不接受模型自报身份。当前基础动作的独立字面样例：

```json
{"action":"status"}
{"action":"complete","nodeId":"A","reason":"按当前执行最新 true 报告显式交接；原 Chat 仍无害收尾"}
{"action":"fail","nodeId":"B","reason":"已核实缺少源文件；保留原 Chat 与部分产物"}
{"action":"pause"}
{"action":"resume"}
{"action":"finish"}
```

| 动作 | 后端事实与边界 |
| --- | --- |
| status | 原样返回 `snapshot`、`ready`、`blocked`、`canFinish`；不是客户端缓存或第二套派发状态。A/B→C 中 C 必须等 A 与 B 都 completed，ready 不是已执行。 |
| complete | 首次完成要求当前 execution 最新报告的 `can_complete` 严格为 true，并继续满足 running 或执行阶段 failed 等既有状态规则；`reason` 非空且原文保留。无报告、历史缺字段、最新 false 或旧执行 true 均不能绕过门禁，人工补齐也不例外。解除依赖，不制造报告、不传材料、不启动下游、不终止原 Chat。 |
| fail | 仅将 running node 记为执行失败，保留原执行与首次原因。不暂停 Run、不重试、不终止实际 Chat。 |
| pause | 只禁止新执行，已有工作、report、核实和 complete 仍可继续；不等已有 Chat 退出。 |
| resume | 只恢复派发资格，不是普通 Chat Resume，不自动派发、重试或补发输入。 |
| finish | running/paused 且全部 node completed 才可结束，活动 Chat 不阻止。终态 `canFinish=false`，不重新打开 Run。 |

重复 complete/fail 保留首次事实，重复 pause/resume 不重复转换，重复 finish 返回首次结束事实；终态拒绝变更。工具保留后端 `changed`、拒绝 code/原因、`reports`、`pendingReports`、`historyError`、`stateCommitted` 与已发生效果，不把 HTTP 200 或动作取消解释成全部成功/回滚。

OMP 使用等价的 singleton object type union 避免宿主把显式可选 null 删成省略；开放命名映射与标量保留原值，校验仍由 shared logic 负责。所有动作严格拒绝额外身份或不适用字段（如 status 的 nodeId、complete 的 confirmed）。OMP 18.5.0 会修复 closed schema 并删除未知字段，因此原生 schema 刻意保留未知键供工具逐 action 拒绝，避免非法调用被“修好”后意外执行；这不是业务参数扩展。Pi 1.4.0 会在工具执行前转换带类型的参数，因此 Pi schema 对业务值保留原值并说明准确类型，由同一份 shared logic 严格校验；例如字符串 `"false"` 不得变成确认值，数字 body 不得变成字符串。Pi 同样保留额外键以拒绝整次非法调用，而非删除身份字段后执行。缺失/非字符串字段由宿主或工具拒绝，空白 reason 的业务拒绝交由后端，不复制状态机。

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

结果保留后端 `snapshot`、`ready`、`blocked`、`canFinish` 和 `pendingReports`，**不包含 `reports` 或报告正文**。仍有 running node 且没有新通知时，即使有 ready node 也可能等待；扩展不强制提前返回、不轮询、不自动重试。

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

Map node 的 `input` 工作文本保持原样；文件交接使用 `input_rule` 数组（`{id,type:"file",path}` 或 `{id,type:"node",node_id,output_id}`）与 `output_rule: [{id}]`，无交接时缺省为空。每个数组内 ID 唯一，输出 ID 为节点局部标识而非文件名；引用须指向已声明 node 和 output_id。输入引用不隐含 `blocked_by` 依赖。派发冻结规则至 execution 的 `inputRule`/`outputRule`，内部规则字段仍为 snake_case；真正解析的文件另存 `inputs: [{id,path}]`。Map 后续修改不会改变冻结执行。新派发的三个字段均为数组（无交接时为 `[]`）；迁移历史中无法证明原声明或实际解析结果时，`inputRule`、`outputRule`、`inputs` 为 `null`，不能从部分报告反推完整声明。未知冻结输出声明的历史 execution 新报告会被后端以 `output-rule-unknown` 拒绝，不按当前 Map 猜测。必需上游输出尚未登记时派发报错，不猜地址、不启动工作。

## report 协议与交接

模型业务参数是字符串 `body`、必填严格 boolean `can_complete` 和可选 `outputs`（`{id,path}` 数组，id 为本次执行冻结 `output_rule` 中的局部输出 ID，不是文件名）：

```json
{"body":"摘要已生成，可供下游使用；限制：未经过生产验证。","can_complete":true,"outputs":[{"id":"summary","path":"E:/artifacts/summary.txt"}]}
{"body":"草稿已生成；源数据不全，需要用户补齐后继续。","can_complete":false,"outputs":[{"id":"draft","path":"D:/external/draft.txt"}]}
{"body":"无文件工作已可交接。","can_complete":true}
```

详细成果由业务工具或程序生成并留在文件中；body 只保留结论、阻塞、失败、部分效果、限制及必要干预，不要求重复完整成果、输出地址或框架已知身份。省略 outputs 或未提及某 ID 保留本 execution 已登记输出；同 ID 更新地址，新增 ID 按登记顺序追加，重试的新 execution 不继承。重复 ID 或冻结声明外的 ID 整份拒绝，不部分保存。声明输出允许尚未登记，不新增报告或完成门禁。登记不生成、复制、移动、发布或验收文件，不校验文件存在、可读、格式、数量或完整性；地址可位于任意 zone 外，但必须是绝对路径且不含 NUL。无文件成果也可声明 true。

使用公共 Session 观测取得原生 sessionId，传输为 `POST /api/workflow/node/report` 的 JSON `{sessionId, body, canComplete, outputs?}`；模型字段 `can_complete` 映射为既有 HTTP camelCase `canComplete`，后端报告记录和结果也使用 `canComplete`。不让模型填写 Run、node、执行、来源或接收者，不用 Owner key、名称或 cwd 猜身份。OMP 自身可能在模型工具 schema 中加入全局追踪字段 `i`；这是宿主元数据，不是角色业务字段，OMP 在执行前移除它。

后端唯一决定并生成报告 `id`、毫秒时间 `at`、`type=report`、`runId`、`nodeId`、`executionId`、`from`、`to`，扩展原样返回，不在本地改写归属。新请求缺 can_complete、字符串 "false"、错误 body/outputs 类型或额外身份字段均拒绝，不做类型转换、补 true 或删字段后执行。body 保留既有字符串限制，包括空字符串合法；后端校验绝对路径与调用归属。历史报告缺新增字段仍可读取，但不能据此放行新请求或首次完成。部署须配套更新 toolkit 与 herdr-bot；没有旧形状新请求兼容放行。

每份报告的 `outputs` 保存本次提交的实际 `{id,path}` 数组，省略时为 `[]`，不是全执行累计快照；后端按同一 execution 的报告顺序推导当前累计输出，不在 execution 中另存 `outputs`。

结果保留 `saved`、`report`、`notification`、`diagnostic`、`guidance`：

| 现场 | 如何处理 |
| --- | --- |
| 保存失败：`saved=false`，通知 `not-attempted` | 保留后端 code、原因和 HTTP 错误正文，先排查保存问题；没有“已保存”的成功保证。 |
| 保存成功、通知 `failed` | 报告已提交。保留报告 ID 和通知原因，让管理者直接读取已保存报告；**不要仅因通知失败重新 report**。 |
| 保存成功、诊断 `failed` | 诊断失败不撤销报告，也不改变通知的真实结果；不自动重报。 |
| 保存成功、通知 `submitted` | 只表示辅助输入提交，不证明已阅读、严格顺序、打断 collect 或强制续轮。 |

工具文本为后端 JSON；HTTP 状态及原始解析结果也保留于工具 details。辅助通知或诊断失败不会把已保存报告标成工具提交失败。每次显式 report 都可能追加独立报告，不是客户端幂等更新；有新结果或需更正正文时才明确再次提交。

`report` 在校验参数后，先以公共原生 Session 请求只读 `POST /api/workflow/node/context`，从后端取得对应执行冻结的 `reportPolicy`；当前或保留的旧执行、嵌套双角色均沿用后端报告身份解析。后端历史记录缺策略时默认 `auto`；查询失败、响应缺策略或策略未知则不发送，不从提示词、当前 Map 或模型参数推断。部署须同步升级提供该接口的 herdr-bot。

- `auto`：直接提交报告，不打开确认界面。
- `manual`：调用工具后，在当前宿主原生确认界面展示本次完整 `body`、`can_complete` 和 `outputs`。只有用户明确选择“是”才发送；自然语言同意、业务批准、内部 finish 和可交接声明都不构成发送批准。
- 批准仅适用于本次展示的内容和本次调用；待发送内容在等待前固定，完整 HTTP JSON 预览包含实际 `sessionId`、`body`、`canComplete` 与显式提供的 `outputs`（省略仍保持省略）。批准不重新读取身份或调用参数；补充、更正或再次调用均重新确认，不复用批准。
- 拒绝、关闭、取消、超时、会话结束、无交互能力或交互异常均返回 `sent=false`、`saved=false`，不触发报告请求；迟到批准无效。不自动重试、补发或反复询问，模型应结束本轮等待用户重新要求发送。不增加跨调用锁定机制。对 chief 原报告的人工重发同样如此：前次拒绝只终结那次调用，用户下一条明确重发请求是新的用户决定，应重新进入工具的完整原文预览与原生确认；不是客户端自主重试，也不复用旧批准。
- 确认等待使用 toolkit 配置 `reportConfirmationTimeoutMs`，随部署提供的值为 20000 毫秒。与 HTTP 预算独立，模型不能修改；从调用原生确认界面开始计时。RPC 客户端须实际实现宿主确认请求/响应；没有响应即超时拒绝，无 UI 的模式不发送 manual 报告。
- 一旦报告请求已发出，取消或传输错误仍可能意味着后端已保存，沿用下述不确定结果处理，不能报告为“未发送”。

该门禁保证 `report` 工具自身未经批准不发送，不增加后端批准凭证，也不防止其他工具直接调用 HTTP。报告后可继续无害收尾；已有 Chat 的持久化指引不热更新，应在升级后创建新 Chat。

**report、停轮、退出都不等于 node completed。** 管理者须阅读报告作编排判断并显式 complete，不默认验收输出正文；true 不自动完成或派发下游。节点等待用户确认本身不能作为 complete 依据，不由管理者替节点绕过确认发送报告。人工补齐执行失败结果后也须当前执行最新 true 报告，不保留无报告人工完成旁路。暂停新派发不撤回既有工作。旧执行的补充报告只保留其原执行事实，不替代新执行结果。

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
bun test tests/harness-dock/native-report-confirmation.test.ts
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

Prompt 检查直接捕获真实 omp 发给 provider 的文本，并读取其持久化的隐藏贡献；两角色均核对首次、普通轮次、新 owner 与切回原会话的行为。输入边界检查使用不同标记的真实后端 Task、工作、Bot/Map/user_input，取得实际 CLI 提交正文后原样送入真实 omp，核对工作文本块不变且工具指引是另一条消息。此处 Herdr 是记录型受控 CLI，不证明真实 Herdr 已启动这些会话。

指引故障演练实际执行“已保存但通知失败→collect 并读取报告”“原执行修复→recover”“核实旧副作用后→retry”“人工补齐→新执行 false 报告拒绝完成→collect 等待→最新 true 报告→显式 complete”。执行前可将 `WORKFLOW_PROMPT_EVIDENCE_DIR` 设为 `.scratch/manager-node-chat/evidence/` 下本次运行专用目录的绝对路径：Prompt dock 保留原始请求与 Session JSONL，演练保留 `guidance-rehearsal.json`（实际注入全文、工具结果、HTTP 和外部 CLI 调用）。产物和决策均由验收 Agent/测试控制，不能当成真实模型工作结果；这些是 P26 技术证据，不是 H1 通过，H1 的唯一整体使用判断仍须独立汇总与用户确认。

`native-report-confirmation.test.ts` 在 OMP/Pi 的实际自动入口验证完整 wire 预览、原生批准/拒绝、取消、超时后的迟到批准、Session 结束，以及原生无 UI 模式（OMP `--no-ui`；Pi JSON print）。HTTP 已接收后的取消、响应丢失、非法 JSON/回执保持不确定。确认预算为隔离配置 2000ms，每次结果后的无重试观察为 2100ms，跨过该确认预算；Session/进程由 driver 关闭并等待退出，不证明无限期或真实模型自主行为。`tool-confirmation-adapters.test.ts` 补充两宿主的 UI 异常、非 boolean 答案及阻塞事件循环后迟到批准的机制验证。所有资源使用测试独占 HOME/APPDATA/XDG、Session 和动态回环端口；受控 provider 不使用真实模型或用户凭据。

测试通过真实隔离 omp 18.5.0 加载交付入口；受控 provider 仅发出预先指定的工具调用，不冒充真实模型自主工作。受控 HTTP 分别验证保存失败、已保存但通知失败、诊断失败以及空正文不被客户端拒绝；150ms 有界窗口内观察无额外请求，不证明无限期无动作。

manager dock 通过实际 manager 入口与真实后端执行 A/B→C 小图的 status、交接、失败、暂停、恢复资格和结束，检查首次事实、拒绝与 150ms 窗口内无额外客户端 HTTP/外部 CLI 动作。测试前置派发通过隔离后端公开接口准备，不依赖派发工具。受控 provider/Herdr CLI 不证明真实模型使用两份材料或真正启动节点 OMP；这不是完整真实模型汇合验收，也不保证无限期无动作。

collect dock 同样使用真实 manager 工具与隔离后端：后端期限 1 秒，分别配置普通 60ms/collect 3000ms 和普通 3000ms/collect 200ms，区分正常到期与客户端预算耗尽；公共 HTTP 用实际分段响应覆盖完整请求预算。报告场景通过后端公开接口准备旧/新执行，不依赖 dispatch/retry 工具；核对五种真实 reason、辅助通知失败、反复读取、completed 后收尾报告及旧/新报告交错的适用待办。此预算/待办场景本身不证明宿主取消或真实模型决策。

取消专用 dock（P19）另用 **30 秒真实后端期限与 30 秒客户端预算**，在后端实际发送 `HTTP/1.1 200 OK`、正文仍为 0 字节后，分别向真实 omp 发出 `abort`、`new_session` 和关闭 stdin 的正常 shutdown。透明 TCP 观察器只转发字节与客户端 FIN，不主动制造 HTTP 响应或先行断开后端；它记录客户端 FIN 和后端自行返回的 FIN。要求两端在 5 秒内结束且没有正文，排除等满期限才释放。随后通过真实宿主恢复原生 Session（shutdown 还会重启宿主），提交真实 node 报告并由新的 collect 得到 `notification` 与该报告标识，排除遗留等待吞掉下一份通知。每次运行输出原生身份、响应头、字节数、双向 FIN 时序、实际终止反馈及报告标识，保留为命令日志即可复核。此观察验证连接和等待响应的释放，不测量后端内部 watch 接收者计数，也不声称取消撤销了已提交业务效果。

P21 分区经真实 manager 工具独立控制正常到期、工具取消、客户端预算、响应前断线、200 后无完整分块正文、Content-Length 截断及非法 JSON；S2 公共 HTTP 另观察取消/断流竞争与已采用期限后的取消，不把测试调度顺序提升为产品优先级。受控故障只证明这些分支的呈现，不证明真实模型决策或任意外部网络条件。
派发/恢复 dock 通过真实 manager 工具与后端制造同批成功、依赖拒绝、身份阶段失败（外部 CLI 对两个目标返回同一原生身份），保留实际已启动效果；并从真实启动/身份读取失败进入三种 reconciliation，验证 created 只查询原 agent。执行失败场景分别验证 confirmed=false/空依据拒绝、paused 下 recover 原执行与 retry 拒绝，以及新执行成功/提交失败均保留旧输出、旧执行和新效果。HTTP 捕获分区逐 action 拒绝额外身份、不适用字段和模型 Chat 引用。这里的 Herdr CLI 故障/身份均受控，不能据此宣称真实 Herdr/模型已完成恢复演练，也不重复宣称通用部分提交覆盖。

P22–P24 专用检查分开使用独立字面 HTTP 错误样例与真实后端故障。`uncertain-errors.test.ts` 从真实 manager 工具观察 503 正文、200 部分效果、网络断开和非法 JSON；每个结果后保持 250ms 外部请求计数窗口，再由同一 Session 显式 status，区分新调用与自动重试。`uncertain-effects.test.ts` 的边界代理先把请求交给真实后端并完整取得其响应，之后才扣住响应并对真实 omp 工具发出 abort；分别验证 pause 已提交、dispatch 已启动且关联 Chat、report 已保存且通知失败。取消后读取公开 status/Run 详情，并在 250ms 窗口核对 HTTP 与外部 CLI 无新增动作；存活 node Session 的另一份显式报告恰好新增一份报告，辅助失败后也无自主重报。另以损坏的隔离历史文件触发真实 `historyError/stateCommitted`，核对状态、分项目标与外部效果保留；损坏当前记录触发真实 500，核对结构化正文与修复后的显式查询。代理仅控制交付时序，不伪造后端接受、提交或回滚；这些检查不证明无限期无重试，也不证明真实模型决策或生产网络故障。

真实后端 dock 需要同级 herdr-bot checkout（或测试环境 `HERDR_BOT_REPO`），并先在该 checkout 构建：

```text
cargo build --manifest-path backend/Cargo.toml --example safe_shutdown_shell --bin herdr-fixture
```

`HERDR_BOT_REPO` 必须指向本次配套后端 worktree；不要选择另一份旧 checkout。并行维护多个源码副本时，可设置绝对 `CARGO_TARGET_DIR` 后构建，dock 同样从该目录读取 debug fixtures，避免使用别的 worktree 产物。

此 dock 只启动安全壳、隔离数据和记录型 Herdr CLI，实际运行 node 工具、公共 Session/HTTP、后端路由、身份关联与报告落盘；通过公开详情确认报告仍可读取、待办保留且 node 仍 running。通知失败来自真实后端调用被明确拒绝的外部 CLI。它不验证真实 Herdr 启动模型、真实模型选择材料/报告质量、manager 完整链路、跨阶段取消或 A/B→C 汇合；这些不得从该 dock 的成功推断。诊断失败受控响应只证明呈现分支，不证明真实 stderr 故障注入。
