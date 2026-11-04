# Worktree setup tools: primary-source research

Research only; no tools installed, no repository configuration changed, no performance measurements performed.

## Worktrunk

- Official project calls itself a Git worktree manager with workflow hooks and copy-on-write build-cache preparation: https://worktrunk.dev/
- `pre-start` is a blocking creation hook and runs before post-start/--execute. `post-start` is background. A table's multiple commands execute concurrently; ordered `[[pre-start]]` or `[[post-start]]` blocks are necessary for dependency chains: https://worktrunk.dev/hook/
- Therefore dependency preparation that must finish before an agent/test starts belongs in `pre-start`, not an unawaited background post-start.
- Example configuration (proposed, not executed):

```toml
[pre-start]
deps = "bun install --frozen-lockfile"
```

This orchestrates Bun's package-manager cache; it does not create a new content-addressed node_modules cache.

- `wt step copy-ignored` copies ignored files from primary worktree to current by default; `.worktreeinclude` is an allowlist intersected with gitignored files. `--require-include` makes missing allowlist a no-op. Existing destination files are skipped unless `--force`: https://worktrunk.dev/step/#wt-step-copy-ignored
- Copy-on-write supported by documented APFS/btrfs/XFS/ReFS; NTFS/ext4 fall back to full copy. Per-file reflinking still scales with file count. Do not claim ordinary Windows/NTFS gets zero-copy: https://worktrunk.dev/step/#wt-step-copy-ignored--copy-on-write
- This is independent snapshots sharing underlying blocks, not a shared mutable target directory and not lockfile-keyed dependency resolution. Copied node_modules must be reconciled with destination lockfile via install. A shared mutable source actively being built is not a guaranteed coherent snapshot.
- Official tips explicitly show ordered pipeline when copy must precede pnpm install: https://worktrunk.dev/tips-patterns/#eliminate-cold-starts
- Do not copy source-tree live runtime records, credentials, or arbitrary .env merely because copy-ignored includes them by default. For this repository `framework/.runtime` is not deployment/cache input.
- Windows installation is documented via Winget; binary also named `git-wt` to avoid Windows Terminal's `wt` alias: https://worktrunk.dev/#install
- Official step page contains a shortcut symlinking whole node_modules from primary worktree for non-native projects. This does NOT establish branch lockfile equivalence or mutation isolation, so it is not the recommended default for concurrent agents changing dependencies.

## CodeRabbit Git Worktree Runner

- Official repository: https://github.com/coderabbitai/git-worktree-runner
- Provides worktree create/open/run/remove, selective copying via `gtr.copy.include` / `includeDirs`, and hooks such as `gtr.hook.postCreate = npm install`.
- `.gtrconfig` example includes `node_modules` under COPY rules: it is copying, not a documented dependency-graph shared store.
- `~/.cache/gtr` in README is the generated SHELL INITIALIZATION SCRIPT cache (`init-gtr.bash`, etc.), not a dependency cache. Search summaries can conflate these; primary README distinguishes them.
- Windows platform table specifies Git Bash or WSL, native PowerShell not supported.
- Suitable as orchestration alternative to Worktrunk. Does not replace pnpm/Bun/Cargo/sccache cache management.

## Selection takeaway

Choose the package/compiler cache independently of worktree lifecycle tooling. Worktrunk or GTR can trigger setup, but using raw `git worktree add` will not automatically invoke their own lifecycle hooks. Ensure all creation paths use the chosen wrapper, or invoke preparation explicitly.
