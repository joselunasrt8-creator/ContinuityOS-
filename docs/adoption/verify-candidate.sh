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
# Note on access: reading classic branch protection requires admin on the target
# repo. For an unaffiliated candidate you will usually NOT have admin, so the
# honest outcome is "NO_ACCESS -> ASK_IN_OUTREACH": proceed with the draft and
# raise the protected-branch question in-thread. The probe also checks repository
# rulesets (repos/<repo>/rules/branches/<branch>), which can enforce required
# checks even when classic protection is absent — so a 404 from the classic
# endpoint is never treated as "unprotected" on its own.
#
# column(1) is optional: if it is not installed the rows are printed tab-separated
# instead, so the script never exits without a verdict.

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
#   PROTECTED_REQUIRED / RULESET_REQUIRED   -> +2  required checks already enforced
#   PROTECTED_NO_REQUIRED / RULESET_PROTECTED -> +1 protected, gate = first/added check
#   UNPROTECTED        ->  0   no classic protection AND no ruleset; needs one first
#   NO_ACCESS / UNKNOWN -> ?   cannot verify -> proceed, ask the maintainer in-thread
verdict_for() {
  local repo="$1" out rc checks n rules rrc

  if ! gh api "repos/$repo" >/dev/null 2>&1; then
    printf '%s\t%s\t%s\n' "$repo" "UNREACHABLE" "HOLD — repo not found or no access"
    return
  fi

  out="$(gh api "repos/$repo/branches/$BRANCH/protection" 2>&1)"; rc=$?
  if [[ $rc -eq 0 ]]; then
    # classic branch protection exists — are required status checks configured?
    checks="$(gh api "repos/$repo/branches/$BRANCH/protection/required_status_checks" 2>/dev/null)"
    n="$(jq -r '.contexts // [] | length' <<<"${checks:-}" 2>/dev/null || echo 0)"
    if [[ "${n:-0}" -gt 0 ]]; then
      printf '%s\t%s\t%s\n' "$repo" "PROTECTED_REQUIRED+$n(+2)" \
        "OUTREACH — strong: '$BRANCH' already enforces $n required check(s); gate slots in"
    else
      printf '%s\t%s\t%s\n' "$repo" "PROTECTED_NO_REQUIRED(+1)" \
        "OUTREACH — gate becomes the first required check on '$BRANCH'"
    fi
    return
  fi

  # classic protection unreadable due to permissions -> proceed, ask in-thread
  if grep -qiE 'administ|must be an admin|403' <<<"$out"; then
    printf '%s\t%s\t%s\n' "$repo" "NO_ACCESS(?)" \
      "ASK_IN_OUTREACH — no admin to read protection; raise the protected-'$BRANCH' question in the draft"
    return
  fi

  # classic protection absent -> a repository ruleset may still govern this branch
  if grep -qiE 'not protected|Not Found|404' <<<"$out"; then
    rules="$(gh api "repos/$repo/rules/branches/$BRANCH" 2>/dev/null)"; rrc=$?
    if [[ $rrc -eq 0 && -n "$rules" ]]; then
      if jq -e 'any(.[]?; .type == "required_status_checks")' <<<"$rules" >/dev/null 2>&1; then
        printf '%s\t%s\t%s\n' "$repo" "RULESET_REQUIRED(+2)" \
          "OUTREACH — strong: a ruleset enforces required checks on '$BRANCH'; gate slots in"
      elif [[ "$(jq -r 'length' <<<"$rules" 2>/dev/null || echo 0)" -gt 0 ]]; then
        printf '%s\t%s\t%s\n' "$repo" "RULESET_PROTECTED(+1)" \
          "OUTREACH — '$BRANCH' is governed by a ruleset; gate can be added as a required check"
      else
        printf '%s\t%s\t%s\n' "$repo" "UNPROTECTED(0)" \
          "HOLD — no classic protection or ruleset on '$BRANCH'; needs branch protection first"
      fi
    else
      # rulesets unreadable too -> don't over-claim "unprotected"
      printf '%s\t%s\t%s\n' "$repo" "UNKNOWN(?)" \
        "ASK_IN_OUTREACH — classic protection absent, rulesets unreadable; confirm with the maintainer"
    fi
    return
  fi

  printf '%s\t%s\t%s\n' "$repo" "ERROR(?)" "HOLD — $(head -n1 <<<"$out" | cut -c1-60)"
}

# ---- run + render -----------------------------------------------------------
printf 'agent-attribution-gate — candidate verification (branch: %s)\n\n' "$BRANCH"
{
  printf 'REPO\tSTATE\tVERDICT\n'
  for repo in "${candidates[@]}"; do verdict_for "$repo"; done
} | if command -v column >/dev/null 2>&1; then column -t -s $'\t'; else cat; fi

cat <<'EOF'

legend:
  PROTECTED_REQUIRED / RULESET_REQUIRED (+2)     -> OUTREACH (strongest fit)
  PROTECTED_NO_REQUIRED / RULESET_PROTECTED (+1) -> OUTREACH (gate = first/added required check)
  NO_ACCESS / UNKNOWN (?)                        -> ASK_IN_OUTREACH (proceed; raise the
                                                    protected-branch question in the draft)
  UNPROTECTED (0)                                -> HOLD (needs branch protection or a ruleset first)
  UNREACHABLE / ERROR                            -> HOLD (cannot proceed)

next: send the matching draft from agent-attribution-gate-outreach-drafts.md for any
      OUTREACH or ASK_IN_OUTREACH row — for ASK_IN_OUTREACH the draft's protected-branch
      question does the verification in-thread — then record the result back in the
      candidate table. This script never sends anything (no writes, no PRs, no outreach).
EOF
