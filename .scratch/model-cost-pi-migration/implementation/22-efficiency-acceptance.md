# 22: 效率前后对照与复杂度判断

**What to build:** 将完成实现与迁移前固定序列对照，证明没有禁止的重复工作并提供效率/复杂度材料，由用户判断是否存在不可接受的明显退化。

**Delivers:** P51, P57（P57 仅交付本票分区；不单独完成整个 P57）

**Test owner for:** P57（仅下方 coverage partition 指定条目）。

**Blocked by:** [21：共同路径消费者与真实宿主回归](21-consumer-regression.md)

**Status:** implemented — Agent 侧实现、自动检查与真实宿主观测已完成（源状态 `efb03e0`，无产品代码改动）；**`P51` 的人类验收（效率/复杂度是否可接受）保持未验收**。证据：`../evidence/22-efficiency-complexity.md`（对照报告 `../evidence/logs/22-efficiency-comparison.txt`，迁移后工件 `../evidence/22-efficiency-after.json`）。接手方在 `6420e21` 上独立重跑了本票全部入口（`bun run typecheck`、S1 采样入口 5 次新跑并覆盖式复现对照、`bun test tests/harness-dock/efficiency-effects.test.ts`、所属分区 `tests/harness-dock`）且无一失败，结论与 §3–§6 一致；复核明细与新增日志见该证据 §8。第二次接手方在 `385dd6d`（源状态与 §8 同一：`git diff --name-only 6420e21 385dd6d` 只含 `.scratch/`）上重跑了本票公开入口（typecheck、S1 采样一次、把"新跑工件 vs 已提交工件"判为 `none` 的对照、`01 vs 22` 对照、真实宿主 3 例两次），结论与 §3–§6/§8 一致；该轮明细与日志见该证据 §9。第三次接手方在 `f8b9616` 上重跑了本票公开入口与所属分区（直接测到集成尖端 `pi-adapter` 的产品面复杂度也一致），并**修正了对照入口的行计数口径**（`git grep -c ""` 对以空行结尾的文件少算 1 行：`framework/adapters/omp/session/facts.ts` 290 → 279 被读成 278，产品面 after 由 23772 更正为 23773、差 +4485 → +4486）；修正只用独立计数复核、不改变任何可归属差异与结论，明细见该证据 §10。**该修正只落在证据面 `scripts/efficiency-comparison.ts` 与 `.scratch/` 证据/票文件，产品代码仍无改动。** 第四次接手方在 `5714ddc` 上重跑了本票公开入口、所属分区与共同消费者（`bun run typecheck`；S1 采样一次并覆盖式复现对照；`01 vs 22` 对照的重生成报告与已提交报告**逐字节相同**；记录器两条规则直探；`bun test tests/harness-dock` 93 pass / 0 fail；`tests/framework` 481 pass / 0 fail；`tests/model-cost` 463 pass / 0 fail），并用独立计数把产品面复杂度复核到集成新尖端 `pi-adapter` `190e1b5`（产品面 `19287 → 23773`、逐族与 `efb03e0` 相同；`git merge-tree` 只读核对合并无冲突）。本轮**无源码改动**；`tests/model-cost` 首次运行出现过一次实时期限 flake（`session-recovery.test.ts` P46 用例撞 bun 的 5000ms 上限），重跑与 20 路 CPU 饱和下均 463 pass / 0 fail，已记录且不归本票。明细与日志见该证据 §11。合并由集成子代理执行，本票不自行合入。第五次接手方在 `570c7ee` 上重跑了本票全部公开入口、所属分区与共同消费者（`bun run typecheck`；S1 采样一次并覆盖式复现已提交工件（`none`）；`01 vs 22` 对照的重生成报告与已提交报告**逐字节相同**；记录器两条规则直探；`bun test tests/harness-dock` 93 pass / 0 fail；`tests/framework` 481 pass / 0 fail；`tests/model-cost` 463 pass / 0 fail），并第一手把 §3 的三条归因机制落到代码（`SubagentRuntimeDelivery` 已被移除、`roundEnded` 的 sub 分支 `announce()`、`provider-balance`/`provider-refresh` 未改）以及用第二份独立实现复核行计数（4 个 revision 与入口表逐族相同）；本轮**无源码改动**，产品面仍为 `19287 → 23773`（集成尖端 `190e1b5` 逐族相同、只读 `git merge-tree` 无冲突）。明细与日志见该证据 §12。第六次接手方在 `7274cb3` 上**补齐了此前每轮都记下的唯一可闭合缺口**——对照入口自身的自动化覆盖：新增 `tests/harness-dock/efficiency-comparison.test.ts`（11 例，只经入口的命令行 seam 观察报告文本与退出码，fixture 工件按字面量手写，期望不调用被测计算生成），并用 4 次目标注入（行计数口径回退、`file total` 移回可比差异、差异即退出 1、缺失 revision 默认 `HEAD`）各观察到一次真实失败后按 sha256 还原；同轮第一手重跑本票公开入口、所属分区与共同消费者（`bun run typecheck`；S1 一次新跑即被对照入口判为 `none`；`01 vs 22` 重生成报告与已提交报告 **sha256 相同**；真实宿主 3 例 / 21 expect()；`tests/harness-dock` **104 pass / 0 fail**（§12 的 93 + 本轮 11）；`tests/framework` **481 pass / 0 fail**；`tests/model-cost` **463 pass / 0 fail**），并把产品面复杂度复核到集成尖端 `pi-adapter` `190e1b5`（`19287 → 23773 (+4486)`，只读 `git merge-tree` 无冲突），并用 A/B 实测把 §3 中此前只有代码层归因的并发序列 `draws +3` 收敛到唯一路径（临时停用 `roundEnded` 的 sub 分支 `announce()` → 同一配置下 `33 → 30`、其余可比图与语义交付逐项不变、不变量全部成立，注入按 sha256 还原且还原后重采样仍判 `none`）。明细与日志见该证据 §13。第七次接手方在 `cbfc63c` 上把 §13 的 `draws +3` A/B 归因在交付态重做并换成可复现形式（§13 报告引用的 `3f547df` 是那一轮被改写的临时提交、交付分支上不可达）：注入单独存成补丁（`logs/22-takeover-h-ab-subannounce-injection.diff`）、被测 revision 就用交付提交 `cbfc63c`，结果同样只剩 `main-child-concurrency draws 33 -> 30` 一行可比差异、语义交付与两侧不变量不变，按 `sha256` 还原后 `draws` 回到 33 且与已提交工件对照仍为 `none`；同轮第一手重跑本票公开入口、所属分区与共同消费者（`bun run typecheck`；S1 一次新跑即被对照入口判为 `none`；`01 vs 22` 重生成报告与已提交报告 **sha256 相同**（`a486f327…`）；真实宿主 3 例 / 21 expect()；`tests/harness-dock` **104 pass / 0 fail**、1161 expect()；`tests/framework` **481 pass / 0 fail**；`tests/model-cost` **463 pass / 0 fail**），并用第二套独立行计数（`git archive` + 逐字节计数，与入口不同管线）复现产品面 `19287 → 23773 (+4486)` 与逐族数字，并把产品面复核到集成尖端 `pi-adapter` `190e1b5`（`cbfc63c → 尖端` 产品面 `+0`；只读 `git merge-tree` 无冲突）。本轮**产品代码无改动**（A/B 注入已按 `sha256` 还原，`git diff -- extensions framework entrypoints` 为空）。明细与日志见该证据 §14。第八次接手方在 `62dd204` 上把 §3 的两条「可比差异」做了同一陈述下的控制实验（**临时** worktree 检出冻结基线自己的树 `9738b5f`，先确认它逐项复现冻结工件、再用交付态采样器重采一次；跑完 `git worktree remove --force` 并确认临时目录消失，**未改任何 ref、未碰集成分支工作区**）：`requests 1→2` 与 `events 24→23` **只由采样陈述的改变产生**，同一陈述下迁移前的产品同样发出 2 次请求（并通过交付态那条"等这次到达"的不变量）与 23 次交付，**全表只剩 `draws 30→33` 一条可比差异**；同轮用同一构造与一份临时探针副本把 §6 最后一条未归因项（主子例 `frames 33→18`）归到内容级（同批状态被重复重绘的次数不同，非 widget 帧数/到达/落盘/网络逐项相同），并第一手重跑公开入口与分区（`bun run typecheck`；S1 一次新跑即判 `none`；冻结对照重生成与已提交报告 **sha256 相同**；真实宿主 3 例 / 21 expect()；`tests/harness-dock` **104 pass / 0 fail**；`tests/framework` **481 pass / 0 fail**；`tests/model-cost` **463 pass / 0 fail**）。本轮**产品代码无改动**（`git diff --name-only 39fdc3d HEAD -- framework extensions entrypoints` 仍为空）。同一陈述下的对照报告另存交付名 `../evidence/logs/22-efficiency-comparison-matched.txt`。明细与日志见该证据 §15。第九次接手方在 `1913dc9` 上第一手重跑了本票公开入口、所属分区与共同消费者（`bun run typecheck`；S1 一次新跑即被对照入口判为 `none`；冻结对照重生成报告 `sha256` 与已提交件相同（`a486f327…`）；真实宿主 3 例 / 21 expect()；`tests/harness-dock` **104 pass / 0 fail**；`tests/framework` **481 pass / 0 fail**；`tests/model-cost` **463 pass / 0 fail**），用第二套独立行计数（`git archive` 管线）复现产品面 `19287 → 23773 (+4486)` 与逐族数字（集成尖端仍 `190e1b5`、产品面 `+0`；`origin/pi-adapter` 是它的祖先、远端落后），核对本票新增的两个临时前缀（`omp-dock-effect-*`、`efficiency-comparison-*`）以及 S1 入口自己的 `model-cost-baseline-*`（本轮两次采样均无残留；现存 4 个 `-probe-` 残留的 mtime 早于本轮、来自异常终止运行，入口在正常收尾时清全部根）在 OS temp 的情况无新增残留，并**修正了 §13/§14 两处「`healthy-idle`/`disposal` 文件操作 0」的措辞**（该 0 成立在测量窗口而非序列级：两条序列自身各含一次准备轮、序列级为 3/1/7/2/1/1，两侧逐列相同；数字与结论不变）。本轮**产品代码无改动**。明细与日志见该证据 §16。第十次接手方在 `a8c2ff3` 上把 §6/§13–§16 每轮列下的最后一条技术性缺口——并发序列 `draws 30 → 33` 的**渲染级**定位——第一手做完：用一份跑完即删的临时探针（探针与交付态采样器的差异存为 `../evidence/logs/22-takeover-k-frames-probe.diff`）在**同一陈述**下同时采迁移前树（临时 worktree `9738b5f` + 交付态采样器，跑完已删）与交付树，得到两侧**同一组 7 种帧内容**、唯一差异是其中一种（3 行 `Total … Cost: ¥0.09 / Round … Cost: ¥0.03`）被重绘的次数 `7 → 10`——即 +3 全部是**同一个帧内容多画 3 次、不带任何新内容**（与 §13/§14 的 A/B「每个子代理 Round 结束一次 `announce()`」一致：该序列正好 3 个子代理 Round 结束；两侧交付的事件与 kinds 逐项相同），重复采样两次结果相同；未覆盖项因此收窄到只剩**通知→帧的配对**。同轮第一手重跑本票公开入口、所属分区与共同消费者（`bun run typecheck`；S1 一次新跑即被对照入口判为 `none`；冻结对照重生成报告与已提交件 **sha256 相同**（`a486f327…`）；真实宿主 3 例 / 21 expect()；`tests/harness-dock` **104 pass / 0 fail**、1161 expect()；`tests/framework` **481 pass / 0 fail**；`tests/model-cost` **463 pass / 0 fail**）并做集成尖端只读核对（`pi-adapter` 仍 `190e1b5`、`origin/pi-adapter` 是它的祖先；**`efb03e0` 与尖端之间连一个 TypeScript 产品文件都不差**，产品路径下只差 `framework/docs/harness-support.md`；`--after-rev pi-adapter` 产品面 `19287 → 23773 (+4486)`；`git merge-tree` 无冲突）。本轮**产品代码无改动**；清理临时 worktree 时出过一次 junction 误删缓存的事故（PowerShell 跟随 junction 删除目标内容），已从同源 sibling worktree 逐字节恢复并复验（真实宿主 `efficiency-effects` 3 pass、两个补丁前缀用例 12 pass），仅未跟踪的 `.cache/22` scratch 无法恢复——详见该证据 §17（含 17.3 的成因与正确做法）。明细与日志见该证据 §17。

## Acceptance criteria

- [x] Agent 对照 01 的工件与序列采集读取/锁/发布/请求/事件成本及复杂度变化；相同条件可比，不预设百分比或伪造缺失基线。
- [x] 确认 OMP 同进程无新增 IPC/逐事件读盘、健康空闲无新增固定轮询、子侧无重复根 UI/查询；用外部效果计数拥有 P57 的禁止重复工作项。
- [x] 先完成全部可执行自动检查与材料准备，列出可归属差异、原因及未覆盖项；不能用绿色测试代替复杂度判断。
- [ ] 人类验收：用户最终确认效率/复杂度是否可接受；未确认保持未验收。P57 本票自动检查完成不依赖该人工判断，不能因等待确认暂停其他可执行工作。
- [ ] **P51 完整 Coverage（S1、S2、S3）**：Agent 用固定代表性序列采集前后读取/锁/发布/请求/事件成本、同进程无 IPC/逐事件读盘、健康空闲无新增固定轮询及子侧无重复根效果；准备可归属的对照和复杂度变化说明。**人类验收：最终判断明显额外开销与复杂度是否可接受**，不预设百分比，不以绿色测试替代判断。

（勾选口径：仅 Agent 可执行与材料准备部分已勾选；含人类确认的项保持未勾选，等待用户判断。差异、原因与未覆盖项见证据 §3–§6；同一陈述下的可比性实测（冻结对照两条差异为陈述级）与主子例帧归因见 §15。）

## 执行与证据约束

- 权威来源：[批准契约](../contract.md)、[spec](../spec.md)及其链接的既有决策；票只分割交付，不修改承诺或 seam。发现真实宿主事实推翻路线时带证据返回原权威，不能静默降级、加补丁或换提供方。
- 使用 S1 公共扩展消费、S2 实际加载操作、S3 持久化文档中本票适用的观察面。确定性失败/时间/协议输入可控，但实际加载、身份、原生生命周期、第三方接入及本机跨进程事实必须补真实路径。期望由独立事实、字面量或手算取得，不调用被测计算生成期望。
- 测试归属：本票拥有所列完整承诺的全部 Coverage 和对应测试；P57 只拥有下表明确分配的条目。跨票先提供能力不代表提前完成后续承诺，不复制认领同一测试用例。前票已经覆盖的检查可复用可归属证据，但本票负责人负责核对有效性与补齐缺口。
- 每次真实验证即记录源、版本/工件、OMP 补丁条件、环境、命令、结果和未覆盖项，不能等 25 才追补。相同来源状态未变化才复用旧证据；mock、研究实测、RPC 和真实 TUI/provider 事实严格区分。
- 本票新增资源必须随功能实现订阅/登记/通信/恢复/等待的释放及失效保护，不能留给后续装配票。共同公共路径变更同步迁移受影响消费者、说明和旧生产路径；不保留兼容别名、重复算法或接线 shim。
- 验证按仓库 testing 约定：迭代用受影响检查，票完成用所属分区及共同契约消费者，TypeScript 变更执行 `bun run typecheck`；另实际运行本票用户行为。昂贵/真实宿主检查串行且运行期间保持来源不变。文档/基线票运行相应链接、例子或采样入口，不机械跑无关全仓测试。
- 完成全部可执行实现、自动及真实宿主检查后才进行最终人类验收；仅 P51/P52/P53 的指定判断由人类确认。凭据、许可、平台或人工确认缺失明确记录，不能标成通过，也不暂停其他可执行工作。不擅自正式安装、切换、清理用户数据或付费调用。

### P57 — coverage partition

P57 跨票交付，下表按 Coverage item 唯一分配交付票与测试负责人；全部七项完成后 P57 才整体完成。各负责票必须实际观察外部效果，不能仅以 widget 数值不变代替。

| Coverage item | Ticket | Test owner |
|---|---|---|
| P4：无子代理 detail 提前返回 | [17：budget 动作与入口展示偏好](17-budget-actions.md) | 17 |
| P17：观察不扩大写权或 Owner 效果权限 | [07：Owner State 实时读取、降级与恢复](07-owner-state.md) | 07 |
| P33：只读刷新不提交在途消费 | [04：共同存储并发提交与只读同步](04-shared-storage.md) | 04 |
| P45：峰谷重绘无请求/记账/写盘 | [19：峰谷边界无副作用重绘](19-season-boundary.md) | 19 |
| P48：共享准备、工厂及根专属效果不重复 | [20：完整装配的共享准备与处置验证](20-assembly-lifecycle.md) | 20 |
| P49：处置后旧资源不再产生效果 | [20：完整装配的共享准备与处置验证](20-assembly-lifecycle.md) | 20 |
| P51：禁止的重复工作和健康空闲轮询不新增 | [22：效率前后对照与复杂度判断](22-efficiency-acceptance.md) | 22 |
