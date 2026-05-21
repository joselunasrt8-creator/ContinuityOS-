import { readFileSync, writeFileSync } from 'node:fs'

const registryPath = new URL('../governance/runtime/EXECUTION_SURFACE_CLOSURE_REGISTRY.json', import.meta.url)
const surfacesPath = new URL('../runtime/unauthorized_mutation_surface_inventory.json', import.meta.url)
const outputPath = new URL('../governance/runtime/EXECUTION_SURFACE_CLOSURE_REPORT.json', import.meta.url)

const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
const inventory = JSON.parse(readFileSync(surfacesPath, 'utf8'))

const mutationCapable = (inventory.surfaces || []).filter((surface) => (
  surface.mutation_capability || surface.execution_capability || surface.deployment_capability
))

const declared = new Set(registry.authoritative_execution_surfaces)
const deployCapable = new Set(registry.deploy_capable_surfaces)
const proofRequired = new Set(registry.proof_required_surfaces)
const replaySensitive = new Set(registry.replay_sensitive_surfaces)

const undeclaredExecutionPaths = mutationCapable
  .map((surface) => surface.surface_id)
  .filter((id) => !declared.has(id))
  .sort()

const workflowDispatchMutationVectors = mutationCapable
  .map((surface) => surface.surface_id)
  .filter((id) => id.includes('workflow_dispatch') || id.includes('manual_dispatch'))
  .sort()

const orphanExecutionPossibilities = mutationCapable
  .map((surface) => surface.surface_id)
  .filter((id) => id.includes('/execute') && !declared.has('route:/validate'))

const prooflessExecutionPaths = mutationCapable
  .map((surface) => surface.surface_id)
  .filter((id) => deployCapable.has(id) && !proofRequired.has(id))

const validatorBypassAttempts = mutationCapable
  .map((surface) => surface.surface_id)
  .filter((id) => id.includes('validator_bypass') || id.includes('validation_escape'))

const ownershipConflicts = []
const authoritativeOwnership = new Map()
for (const id of registry.authoritative_execution_surfaces) {
  const owners = (authoritativeOwnership.get(id) || 0) + 1
  authoritativeOwnership.set(id, owners)
  if (owners > 1) ownershipConflicts.push(id)
}

const status = ownershipConflicts.length > 0
  ? 'NULL'
  : (undeclaredExecutionPaths.length || workflowDispatchMutationVectors.length || orphanExecutionPossibilities.length || prooflessExecutionPaths.length || validatorBypassAttempts.length)
    ? 'QUARANTINED'
    : 'CLOSED'

const report = {
  generated_at: 'deterministic-static-scan',
  canonical_execution_chain: registry.canonical_execution_chain,
  mutation_capable_surfaces: mutationCapable.map((s) => s.surface_id).sort(),
  undeclared_execution_paths: undeclaredExecutionPaths,
  workflow_dispatch_mutation_vectors: workflowDispatchMutationVectors,
  orphan_execution_possibilities: orphanExecutionPossibilities,
  replay_sensitive_paths: Array.from(replaySensitive).sort(),
  proofless_execution_paths: prooflessExecutionPaths,
  validator_bypass_attempts: validatorBypassAttempts,
  conflicting_authoritative_ownership: ownershipConflicts,
  required_response: status,
  fail_closed: status !== 'CLOSED'
}

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)

if (ownershipConflicts.length > 0) {
  console.error('conflicting authoritative ownership detected')
  process.exitCode = 2
}
