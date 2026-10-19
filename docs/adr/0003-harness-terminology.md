---
status: accepted
---

# The host program is a "harness"; the test rig is a "harness dock"

## Context

The framework adapts extension behavior to a host program. Its vocabulary called that host an
**agent runtime**, while the repository's shared test infrastructure was a **harness**
(`tests/harness/`). Both words carried avoidable ambiguity:

- In the surrounding ecosystem the host program is already called a **harness**: DeepSeek Harness
  describes itself as "an open-source agent harness", `oh-my-pi` addresses its own kind as
  "harnesses", and `@earendil-works/pi-durable` exports `Harness` as "the machinery that runs
  agents on it".
- Using "harness" for the host while the same word named the test rig put one word on both sides of
  the test seam: the rig that drives a run, and the run itself.
- "runtime" is also the ordinary word for *run time* — "no runtime IO", "the runtime parameter" — so
  it never belonged to the host alone.

## Decision

- The host program is a **Harness（宿主）**. `pi` and `oh-my-pi` are the supported harnesses; the
  old name `agent runtime` joins the term's `_Avoid_` list in
  [`framework/GLOSSARY.md`](../../framework/GLOSSARY.md).
- The repository's shared test infrastructure is the **harness dock（对接坞，short `dock`）**. It is
  not a harness: it materialises an isolated exact install of one harness version and drives it as
  a child process. It is defined under `## Verification` in the same glossary.
- **"test runtime" was rejected.** The dock does not run the agent, it launches one; and in the test
  suites `runtime` already denotes the harness under test, so naming the driver "runtime" would
  invert the word (`IsolatedRuntime` → `IsolatedHarness`).
- `runtime` stays in the vocabulary only in its run-time sense — `runtime IO`, `runtime parameter` /
  `runtimeParameter`, `runtime-exercised`, `runtime-verified`, `runtime-certified`,
  `runtime evidence`, `runtime validation`, `runtime comparison`, `runtime test`,
  `runtime verification`, `at runtime` — and is never a synonym for a harness.

The rename that follows is mechanical, and this ADR is its explicit decision:

| Kind | Before | After |
| --- | --- | --- |
| Port | `AgentRuntimePort` | `HarnessPort` |
| Const | `SUPPORTED_AGENT_RUNTIME_VERSIONS` | `SUPPORTED_HARNESS_VERSIONS` |
| JSON key | `agentRuntime` | `harness` |
| Test fixtures | `IsolatedRuntime`, `ensureIsolatedRuntime`, `selectRuntimeVersion` | `IsolatedHarness`, `ensureIsolatedHarness`, `selectHarnessVersion` |
| Directory | `extensions/<id>/runtimes/` | `extensions/<id>/harnesses/` |
| Directory | `tests/harness/` | `tests/harness-dock/` |
| Document | `framework/docs/agent-runtime-support.md` | `framework/docs/harness-support.md` |
| Data | `framework/docs/agent-runtime-baseline.json` | `framework/docs/harness-baseline.json` |

## Consequences

- **Non-additive interface change, decided here.** `AgentRuntimePort` and
  `SUPPORTED_AGENT_RUNTIME_VERSIONS` are renamed rather than re-exported beside their old names. ADR
  [0002](./0002-semantic-extension-framework.md) permits a non-additive change to the framework's
  interfaces only through an explicit decision; this is that decision. Neither symbol is part of the
  extension-authoring surface declared in [`framework/interface`](../../framework/interface/index.ts).
- Accepted ADR [0002](./0002-semantic-extension-framework.md) was written under the old vocabulary.
  Its prose was rewritten to the new term and carries a migration note at its head, so it stays the
  authoritative design document instead of drifting from the glossary.
- The rename is reversible but not free: it touched the framework source, both extensions, the test
  suites, the scripts and the documents, and it is recorded here because a future reader would
  otherwise wonder why `pi` and `oh-my-pi` are called "harnesses" in this repository.
