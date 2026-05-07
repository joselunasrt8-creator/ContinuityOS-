-- Harden proof lifecycle closure against duplicate proof lineage persistence.
-- Historical non-atomic proof rows are quarantined before the unique guard is enforced.
CREATE TABLE IF NOT EXISTS proof_registry_duplicate_archive (
  archive_id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  surface TEXT,
  run_id TEXT,
  commit_sha TEXT,
  workflow TEXT,
  environment TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  archive_reason TEXT NOT NULL,
  canonical_proof_id TEXT NOT NULL,
  UNIQUE(proof_id)
);

INSERT OR IGNORE INTO proof_registry_duplicate_archive (
  archive_id,
  proof_id,
  session_id,
  execution_id,
  decision_id,
  validated_object_hash,
  surface,
  run_id,
  commit_sha,
  workflow,
  environment,
  created_at,
  archived_at,
  archive_reason,
  canonical_proof_id
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
  p.proof_id,
  p.session_id,
  p.execution_id,
  p.decision_id,
  p.validated_object_hash,
  p.surface,
  p.run_id,
  p.commit_sha,
  p.workflow,
  p.environment,
  p.created_at,
  datetime('now'),
  'duplicate_proof_lineage',
  (
    SELECT c.proof_id
    FROM proof_registry c
    WHERE c.decision_id = p.decision_id
      AND c.validated_object_hash = p.validated_object_hash
    ORDER BY c.created_at ASC, c.rowid ASC
    LIMIT 1
  )
FROM proof_registry p
WHERE EXISTS (
  SELECT 1
  FROM proof_registry earlier
  WHERE earlier.decision_id = p.decision_id
    AND earlier.validated_object_hash = p.validated_object_hash
    AND (
      earlier.created_at < p.created_at
      OR (earlier.created_at = p.created_at AND earlier.rowid < p.rowid)
    )
);

DELETE FROM proof_registry
WHERE rowid IN (
  SELECT p.rowid
  FROM proof_registry p
  WHERE EXISTS (
    SELECT 1
    FROM proof_registry earlier
    WHERE earlier.decision_id = p.decision_id
      AND earlier.validated_object_hash = p.validated_object_hash
      AND (
        earlier.created_at < p.created_at
        OR (earlier.created_at = p.created_at AND earlier.rowid < p.rowid)
      )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique
  ON proof_registry (decision_id, validated_object_hash);
