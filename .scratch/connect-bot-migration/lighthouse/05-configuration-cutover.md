# 05: 配置、装载与新旧实现切换如何保持兼容: Lighthouse

> Question and discussion: [05: 配置、装载与新旧实现切换如何保持兼容](../decision/05-configuration-cutover.md)

## Question

共享源码布局下 connect-bot 的配置归属、寻址和错误处理如何确定，用户如何在不同时激活新旧实现的条件下迁入或回退？

核对原 endpoint 配置的整机作用域、默认与缺失提示、无效配置失败、未知键及无 env/CLI 覆盖等行为，判断哪些应沿用、哪些需要明确差异。选择配置位置并说明既有配置如何继续使用；区分配置文件与不持久化的会话接入状态，不凭空引入状态迁移。明确源码布局、依赖与装载选择、重启要求，以及切换时面板旧行的可见结果。沿用架构的新旧实现互斥及原仓库独立原则；不实际更改用户安装配置。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

## Discussion

### 1. 配置归属：新增框架能力 Extension configuration（扩展配置）

- 选定：配置读取是**框架能力**，运行时无关；扩展共享 logic 只消费框架暴露的值，OMP 装配层完全不接触配置值。
- 理由：文件读取不是 OMP 原生 API；放扩展里会重复 io/解析/错误处理，放 OMP 装配层会把跨 runtime 的配置绑到某个 runtime。
- 否决：扩展共享 `config.ts` 自读；OMP 装配层传目录/回传值。

### 2. 寻址与声明

- 路径约定 `extensions/<definition.id>/config.yaml`；`id == 目录名` 是编码规范，找不到路径显式报错、不静默。
- definition additive 声明 `config?: { path?: string; fields: Record<string, "string" | "non-empty-string" | "number" | "boolean"> }`；`fields` 列出的键必填且按类型校验，`path` 可覆盖默认约定。
- opt-in：只有声明 `config` 的扩展读取/校验；codebase-tools 无感。connect-bot 声明 `fields: { endpoint: "non-empty-string" }`。

### 3. 文件格式与解析

- 文件名 `config.yaml`（原 `config.json`），仓库提交默认文件；connect-bot 的 `extensions/connect-bot/config.yaml` 携带默认 `endpoint: http://omp-bot.local:8787`。
- 解析用纯 JS 的 **`yaml` 包**（eemeli；零外部依赖、ISC、YAML 1.2），由 framework 的运行时无关 config 模块直接 import；parser 留可注入 seam 供框架层单测。
- 理由：配置能力本身与 agent runtime 无关，首发即用跨运行时的解析实现；不依赖 `Bun.YAML`，也不等待 pi adapter。

### 4. 失败语义

- 缺文件、不可读、非法 YAML、顶层非对象、`fields` 键缺失或类型不符：一律 **error 文案 + 该扩展不加载**，其它扩展继续。
- 框架在 binding、注册任何东西之前读取校验；失败产生 additive `BindingFailure { kind: "config"; detail }`，经 `reportDiagnostic`（非模型通道）报确定性 error 文案。
- **无代码级默认值/回退**：仓库 `config.yaml` 即默认值；删文件属可接受极端情况。
- 字段值语义（endpoint 非空字符串）由 `"non-empty-string"` 在框架 config 模块内完成，扩展不再写校验。
- 未知键忽略；无 env/CLI 覆盖；整机唯一一份；改动需整进程重启。
- **对 01 P10 的显式修订**：缺文件"默认+告警"→"error+不加载"；坏格式"mount 抛错"→"框架 config BindingFailure + error + 不加载"。

### 5. 读取 API 与错误统一

- 底层 `readConfig(path)`：框架 config 模块唯一的读/解析/校验/抛错实现，可注入 reader/parser。
- 上层 `getConfig(definition): Readonly<Record<string, unknown>>`：按声明/约定解析并缓存，供共享 logic 拉取；binding 已保证有效；误用/无已校验值时抛 `ExtensionConfigError`。
- 共享 logic 惰性拉取安全：加载时取齐由框架 binding 的 eager 读取保证，不依赖扩展自觉。

### 6. 新旧实现切换与回退

- 复用 codebase-tools 的 load-source mutual exclusion：开发/验收 `--no-extensions -e my-agent-toolkit/entrypoints/omp` + 临时 agent state；永久切换移除 `my-omp-toolkit/extensions/connect-bot` 发现入口、把 `my-agent-toolkit/entrypoints/omp` 加入正式 `extensions:`、整进程重启；回退反向。`disabledExtensions` 不可用（按扩展名匹配会同时禁用新旧）。
- 测试只挂新实现；旧实现永不与新实现同载，仅作 01 冻结基线与回退路径。
- 迁移不改用户已安装配置；endpoint 值由用户一次性从旧 `config.json` 手工搬入新 `config.yaml`，不做自动转换与状态迁移。

### 7. 切换时面板旧行的可见结果

- 重启后旧实现不再运行、不会发 `unregister`：旧行 >30s（≤35s 扫描，最坏约 45s）转"已离线"并保留，直到 `unregister` 或面板重启。
- 新实现默认未接入→不出现新行；同 sessionId 重注册幂等复用并刷新同一行；回退对称。
- 接受并写入 runbook；切换/回退前建议先用当前实现执行 `/connect-bot off` best-effort 清理；不新增卸载/崩溃钩子。

### 8. 命名与范围边界

- 术语 **Extension configuration（扩展配置）**；**Configuration switch（配置式开关）**保留为未来条目类型。
- 本票只实现"读取/校验配置值"；switch 语义仍 deferred，仅让文件形态与命名可承载它。
- ADR 0002 additive 增补；GLOSSARY 新增词条；01 lighthouse 登记 P10 修订。

## Decision

新增框架能力 **Extension configuration（扩展配置）**：按 `extensions/<definition.id>/config.yaml` 约定、用 definition 的 `config.path`/`config.fields` 声明路径覆盖与必填键/类型，在 binding 时以纯 JS `yaml` 包（可注入 parser）读取校验，失败则 `BindingFailure { kind: "config" }` + `reportDiagnostic` error 且该扩展不加载；扩展共享 logic 经 `getConfig(definition)` 拉取已校验值。connect-bot 据此改用 `config.yaml`；新旧切换与回退复用 codebase-tools 的 load-source mutual exclusion（测试只挂新实现，旧实现仅作冻结基线/回退路径），endpoint 值手工搬运、无状态迁移。

## User stories

1. As a connect-bot 用户, I want 端点配置集中在一个扩展目录下的 `config.yaml`, so that 换 omp-bot 地址只改一个文件、不必在代码里找默认值.
2. As a connect-bot 用户, I want 配置文件缺失或非法时扩展直接不加载并给出明确 error, so that 我不会静默连错地址或看到假的"已接入".
3. As a 扩展开发者, I want 框架提供运行时无关的 Extension configuration 能力, so that 我不必自己写文件 io、YAML 解析与错误处理.
4. As a 扩展开发者, I want 在 definition 里以纯数据声明需要的配置键与类型, so that 配置错误在 binding 时统一暴露、扩展代码不写校验.
5. As a 扩展开发者, I want 共享 logic 通过 `getConfig(definition)` 拉取已校验值, so that OMP 装配层完全不接触配置、共享 logic 保持运行时无关.
6. As a 框架维护者, I want 读取/解析/校验集中在框架 config 模块且 parser 可注入, so that 所有扩展共享同一错误语义且框架层可单测.
7. As a 框架维护者, I want 配置文件用 YAML、解析用跨运行时的纯 JS `yaml` 包, so that 人手写配置可写注释且 framework core 不绑 Bun/agent runtime.
8. As a 框架维护者, I want 新增能力只做 additive 变更（definition.config、BindingFailure kind:"config"、新词汇表、一个零外部依赖的 `yaml` 运行时依赖）, so that 既有扩展与公开接口不被破坏.
9. As a 迁移实施者, I want 复用 codebase-tools 的 load-source mutual exclusion, so that 原实现与替换实现永不同载、无需第二套切换机制.
10. As a 迁移实施者, I want 新实现测试只挂 `my-agent-toolkit/entrypoints/omp`, so that 不必同时加载旧实现即可验证新扩展.
11. As a 迁移实施者, I want 旧实现保持冻结并作为回退路径, so that 验收失败时可恢复旧实现与旧 `config.json`.
12. As a 迁移实施者, I want 切换步骤明确"删除旧发现入口+加入新根+整进程重启", so that 不会出现新旧同时激活或热重载假设.
13. As a connect-bot 用户, I want 切换/回退前面板旧行有确定可见结果与清理建议, so that 我知道旧行会离线保留、可用 `/connect-bot off` 提前移除.
14. As a 面板（既定外部契约）, I want 扩展侧配置/装载改动不改面板代码与协议, so that 面板不需要同步发布.
15. As a 迁移实施者, I want 01 P10 的缺文件/坏格式行为被登记为显式修订, so that 基线文档不再与实现冲突.
16. As a 未来维护者, I want Extension configuration 的命名与文件形态为 Configuration switch 预留, so that 后续 switch 可直接进同一文件而不必重画目的地.

## Preconditions

- 01 已 resolved，P10 已知；本票修订其缺文件/坏格式两条。
- ADR 0002 共享源码布局与 load-source mutual exclusion 已在 README H3 / agent-runtime-support 记录。
- 面板 contract/spec 是固定外部输入；OMP 是验收目标；my-omp-toolkit 开发期冻结。
- 框架 v1 现状：definition 纯数据、无 config 能力；`reportDiagnostic` 存在；`BindingResult`/`BindingFailure` 可 additive 扩展；import-boundary 规则生效。
- 本机为 Bun 1.4.2；解析选择纯 JS `yaml` 包（零外部依赖）作为跨运行时实现，framework core 不依赖 `Bun.YAML`。
- 04 的 OMP allow-list 已成立（配置读取不在其内）。

## Postconditions

- 框架获得 additive 能力：`definition.config` 声明、binding 时读取/校验 `extensions/<id>/config.yaml`、`BindingFailure { kind: "config" }`、`getConfig(definition)`、`readConfig(path)`、`ExtensionConfigError`；解析新增 `yaml` 运行时依赖（零外部依赖，parser 可注入以便单测）。
- connect-bot 提交 `extensions/connect-bot/config.yaml`（默认 endpoint）并声明 `fields: { endpoint: "non-empty-string" }`；不再有 `config.json`/扩展自读。
- 01 lighthouse 登记 P10 修订；GLOSSARY 新增 "Extension configuration"；ADR 0002 增补该能力。
- 06 验收需覆盖：框架层 config 能力（缺/坏/required/类型、BindingFailure+diagnostic、`yaml` 解析）、扩展层 connect-bot 配置声明与装载期失败、cutover 冒烟。
- 切换/回退 runbook 扩展自 H3：删除旧 `connect-bot` 发现入口、加入 `my-agent-toolkit/entrypoints/omp`、整进程重启；endpoint 值手工从 `config.json` 搬到 `config.yaml`；无状态迁移。
- Configuration switch 语义仍 deferred；本票不实现。

## Invariants

- 配置读取归框架、运行时无关；OMP 装配层不接触配置值（对齐 04 的 OMP allow-list）。
- YAML 解析用纯 JS `yaml` 包，framework core 不依赖 `Bun.YAML` 或任何 agent-runtime 专有解析 API。
- definition 保持纯数据；config 声明是纯数据（对齐 02）。
- 共享 logic 不 import agent-runtime 类型（对齐 `tests/framework/import-boundary.test.ts`）。
- 无代码级配置默认值/回退；仓库 `config.yaml` 是值的唯一来源。
- 未知键忽略、无 env/CLI 覆盖、整机唯一一份、改动需整进程重启（除缺文件/坏格式两条外，沿用 01 P10）。
- 原实现与替换实现永不进同一进程（对齐 agent-runtime-support 的 load-source mutual exclusion；`disabledExtensions` 不可作互斥）。
- 面板 HTTP 协议、端点与 30s 过期/行保留语义不变（对齐面板 contract/spec）。
- 框架公开接口只做 additive 变更（对齐 ADR 0002）。
- Configuration switch 保持 deferred，本票只预留命名/文件形态。

## 修订（2026-10-07）

- parser 落点由「adapter 注入 `Bun.YAML.parse`」改为「framework core 直接使用纯 JS `yaml` 包（零外部依赖、ISC、YAML 1.2）」；理由：Extension configuration 与 agent runtime 无关，首发即用跨运行时实现，不等 pi adapter。parser 仍留可注入 seam 供框架层单测。
