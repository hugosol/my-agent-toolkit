# Approved manual report confirmation

User confirmed implementation after Q1–Q7.

- Only frozen execution report_policy=manual requires native explicit user confirmation inside report before report HTTP side effects. auto remains unchanged. No model-supplied policy or confirmation flag.
- Present exact body, can_complete and output addresses. Freeze payload before awaiting. Each invocation/content needs its own approval; business approval and natural-language responses are not authorization.
- Toolkit deployment configuration controls confirmation timeout, default 20000ms. Model cannot alter it. Count from UI presentation.
- Deny/close/cancel/timeout/unavailable UI/error/late approval: do not send. Return not sent, do not retry or replay, instruct model to await renewed user request. No cross-call lockout.
- Preserve uncertain save outcome after report HTTP begins.
- Guarantee report tool only; no backend approval tokens or direct HTTP bypass protection.
- Approved verification seam: report tool invocation, native confirmation interaction, externally observed report HTTP effects. Both Pi and OMP must support it. Existing related tests remain applicable; factual lookup of frozen policy must not infer from model text.

Implementation: reuse toolkit deployment config (`reportConfirmationTimeoutMs`) and optional public tool-delivery `confirm` capability, implemented by both native adapters. The existing backend exposes policies only in general Run reads; no Session-resolved query existed. Add read-only POST `/api/workflow/node/context` using the exact report `node_run` resolver, returning frozen `reportPolicy` plus run/node/execution identity. This avoids client-side identity reconstruction and chooses the parent execution for nested outward reporting, including retained executions. Lookup errors/unknown policy fail closed; backend deserialization alone handles historical auto default. Backend report authorization remains unchanged. Keep external business acceptance and historical failed runs distinct from controlled mechanism checks.
