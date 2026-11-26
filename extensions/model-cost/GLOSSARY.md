# model-cost

Model usage and cost accounting, together with provider balance and allowance tracking. Request, Assistant response, Turn, Round, Agent activity state, Unknown, No measurement policy, Known zero and Metric completeness use the definitions in [the framework glossary](../../framework/GLOSSARY.md); the terms below specialize that vocabulary for consumption accounting.

Operational behavior, defaults, and display rules are in the [extension README](README.md).

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
The scope over which consumption accumulates between explicit resets. It is independent of a session's lifetime and of provider account identity.
_Avoid_: session lifetime, Round, calendar day, process lifetime

**Accounting reset（统计周期重置）**:
The operation that closes one accounting period and opens the next for every session in the same storage root. It archives the saved period, not unsaved work.
_Avoid_: holiday toggle, clear-and-then-set, per-session reset, archive query, queued or deferred reset

**Consumption archive（消费归档）**:
The final saved consumption document of a closed period, together with its end instant and any boundary balance reading. An archive is not an active store.
_Avoid_: backup, ledger, per-account archive, resumable snapshot, archive UI

**Round totals（轮次累计）**:
The aggregate usage and cost attributed to one framework-defined Round within the applicable accounting period. It is distinct from the sum of all Rounds in a session and from a single Turn's usage.
_Avoid_: legacy Turn, session totals, whole-period totals

**Session totals（会话累计）**:
The aggregate usage and cost attributed to one agent session within the applicable accounting period, spanning its Rounds in that period. It is distinct from the session's lifetime consumption across periods.
_Avoid_: round totals, provider account balance, lifetime session totals

**Session span（会话跨度）**:
The wall-clock interval from a main session's first user input in the accounting period to its latest observed Turn end or receipt of a terminal subagent result. It includes idle time, but does not sum subagent runtime.
_Avoid_: execution time, model latency, accounting period duration, summed agent time

**Subagent runtime（子代理运行耗时）**:
One subagent session's accumulated working time in the current period, including model work, tools, and delegated-result waits, but excluding idle gaps. A Round whose end was not observed contributes no duration, so a known subtotal can be incomplete.
_Avoid_: session span, exact execution duration, last execution duration, summed progress readings

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

<a id="display-budget显示预算"></a>

**Display budget（显示预算）**:
The channel-specific reference value against which the widget displays context usage. It does not limit requests, outputs, or compaction.
_Avoid_: context window, compaction threshold, request limit, configurable budget

**Legacy Turn（旧的 Turn）**:
The old model-cost widget's usage difference between successive native settlement checkpoints. It is neither a single framework-defined Turn nor necessarily the totals of a complete framework-defined Round.
_Avoid_: Turn without the legacy qualifier, round totals

**Storage root（存储根）**:
The shared store for the active consumption document, the independent Codex estimate, and closed-period archives.
_Avoid_: per-file store, account partition

**Active consumption document（活动消费文档）**:
The saved record of the current accounting period and the direct consumption of each session in it.
_Avoid_: archive, per-session file, account partition, consumption ledger

**Provider balance reading（provider 余额读数）**:
The last reported DeepSeek account balance and the instant the process accepted it. It is an account fact, not a session, model, or view fact; an unavailable reading is not zero.
_Avoid_: zero balance on failure, session balance, account partition, periodic poll, cached first credential

**Boundary balance reading（边界余额读数）**:
The DeepSeek balance reported specifically for an accounting reset, shared by the closing and opening periods. It is independent of the last balance held for display.
_Avoid_: cached balance, TTL refresh, retried query, zero on failure, balance difference as consumption

**Storage baseline（存储基线）**:
The last accepted accounting period and saved session records that an instance uses as its basis. The baseline excludes local changes that have not been committed.
_Avoid_: empty statistics, zeroed totals, in-memory fallback

<a id="read-only-synchronization只读同步"></a>

**Read-only synchronization（只读同步）**:
Adoption of a shared on-disk consumption document as the storage baseline, without saving anything. A [consumption commit notice](#consumption-commit-notice消费提交提示) signals that committed records may have changed.
_Avoid_: reload, re-initialization, forced save, write-on-refresh, polling the document, adopting an unsaved accumulation

<a id="consumption-commit-notice消费提交提示"></a>

**Consumption commit notice（消费提交提示）**:
A confirmed save count from the session's own process, not a transfer of accounting data or write authority. The owner can use it to trigger [read-only synchronization](#read-only-synchronization只读同步).
_Avoid_: consumption figure carried by the notice, owner-side commit, remote write path, record of the document, Round or Turn replay, polling, forced save, init-on-notice

**Allowance window（额度窗口）**:
One of the two Codex account allowances, identified by its reported duration rather than its position in a reply. It belongs to the provider account, not to a session or model.
_Avoid_: primary window, secondary window, fixed meter slot

**Allowance window reading（额度窗口读数）**:
The used percentage one window was last reported at, with the reset instant that report stated (absent when none was usable) and the instant the reading was accepted. A window is updated on its own: a batch that carries only one window updates only that one, and the window it did not carry keeps its value *and* the instant it was accepted at. A window no source has reported is unavailable, never zero.
_Avoid_: zero on missing, blanked window, re-timed reading, merged windows

**Allowance window source（额度窗口来源）**:
The Codex account API that reports the provider account's allowance windows. An allowance window source is distinct from the response usage used for request accounting and from the timing of an allowance query.
_Avoid_: response rate-limit headers, response usage, query trigger, position-based source

**Reset instant state（重置时刻状态）**:
How one window's reported reset instant reads at the moment it is read: `unknown` when the report stated none usable, `expired` when it is already past, `invalid` when it lies further ahead than the window itself lasts, and `valid` only inside that. It is a read-time reading of the instant the window already carries — the reported instant is never rewritten, clamped or dropped — and two sources are never ordered against each other to decide it.
_Avoid_: rewritten reset, absolute source ordering, reset as a stored state

**Codex ratio measurement（Codex 比例测量）**:
The estimated number of five-hour quotas in one weekly quota, measured from paired usage percentages in the same reports. The ratio does not combine windows last reported at different times.
_Avoid_: ratio of the merged windows, hardcoded plan share, elapsed-time share, token ratio, left as a stored value

**Codex estimate document（Codex 估计文档）**:
The independent record of the baseline pair and the last qualifying Codex ratio, if one exists. It does not belong to an accounting period.
_Avoid_: account-partitioned estimate, estimate inside the consumption document, ratio ledger, schema version

**Entry display preference（入口展示偏好）**:
The entry's choice between brief and detail in its main view. It belongs to the entry, not to a session, model, viewed target, or account.
_Avoid_: persisted preference, per-session display setting, State field, subagent inheritance, provider-gated or idle-gated toggle

**Startup snapshot（启动快照）**:
The model and effective thinking level reliably reported when one actual session first began. The snapshot excludes configured intent and is not rewritten when the session changes model or thinking level.
_Avoid_: current model and level, configured intent, startup history, per-execution startup

**Agent tree（代理树）**:
The read-only detail view of a main session and its descendants. It places each session under its direct parent once and lists direct, not inclusive, consumption; the main session's model rows are not agent nodes.
_Avoid_: inclusive or subtree total node, expandable tree, per-subagent query command, owner-axis session tree, cached share on the subagent list

**Session context reading（会话上下文读数）**:
The most recent token count and model observed for one session's live conversation. It is not historical consumption, and the [display budget](#display-budget显示预算) does not change the reading.
_Avoid_: consumption amount, session total, viewed-session context bar, persisted context, process-wide context, inclusive subtree context, host context window, extension-owned collection

**Accrued bar（Accrued 分段条）**:
The account row's display of accrued CNY cost for the whole accounting period, with a segment for each contributing session. It covers the shared store, not only the viewed session or its harness.
_Avoid_: session-exclusive accrual, lifetime cumulative total, this-harness-only accrual
