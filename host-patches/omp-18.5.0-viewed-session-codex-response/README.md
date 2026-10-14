# OMP 18.5.0 — Viewed session outlet + Codex response boundary, on one install (ticket 24)

The **combined host artifact**: the isolated exact 18.5.0 install with *both* of this migration's
local host patches applied to it, in one prefix. It exists because the acceptance run needs both
behaviours at once — an extension reading the host's public Viewed session outlet **and** a settled
Codex Turn whose response boundary reaches it — and "both" has to be a fact about one install rather
than a claim about two.

It is not a merge of two tickets' reports. The two single-patch artifacts stay what they are, each
frozen and verified by its own suite ([`omp-18.5.0-viewed-session`](../omp-18.5.0-viewed-session/README.md),
[`omp-18.5.0-codex-response-boundary`](../omp-18.5.0-codex-response-boundary/README.md)); this
artifact is the **chain** of their two committed `patch.diff` files, materialised once by the shared
materialiser (`tests/harness-dock/host-patch-artifact.ts`), and frozen in its own
[`record.json`](record.json).

## What the artifact carries

| step | patch | what it adds | where it applies |
| --- | --- | --- | --- |
| 1 | [`omp-18.5.0-viewed-session/patch.diff`](../omp-18.5.0-viewed-session/patch.diff) | `getViewedSession()` / `subscribeViewedSessionChanged()` on the extension context, and the `ViewedSessionFacts` the host publishes | the supported package's own sources (`node_modules/@oh-my-pi/pi-coding-agent`) |
| 2 | [`omp-18.5.0-codex-response-boundary/patch.diff`](../omp-18.5.0-codex-response-boundary/patch.diff) | the Codex SSE transport publishes the response boundary it already holds, through the same `notifyProviderResponse` helper every other streaming provider uses | the installed scope beside it (`node_modules/@oh-my-pi`), because the change is in the installed `@oh-my-pi/pi-ai` package |

The two steps touch disjoint files and different packages, so neither can disturb the other's
pre-patch bytes; the order is the one the record froze.

## The frozen base and the artifact

- Base: `@oh-my-pi/pi-coding-agent@18.5.0`, revision anchor `../oh-my-pi`
  `9348320cc4a30a7195d36a1f05a6c11bcb701a17` (`v18.5.0`) — the revision the baseline record names as
  supported. The checkout has moved past it since; the anchor stays the recorded revision.
- Patches: `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b` (viewed session) and
  `4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d` (response boundary), each the
  sha256 of the committed patch file.
- Artifact: `record.json` holds the pre-patch and post-patch sha256 of all **nine** files the chain
  touches — eight for the first patch, one for the second — measured on this install. Each step's
  entry is byte-for-byte the entry the single-patch artifact's own record froze, which is what makes
  "both on one install" checkable against two independently frozen records rather than against a
  merged summary.
- The record's `patch` **hash prefix** names the prefix to materialise: `.cache/omp-baseline/18.5.0-viewed-session-codex-response`. As with the single-patch artifacts, the record is written once by the first materialisation and verified by every later one; re-freezing after a deliberate patch edit is: edit the patch, delete the record **and** the prefix, materialise again.

### Materialising it

```
# 1. the exact install, in the artifact's own prefix
mkdir -p .cache/omp-baseline/18.5.0-viewed-session-codex-response
#    package.json: { "name": "omp-combined-host-prefix", "dependencies": { "@oh-my-pi/pi-coding-agent": "18.5.0" } }
bun install                       # run in that prefix

# 2. both patches, each inside the directory its own paths are relative to
git -c core.autocrlf=false apply -p1 --whitespace=nowarn \
  --directory=.cache/omp-baseline/18.5.0-viewed-session-codex-response/node_modules/@oh-my-pi/pi-coding-agent \
  host-patches/omp-18.5.0-viewed-session/patch.diff
git -c core.autocrlf=false apply -p1 --whitespace=nowarn \
  --directory=.cache/omp-baseline/18.5.0-viewed-session-codex-response/node_modules/@oh-my-pi \
  host-patches/omp-18.5.0-codex-response-boundary/patch.diff
```

A test never runs these by hand: `ensureCombinedHostHarness()` (in
`tests/harness-dock/combined-host-harness.ts`) materialises the prefix under `.cache/omp-baseline/`,
applies the chain in order, verifies every step against `record.json`, and refuses to run a host
whose bytes are not the frozen ones.

### Build, dependencies and environment

- No build step: the harness runs its TypeScript sources directly (Bun), and both patches are
  applied to sources; nothing is compiled or bundled.
- Dependencies are the package's own, installed by the dock's exact-version install; neither patch
  adds a dependency.
- Recorded environment for the frozen artifact: `win32 x64`, Bun `1.4.2` (in `record.json`).

### Isolated loading steps

The artifact is never a formal installation. A run:

1. uses the combined prefix above — never the default global install, never a `bun link`, never the
   formal configuration, and never one of the single-patch prefixes;
2. starts the CLI from that prefix with `--mode rpc --no-extensions -e <extension> --model
   <provider>/<model> --session-dir <run>/sessions --cwd <run>/work`;
3. sets `PI_CODING_AGENT_DIR=<run>/agent-state` and strips the resolution offsets (`OMP_PROFILE`,
   `PI_PROFILE`, `OMPCODE`, `PI_CONFIG_FILES`, `XDG_*`, `PI_CODING_AGENT_DIR`, `OMP_AUTH_BROKER_*`) —
   the dock's `buildSessionEnv` does exactly this;
4. keeps the install, agent state, sessions, working directory and capture directory under one
   temporary run root (`createRunRoot`), and the extension's storage root under its own temporary
   home, so a run cannot write into this repository or into the operator's environment.

## Evidence

| test | what it establishes |
| --- | --- |
| [`tests/harness-dock/combined-host-artifact.test.ts`](../../tests/harness-dock/combined-host-artifact.test.ts) | the artifact is frozen: the record chains the two committed patches on the recorded revision, each step equals the single-patch artifact's own frozen entry hash for hash, every pre-patch hash is the unpatched install's own bytes, the materialised host carries exactly both patches' post-patch bytes, and the unpatched install carries neither behaviour |
| [`tests/harness-dock/model-cost-persistence.test.ts`](../../tests/harness-dock/model-cost-persistence.test.ts) | on that one install, in one process: a real Codex Turn settles with the response's own `x-codex-*` headers *and* an extension reads the Viewed session outlet for the same session — beside the cross-document persistence contract (P52) below |

The single-patch artifacts' own suites keep running unchanged:
[`codex-response-artifact.test.ts`](../../tests/harness-dock/codex-response-artifact.test.ts),
[`viewed-session.test.ts`](../../tests/harness-dock/viewed-session.test.ts).

Reproduce:

```
bun test tests/harness-dock/combined-host-artifact.test.ts tests/harness-dock/model-cost-persistence.test.ts
```

**What is not established here.** Nothing about a real account: the Codex header values are the
capture endpoint's scripted literals and the credential is the isolated run's fixture token. The
patched revision is a local artifact, not merged into any upstream checkout, and this artifact
promotes no version — the support record stays at 18.5.0. The real-TUI (H1) and real-provider (H2)
checks remain the ones their own tickets prepared; this artifact only ensures a run that needs both
patched behaviours has one honest install to execute.
