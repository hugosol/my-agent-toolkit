# modelCost

The consumption widget and `/budget` command for OMP and Pi show request-priced cost, session and Round totals, subagent runtime, Codex allowance estimates, and DeepSeek balance. Load the [OMP entrypoint](../../entrypoints/omp/model-cost.ts) or the [Pi entrypoint](../../entrypoints/pi/model-cost.ts). Both use [`definition.ts`](definition.ts) and [`shared-logic/`](shared-logic). See the [glossary](GLOSSARY.md) for accounting terms and [model data maintenance](docs/model-data-maintenance.md) for pricing sources.

## Codex allowance display

When a successful account query provides a weekly allowance but no five-hour reading is held,
only the 7d row is shown: the absent 5h row is omitted without leaving a blank line. Missing 7d
readings retain their existing `7d limit not reported` display. Genuine query failures remain
visible, including on an absent 5h row; omission does not mean an unlimited allowance. A previously
accepted 5h reading is still retained when a later response omits it, following the existing
independent-window update policy.

## Shared-logic architecture

The extension has three responsibility groups, composed by `shared-logic/runtime.ts`:

- **`business/`** owns pricing (including request-start anchors and consumption contributions),
  allowance windows and estimates, context display budgets, and subagent read-only composition.
- **`foundation/`** is this extension's inward support, not the public `framework/`: session
  consumption, identity/descendant relations, period-scoped state, coordinated consumption storage,
  and the success-TTL/in-flight policy shared by provider readings. It imports no business module.
- **`presentation/`** owns read-only display results, text/field formatting, display preference and
  merged redraws. Native drawing remains in `harnesses/`; business modules import no presentation.

Pricing captures one request's policy in a settlement function; foundation retains it by Turn and
applies its contribution once. Subagent composition reads the same session authority and descendant
relations as inclusive totals, never a second ledger. Tokens, amounts, startup, span and runtime still
share one Session snapshot and the existing Round-end save. Codex estimates keep their independent
file, immediate baseline writes, refinement interval and best-effort failure policy.

Tests are grouped by responsibility under `tests/model-cost/{business,foundation,presentation}`;
`integration/` retains cross-module scenarios and `harnesses/pi/` retains pi assembly scenarios.
This is not a requirement to mirror every source file. Existing behavior cases and combination
coverage survive changes to internal imports and wiring.

Integration checks derive framework capability demand from source and adapter assembly. See [integration checks and generation](../../framework/docs/integration-check.md) and [capability layering](../../framework/docs/capability-layering.md).

## Storage and accounting resets

Set `storageDir` in [`config.yaml`](config.yaml) to the directory for `consumption.json`, `codex-usage-estimate.json`, and `archives/`. For this field, `~/` means the user's `.omp` home on either host. The shipped `~/cost-archive` is therefore `<user home>/.omp/cost-archive`. Other relative paths start at the configuration file, not the working directory. The framework validates this file at binding. A new path selects another store on restart. No data is copied or merged.

`consumption.json` holds the active period and each session's own record. A session saves only its own record through coordinated read-modify-publish. A missing file at initialization is a fresh period shared by instances before the first write. An unreadable or unrecognized active document pauses accounting instead of starting over. A later initialization can re-read the document; read-only synchronization cannot clear a pause.

A process confirms a session's own save before publishing its commit count. If another process serves the owner, that process adopts the on-disk document with a lock-free read. A repeated count does not cause another read; reconnection can recover a missed notice. Notices delivered together share a read, and a notice during that read schedules another. The notice adds no usage, and the owner neither saves on the child's behalf nor polls storage. Synchronization does not initialize an absent document. An invalid schema pauses the instance; a read failure preserves the existing baseline and reports the error. When synchronization adopts a newer period, it discards only the closed period’s local accumulation. Same-process sessions already share the document and do not need a read-back notice.

Run `/budget clear` or `/budget holiday` only from the entry's own DeepSeek session when it is reliably idle and no save is pending. Either command archives the saved period for every session in the root and opens a new period in one coordinated operation. `clear` opens a regular period. `holiday` opens a holiday period and does nothing if the current period already has that flag. Neither command flushes unsaved or in-flight consumption. The reset writes a uniquely named archive before publishing the replacement document. Its `end` is the new period’s start. Archives are not read back into accounting. The independent Codex estimate survives a reset.

## Provider account readings

At initialization the extension starts DeepSeek balance and Codex allowance queries in parallel, before the first model request, without waiting for a matching model to be used. A missing credential prevents a request. DeepSeek prefetch skips missing access without a failure notice for an unused provider. Query failure does not prevent a model request.

- **DeepSeek balance.** The provider query reads the CNY total at `/user/balance` on the host's provider base URL after removing a trailing `/v1`. A settled DeepSeek request can refresh the reading after the success TTL (`balanceTtlMs: 30000` as shipped). Concurrent triggers join the current query. Expiry alone does not send a request, and a failure does not change the last accepted reading or its timestamp. The next settled request can try again. A failed refresh reports unavailability rather than inventing a balance.
- **Shared display.** Balance and Accrued follow the Total's `Cost:` field, not the current model. Monetary targets include that field. A token-only or allowance view can show both account facts beside its own context budget when the main tree has CNY cost from earlier requests or descendants. A view without `Cost:` hides both without changing the stored reading or its TTL.
- **Reset boundary.** The reset makes one separate balance query outside file coordination and does not reuse the held reading. A CNY result sets `end_bal` on the archive and `start_bal` on the new period. Failure or missing CNY omits both fields and does not prevent reset.
- **Codex allowance.** Read account windows from `/wham/usage`, not response headers. Assign readings by their reported duration (within 5% of five hours or seven days), not by position. A partial response updates only the windows it contains. A reset is unknown if missing, expired if past, or invalid if farther ahead than the window lasts. The original instant stays unchanged. A settled Codex request can refresh after the success TTL (`codexQuotaTtlMs: 15000` as shipped). A failed or windowless answer earns no TTL.
- **Codex estimate.** Ratio samples pair both windows from one API response, never a new window with a held one. A qualifying pair moves both windows up, increases 5h use by at least 50 percentage points, and is not saturated. A reset of the 5h window requires a new baseline. Store the baseline immediately and refine the persisted ratio at most once a minute. Merge by baseline capture time so a newer estimate is not overwritten. A document in an unrecognized estimate format starts a new estimate rather than migrating. Display `estimating…` until a ratio is available, then `left≈N.N×5h · ratio≈R.R`. The remaining estimate is the unused weekly share multiplied by the ratio.

## What runs automatically

| Command | Coverage |
| --- | --- |
| `bun test tests/model-cost` | Accounting, pricing, storage, period actions, and presentation. |
| `bun test tests/harness-dock/model-cost-accounting.test.ts tests/harness-dock/model-cost-balance.test.ts tests/harness-dock/model-cost-codex-quota.test.ts` | Isolated installed OMP, provider protocol with local endpoints, and storage readback. |
| `bun scripts/pi-model-cost-smoke.ts` | Scoped installed-Pi model-cost check. See [Pi model-cost evidence](../../framework/docs/harness-support.md#pi-model-cost-migration-evidence). |
| `bun run smoke:model-cost-data`, `bun scripts/http-transport-smoke.ts` | Independent model data check and local HTTP transport. |

Local fixtures do not certify real provider values, rendered TUI readability, or harness support.

## Timing and detail behavior

Accounting view notifications isolate each subscriber: a throwing view emits a `[model-cost]`
diagnostic on stderr and does not prevent the remaining views from receiving the same publication.
The merged redraw also owns exceptions from its queued microtask callback, reports them on stderr,
and accepts later redraw requests normally. Diagnostics identify the failed boundary without printing
the thrown value or view payload. Failures are not retried automatically; immediate observation
adoption, same-turn merging, publication spending and disposal behavior are unchanged.

The UI uses one wait for the next price boundary, not a poll. Sessions without a UI, subagent views, and holiday periods do not start their own timer. Peak windows include their endpoints: 12:00:00.000 is still peak, so the change occurs at 12:00:00.001. After sleep or blocking, use the current time and schedule the next boundary; do not replay the missed one. A redraw sends no request, writes no file, and changes no accounting.

`harnesses/boundary-timer.ts` owns scheduling and catches frontend redraw errors so the next boundary can still be scheduled. OMP uses a managed one-shot timer. Pi uses an unref'd one-shot timer and clears it on release. A scheduling error is diagnosed; a later ordinary `sync()` can resume waiting without automatic retries.

- A `/budget detail` descendant row states the agent definition its host reported as a leading
  category (`[task] 检索定价`, `[scout] 检索价格`) before the session name. Do not guess a
  category if the host did not report one. The category is not persisted; a row restored from
  storage has no prefix until the host reports it again.
- A descendant's `Run` is accumulated working time from activities whose own Round end was observed,
  not a live stopwatch. An open first activity has no measured duration yet (`—`); a measured zero
  is `0ms`. Distinct actual child sessions remain distinct rows, including a failed foreground
  launch followed by a new background attempt; a row does not by itself prove a model request ran.
- The main session's span runs from its first user input in the accounting period to the latest
  of its framework `turn_end` and receipt of a terminal subagent-result notification. Success,
  failure and cancellation all count. Each result advances the span while the main session waits
  for a batch, without waiting for the whole batch or another main-session Turn to finish; this
  applies to same-process and multi-process subagents alike. Result receipts use the main process's
  clock, and late Turn ends cannot move the span backwards. Progress reports, storage commits and
  descendant completions not delivered to the main session do not advance it. No timer is added:
  span stays fixed between these events, even when the main session is idle. Resuming in the same
  period keeps the original first input. A fork or accounting reset uses the first new input.
  Consumption still saves at `round_end`. Late activity from a closed period does not count in the new one.
- On pi, the displayed Effort follows the session's effective thinking level. A `/model` selection and
  a changed thinking level both redraw from the host's current `thinkingLevel`; changing the level
  issues no model request, writes no accounting and does not rewrite a descendant's startup snapshot.
- On OMP, startup progress before the real child Session is attached produces no runtime delivery
  or timing error. Once the adapter can resolve the actual Session identity, the next valid native
  progress supplies its full execution duration; no synthetic `0ms` or public ready event is added.
  Existing cumulative runtime is retained. Invalid readings after readiness and unresolved terminal
  executions remain errors rather than being silently discarded.
- A session's own disposal is a Round boundary the framework closes for the extension: a settle the
  session had already stated is confirmed there, and a Round left open with no end of its own is
  truncated. A truncated Round's known consumption still commits under that session's own identity
  before the host lets the session go, and its working time is never filled in — the period's
  observation of that session is marked incomplete (the record's `runtimeGap`) and the operator is
  told, because an activity whose own end was never observed is not a duration this extension
  measured. A session the host merely left — a switch, a resume, a fork — is no disposal and commits
  nothing for it. That commit spends what is *left* of the disposal's own close-out wait rather than a
  fifteen-second budget of its own, so the host is never held past the position it reported from: a
  wait the deadline gives up is reported as consumption that was **not written** — under the deadline
  that ended it — and nothing of it is on disk. An update that had already begun is not stopped by that
  deadline, and its own outcome (and the document it publishes) is what the extension then reports; the
  deadline itself claims no cancellation and no unwritten document. Nothing here waits for the owner's
  process: a session whose owner is not served by this one commits and closes just the same.
- `/budget detail` is offered to an entry whose subagent integration took — the OMP entry always is.
  An entry that settled as the no-subagent mode has no descendants of its own to list, so its
  `/budget detail` answers that it was not executed and leaves the preference where it was; every
  other `/budget` action is unaffected. The condition is that settled integration mode, checked when
  operator invokes the command, not the provider, idle state, pending saves, UI or record count.
  The preference is in memory. It survives model, session and view changes, returns to brief on
  restart or reload, and is not inherited. A focused subagent always uses brief, even when
  `/budget detail` changes the main view's preference.
- `/budget detail` combines each child's startup snapshot as `provider/model(effort)`, for example
  `deepseek/deepseek-flash(high)`, without `Model:` or `Effort:` labels. Unknown facts remain `?` and
  a reported `off` remains `off`. A background session's reliably reported startup pair is visible
  before its first consumption commit; later changes do not replace it. Save the snapshot only
  with the session's own consumption, and capture it only on a proven new conversation, not a
  resume, fork, or reload. Missing historic snapshots stay unknown.
- The tree lists the union of the sessions the document holds and the sessions this process observed,
  merged by the session's own identity: a subagent another process runs takes its row at the direct
  parent its own host stated — a grandchild under its own parent, never under the owner — and a
  session whose first consumption is still uncommitted is shown with the readings that did arrive
  (its context, its activity) and with no consumption figure at all rather than a zero. A later run
  or process that continues the same session updates that row instead of adding a second one, and
  nothing of an observation is written to the storage root.
- The framework collects live context through `getContextUsage()` at session start, finalized messages, and execution convergence. The extension consumes that observation rather than subscribing to native events. It does not store it as consumption. A descendant with a supported model budget shows `Ctx: percent (tokens/budget)`. A missing or withdrawn live reading omits that field. Active names use the theme's activity color. When access ends, the row keeps its place and saved totals but loses its live color and context.
- The framework publishes changed observations, not identical or per-chunk readings. The extension adopts changes as they arrive and coalesces redraws in one event-loop turn from the latest values. If a publication already redrew those values, it satisfies the pending redraw. Round settlement and saves are not deferred.

### Widget layout

- Context budgets are display-only: 450,000 tokens for monetary and token-only models, and 272,000 for the allowance channel. Hidden models have no widget. The budget does not configure the host's context window. Its bar uses dim below 36%, success at 36–63%, warning at 64–81%, and error at 82% or above.
- The account row combines the season marker where applicable, budget bar, Effort, and any Balance and Accrued fields. Effort colors only the value. Balance is an error below ¥5, a warning from ¥5 up to ¥10, and plain from ¥10. Accrued uses 5-fen eighth blocks through ¥20, then ¥1 whole blocks. Segments follow a fixed eight-color cycle in document session order, include contributing sessions from either host, and are capped to fit. A session below the current granularity has no segment.
- The detail tree replaces Round rows. The root name stands alone, followed by its own provider/model rows. Only those model rows have the cache-share column. Descendant names use the latest session name, spawn handle, saved name, agent definition, agent ID, then session ID. Descendant rows show their direct figures, never a subtree subtotal.
- Model rows form one layout group. Descendant rows at the same depth share field columns even under different parents. Missing fields leave blanks. Measure names in terminal cells, preserve the Effort suffix where it fits, and abbreviate long names or models with `…`. At narrower widths all rows of a group wrap at the same break, then clip as needed. No display abbreviation changes stored data.
- As space narrows, Codex pacing rows lose the bar and time marker first, then the reset date, reset interval, and pacing percentage. The full usage and reset facts remain in the display result.

## Human acceptance

Use the installed host with isolated agent state, session, working and home directories. Do not modify the installation or use your normal configuration or a running agent. Use `OMP_CLI` to select an installed OMP, otherwise use `omp` on PATH. For Pi, use its installed CLI and the Pi entrypoint. Missing native behavior is a compatibility failure, not a reason to patch the host.

```bash
# <run> is a throwaway root (agent-state/, sessions/, work/, home/) and <repo> this repository
PI_CODING_AGENT_DIR=<run>/agent-state HOME=<run>/home "${OMP_CLI:-omp}" \
  --session-dir <run>/sessions --cwd <run>/work \
  --no-extensions -e <repo>/entrypoints/omp/model-cost.ts --model <provider>/<model>
```

For Pi, use the same isolated directories and run `pi --no-extensions -e <repo>/entrypoints/pi/model-cost.ts` from the isolated working directory with `--session-dir` and `--model`. Use credentials in the isolated state only for checks that need a real provider. Do not write credentials to logs or this repository. Record missing credentials as blocked.

### H1 — the real interactive TUI

Run in a real terminal. When stdout is a TTY, the native host requests component lines at its width and with its theme. Headless RPC uses plain lines without terminal colors or width. Both forms use the same display result. Use a reasoning model to distinguish effective Effort from an unavailable value (`?`).

| Scenario | Observe in the terminal |
| --- | --- |
| Focus a subagent where the host supports viewed sessions | Effort, context, current-model fields, and Round belong to the viewed child. Its form stays brief and the main tree's Total does not change. Changing Effort sends no request. Returning restores the main view's preference. |
| Run a subagent, then restart and resume | In `/budget detail`, compare `Run:` with the child's native working duration and the saved record. The main model rows have no runtime. Missing duration shows `—`, measured zero shows `0ms`, and resuming does not count old work twice. |
| Open and resize the detail tree | The context bar and Total stay fixed. The tree replaces Round rows. Check separate root model rows, a child and grandchild under their actual parents, and Chinese and ASCII names at one depth. Fields keep their columns when a value is absent. Abbreviation, wrapping, and clipping remain readable. An ended observation removes live color and context but keeps the saved row and totals. |
| View marker fixtures in main and subagent sessions | If testing marker integration, enable `◈ followMarker` and `◐ noneMarker` in the owner. The main view shows both in ID order. Focusing a child shows only the follow marker, reflecting the owner's current state. Leaving the child restores the main view. Viewing grants no write authority. |
| Cross a price boundary or select the first holiday period | Check that the season marker redraws without a model request. |
| Inspect and resize the account row | Check the budget bar, Effort, Balance, Accrued, and the Codex pacing rows where applicable. Compare the [shared Cost rule](#provider-account-readings) and [layout rules](#widget-layout) with what the real terminal draws. |

For layout diagnostics, run `bun run smoke:model-cost-detail-layout` or `bun run smoke:model-cost-detail-layout-terminal`. The first measures the formatted lines. The second resizes its Windows console and reads the drawn cells. Neither substitutes for judging the real terminal's readability.

### H2 — a real provider's effect

Use [the provider account reading runbook](../../framework/docs/harness-support.md#e-provider-account-reading) to compare a real account answer with the widget. `bun run verify:provider-account` uses the installed Pi and makes no model request. Check the DeepSeek CNY total and the Codex window percentages and reset instants against the actual replies. Record missing access or credentials as blocked, not zero or a passing check.

Observe refresh and estimate behavior during normal use. Do not spend quota to make a sample. If no qualifying paired reading occurs, record `estimating…` rather than treating the estimate as verified. Controlled replies can exercise the rules above, but do not establish what a real account reported.

## Cutover and rollback

Use this procedure only when replacing a deployed legacy implementation. Complete the isolated acceptance checks first. Configure exactly one implementation of `model-cost`; the loader does not deduplicate by name. Use a whole-process restart, not a reload.

1. Stop the running host. Back up its load configuration and the entire statistics directory named by the legacy implementation. Keep both backups through normal use of the replacement.
2. Set `storageDir` in the replacement's [`config.yaml`](config.yaml) to a fresh directory. Leave legacy files untouched, even if their names match. No migration, copy, or merge occurs.
3. Configure the replacement entrypoint and stop discovering the legacy implementation. Preserve other extensions you still need. Restart the host.
4. Verify the widget and `/budget` help. After one normal request, check that Total includes its usage once and the new documents belong to the fresh root. Leave the old directory untouched.
5. To roll back, stop the replacement, keep its data for diagnosis, restore the previous configuration and storage location, and restart with only the previous implementation. Never merge old and new documents or load both implementations.
