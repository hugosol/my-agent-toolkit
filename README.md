# my-agent-toolkit

Shared semantic-extension framework plus its `codebase-tools` and `connect-bot` extensions,
deployed into the `oh-my-pi` (`omp`) harness. The framework lives once under
[`framework/`](framework), with native capability mappings under sibling [`adapters/`](adapters).
Extensions import the shared framework source directly; `omp` discovers the thin
entrypoints under [`entrypoints/omp/`](entrypoints/omp), which in turn use the implementations under
[`extensions/`](extensions). The architecture decision is
[ADR 0002](docs/adr/0002-semantic-extension-framework.md).

The supported harness is one **exact** version combination, not a range:
`@oh-my-pi/pi-coding-agent@18.5.0` + Windows x64 + Bun 1.4.2. The record, its evidence and the
upgrade rules live in
[`framework/docs/harness-support.md`](framework/docs/harness-support.md).

## Quick start

```bash
bun install                 # once
bun run typecheck
bun run test:framework      # framework capabilities C1–C15 (the upgrade alarm)
bun run test:codebase-tools # extension behavior (permanent)
bun run test:dock        # the dock and the fixed baseline record
```

The suites that drive a real session materialise the isolated exact install of the supported
version into the gitignored `.cache/omp-baseline/18.5.0` on first run and reuse it afterwards.
Every run uses a temporary agent state directory, so the default global install, the formal
configuration and any running agent are untouched. `bun run test` runs all three suites.

## Contexts

This repository is a multi-context project: the framework and each extension own their own domain
vocabulary and operator documentation. [`GLOSSARY-MAP.md`](GLOSSARY-MAP.md) points at each context's
glossary.

| Context | Where | Docs |
| --- | --- | --- |
| Semantic extension framework | [`framework/`](framework) | [`framework/README.md`](framework/README.md) · [`framework/GLOSSARY.md`](framework/GLOSSARY.md) |
| connect-bot | [`extensions/connect-bot/`](extensions/connect-bot) | [`extensions/connect-bot/README.md`](extensions/connect-bot/README.md) · [`extensions/connect-bot/GLOSSARY.md`](extensions/connect-bot/GLOSSARY.md) |
| codeBaseTools | [`extensions/codebase-tools/`](extensions/codebase-tools) | [`extensions/codebase-tools/README.md`](extensions/codebase-tools/README.md) · [`extensions/codebase-tools/GLOSSARY.md`](extensions/codebase-tools/GLOSSARY.md) |
| modelCost | [`extensions/model-cost/`](extensions/model-cost) | [`extensions/model-cost/README.md`](extensions/model-cost/README.md) · [`extensions/model-cost/GLOSSARY.md`](extensions/model-cost/GLOSSARY.md) |

## Document index

| Document | What it is | Read it when |
| --- | --- | --- |
| [`framework/docs/extension-development-map.md`](framework/docs/extension-development-map.md) | Long-lived principles for extension layering and finding existing framework capabilities; a Chinese guide, not an API or implementation inventory. | You are adding or changing an extension and deciding where its responsibilities belong. |
| [`framework/README.md`](framework/README.md) | The framework's layout guide and runbook: `core/` / `behaviors/` / `modules/` and sibling `adapters/`, the framework suite, candidate verification, the human acceptance index, and the supported-version upgrade standard. | You are working on framework code or upgrading the supported harness. |
| [`framework/docs/harness-support.md`](framework/docs/harness-support.md) | **Authority** for harness version compatibility: the four-state support record (`verified-supported` / `verified-unlisted` / `unverified` / `unsupported`), its evidence and conditions, the provider-path role evidence, and the long-term upgrade standard and its triggers. | You need to know what is supported, what is not, and how a version becomes supported. |
| [`framework/docs/harness-baseline.json`](framework/docs/harness-baseline.json) | Data record of the fixed baseline: the revision anchor, the artifact that actually runs, and the dependency lockfiles. Re-checked by `tests/harness-dock/baseline.test.ts`. | You need the machine-checkable correspondence behind the supported row; refresh it after a deliberate dependency or version change. |
| [`framework/docs/framework-capabilities.md`](framework/docs/framework-capabilities.md) | Index of the framework's public authoring surface: what every `defineExtension` / `ompAdapter` parameter means, each symbol cited to source. | You are writing or reading framework code and need to find an entry point. |
| [`docs/adr/0002-semantic-extension-framework.md`](docs/adr/0002-semantic-extension-framework.md) | The architecture decision for the semantic extension framework. | You are changing the framework's shape or asking why it is built this way. |
| [`framework/docs/semantic-extension-framework-backlog.md`](framework/docs/semantic-extension-framework-backlog.md) | Deferred work and open research gaps. | You are picking up work outside the first-release scope. |
| [`framework/docs/research/prompt-injection-research.md`](framework/docs/research/prompt-injection-research.md) | Source references and exercised scenarios behind the contribution contract. | You are changing contribution timing, placement, retention or role. |
| [`GLOSSARY-MAP.md`](GLOSSARY-MAP.md) | The multi-context domain vocabulary map: points at one `GLOSSARY.md` per context. | You are naming things in code, tests or docs. |
| [`AGENTS.md`](AGENTS.md) | Repository working agreement for agents. | You are an agent starting work here. |
| [`tests/framework/`](tests/framework) | The framework capability suite (C1–C15). The upgrade regression alarm. | You changed the framework, or you are verifying a candidate version. |
| [`tests/codebase-tools/`](tests/codebase-tools) | The codeBaseTools extension behavior suite; runs permanently against the fixed supported version. | You changed the extension. |
| [`tests/connect-bot/`](tests/connect-bot) | The connect-bot extension suite: registration lifecycle, session switch, failure budget and the panel interop. | You changed connect-bot. |
| [`tests/harness-dock/`](tests/harness-dock) | The shared dock (isolated install, controlled session, capture) and its self-test. | You are writing a test that drives a real session. |
| [`scripts/verify-omp-candidate.ts`](scripts/verify-omp-candidate.ts) | On-demand independent verification of one exact harness version: isolated exact install + framework suite + a scoped result record (version, revision anchor, source revision, lockfiles, environment, coverage). | You are verifying another harness version. |
| [`scripts/capture-codex-outbound.ts`](scripts/capture-codex-outbound.ts) | Prepared layer-2 capture of a real `openai-codex` round trip; needs a human-supplied credential. | You are recording the real-credential role evidence. |
| [`scripts/pi-provider-account-read.ts`](scripts/pi-provider-account-read.ts) | The real account-side reading for the pi migration: runs the loaded extension on the real host against a real provider account and publishes a desensitized, timestamped reading beside what the host drew. Reads the machine's own credential, prints it only as a fingerprint, makes no model request, and reports a missing credential as a blocker. | You are recording or replaying the account-side acceptance evidence (P53). |

The durable documentation is self-contained: migration decisions, constraints and recorded
evidence are stated in the per-extension READMEs, framework documents and ADRs rather than
delegated to working tickets or external archives. The extension READMEs also preserve the
prepared human-acceptance expectations and their verification limits; context terminology is
indexed by [`GLOSSARY-MAP.md`](GLOSSARY-MAP.md). Archiving a planning record does not establish
that its implementation, human acceptance or production cutover has completed.

## Human acceptance and cutover

The automated suites (`bun test`) prove the consumer-visible behavior at seams that do not need a
person. Four things are human-only, and this repository does **not** claim any of them yet — they are
recorded as `unverified` in
[`framework/docs/harness-support.md`](framework/docs/harness-support.md) until a human
runs them: H1 (interactive TUI acceptance, codebase-tools), H2 (`openai-codex` layer-2 capture), H3
(permanent cutover, once per migrated extension) and H4 (replace the supported version). The H-index,
the isolation rule and every runbook live in
[`framework/README.md#human-acceptance-and-cutover`](framework/README.md#human-acceptance-and-cutover);
the per-extension runbooks are in each extension's own README.
