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
Each row names the promise, the scenario to watch, and where the prepared material — the exact
expected text, field values, thresholds and the isolated steps — lives.

| promise | what to watch in the real TUI | prepared material |
| --- | --- | --- |
| P11 | Effort shows the level the request really ran with (not the configured intent), and a subagent's own view shows that subagent's level; an unreadable level is `?` | [`16` §5](../../.scratch/model-cost-migration/assets/16-viewed-session-total-evidence-2026-10-13.md) |
| P23 | `/budget detail` shows the Total block plus the static agent tree with a row per session and its own model, and no `Round:`/`Prev:` rows | [`17` §5](../../.scratch/model-cost-migration/assets/17-detail-tree-view-preference-evidence-2026-10-13.md) |
| P26 | Viewing a subagent shows that subagent's own context and Round in the fixed brief form; moving back restores the main preference | [`17` §5](../../.scratch/model-cost-migration/assets/17-detail-tree-view-preference-evidence-2026-10-13.md) |
| P27 | The one marker line follows the session you are viewing (main ↔ subagent), and viewing never grants write authority | [`18`](../../.scratch/model-cost-migration/assets/18-viewed-state-marker-evidence-2026-10-13.md) |
| P41 | Crossing a peak/off-peak boundary — and the holiday marker on the first holiday period — redraws the block once, with no request issued | [`20` §5.2](../../.scratch/model-cost-migration/assets/20-tui-boundary-timer-evidence-2026-10-13.md) |
| P67 | The approved visual form: season marker, bar bands, `Accrued` segment colours, the `Balance:` row and its warning thresholds in the monetary channel's own view (a token-only or allowance view draws no balance row at all), Codex pacing rows, and the four-step narrow-width degradation | [`20` §5.2–5.3](../../.scratch/model-cost-migration/assets/20-tui-boundary-timer-evidence-2026-10-13.md) |

No screenshot or recording could be produced in the agent's environment (no interactive TUI), so
this round is judged from what you see — that limitation is recorded rather than worked around.

### H2 — a real provider's effect

| promise | what to watch with a real account | prepared material |
| --- | --- | --- |
| P36, P38 | The provider balance reading appears and refreshes under its success TTL in normal use; an unavailable reading is omitted rather than replaced by a cached guess | [`12`](../../.scratch/model-cost-migration/assets/12-deepseek-balance-ttl-evidence-2026-10-13.md) |
| P39, P65 | The 5h and 7d windows come from a real Codex response's own rate-limit headers, each window updating independently; the model list, account call and skip reason | [`13`](../../.scratch/model-cost-migration/assets/13-codex-windows-headers-evidence-2026-10-13.md) |
| P66 | The ratio and remaining-allowance estimate in normal use, against the hand-computed sequence — without consuming quota to manufacture samples; too few samples is an honest "still estimating" | [`14`](../../.scratch/model-cost-migration/assets/14-codex-ratio-estimate-h2-2026-10-13.md) |

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
