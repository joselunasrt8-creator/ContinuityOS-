#!/usr/bin/env bash
# scripts/run-conformance.sh
# Portable runner for ContinuityOS conformance pack-v1.
#
# Usage:
#   ./scripts/run-conformance.sh
#
# Requirements:
#   node >= 18 (ESM + built-in crypto/fs)
#
# This script is evidence-only. It does not:
#   - create authority
#   - perform deployment
#   - mutate runtime state
#   - widen execution eligibility
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HARNESS="$REPO_ROOT/conformance/pack-v1/harness.mjs"

if [[ ! -f "$HARNESS" ]]; then
  echo "ERROR: harness not found at $HARNESS"
  echo "Ensure conformance/pack-v1/ is present relative to this script."
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "ERROR: node not found. Install Node.js >= 18."
  exit 1
fi

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "ERROR: Node.js >= 18 required (found v${NODE_MAJOR})"
  exit 1
fi

echo "Running conformance/pack-v1/harness.mjs ..."
echo "Mode: evidence-only | Authority: none | Deployment: none"
echo

node "$HARNESS"
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  echo
  echo "Conformance evidence observed. See conformance/pack-v1/conformance-pack-v1-evidence.json"
else
  echo
  echo "Conformance failures detected. Exit code: $EXIT_CODE"
fi

exit $EXIT_CODE
