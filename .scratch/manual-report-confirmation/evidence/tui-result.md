# Native terminal smoke

`bun .scratch/manual-report-confirmation/tui-smoke.ts` completed successfully after correcting smoke-only prerequisites.

Actual native TUIs: isolated installed OMP 18.5.0 and Pi 1.5.0, Bun.Terminal 140x55, local controlled provider and controlled HTTP backend. Production toolkit auto entrypoints, framework adapters, policy query and report serialization were exercised. This is mechanism evidence, not Luna business acceptance or real Herdr pane acceptance.

Six cases passed: each host deny / approve / timeout. Before choice no report HTTP occurred. Deny and timeout produced zero reports. Explicit Enter on visible Yes produced exactly one report with unchanged displayed body, canComplete=false and output address. Default-configured approve/deny windows visibly displayed 20s; timeout cases used toolkit configuration 2000ms to prove configurable waiting.

Raw recordings, visible preview/final screens, actual provider requests and report effects: `tui-final/`.

Earlier smoke attempts preserved in `tui/` and `tui-configured/`: OMP onboarding blocked startup, default Pi discovery absent; after declaring isolated OMP startup.setupWizard=false and installed Pi CLI, auxiliary title requests consumed the initial scripted report response. Responder corrected to select actual report-capable model requests; `tui-tool-request/` proves the narrowed OMP denial. No product behavior was weakened to resolve fixture setup.
