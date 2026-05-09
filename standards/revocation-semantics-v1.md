# MindShift Revocation Semantics v1

Revocation propagates downward: identity → continuity → authority → validation → execution → proof eligibility. Any revoked upstream object resolves NULL. Session revocation invalidates active authority, pending validation, executable lineage, and resumable execution. Continuity revocation cascades to child continuities and delegated authority.
