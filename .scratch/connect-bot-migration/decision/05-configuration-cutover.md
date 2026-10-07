# 配置、装载与新旧实现切换如何保持兼容

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: resolved
Blocked by: 01

## Question

共享源码布局下 connect-bot 的配置归属、寻址和错误处理如何确定，用户如何在不同时激活新旧实现的条件下迁入或回退？

核对原 endpoint 配置的整机作用域、默认与缺失提示、无效配置失败、未知键及无 env/CLI 覆盖等行为，判断哪些应沿用、哪些需要明确差异。选择配置位置并说明既有配置如何继续使用；区分配置文件与不持久化的会话接入状态，不凭空引入状态迁移。明确源码布局、依赖与装载选择、重启要求，以及切换时面板旧行的可见结果。沿用架构的新旧实现互斥及原仓库独立原则；不实际更改用户安装配置。

---

## 承接输入（来自已确认 lighthouse / ADR，2026-10-07）

- **01 行为基线**（[lighthouse/01](../lighthouse/01-behavior-baseline.md)）：行为默认保留；配置的位置与归属明确留给本票；P10 固定：端点来自配置文件单键、默认 `http://omp-bot.local:8787`、缺文件→默认+一次告警、坏格式→mount 抛错、未知键忽略、无 env/CLI 覆盖、事件路径与 `{proxy:false}` 写死。
- **ADR 0002 / agent-runtime-support §Load-source mutual exclusion**（[doc](../../../docs/agent-runtime-support.md#load-source-mutual-exclusion)）：共享源码布局；原实现与替换实现永不进同一进程；开发/验收 explicit-only root；永久切换=移除旧发现入口+加入 `my-agent-toolkit/entrypoints/omp`+整进程重启；无热重载；迁移本身不改用户安装配置。
- **README H3**（[runbook](../../../README.md#h3--permanent-cutover-and-cutover-smoke)）：codebase-tools 已有可复用的切换/回退程序；`disabledExtensions` 按扩展名匹配，不能用于新旧互斥。
- **04 lighthouse**（[lighthouse/04](../lighthouse/04-interaction-native-boundary.md)）：直连 OMP 原生能力的 allow-list 只含 `runtimes/omp.ts` 的 managed timer 与真实 sessionId/cwd/model；共享 logic 不 import 原生类型；扩展效果数据由扩展自持。配置文件读取不是 OMP API，其归属由本票决定。
- **面板固定契约**（[contract.md](../../../../archive-docs/omp-bot/omp-connect-bot/contract.md) P3/P6/P14、[spec.md](../../../../archive-docs/omp-bot/omp-connect-bot/spec.md) §过期与离线）：`unregister` 才移除行；>30s 转离线并保留；v1 不落盘；`register` 幂等刷新同一行。
- **02 State 决策**：`enabled` 为 memory、不继承；会话接入状态不持久化，与配置文件分离，本票不引入状态迁移。

## 讨论结果（2026-10-07）

### 1. 配置归属：新增框架能力 Extension configuration（扩展配置）

- 选定：由框架提供运行时无关的配置读取能力；扩展共享 logic 只消费框架暴露的值，OMP 装配层完全不接触配置值。配置读取是框架能力，不是扩展自读，也不是 OMP-qualified 原生调用。
- 理由：文件读取不是 OMP 原生 API；放在每个扩展里会重复 io/解析/错误处理，放到 OMP 装配层会把跨 runtime 的配置绑到某个 runtime。
- 否决：扩展共享 `config.ts` 自己读文件；OMP 装配层传目录或回传值。

### 2. 寻址与声明（Q6-B / Q15-A / Q17-A）

- 路径约定 `extensions/<definition.id>/config.yaml`；`id == 目录名` 是编码规范，路径解析失败显式报错，不静默。
- definition 增补纯数据声明 `config?: { path?: string; fields: Record<string, "string" | "non-empty-string" | "number" | "boolean"> }`。`path` 可选覆盖默认约定（相对路径以扩展目录为基准，绝对路径/文件 URL 原样）；`fields` 中列出的键**必填**且按类型校验。`config` 声明本身的形状也在 binding 时校验：`config` 必须为对象、`fields` 为非 null 对象且值 ∈ 上述四种类型名、`path`（如存在）为非空字符串；声明非法与文件非法走同一失败路径（见 §4）。
- opt-in：只有声明 `config` 的扩展才读取/校验；codebase-tools 不声明、无需 `config.yaml`、完全无感。
- connect-bot 声明 `fields: { endpoint: "non-empty-string" }`。

### 3. 文件格式与解析（Q16）

- 文件名改为 `config.yaml`（原为 `config.json`）；仓库提交默认文件，connect-bot 的 `extensions/connect-bot/config.yaml` 携带默认 `endpoint`。
- 解析用纯 JS `yaml` 包（eemeli；零外部依赖、ISC、YAML 1.2），由 framework 运行时无关 config 模块直接 import，并留可注入 parser seam 供单测；新增一个运行时依赖，不依赖 `Bun.YAML`。
- 登记差异：原基线为 `config.json`/JSON，本票改为 `config.yaml`/YAML；用户旧 endpoint 值需一次性手工搬入新文件。

### 4. 失败语义（Q3 / Q7 / Q8 / Q13 / Q17）

- `config` 声明形状非法（`config` 非对象、`fields` 非非 null 对象、类型名超出 `string | non-empty-string | number | boolean`、`path` 非非空字符串），以及缺文件、不可读、非法 YAML、顶层非对象、`fields` 键缺失或类型不符：一律 **error 文案 + 该扩展不加载**；其它扩展继续。
- 框架在 binding 阶段、注册任何东西之前读取并校验；**所有加载期配置错误**统一产生 `BindingFailure { kind: "configuration", violation: { kind: "config", detail } }`（additive 给 `ConfigurationViolationKind` 加单个 `"config"` 成员，`detail` 逐类可区分），经 `reportDiagnostic`（非模型通道）出确定性 error 文案。
- **无任何代码级默认值/回退**：仓库里的 `config.yaml` 即默认值；删文件属可接受的极端情况。
- 字段值语义（`endpoint` 非空字符串）由声明的 `"non-empty-string"` 在框架 config 模块内完成；扩展不再写 config 校验代码，错误处理完全统一到框架 config 模块。
- 未知键忽略；无 env/CLI 覆盖；整机唯一一份；读取发生在 binding，变更需整进程重启才生效。
- **对 01 P10 的显式修订**：缺文件由"默认+一次告警"改为"error+不加载"；坏格式由"mount 抛错"改为"框架 config BindingFailure + reportDiagnostic error + 不加载"。

### 5. 读取 API 与错误统一（Q11-A / Q12）

- 底层 `readConfig(path)`：框架 config 模块唯一的读/解析/校验/抛错实现；接受路径参数、可注入 reader/parser，供框架层单测。
- 上层 `getConfig(definition): Readonly<Record<string, unknown>>`：按声明/约定解析并缓存，供扩展共享 logic 运行期拉取；已由 binding 保证有效，正常调用不抛错；无已校验值误用时抛 `ExtensionConfigError`。`ExtensionConfigError` 是已绑定后误用的编程错误逃生口，不并入 `BindingFailure` 的加载期错误。
- 共享 logic 惰性拉取是安全的：Q13 的"加载时取齐"由框架 binding 的 eager 读取保证，不依赖扩展自觉。

### 6. 新旧实现切换与回退（Q4 / Q5）

- 复用 codebase-tools 的 load-source mutual exclusion：开发/验收 `--no-extensions -e my-agent-toolkit/entrypoints/omp` + 临时 agent state；永久切换移除 `my-omp-toolkit/extensions/connect-bot` 发现入口、把 `my-agent-toolkit/entrypoints/omp` 加入正式 `extensions:`、整进程重启；回退反向执行。`disabledExtensions` 不可用（按扩展名匹配会同时禁用新旧）。
- 测试只挂新实现；旧实现永不与新实现同载，仅作为 01 冻结基线（文档/人工对照）与回退路径保留。
- 迁移本身不改用户已安装配置；`config.json` → `config.yaml` 的 endpoint 值由用户一次性手工搬运，不做自动转换，不引入状态迁移（会话接入状态本就不持久化）。

### 7. 切换时面板旧行的可见结果（Q5）

- 进程重启后旧实现不再运行、不会发 `unregister`：旧行在 >30s（≤35s 扫描，最坏约 45s）转"已离线"并保留，直到被 `unregister` 或面板重启。
- 新实现默认未接入 → 不出现新行，直到用户执行 `/connect-bot`；同一 sessionId 重注册幂等复用并刷新同一行。回退对称。
- 接受该结果为预期并写入 runbook；切换/回退前建议先用当前实现执行 `/connect-bot off` 做 best-effort 清理（面板不可达时仍落在"未响应"文案）。不新增卸载/崩溃钩子，不伪造 `unregister`。

### 8. 命名与范围边界（Q10 / Q14）

- 术语 **Extension configuration（扩展配置）**：框架从扩展目录读取 `config.yaml`、向扩展暴露纯值、变更需重启；**Configuration switch（配置式开关）**保留为未来的一类条目（沿用 GLOSSARY 定义）。
- 范围边界：本票只实现"读取/校验配置值"；Configuration switch 语义仍 deferred，本次只让文件形态与命名可承载它，不顺带实现。
- 记录物：ADR 0002 additive 增补该能力（属 extension definition/configuration 范围，不是 deferred 的 configuration switch）；GLOSSARY 新增 "Extension configuration"；01 lighthouse 登记 P10 修订。

---

## Decision

新增框架能力 **Extension configuration（扩展配置）**：框架按 `extensions/<definition.id>/config.yaml` 约定（definition 可用 `config.path` 覆盖、用 `config.fields` 声明必填键与 `string | non-empty-string | number | boolean` 类型），在 binding 时读取并用纯 JS `yaml` 包（可注入 parser）解析；所有加载期配置错误（`config` 声明形状非法，或缺文件、坏 YAML、顶层非对象、required 缺失或类型不符）→ `BindingFailure { kind: "configuration", violation: { kind: "config", detail } }` + `reportDiagnostic` error 文案 → 该扩展不加载，无代码级默认值。扩展共享 logic 经运行时无关的 `getConfig(definition)` 拉取已校验值，OMP 装配层不接触配置。connect-bot 以 `config.yaml`（默认 `endpoint: http://omp-bot.local:8787`，`non-empty-string`）声明配置。新旧切换与回退复用 codebase-tools 的 load-source mutual exclusion（测试只挂新实现，旧实现仅作冻结基线与回退路径）；旧行按面板 30s 过期保留、切换前建议 `/connect-bot off`；endpoint 值由用户一次性从旧 `config.json` 手工搬入新 `config.yaml`，无自动迁移与状态迁移。这是对 01 P10 缺文件/坏格式行为的显式修订。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

## 修订（2026-10-07）

- parser 落点由「adapter 注入 `Bun.YAML.parse`」改为「framework core 直接使用纯 JS `yaml` 包（零外部依赖、ISC、YAML 1.2）」；理由：Extension configuration 与 agent runtime 无关，首发即用跨运行时实现，不等 pi adapter。parser 仍留可注入 seam 供框架层单测。

### traverse 审计收口（2026-10-07）

- **配置失败分类统一**：取消原计划的顶层 `BindingFailure { kind: "config" }`；所有加载期配置错误（`config` 声明形状非法 + 文件内容非法）统一为 `BindingFailure { kind: "configuration", violation: { kind: "config", detail } }`，即给 `ConfigurationViolationKind` 新增单个 `"config"` 成员、`detail` 逐类可区分。
- **声明级校验**：`config` 必须为对象、`fields` 为非 null 对象且值 ∈ 四种类型名、`path`（如存在）为非空字符串；与文件级错误同一失败路径，不静默忽略。
- **`ExtensionConfigError` 保持独立**：仅表示已绑定后对 `getConfig` 的误用/无已校验值，不并入 `BindingFailure`。
- **实现期文档同步**：`docs/framework-capabilities.md` 的 `ConfigurationViolationKind` 枚举在符号落地时补 `"config"`；`framework/core/violations.ts` 与 `framework/core/protocol.ts` 的注释从“竞争性声明”泛化为“配置规则（声明 + 文件）”。
