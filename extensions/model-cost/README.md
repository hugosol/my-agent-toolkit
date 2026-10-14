# modelCost

The consumption widget and the `/budget` command for an `omp` session: per-request cost anchored at
the request's own peak/off-peak price, session and round totals, the independent Codex allowance
estimate and the provider balance reading. The declaration is [`definition.ts`](definition.ts), the
business rules are under [`shared-logic/`](shared-logic), the OMP assembly is
[`harnesses/omp.ts`](harnesses/omp.ts), the operator surfaces are documented by
[`GLOSSARY.md`](GLOSSARY.md), and the maintained model/price data is documented in
[`docs/model-data-maintenance.md`](docs/model-data-maintenance.md).

## What runs automatically

| command | what it covers |
| --- | --- |
| `bun test tests/model-cost` | the extension's business suite: accounting, pricing, documents, period actions, presentation. No network. |
| `bun test tests/harness-dock` | the dock suites: a real isolated `omp` session, a local capture endpoint, the extension's own storage root read back. No real provider. |
| `bun scripts/model-cost-data-smoke.ts`, `bun scripts/http-transport-smoke.ts` | the maintained data set against the specification's independent literals, and the HTTP transport against a local endpoint. |

Those suites are the agent's evidence. They are not an acceptance: what a real account reports and
what a real TUI draws are human-only, and nothing in this repository claims either.

## Human acceptance

Two rounds, both run **only** on an isolated install and state: never the default global install,
never the formal configuration `~/.omp/agent/config.yml`, never a running agent.

### The artifact under test

The frozen combined host artifact — the isolated exact `@oh-my-pi/pi-coding-agent@18.5.0` install
(revision anchor `9348320cc4a30a7195d36a1f05a6c11bcb701a17`) with both of this migration's local host
patches applied to one install: the public Viewed session outlet and the Codex response boundary.
Its patch hashes, the pre/post sha256 of all nine files it touches and the isolated loading steps are
in [`host-patches/omp-18.5.0-viewed-session-codex-response/`](../../host-patches/omp-18.5.0-viewed-session-codex-response/README.md);
`tests/harness-dock/combined-host-harness.ts` materialises it into
`.cache/omp-baseline/18.5.0-viewed-session-codex-response` and refuses a host whose bytes are not the
frozen ones. It is a local artifact: not merged upstream, and it promotes no support version.

```bash
# <run> is a throwaway root (agent-state/, sessions/, work/, home/) and <repo> this repository
PI_CODING_AGENT_DIR=<run>/agent-state HOME=<run>/home bun \
  <repo>/.cache/omp-baseline/18.5.0-viewed-session-codex-response/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts \
  --session-dir <run>/sessions --cwd <run>/work \
  --no-extensions -e <repo>/entrypoints/omp/model-cost.ts --model <provider>/<model>
```

Give that isolated state its own credential for the model you intend to run — `PI_CODING_AGENT_DIR=<run>/agent-state
bun <cli> login <provider>`, `--api-key`, or the provider's API-key environment variable. A real
credential is read by the run only, is never printed into a request, a log, the conversation or this
repository, and an unusable or missing one skips the round with a record rather than a substitute.

### H1 — the real interactive TUI

Run in a real terminal (so `process.stdout.isTTY` is true and the widget takes its component form).
Each row names the promise, the scenario to watch, and the expectation prepared with the migration
evidence — restated here so the check needs no external record. Where a row asks for Effort, use a
reasoning model: a model with no thinking level shows `?` by design and cannot distinguish "the
real value" from "unavailable".

| promise | what to watch in the real TUI | prepared expectation (recorded with the migration; not yet observed) |
| --- | --- | --- |
| P11 | Effort shows the level the request really ran with (not the configured intent), and a subagent's own view shows that subagent's level; an unreadable level is `?` | Focus a subagent spawned by a real `task` call: its own Effort (the level the host's own status line reports for it), its own context bar and its own current-model fields are the three things that must switch; the tree `Sum`/`Cost`/`Ref` must not move. Changing the subagent's thinking level updates Effort with no new model request; returning to the main session restores its values. Recorded RPC cross-checks: the shown Effort equals the host's own `thinkingLevel`; the current-model fields switch from `Cache: 67%  ¥Cache/In/Out：4:7:89` (main) to `Cache: 40%` (subagent) while `Sum: 6,100  Cost: ¥0.05` stays untouched. |
| P23 | `/budget detail` shows the Total block plus the static agent tree with a row per session and its own model, each subagent row beside its own current context (`Ctx: percent (tokens/budget)`, read against that channel's fixed display budget), and no `Round:` row | `/budget detail` keeps the context bar and the `Total:` line byte-identical, then replaces the Round rows with the static tree: the root name alone, a `│  provider / model` model row per model the root itself consumed (carrying that model's own fields; session rows carry no single-model ratio), and one `├─`/`└─`-indented row per own session. Recorded dock example (Main 6,000 tokens / `Cost: ¥0.01`; child 3,000 / `¥0.0050`; tree 9,000 / `¥0.02`): `dock-detail-main` / `│  deepseek / deepseek-flash  Cache: 50%  ¥Cache/In/Out：0:20:80  Sum: 6,000  Cost: ¥0.01` / `└─ <child session id>  Cache: 50%  Sum: 3,000  Cost: ¥0.0050`. |
| P26 | Viewing a subagent shows that subagent's own context and Round in the fixed brief form; moving back restores the main preference | Focus a subagent: it must show the fixed brief form — its own Effort, context, current-model fields and its own Round — with no tree; `Sum`/`Cost`/`Ref` remain the whole main tree. Returning to the main session restores the detail tree, and a subagent row reflects consumption recorded while you were away; `/budget detail` typed while focused only flips the entry preference, visible after returning; restarting the CLI returns to brief. |
| P27 | The one marker line follows the session you are viewing (main ↔ subagent), and viewing never grants write authority | With two marker fixtures (`◈ followMarker` = follow, `◐ noneMarker` = none) enabled in the main session: the main view shows both lines sorted by id inside the one framework marker area; focusing the subagent shows only the follow row, reading the owner's current value live (turning the follow extension off while focused removes the row); losing the view target falls back to the main session and both lines return. Viewing never grants write authority, and the main area is never blanked by the subagent's own publication — the delegation regression the recorded run fixed. |
| P41 | Crossing a peak/off-peak boundary — and the holiday marker on the first holiday period — redraws the block once, with no request issued | At a Beijing-time peak/off-peak boundary — and on the first holiday period — the marker and the whole block redraw once, and the boundary itself issues no request. Recorded automatic cross-checks: one one-shot timer per UI process; the boundary is endpoint-inclusive (12:00:00.000 is still peak, so the next change answers 12:00:00.001); after a sleep or block it re-arms from the actual clock; holiday periods do not arm; no UI does not arm; the callback touches no network, file or ledger. |
| P67 | The approved visual form: the old single monetary account row (season marker, bar bands, `💰 Balance:` and `Accrued` segment colours together), the balance warning thresholds (a token-only or allowance view draws no balance at all), Codex pacing rows, and the four-step narrow-width degradation | One monetary account row: season marker + budget bar + `Effort:` + `💰 Balance:` + `⏳ Accrued:` (with its segment bar) on a single line — the form restored after the H1 review feedback of 2026-10-14 rejected the split balance/accrued rows — then `Total:` and, in detail, the tree. A token-only or allowance view draws no balance and no accrued row. Thresholds and colours: budget bands `<36%` dim / `36–63%` success / `64–81%` warning / `≥82%` error; balance `<5` error / `5–9.99` warning / `≥10` plain; accrued fine blocks ≤ ¥20 (5-fen granularity) and coarse > ¥20 (¥1) with the eight-colour cycle; Effort colours only the value, via the host theme. Codex 5h row narrow-width degradation: 200 → 20-cell bar + time marker + `85.0% / 80.0% · resets in 1h (dd/HH:MM)`; 50 → `5h 85.0% / 80.0% · resets in 1h (dd/HH:MM)`; 40 → `5h 85.0% / 80.0% · resets in 1h`; 20 → `5h 85.0% / 80.0%`; 10 → `5h 85.0% …`. Host-theme colours, fonts and the real narrow-width rendering are the remaining visual judgement. |

No screenshot or recording could be produced in the agent's environment (no interactive TUI), so
this round is judged from what you see — that limitation is recorded rather than worked around.
Everything above is prepared material, not a result: P11, P23, P26, P27, P41 and P67 stay
unverified until you record this round.

### H2 — a real provider's effect

These checks need your real account and credential. The migration's runs never reached a provider
and used no real key, so every reading below is still to be observed: the channel and composition
rules are verified on the frozen isolated artifact above, but API, mock and RPC results never
certify the real effect, and no sample may be manufactured by consuming quota.

| promise | what to watch with a real account | prepared expectation (recorded with the migration; not yet observed) |
| --- | --- | --- |
| P36, P38 | The provider balance reading appears and refreshes under its success TTL in normal use; an unavailable reading is omitted rather than replaced by a cached guess | After one normal DeepSeek request the monetary account row shows the account's own CNY total (`Balance: ¥<real reading>`), fetched from `<host base without trailing /v1>/user/balance`; further requests within the 30s success TTL (`balanceTtlMs: 30000` as shipped) do not query again, and a query already in flight is joined rather than duplicated. A failed refresh is surfaced as `unavailable (…)` — a broken credential reads `unavailable (no-access)`, an unreachable host `(unreachable)` — and never fabricates or silently re-dates a value: no zero, no retry storm; P36's boundary attempt is made once, outside the lock, and on failure its start/end values are omitted while the reset still proceeds. Ready-made skip: on a machine with no resolvable DeepSeek address or credential the expected result is `no-access`; record that as the skip reason — it is the designed degradation, not a pass. |
| P39, P65 | The 5h and 7d windows come from a real Codex response's own rate-limit headers, each window updating independently; the model list, account call and skip reason | After a normal Codex request the 5h and 7d rows equal that response's own `x-codex-primary-*` / `x-codex-secondary-*` values and resets, assigned by reported duration (±5%), not by field position; each window updates independently, and a report missing one side leaves that side's prior percentage, reset and obtained time untouched; no quota query runs between Turns. Recorded channel proof (isolated patched host, scripted values): every Turn carried `hasHttpFacts: true`, and in a three-report session a 5h-only report moved 5h while the weekly reading stayed byte-identical; the once-per-process account call is rejected (`misconfigured`) when the shared config has no named proxy, and no second attempt follows. |
| P66 | The ratio and remaining-allowance estimate in normal use, against the hand-computed sequence — without consuming quota to manufacture samples; too few samples is an honest "still estimating" | Use Codex normally; no quota may be consumed to manufacture a sample. Hand-computed sequence to compare against: 5h 10% / 7d 2% → `estimating…` with the (10/2) baseline written at once; 60% / 7% → `left≈9.3×5h · ratio≈10.0` (a ≥50-point five-hour rise, both windows up); 59% / 6.9% and 61% / 7% → ratio unchanged (below threshold; weekly-only movement); a saturated 5h holds the ratio; after the 5h reset moves and reports 5% / 3% a new baseline is written at once; 55% / 7.5% → `ratio≈11.1`; a restart continues from the stored ratio without re-learning; a weekly-only report is never paired with the held 5h value. If no qualifying sample occurs, `estimating…` is the honest result — record it rather than forcing one. The recorded baseline machine already holds one ratio document (`ratio: 6.5333`) written by the superseded implementation: it shows a real account produces ratios, but it is not evidence about this code. |

P36, P38, P39, P65 and P66 stay unverified until you record this round; a machine that can only
produce mock or RPC results records the skip reason instead of a substitute reading.

## Cutover and rollback

You run this; the agent does not touch the formal instance. Precondition: both human rounds accepted
on the isolated install above. Until then the formal instance keeps running the superseded
implementation, and no step below has been executed.

**Mutual exclusion is by load source.** The loader does not deduplicate extensions by name, so
exactly one implementation of `model-cost` must be discovered. The two shared steps (add the
discovery root once, restart as a whole process — there is no hot reload) are in
[H3 — permanent cutover and cutover smoke](../../framework/README.md#h3--permanent-cutover-and-cutover-smoke);
adding `entrypoints/omp` also carries this repository's other migrated extensions.

1. **Stop the formal instance** you run day to day. Do not stop it with a validation command attached
   to it; this is your own restart.
2. **Back up the formal configuration and the old statistics.** Copy `~/.omp/agent/config.yml` aside,
   and copy the old statistics directory aside whole — the superseded implementation documented
   `~/.omp/cost-archive`, holding `deepseek-cost.json` and `codex-usage-estimate.json`. Check the old
   implementation's own configuration first: if it names another directory, back that one up. Keep the
   copy until the new instance has been used normally for a while.
3. **Prepare empty data.** The new extension reads and writes one storage root, configured by
   `storageDir` in [`config.yaml`](config.yaml) (default `~/cost-archive`, i.e.
   `<home>/.omp/cost-archive` — see
   [storage root](../../framework/docs/framework-capabilities.md#extension-configuration-declaration--file)
   for the path rules). Clear that root, or point `storageDir` at a fresh directory: nothing migrates,
   copies or merges what an earlier value left behind. Do not let the first formal start read the old
   documents — the old estimate file even shares the new estimate document's file name, and a
   document that does not match the new shape reads as a first run, which would rewrite it.
4. **Make the load source exclusive.** Add `E:/Developer/myhub/my-agent-toolkit/entrypoints/omp` to
   the `extensions:` list of `~/.omp/agent/config.yml`, and stop loading the superseded `model-cost`
   implementation — it lives under the `my-omp-toolkit` repository's `extensions/model-cost`. Remove
   that implementation, or that discovery root if nothing else you still load comes from it, so
   exactly one implementation of this extension is discovered.
5. **Start and confirm.** After the restart, confirm: the widget draws in the form you accepted; the
   `/budget` help answers and each action responds; the storage root was created fresh and holds the
   new documents (`consumption.json`, `codex-usage-estimate.json`, `archives/`); no old document was
   read, rewritten or deleted; and one request settles into the Total exactly once.
6. **If the cutover fails:** stop the new instance, keep the new data where it is for diagnosis,
   restore the configuration backup (and the old statistics directory if anything moved), and restart
   the previous configuration. Do not merge new and old statistics, and do not let both
   implementations load to "keep both" — the documents and the widget are not additive.
