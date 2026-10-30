# Host patches — one-off development fault injection

Historical execution observations extracted from the permanent host-patch READMEs. These are not newly run checks. Reproduction commands and test coverage remain in the permanent documentation.

## Codex response boundary

Source: [patch README](../../../host-patches/omp-18.5.0-codex-response-boundary/README.md).

Fault injection (used once while developing, not part of the suite): running the smoke's first case
against the **unpatched baseline** install made it fail on `hasHttpFacts` (expected `true`, received
`false`), and the same expectation passes on the frozen artifact — so the assertion is sensitive to
the patch and not to the host version.

## Viewed session outlet

Source: [patch README](../../../host-patches/omp-18.5.0-viewed-session/README.md).

Fault injection (used once while developing the tests, not part of the suite): disabling the
fact-change watch in a scratch copy of the artifact's module dropped the delivered changes from 1 to
0 and restoring it brought the delivery back, so the runs above fail when the outlet stops working.
