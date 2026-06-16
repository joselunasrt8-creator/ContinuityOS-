# Commit-Trailer Attribution — Demonstration

This file exists only to carry a commit that declares an authoritative
`Agent-Authored-By:` trailer, so the Merge Guard's commit-trailer harvesting
(wired in #2128) can be observed end-to-end:

```
Merge Guard harvests Agent-Authored-By
  → attribution_classification = AGENT_AUTHORED
  → MERGE_GUARD_PROOF.json
  → merge-proof.yml sidecar
  → merge_proof_registry.jsonl  (attribution_classification: "AGENT_AUTHORED")
```

It touches no governed path and asserts no authority — attribution is
descriptive metadata, never merge permission.
