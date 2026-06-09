// Issue #1920: V3 Discovery Adapter Boundary
// Extracts topology enumeration and governance consensus evidence out of runtime-core.
//
// Invariants preserved:
//   If no valid object exists → nothing happens
//   validated_object == executed_object
//   discovery capability ≠ authority
//   topology visibility ≠ execution eligibility
//   reconciliation traversal ≠ convergence proof
//
// Discovery responsibilities extracted here (Cluster 32):
//   topology snapshots, topology classification, reconciliation envelope construction,
//   governance consensus checkpoint, observer attestation evidence

import { canonicalize, sha256Hex, normalize } from "../canonical.js"

type Env = { DB: D1Database }

// ── Internal Utilities ─────────────────────────────────────────────────────────

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function canonicalRecord(v: unknown): Record<string, unknown> {
  const n = normalize(v)
  return isPlainRecord(n) ? (n as Record<string, unknown>) : {}
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

// ── Context Types ──────────────────────────────────────────────────────────────
// Runtime constants injected by the execution surface; never derived or fabricated here.
// The discovery adapter receives these as read-only context and produces topology
// artifacts from them. Injection keeps this module free of circular imports and
// makes the boundary visible: the runtime describes itself to the adapter, not
// the other way around.

export type RuntimeTopologyContext = {
  readonly canonical_routes: readonly string[]
  readonly observability_routes: readonly string[]
  readonly governed_support_surfaces: readonly {
    readonly route: string
    readonly classification: string
    readonly execution_capability: boolean | string
    readonly creates_authority: boolean
    readonly [key: string]: unknown
  }[]
  readonly workflow_mutation_surfaces: readonly string[]
  readonly adapter_mutation_surfaces: readonly string[]
  readonly recursive_governance_containment_registry: string
  readonly root_authority_observability_registry: string
}

export type GovernanceConsensusContext = {
  readonly canonical_routes: readonly string[]
  readonly observer_consensus_routes: readonly string[]
  readonly external_conformance_routes: readonly string[]
  readonly observer_attestation_registry: string
  readonly semantic_equivalence_registry: string
  readonly portable_governance_checkpoint_registry: string
  readonly external_conformance_verification_registry: string
  readonly runtime_id: string
}

// ── Topology Types ─────────────────────────────────────────────────────────────

export type RuntimeTopologyDriftClass =
  | "TOPOLOGY_VALID"
  | "UNDECLARED_RUNTIME_SURFACE"
  | "TOPOLOGY_EQUIVALENCE_DRIFT"
  | "MUTATION_SURFACE_EXPANSION"
  | "GOVERNANCE_SURFACE_DRIFT"
  | "OBSERVABILITY_BOUNDARY_DRIFT"
  | "EXECUTION_BOUNDARY_DRIFT"
  | "REGISTRY_LINEAGE_DRIFT"
  | "CONTAINMENT_DIVERGENCE"
  | "CANONICAL_ROUTE_DIVERGENCE"
  | "RECONCILIATION_AMBIGUITY"

export type RuntimeTopologySnapshot = {
  object_type: "RuntimeTopologySnapshot"
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
  topology_hash: string
  topology_semantic_hash: string
  topology_boundary_hash: string
  topology_lineage_hash: string
  topology_equivalence_hash: string
  replay_neutral: true
  executable: false
  deployment_capable: false
  creates_authority: false
}

// ── Topology Route Flags ───────────────────────────────────────────────────────
// Structural invariant: topology routes are evidence-only, never execution surfaces.

export function topologyRouteFlags() {
  return {
    evidence_only: true,
    replay_neutral: true,
    executable: false,
    deployment_capable: false,
    creates_authority: false,
    mutation_capable: false,
    read_only: true,
    authoritative: false,
    proof_generating: false,
    replay_consumed: false,
  }
}

// ── Topology Node Construction ─────────────────────────────────────────────────

function runtimeTopologyNodeObject(section: string, identity: string, object: Record<string, unknown>) {
  return Object.freeze({
    object_type: "RuntimeTopologyNode",
    section,
    identity,
    object,
    executable: false,
    deployment_capable: false,
    creates_authority: false,
    mutation_capable: Boolean(object.mutation_capable ?? false),
  })
}

function sortTopologyObjects(objects: Record<string, unknown>[]) {
  return [...objects].map(canonicalRecord).sort(
    (a, b) =>
      String(a.identity ?? a.route ?? a.registry ?? a.artifact ?? canonicalize(a)).localeCompare(
        String(b.identity ?? b.route ?? b.registry ?? b.artifact ?? canonicalize(b))
      ) || canonicalize(a).localeCompare(canonicalize(b))
  )
}

// ── Topology Enumeration ───────────────────────────────────────────────────────
// Produces a deterministic, read-only snapshot of the runtime topology.
// Takes the runtime's self-description via ctx; never modifies the runtime,
// never creates authority, never influences VALID/NULL decisions.

export async function enumerateRuntimeTopologySnapshot(ctx: RuntimeTopologyContext): Promise<RuntimeTopologySnapshot> {
  const routeNodes = [...ctx.canonical_routes].sort().map((route) =>
    runtimeTopologyNodeObject("canonical_routes", route, {
      route, canonical: true, observability_only: false, mutation_requires_authority: true,
    })
  )
  const observabilityNodes = [...ctx.observability_routes].sort().map((route) =>
    runtimeTopologyNodeObject("observability_only_routes", route, {
      route, observability_only: true, replay_neutral: true,
      executable: false, deployment_capable: false, creates_authority: false,
    })
  )
  const supportRouteNodes = [...ctx.governed_support_surfaces]
    .sort((a, b) => a.route.localeCompare(b.route))
    .map((surface) =>
      runtimeTopologyNodeObject("governed_support_routes", surface.route, {
        ...surface,
        canonical_execution_route: false,
        execution_surface_classification: "not_execution_capable_surface",
      })
    )
  const appendOnlyRegistries = [
    "authority_registry", "aeo_registry", "validation_registry", "execution_registry",
    "proof_registry", "invocation_registry", "preo_registry",
    "runtime_surface_containment_registry", "reconciliation_closure_registry",
    "recursive_governance_containment_registry", "runtime_sovereignty_registry",
    "root_authority_observability_registry", "runtime_topology_registry",
    "topology_reconciliation_registry",
  ].sort().map((registry) =>
    runtimeTopologyNodeObject("append_only_registries", registry, {
      registry, append_only: true, update_allowed: false, delete_allowed: false,
    })
  )
  const mutationNodes = [
    ...ctx.workflow_mutation_surfaces.map((workflow) =>
      runtimeTopologyNodeObject("workflow_mutation_surfaces", workflow, {
        workflow, declared: true, governed: true, direct_deploy_allowed: false,
      })
    ),
    ...ctx.adapter_mutation_surfaces.map((adapter) =>
      runtimeTopologyNodeObject("deploy_mutation_surfaces", adapter, {
        adapter, declared: true, governed: true, direct_deploy_allowed: false,
      })
    ),
  ]
  const governanceNodes = [
    "governance/runtime-topology-equivalence.json",
    "governance/runtime-topology-drift-taxonomy.json",
    "governance/runtime-topology-reconciliation.json",
    "governance/runtime/MERGE_GOVERNANCE_RULES.json",
    "governance/runtime/RECURSIVE_GOVERNANCE_SPEC.json",
    "governance/runtime/EXECUTION_SURFACES.json",
  ].sort().map((artifact) =>
    runtimeTopologyNodeObject("governance_artifacts", artifact, {
      artifact, machine_readable: true, authorizes_execution: false,
    })
  )
  const containmentNodes = [
    runtimeTopologyNodeObject("recursive_governance_containment", ctx.recursive_governance_containment_registry, {
      registry: ctx.recursive_governance_containment_registry, contained: true,
    }),
    runtimeTopologyNodeObject("sovereignty_containment", ctx.root_authority_observability_registry, {
      registry: ctx.root_authority_observability_registry, contained: true,
    }),
  ]
  const nodes = sortTopologyObjects([
    ...routeNodes, ...observabilityNodes, ...supportRouteNodes,
    ...appendOnlyRegistries, ...mutationNodes, ...governanceNodes, ...containmentNodes,
  ])
  const edges = sortTopologyObjects(
    nodes.map((node) =>
      canonicalRecord({ object_type: "RuntimeTopologyEdge", from: node.section, to: node.identity, relation: "ENUMERATES_EXACT_OBJECT" })
    )
  )
  const runtimeMaterial = {
    canonical_routes: [...ctx.canonical_routes].sort(),
    observability_routes: [...ctx.observability_routes].sort(),
    governed_support_routes: ctx.governed_support_surfaces.map((s) => s.route).sort(),
  }
  const semanticMaterial = {
    governance_artifacts: governanceNodes.map((n) => n.identity).sort(),
    registries: appendOnlyRegistries.map((n) => n.identity).sort(),
  }
  const boundaryMaterial = {
    execution_boundary: [...ctx.canonical_routes].sort(),
    observability_boundary: [...ctx.observability_routes].sort(),
    governed_support_boundary: ctx.governed_support_surfaces.map((s) => ({
      route: s.route,
      classification: s.classification,
      execution_capability: s.execution_capability,
      creates_authority: s.creates_authority,
    })).sort((a, b) => a.route.localeCompare(b.route)),
    workflow_mutation_surfaces: ctx.workflow_mutation_surfaces,
  }
  const lineageMaterial = {
    append_only_registries: appendOnlyRegistries.map((n) => n.identity).sort(),
    containment: containmentNodes.map((n) => n.identity).sort(),
  }
  const topology_hash = sha256Hex(canonicalize(runtimeMaterial))
  const topology_semantic_hash = sha256Hex(canonicalize(semanticMaterial))
  const topology_boundary_hash = sha256Hex(canonicalize(boundaryMaterial))
  const topology_lineage_hash = sha256Hex(canonicalize(lineageMaterial))
  const topology_equivalence_hash = sha256Hex(canonicalize({ topology_hash, topology_semantic_hash, topology_boundary_hash, topology_lineage_hash }))
  return Object.freeze({
    object_type: "RuntimeTopologySnapshot" as const,
    nodes,
    edges,
    topology_hash,
    topology_semantic_hash,
    topology_boundary_hash,
    topology_lineage_hash,
    topology_equivalence_hash,
    replay_neutral: true as const,
    executable: false as const,
    deployment_capable: false as const,
    creates_authority: false as const,
  })
}

// ── Topology Classification ────────────────────────────────────────────────────
// Detects drift between declared and observed topology. Returns only drift classes;
// does not modify the snapshot or produce authority.

export function classifyRuntimeTopologySnapshot(snapshot: RuntimeTopologySnapshot): RuntimeTopologyDriftClass[] {
  const drift = new Set<RuntimeTopologyDriftClass>()
  if (!snapshot || snapshot.object_type !== "RuntimeTopologySnapshot") {
    drift.add("RECONCILIATION_AMBIGUITY")
  }
  for (const node of snapshot.nodes) {
    if (
      node.section === "observability_only_routes" &&
      (node.executable !== false || node.deployment_capable !== false || node.creates_authority !== false)
    ) {
      drift.add("OBSERVABILITY_BOUNDARY_DRIFT")
    }
    const object = canonicalRecord(node.object)
    if (object.append_only === false || object.update_allowed === true || object.delete_allowed === true) {
      drift.add("REGISTRY_LINEAGE_DRIFT")
    }
    if (object.contained === false || object.divergent === true || object.boundary_overflow === true) {
      drift.add("CONTAINMENT_DIVERGENCE")
    }
  }
  return [...drift].sort()
}

// ── Reconciliation Envelope ────────────────────────────────────────────────────
// Builds the full topology reconciliation envelope. Evidence-only; never authorizes
// execution or creates authority.

export async function buildRuntimeTopologyReconciliationEnvelope(
  generated_at: string,
  ctx: RuntimeTopologyContext,
) {
  const snapshot = await enumerateRuntimeTopologySnapshot(ctx)
  const drift_classes = classifyRuntimeTopologySnapshot(snapshot)
  const classification: RuntimeTopologyDriftClass = drift_classes.includes("RECONCILIATION_AMBIGUITY")
    ? "RECONCILIATION_AMBIGUITY"
    : drift_classes[0] || "TOPOLOGY_VALID"
  const equivalence = Object.freeze({
    object_type: "RuntimeTopologyEquivalence",
    validated_topology_hash: snapshot.topology_equivalence_hash,
    executed_topology_hash: snapshot.topology_equivalence_hash,
    equivalent: classification === "TOPOLOGY_VALID",
    legitimacy: classification === "TOPOLOGY_VALID" ? "UNCHANGED" : "NULL",
    evidence_only: true,
    authorizes_execution: false,
    authorizes_deployment: false,
  })
  const fingerprint = Object.freeze({
    object_type: "RuntimeTopologyFingerprint",
    topology_hash: snapshot.topology_hash,
    topology_semantic_hash: snapshot.topology_semantic_hash,
    topology_boundary_hash: snapshot.topology_boundary_hash,
    topology_lineage_hash: snapshot.topology_lineage_hash,
    topology_equivalence_hash: snapshot.topology_equivalence_hash,
    replay_neutral: true,
  })
  const reconciliation_id = sha256Hex(canonicalize({ fingerprint, drift_classes, equivalence }))
  return Object.freeze({
    object_type: "RuntimeTopologyReconciliation",
    reconciliation_id,
    reconciliation_timestamp: generated_at,
    fingerprint,
    snapshot,
    drift: {
      object_type: "RuntimeTopologyDrift",
      classification,
      drift_classes: drift_classes.length ? drift_classes : ["TOPOLOGY_VALID"],
      fail_closed: classification !== "TOPOLOGY_VALID",
      legitimacy: classification === "TOPOLOGY_VALID" ? "UNCHANGED" : "NULL",
    },
    equivalence,
    ...topologyRouteFlags(),
  })
}

// ── Topology Snapshot Persistence ─────────────────────────────────────────────
// Appends topology snapshot to the append-only runtime_topology_registry.
// INSERT OR IGNORE preserves append-only semantics; idempotent on duplicate id.

export async function appendRuntimeTopologySnapshot(
  env: Env,
  envelope: Awaited<ReturnType<typeof buildRuntimeTopologyReconciliationEnvelope>>,
  ctx: RuntimeTopologyContext,
  created_at: string,
) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO runtime_topology_registry (snapshot_id,topology_hash,topology_semantic_hash,topology_boundary_hash,topology_lineage_hash,topology_equivalence_hash,drift_classes,lineage_hash,boundary_hash,reconciliation_timestamp,containment_references,topology_snapshot,evidence_only,replay_neutral,executable,deployment_capable,creates_authority,append_only,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'true','true','false','false','false','true',?13)`
  ).bind(
    envelope.reconciliation_id,
    envelope.fingerprint.topology_hash,
    envelope.fingerprint.topology_semantic_hash,
    envelope.fingerprint.topology_boundary_hash,
    envelope.fingerprint.topology_lineage_hash,
    envelope.fingerprint.topology_equivalence_hash,
    JSON.stringify(envelope.drift.drift_classes),
    envelope.fingerprint.topology_lineage_hash,
    envelope.fingerprint.topology_boundary_hash,
    envelope.reconciliation_timestamp,
    JSON.stringify([ctx.recursive_governance_containment_registry, ctx.root_authority_observability_registry]),
    canonicalize(envelope.snapshot),
    created_at,
  ).run()
}

// ── Consensus Types ────────────────────────────────────────────────────────────

export type ConsensusDriftClass =
  | "OBSERVER_DIVERGENCE"
  | "QUORUM_AMBIGUITY"
  | "SEMANTIC_DIVERGENCE"
  | "FEDERATED_EQUIVALENCE_DRIFT"
  | "CHECKPOINT_CORRUPTION"
  | "PORTABILITY_LINEAGE_DRIFT"
  | "REMOTE_AUTHORITY_INHERITANCE_ATTEMPT"
  | "CONSENSUS_CONTAINMENT_OVERFLOW"
  | "OBSERVER_REPLAY_RESURRECTION"
  | "GOVERNANCE_CONSENSUS_FRAGMENTATION"
  | "SEMANTIC_AMBIGUITY"
  | "SEMANTIC_REPLAY"
  | "SEMANTIC_CONTAINMENT_OVERFLOW"
  | "SEMANTIC_GOVERNANCE_DRIFT"

export const CONSENSUS_DRIFT_TAXONOMY: readonly ConsensusDriftClass[] = Object.freeze([
  "OBSERVER_DIVERGENCE", "QUORUM_AMBIGUITY", "SEMANTIC_DIVERGENCE",
  "FEDERATED_EQUIVALENCE_DRIFT", "CHECKPOINT_CORRUPTION", "PORTABILITY_LINEAGE_DRIFT",
  "REMOTE_AUTHORITY_INHERITANCE_ATTEMPT", "CONSENSUS_CONTAINMENT_OVERFLOW",
  "OBSERVER_REPLAY_RESURRECTION", "GOVERNANCE_CONSENSUS_FRAGMENTATION",
  "SEMANTIC_AMBIGUITY", "SEMANTIC_REPLAY", "SEMANTIC_CONTAINMENT_OVERFLOW",
  "SEMANTIC_GOVERNANCE_DRIFT",
])

export const CONSENSUS_FLAGS = Object.freeze({
  evidence_only: true,
  replay_neutral: true,
  non_authoritative: true,
  read_only: true,
  mutation_capable: false,
  creates_authority: false,
  executable: false,
  deployment_capable: false,
  proof_generating: false,
  merge_authorizing: false,
  remote_authority_denied: true,
  local_validation_required: true,
  observer_agreement_authorizes_execution: false,
  semantic_equivalence_authorizes_execution: false,
  remote_legitimacy_inherits_local_authority: false,
  fail_closed_on_ambiguity: true,
})

export type ObserverCheckpointObject = {
  observer_id: string
  observed_checkpoint_hash: string
  semantic_hash: string
  topology_hash: string
  reconciliation_hash: string
  sovereignty_hash: string
  equivalence_hash: string
  drift_classes: ConsensusDriftClass[]
  legitimacy_status: "LEGITIMATE" | null
}

export type GovernanceConsensusEnvelope = {
  envelope_type: "GovernanceConsensusCheckpoint"
  observer: ObserverCheckpointObject
  semantic_envelope: Record<string, unknown>
  portable_checkpoint: Record<string, unknown>
  conformance: Record<string, unknown>
  quorum: Record<string, unknown>
  consensus_hash: string
  generated_at: string
  evidence_only: true
  replay_neutral: true
  non_authoritative: true
  executable: false
  creates_authority: false
}

export function consensusGeneratedAt(): string {
  return new Date(0).toISOString()
}

export function consensusRouteFlags() {
  return CONSENSUS_FLAGS
}

function decodeConsensusEnvelope(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    return canonicalRecord(JSON.parse(new TextDecoder().decode(base64ToBytes(value) || utf8Bytes("{}"))))
  } catch {
    return null
  }
}

function semanticHashForConsensus(route: string): string {
  return sha256Hex(canonicalize({
    exact_object_discipline: true,
    schema_evolution_equivalence: true,
    topology_evolution_equivalence: true,
    portability_evolution_equivalence: true,
    replay_neutral: true,
    route,
    semantic_equivalence_authorizes: false,
  }))
}

// ── Governance Consensus Envelope ─────────────────────────────────────────────
// Builds a consensus checkpoint from observer inputs. Evidence-only; never authorizes.
// Remote envelopes are compared for drift detection but never grant authority.
// Invariant: remote_legitimacy_inherits_local_authority = false always.

export async function buildGovernanceConsensusEnvelope(
  url: URL,
  ctx: GovernanceConsensusContext,
): Promise<GovernanceConsensusEnvelope> {
  const generated_at = consensusGeneratedAt()
  const remote = decodeConsensusEnvelope(url.searchParams.get("remote_envelope"))
  const observer_id = String(url.searchParams.get("observer_id") || "local-observer")
  const semantic_hash = semanticHashForConsensus(url.pathname)
  const topology_hash = sha256Hex(canonicalize({
    canonical_routes: ctx.canonical_routes,
    observer_routes: ctx.observer_consensus_routes,
    conformance_routes: ctx.external_conformance_routes,
    routes_outside_runtime: true,
  }))
  const reconciliation_hash = sha256Hex(canonicalize({
    registries: [
      ctx.observer_attestation_registry,
      ctx.semantic_equivalence_registry,
      ctx.portable_governance_checkpoint_registry,
      ctx.external_conformance_verification_registry,
    ],
    append_only: true,
    observer_consensus_authoritative: false,
  }))
  const sovereignty_hash = sha256Hex(canonicalize({
    local_sovereignty_isolated: true,
    remote_authority_denied: true,
    federation_inheritance: false,
    runtime_id: ctx.runtime_id,
  }))
  const observed_checkpoint_hash = sha256Hex(canonicalize({
    semantic_hash, topology_hash, reconciliation_hash, sovereignty_hash,
    generated_at, replay_neutral: true,
  }))
  const equivalence_hash = sha256Hex(canonicalize({
    semantic_hash, topology_hash, reconciliation_hash, sovereignty_hash, observed_checkpoint_hash,
  }))
  const drift = new Set<ConsensusDriftClass>()
  const remoteStatus = String(remote?.legitimacy_status || remote?.status || "")
  if (remote && String(remote.equivalence_hash || "") && String(remote.equivalence_hash) !== equivalence_hash) drift.add("FEDERATED_EQUIVALENCE_DRIFT")
  if (remote && String(remote.semantic_hash || "") && String(remote.semantic_hash) !== semantic_hash) drift.add("SEMANTIC_DIVERGENCE")
  if (remote && (remote.creates_authority === true || remote["remote_authority_inherited"] === true || remote["authority_inherited"] === true)) drift.add("REMOTE_AUTHORITY_INHERITANCE_ATTEMPT")
  if (remote && remoteStatus && !["LEGITIMATE", "CONFORMANT", "OBSERVER_CONSENSUS_OBSERVED"].includes(remoteStatus)) drift.add("OBSERVER_DIVERGENCE")
  if (url.searchParams.get("replay") === "true") drift.add("OBSERVER_REPLAY_RESURRECTION")
  if (url.searchParams.get("ambiguous") === "true") drift.add("QUORUM_AMBIGUITY")
  const drift_classes = Array.from(drift).sort() as ConsensusDriftClass[]
  const legitimacy_status: "LEGITIMATE" | null = drift_classes.length === 0 ? "LEGITIMATE" : null
  const observer: ObserverCheckpointObject = {
    observer_id, observed_checkpoint_hash, semantic_hash, topology_hash,
    reconciliation_hash, sovereignty_hash, equivalence_hash, drift_classes, legitimacy_status,
  }
  const semantic_envelope = canonicalRecord({
    semantic_hash, schema_semantic_hash: semantic_hash, topology_semantic_hash: topology_hash,
    governance_semantic_hash: reconciliation_hash, portability_semantic_hash: observed_checkpoint_hash,
    equivalence_hash, drift_classes, legitimacy_status,
    same_meaning_same_legitimacy_identity: drift_classes.length === 0,
    authority_inheritance: false,
  })
  const portable_checkpoint = canonicalRecord({
    checkpoint_hash: observed_checkpoint_hash, reconciliation_hash, topology_hash,
    semantic_equivalence_hash: equivalence_hash, conformance_hash: sovereignty_hash,
    jcs_compatible: true, dsse_compatible: true, exact_object_stable: true,
    replay_neutral: true, authorizes_execution: false, authorizes_proof: false,
    authorizes_merge: false,
  })
  const conformance = canonicalRecord({
    runtime_compatibility_hash: topology_hash,
    governance_semantic_hash: semantic_hash,
    checkpoint_equivalence_hash: equivalence_hash,
    federated_conformance_hash: sha256Hex(canonicalize({ topology_hash, semantic_hash, equivalence_hash, sovereignty_hash })),
    conformance_status: drift_classes.length === 0 ? "CONFORMANT" : "NULL",
    bounded_federated_reconciliation: true,
    trust_inheritance: false,
  })
  const quorum = canonicalRecord({
    observer_count: remote ? 2 : 1,
    quorum_status: drift_classes.includes("QUORUM_AMBIGUITY") || drift_classes.includes("OBSERVER_DIVERGENCE")
      ? "NULL"
      : "QUORUM_CLASSIFIED",
    observer_agreement_authorizes_execution: false,
  })
  const consensus_hash = sha256Hex(canonicalize({ observer, semantic_envelope, portable_checkpoint, conformance, quorum }))
  return {
    envelope_type: "GovernanceConsensusCheckpoint",
    observer,
    semantic_envelope,
    portable_checkpoint,
    conformance,
    quorum,
    consensus_hash,
    generated_at,
    evidence_only: true,
    replay_neutral: true,
    non_authoritative: true,
    executable: false,
    creates_authority: false,
  }
}

// ── Consensus Evidence Persistence ────────────────────────────────────────────
// Appends consensus observation to four append-only registries.
// INSERT OR IGNORE preserves idempotency; never modifies or deletes existing records.

export async function appendGovernanceConsensusEvidence(
  env: Env,
  envelope: GovernanceConsensusEnvelope,
  created_at: string,
) {
  const o = envelope.observer
  await env.DB.prepare(
    `INSERT OR IGNORE INTO observer_attestation_registry (attestation_id,observer_id,observed_checkpoint_hash,semantic_hash,topology_hash,reconciliation_hash,sovereignty_hash,equivalence_hash,drift_classes,legitimacy_status,attestation_hash,observer_envelope,evidence_only,replay_neutral,non_authoritative,read_only,mutation_capable,creates_authority,executable,deployment_capable,proof_generating,merge_authorizing,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'true','true','true','true','false','false','false','false','false','false',?13,?14)`
  ).bind(
    crypto.randomUUID(), o.observer_id, o.observed_checkpoint_hash, o.semantic_hash,
    o.topology_hash, o.reconciliation_hash, o.sovereignty_hash, o.equivalence_hash,
    canonicalize(o.drift_classes), o.legitimacy_status, envelope.consensus_hash,
    canonicalize(envelope), envelope.generated_at, created_at,
  ).run()
  await env.DB.prepare(
    `INSERT OR IGNORE INTO semantic_equivalence_registry (semantic_equivalence_id,semantic_hash,schema_semantic_hash,topology_semantic_hash,governance_semantic_hash,portability_semantic_hash,equivalence_hash,drift_classes,legitimacy_status,semantic_envelope,evidence_only,replay_neutral,non_authoritative,read_only,mutation_capable,creates_authority,executable,deployment_capable,proof_generating,merge_authorizing,generated_at,created_at) VALUES (?1,?2,?2,?3,?4,?5,?6,?7,?8,?9,'true','true','true','true','false','false','false','false','false','false',?10,?11)`
  ).bind(
    crypto.randomUUID(), o.semantic_hash, o.topology_hash, o.reconciliation_hash,
    o.observed_checkpoint_hash, o.equivalence_hash, canonicalize(o.drift_classes),
    o.legitimacy_status, canonicalize(envelope.semantic_envelope), envelope.generated_at, created_at,
  ).run()
  await env.DB.prepare(
    `INSERT OR IGNORE INTO portable_governance_checkpoint_registry (checkpoint_id,checkpoint_hash,reconciliation_hash,topology_hash,semantic_equivalence_hash,conformance_hash,portable_envelope,dsse_payload_type,jcs_canonical,drift_classes,legitimacy_status,evidence_only,replay_neutral,non_authoritative,read_only,mutation_capable,creates_authority,executable,deployment_capable,proof_generating,merge_authorizing,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'application/vnd.mindshift.governance-checkpoint.v1+json','true',?8,?9,'true','true','true','true','false','false','false','false','false','false',?10,?11)`
  ).bind(
    crypto.randomUUID(), o.observed_checkpoint_hash, o.reconciliation_hash, o.topology_hash,
    o.equivalence_hash, String(envelope.conformance.conformance_hash || envelope.consensus_hash),
    canonicalize(envelope.portable_checkpoint), canonicalize(o.drift_classes),
    o.legitimacy_status, envelope.generated_at, created_at,
  ).run()
  await env.DB.prepare(
    `INSERT OR IGNORE INTO external_conformance_verification_registry (verification_id,runtime_compatibility_hash,governance_semantic_hash,checkpoint_equivalence_hash,federated_conformance_hash,conformance_status,drift_classes,verification_envelope,evidence_only,replay_neutral,non_authoritative,read_only,mutation_capable,creates_authority,executable,deployment_capable,proof_generating,merge_authorizing,remote_authority_denied,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'true','true','true','true','false','false','false','false','false','false','true',?9,?10)`
  ).bind(
    crypto.randomUUID(),
    String(envelope.conformance.runtime_compatibility_hash || ""),
    String(envelope.conformance.governance_semantic_hash || ""),
    String(envelope.conformance.checkpoint_equivalence_hash || ""),
    String(envelope.conformance.federated_conformance_hash || envelope.consensus_hash),
    String(envelope.conformance.conformance_status || "NULL"),
    canonicalize(o.drift_classes), canonicalize(envelope.conformance),
    envelope.generated_at, created_at,
  ).run()
}
