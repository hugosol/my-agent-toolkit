#!/usr/bin/env bash
# Report linked Git worktrees by size, merge state, uncommitted work, and
# remote/PR state. Emits a table sorted by size with advisory buckets. Never
# removes worktrees or branches. An origin base triggers a best-effort fetch,
# which can update the tracking ref, FETCH_HEAD, and Git objects.
# LAST_CHAT is not discovered; verify active use separately.
#
# Usage: bash worktree-audit.sh [-b|--base <ref>] [--no-pr] [repo-path]
#   --no-pr skips the optional origin/gh PR lookup (requires jq).
#   repo-path defaults to the current repo.
#   -b sets the ref the MERGED column checks against (e.g. origin/integration).
#   Without it the base is origin/HEAD, then origin/main, then origin/master.
#   origin/HEAD is the remote's default branch, not necessarily the branch PRs
#   merge into; pass -b when they differ.
set -uo pipefail

base=""
lookup_pr=yes
while [ $# -gt 0 ]; do
	case "$1" in
	-b|--base) [[ $# -ge 2 && -n $2 && $2 != -* ]] || { echo "error: $1 needs a ref" >&2; exit 2; }; base="$2"; shift 2 ;;
	--no-pr) lookup_pr=no; shift ;;
	-h|--help) sed -n '2,/^set -u/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit 0 ;;
	--) shift; break ;;
	-*) echo "error: unknown option: $1" >&2; exit 2 ;;
	*) break ;;
	esac
done
[ $# -le 1 ] || { echo 'error: expected at most one repository path' >&2; exit 2; }

repo="${1:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$repo" ] && { echo "not in a git repo; pass a repo path" >&2; exit 1; }
cd "$repo" || exit 1
git rev-parse --git-dir >/dev/null 2>&1 || { echo "error: not a git repo: $repo" >&2; exit 1; }

# Main worktree is the first record. Pass all other paths through intact.
mapfile -d '' -t worktrees < <(git worktree list --porcelain -z)
wait "$!" || exit 1

if [ -z "$base" ]; then
	for cand in "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" origin/main origin/master; do
		[ -n "$cand" ] && git rev-parse --verify --quiet "$cand^{commit}" >/dev/null && { base="$cand"; break; }
	done
	[ -z "$base" ] && { echo "error: no base ref (origin/HEAD, origin/main, origin/master all missing); pass -b <ref>" >&2; exit 1; }
	echo "warn: no -b given; MERGED checks against $base" >&2
fi

# The base drives the merge check. The fetch is best-effort (stale is fine for
# a first pass) and runs before the check, since -b may name a branch not
# fetched yet. The explicit refspec creates it even in a single-branch clone.
case "$base" in
origin/*) git fetch --quiet --no-tags --no-recurse-submodules origin "+refs/heads/${base#origin/}:refs/remotes/$base" 2>/dev/null \
	|| echo "warn: could not fetch $base; merged column may be stale" >&2 ;;
esac
git rev-parse --verify --quiet "$base^{commit}" >/dev/null 2>&1 || { echo "error: base ref not found: $base" >&2; exit 1; }

# Optional forge metadata. A missing tool, auth or result is not proof of no PR.
prs=''
if [ "$lookup_pr" = yes ]; then
	if command -v jq >/dev/null 2>&1; then
		if raw=$(origin pr list --author "@me" --state all --limit 1000 \
			--json number,status,headRef 2>/dev/null); then
			prs=$(jq -ce '[.[] | {number, state: (.status | ascii_downcase), head: .headRef}]' <<<"$raw" 2>/dev/null) || prs=''
		elif raw=$(gh pr list --author "@me" --state all --limit 1000 \
			--json number,state,headRefName,isDraft 2>/dev/null); then
			prs=$(jq -ce '[.[] | {number, state: (if .isDraft and .state == "OPEN" then "draft" else .state | ascii_downcase end), head: .headRefName}]' <<<"$raw" 2>/dev/null) || prs=''
		fi
	fi
	[ -n "$prs" ] || echo 'warn: PR lookup unavailable; verify PRs separately' >&2
fi
now=$(date +%s)

echo "# base: $base"
printf "SIZE\tAGE\tMERGED\tDIRTY\tREMOTE\tPR\tLAST_CHAT\tBUCKET\tWORKTREE\n"

for entry in "${worktrees[@]:1}"; do
	[[ $entry == 'worktree '* ]] || continue
	wt=${entry#worktree }

	size=$(du -sh -- "$wt" | cut -f1) || exit 1
	head=$(git -C "$wt" rev-parse --verify HEAD) || exit 1
	head_ts=$(git -C "$wt" log -1 --format='%ct' HEAD) || exit 1
	age=$([ "$head_ts" -gt 0 ] 2>/dev/null && echo "$(( (now - head_ts) / 86400 ))d" || echo "?")

	# Squash-merged branches are not ancestors of the base, so PR state is the
	# real signal; merge-base only catches fast-forward/rebase merges.
	if git merge-base --is-ancestor "$head" "$base"; then merged=YES
	elif [ "$?" -eq 1 ]; then merged=no
	else exit 1; fi

	# Distinguish tracked WIP from untracked scratch without refreshing the index.
	porcelain=$(git --no-optional-locks -C "$wt" status --porcelain --untracked-files=normal) || exit 1
	if [ -z "$porcelain" ]; then dirty=clean
	elif printf '%s\n' "$porcelain" | grep -qv '^??'; then
		dirty="wip:$(printf '%s\n' "$porcelain" | grep -cv '^??')"
	else dirty="scratch:$(printf '%s\n' "$porcelain" | grep -c '^??')"; fi

	branch=$(git -C "$wt" symbolic-ref --quiet --short HEAD 2>/dev/null || echo "")
	if [ -z "$branch" ]; then remote=detached
	elif git -C "$wt" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
		[ "$(git -C "$wt" rev-parse "origin/$branch" 2>/dev/null)" = "$head" ] \
			&& remote=pushed \
			|| remote="ahead$(git -C "$wt" rev-list --count "origin/$branch..HEAD" 2>/dev/null)"
	else remote=no-remote; fi

	pr=-
	if [ -n "$branch" ] && [ -n "$prs" ]; then
		pr=$(jq -r --arg b "$branch" '[.[] | select(.head==$b)] | sort_by(.state != "open" and .state != "draft") | first | if . then "#\(.number)/\(.state)" else "-" end' <<<"$prs") || exit 1
	fi

	case "$dirty" in wip:*) bucket=hold-wip ;; *)
		case "$pr" in */open|*/draft) bucket=hold-open-pr ;; *)
			if [ "$merged" = YES ] || [ "$pr" != "-" ]; then bucket=safe
			else bucket=review; fi ;;
		esac ;;
	esac

	# Preserve the TSV shape for Unix paths containing literal control characters.
	wt=${wt//$'\t'/\\t}; wt=${wt//$'\n'/\\n}; wt=${wt//$'\r'/\\r}
	printf "%s\t%s\t%s\t%s\t%s\t%s\t-\t%s\t%s\n" \
		"$size" "$age" "$merged" "$dirty" "$remote" "$pr" "$bucket" "$wt"
done | sort -t$'\t' -k1,1 -rh
