UPDATE proof_registry
SET decision_hash = decision_id || char(31) || validated_object_hash
WHERE decision_hash IS NULL OR decision_hash = '';

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
    WHERE c.decision_hash = p.decision_hash
    ORDER BY c.created_at ASC, c.rowid ASC
    LIMIT 1
  )
FROM proof_registry p
WHERE EXISTS (
  SELECT 1
  FROM proof_registry earlier
  WHERE earlier.decision_hash = p.decision_hash
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
    WHERE earlier.decision_hash = p.decision_hash
      AND (
        earlier.created_at < p.created_at
        OR (earlier.created_at = p.created_at AND earlier.rowid < p.rowid)
      )
  )
);

DROP INDEX IF EXISTS idx_proof_registry_execution_decision_hash_unique;
DROP INDEX IF EXISTS idx_proof_registry_decision_hash_unique;
DROP TRIGGER IF EXISTS trg_proof_registry_decision_hash_guard;

CREATE TRIGGER IF NOT EXISTS trg_proof_registry_decision_hash_guard
BEFORE INSERT ON proof_registry
WHEN NEW.decision_hash IS NULL
  OR NEW.decision_hash = ''
  OR NEW.decision_hash != NEW.decision_id || char(31) || NEW.validated_object_hash
BEGIN
  SELECT RAISE(ABORT, 'proof_registry decision_hash mismatch');
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique
ON proof_registry (
  execution_id,
  decision_id,
  validated_object_hash
);
