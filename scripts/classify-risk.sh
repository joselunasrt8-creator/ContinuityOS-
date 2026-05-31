#!/usr/bin/env bash
set -euo pipefail

RULES_FILE="${RULES_FILE:-governance/merge-legitimacy/RISK_CLASSIFICATION_RULES.json}"
CHANGED_FILES_FILE="${1:-changed_files.txt}"

classify_risk() {
  local risk pattern file

  for risk in P3 P2 P1; do
    while IFS= read -r pattern; do
      while IFS= read -r file; do
        if [[ "$file" == $pattern ]]; then
          echo "$risk"
          echo "matched:$risk:$pattern:$file" >&2
          return 0
        fi
      done < "$CHANGED_FILES_FILE"
    done < <(jq -r --arg risk "$risk" '
      .rules[] | select(.risk == $risk) | .patterns[]
    ' "$RULES_FILE")
  done

  jq -r '.default' "$RULES_FILE"
}

classify_risk
