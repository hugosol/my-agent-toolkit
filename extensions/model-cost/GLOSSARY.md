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

**Legacy Turn（旧的 Turn）**:
The old model-cost widget's usage difference between successive native settlement checkpoints. It is neither a single framework-defined Turn nor necessarily the totals of a complete framework-defined Round.
_Avoid_: Turn without the legacy qualifier, round totals
