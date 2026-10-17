# 12: 两种进程模式的真实宿主复用验收

**What to build:** 在实际 OMP、pi 前台和 pi 后台中对照验证共同观察含义、同进程零端点路径和 adapter 复用边界，发布可归因的全自动验收报告。报告严格区分确定性检查、真实进程、真实宿主和视觉观察，不把缺失平台／版本或历史结果计为本次通过。

**Delivers:** P24, P34, P35

**Blocked by:** 06 — State follow 与会话观察独立运行；07 — 观察按事件去重，展示合并采用最新值；09 — 合并同步不漏更新，并保护周期与在途累计；11 — 退出总截止有界，准确报告保存结果。

**Status:** in-progress — 实现与证据已随集成提交 `43da6c591f2d221f95211af5255fc05a08bf4bf0` 合入 `hyper-tdd`（宿主已把该提交合回本分支，故本分支 HEAD 即该提交）；本轮集成验收在同一 HEAD 上完成（归一检出 + `OMP_BOT_BINARY` 全仓 `bun run test` → 1364 pass / 0 fail）。本轮的记录提交尚未再合回 `hyper-tdd`，该记录合入后方可置 `closed`。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票为 P24、P34、P35 的唯一完整验收与测试所有者，阻塞关系传递覆盖全部实现贡献。前序票仍拥有各自 promises 的全部测试和真实运行验收，不得把缺失 coverage 转移到本票；本票不是补齐未完成实现的兜底票。

- [x] 同进程运行通过实际资源／通信观察证明不创建接入端点或定位记录、不执行序列化通信；独立给定事实在同进程与真实跨进程路径得到等价共同观察。
- [x] 取得本次实际 OMP、pi 前台及 pi 后台回归证据，覆盖实际 detail 表面、首轮提交前读数及后台退出前提交；不能由后台通过推断前台或 OMP 通过，不能以内部 registry 或提供方完成通知替代实际表面。
- [x] P34 的行为覆盖对照实际同进程与跨进程 adapter 的共同 interface 使用；维护性审查确认原生映射留在 adapter，通信和来源管理在 framework，计费及展示规则在扩展 shared logic，不按 harness 复制这些规则。不为验收实现第三个 harness。
- [x] 收集并关联各票确定性检查、真实进程、真实宿主、文件提交及视觉观察证据；覆盖 contract 所需正常退出、重连、断连、嵌套、并发、计费归属、失败／截止结果，缺失证据标为未验证而非通过。
- [x] 分别记录采集／通知、绘制和退出等待测量，不只提交最终截图，不宣称未经测量的性能或零开销。
- [x] 报告记录源代码／环境状态、harness／第三方版本、操作系统、命令、退出状态、结果、计时及日志；区分执行、通过、失败、未验证。Windows 证据不认证 POSIX，未执行的其他平台和版本显式保留限制。
- [x] 复用隔离本机兼容端点与临时存储，不依赖付费模型调用，不写操作者真实消费或会话数据；Full automation 下环境阻塞不自动转为人工例外或通过。
- [x] 按共享工作树协调约定取得稳定验证窗口，故障注入恢复后顺序执行最终 typecheck、全仓测试及契约要求的实际宿主／终端 smoke。记录实际命令、退出状态及失败；前序结果仅在源码、依赖、fixture 和环境均未变化时引用，测试期间变更的树不能作为最终证据。

## 本轮验收记录（2026-10-17）

- **交付**：新增 `tests/framework/process-mode-reuse.test.ts`（P24/P34 的同进程零端点、两路径等价、
  两个实际 adapter 的共同 interface）；修复 `scripts/pi-subagent-smoke.ts` 前台检查对 child/parent 两次
  提交先后作的同步假设（改为有界等待两个记录，无固定 sleep）；证据与日志见
  [evidence/12-real-harness-reuse-verification-evidence-2026-10-17.md](../evidence/12-real-harness-reuse-verification-evidence-2026-10-17.md)。
- **最终门禁（本树，顺序执行）**：`bun run typecheck` exit 0；归一冻结文件后 `bun test tests/harness-dock`
  → 107 pass / 0 fail / 1,185 expect / 28 files / 249.03s / exit 0（OMP 18.5.0 真实宿主）；
  `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun run test` →
  **1364 pass / 0 fail / 7,702 expect / 153 files / 441.82s / exit 0**；冻结文件按字节还原。
  最终 pi 1.3.0 smoke：前台 14 observations / exit 0，后台 10 observations / exit 0（合计 42.30s）；
  `pi-close-out-smoke`：11 observations / exit 0（正常关闭 12ms；真实持锁截止 14,998ms）。
  现场：门禁期间另一 worktree（票据 09）的全仓回归仍在运行（同机、不同 worktree/.cache）；本树两次
  运行均 0 fail，但不宣称完全独占的安静窗口，严格独占窗口需在合入前重跑。
- **分区**：`tests/framework` 582 pass / 0 fail（含本票 3 例）；`tests/model-cost` 507 pass / 2 transient
  fail（并发负载下 `savedDocument` 时序，单跑 12/12 通过），最终全仓零失败。
- **P34 审查**：原生映射在 adapter，通信/来源在 framework，计费与业务展示规则在 extension shared logic；
  两个前端仍保留近似重复的终端布局辅助实现，作为绘制层债务记录，不宣称展示层完全无复制。
- **未验证**：POSIX、其他 OMP/pi 版本、真实 pi 截断场景、真实 OMP 嵌套/并发单独运行、人类终端可读性
  判断；Windows 证据不认证其他平台。实现与记录提交尚未合入 `hyper-tdd`，故状态保持 `in-progress`。

## Comments

### 2026-10-17 集成同步与合并树验收（本轮由集成 helper 执行）

- **同步结果（本 worktree 即现场）**：分支 `hyper/framework-subagent-observation/12-real-harness-reuse-verificati-f0bd4a-e98ea402077c`，
  HEAD = `43da6c591f2d221f95211af5255fc05a08bf4bf0`，即宿主已合回本分支的集成提交（首次合入成功）。
  该提交的两个父为 `3b0a1f7c2cd892516af163ff1f5d191a48ea9759`（合入前的 `hyper-tdd` 尖端，含 09 的合并提交）
  与 `ce7ba1b50b70b00bd95f483fbf536ff465197485`（本票实现 head）。
  `git diff --name-status 3b0a1f7 43da6c5` 恰为本票 27 个路径（与本票实现提交逐条对应，无本票之外的路径）。
  检查时 `hyper-tdd` 尖端为 `35ecd5c`（其上仅有 09 的本轮记录提交 `9c90a37`）；`43da6c5` 是其祖先，
  `git diff --name-status hyper-tdd HEAD` 只有 09 的记录文档一个路径，无源码差异。
  无冲突残留：`git status --porcelain` 干净、`git ls-files -u` 0 条未合并路径、冲突标记扫描无命中。
- **本轮集成验收（同一 HEAD `43da6c5`，只运行全仓测试）**：
  - 归一检出（`core.autocrlf=true` 的 CRLF 检出，三份行尾敏感文件临时还原为已提交 LF blob 字节：`bun.lock`
    `a5d37ab2…`、`host-patches/omp-18.5.0-viewed-session/patch.diff` `66195465…`、
    `host-patches/omp-18.5.0-codex-response-boundary/patch.diff` `4ec9ad0d…`，运行前逐一等于
    `git cat-file blob HEAD:<path>` 的 sha256）+ `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`
    （本机既有 release 构建，2026-10-09，非本轮构建产物）下：
    `bun run test` → **1364 pass / 0 fail / 7702 expect() / 153 files / 431.70s**
    （`evidence/logs/12-integration-fulltest-normalized.log`）。
  - 文件数归因：运行的 153 files 等于树内 `tests/**/*.test.ts` 文件数
    （`git ls-tree -r --name-only HEAD -- tests | grep -c '\.test\.ts$'` = 153），故没有文件在加载失败后被跳过。
  - 运行后三份文件以 `git checkout --` 还原为检出原样，sha256 与运行前逐一相同
    （`e7ed487b216f5580…`、`057e01f615c7a9ed…`、`294b37277539486f…`），`git status` 只余本轮的记录改动。
- **本轮无冲突、无源码/测试修复**：合并树全仓测试一次通过；未修改产品源码、测试或 fixture。
  按本轮任务边界，`bun run typecheck`、真机 smoke（OMP/pi）与跨票据整体验收留给最终独立门禁，未在本轮重复执行。
- **未验证（留给最终独立门禁）**：POSIX、其他 OMP/pi 版本、真实宿主 smoke 的本轮重跑结果未取得；本记录只声称
  `43da6c5` 合并树上的全仓测试结果，不认证其他平台或环境。
