# Stage 2 Slice D — ValidatorAttestationEnvelope + Quorum Evidence Model
## Bounded Implementation Plan

**Artifact Type:** Stage 2 Bounded Implementation Plan — Non-Operative  
**Status:** NON_OPERATIVE PLANNING ARTIFACT  
**Repository:** joselunasrt8-creator/mindshift-demo  
**Branch:** `claude/slice-d-attestation-envelope-KTAIA`  
**Anchor Issue:** #1440  
**Supporting Issues:** #1340, #1418, #1442  
**Date:** 2026-05-26  
**Slice:** D of Stage 2 (Slices A–L)

---

## Primary Objective

Formalize validator attestation as evidence, never authority:

```text
validator attestation evidence
≠
authority

single validator approval
≠
global legitimacy

attestation_type ∈ {'EVIDENCE', 'OBSERVATION'}
                           ↑
                    'AUTHORITY' absent by design
```

---

## 1. Stage 2 Progression Context

| Slice | Status | Description |
|-------|--------|-------------|
| A | CLOSED | Stage 2 umbrella plan |
| B | MERGED #1444 | Finality Classification Registry Hardening |
| C | MERGED #1445 | Epoch Registry + Settlement Coupling |
| **D** | **READY** | **ValidatorAttestationEnvelope + Quorum Evidence Model** |
| E–L | OPEN | Subsequent slices |

Slice D depends on B and C being merged. Both are confirmed merged.

---

## 2. Pre-Existing Infrastructure (Foundation)

All of the following exist and must not be duplicated or replaced — Slice D
builds on them without modifying their contracts.

### TypeScript modules

| Module | Location | Slice D Role |
|--------|----------|--------------|
| `QuorumAttestationRecord`, `MemberAttestation`, `evaluateWeightedQuorum` | `src/lib/quorum-attestation.ts` | EXTENDS — add ValidatorAttestationEnvelope here |
| `EpochFinalityStatus`, `EpochRecord`, `isEpochBlocking`, `isEpochGloballyAuthoritative` | `src/lib/epoch-substrate.ts` | COUPLES — epoch_id validation in envelope |
| `FinalityClassification`, `PredicateSnapshot`, `classifyFromPredicates` | `src/lib/finality-classification.ts` | COUPLES — upstream consumer of Q predicate evidence |
| `CausalClockEntry`, `happensBefore`, `detectCausalInversions` | `src/lib/causal-clock.ts` | INTEGRATES — causal_clock_json field in envelope |
| `ConflictSetRecord`, `selectWinningHead` | `src/lib/conflict-set.ts` | INTEGRATES — quorum disagreement → conflict set linkage |

### Database migrations

| Migration | Role in Slice D |
|-----------|----------------|
| `0048_finality_classification_registry.sql` | Upstream consumer of Q evidence |
| `0049_conflict_set_registry.sql` | Target of quorum disagreement links |
| `0050_quorum_attestation_registry.sql` | Parent registry; envelopes link here |
| `0051_revocation_liveness_registry.sql` | Evidence coupling context |
| `0052_epoch_registry.sql` | epoch_id FK source for envelope validity |
| `0053_finality_classification_convergence_valid.sql` | CONVERGENCE_VALID vocabulary |
| `0054_epoch_settlement_coupling.sql` | Stale epoch cascade context |

### Conformance suite (conformance/suites/stage2-distributed-legitimacy-conformance.json)

| Check | Status before Slice D |
|-------|-----------------------|
| CONF-DIST-01 | IMPLEMENTED (Slice B) |
| CONF-DIST-06 | PENDING — Slice D |
| CONF-DIST-11 | IMPLEMENTED (Slice C) |
| All others | PENDING — later slices |

---

## 3. Deliverables

Slice D produces exactly five deliverables. No other files are created or
modified.

### D1 — ValidatorAttestationEnvelope type and functions

**File:** `src/lib/quorum-attestation.ts` (extend existing module; do not create a new file)

#### New types

```typescript
// The only valid attestation types.
// 'AUTHORITY' is absent from the union by design — it cannot appear in any
// ValidatorAttestationEnvelope, causing a TypeScript compile error if attempted.
export type ValidatorAttestationType = 'EVIDENCE' | 'OBSERVATION'

export type ValidatorAttestationEnvelope = {
  readonly validator_attestation_id: string        // vae_<sha256hex> — deterministic
  readonly validator_id: string                    // stable validator identity
  readonly epoch_id: string                        // epoch binding (must exist in epoch_registry)
  readonly object_hash: string                     // attested canonical content hash
  readonly classification: FinalityClassification  // evidence classification at time of attestation
  readonly topology_snapshot_hash: string          // topology state hash at attestation time
  readonly causal_clock_json: string               // serialized CausalClockEntry
  readonly attestation_type: ValidatorAttestationType  // 'EVIDENCE' | 'OBSERVATION'
  readonly timestamp_utc: string                   // ISO 8601
  readonly signature: string                       // hex-encoded cryptographic attestation
  // Epoch and topology validity flags (populated at creation, immutable)
  readonly is_epoch_stale: 0 | 1                  // 1 when epoch_id is superseded
  readonly is_topology_visible: 0 | 1             // 0 when topology_snapshot_hash absent
  // Evidence-only discipline
  readonly evidence_only: 1
  readonly creates_authority: 0
  readonly creates_execution: 0
  readonly replay_neutral: 1
  readonly raw_production_apply_path: 'DENIED'
}
```

**Rule:** `attestation_type = 'OBSERVATION'` is required when
`is_topology_visible = 0` OR `is_epoch_stale = 1`. An OBSERVATION envelope
carries evidence value only at or below `LOCAL_VALID`. It cannot contribute
quorum weight toward `GLOBAL_VALID`.

**Rule:** `attestation_type = 'EVIDENCE'` is permitted only when
`is_topology_visible = 1` AND `is_epoch_stale = 0`. Only EVIDENCE envelopes
can contribute quorum weight.

#### New functions

```typescript
// Derives the canonical validator_attestation_id.
// Deterministic: same inputs always yield the same ID.
export function buildValidatorAttestationId(
  validator_id: string,
  object_hash: string,
  timestamp_utc: string,
): string
// Returns: `vae_${sha256Hex(canonicalize({ validator_id, object_hash, timestamp_utc }))}`

// Returns true when an envelope's epoch_id is superseded by a newer epoch.
// Stale attestation: is_epoch_stale=1, classification ceiling is STALE_VISIBLE.
// active_epoch_id is the caller-supplied current authoritative epoch for the scope.
export function isAttestationEpochStale(
  envelope: Pick<ValidatorAttestationEnvelope, 'epoch_id'>,
  active_epoch_id: string,
): boolean

// Returns true when the envelope has a non-empty topology_snapshot_hash.
// False → attestation_type must be 'OBSERVATION'; validator is topology-invisible.
export function isAttestationTopologyVisible(
  envelope: Pick<ValidatorAttestationEnvelope, 'topology_snapshot_hash'>,
): boolean

// Derives the FinalityClassification supported by a set of ValidatorAttestationEnvelopes.
// Does not call D1. Pure function over the envelope set.
//
// Rules (applied in order):
//   1. Empty set → NULL
//   2. Any envelope has is_epoch_stale=1 → STALE_VISIBLE (mixed stale: AMBIGUOUS)
//   3. All envelopes have is_topology_visible=0 → PARTITION_SUSPENDED
//   4. Disagreement on object_hash across EVIDENCE envelopes → AMBIGUOUS
//   5. Single EVIDENCE envelope → LOCAL_VALID ceiling (Q predicate false)
//   6. EVIDENCE envelopes agree on object_hash; evaluateWeightedQuorum() → quorum_met:
//      - quorum_met=0 → Q=false → LOCAL_VALID ceiling
//      - quorum_met=1 → Q=true → feeds classifyFromPredicates(); ceiling is
//        CONVERGENCE_VALID or GLOBAL_VALID depending on epoch coupling
//   OBSERVATION envelopes cannot contribute quorum weight (never counted in weight_approved).
export function classifyFromValidatorAttestations(
  envelopes: ValidatorAttestationEnvelope[],
  base_predicates: Omit<PredicateSnapshot, 'Q' | 'G' | 'L' | 'X'>,
  quorum_threshold_fraction: number,
  epochStatus: EpochFinalityStatus | null,
): FinalityClassification
```

#### Key classification invariants

```text
classifyFromValidatorAttestations() with disagreement on object_hash
→ AMBIGUOUS or CONFLICTED
→ NEVER GLOBAL_VALID
→ NEVER CONVERGENCE_VALID

classifyFromValidatorAttestations() with single EVIDENCE envelope
→ Q = false
→ ceiling: LOCAL_VALID

classifyFromValidatorAttestations() with all OBSERVATION envelopes
→ ceiling: OBSERVATIONAL / LOCAL_VALID
→ Q predicate contribution: zero

stale epoch envelope (is_epoch_stale=1)
→ cannot contribute quorum weight
→ ceiling: STALE_VISIBLE
```

---

### D2 — SQL migration: validator_attestation_envelope_registry

**File:** `migrations/0055_validator_attestation_envelope.sql`

#### Schema

```sql
-- Migration: 0055_validator_attestation_envelope
-- Purpose: Persist ValidatorAttestationEnvelope records.
-- Evidence-only: attestation ≠ authority. No UPDATE/DELETE permitted.
-- attestation_type CHECK enforces absence of 'AUTHORITY' at DB level.
-- Depends on: 0050 (quorum_attestation_registry), 0052 (epoch_registry)

CREATE TABLE IF NOT EXISTS validator_attestation_envelope_registry (
  validator_attestation_id    TEXT    NOT NULL PRIMARY KEY,
  validator_id                TEXT    NOT NULL,
  epoch_id                    TEXT    NOT NULL,
  object_hash                 TEXT    NOT NULL,
  classification              TEXT    NOT NULL
    CHECK(classification IN (
      'LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID',
      'AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'
    )),
  topology_snapshot_hash      TEXT    NOT NULL,     -- empty string signals invisible
  causal_clock_json           TEXT    NOT NULL,
  attestation_type            TEXT    NOT NULL
    CHECK(attestation_type IN ('EVIDENCE','OBSERVATION')),  -- 'AUTHORITY' excluded
  timestamp_utc               TEXT    NOT NULL,
  signature                   TEXT    NOT NULL,
  quorum_attestation_id       TEXT,                 -- nullable: populated when part of a quorum record
  is_epoch_stale              INTEGER NOT NULL DEFAULT 0 CHECK(is_epoch_stale IN (0,1)),
  is_topology_visible         INTEGER NOT NULL DEFAULT 1 CHECK(is_topology_visible IN (0,1)),
  reason_code                 TEXT    NOT NULL,
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- Evidence-only discipline (mirroring quorum_attestation_registry pattern)
  evidence_only               INTEGER NOT NULL DEFAULT 1 CHECK(evidence_only = 1),
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  creates_execution           INTEGER NOT NULL DEFAULT 0 CHECK(creates_execution = 0),
  replay_neutral              INTEGER NOT NULL DEFAULT 1 CHECK(replay_neutral = 1),
  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);
```

#### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_vaer_object_hash
  ON validator_attestation_envelope_registry(object_hash);

CREATE INDEX IF NOT EXISTS idx_vaer_validator_id
  ON validator_attestation_envelope_registry(validator_id);

CREATE INDEX IF NOT EXISTS idx_vaer_epoch_id
  ON validator_attestation_envelope_registry(epoch_id);

CREATE INDEX IF NOT EXISTS idx_vaer_attestation_type
  ON validator_attestation_envelope_registry(attestation_type);

CREATE INDEX IF NOT EXISTS idx_vaer_is_epoch_stale
  ON validator_attestation_envelope_registry(is_epoch_stale);
```

#### Required triggers

| Trigger | Timing | Purpose |
|---------|--------|---------|
| `vaer_no_update` | BEFORE UPDATE | Append-only enforcement |
| `vaer_no_delete` | BEFORE DELETE | Append-only enforcement |
| `vaer_epoch_must_exist` | BEFORE INSERT | epoch_id must reference epoch_registry |
| `vaer_quorum_attestation_must_exist` | BEFORE INSERT WHEN quorum_attestation_id IS NOT NULL | FK guard to quorum_attestation_registry |
| `vaer_observation_cannot_be_authority` | BEFORE INSERT | Guard: if attestation_type ever equals 'AUTHORITY', RAISE ABORT (defense-in-depth; CHECK already blocks this) |
| `vaer_stale_cannot_be_evidence` | BEFORE INSERT | If is_epoch_stale=1 AND attestation_type='EVIDENCE', RAISE ABORT — stale attestations must be OBSERVATION only |
| `vaer_invisible_cannot_be_evidence` | BEFORE INSERT | If is_topology_visible=0 AND attestation_type='EVIDENCE', RAISE ABORT — topology-invisible attestations must be OBSERVATION only |

#### Trigger text (canonical)

```sql
CREATE TRIGGER IF NOT EXISTS vaer_no_update
  BEFORE UPDATE ON validator_attestation_envelope_registry
BEGIN
  SELECT RAISE(ABORT, 'validator_attestation_envelope_registry is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS vaer_no_delete
  BEFORE DELETE ON validator_attestation_envelope_registry
BEGIN
  SELECT RAISE(ABORT, 'validator_attestation_envelope_registry is append-only: DELETE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS vaer_epoch_must_exist
  BEFORE INSERT ON validator_attestation_envelope_registry
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM epoch_registry WHERE epoch_id = NEW.epoch_id) = 0
    THEN RAISE(ABORT, 'epoch_id references non-existent epoch_registry record')
  END;
END;

CREATE TRIGGER IF NOT EXISTS vaer_quorum_attestation_must_exist
  BEFORE INSERT ON validator_attestation_envelope_registry
  WHEN NEW.quorum_attestation_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM quorum_attestation_registry
          WHERE quorum_attestation_id = NEW.quorum_attestation_id) = 0
    THEN RAISE(ABORT, 'quorum_attestation_id references non-existent quorum_attestation_registry record')
  END;
END;

CREATE TRIGGER IF NOT EXISTS vaer_stale_cannot_be_evidence
  BEFORE INSERT ON validator_attestation_envelope_registry
  WHEN NEW.is_epoch_stale = 1
BEGIN
  SELECT CASE
    WHEN NEW.attestation_type = 'EVIDENCE'
    THEN RAISE(ABORT, 'stale epoch attestation must use attestation_type=OBSERVATION, not EVIDENCE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS vaer_invisible_cannot_be_evidence
  BEFORE INSERT ON validator_attestation_envelope_registry
  WHEN NEW.is_topology_visible = 0
BEGIN
  SELECT CASE
    WHEN NEW.attestation_type = 'EVIDENCE'
    THEN RAISE(ABORT, 'topology-invisible attestation must use attestation_type=OBSERVATION, not EVIDENCE')
  END;
END;
```

---

### D3 — CONF-DIST-06 fixture

**File:** `tests/fixtures/stage2/quorum_disagreement.json`

```json
{
  "_fixture_id": "CONF-DIST-06",
  "_description": "Validator quorum disagreement: validators v1 and v2 attest hash-A; validators v3 and v4 attest hash-B. Weight is equal (2 vs 2, total 4). No single hash reaches the 2/3 threshold. Classification must be AMBIGUOUS — quorum evidence is absent because validators disagree. GLOBAL_VALID is forbidden.",
  "_non_operative": true,
  "_planning_artifact": "docs/stage2-slice-d-validator-attestation-envelope-plan.md",
  "_related_issue": "#1440",
  "_invariant": "Validator quorum disagreement on the attested object_hash means quorum_met=0 for every candidate hash. The Q predicate is false. Without Q, classifyFromPredicates() cannot reach GLOBAL_VALID or CONVERGENCE_VALID. The expected outcome is AMBIGUOUS — the distributed legitimacy state is unresolvable without further evidence.",
  "_guard": "classifyFromValidatorAttestations() detects multiple distinct object_hash values across EVIDENCE envelopes and returns AMBIGUOUS before calling evaluateWeightedQuorum(). Agreement on a single hash is a prerequisite for quorum evaluation.",
  "_single_validator_rule": "A single EVIDENCE validator attestation sets Q=false regardless of its content. GLOBAL_VALID requires quorum (multiple validators agreeing), not a single validator's endorsement.",
  "scenario": "quorum_disagreement",
  "validator_attestations": [
    {
      "validator_id": "v1",
      "object_hash": "hash-A",
      "member_weight": 1,
      "attestation_type": "EVIDENCE",
      "is_epoch_stale": 0,
      "is_topology_visible": 1
    },
    {
      "validator_id": "v2",
      "object_hash": "hash-A",
      "member_weight": 1,
      "attestation_type": "EVIDENCE",
      "is_epoch_stale": 0,
      "is_topology_visible": 1
    },
    {
      "validator_id": "v3",
      "object_hash": "hash-B",
      "member_weight": 1,
      "attestation_type": "EVIDENCE",
      "is_epoch_stale": 0,
      "is_topology_visible": 1
    },
    {
      "validator_id": "v4",
      "object_hash": "hash-B",
      "member_weight": 1,
      "attestation_type": "EVIDENCE",
      "is_epoch_stale": 0,
      "is_topology_visible": 1
    }
  ],
  "quorum_threshold_fraction": 0.667,
  "topology_present": true,
  "epoch_status": "EPOCH_GLOBAL_AUTHORITATIVE",
  "expected_classification": "AMBIGUOUS",
  "forbidden_classifications": ["GLOBAL_VALID", "CONVERGENCE_VALID"],
  "_classification_function": "classifyFromValidatorAttestations(envelopes, basePredicates, threshold=0.667, epochStatus='EPOCH_GLOBAL_AUTHORITATIVE')",
  "_module": "src/lib/quorum-attestation.ts",
  "_disagreement_rule": "Multiple distinct object_hash values across EVIDENCE envelopes → AMBIGUOUS. evaluateWeightedQuorum() is not called.",
  "_stale_epoch_variant": "If epoch_status were EPOCH_STALE_VISIBLE, classifyFromPredicates() would return STALE_VISIBLE regardless of disagreement.",
  "_single_validator_variant": "A single EVIDENCE envelope with full convergence predicates → LOCAL_VALID at best (Q=false: single validator ≠ quorum)."
}
```

---

### D4 — CONF-DIST-06 test

**File:** `tests/fate/stage2-conf-dist-06.test.mjs`

#### Test coverage matrix

| Test | Scenario | Expected |
|------|----------|----------|
| fixture is non-operative | meta | `_non_operative === true` |
| creates_authority constant | module | `creates_authority === false` |
| fixture expected outcome is AMBIGUOUS | meta | `expected_classification === 'AMBIGUOUS'` |
| fixture forbidden list includes GLOBAL_VALID | meta | `forbidden_classifications includes 'GLOBAL_VALID'` |
| validator disagreement → AMBIGUOUS | D-core | `classifyFromValidatorAttestations(disagreeing) === 'AMBIGUOUS'` |
| GLOBAL_VALID forbidden under disagreement | D-core | result `!== 'GLOBAL_VALID'` |
| CONVERGENCE_VALID forbidden under disagreement | D-core | result `!== 'CONVERGENCE_VALID'` |
| single validator → LOCAL_VALID ceiling | D-core | `classifyFromValidatorAttestations([oneEnvelope]) !== 'GLOBAL_VALID'` |
| unanimous agreement + quorum met → Q=true signal | positive | quorum path produces `!== 'AMBIGUOUS'` |
| stale epoch → STALE_VISIBLE (not AMBIGUOUS) | stale path | result `=== 'STALE_VISIBLE'` |
| stale epoch → GLOBAL_VALID forbidden | stale path | result `!== 'GLOBAL_VALID'` |
| topology-invisible → PARTITION_SUSPENDED | invisible | result `=== 'PARTITION_SUSPENDED'` |
| OBSERVATION envelope excluded from quorum weight | weight | quorum_met stays 0 when only OBSERVATION present |
| empty envelope set → NULL | null path | result `=== 'NULL'` |
| ValidatorAttestationType excludes AUTHORITY | type guard | TypeScript: `'AUTHORITY' satisfies ValidatorAttestationType` is a compile error |
| buildValidatorAttestationId deterministic | ID | same inputs → same `vae_…` ID |
| buildValidatorAttestationId prefixed vae_ | ID | matches `/^vae_[0-9a-f]{64}$/` |
| isAttestationEpochStale returns true when stale | predicate | stale epoch_id → `true` |
| isAttestationEpochStale returns false when current | predicate | active epoch_id → `false` |
| isAttestationTopologyVisible returns false for empty hash | predicate | empty string → `false` |
| migration 0055 defines vaer_no_update trigger | schema | regex match |
| migration 0055 defines vaer_no_delete trigger | schema | regex match |
| migration 0055 attestation_type CHECK excludes AUTHORITY | schema | CHECK IN list does not contain 'AUTHORITY' |
| migration 0055 stale_cannot_be_evidence trigger | schema | regex match |
| migration 0055 invisible_cannot_be_evidence trigger | schema | regex match |
| migration 0055 evidence_only=1 constraint | schema | regex match |
| migration 0055 creates_authority=0 constraint | schema | regex match |
| migration 0055 raw_production_apply_path DENIED | schema | regex match |

#### Test file structure (canonical)

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  creates_authority,
  buildValidatorAttestationId,
  classifyFromValidatorAttestations,
  isAttestationEpochStale,
  isAttestationTopologyVisible,
} from '../../src/lib/quorum-attestation.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/quorum_disagreement.json', 'utf8'),
)
const migration0055Sql = readFileSync(
  'migrations/0055_validator_attestation_envelope.sql', 'utf8',
)

// ── Non-operative meta-assertions ────────────────────────────────────────────
test('CONF-DIST-06: fixture is non-operative', () => { ... })
test('CONF-DIST-06: quorum-attestation module creates_authority is false', () => { ... })
test('CONF-DIST-06: fixture expected outcome is AMBIGUOUS', () => { ... })
test('CONF-DIST-06: fixture forbidden classifications include GLOBAL_VALID', () => { ... })

// ── Core disagreement scenario ────────────────────────────────────────────────
test('CONF-DIST-06: validator disagreement on object_hash → AMBIGUOUS', () => { ... })
test('CONF-DIST-06: GLOBAL_VALID is not reachable under validator disagreement', () => { ... })
test('CONF-DIST-06: CONVERGENCE_VALID is not reachable under validator disagreement', () => { ... })

// ── Single-validator ceiling ──────────────────────────────────────────────────
test('CONF-DIST-06: single EVIDENCE validator cannot reach GLOBAL_VALID', () => { ... })
test('CONF-DIST-06: single EVIDENCE validator → LOCAL_VALID ceiling (Q=false)', () => { ... })

// ── Positive path (unanimous agreement + quorum met) ─────────────────────────
test('CONF-DIST-06: unanimous EVIDENCE agreement + quorum met → not AMBIGUOUS', () => { ... })

// ── Stale epoch path ─────────────────────────────────────────────────────────
test('CONF-DIST-06: stale epoch envelope → STALE_VISIBLE not AMBIGUOUS', () => { ... })
test('CONF-DIST-06: stale epoch envelope → GLOBAL_VALID forbidden', () => { ... })

// ── Topology-invisible path ───────────────────────────────────────────────────
test('CONF-DIST-06: topology-invisible attestations only → PARTITION_SUSPENDED', () => { ... })
test('CONF-DIST-06: OBSERVATION envelopes excluded from quorum weight', () => { ... })

// ── NULL path ────────────────────────────────────────────────────────────────
test('CONF-DIST-06: empty envelope set → NULL', () => { ... })

// ── Function contracts ────────────────────────────────────────────────────────
test('CONF-DIST-06: buildValidatorAttestationId deterministic vae_ prefix', () => { ... })
test('CONF-DIST-06: isAttestationEpochStale returns true when epoch_id differs', () => { ... })
test('CONF-DIST-06: isAttestationTopologyVisible returns false for empty hash', () => { ... })

// ── Migration 0055 schema assertions ─────────────────────────────────────────
test('CONF-DIST-06: migration 0055 defines validator_attestation_envelope_registry', () => { ... })
test('CONF-DIST-06: migration 0055 attestation_type CHECK excludes AUTHORITY', () => { ... })
test('CONF-DIST-06: migration 0055 defines vaer_stale_cannot_be_evidence trigger', () => { ... })
test('CONF-DIST-06: migration 0055 defines vaer_invisible_cannot_be_evidence trigger', () => { ... })
test('CONF-DIST-06: migration 0055 evidence_only=1 and creates_authority=0 enforced', () => { ... })
test('CONF-DIST-06: migration 0055 raw_production_apply_path DENIED guard', () => { ... })
```

---

### D5 — Conformance suite update

**File:** `conformance/suites/stage2-distributed-legitimacy-conformance.json`

Update the CONF-DIST-06 entry from:

```json
{
  "check_id": "CONF-DIST-06",
  "label": "quorum_disagreement_prevents_global_valid",
  "description": "Validator quorum disagreement must prevent GLOBAL_VALID classification. Result must be AMBIGUOUS or CONFLICTED.",
  "fixture": "tests/fixtures/stage2/quorum_disagreement.json",
  "expected_result": "AMBIGUOUS",
  "forbidden_results": ["GLOBAL_VALID"],
  "required_module": "src/lib/quorum-attestation.ts",
  "related_issue": "#1440",
  "status": "PENDING — Slice D"
}
```

To:

```json
{
  "check_id": "CONF-DIST-06",
  "label": "quorum_disagreement_prevents_global_valid",
  "description": "Validator quorum disagreement must prevent GLOBAL_VALID classification. Result must be AMBIGUOUS or CONFLICTED. ValidatorAttestationEnvelope attestation_type is constrained to 'EVIDENCE' | 'OBSERVATION' — 'AUTHORITY' is absent by design. Single validator approval cannot reach GLOBAL_VALID. Stale epoch envelopes are OBSERVATION only.",
  "scenario": "quorum_disagreement",
  "fixture": "tests/fixtures/stage2/quorum_disagreement.json",
  "test": "tests/fate/stage2-conf-dist-06.test.mjs",
  "expected_result": "AMBIGUOUS",
  "forbidden_results": ["GLOBAL_VALID", "CONVERGENCE_VALID"],
  "classification_layer": "classifyFromValidatorAttestations",
  "required_module": "src/lib/quorum-attestation.ts",
  "required_migration": "migrations/0055_validator_attestation_envelope.sql",
  "related_issue": "#1440",
  "db_guard": "vaer_stale_cannot_be_evidence",
  "status": "IMPLEMENTED"
}
```

---

## 4. NULL Condition Matrix

The following conditions must each independently produce NULL or a sub-global
classification. None of them may produce GLOBAL_VALID.

| Condition | Forced Classification |
|-----------|----------------------|
| Empty envelope set | NULL |
| All envelopes OBSERVATION (topology-invisible) | PARTITION_SUSPENDED |
| Validators disagree on object_hash | AMBIGUOUS |
| quorum_met=0 (threshold not reached) | LOCAL_VALID ceiling |
| is_epoch_stale=1 on any envelope | STALE_VISIBLE |
| Single EVIDENCE envelope (quorum requires plurality) | LOCAL_VALID ceiling (Q=false) |
| attestation_type='AUTHORITY' | Type error (TypeScript) + DB ABORT (trigger) |
| EPOCH_AMBIGUOUS / EPOCH_CONFLICTED / EPOCH_REVOKED / EPOCH_NULL | NULL (from classifyFromPredicates via Slice C) |
| EPOCH_STALE_VISIBLE | STALE_VISIBLE (from classifyFromPredicates via Slice C) |
| EPOCH_PARTITION_SUSPENDED | PARTITION_SUSPENDED (from classifyFromPredicates via Slice C) |
| Causal ordering ambiguous | downstream: NULL (CONF-DIST-13, Slice J) |

---

## 5. Invariant Set

```text
INV-D-01: ValidatorAttestationEnvelope.attestation_type ∈ {'EVIDENCE', 'OBSERVATION'}
INV-D-02: attestation_type = 'AUTHORITY' → TypeScript compile error (absent from union)
INV-D-03: is_epoch_stale = 1 → attestation_type = 'OBSERVATION' (enforced by vaer_stale_cannot_be_evidence)
INV-D-04: is_topology_visible = 0 → attestation_type = 'OBSERVATION' (enforced by vaer_invisible_cannot_be_evidence)
INV-D-05: OBSERVATION envelopes contribute 0 to weight_approved in evaluateWeightedQuorum()
INV-D-06: validator disagreement on object_hash → classifyFromValidatorAttestations() = AMBIGUOUS
INV-D-07: single EVIDENCE envelope → Q = false → ceiling = LOCAL_VALID
INV-D-08: quorum_met = 0 → Q = false → ceiling = LOCAL_VALID
INV-D-09: quorum_met = 1 AND epochStatus = EPOCH_GLOBAL_AUTHORITATIVE → may reach GLOBAL_VALID
           (via classifyFromPredicates with Q=true, subject to all other base predicates)
INV-D-10: validator_attestation_envelope_registry is append-only (no UPDATE, no DELETE)
INV-D-11: creates_authority = 0 on every ValidatorAttestationEnvelope record (type + DB + trigger)
INV-D-12: evidence_only = 1 on every ValidatorAttestationEnvelope record
INV-D-13: raw_production_apply_path = 'DENIED' on every ValidatorAttestationEnvelope record
INV-D-14: epoch_id must reference a record in epoch_registry (vaer_epoch_must_exist trigger)
INV-D-15: quorum evidence ≠ authority; quorum evidence is a predicate input to classification only
```

---

## 6. Acceptance Criteria Traceability

| Criterion (from #1440) | Deliverable | Verification |
|------------------------|-------------|--------------|
| ValidatorAttestationEnvelope exists as typed object | D1: type in quorum-attestation.ts | TypeScript compilation |
| attestation_type cannot be 'AUTHORITY' | D1: type union; D2: CHECK constraint + vaer_stale_cannot_be_evidence; D4: type test | Type error + trigger test |
| Stale epoch attestation cannot contribute to GLOBAL_VALID | D1: is_epoch_stale flag; D2: vaer_stale_cannot_be_evidence trigger; D4: stale path test | CONF-DIST-06 test suite |
| Topology-invisible validator → OBSERVATIONAL only | D1: isAttestationTopologyVisible(); D2: vaer_invisible_cannot_be_evidence trigger | D4 topology-invisible test |
| Quorum disagreement → AMBIGUOUS or CONFLICTED, never GLOBAL_VALID | D1: classifyFromValidatorAttestations() disagree path; D3: fixture; D4: CONF-DIST-06 test | CONF-DIST-06 pass |
| CONF-DIST-06 fixture exists and passes | D3 + D4 | CI green |
| No validator attestation path creates authority | D1: creates_authority=0 const; D2: creates_authority CHECK; D4: module-level test | Exhaustive type + schema tests |

---

## 7. File Touch Map

```text
MODIFY   src/lib/quorum-attestation.ts
         + ValidatorAttestationType
         + ValidatorAttestationEnvelope
         + buildValidatorAttestationId()
         + isAttestationEpochStale()
         + isAttestationTopologyVisible()
         + classifyFromValidatorAttestations()

CREATE   migrations/0055_validator_attestation_envelope.sql
         + validator_attestation_envelope_registry table
         + all indexes
         + all triggers (vaer_no_update, vaer_no_delete, vaer_epoch_must_exist,
                         vaer_quorum_attestation_must_exist, vaer_stale_cannot_be_evidence,
                         vaer_invisible_cannot_be_evidence)

CREATE   tests/fixtures/stage2/quorum_disagreement.json
         + CONF-DIST-06 fixture

CREATE   tests/fate/stage2-conf-dist-06.test.mjs
         + 26 test cases

MODIFY   conformance/suites/stage2-distributed-legitimacy-conformance.json
         + CONF-DIST-06 status: PENDING → IMPLEMENTED
         + test, required_migration, classification_layer, db_guard fields added
```

No other files are touched. Five deliverables total.

---

## 8. Dependency Graph

```text
Slice B (MERGED): finality-classification.ts + CONVERGENCE_VALID
    ↓ classifyFromPredicates() with Q predicate input
Slice C (MERGED): epoch-substrate.ts + classifyFromPredicates epochStatus coupling
    ↓ epoch validity enforced at classification layer
Slice D (THIS): ValidatorAttestationEnvelope + classifyFromValidatorAttestations()
    ↓ Q predicate evidence → classifyFromPredicates()
    ↓ quorum_disagreement.json fixture → CONF-DIST-06 test
    ↓ validator_attestation_envelope_registry (0055)

Slice E (NEXT):   conflict-set settlement, losing-branch preservation (CONF-DIST-05, CONF-DIST-10)
Slice F (NEXT+1): distributed replay convergence (CONF-DIST-03, CONF-DIST-15)
```

Slice D is a prerequisite for Slice E (conflict-set settlement references
quorum evidence when scoring competing heads). Slice D is independent of
Slices F–L.

---

## 9. Non-Goals

This slice explicitly does not:

- Implement consensus
- Create authority of any kind
- Deploy or mutate production state
- Generate cryptographic proof
- Widen execution authority surfaces
- Implement a production federation service
- Simulate live validator attestation
- Mutate legitimacy state
- Restore consumed replay eligibility
- Open PRs beyond the planning artifact
- Create validator identity or federation topology

---

## 10. Closure State

```text
validator attestation envelope:  MISSING → PRESENT
quorum evidence model:           PARTIAL → CONSTRAINED
attestation_type = 'AUTHORITY':  possible → type-impossible + DB-impossible
CONF-DIST-06:                    PENDING → IMPLEMENTED
execution eligibility:           UNCHANGED
```

Execution eligibility remains NULL unless separately authorized through valid
MindShift authority lineage. This plan does not advance execution eligibility.

---

## 11. Slice D References

| Reference | Document |
|-----------|----------|
| Anchor issue | #1440 (ValidatorAttestationEnvelope Definition and Non-Authority Attestation Constraints) |
| Conformance spec | #1442 (Stage 2 Distributed Legitimacy Conformance Suite) |
| Convergence plan | #1418 (Deterministic Distributed Legitimacy Convergence) |
| Finality classification | #1340 (Operationalize finality classification registry) |
| Master plan | docs/stage2-distributed-legitimacy-enforcement-plan-v1.md §14 (Slice D) |
| Formal finality spec | PARTITION_FINALITY_SEMANTICS.md §9–11 |
| Quorum attestation registry | migrations/0050_quorum_attestation_registry.sql |
| Epoch registry | migrations/0052_epoch_registry.sql |
| Prior slice (C) | migrations/0054_epoch_settlement_coupling.sql |
