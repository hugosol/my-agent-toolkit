# 04: connect-bot 登记失败、恢复与准入约束

**What to build:** 自动登记失败后，用户仍可继续 agent 工作和原有手动操作，实际 State 不错误开启。启动恢复旧会话不能把旧开启载荷当作本次已连接；自动模式与命令模式遵循相同的既有准入条件，不为子代理或无 UI 场景绕过限制。

**Delivers:** P19, P22, P23；P24 的 connect-bot 分区。

**Test owner for:** P24 的 connect-bot 分区；codebase-tools 分区由 02 编写测试，全部分区满足后 P24 才完成。

**Blocked by:** 03: connect-bot 非阻塞自动登记成功路径。

**Status:** in-progress

依据：[已批准契约](../contract.md)、[Spec](../spec.md)。

- [x] 用受控登记失败场景核对原有关闭和反馈规则；失败后无错误开启、无 heartbeat，仍可完成真实模型请求及原有手动操作。
- [x] 不新增自动重试、失败恢复编排或放宽业务成功判定，也不通过抑制原有反馈让检查通过。
- [x] 独立进程启动恢复带旧开启载荷的首次会话，仅新的有效登记 receipt 可以开启；保持 memory，不新增连接记忆或启用偏好写入。
- [x] 覆盖无有效旧开启载荷的启动恢复对照，确认进程启动恢复仍参与首次启动策略，而非被当作运行中导航跳过。
- [x] 分别驱动子代理、无 UI 及其他既有登记拒绝条件，维持原有反馈或静默规则，无登记请求及无启用效果；不改变 none 继承策略或放开准入。
- [x] 经 S1 公共装配 interface 控制错误与准入，使用 S2 真实 OMP 和隔离进程观察请求、恢复及反馈效果，不以私有 State 或模拟客户端调用代替要求的真实观察。
- [x] 为 P19 准备失败场景、隔离启动命令、终端截图或录制与自动结果；仅 OMP 实际终端的失败反馈及关闭显示留给用户确认，其他可执行检查先完成。
- [x] 完成受影响用例、所属分区、受影响消费者与真实宿主验证；TypeScript 变更执行类型检查及相关静态检查。记录命令、结果及验证限制，遵守测试协调规则并更新对应说明。

## Verification (2026-10-22)

**Behavior delivered.** The automatic startup activation is the same activation `/connect-bot`
runs, behind the same gate. A register that does not produce a valid receipt — a non-2xx refusal, a
2xx answer that is not `{outcome:"registered", onlineCount:N}`, a missing count, or a request that
never completes — leaves the declared value off: no marker line, no state report, no heartbeat,
exactly one attempt, and the extension's existing error text. `/connect-bot` afterwards connects
normally and `/connect-bot off` disconnects normally. A session restored as the process starts is
still the process's first owner start: manual mode stays off, automatic mode attempts its register,
a planted old `{enabled:true}` branch payload is ignored in both modes, only a new valid receipt
enables, and the startup path writes no `connect-bot:state` record (memory persistence is intact).
Subagent, no-UI and the unregister-in-flight refusals are unchanged. One binding diagnostic was
repaired: a harness surface with no lifecycle subscription now reaches the framework's
registration-failure report instead of throwing out of the assembly before the label/diagnostic
(this was failing `tests/framework/startup-requirements.test.ts` in the base).

**Owned criteria → evidence.**

| Criterion | Evidence |
| --- | --- |
| Controlled failure, existing close/feedback, no wrong enable or heartbeat, requests and manual operations still work | S1 `tests/connect-bot/startup-modes.test.ts` → *a failed startup registration keeps the existing close and feedback rules (P19)* (4 failure shapes); S2 `tests/harness-dock/connect-bot-startup.test.ts` → *a refused automatic registration keeps the real session working and off (P19)* |
| No retry/recovery orchestration, no loosened success test, no suppressed feedback | The S1 failure cases assert one register attempt, empty managed-timer list, exact `无法连接 herdr-bot，未启用；请确认面板已启动` at `error`, and a 2xx non-receipt as a failure; S2 asserts one register after the later turn/command operations |
| Old enabled payload on a restored first session; memory, no preference writes | S2 → *a restored session's old enabled payload is not a connection (P22, P24)*: planted `{enabled:true}`, manual resume off, automatic resume registers but stays off on refusal, `/connect-bot` then enables; `connect-bot:state` payload count stays exactly the planted one |
| No-payload restore control still takes the first-start policy | S2 → *a session with no recorded value resumed at startup takes its mode's choice (P24)*: automatic resume registers and enables on the receipt; the register's session id is the restored file's header id; no State record |
| Subagent, no-UI and other existing refusals unchanged | S1 → *startup and command admission keep the existing refusal rules (P23)*: no-UI start+command → two stderr lines, no request/widget/timer; subagent start+command → silence, no request/widget/timer; unregister-in-flight activation → `正在断开 herdr-bot 面板，请稍后重试`, no second register |
| S1/S2 seams | S1 drives the OMP surface double through the real entrypoints; S2 loads the real entrypoint files into the isolated OMP 18.5.0 harness, reads the marker `setWidget`/`notify` frames, the panel double's requests, the session JSONL, and independent-process `--resume` |

**Commands actually run (source state: this branch, 2026-10-22).**

| Command | Result |
| --- | --- |
| `bun test tests/connect-bot/startup-modes.test.ts` | 15 pass / 0 fail, 139 assertions |
| `bun test tests/framework/startup-requirements.test.ts` | 7 pass / 0 fail |
| `bun test tests/framework/implementation-startup.test.ts` | 6 pass / 0 fail |
| `bun test tests/connect-bot` (partition, before the assembly diagnostic fix) | 151 pass / 5 fail; all 5 are the recorded external real-panel failures (`herdr-bot` TOML `missing field herdr`), not failures of this change |
| `bun test tests/harness-dock/connect-bot-startup.test.ts` (final, quiet window) | 6 pass / 1 fail; the one failure is the pre-existing real-panel case (same external `herdr-bot` schema drift). First full run: 4 pass / 3 fail — two were a bug in this ticket's new test helper (`sessionIdOf` read the title-slot first line); fixed, then the two cases passed individually and the final full run is 6/1 |
| `bun test tests/harness-dock/connect-bot-startup.test.ts -t "a refused automatic registration"` | 1 pass / 0 fail |
| `bun test tests/harness-dock/connect-bot-startup.test.ts -t "old enabled payload\|no recorded value resumed"` | 2 pass / 0 fail |
| `bun run typecheck` | exit 0 (`tsc --noEmit`; authoring 58 files, 0 diagnostics) |
| `bun run check:integrations` | exit 0 (structural only; native semantics not certified, as the checker states) |
| Fault injection: `readRegisterOutcome` accepting any 2xx | The 2xx-non-receipt case failed; restored → green |
| Fault injection: failure branch writing `enabled=true` | All 4 failure cases failed; restored → green |

**Limitations and human-led items (not verified here).**

- The actual OMP interactive terminal's rendering of the failure line and the absence of the
  `◐ connectBot` marker stays human-led (contract P19). The automated face is the adapter's
  `notify`/`setWidget` frames and the panel requests. Prepared scenario/command:
  stop `herdr-bot` (or point a copy's `extensions/connect-bot/config.yaml` at an unused loopback
  port), then start the isolated TUI with only the automatic entrypoint:
  `PI_CODING_AGENT_DIR="$TEMP/connect-bot-p19" bun .cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts --no-extensions -e "$PWD/entrypoints/omp-auto/connect-bot.ts" --model <model>`
  (isolated state needs a credential per `framework/README.md`; the normal host with
  `-e <repo>/entrypoints/omp-auto/connect-bot.ts` is also acceptable). Expect the error text
  `无法连接 herdr-bot，未启用；请确认面板已启动`, no marker, and a silent `/connect-bot off`.
  Take the screenshot/recording; this remains unverified until the user confirms.
- The isolated real-panel cases in the touched suites cannot run in this environment: the available
  `herdr-bot` release rejects the test TOML with `missing field herdr`. This is external and
  pre-recorded in `framework/docs/harness-support.md`; it is not evidence against this change.
- The `tests/connect-bot` partition run predates the assembly diagnostic fix; the focused S1 and
  framework startup suites were rerun green after it. No other partition test reaches the
  no-lifecycle-subscription surface the fix touches.
- No new real-panel interoperability is claimed; this ticket's S2 evidence uses the scripted
  panel double and the isolated real host.

## 跨票覆盖分区

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P24 | codebase-tools：独立进程启动恢复，有／无有效历史 | 02 | 02 |
| P24 | connect-bot：独立进程启动恢复，旧载荷不能替代新登记 | 04 | 04 |
