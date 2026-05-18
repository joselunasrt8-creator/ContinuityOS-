MATCH path = (authority:GovernanceArtifact)-[:AUTHORIZES|BOUNDS*1..5]->(target)
RETURN
  authority.id AS authority_origin,
  target.id AS authority_target,
  path
ORDER BY authority_origin;

MATCH path = (continuity:GovernanceArtifact)-[:REQUIRES|ASSUMES|BINDS*1..6]->(dependency)
RETURN
  continuity.id AS continuity_origin,
  dependency.id AS continuity_dependency,
  path
ORDER BY continuity_origin;

MATCH path = (runtime:Topology)-[:CONSTRAINED_BY|PROTECTED_BY|OBSERVED_BY|BOUNDED_BY*1..5]->(boundary)
RETURN
  runtime.id AS runtime_origin,
  boundary.id AS runtime_boundary,
  path
ORDER BY runtime_origin;

MATCH path = (drift:DriftClass)-[:THREATENS*1..5]->(target)
RETURN
  drift.id AS drift_origin,
  target.id AS threatened_target,
  path
ORDER BY drift_origin;

MATCH path = (governance:Topology)-[:RECONCILES*1..5]->(drift)
RETURN
  governance.id AS governance_origin,
  drift.id AS reconciled_drift,
  path
ORDER BY governance_origin;

MATCH path = (surface:GovernanceArtifact)-[:OBSERVES|DRIFT_DETECTS*1..5]->(runtime)
RETURN
  surface.id AS observability_origin,
  runtime.id AS observed_runtime,
  path
ORDER BY observability_origin;

MATCH path = (root:AuthorityClass)-[:OVERRIDES|ADMINISTERS|MUTATES*1..5]->(runtime)
RETURN
  root.id AS root_authority,
  runtime.id AS runtime_target,
  path
ORDER BY root_authority;

MATCH path = (identity:ContinuityAssumption)-[:BINDS|ENABLES*1..5]->(runtime)
RETURN
  identity.id AS continuity_anchor,
  runtime.id AS enabled_runtime,
  path
ORDER BY continuity_anchor;

MATCH path = (mutation:GovernanceArtifact)-[:PROTECTS|DRIFT_CONSTRAINS|DETECTS*1..5]->(drift)
RETURN
  mutation.id AS governance_control,
  drift.id AS constrained_drift,
  path
ORDER BY governance_control;

MATCH path = (runtime:Topology)-[:GOVERNED_BY|REQUIRES|CONSTRAINED_BY|OBSERVED_BY|PROTECTED_BY|BOUNDED_BY*1..10]->(target)
RETURN
  runtime.id AS runtime_root,
  target.id AS reachable_target,
  length(path) AS traversal_depth,
  path
ORDER BY traversal_depth DESC;
