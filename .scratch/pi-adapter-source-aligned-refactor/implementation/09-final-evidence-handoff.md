# 09: 完成双 harness 最终验收与分级证据交接

**What to build:** 在完成迁移的稳定源状态上验证双 harness 组合结果，交付可追溯的结构、受控行为、真实接通与未验证项证据，并准备唯一 human-led 项 H1，供用户确认日常 TUI 体验。

**Delivers:** P17；P7（H1 交接与用户确认记录）；P10、P13、P14（01 账本分配的跨行为入口组合覆盖）

**Test owner for:** P10、P13、P14 的跨 ticket 组合用例；P7 的 H1 验收步骤与交接记录由本票维护，体验结论由用户确认。本票不接管 02–07 已拥有的路径内独立测试。

**Blocked by:** 08: 完成来源组织、公开 assembly 与接入完整性收口。

**Status:** in-progress

## 覆盖分区与完成含义

以本 feature 的 spec／contract 及 01 唯一场景账本为准。P1–P4／P16 由 08 交付；P5／P12 按 Pi 04、OMP 05 分区；P6／P8／P9 按 Pi 02、OMP 03 分区；P11 归 04；P15 归 07；P7 自动化及真实运行按 Pi 06、OMP 07 分区，H1 由本票交接。P10／P13／P14 的单路径场景分别归 02–07，只有跨入口场景归本票。所有 promise 按全部覆盖项完成，不因一张票通过而提前宣称整体完成。

- [x] 核对 P1–P17 的全部 coverage，每个用例具备唯一 owner 和证据；不以 promise 编号齐全替代实际覆盖，不重复认领前序用例，不将遗漏实现或路径内测试留给最终回归。
- [ ] 为两个 harness 实施账本中的跨路径组合验收：至少覆盖释放一个 binding 后其事件／命令／UI 不再产生应停止的效果，而另一 binding 继续工作；覆盖绑定拒绝或失败后重新绑定不污染后续消费结果。**已完整执行；OMP 部分注册拒绝后的旧回调仍交付，保留正常失败用例，未满足此项的无污染承诺。Main 明确要求按既有语义缺陷记录，不在本结构重构中修复。**
- [x] 覆盖实际受影响的跨路径取消／终止／超时场景，独立断言错误结果、交付顺序和既有等待规则；不发明原本不存在的超时或重试契约。组合测试经公开 assembly 观察，不窥探私有表示。
- [x] 在协调好的安静窗口，对稳定源状态执行 `bun run typecheck`、`bun run test`、两端接入完整性检查和任务要求的真实 harness dock／smoke。遵循仓库真实运行预热、并发和日志规则，运行期间源与 fixture 不变。
- [x] 最终真实证据包含适用主会话／子会话加载、Pi provider 接通和终止路径；真实 provider、受控失败分支、OMP 可选补丁双分支与实际可用环境分别记录。缺失前提明确为阻塞或验证缺口，不伪造通过、不修改外部 harness／provider 或补装补丁。
- [x] 每份证据记录命令、退出状态、失败、源状态、依赖和 harness／provider／补丁版本以及适用范围。结构供给、受控行为和真实接通分级陈述，不把 provided 或测试通过当作版本认证。
- [x] 仅在相关源、fixture、依赖和环境均未变化时引用早期结果，并注明范围；已知失败单独列明，不按名称推定相同，也不记入通过。
- [x] 汇总 06／07 的 H1 环境／版本记录、重构前后输出、可重复操作步骤、自动检查结果和已知差异，邀请用户在实际日常 TUI 确认 Marker area、反馈及 Viewed session 切换体验。
- [x] 完成所有可执行实现和 agent 验证后再交接 H1；H1 只覆盖实际可用环境的体验判断，不能替代底层状态、身份、输出、可选分支和真实 provider 接通验证。
- [x] 用户确认前将 H1 和 P7 整体验收明确标为未验证／未完成，不替用户签署、不将整项任务宣称全部通过。用户提供结论后如实记录；其他缺口也须独立保留。
- [x] 更新既有证据记录，移除本次临时脚本和脚手架，不修改或关闭父 spec／contract，不新增版本支持声明或顺手修复既有语义缺陷。

## 执行约束

必要组合测试应覆盖可见行为，不测试转发接线或来源文本。前序票自己的测试 owner 不因本票重跑而改变。发现契约无法经现有 seam 验证时先请求契约修订，不偷偷下沉私有接口或缩小承诺。保留完整运行日志，最终交接明确列出已验证、失败、受环境限制以及等待用户确认的项目。

## Comments

### 09 执行与最终证据

本票的测试与交接材料已交付；**不是整项重构全部验收通过**。全仓结果为 **1663 pass / 1 fail**；OMP 部分注册泄漏未修复；**H1 未验证，P7 整体验收未完成**。按仓库规则，独立集成实际合入前 Status 保持 `in-progress`，不能用 agent 执行结束代替合入或人工确认。

#### 源状态、环境和可复核记录（P17）

- 基于实际包含 08 的 merge `6de7c04ab0123ae5ec2f723955136e79c044603b`（08 实现 `69766e5`），只新增 `tests/framework/assembly-cross-entry.test.ts`，未修改 adapter 产品语义。此前 git 祖先记录已确认，不曾在 `dev` 工作区操作。
- Main 授权独占窗口，integrate08 明确释放其全仓运行后开始；下列最终命令全部顺序执行，无源代码或 fixture 并行修改。`09-final-artifacts/source-state.json` 固定 503 个源／fixture／脚本／配置和锁文件的 SHA-256；`stability.json` 记录运行后上述文件、记录的依赖／可执行文件／补丁 manifest 及 provider deployment 均无变化。后续仅更新本票与证据记录。
- `09-final-artifacts/runs.json` 保存全部实际 argv（含无落盘的组合验收代码）、cwd、开始／结束、exit、显式环境和完整日志名。`environment.json` 保存 Windows 10.0.26200 x64、Bun 1.4.2、Node 22.19.0、实际 Pi 1.4.0 与相关文件 hash。
- OMP 使用既有 exact 18.5.0 unpatched，以及既有 Viewed-session、Codex response-boundary、combined 三个 frozen artifact；`cache-links.json` 记录 worktree-local junction 的原目标。没有补装、修改或重新应用外部 harness／patch。
- 原始 framework 配置仍指用户 `pi-subagents@0.80.0`，仓库锁定依赖／smoke 加载项为 `0.78.0`，不把两者混称同一 artifact。19–21 的原配置运行只声明该组合；22–25 使用独立源副本，**仅副本**的 framework provider path 指向其 `../node_modules/pi-subagents`，注册 export 与实际加载统一为 0.78.0。`provider-deployment.json` 记录该唯一配置差异及 hash，正式配置未改。
- 真实 harness／真实 pi-subagents 接通与真实远端 LLM 是两件事：本轮真实 CLI、provider、child 加载和真实终止已观察；模型、余额、Codex account 仍使用本地 capture／受控文档，无远端服务、真实余额额度或模型质量结论。`HERDR_BOT_BINARY` 只选用既有 `safe_shutdown_shell.exe`，未构建或修改 panel。

| 证据级别 | 最终实际命令（完整 argv/env/cwd 见 runs.json） | 退出与范围 |
|---|---|---|
| 类型与结构 | `bun run typecheck` | 14：exit 0；authoring 61 files / 4 declarations / 0 diagnostics |
| S3 结构供给 | `bun run check:integrations --adapter pi --json`；`--adapter omp --json` | 15、16：均 exit 0；六组合 complete，0 diagnostics；每端 codebase-tools/connect-bot/model-cost 各 11/19/29 required 全 provided；原 optional unavailable/conditional 不变，`behaviorTestsRun:false` |
| S2 串行预热及真实 OMP | `bun run test:dock:serial` | 17：exit 0，130 pass / 0 fail，32 files，1422 assertions；298.49s；包括真实主／child／grandchild、三消费方取消／provider 终止、patched outlet 与 unpatched control |
| S1＋S2 最终全仓 | `bun run test` | 18：**exit 1，1663 pass / 1 fail**，185 files，10219 assertions；521.33s；唯一失败见下，不称全仓绿色 |
| S2 Pi 消费方 | `bun scripts/pi-codebase-tools-smoke.ts --pi <installed-cli> --keep`；再加 `--mode auto` | 19、20：exit 0，manual 78 / 6 isolated runs；auto 62 / 4 runs；实际请求、历史、Marker/feedback RPC 帧及实际 detached child 的 State 跟随 |
| S2 Pi model-cost | `bun scripts/pi-model-cost-smoke.ts --pi <installed-cli> --keep` | 21：exit 0，100 / 28 runs；账户答案是 fixture，非真实账户 |
| S2 真实 pinned provider | `bun scripts/pi-subagent-smoke.ts --expect-pi-version 1.4.0 --keep` | 22：exit 0，32 observations；foreground/background child 的真实加载、两 required extensions、独立身份／父链／存储、无 provider 和拒绝 requirement 分支 |
| S2 Pi 取消／终止／延迟结果 | `bun scripts/pi-terminal-round-smoke.ts --expect-pi-version 1.4.0 --keep`；`bun scripts/pi-background-round-smoke.ts --keep` | 23、24：exit 0，17 / 15 observations；取消时 provider 仍持工作，迟到结果不重开 Round，后续执行继续；后台两个实际 child 不误关父 Round |
| S2 Pi close-out | `bun scripts/pi-close-out-smoke.ts --expect-pi-version 1.4.0 --keep` | 25：exit 0，11 observations，0 required facts missing；真实锁阻塞退出 15006ms（15000ms 应用等待＋6ms 调度／teardown），明确未保存且磁盘无该 session 记录，不声称精确 wall-clock 性能目标 |
| S2 Pi 三消费方组合 | `bun --eval <runs.json 中 27 的完整代码>` | 27：exit 0，16 独立检查；同一真实 Pi 加载三个正式 manual entry，panel 拒绝后重新启用、共享 Marker、`/budget detail`、实际请求与 init journal、各自关闭和 clean exit；完整 RPC frames／pushes／request 保留于日志；无 provider 路径与22接通路径分级，不冒充同一运行 |

所有完整日志保留于 `09-final-artifacts/`。真实 smoke 的 `--keep` 数据及 27 的 sessionFile/runRoot 可按日志定位；未留下临时脚本文件或产品脚手架。27 的可复现代码随实际命令保留，不加入生产入口。其首轮26仅因把 Pi RPC 的 `widgetKey/widgetLines` 误读为 `key/content` 失败，已按既有 dock 协议修正观察；它不构成产品 red，也不记为通过。

#### 唯一 owner 场景账本核对

以下复核 01 原始分配（owner 未转移）。`18` 表示本轮全仓日志中实际运行的既有用例，不表示整份命令通过；`17` 表示本轮真实 OMP dock；19–27 为上表真实 Pi 证据。原始历史／配置输入继续由 01 的 `historical-artifacts.json`、`state-expectations.json`、`config-cases.json` 和既有冻结 fixtures 持有，不以新实现自写自读替代兼容依据。

| 01 场景 ID → 唯一 owner | 本轮具体证据／观察与范围 |
|---|---|
| STRUCT → 08（P1–3/P16） | 08 已交付来源审查及 ADR/navigation；18 的 `import-boundary`、`tests/integrations`、`tests/authoring`；15/16 实际 assembly 的六组合。09 不重复认领 R1 结构实现 |
| PI-CMD → 02（P4/P6） | 18 `pi-native-consumers` directed/toggle/非法参数；19/20；27 的真实多消费方命令 |
| PI-PROMPT → 02（P6） | 18 `pi-native-consumers` 同 branch 分离、init/reminder 与 shutdown 停止；19/20 的真实请求前缀与历史顺序 |
| PI-STATE → 02（P8/P10） | 18 `pi-native-consumers` 原始 restart/switch-target/switch-other replay；19/20 的 restore／switch 与实际 child 不写 Owner State |
| PI-CONFIG → 02（P4/P9/P13） | 18 `pi-native-consumers` valid/nonboolean/malformed、业务预算拒绝后修正；21 非法配置真实拒绝且主会话仍运行 |
| PI-FACTS → 02（P4/P5） | 18 `pi-native-consumers` 精确价格／实时 provider access、错误身份与无重试 |
| PI-LOCAL-FAIL → 02（P10/P13/P14） | 18 `pi-native-consumers` registry/command Error/AbortError、cleanup 后 extension effect/prompt 停止；保留 framework-local toggle 的既有可达规则 |
| OMP-CMD-PROMPT → 03（P4/P6） | 18 `actions-routing`、`injection`；17 `startup-modes-loading` 与 `consumer-regression` 实际命令／请求 |
| OMP-STATE → 03（P8/P10） | 18 `injection` 的 frozen historical journal、owner-inheritance 与分支恢复；17 `session-recovery` |
| OMP-CONFIG-FACTS → 03（P4/P9） | 18 config/startup-requirements、turn 的 model/provider；17 选定配置、拒绝一个消费方仍加载另一个 |
| OMP-LOCAL-FAIL → 03（P10/P13/P14） | 18 `actions-routing` 异步等待／错误反馈、`turn` 的 provider Error/AbortError、`injection` host-retained prompt 停止而另一 extension 继续 |
| PI-SESSION → 04（P5/P10） | 18 `pi-session-facts`、owner/observation；22 child 真实身份与 direct parent |
| PI-TURN → 04（P5/P13） | 18 `pi-turn-mapping` 取消/失败/usage/HTTP边界；21/23 真实消费记录与取消 |
| PI-ROUND → 04（P5/P11/P13） | 18 `pi-round-mapping`、`pi-background-rounds`；23/24 真实 provider held-work、终止及迟到交付 |
| PI-PROVIDER → 04（P4/P9/P11/P13） | 18 `pi-subagent-integration`、`pi-subagent-provider-path` 的 disabled/missing/refused/protocol/identity/version/config 与 299/300ms 一次预算；22 的真实 0.78.0 export/extension，受控替身结果不作为真实接通证明 |
| PI-CHILD → 04（P10/P12） | 18 `pi-child-extensions` 两注册顺序与坏第二 entry；19/20 与22 实际 child launch、child 自己的请求／journal／记录 |
| PI-RELEASE → 04（P10/P13/P14） | 18 `pi-subagent-integration` 独立 release/rebind、`pi-disposal-round-close`；22 parent disposal 后无 storage 写入、25真实退出 |
| OMP-SESSION → 05（P5/P10） | 18 `session`、owner-gate、session-context-observation；17 `session-ownership-tree` 三会话父链／rename |
| OMP-TURN-ROUND → 05（P5/P13） | 18 `turn`、`round`；17 `turn-facts`、`round-facts`、`activity-facts` 与三消费方终止 |
| OMP-CHILD-RELEASE → 05（P10/P12/P14） | 18 `implementation-lifecycle` native拒绝后恢复／rename及command release；17 `binding-lifecycle`、真实 child/grandchild 加载及独立消费 |
| PI-UI → 06（P7/P10/P14） | 18 `pi-marker-feedback` 的实际 session/child/follow/default、same-extension bindings、有/无UI、三severity及native error；19–21 RPC输出，非H1 |
| OMP-UI → 07（P7/P10/P14/P15） | 18 `viewed-marker`、`feedback-harness` 的有/无outlet、有/无UI、unknown identity、queued callback、Error；17 patched viewed-marker/viewed-session-host 与 unpatched absent control，非交互focus认证 |
| COMBO-PI → 09（P10/P12/P13/P14） | 新 `assembly-cross-entry` Pi 三例＋15000ms closeout：event→directed-command→UI→release，另一 binding 继续；部分注册拒绝→fresh bind；异步 action 取消仍按原反馈结果／等待顺序；22 多extension实际child＋27 三正式consumer组合 |
| COMBO-OMP → 09（P10/P13/P14） | 同文件 OMP release 与 action cancellation 通过；**部分注册拒绝后的旧 callback 泄漏失败**；17 三消费方真实取消／终止作为S2组合，不重复认领05路径内测试 |
| HANDOFF → 09（P7/P17） | 本节分级证据、baseline-output-comparison.json、以下H1步骤与明确的未确认记录 |

由此 P1–P17 每一 coverage 均有唯一实现／测试 owner 和具体观察，没有把路径内遗漏留给09。**这不是全 promise 通过表**：P10/P14 的 OMP failed-binding delivery 隔离存在反例；P7/H1 未完成；远端模型与未实跑版本不认证。

#### 本票测试设计与真实 red

批准 seam 为 S1（公开 `piAdapter` / `ompAdapter`＋extension consumption interface），外部 native registration/event/UI 做测试替身，不替换 framework 内部或访问私有 store。独立预期来自既有 directed/action、State、生命周期与 close-out 契约：

1. 已活跃的两个 binding 各自先产生 event/command/marker；release 第一个后，再送 native start/run 和保留的 directed command，不再产生它应停止的 callback、写入或UI；第二个照常写 false、清除自己的 marker。可识别旧 callback 泄漏／全局误清理。两端均通过；不把 framework-local toggle 误规定为 release 后必须停止。
2. native `registerCommand` 在已有订阅后抛出固定 Error；绑定必须拒绝、一次 cleanup，后来的 accepted bind 仍使用 fresh instance、正确身份、State 和 Marker；旧 native callback 不能再调用已清理 instance。Pi 通过，OMP 发现真实反例；保留原独立预期，不改成绿色。
3. **Named action** 才具有异步完成契约：用 gate 证明另一个 binding 可先完成，原 action 仍等待；取消后按原规则正常返回、仅一次 error severity 反馈，无写入／无重试。两端均通过。最初把异步等待套到返回 `void` 的 directed command 是测试假设错误，已纠正；没有据此改动产品或新增 promise。
4. Pi 的 awaited disposal 在 `round_end` 进入后仍等待；14999ms 未答、15000ms 答复一次，顺序是 round_end→session_end→cleanup，并明确报告 work unconfirmed；另一 binding 的 action 在等待期间及之后均可运行。没有给 OMP 发明不存在的 disposal timeout。

`01` 是缺 yaml 的 setup failure，`02` frozen-lockfile install 成功；`03/04` 是把 directed 参数写成 `on`（原契约只认空参数和 `off`）的 fixture 错误；`07–09` 是测试误用 directed await、action名 `run` 的形状歧义和原失败文本漏前缀；`10` 是新增测试使用 ES2022 `.at` 与仓库lib不符。全部原日志保留，但均不算产品 red 或成功证据；修正后12/14 typecheck通过，11 action cancellation及13 timeout通过，最终18包含所有最终测试。

**唯一最终失败／精确复现：**

```text
PI_NODE=D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe
bun test tests/framework/assembly-cross-entry.test.ts --test-name-pattern "partially registered refusal"
```

该命令用于之后复现；本轮实际执行的精确完整命令见06（初始捕获）和18（最终全仓），未为确认已知失败额外重跑。OMP 正常拒绝结果为 `initialization / registration failed: command registration refused`，但 trace 实际为：

```text
1:cleanup
1:start:omp-refused          ← 拒绝后仍调用已 cleanup 的 instance
2:start:omp-accepted
2:activate
2:cleanup
```

预期只有除箭头行外四项。最终18中 accepted binding 的 feedback／State／marker断言已经通过后才断言旧callback，不因早期失败而漏测重新绑定。该失败来自比05原有 `setLabel` 早拒绝更晚的部分注册位置。Main 明确指示保留失败与复现，不在来源重组内默默修复。未 skip、未 xfail、未降级预期，**全仓 exit1 保留**。前序07曾报告的 late-run Viewed subscription反例本轮18同名精确用例通过；没有仅凭名称认定仍失败或据此声称旧环境也修好了。

基线02-consumers曾有 Codex outbound-role timeout／panel安全壳assert，04曾有联合Pi运行不稳定，这些是各自源／环境的历史失败，不搬成当前通过，也不把新的OMP部分注册泄漏归为它们。本轮18唯一失败以原日志为准。

### H1 — 已准备，等待用户；P7 整体验收未完成

**用户确认：尚未收到；Pi 未验证，OMP 未验证。** H1只评价实际可用日常TUI体验，不代替上述自动化、底层身份／状态、可选分支或真实provider接通；也不能关闭OMP泄漏反例。请在完成agent运行后的本交接上实际操作并给出结论，而不是把RPC帧当作肉眼签署。

#### 重构前后材料与已知差异

- Pi：01 `08-pi-codebase-node22.log`、`10-pi-codebase-auto.log`、`11-pi-model-cost.log` 为重构前78/62/100项输出；06 `06-pi-ui-artifacts/` 为其后态；本轮19/20/21为最终稳定源输出。`09-final-artifacts/baseline-output-comparison.json` 逐项比较有序成功观察文本，三组均相同。**不是原始UI payload字节等同，更不是前后交互TUI录像。** Pi实际均1.4.0，部分脚本期望来源是1.2.0，未提升支持；Node24既有libuv退出问题不由Node22成功覆盖。
- OMP：07交接的重构前S1三文件23/0（64断言），固定独立输出是 Owner `[◈ follow, ◐ none]`、sub-follow `[◈ follow]`、identity unavailable清空；迁移后S1保持这些预期；本轮17/18真实patch/control通过。07原真实日志为 `C:/Users/hugos/AppData/Local/Temp/hyper-ticket-VWxgE8/.cache/ticket07-real-omp.log`（14/0、177断言）；09重新执行而非将旧源结果当当前认证。**没有重构前真实TUI录像，交互focus只能由用户此次确认，不能补造前态。**
- 两端有UI时 info/warning/error 与 headless stderr 的独立断言见18；真实RPC是 setWidget/notify 层，不证明可读性。Pi无framework Viewed-session outlet，不能按显示名猜focus；OMP仅现有patched artifact提供outlet，unpatched依旧缺失。定时redraw、所有日常provider/账户组合、其他平台版本的体验不由这组smoke外推。

#### 用户可重复操作

1. **记录实际环境与加载集合。** 填Pi/OMP exact版本、Node/Bun、是否使用现有Viewed-session/response patch、manual或auto入口、日常provider与实际session ID；保留当时终端输出／截图。一个extension不要同时加载manual和auto入口。不得为了H1安装或修改补丁，也不改正式业务配置／已有统计数据。
2. **Pi manual / auto。** 在日常Pi按原加载方式使用 `entrypoints/pi/codebase-tools.ts`（或已使用的 `pi-auto`）。manual新主会话初始无该Marker；执行 `/codebase-tools` 显示 `◈ codeBaseTools` 和原启用反馈，再次执行清除并显示原关闭反馈。auto新启动保持原自动启用、没有伪造命令启用通知，原命令仍可关闭／重开。用普通请求、新建／恢复不同实际会话验证各自State和反馈未串；按原有可用方式查看child，不新增Pi focus投影承诺。
3. **日常消费方共存。** 保留model-cost日常显示，观察与Marker area的布局、通知可读性；执行 `/budget detail` 与非法参数对比原help／拒绝。可用panel时 `/connect-bot` 接通应添加 `◐ connectBot`，关闭codebase-tools不得移走connectBot；`/connect-bot off`仅移除自己的line和反馈，不新增模型对话文本。若panel/provider不存在，记录不可用与观察到的既有通知，不把未运行分支勾为通过。
4. **OMP Viewed-session，只有已有patch时。** 使用 [既有patch README](../../../host-patches/omp-18.5.0-viewed-session/README.md) 中的日常既有patched CLI，加载 `tests/harness-dock/fixtures/viewed-marker-follow/entrypoint.ts` 与 `viewed-marker-none/entrypoint.ts`；主会话执行 `/marker-follow-toggle`、`/marker-none-toggle`，应显示 `◈ followMarker` 和 `◐ noneMarker`；focus实际child只显示follow，回main恢复两行；main关闭follow后再看child应清空。身份用真实session而非相似名称确认。无patch时只确认原delivery自身投影和反馈，记录 Viewed-session交互“不适用/未接通”，不安装补丁消除缺口。
5. **OMP正式consumer。** 加载实际使用的 `entrypoints/omp/codebase-tools.ts`（或既有auto入口）重复开关、观察info反馈与Marker显示／清除；与model-cost／connect-bot共存，切换实际Viewed session后比较应有投影，不应写Owner State或把反馈注入模型上下文。
6. **请返回结果。** 分Pi／OMP记录“环境／入口／实际主child身份／操作／期望／实际／截图或输出／一致、差异或未运行”。H1允许mixed结论；只有用户实际提供结论后才原样记录。当前记录仍为 **等待用户，未签署**，P7与整体任务不能宣称全通过。

本票无待实现产品代码或临时脚本；可交给独立集成。保留的未完成验收只有明确列出的OMP反例、H1与超出实际环境的验证限制，不通过修改父spec/contract、支持矩阵或其他票据来消除。
