# 01: 主会话 Session span 的采集、保存与展示

**What to build:** 用户在 Total 中看到本 Session、本 Accounting period 的首条新用户输入到最近已观察到的 round_end 的物理跨度，包含空闲及同周期恢复间隔。可靠输入事实、既有消费提交、重新加载和实际 widget 输出构成完整路径；无可靠读数时保持不可用，不影响有效消费。

**Delivers:** P1, P2, P3, P4, P5, P6, P7, P8；P14, P15, P16, P19, P22, P24, P36 的下列覆盖项。

**Test owner for:** P14, P15, P16, P19, P22, P24, P36 的本票覆盖项；其余覆盖项由对应票负责，全部覆盖项完成才完成整个 Promise。

**Blocked by:** None (can start immediately).

**Status:** in-progress — implemented and tested on this ticket's branch (主会话 Session span 的采集、保存与展示，以及 resume 起点修复)；集成分支最新 tip `d68b469` 已是本分支祖先（merge 为 no-op，无冲突），检查已在合并后的树上重跑；等待合入集成分支并由主 agent 验收。证据见 `## Comments`。

Source: [approved contract](../contract.md) · [spec](../spec.md)

## Acceptance criteria

- [ ] P1/P2：创建 09:50、输入 10:00、请求 10:00:05 时，起点为 10:00；只有宿主认定为用户发起的 skill 输入时也采用其真实输入时间。使用受控事实和支持范围内真实 omp 输入证据，不只检查普通 role=user。
- [ ] P3：源会话 10:00 输入、11:00 fork，新 Session 在 11:10 新输入前时间不可用，起点取 11:10，不继承复制历史。
- [ ] P4/P6：10:00 输入、10:05 首轮结束得到 300,000 ms；第二轮执行中推进时钟仍保持该读数，11:03 round_end 后得到 3,780,000 ms，包含中间空闲。
- [ ] P5/P16：首轮未结束、fork 无新输入、旧历史缺终点均显示“—”；不实时增长、不取最后 transcript 时间补造终点。可靠的 0 ms 与缺失可区别。
- [ ] P7/P19：成功提交起止事实后，新 runtime／进程从同一文档恢复；resume 保留起点，后续终点包含程序关闭间隔，不重新起算。
- [ ] P8/P14：取消、失败或退出未交付 round_end 时不补造终点，已交付时正常刷新。时间仅随既有消费 JSON 提交保存，不因时间变化、等待或关闭新增写入或文件。
- [ ] P15：缺失或无效主会话时间事实输出明确错误，保留最后有效已保存时间或不可用状态；以独立给定消费值证明请求、统计、既有提交和其他字段继续。正常尚无终点仍不可用，不伪装为有效时长。
- [ ] P22：缺新增主时间字段的旧有效文档仍恢复 tokens、cost、parent 并继续正常提交，不清空消费或暂停有效统计。
- [ ] P24：增加主跨度不改变 Cache、费用、参考费用、上下文和既有消费算法，使用独立期望值验证，不从实现反算。
- [ ] P36：以实际文件协调提交失败证明沿用原有报告、拒绝及未保存数据处理规则；消费本体损坏／不可用时不以时间非阻塞为由覆盖文档。消费本体有效、仅主时间无效时与上述整体失败区别处理。
- [ ] 完成所属自动化检查、受影响公共接口消费者检查、TypeScript typecheck 和主会话实际宿主／widget smoke；记录实际输入、输出、存储结果及验证范围，不把受控 adapter 当作真实宿主证据。

## Coverage partition owned here

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P14 | 主时间随既有消费提交；时间变化、等待、关闭不新增写入 | 01 | 01 |
| P15 | 主时间缺失／无效报错，消费与其他展示继续 | 01 | 01 |
| P16 | 主时间缺源与历史缺终点保持未知；可靠零值区别于缺失 | 01 | 01 |
| P19 | 新 runtime／进程恢复成功保存的主会话起止事实 | 01 | 01 |
| P22 | 旧文档缺主时间，保留有效消费并继续提交 | 01 | 01 |
| P24 | 增加主跨度不改变消费计算与保留字段 | 01 | 01 |
| P36 | 真实整体消费提交失败，沿用既有报告与未保存数据处理 | 01 | 01 |
| P36 | 消费本体损坏／不可用时拒绝，不覆盖文档 | 01 | 01 |
| P36 | 消费有效、仅主时间无效时不误判消费损坏 | 01 | 01 |

## Boundaries

复用 S1 宿主事实、S2 widget 和 S3 消费 JSON seams：原生映射在 framework adapter，业务和持久化在 model-cost shared logic，绘制在宿主前端。不透传完整宿主对象、不猜私有字段、不改 omp 或新增补丁、不新增命令或存储根配置、不建立 Round／Turn 明细。公共事实和可选文档字段的演进须与 02/03 协调，不能以共享文件制造额外业务阻塞。周期重置由 04 交付，主／子指标不混加的组合验证由 07 负责。

## Comments

- 集成分支最新 tip `wayfinder/subagent-enhance` = `d68b469`，已是本票分支 HEAD（`d8ab7dc`）的祖先；`git merge wayfinder/subagent-enhance` 报 `Already up to date`，无冲突可解。集成分支工作区未被操作。
- 上一轮把 `P2` 的 skill 一侧只留作“受控用例 + 按锚定修订读宿主源码”的证据。本轮补上真实宿主证据：`tests/harness-dock/model-cost-session-span.test.ts` 新增第 3 例（`a user-invoked skill's submission is the start, at the instant the user submitted it`）——该 run 在自己的隔离 agent state 里写入 `skills/dock-span-skill/SKILL.md`（真实 omp 的 user-level skill 扫描位置，`PI_CODING_AGENT_DIR` 下，会话启动前写好），用户以 `/skill:dock-span-skill …` 提交，然后断言：①宿主发给 provider 的真实请求体里带着该 skill 自身的 body 标记（证明这是一次真的被宿主解析并执行的用户发起 skill，而不是斜杠形状的普通 prompt）；②stderr 无 “publishes no submission event”、无“主会话时间采集失败”；③存盘记录 `span.start` ∈ [提交时刻−500 ms, 提交 settle]，且 ≥ 会话启动时刻、`end ≥ start`、`saveVersion = 1`；④真实 `setWidget` 的 Total 行以同一区间结尾。
- 该新增例的判别力用故障注入确认过：把 fixture 的 frontmatter `name` 改成不匹配的值（skill 无法解析 → 宿主按普通文本发送），同一份测试在该断言处失败（`request.raw.includes(SKILL_BODY)` 为 false），恢复后重跑为绿。故 ①不是构造性成立的断言，而是真的在观察宿主的 skill 解析。
- 本票工作树的验证（工作树只有本票改动，`git status` 仅 `tests/harness-dock/model-cost-session-span.test.ts`）：`bun run typecheck` → exit 0；`bun test tests/model-cost` → 298 pass / 0 fail（24 files，1303 expect）；`bun test tests/framework` → 357 pass / 0 fail（30 files，1771 expect）；`bun test tests/harness-dock/model-cost-session-span.test.ts tests/harness-dock/model-cost-persistence.test.ts` → 7 pass / 0 fail（本票 3 例真实宿主 + 4 例受影响消费者）。
- `tests/harness-dock` 全分区：本机 `core.autocrlf=true` 会把 `host-patches/**/patch.diff` 与 `bun.lock` 检出成 CRLF，而录制的 sha256 与 `patchTouchedFiles` 针对的是已提交的 LF blob，因此未归一前 `model-cost-persistence.test.ts` 等文件在 fixture 装载期即失败（`…/patch.diff touches no file`），与票据行为无关。把这两份 `patch.diff` 与 `bun.lock` 逐行去 CR（结果 sha256 与 `git show HEAD:<path>` 完全一致）后重跑全分区：**84 pass / 0 fail，23 files，973 expect，174.9 s**（含 `baseline.test.ts`、`session-driver.test.ts`，即此前记录的 2 例环境失败同源）。运行结束后已按字节恢复这三个文件的原始 CRLF 检出状态（sha256 与归一前一致），未提交、未改动任何被录制的仓库内容。
- 未验证／限制：`P2` 的 interactive 一侧仍无真实宿主运行（dock 只驱动 RPC）；其受控覆盖见 `tests/framework/user-input.test.ts`（任意 source 的提交映射为一个 input 事实、`extension` 自提交不是用户输入、宿主不发布该事件时的明确诊断）。`P25`（Round 行不新增时间列）由 05/07 负责，本票只以合并后 widget/Round 期望全绿作旁证。票据 Status 中的 `closed` 定义包含 merged，本票分支尚未合入集成分支，故仍为 `in-progress`。
