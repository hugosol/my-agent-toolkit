# DeepSeek model discovery: what `GET /models` and the official docs publish

Researched 2026-10-12 for decision ticket 14 ([`.scratch/model-cost-migration/decision/14-deepseek-model-discovery.md`](../.scratch/model-cost-migration/decision/14-deepseek-model-discovery.md)): whether DeepSeek's first-party model-discovery API can be the source for a centralized, explicitly mapped model catalog and price table. No API key was used and no authenticated request was made; all DeepSeek evidence below is documentation inspection (official pages fetched 2026-10-12), and the one concrete `GET /models` payload is the example DeepSeek publishes in its own API reference — a documented example, not an observed account response. This note does not touch production configuration or prices.

## Conclusion

- `GET /models` is a model-discovery endpoint only. Its documented 200 schema contains **no price, billing, currency, or peak/off-peak field** and no rate-tier classification; the page itself redirects readers to [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing) for the supported model list and prices. Prices live only in documentation, not in the API.
- The documented catalog is two billable models — `deepseek-flash` and `deepseek-v4-pro` — in every official surface checked (intro table, pricing table, rate-limit table, and the `GET /models` example). All current prices in those surfaces are CNY with per-million-token, cache-hit/cache-miss input rates and **peak/off-peak** columns.
- The API does **not** publish a "pro"/"flash" tier taxonomy as data. Those are naming conventions of the current two IDs; no response field carries a family or tier.
- Consequence for centralized maintenance: a live `GET /models` answers *"which model IDs does this account/key see"* and can add capability metadata (context window, modalities, effort levels, per-protocol capabilities) — but it cannot supply prices or the pro/flash price class. A centralized price map must be maintained from the pricing documentation and must decide explicitly how to treat discovered IDs with no price entry (retired aliases, future models, out-of-band IDs).

## The endpoint and its documented contract

Request (from the official reference, EN and zh-CN agree):

```
GET /models
```

- No parameters are documented — no query/filter/pagination and no request body (`Parameters: 0`, `Request Body: 0` in the server-rendered page).
- No auth/security section is rendered on the endpoint page itself. The key requirement comes from the [intro page](https://api-docs.deepseek.com/): `api_key` = "apply for an API key", and its chat example sends `Authorization: Bearer ${DEEPSEEK_API_KEY}` at base URL `https://api.deepseek.com` (Anthropic-format base URL `https://api.deepseek.com/anthropic`).
- The endpoint does require credentials: an unauthenticated `curl https://api.deepseek.com/models` returns `HTTP 401 Authentication Fails (governor)` (reported by the requester 2026-10-12 and treated as ground truth here; the same 401 was not re-run in this environment). So no anonymous listing of model IDs exists, and the full set of IDs a key sees cannot be read without a key.
- The page describes itself as listing "the currently available models"/"列出当前可用的模型", and links to Models & Pricing "for our currently supported models" — the docs already separate model discovery from price discovery in their own words.

### Documented 200 response schema (exhaustive; no price fields)

| Field | Type | Required | Meaning (official wording, abridged) |
| --- | --- | --- | --- |
| `object` | string | yes | Always `list` |
| `data[]` | object[] | yes | The list of model objects |
| `data[].id` | string | yes | Model identifier, referenced in API endpoints |
| `data[].object` | string | yes | Always `model` |
| `data[].owned_by` | string | yes | Organization that owns the model |
| `data[].name` | string | no | Display name, "for use in model pickers and model discovery tools" |
| `data[].context_window` | integer | no | Total token capacity, input + output |
| `data[].max_output_tokens` | integer | no | Server cap on one response (max accepted `max_tokens`) |
| `data[].input_modalities` | string[] | no | `text`, `image` |
| `data[].output_modalities` | string[] | no | `text` |
| `data[].effort` | object | no | Thinking-mode effort levels |
| `data[].effort.supported_levels` | string[] | yes | Values accepted by `reasoning_effort`; `none`/off not included |
| `data[].effort.default_level` | string | no | Server default when unspecified; always one of `supported_levels`; only present when defined |
| `data[].api_capabilities` | object | no | Capabilities per API protocol |
| `data[].api_capabilities.anthropic_messages` | object | no | Capabilities via the Anthropic Messages API |
| `data[].api_capabilities.anthropic_messages.system_prompt_update` | string | yes | `leading-only` or `in-history` (how mid-conversation system prompts are picked up) |

Source: [Lists Models (EN)](https://api-docs.deepseek.com/api/list-models), [获取模型列表 (zh-CN)](https://api-docs.deepseek.com/zh-cn/api/list-models), both fetched 2026-10-12. The zh-CN page renders the same fields with the same required flags.

### The documented example payload (both examples; not a live account)

The official page server-renders two example responses: "Example (from schema)" with placeholder values, and "Example" with concrete values. This is DeepSeek's published example, not a recorded response from an authenticated call.

"Example" as published (exact, both locales, fetched 2026-10-12):

```json
{
  "object": "list",
  "data": [
    {
      "id": "deepseek-flash",
      "object": "model",
      "owned_by": "deepseek",
      "name": "DeepSeek-V4.1-Flash",
      "context_window": 1048576,
      "max_output_tokens": 393216,
      "input_modalities": ["text", "image"],
      "output_modalities": ["text"],
      "effort": { "supported_levels": ["low", "high", "max"], "default_level": "high" },
      "api_capabilities": { "anthropic_messages": { "system_prompt_update": "in-history" } }
    },
    {
      "id": "deepseek-v4-pro",
      "object": "model",
      "owned_by": "deepseek",
      "name": "DeepSeek-V4-Pro",
      "context_window": 1048576,
      "max_output_tokens": 393216,
      "input_modalities": ["text"],
      "output_modalities": ["text"],
      "effort": { "supported_levels": ["low", "high", "max"], "default_level": "high" },
      "api_capabilities": { "anthropic_messages": { "system_prompt_update": "leading-only" } }
    }
  ]
}
```

"Example (from schema)" shows the same shape with placeholders (`"id": "string"`, `"context_window": 0`, `"supported_levels": ["string"]`, `"system_prompt_update": "leading-only"`). Neither example includes any price, currency, billing-period, or tier field — consistent with the schema.

Important limitation of this example: it lists only the two current-generation IDs. It does **not** show the still-accepted legacy names, it carries no timestamp/"as of" marker, and it is a static sample rather than a snapshot of the live list. Whether the live endpoint returns exactly these two entries and no others cannot be established from the docs and was not verified here (no credentials). Treat it as "what DeepSeek chooses to show", not as the account's real model list.

## Documented model IDs and the CNY price table

`GET /models` examples, the intro table, the pricing table, and the rate-limit table all name the same two current IDs, with the official mapping to model versions:

| Model ID (request value) | Model version | Input modalities | Concurrency (account) |
| --- | --- | --- | --- |
| `deepseek-flash` | DeepSeek-V4.1-Flash | text, image | 2500 |
| `deepseek-v4-pro` | DeepSeek-V4-Pro-0813 | text | 500 |

Both: 1M context, max output 384K; thinking and non-thinking modes; JSON output, tool calls, Responses API, Anthropic API, prefix completion supported; FIM non-thinking only. Sources: [Models & Pricing (zh-CN)](https://api-docs.deepseek.com/zh-cn/quick_start/pricing), [Models & Pricing (EN)](https://api-docs.deepseek.com/quick_start/pricing), [Rate Limit & Isolation (zh-CN)](https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit), fetched 2026-10-12.

CNY prices as currently published (per 1M tokens; off-peak is half of peak):

| Rate | `deepseek-flash` | `deepseek-v4-pro` |
| --- | --- | --- |
| Input, cache hit — off-peak / peak | ¥0.02 / ¥0.04 | ¥0.15 / ¥0.30 |
| Input, cache miss — off-peak / peak | ¥1 / ¥2 | ¥4.5 / ¥9.0 |
| Output — off-peak / peak | ¥4 / ¥8 | ¥13.5 / ¥27.0 |

Peak hours per the page: 北京时间 Monday–Friday 9:00–12:00 and 14:00–18:00, excluding Chinese public holidays; everything else (including weekends and holidays in full) is off-peak (EN page: 01:00–04:00 and 06:00–10:00 UTC). The English page shows the same rates in USD. The Peak/Off-peak structure took effect for the V4 family 2026-08-16 UTC ([Change Log](https://api-docs.deepseek.com/updates)), and the current pricing page still presents it — i.e. **peak/off-peak is live in the published first-party price table** as of 2026-10-12.

The same table documents model-ID routing that matters for any explicit map:

> Use `deepseek-flash` as the model name. The legacy names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are still accepted, but the corresponding models have been retired; their requests are served by the DeepSeek-V4.1-Flash model and billed at the Flash price. ([pricing, footnote (1)](https://api-docs.deepseek.com/zh-cn/quick_start/pricing); 同文 EN)

The changelog fixes that at "temporarily routed to V4.1 Flash" and records the V4.1-Flash release and price reduction on 2026-09-10. Earlier generations (`deepseek-chat`, `deepseek-reasoner`, V4 Flash, V4 Flash Vision Exp) were retired or routed; `deepseek-chat`/`deepseek-reasoner` were discontinued 2026-07-24 ([news260424](https://api-docs.deepseek.com/news/news260424), [Change Log](https://api-docs.deepseek.com/updates)). So the set of *accepted* request strings (at least two current IDs + at least two legacy aliases) is broader than the set of *priced SKUs* — and no first-party list states whether the aliases appear in `GET /models`.

## Model discovery vs price discovery vs account availability

| Question | First-party source | What it gives | What it does not give |
| --- | --- | --- | --- |
| Which model IDs can I call? | `GET /models` (documented) + model tables in docs | IDs, display names, context/output caps, modalities, effort levels, per-protocol capability flags | Prices, tiers, account entitlement, deprecation dates |
| What do they cost? | Documentation price table only ([pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)) | CNY (and USD) per-1M-token prices with peak/off-peak, plus legacy-alias billing note | Machine-readable form; no API, no per-account price endpoint documented |
| What does my account see/have? | Not documented as an API. The account surface is platform.deepseek.com (API keys); a balance API (`GET /user/balance`) appears in the docs' API index but was not inspected for this ticket | – | Any model-availability response for a key; no entitlement list |

"Actual account availability" therefore cannot be read from the docs at all: `GET /models` is the only documented API that could reflect it, and no authenticated observation was made here (constraint: no credentials access). The docs' phrase "currently available models" and the ticket's warning are both consistent with the example being illustrative rather than exhaustive.

## Limitations to record for the centralized catalog

1. **No price discovery via API.** No price/currency/tier field exists anywhere in the documented `GET /models` schema, and the docs explicitly defer to the pricing page. Any centralized price map is a maintained artifact, not an API-derived one.
2. **No tier/family classification in data.** "flash"/"pro" appear only in ID names and prose. A mapping table must encode the family explicitly if policy needs it.
3. **Example ≠ live list.** The published example has two entries and no "as of" date; it cannot establish that `deepseek-v4-flash`/`deepseek-v4-flash-vision-exp` (or anything else) do or do not appear in a live response. The aliases remain callable and billed at Flash price regardless.
4. **No discovery metadata about deprecation.** Retirement/routing facts live in the changelog and price-table footnotes; `GET /models` fields cannot express "accepted but retired".
5. **No documented auth/security requirement for the endpoint.** The key header is documented for chat completions; the models page renders no security section, and behavior without a key was not tested.
6. **Docs can be client-rendered.** The request/response "Example" tabs render server-side today (verified in raw HTML fetched 2026-10-12, EN and zh-CN), but the page is a Docusaurus OpenAPI-rendered doc whose right-hand sample panel still shows "Loading…" client-side; local scrapes that do not render may see only the schema example. Anything later inferred from a scraper must be checked against the live official page.
7. **Published prices can change.** DeepSeek reserves the right to change prices and the changelog shows recent repricing (V4 GA 2026-08-16 peak/off-peak; V4.1-Flash reduction 2026-09-10). Historical prices cannot be reconstructed from any API and must never be back-applied to anchored past costs.

## Implications for the explicit model-to-price map (facts only, no decision)

- The two priced IDs (`deepseek-flash`, `deepseek-v4-pro`) are the only first-party priced SKUs documented on 2026-10-12; the legacy aliases accepted by the API bill at the Flash price.
- An explicit map therefore needs at least: two priced current IDs, the legacy aliases and their routing/billing, and a policy for IDs that `GET /models` may return without a price entry. The discovered `id` is the join key between the endpoint's metadata and the documented price table; display `name` must not be used as the key (`name` is optional and human-readable).
- Peak/off-peak (CNY) rates in the ticket's premise are confirmed unchanged in the current first-party table; no discount multiplier or special price is documented for either SKU beyond off-peak = half of peak.

### Cross-check against this repo's current recorded facts

`.scratch/model-cost-migration/assets/current-state.md` (inspected 2026-10-12) records the current experiment inputs: `deepseek/deepseek-v4-pro` under mode `deepseek`, and `opencode-go/deepseek-v4-pro` under `token-only`, with the pure-logic cost probe using peak CNY `{"input":9,"cacheRead":0.3,"output":27}` and off-peak/holiday `{"input":4.5,"cacheRead":0.15,"output":13.5}`. Those rates match the current official `deepseek-v4-pro` table above for a weekday 09:00 Beijing time request. The current-state file explains the "catalog price" is not currently delivered to the framework adapter and remains a delivery gap — i.e. the explicit mapping is the missing piece, while the discovered-ID set is input to it. Nothing in this investigation requires changing that repo state: the two officially priced IDs, the legacy-alias routing, and peak/off-peak CNY rates are all still what the live first-party surfaces publish on 2026-10-12.


## Sources (all fetched 2026-10-12 unless noted)

- [Lists Models — api-docs.deepseek.com/api/list-models](https://api-docs.deepseek.com/api/list-models) (EN) and [zh-CN variant](https://api-docs.deepseek.com/zh-cn/api/list-models): schema, both example payloads, "currently available models", pricing-page pointer, no parameters/security sections.
- [Models & Pricing — zh-CN](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) / [EN](https://api-docs.deepseek.com/quick_start/pricing): model IDs and versions, CNY/USD peak/off-peak rates, alias footnote, deduction rules.
- [Change Log — api-docs.deepseek.com/updates](https://api-docs.deepseek.com/updates): V4.1-Flash release + price reduction (2026-09-10); legacy aliases routed to V4.1 Flash; V4-Pro GA and peak/off-peak introduction (2026-08-16); retirements.
- [DeepSeek V4 Preview news](https://api-docs.deepseek.com/news/news260424): initial V4-Pro/V4-Flash IDs; `deepseek-chat`/`deepseek-reasoner` discontinuation date.
- [Your First API Call](https://api-docs.deepseek.com/): base URLs, api_key requirement, `Authorization: Bearer` chat example.
- [Rate Limit & Isolation — zh-CN](https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit): per-model concurrency for the same two IDs.
- [DeepSeek Harness — Configure models](https://deepseek-harness.github.io/deepseek-harness/en/guide/providers) (unofficial wrapper for first-party harness docs, fetched 2026-10-12): harness's own discovery sends OpenAI-compatible `GET /models`, reads a `data` array or `models` object, warns it is "a convenience rather than a guarantee", and notes built-in providers are answered from the installed catalog instead of the endpoint — external corroboration that `/models` listing formats are not a complete catalog contract.
- Cross-check only (not a source of record): unofficial markdown mirror `thevibeworks/deepseek-docs` `content/en/api/list-models.md` (fetched 2026-09-29 per its frontmatter) matches the schema and example captured from the live pages on 2026-10-12; its README assertion about peak-hour pricing being dropped 2026-08-08 is **contradicted** by the live pricing page and changelog and was not used.

### Not verified here

- Any authenticated `GET /models` response, including whether legacy aliases appear in it and whether the live list currently equals the published example (no credentials were used).
- Behavior of `GET /models` without credentials.
- Any account-specific model entitlement beyond what `platform.deepseek.com` exposes (not inspected).
- Whether DeepSeek documents a machine-readable spec or a changelog feed for models/prices: the docs site serves its single-page HTML for unknown asset paths (`/openapi.yaml`, `/llms.txt`, etc. all return the same HTML shell), and no official spec URL was found.
