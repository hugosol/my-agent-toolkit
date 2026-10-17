# 12: 两种进程模式的真实宿主复用验收

**What to build:** 在实际 OMP、pi 前台和 pi 后台中对照验证共同观察含义、同进程零端点路径和 adapter 复用边界，发布可归因的全自动验收报告。报告严格区分确定性检查、真实进程、真实宿主和视觉观察，不把缺失平台／版本或历史结果计为本次通过。

**Delivers:** P24, P34, P35

**Blocked by:** 06 — State follow 与会话观察独立运行；07 — 观察按事件去重，展示合并采用最新值；09 — 合并同步不漏更新，并保护周期与在途累计；11 — 退出总截止有界，准确报告保存结果。

**Status:** in-progress — 验收、测试与真实宿主证据已完成并提交在本票分支；实现与记录提交尚未合入 `hyper-tdd`（合入由宿主排队执行），故不置 `closed`。

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
