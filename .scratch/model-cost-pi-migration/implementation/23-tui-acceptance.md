# 23: 真实 TUI 正常与窄宽度验收

**What to build:** 提供可实际运行的两端终端场景与正常/窄宽度证据，由用户判断相同业务内容的格式、间距与可读性是否可接受。

**Delivers:** P52

**Blocked by:** [21：共同路径消费者与真实宿主回归](21-consumer-regression.md)

**Status:** in-progress — Agent 侧实现与自动检查已在本分支完成（`scripts/pi-tui-acceptance.ts` + `scripts/support/{tui-acceptance-fixture,terminal-screen}.ts` + `package.json` 一行；捕获运行 46 ok / 0 failed，`bun test tests/model-cost` 463 pass / 0 fail，`bun run typecheck` exit 0，见[证据](../evidence/23-tui-acceptance.md)）。**人类验收（真终端格式/间距/窄宽度/观感）未确认，不得据此判为通过。** 实现已随集成提交 `8c7256f5bb0529371a4e970b53a6f29b030a56b4` 合入 `pi-adapter` 并由宿主合回本分支，本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0；全仓 `bun run test` 在文档化环境下 **1200 pass / 0 fail**），无源码修复，见[证据 §8](../evidence/23-tui-acceptance.md)——**人类验收仍未确认，故 Status 保持 in-progress**。

## Acceptance criteria

- [ ] Agent 完成内容/布局自动检查并准备隔离运行入口、固定业务场景和宽度输出；在 18/19 可用后即可提前准备，不必等本票可验收才收集。
- [ ] 运行真实 TUI，保存可获得截图/录屏，无法获取图像如实记录；至少覆盖 brief/detail、树、未知/不完整及宽度退化，RPC 不替代 TUI。
- [ ] 人类确认前必须完成全功能实现及已分配自动检查；格式、间距、窄宽度与观感由用户确认，未确认不得写为通过。
- [ ] 不以 22 的人工效率确认作为本票 blocker；两项人工判断相互独立。
- [ ] **P52 完整 Coverage（S2）**：Agent 先完成内容/布局自动检查，准备隔离可运行入口、固定场景、宽度输出及可获得的截图/录屏；无法获取图像如实记录。**人类验收：真实 TUI 的格式、间距、窄宽度与观感**。RPC 不替代此项。

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

## Comments

- **本轮（首次执行，Agent 半完成）**：交付隔离可运行入口、固定业务场景、宽度输出与内容/布局自动检查，并取得可获得的截图/录屏。全部证据、源 hash、命令与未确认项见[23-tui-acceptance.md](../evidence/23-tui-acceptance.md)，此处不重复。
- **逐条状态**：
  - “Agent 完成内容/布局自动检查并准备隔离运行入口、固定业务场景和宽度输出”：**已完成**（`bun scripts/pi-tui-acceptance.ts --widths 120,80,60` → 46 ok / 0 failed；`--interactive` 供人看真 TUI）。
  - “运行真实 TUI，保存可获得截图/录屏，至少覆盖 brief/detail、树、未知/不完整及宽度退化，RPC 不替代 TUI”：**已完成**（真 pi 终端 UI，PTY 内的 TUI 进程；brief/detail × 120/80/60 六帧；`Run: —`/`Run: 0ms`/`?(?)`/无金额行都已覆盖；录屏＝每帧原始 ANSI 流，截图＝单元格渲染的 PNG）。**未覆盖**：POSIX、fullscreen 形态、真实模型请求（本票会话不发请求）。
  - “人类确认前必须完成全功能实现及已分配自动检查；格式、间距、窄宽度与观感由用户确认，未确认不得写为通过”：**人类确认未做**——真终端格式/间距/窄宽度/观感仍是用户判断，本票不代判，也不据此写通过。
  - “不以 22 的人工效率确认作为本票 blocker”：遵守（两处人工判断互不牵连，本票未引用 22 的结论）。
  - “P52 完整 Coverage（S2）”：Agent 半如上；**人类半未确认**。
- **未因自动检查全绿而改变的限制**：22/21 的结论、OMP 消费端回归、docs 更新与 fault-injection 复核不在本票；`runtimeGap`（持久化的不完整事实）在绘制面无额外标记，本票按下记录，不新增绘制要求。
- **复核轮（重新派发后，同一 worktree／分支，源与已提交状态逐字节相同）**：重跑了本票的全部可执行检查——`bun run typecheck` exit 0；`bun test tests/model-cost` 463 pass / 0 fail；`bun scripts/pi-tui-acceptance.ts --widths 120,80,60` **46 ok / 0 failed**，`observations` 与已提交 `report.json` 逐条相同（只有运行根随机路径与终端空白尾行的差异）。用两次临时故障注入确认检查灵敏：丢掉每条会话自己的金额 → 6 条 FAIL；窄宽度吞掉行尾（`Balance:`／`Span:`）→ 4 条只落在 60 列的 FAIL；两次注入均已还原（`git status` 干净）并在还原后重跑回复 46/0。捕获运行无残留隔离根与残留进程，工作树未被写入。**本轮无控制台**（shell 无 pty），`--interactive` 只验证到入口建立隔离根并启动 pi 后退出；"交互形态真的画出内容"仍由上一轮真实控制台那次运行与捕获模式的 6 个 PTY 帧支持。**人类验收（格式／间距／窄宽度／观感）仍未确认，不得据此判为通过。** 详见[证据](../evidence/23-tui-acceptance.md) §7 与 `logs/23-tui-acceptance-recheck.log`。
- **集成轮（同步核对 + 合并后全仓回归）**：宿主已把集成提交 `8c7256f…` merge 回本分支（交接时 HEAD 与 `pi-adapter` 同点、`git log pi-adapter ^HEAD` 为空；之后 `pi-adapter` 前进到 `6164d14`＝25 的合入，本分支不含该提交，由宿主排队）。合入无冲突（`git ls-files -u` 0 条、全树无冲突标记），两侧字节都没被改写：`git diff --stat 69cc246 HEAD -- scripts/ package.json` 为空且四个交付文件 blob 仍为 `bdc7060d…`/`c2e0dcc1…`/`2f0faa25…`/`e05afde5…`；`git diff --stat e45a9ff HEAD -- framework/ extensions/ entrypoints/ tests/ docs/` 为空。`bun run typecheck` exit 0。全仓 `bun run test` 按检出状态为 1153 pass / 18 fail（10 条 `patch.diff touches no file`、2 条 lockfile sha256、5 条 connect-bot 面板二进制缺失、1 条 5s 期限时序——皆为 CRLF 检出与 `%TEMP%` 缺 `omp-bot` 二进制的既有环境条件，与本票内容无关），按各前轮文档化环境（三处冻结文件归一到已提交 LF 字节 + `OMP_BOT_BINARY`）重跑 **1200 pass / 0 fail**（6897 expect()，128 文件，438.44s）。**无源码修复**；行尾文件运行后按 sha256 逐一复原，工作区只余本轮日志与记录。人类验收仍未确认，本票仍不得判为通过。详见[证据](../evidence/23-tui-acceptance.md) §8。
