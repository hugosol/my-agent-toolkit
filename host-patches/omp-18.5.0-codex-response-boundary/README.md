# OMP 18.5.0 — Codex response boundary (ticket 13)

A minimal patch on the approved support base that makes the Codex transport publish **the HTTP
response boundary it already holds** — the status and headers — to extensions, exactly as the
chat-completions, Responses, Anthropic and native provider paths already do. It is the prerequisite
the migration's Codex allowance work (P39/P65) consumes: without it a settled Codex Turn reaches an
extension with `unavailable: ["HTTP response facts"]`, so a response's own `x-codex-*` rate-limit
headers cannot reach any consumer. It is not part of any formal OMP installation and it is not a new
support claim.

## What the patch publishes

The install's `@oh-my-pi/pi-ai` package already has the public channel every other streaming provider
uses:

```ts
// pi-ai/src/utils/provider-response.ts
notifyProviderResponse(options, response, model, requestId?, metadata?) // → options.onResponse(…)
```

The Codex SSE transport never called it. The patch adds that one call, at the point the transport has
received its final response and before it consumes the body:

- the header set is **the response's own** — reduced by the shared helper to the same
  `{status, headers, requestId?, metadata?}` boundary the other paths publish, with header names
  lower-cased;
- the call is made **once per response**, after any transport-level retry has settled, and only for a
  response the transport accepted (a non-2xx response is a failure the transport throws, not a
  boundary it publishes);
- no native object crosses the boundary: what the extension receives is the normalized metadata the
  framework adapter already maps;
- the transport is not intercepted, restructured or re-entered. The change is the call, plus the two
  parameters (`options`, `model`) the function needs to make it.

## The frozen base and the artifact

- **Base**: `@oh-my-pi/pi-coding-agent@18.5.0`, checkout `9348320cc4a30a7195d36a1f05a6c11bcb701a17`
  (`v18.5.0`) — the revision `framework/docs/harness-baseline.json` already records as the approved
  support anchor. The checkout has since moved on; **this patch does not follow it**. `record.json`
  records the pre-patch hash of the file it touches, so the artifact is tied to the anchor rather than
  to whatever the checkout says today.
- **Change**: `patch.diff` — four hunks, **twelve added lines and no removed line**, one file.
- **Patch root**: the installed scope directory (`node_modules/@oh-my-pi`), not the supported
  package's own root, because the change lives in the installed `@oh-my-pi/pi-ai` package of the same
  version. `record.json`'s paths are therefore stated inside that scope
  (`pi-ai/src/providers/openai-codex-responses.ts`).
- **Artifact**: `.cache/omp-baseline/18.5.0-codex-response-boundary/` (gitignored) — a separate
  isolated install of the exact version with the patch applied, materialised and verified by
  `ensureCodexResponseHarness()` (see `tests/harness-dock/codex-response-harness.ts`, which is a thin
  description over the shared `tests/harness-dock/host-patch-artifact.ts`). It never shares a prefix
  with the unpatched baseline install or with the Viewed session artifact.

| | |
| --- | --- |
| patch | `host-patches/omp-18.5.0-codex-response-boundary/patch.diff`, sha256 `4ec9ad0de31b07966aa543db137b8f26d909b64fc8209981e2e8c217ac20214d` |
| file | `pi-ai/src/providers/openai-codex-responses.ts` |
| base hash | `4223858912c4b960d794ba1c15014ee1eacf118d395b91adddf3fe982e4a4ffb` |
| patched hash | `a47d84105cfbc4a191a6339bc7fff350f46244eb343964f0de6b64864712d94b` |

### What the patch changes

| file | change |
| --- | --- |
| `pi-ai/src/providers/openai-codex-responses.ts` | imports `notifyProviderResponse` from the package's own `../utils/provider-response`; threads `options` and `model` into `openCodexSseEventStream` (two optional parameters, one call site); awaits `notifyProviderResponse(options, response, model)` once the response the transport will consume is known, beside the metadata read that already happens there |

### Materialising it

```
bun -e 'import { ensureCodexResponseHarness } from "./tests/harness-dock/codex-response-harness";
        const h = await ensureCodexResponseHarness(); console.log(h.cliPath)'
```

The materialiser writes `.cache/omp-baseline/18.5.0-codex-response-boundary/package.json`
(`@oh-my-pi/pi-coding-agent@18.5.0`), runs `bun install` into a staging directory, applies the patch
with `git -c core.autocrlf=false apply -p1 --whitespace=nowarn --directory=.cache/omp-baseline/18.5.0-codex-response-boundary/node_modules/@oh-my-pi host-patches/omp-18.5.0-codex-response-boundary/patch.diff`
from the repository root, verifies the result against `record.json`, and renames the staging directory
into place. A second call reuses the existing prefix after re-checking the hashes.
`codex-response-host.json` next to the install records what was materialised (install/apply commands,
exit codes, per-file hashes, bun/platform).

**How `patch.diff` was produced** (for a future edit rather than a hand-typed diff): copy the base
install's `pi-ai/src` twice under the gitignored scratch (one pristine copy, one edited copy), then

```
cd .cache/host-patch/codex && git -c core.autocrlf=false diff --no-index --no-color \
  --src-prefix=a/ --dst-prefix=b/ base work \
  | sed -E 's#([ab])/(base|work)/#\1/#g' > ../../../host-patches/omp-18.5.0-codex-response-boundary/patch.diff
```

`core.autocrlf=false` matters: without it this Windows checkout rewrites the patched file with CRLF.

**Re-freezing after a deliberate patch edit**: edit `patch.diff`, delete `record.json`, materialise
again. Until then, every materialisation — and the tests — refuse to run a host whose bytes are not
the frozen ones, so an edited patch cannot slip in unreviewed. `record.json` is written by the
materialiser and committed; neither it nor `patch.diff` is generated by hand.

### Build, dependencies and environment

- No build step: the harness runs its TypeScript sources directly (`src/cli.ts`), so the patch is
  applied to sources and nothing is compiled or bundled.
- Dependencies are the package's own, installed by the dock's exact-version install; this patch adds
  no dependency.
- Recorded environment for the frozen artifact: `win32 x64`, Bun `1.4.2` (in `record.json`).

### Isolated loading steps

The artifact is never a formal installation. A run:

1. uses the patched prefix above — never the default global install, never a `bun link`, never the
   formal configuration;
2. starts the CLI from that prefix with `--mode rpc --no-extensions -e <extension> --model
   <provider>/<model> --session-dir <run>/sessions --cwd <run>/work`;
3. sets `PI_CODING_AGENT_DIR=<run>/agent-state` and strips the resolution offsets (`OMP_PROFILE`,
   `PI_PROFILE`, `OMPCODE`, `PI_CONFIG_FILES`, `XDG_*`, `PI_CODING_AGENT_DIR`, `OMP_AUTH_BROKER_*`) —
   the dock's `buildSessionEnv` does exactly this;
4. keeps the install, agent state, sessions, working directory and capture directory under one
   temporary run root (`createRunRoot`), so a run cannot write into this repository or into the
   operator's environment.

## Evidence

| test | what it establishes |
| --- | --- |
| [`tests/harness-dock/codex-response-artifact.test.ts`](../../tests/harness-dock/codex-response-artifact.test.ts) | the artifact is frozen: the record pins the recorded revision (not the moved-on checkout), every base hash is the exact 18.5.0 install's own bytes, the materialised host carries exactly the frozen post-patch bytes, and the change is the one provider file |
| [`tests/harness-dock/model-cost-codex-quota.test.ts`](../../tests/harness-dock/model-cost-codex-quota.test.ts) | through the real loader and RPC: a settled `openai-codex` Turn carries the response's own `x-codex-*` headers, the extension's windows read their values and reset instants from them, a report carrying one window leaves the other reading *and its instant* untouched, two reports drive the ratio measurement from their own pairs, no Turn asks the account API again, and the configured-missing-proxy refusal stands with no direct connection. The **unpatched baseline** runs the same scripted response as the control: `hasHttpFacts: false`, `unavailable: ["HTTP response facts"]`, no window |
| [`tests/harness-dock/viewed-session.test.ts`](../../tests/harness-dock/viewed-session.test.ts), [`viewed-session-host.test.ts`](../../tests/harness-dock/viewed-session-host.test.ts), [`model-cost-modes.test.ts`](../../tests/harness-dock/model-cost-modes.test.ts) | the shared materialiser this artifact uses still freezes and runs the Viewed session artifact unchanged |

Reproduce:

```
bun test tests/harness-dock/codex-response-artifact.test.ts tests/harness-dock/model-cost-codex-quota.test.ts
```

Fault injection (used once while developing, not part of the suite): running the smoke's first case
against the **unpatched baseline** install made it fail on `hasHttpFacts` (expected `true`, received
`false`), and the same expectation passes on the frozen artifact — so the assertion is sensitive to
the patch and not to the host version.

**What is not established here.** A real Codex account's allowance is never observed: the header
values are the capture endpoint's scripted literals, the credential is the isolated run's fixture
token, and the account API is left unconfigured on purpose. The WebSocket transport is out of scope
(the evidence pins the session to SSE), and so are failure responses. This ticket promotes no
version: the support record stays at 18.5.0, and the eventual patched revision for acceptance remains
an acceptance decision. The patch is a local artifact, not merged into any upstream checkout — an
upstream release that closes the same gap would make it redundant, not wrong.

## Prepared human check (H2 material for P39/P65)

Not executed here; the steps and expectations are ready so the eventual acceptance round does not
have to reconstruct them.

1. On a machine with a real ChatGPT/Codex credential, run one Codex model request through OMP with
   this extension loaded (any host carrying the boundary — the patched artifact above, or an upstream
   revision that publishes it).
2. Read the extension's read-only result (`presentation.quota()`; or the 5h/7d lines of the rendered
   widget once P67 lands) and expect the five-hour and weekly windows to equal the values the
   response's own `x-codex-*` headers reported — identified by the reported *length* (±5% of 5h/7d),
   not by which position carried them — with the reset instants as reported.
3. Keep using the account normally and expect each response to update the windows it names,
   independently: a report that omits one window leaves that window's last accepted value and instant
   unchanged, and no extra account query appears between Turns.
4. Sanitized source for this step: only the account's own `x-codex-*` values and reset instants are
   needed — no token, no account id, no e-mail. The fields to compare are `usedPercent`, `resetsAt`
   and `obtainedAt`.
5. If only the mock, the capture endpoint or an RPC result is available, record a **skip with its
   reason** rather than a pass: an API document, a mock response and an RPC session do not certify the
   real allowance's behaviour.
