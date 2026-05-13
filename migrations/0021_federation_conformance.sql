-- Federation conformance observations are append-only, replay-neutral evidence.
-- Canonical invariant: remote legitimacy evidence never becomes local execution authority.
CREATE TABLE IF NOT EXISTS federation_conformance_registry (
  conformance_id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  remote_runtime_id TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  checkpoint_hash TEXT NOT NULL,
  compatibility_hash TEXT NOT NULL,
  conformance_status TEXT NOT NULL,
  drift_classes TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_federation_conformance_registry_envelope_unique
  ON federation_conformance_registry(envelope_id);

CREATE INDEX IF NOT EXISTS idx_federation_conformance_registry_runtime
  ON federation_conformance_registry(runtime_id, remote_runtime_id, conformance_status);

CREATE INDEX IF NOT EXISTS idx_federation_conformance_registry_semantics
  ON federation_conformance_registry(fingerprint_hash, checkpoint_hash, compatibility_hash);

CREATE TRIGGER IF NOT EXISTS trg_federation_conformance_registry_no_update
BEFORE UPDATE ON federation_conformance_registry
BEGIN
  SELECT RAISE(ABORT, 'federation_conformance_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_federation_conformance_registry_no_delete
BEFORE DELETE ON federation_conformance_registry
BEGIN
  SELECT RAISE(ABORT, 'federation_conformance_registry is append-only');
END;
