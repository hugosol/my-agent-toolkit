# OMP 18.5.0 — Viewed session public outlet (ticket 01)

A minimal patch on the approved support base that publishes **which session the host is displaying**
to extensions, read-only, with a change subscription. It is the prerequisite the migration's
"actual Effort" and "valid State marker" work (P11/P27) consumes; it is not part of any formal OMP
installation and it is not a new support claim.

## What the patch publishes

`ExtensionContext` gains two members, in every mode:

```ts
/** Read the session the operator is currently viewing (this session when the host has no separate view). */
getViewedSession(): ViewedSessionFacts;
/** Delivered on a target switch, an invalid target, and the target's own model/effort/context changes. */
subscribeViewedSessionChanged(listener: (facts: ViewedSessionFacts) => void): () => void;
```

`ViewedSessionFacts` (in `src/extensibility/extensions/viewed-session.ts`) carries:

| field | meaning |
| --- | --- |
| `agent.id`, `agent.kind`, `agent.parentId` | the displayed agent's registry id, main/sub kind and direct parent |
| `sessionId`, `name` | the displayed session's own id and its latest display name |
| `provider`, `model` | the displayed session's current model |
| `effort` | the displayed session's **actual effective** thinking level, not a configured intent |
| `context.tokens`, `context.contextWindow` | context usage of the displayed session |
| `unavailable` | every field this host could not obtain — an absent value is always named here and is never guessed from the main session, a private controller or rendered UI text |

Semantics of the change subscription:

- **target switch** — the interactive view attaches to another session (focus a subagent, return to
  main): the host announces it and the next read/delivery is the new target's.
- **same-target fact change** — the viewed session's `model_changed`, `thinking_level_changed`,
  `retry_fallback_applied`, message start/end, `agent_end` or `auto_compaction_end`: a fresh
  snapshot is delivered, and only when a published fact can change.
- **target invalidation** — a focused agent that is removed, parked or aborted makes the view fall
  back to main; the delivered snapshot is main's, never the dead target's.
- **unsubscribe** — the returned function stops delivery; reads stay live (nothing is cached for
  the caller).
- A rename with no event (`/rename`, auto-title) is *not* a notification: the name is read live at
  the next read/delivery, which is the reading the contract asks for.

Read-only by construction: the outlet holds no setter, changes no session state, grants no Owner or
write authority, and performs no I/O of its own.

## The frozen base and the artifact

- **Base**: `@oh-my-pi/pi-coding-agent@18.5.0`, checkout `9348320cc4a30a7195d36a1f05a6c11bcb701a17`
  (`v18.5.0`) — the revision `framework/docs/harness-baseline.json` already records as the approved
  support anchor. The checkout has since moved on; **this patch does not follow it**. Every file the
  patch touches is byte-identical between that checkout and the isolated 18.5.0 install, and
  `record.json` records the pre-patch hash of each one, so the artifact is tied to the anchor rather
  than to whatever the checkout says today.
- **Change**: `patch.diff` (599 lines, eight files). `record.json` records its sha256 plus the
  pre-patch and post-patch sha256 of every file it touches.
- **Artifact**: `.cache/omp-baseline/18.5.0-viewed-session/` (gitignored) — a separate isolated
  install of the exact version with the patch applied, built and verified by
  `ensureViewedSessionHarness()` in [`tests/harness-dock/viewed-session-harness.ts`](../../tests/harness-dock/viewed-session-harness.ts).

### What the patch changes

| file | change |
| --- | --- |
| `src/extensibility/extensions/viewed-session.ts` | new: the facts type, the projection that names unavailable facts, the change bus and the session-scoped source |
| `src/extensibility/extensions/types.ts` | the two `ExtensionContext` members and the public type re-exports |
| `src/extensibility/extensions/runner.ts` | holds a view source, exposes the two members on every context it builds, falls back to the runner's own agent identity and session name |
| `src/extensibility/extensions/index.ts` | exports the new module |
| `src/sdk.ts` | wires each session's runner to a source over that live session (provider, model, actual effort, context) |
| `src/modes/controllers/session-focus-controller.ts` | announces a completed view attachment to main, a subagent or the invalidation fallback |
| `src/modes/interactive-mode.ts` | registers the interactive view as the process-wide outlet source and clears it on teardown |
| `src/session/agent-session.ts` | the command context a hand-constructed session builds without a runner (tests, embedding) reports the same own-session facts |

### Materialising it

```
bun -e 'import { ensureViewedSessionHarness } from "./tests/harness-dock/viewed-session-harness";
        const h = await ensureViewedSessionHarness(); console.log(h.cliPath)'
```

The materialiser writes `.cache/omp-baseline/18.5.0-viewed-session/package.json`
(`@oh-my-pi/pi-coding-agent@18.5.0`), runs `bun install` into a staging directory, applies the patch
with `git -c core.autocrlf=false apply -p1 --whitespace=nowarn --directory=<prefix package>
host-patches/omp-18.5.0-viewed-session/patch.diff` from the repository root, verifies the result
against `record.json`, and renames the staging directory into place. A second call reuses the
existing prefix after re-checking the hashes. `viewed-session-host.json` next to the install records
what was materialised (install/apply commands, exit codes, per-file hashes, bun/platform).

**How `patch.diff` was produced** (for a future edit rather than a hand-typed diff): copy the base
install's `src/` twice under the gitignored scratch (one pristine copy, one edited copy), then

```
cd .cache/host-patch && git -c core.autocrlf=false diff --no-index --no-color \
  --src-prefix=a/ --dst-prefix=b/ base/src work/src \
  | sed -E 's#([ab])/(base|work)/#\1/#g' > ../../host-patches/omp-18.5.0-viewed-session/patch.diff
```

`core.autocrlf=false` matters: without it this Windows checkout rewrites the patched files with CRLF.

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
3. sets `PI_CODING_AGENT_DIR=<run>/agent-state` and strips the resolution offsets
   (`OMP_PROFILE`, `PI_PROFILE`, `OMPCODE`, `PI_CONFIG_FILES`, `XDG_*`, `PI_CODING_AGENT_DIR`,
   `OMP_AUTH_BROKER_*`) — the dock's `buildSessionEnv` does exactly this;
4. keeps the install, agent state, sessions, working directory and capture directory under one
   temporary run root (`createRunRoot`), so a run cannot write into this repository or into the
   operator's environment.

## Evidence

| test | what it establishes |
| --- | --- |
| [`tests/harness-dock/viewed-session.test.ts`](../../tests/harness-dock/viewed-session.test.ts) | the artifact is frozen to the recorded revision (anchor hashes, patch hash, post-patch hashes); the unpatched baseline install has no outlet; target switch, same-target fact change, invalidation and unsubscribe behave as specified, driven against the artifact's own module |
| [`tests/harness-dock/viewed-session-host.test.ts`](../../tests/harness-dock/viewed-session-host.test.ts) | the real patched CLI publishes the outlet to a real extension: full snapshot with nothing unavailable, deliveries for effort/model/context changes, no delivery after unsubscribe, a live identity change across a session switch, no extra outbound request and no change to what the session runs; the same extension on the unpatched baseline reports no outlet |

Reproduce:

```
bun test tests/harness-dock/viewed-session.test.ts tests/harness-dock/viewed-session-host.test.ts
```

**What is not established here.** These runs exercise RPC (headless) hosts. The interactive focus
path — the TUI attaching the transcript to a subagent, and an invalidation detaching it — is wired
and covered by the module-level test but has not been run in this environment, so it is `unverified`
until the human check below. This ticket promotes no version: the support record stays at 18.5.0 and
the eventual patched revision for acceptance remains an acceptance decision. The patch is a local
artifact, not merged into any upstream checkout.

## Prepared human check (H1 material for the real interactive view)

Not executed here; the steps and expectations are ready so the eventual acceptance round does not
have to reconstruct them.

1. Materialise the artifact (above) and make a run root with `agent-state/`, `sessions/`, `work/`.
2. Launch it interactively with the isolated state: `PI_CODING_AGENT_DIR=<run>/agent-state bun
   <prefix>/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts --session-dir <run>/sessions --cwd
   <run>/work`, from a shell with the resolution offsets above cleared.
3. Ask for a task that spawns one subagent, then focus it with the transcript-focus gesture
   (the agent hub / the focus key the TUI advertises in its status line).
4. Expect: the status line and composer switch to the subagent's own model and effort chip, and an
   extension reading `ctx.getViewedSession()` reports that subagent's `agent.id`/`kind: "sub"`,
   its own `sessionId`, `provider`/`model`, its actual effort and its own context window — different
   from main's while focused.
5. Return to main and expect the same reading to report `agent.id: "Main"`, `kind: "main"`, main's
   model/effort/context.
6. Close the subagent while it is focused (or let it finish and park) and expect the view to fall
   back to main, with the outlet reporting main rather than the gone target.

Nothing about this check needs formal credentials: the dock's capture endpoint plus the provider
fixture already provide a credential-free model.
