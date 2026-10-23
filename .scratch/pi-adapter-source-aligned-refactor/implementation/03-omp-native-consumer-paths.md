# 03: OMP 原生 State、命令、prompt 与模型供给路径迁移

**What to build:** OMP extension 继续按原配置激活、执行命令和提交 prompt，从原来有效的 State 内容恢复并继续写入，且获得既有模型目录、价格和访问事实；完整职责按 OMP 自身契约组织，而不复制 Pi 内部布局。

**Delivers:** P6、P8、P9（OMP）；P10、P13、P14（OMP 本票行为入口的适用覆盖项）

**Test owner for:** P6、P8、P9 的 OMP 用例；P10、P13、P14 中 OMP State／命令／prompt／模型供给路径的独立用例。跨路径组合用例由 09 拥有。

**Blocked by:** 01: 固化迁移清单与重构前验证基线。

**Status:** in-progress

## 边界与覆盖

遵循本 feature 的 spec／contract 和 01 的职责分配，观察 S1／S2。不重组 Session／Turn／Round 状态机、原生子会话关系或 UI transport；必要调用方原子迁移。原生模型事实按实际消费契约保留，不新增能力或支持声明。

- [x] 按实际 OMP 原生契约归置完整 State 编码、读取、恢复及写入协议，保持唯一状态和资源所有权；不为对称创建空来源分组或单事件镜像。
- [x] 从公开 assembly 观察命令成功及既有拒绝／失败结果、激活规则、prompt 的请求内容与历史顺序；保留原有交付规则，不要求与 Pi 原生事件或请求形式相同。
- [x] 使用 01 的重构前有效样例验证恢复值、分支选择和后续写入；不新增迁移、格式升级或恢复回退。
- [x] 验证受影响有效配置按原意生效、既有失败输入仍按原方式失败；用户配置不因内部源码移动而改变。
- [x] 保留实际消费的模型目录、价格和访问事实及其既有不可用／失败含义，以独立预期验证受影响消费行为，不仅检查转发调用。
- [x] 覆盖本票路径适用的多 extension／binding 隔离、错误与取消传播、释放后命令／回调／外部效果停止。不为没有既有超时机制的路径新增要求；跨路径用例按 01 账本交给 09。
- [x] 类型和加载支持随实际职责迁移，更新全部受影响调用方及直接导航，删除旧实现和兼容转发；不向消费方泄漏来源细节，不在 port assembly 新增语义解释。
- [x] 通过公开 assembly 的消费场景及适用 OMP 真实 harness 场景证明迁移后的行为，记录与基线的比较和限制。

## 本票实现与验收记录

- 实现提交：`26588da`。完整 State entry 命名、branch 有序读取、append 写入和已持久化 prompt identity 放在 `native/session/session-manager.ts`；命令、prompt、context tracker／usage／idle 位于 `native/extensibility/extensions/`；目录价格与 provider 访问位于 `native/config/model-registry.ts`。私有 `port.ts` 独立于公开 `index.ts`，没有新增 port 语义或兼容转发。
- 原生扩展类型及 OMP loader 包声明归到 extension 契约；通用 Markdown 文本声明仍在 `adapters/modules.d.ts`。已和 05 协调其后续 lifecycle／registry 引用切换，以及 registry／session-entry 类型归还所属协议；这些不是本票复制的第二套实现。
- S1 仅从公开 `ompAdapter` 和 extension 消费 interface 验证。新增 frozen-journal 恢复、原生命令 await／拒绝／失败、provider 错误／取消保持原对象且不重试、释放后 prompt 停止但另一 extension 继续的覆盖。释放后的 framework-local toggle 按既有 `binding.ts` 明确规则仍可调用；本票不把它改成停止，注入的业务命令停止由既有 lifecycle 用例和 05 补充。
- 历史输入：`tests/codebase-tools/fixtures/omp-state-before-source-refactor.jsonl`，逐文件复制自 01 在源 revision `89bd2d72`、OMP 18.5.0／Bun 1.4.2、unpatched 下捕获的 `omp-state-before.jsonl`。预期是恢复 true、复用 init、追加 reminder、下一 toggle 写 false；不是新实现自己写后自己读。临时把 State entry 过滤改为不存在的名称时，`bun test tests/framework/injection.test.ts -t historical` 退出 1，因缺少预期 reminder 失败；恢复后退出 0（1 pass）。该故障注入已经还原。
- 原有行为在移动前已通过相关 7 个 framework 文件（107 pass）；移动后对应 108 pass。最终新增场景的定向命令 `bun test tests/framework/actions-routing.test.ts tests/framework/injection.test.ts tests/framework/turn.test.ts` 退出 0：52 pass、177 assertions。
- `bun test tests/framework`：退出 0，660 pass／57 files／3453 assertions；之后新增的 prompt-release／原生命令场景另由上述定向运行覆盖。该分区同时覆盖 session 恢复、branch／fork 目标选择、同 identity tree 不 reseed、主子会话写入权限、有效与失败配置、command／prompt 激活交付及 binding 隔离。
- `bun test tests/codebase-tools tests/model-cost tests/connect-bot`：退出 1，745 pass／2 fail／85 files。一个是本票新历史 replay 测试过严地假设资源文本不同／用户内容不带 OMP metadata，已按原生契约修正消费观察；另一个是既有 `history-interop.test.ts` 要求 panel 安全壳、当前默认外部 binary 未提供其诊断，与 01 的同测试、同 `安全壳` 断言一致。保留断言，不改产品；01 曾出现的 Codex outbound-role 超时在本次运行未出现。
- `bun run typecheck`：最终定向运行之后退出 0；authoring 检查 61 files／4 declarations／0 diagnostics。过程中发现并修正了新测试的 readonly-array 断言类型；没有更改生产类型承诺。
- `bun scripts/check-adapter-integrations.ts --adapter omp --json`：退出 0；三 consumer 全部 `complete: true`，无 diagnostics；这是结构供给证据，不是行为或版本支持认证。
- 最终 `HERDR_BOT_BINARY=E:/Developer/myhub/herdr-bot/backend/target/debug/examples/safe_shutdown_shell.exe bun test tests/codebase-tools/startup-recovery-dock.test.ts tests/connect-bot/history-interop.test.ts`：退出 0，8 pass／126 assertions／17.33s。实际使用 Windows／Bun 1.4.2、隔离 OMP 18.5.0 unpatched、受控模型 capture provider 和已有安全壳 binary；没有修改宿主或安装补丁。真实 replay 证明旧 journal 的 true 恢复、唯一 init 与追加 reminder、原用户→init→原响应→新用户→reminder 的请求顺序、后续 false 写入，以及原 journal entries 原值原序保留。安全壳定向复验也通过既有 OMP storage failure／显式恢复／shutdown 语义测试；默认 binary 下的原失败仍如实留在完整 consumer 分区日志，没有删除安全断言。
- 最终 `bun run typecheck` 再次退出 0，61 files／4 declarations／0 diagnostics；原始长运行、静态供给及最终实机／类型检查输出保存在 [本票 evidence 目录](./03-omp-native-consumer-paths-artifacts/)。
- 本票代码和自动验收已完成，工作树交给独立集成；尚未合入 `dev`，依仓库规则保持 `in-progress`，不提前标为 merged／closed。没有本票未完成实现。跨路径组合由 09、全局架构收口由 08、H1 日常 TUI 人工判断由原 contract 所有者继续负责；本票不据受控模型事实／unpatched 运行声称真实远端 provider、可选补丁或人工 TUI 支持已验证。

## 独立集成验收（2026-10-24）

- 接管原开发分支，在宿主已启动的 merge 中解决 `framework/docs/framework-capabilities.md` 两处冲突：分别保留本票 OMP 与 02 Pi 的真实原生路径，没有选择单边而丢失另一端迁移。merge 提交 `66ddffa`，合入的集成基线为 `921de1d861cc78797e758f7ddc01a3413e19fb54`。
- 采用 02 的共享全局测试修复 `257d84b`、`ec861fa`，本分支对应 `d0b5e54`、`ad5e6e4`：真实安全壳、直连 SSE 生命周期，以及明确委派 effort 隔离辅助模型调用；不削弱原行为断言。
- 源状态 `ad5e6e4` 首轮 `bun run test` 退出 1：1551 pass、68 fail、9130 assertions、183 files、412.27s。失败来自本 worktree 的 OMP 安装缓存缺少发布包内 `@oh-my-pi/omp-stats/src/embedded-client.generated.txt`，包括 deployment 模块导入和真实 OMP 启动；原始日志为 [integration-global-test.log](./03-omp-native-consumer-paths-artifacts/integration-global-test.log)。
- 从 npm 官方 `@oh-my-pi/omp-stats@18.5.0` tar 恢复缺失的原生 **0 字节**文件。下载 tar 的 SHA512 为 `z9yfQPotgV67146b0lnp8FmTzgT/zpzKKoETNZid51RWwF8n6H7lDzLPqgVlIfIDwBFY+3qaetD3bbmT6r6u7Q==`，与此缓存 `bun.lock` 完全一致；没有生成替代内容、改宿主源码或安装补丁。该修复只恢复忽略的本地依赖缓存。
- 同一源码、修复安装后 `bun run test` 退出 0：**1632 pass、0 fail、10034 assertions、183 files、528.56s**。使用 `HERDR_BOT_BINARY=E:/Developer/myhub/herdr-bot/backend/target/debug/examples/safe_shutdown_shell.exe` 与 `HERDR_BOT_METADATA=E:/Developer/myhub/herdr-bot/meta-data/bot-options.toml`。最终完整日志为 [integration-global-test-restored-package.log](./03-omp-native-consumer-paths-artifacts/integration-global-test-restored-package.log)。
- 本轮按接管任务只运行全局测试；未另跑 typecheck、复杂脚本、独立 smoke 或跨票据整体验收。未操作集成工作区、切换分支或直接合入 `dev`；等待宿主排队合并，合并前状态仍保持 `in-progress`。本轮自动检查通过不替代 contract 的最终独立门禁或 H1 人工判断。

## 验证与交接

迭代运行受影响测试；TypeScript 变更运行类型检查。完成时运行拥有该职责的测试分区、受影响消费方及对应真实 harness dock／smoke。预期来自既有契约、独立字面量或历史样例，不从被测实现计算。保留消费可见断言，删除仅锁定旧布局的测试而非重钉新路径。记录命令、退出状态、源／环境和失败；现存缺陷单独报告，不顺手修复。共享 assembly 编辑需协调，但不新增虚假的 ticket 阻塞。直接文档随本票更新，全局架构收口归 08。
