-- Historical duplicate proof lineage quarantine is deterministic, replay-neutral evidence only.
CREATE TABLE IF NOT EXISTS proof_quarantine_registry (
  quarantine_id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL,
  lineage_hash TEXT NOT NULL,
  quarantine_reason TEXT NOT NULL,
  canonical_proof_selected TEXT NOT NULL,
  duplicate_proof_archived TEXT NOT NULL,
  quarantine_generated_at TEXT NOT NULL,
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true')
);
