#!/usr/bin/env bash
set -euo pipefail

# MindShift runtime evidence collector.
# Observability-only: no deployment, no database access, no replay mutation,
# no runtime legitimacy-state mutation.

readonly INVARIANT="If no valid object exists → nothing happens."
readonly REQUIRED_DIRS=("governance/runtime" "tests/fate" "src" "migrations")

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_directory() {
  local dir="$1"
  [[ -d "$dir" ]] || fail "required directory missing: $dir"
}

write_header() {
  local file="$1"
  local title="$2"
  {
    printf '# %s\n' "$title"
    printf 'timestamp=%s\n' "$TIMESTAMP"
    printf 'commit=%s\n' "$COMMIT_SHA"
    printf 'branch=%s\n' "$BRANCH"
    printf 'head=%s\n' "$HEAD_REF"
    printf 'invariant=%s\n' "$INVARIANT"
    printf '\n'
  } > "$file"
}

run_captured() {
  local label="$1"
  local command_text="$2"
  local stdout_file="$3"
  local stderr_file="$4"
  shift 4

  local status=0
  set +e
  "$@" > "$stdout_file" 2> "$stderr_file"
  status=$?
  set -e

  {
    printf '# %s\n' "$label"
    printf 'command=%s\n' "$command_text"
    printf 'exit_status=%s\n' "$status"
    printf 'stdout_file=%s\n' "$(basename "$stdout_file")"
    printf 'stderr_file=%s\n' "$(basename "$stderr_file")"
    printf '\n## stdout\n'
    cat "$stdout_file"
    printf '\n## stderr\n'
    cat "$stderr_file"
  }

  return "$status"
}

git rev-parse --show-toplevel >/dev/null 2>&1 || fail "must be run inside a git repository"
readonly REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

for dir in "${REQUIRED_DIRS[@]}"; do
  require_directory "$dir"
done

readonly TIMESTAMP="$(date -u +%Y-%m-%d_%H-%M-%S)"
readonly COMMIT_SHA="$(git rev-parse --short=12 HEAD)"
readonly FULL_COMMIT_SHA="$(git rev-parse HEAD)"
readonly BRANCH="$(git branch --show-current || true)"
readonly HEAD_REF="$(git symbolic-ref --quiet --short HEAD || git rev-parse --short=12 HEAD)"
readonly EVIDENCE_DIR="evidence/${TIMESTAMP}-${COMMIT_SHA}"

[[ -e "$EVIDENCE_DIR" ]] && fail "evidence directory already exists: $EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"

write_header "$EVIDENCE_DIR/git-status.txt" "Git status"
git status --short --branch --untracked-files=all | sort >> "$EVIDENCE_DIR/git-status.txt"

write_header "$EVIDENCE_DIR/git-diff.txt" "Git diff"
git diff --no-ext-diff -- src tests governance migrations package.json package-lock.json tsconfig.json >> "$EVIDENCE_DIR/git-diff.txt"

write_header "$EVIDENCE_DIR/changed-files.txt" "Changed files"
{
  git diff --name-only -- src tests governance migrations package.json package-lock.json tsconfig.json
  git diff --cached --name-only -- src tests governance migrations package.json package-lock.json tsconfig.json
  git ls-files --others --exclude-standard -- src tests governance migrations package.json package-lock.json tsconfig.json
} | sort -u >> "$EVIDENCE_DIR/changed-files.txt"

write_header "$EVIDENCE_DIR/commit.txt" "Commit lineage"
{
  printf 'full_commit=%s\n' "$FULL_COMMIT_SHA"
  printf 'short_commit=%s\n' "$COMMIT_SHA"
  printf 'branch=%s\n' "$BRANCH"
  printf 'head=%s\n' "$HEAD_REF"
  printf '\n## recent commits\n'
  git log --max-count=20 --date=iso-strict --pretty=format:'%H%x09%ad%x09%an%x09%s'
  printf '\n'
} >> "$EVIDENCE_DIR/commit.txt"

write_header "$EVIDENCE_DIR/runtime-surfaces.txt" "Runtime surfaces"
find src governance/runtime -type f -print | LC_ALL=C sort >> "$EVIDENCE_DIR/runtime-surfaces.txt"

write_header "$EVIDENCE_DIR/fate-tests.txt" "FATE tests"
find tests/fate -type f -print | LC_ALL=C sort >> "$EVIDENCE_DIR/fate-tests.txt"

write_header "$EVIDENCE_DIR/governance-files.txt" "Governance artifacts"
find governance migrations -type f -print | LC_ALL=C sort >> "$EVIDENCE_DIR/governance-files.txt"

npm_status=0
run_captured \
  "npm test" \
  "npm test" \
  "$EVIDENCE_DIR/npm-test.stdout.txt" \
  "$EVIDENCE_DIR/npm-test.stderr.txt" \
  npm test > "$EVIDENCE_DIR/npm-test.txt" || npm_status=$?

if [[ -x "node_modules/.bin/tsc" ]]; then
  tsc_command=("node_modules/.bin/tsc" "--noEmit")
else
  tsc_command=("./node_modules/.bin/tsc" "--noEmit")
fi

tsc_status=0
run_captured \
  "TypeScript validation" \
  "node_modules/.bin/tsc --noEmit" \
  "$EVIDENCE_DIR/tsc-output.stdout.txt" \
  "$EVIDENCE_DIR/tsc-output.stderr.txt" \
  "${tsc_command[@]}" > "$EVIDENCE_DIR/tsc-output.txt" || tsc_status=$?

runtime_total="$(find src governance/runtime -type f -print | LC_ALL=C sort | wc -l | tr -d ' ')"
fate_total="$(find tests/fate -type f -print | LC_ALL=C sort | wc -l | tr -d ' ')"
governance_total="$(find governance migrations -type f -print | LC_ALL=C sort | wc -l | tr -d ' ')"

cat > "$EVIDENCE_DIR/EVIDENCE_SUMMARY.md" <<SUMMARY
# MindShift Runtime Evidence Summary

- Timestamp (UTC): $TIMESTAMP
- Commit SHA: $FULL_COMMIT_SHA
- Branch: $BRANCH
- Current HEAD: $HEAD_REF
- Total runtime files: $runtime_total
- Total FATE tests: $fate_total
- Total governance artifacts: $governance_total
- npm test exit status: $npm_status
- TypeScript validation exit status: $tsc_status

## Canonical invariant

$INVARIANT

## Evidence directory

$EVIDENCE_DIR

## Observability-only constraints

- No network calls are made by this collector.
- No deployment commands are invoked.
- No runtime legitimacy state is mutated.
- No database state is mutated.
- No replay state is mutated.
- No proof objects or authority objects are created.
SUMMARY

printf 'Evidence bundle created: %s\n' "$EVIDENCE_DIR"
printf 'npm test exit status: %s\n' "$npm_status"
printf 'TypeScript validation exit status: %s\n' "$tsc_status"

if [[ "$npm_status" -ne 0 || "$tsc_status" -ne 0 ]]; then
  exit 1
fi
