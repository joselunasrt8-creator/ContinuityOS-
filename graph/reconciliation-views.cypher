MATCH (a:AuthorityClass)-[:OVERRIDES|ADMINISTERS|MUTATES]->(runtime:Topology)
RETURN
  a.id AS authority_class,
  labels(a)[0] AS authority_type,
  runtime.id AS runtime_target
ORDER BY authority_class;

MATCH (d:DriftClass)-[:THREATENS]->(target)
RETURN
  d.id AS drift_class,
  d.severity AS severity,
  labels(target)[0] AS threatened_type,
  target.id AS threatened_target
ORDER BY severity DESC;

MATCH (continuity:GovernanceArtifact)-[:REQUIRES]->(dependency)
RETURN
  continuity.id AS governance_artifact,
  dependency.id AS required_dependency
ORDER BY governance_artifact;

MATCH (governance:Topology)-[:RECONCILES]->(drift:DriftClass)
RETURN
  governance.id AS governance_layer,
  drift.id AS reconciled_drift,
  drift.severity AS severity
ORDER BY severity DESC;

MATCH (runtime:Topology)-[:OBSERVED_BY]->(surface)
RETURN
  runtime.id AS runtime_layer,
  surface.id AS observing_surface
ORDER BY observing_surface;

MATCH (runtime:Topology)-[:PROTECTED_BY]->(control)
RETURN
  runtime.id AS runtime_layer,
  control.id AS protection_control
ORDER BY protection_control;

MATCH (runtime:Topology)-[:CONSTRAINED_BY]->(authority)
RETURN
  runtime.id AS runtime_layer,
  authority.id AS constraining_authority
ORDER BY constraining_authority;

MATCH (runtime:Topology)-[:BOUNDED_BY]->(boundary)
RETURN
  runtime.id AS runtime_layer,
  boundary.id AS constitutional_boundary
ORDER BY constitutional_boundary;

MATCH (surface:GovernanceArtifact)-[:OBSERVES]->(runtime:Topology)
OPTIONAL MATCH (surface)-[:DRIFT_DETECTS]->(runtime)
RETURN
  surface.id AS execution_surface,
  runtime.id AS observed_runtime,
  COUNT(*) AS observation_edges
ORDER BY observation_edges DESC;

MATCH (authority:GovernanceArtifact)-[:BOUNDS]->(root:AuthorityClass)
RETURN
  authority.id AS governance_authority,
  root.id AS bounded_root_authority
ORDER BY bounded_root_authority;
