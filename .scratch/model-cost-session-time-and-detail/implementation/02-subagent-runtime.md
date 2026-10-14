# 02: 子代理原生运行耗时的累计与落盘

**What to build:** detail 中每个 descendant Session 的一条逻辑记录显示其本消费周期的原生执行累计耗时；可用值随同一次既有消费提交保存为数值毫秒，恢复后继续累计。进度、重复通知和并发观察不重复计入，晚到值不触发补写或等待消费。

**Delivers:** P10, P11, P12, P13, P17, P18, P35；P14, P15, P16, P19, P22, P24, P36 的下列覆盖项。

**Test owner for:** P14, P15, P16, P19, P22, P24, P36 的本票覆盖项；其余覆盖项由对应票负责，全部覆盖项完成才完成整个 Promise。

**Blocked by:** None (can start immediately).

**Status:** in-progress — implemented and tested on this ticket's branch (the host's own per-execution duration accumulated per session, saved as numeric milliseconds with the existing commit, drawn on the detail row as `Run:`, with real-host and real-process evidence). A second agent took the ticket over on 2026-10-14: it re-verified every criterion on the integration-tip-merged branch, closed the open P35 duplicate-observation question with real-host evidence (see `## Verification`), strengthened the reachable-duplicate and closing coverage, and added the framework capability, harness-register and user documentation. The integration tip (`d68b469`) is an ancestor of this branch's HEAD; the local merge into `wayfinder/subagent-enhance` and the human acceptance round remain.

Source: [approved contract](../contract.md) · [spec](../spec.md)

## Acceptance criteria

- [x] P10：以原生最终 360,000 ms 与不同的 Hub 物理跨度作可区别输入，实际 detail 采用原生耗时；提供支持范围内真实 omp 耗时来源及执行归属证据，不使用自建计时器或物理跨度替代。
- [x] P11/P18：同 Session 两次原生执行 360,000、120,000 ms，均在既有提交前取得；detail 一条逻辑记录累计 480,000 ms，同一消费 JSON 在该实际 Session 下保存数值毫秒 480,000，不是格式化文本。
- [x] P12：同次进度 100,000、200,000 ms 替换读数，最终 210,000 ms 及其重复通知只贡献一次；另次执行 90,000 ms 后累计 300,000 ms。
- [x] P13：原生执行结束但子 Session 的 Round 仍自动继续时，不伪造 round_end 或提前消费结算；保存时间不修改其他 Session 的 own 消费及直接父关系。
- [x] P14：进度、原生结束、等待和关闭不增加时间专属文件或写入；仅在既有消费提交带上可用时间，观察实际文件操作及正常消费保存路径。
- [x] P17：消费先提交、最终耗时后到时，不延迟消费或补写；无后续既有提交时磁盘保持原值，有后续既有提交时可保存可靠晚到值，不声称内存值已落盘。
- [x] P15/P16：缺原生来源或无效耗时明确报错，保留最后有效已保存值或“—”；可靠 0 ms 可与缺失区别。以预定消费值证明请求、消费统计、既有提交及其他展示不受阻，不用另一种时长兜底。
- [x] P19：新 runtime／进程恢复已保存的 480,000 ms 并可继续累计；仅内存晚到值不视为已恢复。
- [x] P22：旧有效文档缺子耗时时仍保留 tokens、cost、parent 并正常继续提交，耗时保持未知，不误判消费损坏。
- [x] P24：新增耗时不改变原有直接／含后代累计、费用、Cache 或上下文数值，使用独立期望值验证，不将金额与时长互换。
- [x] P35：实际多进程／文件协调场景下，独立 Session 成功提交不互相覆盖；同次执行被重复观察也不重复累计。最终时间与 own 消费符合独立给定值，不用纯内存锁或最后写入者覆盖冒充正确合并。
- [x] P36：消费本体有效、仅子耗时无效时仍可提交有效消费，不能扩大为整体文档损坏；沿用既有整体提交失败规则，不吞错。
- [x] 完成所属自动化分区、受影响消费者、TypeScript typecheck、真实文件／进程场景和实际宿主／detail smoke；保留证据并说明范围，不能将真实并发验证延期至 07。

## Coverage partition owned here

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P14 | 子进度、原生结束、等待不新增写入；既有提交保存可用值 | 02 | 02 |
| P15 | 原生耗时来源缺失／无效报错，消费与其他展示继续 | 02 | 02 |
| P16 | 子耗时缺源为“—”，可靠 0 ms 不当作缺失 | 02 | 02 |
| P19 | 恢复子累计；仅内存晚到值不宣称已恢复 | 02 | 02 |
| P22 | 旧文档缺子耗时，保留消费且耗时未知 | 02 | 02 |
| P24 | 增加子耗时不改变自身／含后代消费累计 | 02 | 02 |
| P36 | 消费有效、仅子耗时无效时不误判消费损坏 | 02 | 02 |

## Boundaries

复用 S1/S2/S3 和现有协调提交；原生事实在 framework adapter 映射，业务累计／保存在 shared logic，绘制在宿主前端。不改 omp、不新增补丁、不透传完整宿主对象、不新增逐执行明细账、实时轮询、额外写入或补存重试。执行区分／去重内部标记不是逐执行业务账本。公共事实和可选文档字段与 01/03 协调；不要求 01 先完成。消费周期重置和迟到旧执行隔离归 04，Total 不混加的 P9 组合测试归 07。

## Verification (2026-10-14, takeover)

The takeover re-ran every check on this branch after `d68b469` (the integration tip at the time) was merged in; the worktree's sources are unchanged by the verification itself.

| command | result |
|---|---|
| `bun run typecheck` | 0 errors. The check is real: a temporary `const probe: number = "not a number"` in `scripts/` made it exit 1 with `TS2322` and the file was removed again |
| `bun test tests/model-cost` | 298 pass / 0 fail, 24 files (15 in `subagent-runtime.test.ts`, including this round's two additions) |
| `bun test tests/framework` | 360 pass / 0 fail, 30 files |
| `bun test tests/harness-dock` | 82 pass / 0 fail, 22 files, 178 s — the whole dock partition, including real delegating runs and this round's reload case. Two lockfile assertions (`baseline record` and `controlled session`) fail in this worktree's CRLF checkout because they hash the file's bytes against the recorded LF hash; before the run `for f in host-patches/*/patch.diff bun.lock; do tr -d '\r' < "$f" > "$f.lf"; mv "$f.lf" "$f"; done` (the worktree was restored to its checked-out CRLF form afterwards). That is a line-ending change only — `git diff` is empty for those files either way and nothing about it is committed. What makes the run reproducible instead of luck is that the artifact's patch hash then matches the frozen record |
| `bun test tests/model-cost/subagent-runtime.test.ts -t "closing the instance"` | with a temporary `writeFileSync(..., "runtime.json")` in the extension's `cleanup`, the closing case fails on the file set (`runtime.json` appears); with the source restored it passes |
| `bun test tests/model-cost/subagent-runtime.test.ts` | with a temporary `if (false && accounted.has(...))` the "observed again after its own commit" case fails (1080000 vs 360000); with the source restored it passes |
| `bun test tests/harness-dock/detail-tree.test.ts -t "resumed process"` | with a temporary `savedRuntime * 2` in `ConsumptionView.runtime`, the reload case fails (drawn 2000 vs saved 754); with the source restored it passes |
| `git merge wayfinder/subagent-enhance` | already an ancestor (`d68b469`); nothing to merge, no conflict |

**P35, the duplicate observation of one execution.** The takeover treated the previous round's admission — an instance seeded from a record would re-add an execution it is told about again — as open, and settled it two ways, both through existing seams and neither by narrowing the promise:

- **The fact → accumulation → save path is proven to count once, across a commit.** `tests/model-cost/subagent-runtime.test.ts` now states one execution's final 360000 before an existing commit, commits it, and then delivers that same execution's completion and a stale running reading of it again: the accumulation stays 360000 and the session's next commit (version 3) writes 360000, never 720000. The mutation above shows the case detects a lost identity.
- **The reachable duplicate is in-process, and the unreachable one is evidenced on the real host.** The harness states an execution's own duration while that execution runs, so only the process running it can be told about it; a repeated notification, a second observer in the same process and a stale frame are all one accumulator's business and are deduplicated. The reload question is answered by a new real-host case, `tests/harness-dock/detail-tree.test.ts` → "a resumed process draws the runtime the document already carries": a first process really delegates, commits the child's runtime (754 ms in that run) and stops; a second, independent process over the same isolated home and run root resumes the session with the host's own `switch_session` and opens the detail form. The child's row states exactly the figure the document carries, never twice it, and the resumed process writes nothing. Inspecting the real host's payloads during this round (a temporary probe, since removed) confirms why: the running frames state each spawn's own `durationMs` (42→770 and 31→444 for the two children of one `task` call) and each child's ended frame states its final one (780, 444) under `results[]`; the transcript is not replayed as live tool events, so a resumed process is told about no execution the file already holds.
- The design deliberately keeps no persisted per-execution identity: the approved contract leaves out a per-execution ledger and a time-specific write, and a persisted identity list would also misfile a harness that ever reused one. The accumulator's module documentation now states the lifetime of its identity memory and why a restart is safe.

**Documentation added by this round.** The framework capability (`framework/docs/framework-capabilities.md`: the axis section, the symbol rows and the `HarnessPort.onSubagentRuntime` row), the harness-qualified evidence (`framework/docs/harness-support.md`: the new `execution.subagent-duration` register entry with the probe's own payload readings), and the user-facing description (`extensions/model-cost/README.md`: the intro line and the H1 acceptance row for P10/P18/P19, with the `Run:` field, the `—` marker, `0ms` and the restart behaviour).

**Still unverified by this round.** The interactive TUI render (the widget is read from the host's real `setWidget` frames — no terminal was observed), and the human acceptance rows themselves. The local merge into `wayfinder/subagent-enhance` and the final integration run are the integration step's; it was not performed here because the integration worktree was not to be touched and no push is allowed.
