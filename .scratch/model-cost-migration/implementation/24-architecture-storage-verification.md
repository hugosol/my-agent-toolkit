# 24: 生产架构清理与完整持久化验证

**What to build:** 完整生产路径统一采用批准职责和持久数据模型；独立读回证明无旧双轨、额外账本或重复权威累计。

**Delivers:** P68, P52

**Blocked by:** 20: 完整 TUI 与单一峰谷边界 timer；21: 无 UI 同后端与干净 RPC 反馈；22: connect-bot 统一接线与协议保留；23: codebase-tools 统一接线与历史保护

**Status:** in-progress

## Acceptance criteria

- [ ] 本票是 P52 完整验证 owner；06/14/19 贡献活动消费、estimate 和归档生产路径，在全部已实现路径上写完整合同测试，不重复认领各贡献票业务用例。
- [ ] 通过生产写出、独立 schema 检查及重启恢复核对根/Session/自身四 token 桶/币种/版本、父未先保存、唯一归档拒覆盖与独立 estimate 保护。
- [ ] 拒绝新增 Turn/Round 账本、recentRound、历史价格、费用分项、账号键或重复权威 total；consumer-visible 读回保证正确，不用只扫描源码文本代替文档语义。
- [ ] 公共调用方复用同一工厂/语义/HTTP/文件路径，framework 不依赖扩展，shared logic 不导入 native，HTTP/文件不依赖 adapter，前端不做业务调度。
- [ ] 清理剩余旧生产装配/派发/传输类型和兼容双轨，不新建 DI/扫描/注册/配置体系或通用业务 State；清理不能把之前票留成不可运行半成品。
- [ ] 执行既有 native import 责任检查和真实公共消费者集成行为，证明现有两消费者仍可用；P58 tests owner 仍为 22/23。
- [ ] P52 检查通过只证明持久合同，P68 检查通过只证明本次责任/统一路径，不替代真实 provider/视觉人工确认或自动扩大支持声明。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。

## P52 — verification ownership

本票统一拥有 P52 完整承诺测试，06/14/19 不提前认领 P52 完成。

| Coverage item | Contributing ticket | Test owner |
|---|---|---|
| 活动文档 schema、Session 自身四桶/币种/版本及父未先保存 | 06 | 24 |
| 独立 estimate 文档及其重启恢复 | 14 | 24 |
| 唯一归档拒覆盖、reset 保护 estimate | 19 | 24 |
| 组合恢复、无账本/重复权威总数 | 06、14、19 | 24 |

贡献票仍写自身业务测试；本票负责跨生产文档的合同检查，不重复认领那些业务用例。

## Comments

实现与自动检查已完成，待人工/复核与集成（提交）。证据全文见
[`assets/24-architecture-storage-verification-evidence-2026-10-13.md`](../assets/24-architecture-storage-verification-evidence-2026-10-13.md)。

- **组合 artifact（01 的 viewed-session patch ＋ 13 的 codex-response-boundary patch，同一安装）**：
  [`host-patches/omp-18.5.0-viewed-session-codex-response/`](../../../host-patches/omp-18.5.0-viewed-session-codex-response)
  （`record.json` 由共享物化器实测写出：两条 patch sha256、9 个文件的 pre/post sha256、两条可复现 apply 命令；
  链上每一步 `toEqual` 各自单 patch record 的条目，即组合没有重钉任何一份已冻结记录）。物化器
  [`tests/harness-dock/host-patch-artifact.ts`](../../../tests/harness-dock/host-patch-artifact.ts) 由「单 patch」推广为「patch 链」，
  两个单 patch artifact 的 record／suite 一并迁移，哈希一字未改。
- **P52 跨文档合同（本票 owner）**：[`tests/harness-dock/model-cost-persistence.test.ts`](../../../tests/harness-dock/model-cost-persistence.test.ts)
  在组合 host 的真实 loader／RPC 上，用**独立**于实现的校验器逐层精确键集读回：活动文档（根／Session／自身四桶＝端点脚本 usage 的独立字面／
  `costCny` 币种／`saveVersion`）、独立 estimate（批准形状；baseline 即刻落盘，重启后新实例第一个合格配对立即写出 ratio 6）、
  一次 close 归档**整份**文件（跨 provider）并开新周期、estimate 字节不变、两次 close 两个不同名且第一份字节不变、
  子会话记录在父之前落盘且已写 `parent`。拒绝新增账本／重复权威 total 由精确键集与存储根文件集合守护，
  并用一次临时 `total: 21` 故障注入证明其**真会失败**（随后还原）。
- **anchor 漂移与竞态**：`verifyArtifactByteIdentity` 改为比对**记录 revision 自身的 blob 字节**并校验 tag 与 commit 同指
  （不再要求 sibling checkout HEAD 等于 anchor，也不伪造哈希／不提高版本）；`baseline.test.ts` 相应改写。
  balance 存储根遍历容忍原子发布中 rename 走的临时文档。
- **P68 结构检查**：framework 导入扩展 0 处、shared-logic 导入 adapter／harness 0 处、HTTP／文件模块导入 adapter 0 处、
  旧传输／blanket 名 0 命中、model-cost 前端不直接碰存储／文件；`import-boundary.test.ts` 增加反方向断言（framework 不得导入扩展）。
- **实际结果**：`bun run typecheck` 0 errors；`tests/model-cost` 266 pass、`tests/framework` 386 pass、`tests/harness-dock` 79 pass、
  `tests/connect-bot` 144 pass（22 分区）、`tests/codebase-tools` 24 pass（23 分区）；全仓 `bun test` **899 pass / 0 fail**（102 files，5072 expect），
  连跑两次结果一致、无 ENOENT 复发。
- **未认领／未验证**：H1／H2 仍归原 Coverage 票；P58 整体仍归 22／23（本票只运行其分区），也不为 P58 增加无条件人工门禁；
  归档名冲突分支（`wx` 拒绝）在随机名下属防御性代码，本会话未能无副作用地强制该分支（模块 mock 会污染其他 suite，已删除并不作通过），
  其守护的「较早归档不被覆盖」由 19 的 S2 用例与本票真实宿主用例覆盖；07 evidence 里「真实 RPC 不派发 `round_end`」的旧限度已由 08 实现取代
  （本票用例在真实 RPC 会话里等到两次 prompt 各自落盘），本票不改 07 的材料，只在自己的材料里标注其过时。
- **支持声明**：组合 artifact 为本地 artifact，未并入上游 checkout，支持版本仍为 18.5.0。
