# 07: codebase-tools 子代理 follow 与真实 pi 子进程

**What to build:** 用户通过任一模式加载 codebase-tools 后，子代理继续 follow Owner 的当前 State，而非独立执行主会话启动策略。Owner 在启动后的改变仍能传递；未接通时既有默认读数不变。pi 的显式 childEntry 与入口装配保持一致，真实跨进程跟随能力不退化。

**Delivers:** P14。

**Blocked by:** 01: codebase-tools 双模式首次启动。

**Status:** in-progress

依据：[已批准契约](../contract.md)、[Spec](../spec.md)。不依赖 connect-bot 或 codebase-tools 跨模式持久化票。

- [x] 在支持的子代理接入范围内，两种入口模式均保持 follow Owner 语义，不增加子代理独立启动默认值或记忆策略。
- [x] 通过公共装配 interface 受控改变 Owner 当前值，观察子代理实际贡献／marker 交付随之变化；覆盖开启与关闭方向，不仅核对首次读数。
- [x] 未接通 Owner 接入时，维持既有默认读数，不把未知接入改成独立自动开启。
- [x] 在真实 pi 子进程运行中证明跟随效果，显式 childEntry 与所选模式装配一致；childEntry 字符串相等、入口导入成功或模拟进程都不能代替运行证据。
- [x] 保留既有子代理接入与必需等待语义，不为自动启动修改准入或新增生产调试接口；不扩大 harness/provider 支持范围。
- [x] 使用隔离 Owner、子进程与临时状态，不操作用户会话；记录启动命令、实际贡献、进程结果及环境限制。真实依赖不可用时报告具体阻塞，不将未运行项标为通过。
- [x] 完成受影响 follow／接入用例、所属分区和受影响消费者检查；TypeScript 变更执行类型检查与相关静态检查，并更新必要 childEntry／使用说明。遵守共享工作树运行协调规则。

## Evidence (2026-10-22)

**Delivered.** No production change was required: the startup rule ticket 01 delivered already applies
a mode's choice only at the process's first *owner* start, so a subagent delivery owns no cell, applies
no choice and writes nothing. This ticket adds the coverage that pins that behavior for this extension
and proves the cross-process effect on the real host:

- `tests/codebase-tools/startup-modes-follow.test.ts` (S1, new): both modes through the public assembly
  interface — the automatic choice enables only the owner; a subagent's runs follow the owner's live
  value off→on→off in both modes, with contribution, marker-area rendering and persistence observed;
  a subagent's own start applies/consumes no startup choice and records nothing; an owner whose seat is
  unreachable reads the declared default (`false`) in both modes and is never independently enabled.
- `scripts/pi-codebase-tools-smoke.ts` (S2, extended): a follow phase drives the pinned provider in both
  modes. It delegates once under each owner value across a real command change, then reads each spawned
  child's own outbound request, its session journal and the provider's launch record. `--follow-only`
  runs that phase alone; the provider's temporary root is redirected under the run root.
- `extensions/codebase-tools/README.md`: the childEntry/usage text now states the spawned-session
  contract, the follow phase and `--follow-only`, the Node-22.19.0 requirement, and points at the S1 suite.

**Criterion → evidence**

1. Both modes keep follow semantics, no independent subagent default/memory — S1 suite (5 pass); real
   pi follow phase in both modes; the child journals record no State (`codebase-tools:state` empty).
2. Controlled Owner change through the public assembly interface, both directions — S1 suite drives the
   owner's own toggle command and asserts contributions/marker renderings before and after (init →
   none → reminder), not just the first read. Fault injection: replacing the followed read with the
   declared default failed 2 cases; applying the owner gate to inherited deliveries failed 4 cases.
   Both mutations were restored, and the implementation diff is empty.
3. Unreachable Owner keeps the existing default read — S1 suite: an `open` that rejects answers `false`
   in both modes, the marker area is published with no line, and nothing is recorded or enabled.
4. Real pi child process, explicit childEntry matching the mode — `--mode manual` and `--mode auto`
   runs below: each spawned session's `recovery-descriptor.json` required `codebase-tools` with the
   real path of that mode's entrypoint (`entrypoints/pi/codebase-tools.ts` / `entrypoints/pi-auto/
   codebase-tools.ts`); its own request and journal carried the contribution only while the owner was
   enabled; its detached runner reported `state: "complete"`, a positive pid and exit 0. The childEntry
   path check supplements the running evidence; it does not replace it.
5. Existing subagent access and required waiting semantics preserved — no production source changed;
   the framework's follow/readiness/access suites pass (below).
6. Isolated runs and recorded limits — see Environment and limits.
7. Affected cases, owning partition, consumers, type and static checks — see Verification.

**Verification actually run**

| Command | Result |
| --- | --- |
| `bun test tests/codebase-tools/startup-modes-follow.test.ts` | 5 pass / 0 fail, 48 expect() calls |
| `bun test tests/codebase-tools` (owning partition, includes the real OMP dock suites) | **40 pass / 0 fail**, 10 files, 495 expect() calls, 95.88s |
| `bun test tests/framework/owner-follow.test.ts owner-follow-processes.test.ts follow-observation-independence.test.ts followed-owner-readiness.test.ts pi-subagent-integration.test.ts pi-child-extensions.test.ts pi-subagent-provider-path.test.ts local-access.test.ts local-access-observation.test.ts` (affected consumers) | **92 pass / 0 fail**, 9 files, 471 expect() calls, 6.83s |
| `bun run typecheck` | tsc clean; authoring check 55 files / 3 declarations / 0 diagnostics |
| `bun run check:integrations` | exit 0; `codebase-tools / omp: COMPLETE`, `codebase-tools / pi: COMPLETE` |
| `PI_NODE=<nvm v22.19.0>/node.exe bun scripts/pi-codebase-tools-smoke.ts --mode manual` | **67 checks passed, none failed**, 5 isolated runs; includes the follow phase (manual off → on) |
| `PI_NODE=<nvm v22.19.0>/node.exe bun scripts/pi-codebase-tools-smoke.ts --mode auto` | **46 checks passed, none failed**, 3 isolated runs; includes the follow phase (auto on → off) |
| `... --mode manual --follow-only` / `--mode auto --follow-only` | **15 / 15 checks passed** each |
| `git show HEAD:scripts/pi-codebase-tools-smoke.ts > <temp copy>; bun <temp copy> --mode manual` | fails at the pre-existing first-phase exit with the recorded Windows/libuv assertion (exit 9) — confirms that failure is not from this ticket |

**Environment and limits**

- Real host: installed `@earendil-works/pi-coding-agent@1.3.0` Node bundle via the `pi` shim, run by
  Node 22.19.0 (`D:\Users\hugos\AppData\Local\nvm\v22.19.0\node.exe`) and Bun 1.4.2 on Windows
  x64 (10.0.26200). The smoke notes that its expectations were written for pi 1.2.0.
- Provider: the smoke loads this repository's pinned `pi-subagents@0.78.0` extension; this machine's
  `framework/config.yaml` points the adapter's provider *integration* at a separate `pi-subagents@0.80.0`
  installation. The shared required-child-extension registry carried the requirement and the launched
  children loaded the mode entry; this environment mismatch is recorded, and no support claim is derived
  from it. Run roots, agent state, sessions, captures and the provider temporary root are all under the
  isolated run root; no formal configuration, user session or real panel was touched.
- Node 24.18.0 limitation: the full manual smoke fails at the first phase's EOF close with the
  `UV_HANDLE_CLOSING` assertion recorded in the framework's pi support evidence; it is a host/runtime
  limitation, reproducible on `HEAD`, and belongs to the longer session, not to this ticket's phase.
  The full runs above use Node 22.19.0 as the support record requires.
- Not driven: an auto-mode delegation through OMP's in-process built-in subagent at the real OMP harness.
  The real OMP partition includes the unchanged manual built-in delegation, the auto-mode real-host
  startup, and both modes' follow semantics at the assembly seam; no production code changed. The
  marker's rendered appearance remains human-led (unchanged by this ticket).

