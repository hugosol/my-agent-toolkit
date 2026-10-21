# 02: codebase-tools 历史恢复与跨模式持久化

**What to build:** 用户启动恢复 codebase-tools 会话时，已保存的有效 true/false 优先于配置默认值；无有效历史才使用默认值。自动开启沿用既有 session-entry 写入，正常保存后用手动入口恢复仍开启。运行中修改配置或导航会话不会重新施加入口默认值，既有注入进度和历史消息保持不变。

**Delivers:** P9, P13, P35；P7, P24, P25 的 codebase-tools 分区。

**Test owner for:** P7, P24, P25 的 codebase-tools 分区；P7/P25 的 connect-bot 测试由 05 负责，P24 的 connect-bot 测试由 04 负责。全部分区满足后对应 promise 才完成。

**Blocked by:** 01: codebase-tools 双模式首次启动。

**Status:** in-progress

依据：[已批准契约](../contract.md)、[Spec](../spec.md)。

- [x] 覆盖有效历史 true/false 与配置默认 true/false 的四种组合，核对首轮贡献及历史值没有被默认值错误覆盖；明确区分无记录与历史 false。
- [x] 使用独立进程启动恢复有／无有效历史的会话，分别按历史优先／默认值回退规则观察，不能将启动恢复误判为运行中导航。
- [x] 无历史会话从自动入口无命令开启，沿用原 session-entry 载荷记录 true；正常保存后独立进程通过手动入口恢复，捕获首轮开启贡献。
- [x] 不增加记录格式、事务、重试、全局偏好或崩溃可靠性保证；沿用既有尽力持久化语义。
- [x] 恢复已有贡献的会话，按原注入规则观察后续请求；独立核对旧消息保留、已有进度不重置，不重复注入不应重复的内容。
- [x] 在没有历史干扰的运行中修改启动配置，当前 State 和贡献不被强制改变；下一次独立启动使用无有效历史的隔离场景，确认采用修改后的明确默认值。不得让历史优先掩盖配置是否生效。
- [x] 首次启动后分别执行 new、resume、fork 及保持同 Owner 的导航，结果遵循原会话边界与恢复规则，不重新执行入口默认值。
- [x] 测试经公共 interface 观察贡献、marker 交付、持久化及真实进程恢复，不以私有 State 或计算出的恢复目标代替用户可见效果。
- [x] 为 P9 准备 OMP/pi 可恢复的隔离会话、启动命令、终端截图或录制和自动结果。仅实际终端 marker 显示留给用户确认；其余实现和自动检查须先完成。
- [x] 完成受影响用例、所属分区、受影响消费者及真实恢复场景验证；TypeScript 变更执行类型检查与相关静态检查。记录命令、结果及限制，遵守测试协调规则并更新对应说明。

## Implementation record (2026-10-22)

**Delivered.** Ticket 01's framework mechanism already contains the recovery rule; this ticket adds
the recovery evidence that pins it and the documentation that states it. No production code
changed. The only non-documentation source addition is a test support method,
`ControlledSession.awaitFrame`, which waits for a frame the host published during startup instead of
reading the stream at one instant (needed for the "marker from the session's own start" assertions).

- `tests/codebase-tools/startup-modes.test.ts` (S1) — the four recorded/policy combinations with an
  independent expectation per case, the no-record-versus-recorded-false contrast, non-boolean
  payloads as no history, and the branch's last payload as the history it restores (P9).
- `tests/codebase-tools/startup-policy-change.test.ts` + `tests/codebase-tools/support/startup-policy-child.ts`
  (S1, real child processes) — the selected policy document is edited while the first process runs:
  its value, contribution and payloads are unchanged; a second process serving a session with no
  history starts on the edited off choice. The expected results are the visible effects (a first-run
  init contribution and one `{ enabled: true }` payload), not a comparison between processes (P7).
- `tests/codebase-tools/startup-recovery-dock.test.ts` (S2, real OMP 18.5.0) — a no-history session
  resumed at startup takes the automatic default and records it; a recorded false survives an
  automatic startup; the automatic start's record restores a manual-mode process; restored progress
  continues with the reminder while the journal stays append-only; new/fork/resume/same-owner
  navigation apply no entry default (P9, P13, P24, P25, P35).
- `scripts/pi-codebase-tools-smoke.ts` (S2, real pi 1.2.0) — manual phase 5 (a no-history startup
  resume under the automatic default), and automatic phases for the recorded-false restore and the
  automatic-record-to-manual restore; `markerAreaAtStart` awaits the host's startup widget frame.
- Docs: `extensions/codebase-tools/README.md` (recovery semantics and the H1c P9 human-led
  preparation), `framework/docs/framework-capabilities.md` (startup-resume and cross-mode record
  clarification), `framework/docs/harness-support.md` (pi smoke evidence counts and recovery scope).
- Persistence is unchanged: assertions read the existing `{ enabled: true }` session-entry payload;
  no record format, transaction, retry, global preference or crash-reliability guarantee was added,
  and persistence stays best-effort.

### Verification (commands actually run)

| Command | Result |
|---|---|
| `bun run test:codebase-tools` | 48 pass / 0 fail, 11 files, 91s (final tree) |
| `bun test tests/framework/session-events.test.ts tests/framework/injection.test.ts tests/framework/declared-value-write.test.ts tests/harness-dock/binding-lifecycle.test.ts tests/codebase-tools/startup-recovery-dock.test.ts tests/codebase-tools/startup-modes-dock.test.ts` | 47 pass / 0 fail, 6 files, 29s |
| `bun run typecheck` | tsc clean; authoring 55 files, 3 declarations, 0 diagnostics |
| `PI_NODE=<Node 22.19.0> bun scripts/pi-codebase-tools-smoke.ts --mode manual --pi <isolated pi 1.2.0 bundle>` | pi 1.2.0, 63 checks, none failed, 5 isolated runs |
| `PI_NODE=<Node 22.19.0> bun scripts/pi-codebase-tools-smoke.ts --mode auto --pi <isolated pi 1.2.0 bundle>` | pi 1.2.0, 47 checks, none failed, 3 isolated runs |

Fault injection, restored afterwards (the S1 suite was green again on the restored tree): reversing
history/startup precedence failed the two opposite-default cases, the no-record contrast and the
last-payload case (5 failures); leaving the startup moment unconsumed failed the once-per-process S1
case and the P25 dock case (a new session contributed 1 instead of 0).

### Limits and remaining checks

- **Human-led:** the rendered marker in a real OMP/pi terminal is the only P9 check left. The
  preparation is in `extensions/codebase-tools/README.md` § H1c: a throwaway state/session set, three
  seed-and-resume scenarios for OMP and the equivalent pi commands, what to capture (screenshot or
  recording of the restored area before the first turn), and the automated results to compare
  against. No screenshot/recording was produced from this headless agent session.
- **P35 nuance:** the real hosts write a session file only after a turn, so the seed is a normal
  enabled turn. The manual restore's first run therefore contributes the reminder (the init is
  already branch history); the restoration itself is proven by the startup marker line and the
  unchanged `{ enabled: true }` payload, and the manual command's `codeBaseTools disabled` proves the
  actual State. The automated evidence cannot capture a cross-mode first-run *init* without a harness
  write before the first turn; the promise's "first-run enabled contribution" is the reminder here.
- **P7 seam:** the policy-change case is S1 across two real processes over a real policy file. The
  shipped OMP/pi entrypoints select repository documents a test must not edit, so the real-host half
  of P7 is this process-level evidence, not a dock case.
- **pi runtime:** the smoke reproduced the recorded Node 24.18.0 Windows/libuv `UV_HANDLE_CLOSING`
  exit-9 assertion (unrelated to these changes), so the verified combination is Node 22.19.0. The
  installed pi is 1.3.0, not the recorded expected 1.2.0; an isolated 1.2.0 bundle was installed
  under `.cache/pi-1.2.0` (gitignored) for the run.

## 跨票覆盖分区

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P7 | codebase-tools：当前运行不强制变化，下次无有效历史启动采用新配置 | 02 | 02 |
| P7 | connect-bot：当前运行不强制变化，下次独立启动采用新配置 | 05 | 05 |
| P24 | codebase-tools：独立进程启动恢复，有／无有效历史 | 02 | 02 |
| P24 | connect-bot：独立进程启动恢复，旧载荷不能替代新登记 | 04 | 04 |
| P25 | codebase-tools：后续 new/resume/fork 与同 Owner 导航 | 02 | 02 |
| P25 | connect-bot：后续 new/resume/fork 与同 Owner 导航 | 05 | 05 |
