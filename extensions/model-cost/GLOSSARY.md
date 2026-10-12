# model-cost

Model usage and cost accounting, together with provider balance and allowance tracking. Request, Assistant response, Turn, Round, Agent activity state, Unknown, No measurement policy, Known zero and Metric completeness use the definitions in [the framework glossary](../../framework/GLOSSARY.md); the terms below specialize that vocabulary for consumption accounting.

## Language

**Response accounting boundary（响应计费边界）**:
The point at which an assistant response's reported model usage can be accounted for the corresponding request. It does not wait for tool execution or the end of a Round; a response without reported usage does not establish known zero cost.
_Avoid_: round end, tool completion, final response of a round

**Turn usage / cost（单 Turn 用量／费用）**:
The reported model usage and corresponding request-priced cost attributable to one Turn's assistant response. Tool results used as input to a later model request are included in that later request's reported usage, not separately charged when the tool returns.
_Avoid_: round totals, legacy Turn

**Accounting period（消费统计周期）**:
The scope of active consumption accounting bounded by explicit resets, distinct from the lifetime of an agent session or Round. A period identifies the accounting scope being accumulated; it does not establish that a provider-side account has been identified.
_Avoid_: session lifetime, Round, calendar day, process lifetime

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

**Legacy Turn（旧的 Turn）**:
The old model-cost widget's usage difference between successive native settlement checkpoints. It is neither a single framework-defined Turn nor necessarily the totals of a complete framework-defined Round.
_Avoid_: Turn without the legacy qualifier, round totals
