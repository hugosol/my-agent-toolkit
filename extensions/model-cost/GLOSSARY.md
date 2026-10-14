# model-cost

Model usage and cost accounting, together with provider balance and allowance tracking. Request, Assistant response, Turn, Round, Agent activity state, Unknown, No measurement policy, Known zero and Metric completeness use the definitions in [the framework glossary](../../framework/GLOSSARY.md); the terms below specialize that vocabulary for consumption accounting.

## Language

**Response accounting boundary（响应计费边界）**:
The point at which an assistant response's reported model usage can be accounted for the corresponding request. It does not wait for tool execution or the end of a Round; a response without reported usage does not establish known zero cost.
_Avoid_: round end, tool completion, final response of a round

**Turn usage / cost（单 Turn 用量／费用）**:
The reported model usage and corresponding request-priced cost attributable to one Turn's assistant response. Tool results used as input to a later model request are included in that later request's reported usage, not separately charged when the tool returns.
_Avoid_: round totals, legacy Turn

**Request price anchor（请求锚价）**:
The provider, the exact model, the start instant, the accounting period, the holiday fact and the applicable price, currency and unit a request fixed when it really began, and by which that request's cost is charged however the model, the season or the maintained price data changes afterwards. It is not the price holding when the response ended, and it is never re-derived from an existing accumulated amount.
_Avoid_: current price, end-time price, re-priced cost

**Accounting period（消费统计周期）**:
The scope of active consumption accounting bounded by explicit resets, distinct from the lifetime of an agent session or Round. A period identifies the accounting scope being accumulated; it does not establish that a provider-side account has been identified. A reset mints a fresh generation; a root that holds no document yet is in one such generation shared by every instance that starts before the first write, so the first write names the period the others already accumulate in rather than replacing it.
_Avoid_: session lifetime, Round, calendar day, process lifetime

**Accounting reset（统计周期重置）**:
The operation that closes the current accounting period and opens the next one: the whole activity document is archived under a fresh identifier and replaced — across every harness, every provider and every session — in one commit. The closing period's own end instant is the opened period's start, an ordinary `clear` opens it with `holiday` false and a first `holiday` opens it with `holiday` true, and a period that is already a holiday period is not reset again. It is the one explicit exception to a period never being replaced, it is performed only when the entry is its own DeepSeek one and is reliably idle with no snapshot of its own still publishing, and it collects nothing that was not already saved: unsaved and in-flight consumption is dropped rather than forced out.
_Avoid_: holiday toggle, clear-and-then-set, per-session reset, archive query, queued or deferred reset

**Consumption archive（消费归档）**:
The whole activity document one accounting reset closed, written inside the storage root's `archives/` directory under a fresh random name together with the instant the period ended (`end`) and — when that instant's own boundary balance reading produced one — the DeepSeek balance it ended at (`end_bal`). It is written *before* the new activity is published, from the document the coordinated scope itself read; an existing archive is never overwritten, an earlier one is never touched by a later reset, and nothing reads an archive back into the accounting.
_Avoid_: backup, ledger, per-account archive, resumable snapshot, archive UI

**Round totals（轮次累计）**:
The aggregate usage and cost attributed to one framework-defined Round within the applicable accounting period. It is distinct from the sum of all Rounds in a session and from a single Turn's usage.
_Avoid_: legacy Turn, session totals, whole-period totals

**Session totals（会话累计）**:
The aggregate usage and cost attributed to one agent session within the applicable accounting period, spanning its Rounds in that period. It is distinct from the session's lifetime consumption across periods.
_Avoid_: round totals, provider account balance, lifetime session totals

**Direct session totals（会话自身累计）**:
The usage and cost of requests issued directly by one agent session, excluding requests issued by its subagents.
_Avoid_: inclusive session totals, owner totals

**Inclusive session totals（含子代理的会话累计）**:
The aggregate usage and cost of a session and its descendant subagents, with each request represented once. It is an aggregation view, not additional consumption.
_Avoid_: direct session totals, extra billed cost

**Provider account（provider 计费／额度账户）**:
The provider-side identity to which billed usage, balance and allowance belong, distinct from a framework Owner or an agent session.
_Avoid_: owner, process, session account

**Consumption channel（消费渠道）**:
The accounting policy class of model consumption: monetary-billed, allowance-based or without an accounting policy. A channel is distinct from a provider name, account identity or model.
_Avoid_: provider, account, model

**Monetary-billed channel（计费渠道）**:
A consumption channel whose known request-priced monetary costs contribute to consumption amount totals. DeepSeek is the currently identified monetary-billed channel.
_Avoid_: allowance-based channel, confirmed provider debit

**Allowance-based channel（额度渠道）**:
A consumption channel tracked by provider allowance rather than included in consumption amount totals. Codex belongs to this channel; its model-priced dollar estimate is reference information, not an amount-total contribution.
_Avoid_: monetary-billed channel, zero consumption

**Reference cost（参考费用）**:
A model-priced monetary estimate retained for comparison, distinct from the consumption amount contributed under the channel accounting policy or a confirmed provider debit. Codex dollar estimates are reference costs.
_Avoid_: consumption amount total, actual subscription charge

**Fee composition reference ratio（费用结构参考占比）**:
The proportions of a specified model’s input, output and cache usage valued with its relative pricing weights, used to compare their monetary significance. It is distinct from an unweighted token ratio and from the actual historical expenditure breakdown across changing price periods.
_Avoid_: token ratio, actual expenditure breakdown, provider allowance percentage

**Allowance consumption（额度消费）**:
The indication that an accounting scope contains allowance-based consumption, whose contribution to the consumption amount subtotal is zero. It does not mean that the request consumed nothing or that its usage is unknown.
_Avoid_: free request, unknown usage

**No accounting policy（无统计口径）**:
The consumption-amount specialization of the framework’s [No measurement policy](../../framework/GLOSSARY.md#facts-and-measurement-semantics): this extension has no applicable monetary accounting policy for token-only and hidden modes. It is distinct from unknown amounts, allowance consumption and confirmed zero cost.
_Avoid_: unknown usage, allowance consumption, free request

**Unknown usage（未知用量）**:
Model usage for which reliable reported quantities are unavailable. An absent report is distinct from confirmed zero usage and from whether a monetary accounting policy applies.
_Avoid_: zero usage, no accounting policy, request failure

**Unknown amount（未知金额）**:
A consumption amount that cannot be determined because information required by an applicable monetary accounting policy is unavailable. Usage may be known while the amount is unknown.
_Avoid_: no accounting policy, allowance consumption, confirmed zero cost

**Confirmed zero cost（确认零费用）**:
A zero consumption amount established by sufficient information under an applicable monetary accounting policy. It is distinct from unknown amounts and from channels excluded from monetary totals.
_Avoid_: missing price, unknown amount, allowance consumption, no accounting policy

**Known subtotal（已知小计）**:
The consumption-accounting specialization of the framework’s [Known subtotal](../../framework/GLOSSARY.md#facts-and-measurement-semantics), summing only known monetary contributions under the applicable policy. Unknown amounts, allowance consumption and no accounting policy add no monetary amount, but none means a confirmed free request or establishes a complete total.
_Avoid_: complete total, zero cost for unknown usage

**Accounting completeness（消费统计完整性）**:
The consumption-accounting specialization of the framework’s [Metric completeness](../../framework/GLOSSARY.md#facts-and-measurement-semantics), evaluated independently for usage and cost within the accounting scope. Known usage does not by itself establish a known amount or confirmed zero cost.
_Avoid_: request success, zero consumption

**Selected Round totals（选定轮次累计）**:
The totals attributable to the Round identified by a conversation-tree position, when that Round can be identified and its measurements are available. This historical-selection concept is distinct from current or most-recent Round totals; navigation alone does not establish data availability or change session consumption.
_Avoid_: session totals, branch-path subtotal

**Display budget（显示预算）**:
The fixed context figure one mode's widget bar and its warning compare the host's reported context usage against: 450,000 tokens for the monetary and token-only channels (the official DeepSeek ids and the OpenCode Go ids alike) and 272,000 for the allowance channel, with no bar at all for a mode this extension does not display. It is display data alone — it is not the host's context window, it is not configurable, and it never limits a request, an output, the context window or compaction.
_Avoid_: context window, compaction threshold, request limit, configurable budget

**Legacy Turn（旧的 Turn）**:
The old model-cost widget's usage difference between successive native settlement checkpoints. It is neither a single framework-defined Turn nor necessarily the totals of a complete framework-defined Round.
_Avoid_: Turn without the legacy qualifier, round totals

**Storage root（存储根）**:
The one directory this extension's data lives under, named by the extension's own `storageDir` entry in `config.yaml`: the active consumption document, the independent Codex estimate and this extension's archives all sit inside it, and no directory the configuration does not name is ever written. The entry is read and validated before the extension is bound, its `~/` means the OMP home inside the operating system user's home (this field alone), and any other relative value is the directory the config file itself lives in. A changed value selects another store with the next process; nothing migrates, copies or merges what an earlier value left behind.
_Avoid_: per-file path configuration, harness data directory, working directory, user home (the field's `~/` is the OMP home inside it)

**Active consumption document（活动消费文档）**:
The one document inside the storage root, `consumption.json`, holding the current accounting period and each session's own record within it. It is written only through the framework's coordinated read-modify-publish and only by the session whose record is being saved; a document that cannot be read or is not this schema is never overwritten by a guess.
_Avoid_: archive, per-session file, account partition, consumption ledger

**Provider balance reading（provider 余额读数）**:
The DeepSeek account balance this process last had answered, with the instant it was accepted, held once per process as a provider-level fact rather than per session, model or view. The CLI asks it once while the instance initializes — that instance's own prefetch, which is what makes a reading or its absence available before the first model request, and which a host that cannot authenticate the provider is not asked at all: nothing is sent and no failure is stated for a provider the process has not used. A reading keeps a *success TTL* (default 30,000ms, stated by the extension's own `balanceTtlMs`): after that prefetch only a settled request of the reading's own provider checks it, and only an expired reading with no query already out begins one. A query that fails — a settled request's missing host access, a transport or timeout failure, a body that is not the provider's balance — is not a reading of zero: the last reading and its instant stay untouched, no cooldown or retry is armed, and the next settled request checks again. Every trigger while one query is out joins it, and nothing is re-issued when it completes; the TTL expiring on its own queries nothing. Only the monetary-billed channel's display draws it: a token-only model has no official balance at all and the allowance channel's own account fact is its two windows, so a reading this process holds is not shown while either of those is being viewed — hiding it is a display decision, and the reading, its TTL and its in-flight query stay exactly as they were.
_Avoid_: zero balance on failure, session balance, account partition, periodic poll, cached first credential

**Boundary balance reading（边界余额读数）**:
The DeepSeek balance an accounting reset reads once for itself — outside the file coordination and before the reset — and applies to both sides of the boundary: the closing period's `end_bal` and the opening period's `start_bal`. It is that one attempt's own result rather than the reading the process already holds: it is not retried, its success TTL plays no part, and an attempt that failed, timed out or answered no CNY total is omitted from both documents instead of being filled in with the held value or zero.
_Avoid_: cached balance, TTL refresh, retried query, zero on failure, balance difference as consumption

**Storage baseline（存储基线）**:
The document state one instance holds as valid: its accounting period and the session records it last read from the file — the document a normal initialization loaded, or the document a refused snapshot was decided against, which is then what the next snapshot is compared to. An instance without a usable baseline — an unreadable, unparseable or unrecognized document — pauses its consumption accounting and saving rather than starting from zero, and only a later normal initialization reads the file again. A root holding no document at all is not an unusable baseline; it is a fresh period. A session snapshot that did not land is not part of the baseline: it is reported and dropped, and the affected session's own record is the baseline's again.
_Avoid_: empty statistics, zeroed totals, in-memory fallback

**Allowance window（额度窗口）**:
One of the two Codex allowances this extension tracks, told apart by the *length it reports* — within ±5% of five hours, or of seven days — and never by which position (`primary`/`secondary`) carried it. A window the backend reports under the other position is still the window its length says it is. It is a fact of the provider account, not of a session or a model.
_Avoid_: primary window, secondary window, fixed meter slot

**Allowance window reading（额度窗口读数）**:
The used percentage one window was last reported at, with the reset instant that report stated (absent when none was usable) and the instant the reading was accepted. A window is updated on its own: a batch that carries only one window updates only that one, and the window it did not carry keeps its value *and* the instant it was accepted at. A window no source has reported is unavailable, never zero.
_Avoid_: zero on missing, blanked window, re-timed reading, merged windows

**Allowance window source（额度窗口来源）**:
The two things that report the windows, read by one parser: the Codex account API, asked once when the instance initializes (the extension's own address, headers and the shared configuration's named `codex` proxy, with a 10,000ms business budget), and the `x-codex-*` rate-limit headers every Codex response carries, read as each Turn's facts arrive. At runtime the headers are the only source: there is no API TTL, no fallback for a missing window, no polling and no extra query on a switch. A batch of headers that identifies no window is not an update and notifies no reader.
_Avoid_: runtime API refresh, usage-driven allowance query, position-based source

**Reset instant state（重置时刻状态）**:
How one window's reported reset instant reads at the moment it is read: `unknown` when the report stated none usable, `expired` when it is already past, `invalid` when it lies further ahead than the window itself lasts, and `valid` only inside that. It is a read-time reading of the instant the window already carries — the reported instant is never rewritten, clamped or dropped — and two sources are never ordered against each other to decide it.
_Avoid_: rewritten reset, absolute source ordering, reset as a stored state

**Codex ratio measurement（Codex 比例测量）**:
The learned relationship between the two allowance windows: how many five-hour quotas one weekly quota amounts to, taken from the *paired* used percentages of one report — both windows as that one report stated them — and never from the windows the process holds after merging it, which may pair a stale five-hour value with a fresh weekly one. A pair anchors a baseline and yields no number; a later pair yields one only when the five-hour window moved up by at least 50 points, both windows moved up, and neither is saturated. A known ratio is never withdrawn, and a baseline is trusted only for the five-hour window it anchors. The rendering beside the weekly line is `left≈N.N×5h · ratio≈R.R`, where `left` is the unconsumed weekly share at the displayed percentage times the ratio, and `estimating…` while no sample exists yet.
_Avoid_: ratio of the merged windows, hardcoded plan share, elapsed-time share, token ratio, left as a stored value

**Codex estimate document（Codex 估计文档）**:
The independent `codex-usage-estimate.json` inside the storage root: the baseline the measurement anchors at (each window's percentage and reset instant, and the instant it was captured) and the last qualifying ratio, or `null` before one exists. Written only through the framework's coordinated read-modify-publish, at once for a baseline and at most once a minute for a ratio refinement, merged by the baseline's capture instant so a newer document is never replaced, and never cleared by a consumption period reset. A document that is not this shape — including a previous shape — reads as a first run rather than being migrated.
_Avoid_: account-partitioned estimate, estimate inside the consumption document, ratio ledger, schema version

**Entry display preference（入口展示偏好）**:
Which form one entry's usage widget is drawn in — `brief` or `detail` — held in that process's memory alone and flipped by `/budget detail`. It belongs to the entry rather than to a session, a model, a viewed target or an account: an ordinary model, session, tree or view change keeps it, a restart or a reload answers `brief` again, nothing on the storage root holds it, and neither a second entry nor a subagent inherits it. The flip is immediate — it consults no provider, no idle fact, no pending save and no UI — while the *form a view is drawn in* also depends on the target: a subagent's own display answers the brief whatever the entry's preference is.
_Avoid_: persisted preference, per-session display setting, State field, subagent inheritance, provider-gated or idle-gated toggle

**Agent tree（代理树）**:
The detail form's static listing of one main session's own consumption: the root session by its latest name, that session's own provider/model pairs one row each, and one row per descendant session's own accumulation, each row read with its distance from the root and drawn indented by its direct parent. A model row is a *model* and never an agent node; a descendant's row is that session's own consumption and never an inclusive figure, so no row repeats another's consumption and no aggregate node, expansion or per-agent query is added. It is a read-only view over the relations and own accumulations the instance already holds, together with each descendant session's own current session context reading when that session's own binding reported one — the root's own row never carries one, because the budget bar is where the session being displayed reads its own context.
_Avoid_: inclusive or subtree total node, expandable tree, per-subagent query command, owner-axis session tree

**Session context reading（会话上下文读数）**:
One session's own current context usage as that session's own binding last reported it through the host's public `getContextUsage()`, together with the model the reading was taken on: the tokens its conversation holds. It is a reading of the session's live conversation rather than a consumption figure, it belongs to the session that reported it rather than to the process or to the viewed target, and it is never written to the storage root or derived from the consumption document. The detail form reads it against that model's channel's [display budget](#display-budget显示预算) — the same fixed figure the widget bar uses, never the host's reported context window — and writes it as `percent (tokens/budget)`; a mode with no budget draws no field even when a reading exists. A session no binding has reported reads as nothing rather than as a zero, a parked or ended session keeps the last reading it reported, and the detail form draws one only on a descendant session's own row.
_Avoid_: consumption amount, session total, viewed-session context bar, persisted context, process-wide context, inclusive subtree context, host context window

**Season boundary wait（峰谷边界等待）**:
The one one-shot wait a CLI UI holds for the next instant its pricing season changes: the instant to wait for is read from the period's own schedule when the wait is armed and read again after every firing, the redraw it triggers re-reads whatever the host is displaying at that moment, and it issues no request, writes no file and changes no accounting. It belongs to the UI instance rather than to a session, a model or a viewed target — a target switch, a tree move or a change of entry form neither cancels nor rebuilds it, a subagent arms none of its own, a session without a UI holds none at all, and disposing the UI cancels the wait. The period's own endpoint is inclusive, so a boundary that has just passed is waited out rather than replayed: a process that was asleep or blocked reads the season as it is now and arms the next boundary the schedule states.
_Avoid_: per-session timer, polling interval, render side effect, replay of a missed boundary, promise of an exact-to-the-millisecond flip

**Accrued bar（Accrued 分段条）**:
The per-session drawing of one accounting period's own accrued CNY cost, on the monetary channel's account row: up to twenty yuan it is drawn in eighth-blocks worth five cents each — so a small period still has a visible shape — and past twenty yuan in whole blocks worth one yuan each, where a session that never reached a yuan carries no segment rather than an invisible sliver. Segments follow one fixed eight-colour cycle in the document's own session order, each session keeping the colour its position gives it, a session whose own cost is nothing carries no segment at all, and either form is capped in columns. It is the period's consumption rather than the displayed session's, and it is drawn the same for every target of that channel.
_Avoid_: session-exclusive accrual, lifetime cumulative total, bar of the displayed session only, palette colour chosen per redraw

**Widget drawing form（widget 绘制形态）**:
The form a host draws the extension's widget in, as the host itself decides it: `component`, where the host asks the widget for its lines at its own width and with its own theme, or `lines`, where it takes plain text with no colour token and no width — the headless RPC host is the latter, as is a session with no UI. The extension's own assembly reads it from whether its process's stdout is a terminal; which of the two a CLI is is never shared logic's decision, and only the drawing differs: every figure, threshold, narrower form and word comes from the same read-only display result either way.
_Avoid_: colour codes inside shared logic, per-host business rules, the drawing width as an extension policy
