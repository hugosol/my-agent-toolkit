# Missing native identity regression found during integration

A direct smoke invocation of the real report tool with delivery.sessionId="" returned `{sent:false,saved:false,reason:"cancelled"}`, isError=false. No HTTP occurred. Existing `tests/harness-dock/role-missing-identity.test.ts` requires the original recognizable session-unavailable error rather than treating absence of identity as user cancellation.

Cause: the preflight checks the combined Session lifetime signal before WorkflowRequests can validate native identity. An absent Session deliberately yields an aborted interaction signal. Planned minimal correction: preflight the caller's explicit cancellation signal only; allow the existing request/identity validation to report session-unavailable. Keep the combined signal throughout policy query, UI and report send.

Source changes deferred while the current serial integration run holds the verification window; retain that run's result.
