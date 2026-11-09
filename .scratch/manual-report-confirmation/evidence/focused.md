# Manual report confirmation focused evidence

- Bun 1.4.4 observed.
- Red: `bun test tests/workflow-chat/manual-report-confirmation.test.ts` before gate implementation: 0 pass / 1 fail. Explicit denial still produced actual POST report body `{body:"Ready",canComplete:true,sessionId:"business-native-session"}`; expected zero report effects.
- Green after gate: same file 1 pass / 0 fail.
- Integrated focused run: `bun test tests/framework/tool-confirmation-adapters.test.ts tests/workflow-chat/manual-report-confirmation.test.ts tests/workflow-chat/node-shared-logic.test.ts`: 32 pass / 0 fail / 119 assertions.
- `bun run typecheck`: passed; authoring check 79 files, 6 declarations, 0 diagnostics.

Controlled external backend/UI responses prove mechanism, not autonomous model business acceptance. Native terminal smoke is separate.
