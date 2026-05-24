import { canonicalize, hashCanonical } from '../src/canonical.js';

export { canonicalize, hashCanonical };

export const PORTABILITY_DRIFT_CLASSES = Object.freeze({
  BUNDLE_HASH_DIVERGENCE: "BUNDLE_HASH_DIVERGENCE",
  PORTABILITY_SCOPE_ESCAPE: "PORTABILITY_SCOPE_ESCAPE",
  REMOTE_PROOF_CONTAMINATION: "REMOTE_PROOF_CONTAMINATION",
  NON_CANONICAL_EXPORT: "NON_CANONICAL_EXPORT",
  AUTHORITY_PORTABILITY_ATTEMPT: "AUTHORITY_PORTABILITY_ATTEMPT",
  BUNDLE_LINEAGE_FRAGMENTATION: "BUNDLE_LINEAGE_FRAGMENTATION"
});

export function generatePortableLegitimacyBundle({
  runtime_id,
  topology_hash,
  proofs,
  authorities = [],
  scope = "bounded"
}) {
  if (authorities.length > 0) {
    return {
      status: "NULL",
      drift:
        PORTABILITY_DRIFT_CLASSES.AUTHORITY_PORTABILITY_ATTEMPT
    };
  }

  if (scope !== "bounded") {
    return {
      status: "NULL",
      drift:
        PORTABILITY_DRIFT_CLASSES.PORTABILITY_SCOPE_ESCAPE
    };
  }

  const bundle = {
    runtime_id,
    topology_hash,
    proofs,
    replay_neutral: true,
    append_only: true,
    observability_only: true,
    authority_portable: false
  };

  return {
    status: "VALID",
    bundle,
    bundle_hash: hashCanonical(bundle)
  };
}
