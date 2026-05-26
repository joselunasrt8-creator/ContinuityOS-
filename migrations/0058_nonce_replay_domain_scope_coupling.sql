-- Extend invocation replay keys with nonce domain/scope + candidate hash coupling.
ALTER TABLE invocation_registry ADD COLUMN nonce_domain TEXT NOT NULL DEFAULT 'session';
ALTER TABLE invocation_registry ADD COLUMN nonce_scope TEXT NOT NULL DEFAULT '';
ALTER TABLE invocation_registry ADD COLUMN nonce_epoch TEXT NOT NULL DEFAULT '';
ALTER TABLE invocation_registry ADD COLUMN candidate_hash TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invocation_registry_nonce_domain_scope
  ON invocation_registry(nonce_domain, nonce_scope, invocation_nonce);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invocation_registry_nonce_global
  ON invocation_registry(invocation_nonce);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invocation_registry_nonce_candidate_coupling
  ON invocation_registry(nonce_domain, nonce_scope, invocation_nonce, candidate_hash);
