#!/usr/bin/env bash
# verify-candidate.sh — branch-protection probe for agent-attribution-gate outreach.
#
# Flow:
#   owner/repo
#     -> branch protection check
#     -> required checks visible?
#     -> attribution-gate fit
#     -> OUTREACH | HOLD
#
# This is the manual verification step the candidate table asks for before any
# outreach. It is READ-ONLY: it performs no writes, opens no PRs, sends no
# messages. The verdict is advisory — a green "OUTREACH" means the gate has
# somewhere to attach, not that anyone has been contacted.
#
# Usage:
#   ./verify-candidate.sh owner/repo [owner/repo ...]
#   ./verify-candidate.sh --from-table        # read candidates from the .md table
#   BRANCH=master ./verify-candidate.sh owner/repo
#
# Requires: gh (authenticated with repo scope) and jq.
#
# Note on access: reading branch protection requires admin on the target repo.
# For an unaffiliated candidate you will usually NOT have admin, so the honest
# outcome is "NO_ACCESS -> HOLD (confirm with the maintainer)". That is expected
# and is itself useful signal — it tells you the protected-main question has to be
# asked in the outreach rather than verified beforehand.

set -uo pipefail

BRANCH="${BRANCH:-main}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TABLE="$HERE/agent-attribution-gate-candidates.md"

die() { echo "error: $*" >&2; exit 2; }
command -v gh >/dev/null 2>&1 || die "gh CLI not found (https://cli.github.com)"
command -v jq >/dev/null 2>&1 || die "jq not found"

# ---- collect candidates -----------------------------------------------------
candidates=()
if [[ "${1:-}" == "--from-table" ]]; then
  [[ -f "$TABLE" ]] || die "candidate table not found: $TABLE"
  while IFS= read -r repo; do
    [[ -n "$repo" ]] && candidates+=("$repo")
  done < <(awk -F'|' '
    /\|/ {
      gsub(/^[ \t]+|[ \t]+$/, "", $2)
      if ($2 ~ /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/ && $2 !~ /example/) print $2
    }' "$TABLE" | sort -u)
  [[ ${#candidates[@]} -gt 0 ]] || die "no candidates parsed from $TABLE"
elif [[ $# -ge 1 ]]; then
  candidates=("$@")
else
  die "usage: $0 owner/repo [owner/repo ...] | --from-table"
fi

# ---- probe ------------------------------------------------------------------
# States map to the candidates.md rubric "Protected main" signal:
#   PROTECTED_REQUIRED  -> +2   required checks already enforced
#   PROTECTED_NO_REQUIRED -> +1 branch rules, no required checks (gate = first)
#   UNPROTECTED         ->  0   no protection; needs protected main first
#   NO_ACCESS / ERROR   ->  ?   cannot verify from here -> ask the maintainer
verdict_for() {
  local repo="$1" out rc checks n

  if ! gh api "repos/$repo" >/dev/null 2>&1; then
    printf '%s\t%s\t%s\n' "$repo" "UNREACHABLE" "HOLD — repo not found or no access"
    return
  fi

  out="$(gh api "repos/$repo/branches/$BRANCH/protection" 2>&1)"; rc=$?
  if [[ $rc -ne 0 ]]; then
    if grep -qiE 'administ|must be an admin|403' <<<"$out"; then
      printf '%s\t%s\t%s\n' "$repo" "NO_ACCESS(?)" \
        "HOLD — need admin to read protection; ask the maintainer in outreach"
    elif grep -qiE 'not protected|Not Found|404' <<<"$out"; then
      printf '%s\t%s\t%s\n' "$repo" "UNPROTECTED(0)" \
        "HOLD — no protection on '$BRANCH'; gate needs a protected branch first (heavier ask)"
    else
      printf '%s\t%s\t%s\n' "$repo" "ERROR(?)" "HOLD — $(head -n1 <<<"$out" | cut -c1-60)"
    fi
    return
  fi

  # protected — are there required status checks?
  checks="$(gh api "repos/$repo/branches/$BRANCH/protection/required_status_checks" 2>/dev/null)"
  if [[ -z "$checks" ]]; then
    printf '%s\t%s\t%s\n' "$repo" "PROTECTED_NO_REQUIRED(+1)" \
      "OUTREACH — clean story: attribution gate becomes the FIRST required check"
    return
  fi
  n="$(jq -r '.contexts // [] | length' <<<"$checks" 2>/dev/null || echo 0)"
  if [[ "${n:-0}" -gt 0 ]]; then
    printf '%s\t%s\t%s\n' "$repo" "PROTECTED_REQUIRED+$n(+2)" \
      "OUTREACH — strong: '$BRANCH' already enforces $n required check(s); gate slots in"
  else
    printf '%s\t%s\t%s\n' "$repo" "PROTECTED_NO_REQUIRED(+1)" \
      "OUTREACH — gate becomes the first required check on '$BRANCH'"
  fi
}

# ---- run + render -----------------------------------------------------------
printf 'agent-attribution-gate — candidate verification (branch: %s)\n\n' "$BRANCH"
{
  printf 'REPO\tSTATE\tVERDICT\n'
  for repo in "${candidates[@]}"; do verdict_for "$repo"; done
} | column -t -s $'\t'

cat <<'EOF'

legend:
  PROTECTED_REQUIRED (+2) -> OUTREACH allowed (strongest fit)
  PROTECTED_NO_REQUIRED (+1) -> OUTREACH allowed (gate = first required check)
  UNPROTECTED (0)        -> HOLD (maintainer must enable branch protection first)
  NO_ACCESS / ERROR (?)  -> HOLD (cannot verify; raise it in the outreach itself)

next: for any OUTREACH row, send the matching draft from
      agent-attribution-gate-outreach-drafts.md, then record the result back in
      the candidate table. This script never sends anything.
EOF
