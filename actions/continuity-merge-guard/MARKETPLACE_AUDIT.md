# ContinuityOS Merge Guard Marketplace Audit

Audit date: 2026-06-22

Audited standalone repository: `joselunasrt8-creator/continuity-merge-guard`

Canonical source: `joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard/`

## Executive summary

The runtime-critical implementation is canonically reconciled: `check.mjs`,
`canonical.mjs`, `attribution.mjs`, `test.mjs`, and all fixtures pass the
canonical conformance suite, preserve fail-closed `NULL` behavior, and keep
proof payload semantics stable.

The only canonical-source packaging gap found for Marketplace readiness was the
absence of a top-level `branding` block in `action.yml`. Adding branding is a
Marketplace metadata-only change: it does not alter inputs, outputs, shell
execution, proof generation, canonicalization, hashes of evaluated payloads, or
`VALID | NULL | PROOF` behavior.

## Preserved invariants

- `validated_object == merge_guard_object` remains unchanged.
- The canonical object-identity payload remains `{repo, pr_number, head_sha,
  base_sha, actor, author_kind, require_agent_authored}`.
- Attribution remains descriptive metadata and does not enter the canonical
  payload hash.
- Missing required fields, invalid policy fields, required-agent mismatches,
  and ambiguous authoritative attribution signals remain fail-closed to `NULL`.
- Proof artifact path and shape remain `MERGE_GUARD_PROOF.json`.
- Marketplace packaging metadata does not widen execution authority or add a
  new mutation-capable surface.

## Severity-ranked findings

### P1 — Marketplace metadata blocker: canonical `action.yml` lacked branding

- File: `actions/continuity-merge-guard/action.yml`
- Reason: GitHub Marketplace listings expect user-facing action metadata,
  including branding, for Marketplace presentation.
- Risk: The action can run as a composite action, but the standalone Marketplace
  package may be rejected or presented poorly without canonical branding parity.
- Fix: Add top-level `branding.icon: shield` and `branding.color: blue`.
- Legitimacy impact: None. Branding is non-executable metadata and cannot alter
  `VALID`, `NULL`, canonical hashes, proof artifacts, or output values.

### P2 — Adoption friction: standalone README examples must pin a real release

- File: standalone `README.md`
- Reason: Installation examples using `@v1` work only after a `v1` tag exists.
- Risk: Before release/tag creation, external maintainers cannot copy/paste the
  README example successfully.
- Fix recommendation: Keep `@v1` for Marketplace release documentation only
  after the release tag exists; before release, use a branch/ref explicitly
  marked as review-only.

### P2 — Adoption friction: concise standalone README should keep vocabulary visible

- File: standalone `README.md`
- Reason: External maintainers need to understand `VALID | NULL | PROOF` in
  under five minutes.
- Risk: The package may be installable but not self-verifying for new adopters.
- Fix recommendation: Keep the governance vocabulary and output list in the
  root README, and link to the manifest/proof verification notes.

### P3 — Documentation cleanup: document intentional root-packaging differences

- File: standalone `docs/FILE_MANIFEST.md`
- Reason: Root packaging necessarily removes the `actions/continuity-merge-guard/`
  path prefix.
- Risk: Reviewers may mistake path-prefix changes for runtime divergence.
- Fix recommendation: Continue documenting path-prefix-only differences as
  packaging adaptations, not runtime changes.

## File-by-file canonical parity checklist

| File | Expected parity result | Runtime risk |
| --- | --- | --- |
| `action.yml` | Root standalone copy may differ only by Marketplace root packaging and branding metadata. | Low if `runs.steps[*].env`, `run`, and outputs are byte-for-byte semantically identical. |
| `check.mjs` | Must match canonical runtime behavior. | P0 if changed, because it decides `VALID` vs `NULL` and writes proof outputs. |
| `canonical.mjs` | Must match canonical canonicalization and SHA-256 behavior. | P0 if changed, because proof hashes would drift. |
| `attribution.mjs` | Must match canonical attribution classification behavior. | P0 if changed, because ambiguous attribution must fail closed. |
| `test.mjs` | Must run every fixture deterministically. | P1 if changed in a way that hides fixture failures. |
| `fixtures/*.json` | Must preserve all expected `VALID`, `NULL`, and attribution outcomes. | P0 if expected outcomes are weakened. |
| `README.md` | May be rewritten for standalone adoption, but examples must reference the standalone repository and documented outputs must match action outputs. | P2 if confusing or pre-release refs are not explicit. |

## Security review

- Shell injection: no untrusted input is interpolated into the composite shell
  command; inputs are passed through environment variables and consumed by Node.
- Path traversal: proof output path is constant (`MERGE_GUARD_PROOF.json`) and
  not caller-controlled.
- Unsafe environment usage: `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY` are used
  only as GitHub-provided file paths; action outputs are single-line normalized
  fields.
- Artifact poisoning: the uploaded artifact path is constant and generated by
  the action itself.
- Malformed input handling: missing required fields and invalid policy enum
  values produce `NULL`.
- Fail-open behavior: ambiguous authoritative attribution and required-agent
  mismatches produce `NULL` and set non-zero exit status.

## Validation performed

- `node actions/continuity-merge-guard/test.mjs` — all 16 fixtures passed.
- Targeted `evaluate()` checks confirmed:
  - missing `actor` returns `NULL` with `MISSING_REQUIRED_FIELD`;
  - missing `head_sha` returns `NULL` with `MISSING_REQUIRED_FIELD`;
  - invalid `author_kind` returns `NULL` with `INVALID_POLICY_FIELD`;
  - conflicting authoritative attribution returns `NULL` with
    `ATTRIBUTION_AMBIGUOUS`.
- `ruby -e 'require "yaml"; p YAML.load_file("actions/continuity-merge-guard/action.yml").keys'`
  confirmed canonical `action.yml` parses as YAML.
- `sha256sum` was recorded for canonical runtime files and fixtures to support
  reviewer verification.

## Release readiness conclusion

The canonical action is Marketplace-ready for human review after adding
non-executable branding metadata. No release, tag, publication, or repository
creation was performed by this audit.
