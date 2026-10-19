# Ticket 12 — OMP real-entry regression: verification evidence

This record covers ticket 12's own partition only: the three OMP discovery entries and the OMP
half of P47. It does not claim the pi entries (ticket 13), the framework partition (ticket 11), or
the P48 readability judgment (ticket 14, human).

## Source and environment

| Item | Value |
| --- | --- |
| Branch | `hyper/framework-capability-cutover/12-omp-real-entry-regression-9d4725-e1e098c5b064` |
| Base revision | `a3166c51e4dd14240dd4d9e0017d58fba1f3e410` (the merged ticket 11 cutover) |
| Source changes | none outside this evidence directory; the ticket's commit contains only `.scratch/framework-capability-cutover/evidence/12-omp-real-entry-regression/` |
| Dependencies | `bun install --frozen-lockfile`, exit 0, 13 packages; `bun.lock` raw sha256 `e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`; the baseline record's LF-normalized digest `a5d37ab28396324eab85bcf6404c7cfb63c968925b7ae58378f8492bbea820e6` still matches |
| OS | Windows 10.0.26200, x64 |
| Runtimes | Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2 |
| OMP harness | `@oh-my-pi/pi-coding-agent@18.5.0`, isolated exact install; revision anchor `9348320cc4a30a7195d36a1f05a6c11bcb701a17` (`v18.5.0`) |
| OMP patches | Viewed-session patch `host-patches/omp-18.5.0-viewed-session/patch.diff`, sha256 `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b`; Codex response-boundary patch `host-patches/omp-18.5.0-codex-response-boundary/patch.diff`, sha256 `4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d` |
| Isolated prefixes | `.cache/omp-baseline/18.5.0` (unpatched), `.cache/omp-baseline/18.5.0-viewed-session`, `.cache/omp-baseline/18.5.0-viewed-session-codex-response`; all under the gitignored `.cache/` |
| Real panel | `E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`, started by the connect-bot support on an ephemeral loopback port with its own temporary configuration; the user's panel and registrations are untouched |
| Candidate record | `.cache/omp-baseline/18.5.0/candidate-verification.json`; selection source `recorded-baseline`, regression alarm `green`; certification `none` |
| Fixtures | Provider fixture `tests/harness-dock/fixtures/extension-root/provider.ts`; connect-bot config is a run-local `config.yaml` in each deployment copy; model-cost storage root is a run-local user home with a holiday-period `consumption.json`; the dock's own fixtures under `tests/harness-dock/fixtures/` drive the reused scenarios; the real panel process is started with its own temporary configuration |

In every real-host run above, the provider is the dock's local capture endpoint. No real provider
credential, real provider request or interactive terminal was used. The harness's own byte-identity
and patch artifact checks passed in the dock (`baseline.test.ts`, `viewed-session.test.ts`,
`codex-response-artifact.test.ts`, `combined-host-artifact.test.ts`, `lockfile-verification.test.ts`).

## What the ticket delivered

No production or permanent-test source changed. The deliverable is the current-run evidence for
the OMP partition plus three temporary actual-path probes that close observation gaps the existing
docks leave:

| Probe | Gap it closes | Command | Result |
| --- | --- | --- | --- |
| `probes/connect-bot-smoke.ts` | Real connect-bot delivery: unrecognized directed argument, the managed heartbeat while armed, retained feedback of the async unregister, State report, and exit while still armed | `OMP_BOT_BINARY=... bun .scratch/.../probes/connect-bot-smoke.ts` | exit 0, 26/26 checks |
| `probes/codebase-tools-viewed-smoke.ts` | codebase-tools' own marker under the real Viewed session projection across two switched sessions | `bun .scratch/.../probes/codebase-tools-viewed-smoke.ts` | exit 0, 15/15 checks |
| `probes/model-cost-presentation-smoke.ts` | Real `/budget` actions, initialization ordering, brief/detail widget content and the run's own saved document | `bun .scratch/.../probes/model-cost-presentation-smoke.ts` | exit 0, 29/29 checks |

The probes are evidence scripts, not permanent tests: they live under this evidence directory and
are not part of any `tests/` partition. Their raw reports and frames are under
`probes/out/<probe>/`; the P48 material is under `p48/`.

No production source changed in this ticket, so there was no product mutation to inject and
restore. The probes' checks are direct observations of the named violations: a missing usage
notice, an extra heartbeat after disarm, an exit held by a timer, an ignored Viewed session, a
missing registry row, a wrong widget line set, or a missing saved document would each make a
specific check fail. (The probe assertions themselves were corrected during development when they
described the frame shape wrongly; the final runs are the green ones above.)

Each probe copies the repository's own `adapters`, `framework`, the extension(s) and
`entrypoints/omp` into a run-local deployment, removes the example `framework/config.yaml` where
that matters, and loads them with the isolated install's own `--no-extensions -e <entrypoint>`
loader. No formal loading configuration was edited, and every run used a temporary agent state,
session directory and working directory.

## Promise coverage (ticket partition only)

| Promise | Ticket partition | Evidence |
| --- | --- | --- |
| P46 | OMP / codebase-tools: loader, toggle, restore/inheritance, Prompt, Feedback, Marker coexistence/projection | `tests/codebase-tools` (24/0), `consumer-regression.test.ts`, probe 2 |
| P46 | OMP / connect-bot: loader, directed/unrecognized, initialize, State/retained Feedback, exit and timer/registration | `consumer-regression.test.ts`, `tests/connect-bot` (142/0), `harness-exit-budget.test.ts`, probe 1 |
| P46 | OMP / model-cost: loader, actions, initialize, provider/catalog, Session/save/commit, headless Feedback, presentation | model-cost dock files and `tests/model-cost` (518/0), probe 3 |
| P47 | OMP actual Session save, end and applicable subagent: commit/content, observation/isolation, dispatch, scope, close-out | `round-facts`, `model-cost-persistence`, `session-ownership-tree`, `session-recovery`, `model-cost-session-span`, `turn-facts`, `viewed-session*`, `viewed-marker`, `binding-lifecycle`, `activity-facts` (readings on switch commit nothing) — all in the 115/0 dock run |
| P52 | Ticket 12 handoff: attributable commands, source/fixtures, dependencies/lockfile, harness version/patch, environment and pass/fail/unverified scope | This README and the probe `report.json` files |

The pi entries (P46 pi partitions) and the pi P47 partition are ticket 13's. The framework P47 and
global P01/P05/P49/P51 partitions remain ticket 11's. P48 is prepared here but judged by ticket 14.

Exact real-host cases behind the OMP partitions (all green in the runs above):

- `consumer-regression.test.ts`: "each consumer's own line and own State, and a refused activation
  that changes nothing of the others"; "the shared round axis ends a cancelled exchange for its
  consumers, and one consumer's State survives it"; "an exchange whose provider refuses every
  attempt ends as a failure, and both consumers' own terms hold".
- `round-facts.test.ts`: "two requests, one Round, one save, and the round end after the host's own
  settle"; "a second prompt opens a second Round, with its own round identity and its own save".
- `model-cost-persistence.test.ts`: "a subagent's own record is saved before its parent's, naming
  the parent it has"; "a later process reads both documents back and continues from them".
- `session-ownership-tree.test.ts`: "three sessions save their own record, with the direct parent
  the host reported"; "switching the session the host displays leaves every session's own record
  where it was".
- `turn-facts.test.ts`: "a delegating run delivers each actual session's own identity, parent and
  Turn, and never drives the owner group from a subagent".
- `viewed-session-host.test.ts`: "an extension reads the displayed session's identity, name, model,
  effort and context with nothing unavailable"; "switching the session the host displays is
  readable as a live identity change".
- `viewed-marker.test.ts`: "a subagent's own run renders its effective projection, not every line
  the Owner's session shows".
- `activity-facts.test.ts`: "a switch while the session is working states no reading of its own and
  commits nothing".
- `binding-lifecycle.test.ts`: "the host loads it with its validated configuration, waits for its
  initialization, runs its actions and cleans it up once"; "an ordinary switch keeps the one
  instance, and the shutdown cleans it once".
- `session-recovery.test.ts`: "an independent restart continues its totals, version and period, and
  reads no history"; "a rewind stands up another session from the copied entries, and coming back
  continues the first one's record".
- `model-cost-headless.test.ts`: "one session's exchanges are accounted, saved and drawn nowhere,
  and stdout stays protocol only"; "a command's own result and an unrecognized argument are both on
  stderr, once each".
- `model-cost-modes.test.ts`: "the DeepSeek budget is displayed at 450K while the request the host
  sends is unchanged"; "a held reading survives a real switch to a Go id and back, and only the
  official pair draws it".
- `model-cost-balance.test.ts`: "the first model request is not issued until the prefetch's query
  has been answered".
- `harness-exit-budget.test.ts` (connect-bot partition): "the harness ends on its own lifecycle
  with a minute-budget unregister still on the wire".

## Acceptance mapping

| Ticket acceptance | Evidence (actual run) | Result |
| --- | --- | --- |
| Load codebase-tools, connect-bot and model-cost with an isolated, explicit entry set, frozen install and existing patch conditions without changing the formal loading configuration; record exact harness version and patch; doubles/history do not replace the current loader | `bun run test:dock:serial`: `consumer-regression.test.ts` (3 cases) loads a verbatim copy of `entrypoints/omp` with all three extensions into the real isolated loader; `bun test tests/codebase-tools`: 24/0 loads `entrypoints/omp` directly; `bun test tests/model-cost`: 518/0 plus the model-cost dock files load `entrypoints/omp/model-cost.ts`; the three probes report their harness prefix and run through the same loader. Exact version/patch in the table above. Provider/panel doubles are only the external service; the loader, adapter and extension code are the repository's own. | Pass |
| codebase-tools: toggle, State restore/inheritance, Prompt, Feedback, Marker coexistence and Viewed session projection, with concrete requests/history and marker sets | `tests/codebase-tools/command-toggle.test.ts` (two toggles persist `{enabled:true}`, `{enabled:false}` and announce each), `session-boundaries.test.ts` (resume, legacy fallback, new session, tree navigation, branch/fork seeding), `subagent-owner.test.ts` (subagent inheritance: off stays silent; an enabled owner's child initialises its own branch), `init-injection.test.ts` / `reminder-injection.test.ts` / `outbound-role.test.ts` (captured outbound requests and session-JSONL history; one init, one reminder per enabled turn, resume replay, two provider roles), `marker-lifecycle.test.ts` (default off, toggle, resumed restore, and headless stderr feedback), `consumer-regression.test.ts` (coexistence: `◈ codeBaseTools` and `◐ connectBot` in extension-id order; one disable removes only its line; both disabled clears the area). Viewed projection: probe 2, 15/15, switches two real sessions and observes `["◈ codeBaseTools"]` → cleared → `["◈ codeBaseTools"]` → clears when A is disabled → `["◈ codeBaseTools"]` when B is displayed again, all on the framework's `semantic-extensions` key with no `codebase-tools` widget. | Pass |
| connect-bot: directed/unrecognized, initialization, State/retained Feedback, exit and the original timer/registration lifecycle; temporary actual-path smoke where the dock lacks real-delivery observation | `consumer-regression.test.ts` (directed arm/disarm through the deployed discovery root, refusal/acceptance notices, panel state reports on round end, clean exit). Probe 1, 26/26: the run-local `config.yaml` was validated and used at binding (the register reached the run-local adapter endpoint, not the shipped `127.0.0.1:8787`); the empty argument arms and completes without invoking the model; one panel row; `[info] 已接入 omp-bot 面板（当前 1 个在线会话）`; the panel receives State `idle` and the marker area shows `["◐ connectBot"]`; a heartbeat arrives at ~11.6s through the real managed timer; `/connect-bot bogus` completes without invoking the model, sends no register/unregister, leaves the line and says exactly `未知参数「bogus」；用法：/connect-bot（接入 omp-bot 面板）或 /connect-bot off（断开）。`; `/connect-bot off` unregisters, says `已断开 omp-bot 面板`, clears the line, and no heartbeat follows the disarm; a session re-armed and stopped while heartbeats are scheduled exits with code 0 in ~50ms, sends no shutdown unregister and no late heartbeat. `tests/connect-bot/harness-exit-budget.test.ts` separately holds an unregister on the wire and observes the real harness's own exit. `panel-registration-lifecycle.test.ts` and `registration-lifecycle.test.ts` cover the real-panel remove/expiry and serialized/invalidated attempts. | Pass |
| model-cost: actions, initialization, provider/catalog, Session save/recordCommit, headless Feedback and presentation content; the candidate command alone is not the evidence | `model-cost-headless.test.ts` (7 cases: init balance before first model request, accounting and save with no widget, refresh while the next request is out, refused balance on stderr once, unusable baseline, `/budget detail` + unknown-argument help on stderr once, two extensions in one process), `model-cost-balance.test.ts` (6 cases: reading once, first request waits for the prefetch, refusal, refresh, exit while a query is out, credential/`sentinel`), `model-cost-accounting.test.ts` (4 cases: unreadable usage, unlisted model, reliable usage, all-zero usage), `model-cost-modes.test.ts` (6 cases: hidden pair, token-only, Codex reference/ratio, two-channel switch, DeepSeek budget, balance across a model switch), `round-facts.test.ts` (one Round for a tool continuation, one save, round end after the host settle; a second prompt opens a second Round and saves again), `model-cost-persistence.test.ts` (4 cases: document schema, period archive, restart, subagent record before parent), `detail-tree.test.ts` (3 cases: detail tree, restart restore, child's own row), plus `model-cost-session-span`, `model-cost-runtime-gap`, `period-switch`, `model-cost-store`, `model-cost-codex-quota`. Probe 3, 29/29: `/budget` help and `/budget detail` notices, the brief widget (`Cost: ¥0.0050`, `450.0K`, `Cache: 50%`, `¥Cache/In/Out：0:20:80`, `💰 Balance: ¥110.00`, three lines), the detail widget (`Cost: ¥0.01` on the total, `│  deepseek / deepseek-flash`, four lines), balance before the first model request, one balance query, and the saved document's buckets. `verify:omp-candidate` ran as a regression alarm only (framework suite 633/0, alarm green), not as a substitute. | Pass |
| OMP Session save, end and applicable subagent scenarios: actual commit/content, read-only observation/readings isolation, single dispatch, scope and close-out; not substituted by ticket 11's framework coverage | `round-facts.test.ts` (one `round_start`, two Turns, one `round_end` after the host's own settle, one save per Round), `model-cost-persistence.test.ts` (subagent records saved before the parent, each naming its direct parent; restart continues the document), `session-ownership-tree.test.ts` (three real sessions save their own record with the host-reported parent; a displayed-session switch neither moves nor merges a record; a rename only reaches the next normal save), `session-recovery.test.ts` (restart, competing writer, rewind, fork), `model-cost-session-span.test.ts` (saved spans and background results), `turn-facts.test.ts` (each actual session's own identity, parent and Turn; a subagent never drives the owner group), `viewed-session-host.test.ts` / `viewed-session.test.ts` / `viewed-session-total.test.ts` (read-only facts, live changes, switching and unsubscribe), `viewed-marker.test.ts` (a subagent's own projection does not clear the Owner's area), `binding-lifecycle.test.ts` (initialization, one instance across a switch, cleanup once). The framework half remains ticket 11's. | Pass |
| Reuse the applicable consumer-regression, session-recovery, viewed-marker, binding-lifecycle and model-cost docks; candidate check or serial warm/resource diagnosis as needed; check actual coverage rather than a list of script names | `bun run test:dock:serial`: 115 pass / 0 fail, 1200 expects, 29 files, 330.12s. This is the whole dock partition, including `consumer-regression`, `session-recovery`, `viewed-marker`, `binding-lifecycle`, all model-cost dock files, `viewed-session*`, `activity-facts`, `turn-facts`, `round-facts`, `session-ownership-tree`, `detail-tree`, and the artifact/baseline checks. `bun run verify:omp-candidate`: exit 0, framework suite 633/0, regression alarm green. `bun run check:integrations`: exit 0, five deployed pairs `COMPLETE`/`NOT REQUIRED`, explicitly "behavior correctness is not assessed". The dock was run serially; no cross-file interference or resource failure was observed. | Pass |
| Save actual Marker, notifications and model-cost frames/recording for P48, with content/layout fields checked first by the agent and linked to the 01 baseline and applicable widths; final human judgment to 14 | `p48/connect-bot-marker-area.txt` (the actual `setWidget` renderings at the framework's `semantic-extensions` key, placement `aboveEditor`), `p48/connect-bot-notices.txt` (the four actual notify frames at their severities), `p48/codebase-tools-viewed-marker-area.txt` (the projection sequence), `p48/model-cost-widget.txt` (actual `z-model-cost` frames, host-default placement, brief and detail), `p48/model-cost-notices.txt` and `p48/model-cost-presentation-report.json`. Content/layout assertions are in the probes' reports. The 01 baseline is `.scratch/framework-capability-cutover/evidence/01-p48-baseline/`: its OMP runs read the same `setWidget`/notify frames, and its 120/60-column captures are the pi TUI runs; an RPC OMP session has no physical terminal width, so no width-specific OMP rendering exists to compare. The human readability judgment remains unverified until ticket 14 confirms it. | Prepared; human judgment pending |
| All required scenarios have current-run evidence; missing real credentials/TUI/environment are stated as unverified and blocking, not hidden behind green tests | Commands and results below. The unverified list is explicit. | Pass for the executed scope; limitations below |

## Commands and results

Logs were kept under the gitignored `.cache/ticket12-logs/` during the run.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages; lockfile unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `bun test tests/codebase-tools` | 0 | 24 pass / 0 fail, 334 expect() calls, 7 files, 68.33s; real OMP loader |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 0 | 142 pass / 0 fail, 689 expect() calls, 18 files, 76.81s; real panel |
| `bun test tests/model-cost` | 0 | 518 pass / 0 fail, 2899 expect() calls, 51 files, 13.21s |
| `bun run test:dock:serial` | 0 | 115 pass / 0 fail, 1200 expect() calls, 29 files, 330.12s |
| `bun run verify:omp-candidate` | 0 | framework suite 633 pass / 0 fail, 3325 expect() calls, 53 files; regression alarm green; candidate record written |
| `bun run check:integrations` | 0 | all five declared pairs complete/not required; behavior not assessed |
| Probe 1: `OMP_BOT_BINARY=... bun .scratch/framework-capability-cutover/evidence/12-omp-real-entry-regression/probes/connect-bot-smoke.ts` | 0 | 26 pass / 0 fail; 38.82s |
| Probe 2: `bun .scratch/framework-capability-cutover/evidence/12-omp-real-entry-regression/probes/codebase-tools-viewed-smoke.ts` | 0 | 15 pass / 0 fail; 22.64s |
| Probe 3: `bun .scratch/framework-capability-cutover/evidence/12-omp-real-entry-regression/probes/model-cost-presentation-smoke.ts` | 0 | 29 pass / 0 fail; 22.15s |

The probe counts are the checks in their `report.json` files. Probe runs are deliberately separate
from the permanent suites: they exercise gaps the existing docks do not, and they are not counted
as additional suite coverage.

## P48 material and human handoff

- Marker text and placement: `p48/connect-bot-marker-area.txt` (line `◐ connectBot`, placement
  `aboveEditor`), `p48/codebase-tools-viewed-marker-area.txt` (line `◈ codeBaseTools`), and the
  coexistence order in `consumer-regression.test.ts` (`codebase-tools` before `connect-bot`).
- Notifications: `p48/connect-bot-notices.txt` and `p48/model-cost-notices.txt`, with levels
  (`info`/`error`) as the host framed them.
- model-cost display: `p48/model-cost-widget.txt`, with the brief three-line rendering
  (`Cost: ¥0.0050`) and the detail four-line rendering (`Cost: ¥0.01`, model tree), both read from
  the actual `setWidget` frames. The widget has no explicit placement field; the host default is
  the layout, while the marker area's placement is `aboveEditor`.
- Baseline: `.scratch/framework-capability-cutover/evidence/01-p48-baseline/README.md`; its OMP
  runs recorded the same `setWidget`/notify channels. Width: the 01 baseline's pi TUI frames are
  120 and 60 columns; OMP RPC frames carry no terminal width. No OMP TUI was run.
- Ticket 14 owns the final human readability confirmation. Until then P48 is unverified, and that
  is not counted as a ticket-12 failure of the automated scope.

## Limits and unverified scope

- No real provider credential or remote provider response was exercised. The capture endpoint is a
  local fixture with a dock credential; this record makes no claim about real provider
  authentication, model quality or wire acceptance. The `openai-codex-responses` path remains
  shape-only in the existing dock. Missing real credentials are a blocking limit on any
  authentication/support claim, not something a green local run can establish.
- No interactive OMP TUI was run and no physical terminal width applies to the RPC sessions. P48
  readability is human-only and pending (ticket 14); the missing TUI observation is a blocking
  limit on any claim that interactive readability is verified. The OMP runs target the isolated
  18.5.0 install, not the machine's global install.
- The ticket covers the three OMP entries and the OMP P47 partition only. The pi entries and pi
  session scenarios are ticket 13's; the framework partition and global retirement are ticket 11's.
  Cross-partition aggregate results are not substituted for these runs.
- `verify:omp-candidate` is a regression alarm, not a support certification; its own record says
  so. `check:integrations` compares declarations only and does not assess behavior.
- The probes are temporary evidence, not permanent tests. A later source change invalidates these
  results; rerun the commands above against the changed tree.
- The full dock was run serially in this worktree. The tree's source and fixtures stayed unchanged
  during the runs; the only repository change in this ticket is this evidence directory.
