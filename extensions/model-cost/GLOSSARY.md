# model-cost

Model usage and cost accounting, together with provider balance and allowance tracking. Request, Assistant response, Turn, Round and Agent activity state use the definitions in [the framework glossary](../../framework/GLOSSARY.md).

## Language

**Response accounting boundary（响应计费边界）**:
The point at which an assistant response's reported model usage can be accounted for the corresponding request. It does not wait for tool execution or the end of a Round; a response without reported usage does not establish known zero cost.
_Avoid_: round end, tool completion, final response of a round

**Turn usage / cost（单 Turn 用量／费用）**:
The reported model usage and corresponding request-priced cost attributable to one Turn's assistant response. Tool results used as input to a later model request are included in that later request's reported usage, not separately charged when the tool returns.
_Avoid_: round totals, legacy Turn

**Round totals（轮次累计）**:
The aggregate usage and cost attributed to one framework-defined Round, distinct from a single Turn's usage and from session totals.
_Avoid_: legacy Turn, session totals

**Session totals（会话累计）**:
The aggregate usage and cost attributed to one agent session, distinct from the totals of one Round.
_Avoid_: round totals, provider account balance

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

**Allowance consumption（额度消费）**:
The indication that an accounting scope contains allowance-based consumption, whose contribution to the consumption amount subtotal is zero. It does not mean that the request consumed nothing or that its usage is unknown.
_Avoid_: free request, unknown usage

**No accounting policy（无统计口径）**:
The category of recorded consumption for which this extension has no applicable consumption-amount accounting policy; it covers token-only and hidden modes. It is distinct from missing information under an applicable policy, allowance consumption and confirmed zero cost.
_Avoid_: unknown usage, allowance consumption, free request

**Known subtotal（已知小计）**:
The sum of known contributions within the applicable accounting scope and policy. For consumption amounts, allowance consumption, no accounting policy and unknown amounts contribute zero numerically but retain their distinct meanings; a known subtotal is not necessarily a complete total.
_Avoid_: complete total, zero cost for unknown usage

**Accounting completeness（消费统计完整性）**:
Whether the usage or cost metric has all required accounting information for the requests in its scope. Usage completeness and cost completeness are distinct; an unknown contribution is not a confirmed zero.
_Avoid_: request success, zero consumption

**Selected Round totals（选定轮次累计）**:
The full recorded totals of the Round selected by the current conversation-tree position, rather than a subtotal up to the selected Turn. Selecting a historical Round does not roll back session consumption.
_Avoid_: session totals, branch-path subtotal

**Legacy Turn（旧的 Turn）**:
The old model-cost widget's usage difference between successive native settlement checkpoints. It is neither a single framework-defined Turn nor necessarily the totals of a complete framework-defined Round.
_Avoid_: Turn without the legacy qualifier, round totals
