# 02: Pi 原生 State、命令、prompt 与模型供给路径迁移

**What to build:** Pi extension 继续按原配置激活、执行命令和提交 prompt，从原来有效的 State 内容恢复并继续写入，且获得既有模型目录、价格和访问事实；这些完整消费路径改按实际原生契约归属组织。

**Delivers:** P6、P8、P9（Pi）；P10、P13、P14（Pi 本票行为入口的适用覆盖项）

**Test owner for:** P6、P8、P9 的 Pi 用例；P10、P13、P14 中 Pi State／命令／prompt／模型供给路径的独立用例。跨路径组合用例由 09 拥有。

**Blocked by:** 01: 固化迁移清单与重构前验证基线。

**Status:** in-progress

## 边界与覆盖

遵循本 feature 的 spec／contract 和 01 的职责分配，观察 S1／S2。不重组 Session／Turn／Round 状态机、pi-subagents 协议或 UI transport；必要调用方原子迁移。原生模型事实按实际消费契约保留，不新增能力或支持声明。

- [x] 将完整 State 编码、读取、恢复及写入协议归到实际原生来源，保持唯一状态和资源所有权；不按上游文件或单个事件机械拆分。
- [x] 从公开 assembly 观察命令成功及既有拒绝／失败结果、激活规则、prompt 的请求内容与历史顺序；保留原有交付规则，不以 OMP 原生表现作为 Pi 预期。
- [x] 使用 01 的重构前有效样例验证恢复值、分支选择和后续写入；不新增迁移、格式升级或恢复回退。
- [x] 验证受影响有效配置按原意生效、既有失败输入仍按原方式失败；用户配置不因内部源码移动而改变。
- [x] 保留实际消费的模型目录、价格和访问事实及其既有不可用／失败含义；对受影响场景以独立预期验证，不仅检查转发调用。
- [x] 覆盖本票路径适用的多 extension／binding 隔离、错误与取消传播、释放后命令／回调／外部效果停止。没有既有超时机制的路径不新增超时要求；跨路径用例按 01 账本交给 09。
- [x] 类型和加载支持随实际职责迁移，更新全部受影响调用方及直接导航，删除被替代实现和兼容转发；不向消费方暴露来源细节，不在 port assembly 新增语义解释。
- [x] 通过公开 assembly 的消费场景及适用 Pi 真实 harness 场景证明迁移后的行为，记录与基线的比较和限制。

## 验证与交接

迭代运行受影响测试；TypeScript 变更运行类型检查。完成时运行拥有该职责的测试分区、受影响消费方及对应真实 harness dock／smoke。预期来自既有契约、独立字面量或历史样例，不从被测实现计算。保留消费可见断言，删除仅锁定旧布局的测试而非重钉新路径。记录命令、退出状态、源／环境和失败；现存缺陷单独报告，不顺手修复。共享 assembly 编辑需协调，但不新增虚假的 ticket 阻塞。直接文档随本票更新，全局架构收口归 08。

## 本次实现与验收（2026-10-24）

实现已完成并验收；`in-progress` 保留到独立集成完成，按仓库规则由集成方合入后关闭。

- 原生完整 State 协议归到 `adapters/pi/native/core/session-manager/state.ts`，合并旧 Session query 中的命名／分支读取与旧 effects 中的写入；payload、顺序及每 binding writer 所有权不变。没有迁移、升级、回退或兼容转发。
- 命令、prompt、context usage、公开结构类型与 Node text loader 归到 `native/core/extensions/{commands,prompt,context,types,text-imports}.ts`；模型目录价格和实时 access 归到 `native/core/model-registry.ts`。公开 `piAdapter`、导出类型、配置和条件 assembly witness 不变。
- 全部现存调用方与直接导航已迁移；Session／Turn／Round 状态机、pi-subagents、UI transport、全局 ADR 收口保持本票外。

### 承诺与证据

| 承诺 | 本票证据 |
| --- | --- |
| P6 | `tests/framework/pi-native-consumers.test.ts`：toggle/directive、非法参数、同分支多 extension prompt 隔离；真实 manual/auto smoke 读取请求与 journal，证明 hidden tail append、已有历史前缀／顺序不变、init/reminder 交付与激活规则。 |
| P8 | 同一公开 assembly 测试直接读取 01 的冻结 `pi-state-before.jsonl`、`pi-switch-target.jsonl`、`pi-switch-other.jsonl`；按独立字面量验证恢复 true、下次 toggle 写 false、保留 init 并选择 reminder、选择 target 而非 other。另测 false→true 的原始 payload 顺序与无关 entry 过滤。真实重启／切换 smoke 补充证明宿主接通。 |
| P9 | 同一测试用 baseline CFG-BOT-VALID/INVALID 的 1000/0 和 CFG-STARTUP-VALID/INVALID/YAML，验证业务值、绑定拒绝、拒绝前不构造／不注册，以及修正配置后可重新绑定。实际 Pi model-cost smoke 覆盖其配置与模型供给消费。 |
| P10 | 同一原生分支多 extension 的 State／prompt identity 隔离、独立 assembly/binding 释放后另一 binding 继续运行、配置拒绝不污染下次绑定。跨路径组合仍归 09。 |
| P13 | registry rejection、AbortError、directed command rejection／取消均逐对象断言原失败身份；registry 调用次数证明没有新增重试。既有价格／access 不可用意义、精确 provider/model 配对、实时 credential、provider URL 优先和 model URL 回落分别有独立字面量。原有无超时路径未新增超时。 |
| P14 | authored directed command cleanup 后，保留的命令注册不再运行扩展效果／写入；原生 prompt callback 停止，独立 binding 仍能写入及贡献。**保留既有特例**：framework 自有 local toggle 在 disposal 后仍可操作 State（`framework/behaviors/binding.ts` 原有明确规则），不把它误当作需要修复的扩展效果泄漏。 |
| 类型／加载 | `bun run typecheck`；既有 `pi-adapter-output.test.ts` 随整分区运行；真实 Node22 Pi smoke 实际加载迁移后的 TypeScript 与 Markdown text hook。 |

### 实际命令与结果

源：本票 worktree 的 source-only cutover，冻结样例来自已存在的基线提交 `68030a9`（样例 provenance 保持 01 的 `historical-artifacts.json` 不变）。Windows x64；Bun 1.4.2；真实宿主为已安装 Pi 1.4.0 bundle，`PI_NODE=D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe`（Node 22.19.0）。未修改宿主或用户配置。

| 命令 | 结果 |
| --- | --- |
| `bun test tests/framework/pi-native-consumers.test.ts`（最终迭代） | exit 0；11 pass / 0 fail，68 assertions。 |
| `bun run typecheck` | exit 0；TypeScript 与 authoring 检查通过（61 files / 4 declarations / 0 diagnostics）。 |
| `bun test tests/framework` | exit 0；668 pass / 0 fail，3511 assertions / 58 files；`.cache/ticket02-framework.log`。 |
| `bun test tests/model-cost/harnesses/pi` | exit 0；91 pass / 0 fail，604 assertions / 12 files；`.cache/ticket02-pi-consumers.log`。 |
| `bun run check:integrations --adapter pi --json` | exit 0；三个 consumer 均 complete；`behaviorTestsRun:false`，只作为结构证据。 |
| `bun scripts/pi-codebase-tools-smoke.ts --keep` | exit 0；78 checks / 6 isolated runs；`.cache/ticket02-manual.log`。 |
| `bun scripts/pi-codebase-tools-smoke.ts --mode auto --keep` | exit 0；62 checks / 4 isolated runs；`.cache/ticket02-auto.log`。 |
| `bun scripts/pi-model-cost-smoke.ts --keep` | exit 0；100 checks / 28 isolated runs；`.cache/ticket02-model-cost.log`。 |

三条真实 smoke 顺序运行；pass 计数与 01 Node22 基线相同（78/62/100）。本票只做内部重组，已有行为先通过公开 assembly characterization，再迁移并保持 green，没有伪造行为 red。首次测试因 worktree 未安装 yaml 无法加载，执行 `bun install --frozen-lockfile` 后完成；测试编写中的配置 fixture 字段／类型和 lifecycle 场景误设均已纠正，最终分区没有失败。基线已在分支中，对 `68030a9` 的空 cherry-pick 已 skip，没有丢弃任何工作。

### 限制与独立集成说明

- 没有运行全仓测试；上述 owning partition、受影响 Pi consumer 和真实 smoke 是本票验收范围。
- 真实模型请求使用本机 capture endpoint；余额／Codex account 答案为 smoke 控制文档，不声称真实服务或账号验证。TUI 可读性、人类 H1 仍未验证；本票不提升支持声明。Node24 的已知 Windows/libuv 问题没有复跑，也没有规避或改动产品代码。
- 日志及 `--keep` 的真实运行目录保留在本 worktree／系统 temp 中；日志末尾列出可复查目录。
- 与 04 已协调：本票只最小修改现存 `internal/port.ts`／index imports；04 迁移到顶层 `port.ts` 时保留本票 native paths。04 新 lifecycle 文件的 `internal/native` import 应指向本票 `native/core/extensions/types.ts`；State query import 指向 `native/core/session-manager/state.ts`。04 的旧 `domain/session/queries.ts` 最终只余本票已替代的 State helpers，应删除而非兼容导出。06 的 UI 文件迁移再更新本票 native command/context/prompt 的 transport imports。来源组合语义不放回 port。
- 最终独立集成及 `closed` 状态由集成代理负责；全局组织／ADR 文档由 08 收口。

## 同步后独立集成验收（2026-10-24）

宿主已将首次集成提交 `921de1d861cc78797e758f7ddc01a3413e19fb54` 合回本票开发分支；接管时 HEAD 即该提交，工作区干净，`git merge-base --is-ancestor` 返回 0。本轮只运行项目全局测试，复杂脚本、独立 smoke 和跨票整体门禁留给最终验收，不重用先前开发会话。

- 首轮 `bun run test`：exit 1；1621 pass / 5 fail，9916 assertions，183 files，588.10s。完整日志：`%TEMP%/ticket02-integration-global-tests-921de1d.log`。
- 失败为真实 herdr-bot 测试启动的安全壳／endpoint 契约（2 项）及真实 OMP 嵌套委派请求数量（3 项）。helper 原默认启动生产后端；现改为默认启动上游已有 `safe_shutdown_shell` example，在发请求前确认安全壳，并等初始 snapshot 就绪、传播订阅失败，未加重试。此前另一个 panel 实例的 `ConnectionRefused` 根因未单独证明，不将其归因于代理或端口配置。
- 首次将额外六次请求推断为 task label，并将隔离配置的 `tiny`／`commit`／`smol` 留空；其他集成会话及本会话第二轮全局运行均证伪了此修复，现已移除无效配置。第二轮保留的请求协议摘要证明额外请求实际为每个 spawn 的 reasoning effort 自动分类（`solution_space`，回答 `low`／`medium`／`high`／`xhigh`，失败后 `submit_judgment`），而非 session Turn 或 task label。仍保留 capture-all、原始 5/7/5 次数及用量／身份断言，不修改宿主、adapter 或业务配置。
- 第二轮 `bun run test`（上述 safe-shell 环境）：exit 1；1622 pass / 4 fail。日志 `%TEMP%/ticket02-integration-global-tests-diagnostics.log` 保留无 headers 的模型请求协议摘要及结构化 fetch 错误。panel 子进程仍存活且已 bind 到相同端口，首次 Bun fetch SSE 仍报 `ConnectionRefused`；不将此归因于已排除的错误 endpoint 或未验证的代理配置。
- 对实际协议的修复：在委派 fixture 的隔离配置启用宿主已有 `task.enableEffort`，两次 scripted task 均显式 `effort: "lo"`，避免不属于本场景的自动分类请求。panel 的 SSE subscription／snapshot 使用各自拥有、`agent: false` 的 `node:http` 本地连接，保留相同帧解码、HTTP 错误传播与 abort 清理，不重试、不回退；Bun 内部连接失败机制未获证明，不声称已修复 Bun。
- 临时 worktree 的真实 panel 前提显式设置为 `HERDR_BOT_BINARY=E:/Developer/myhub/herdr-bot/backend/target/debug/examples/safe_shutdown_shell.exe`、`HERDR_BOT_METADATA=E:/Developer/myhub/herdr-bot/meta-data/bot-options.toml`，不使用生产关机后端，不安装或重建宿主。

