import { canonicalize, sha256Hex } from '../src/canonical.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

type Status = 'VALID' | 'INVALID' | 'NULL' | 'ACTIVE' | 'APPROVED';
type DeployEventType =
  | 'governed_deploy_success'
  | 'governed_deploy_rejection'
  | 'preo_validation_failure'
  | 'deployment_parity_mismatch'
  | 'replay_rejection'
  | 'workflow_bypass_rejection'
  | 'direct_wrangler_invocation_rejection'
  | 'break_glass_deploy_invocation';

type LegitimacyArtifact = {
  session_id?: string;
  decision_id?: string;
  invocation_nonce?: string;
  preo?: { id?: string; status?: Status };
  continuity?: { status?: Status; orphaned?: boolean };
  validator?: { status?: Status; approved?: boolean };
  replay?: { status?: Status; reused?: boolean };
  authority?: { status?: Status; expires_at?: string };
  proof?: { status?: Status; binding_hash?: string; proof_id?: string };
  validated_object_hash?: string;
  deployment_hash?: string;
  deployment_target?: Record<string, unknown>;
};

type DeployAuditEntry = {
  session_id: string | null;
  decision_id: string | null;
  invocation_nonce: string | null;
  timestamp: string;
  event_type: DeployEventType;
  deployment_target: Record<string, unknown> | null;
  validated_object_hash: string | null;
  deployment_hash: string | null;
  rejection_reason: string | null;
  execution_surface: string;
  governed_context: string;
  break_glass_invoked: boolean;
  proof_binding_hash: string | null;
  proof_id: string | null;
};

type DeployAuditRegistry = {
  schema_version: 1;
  registry: 'deploy_audit_registry';
  entries: DeployAuditEntry[];
};

function hashTarget(target: Record<string, unknown>): string {
  return sha256Hex(canonicalize(target));
}

function getRegistryPath(): string {
  return resolve(process.env.MINDSHIFT_DEPLOY_AUDIT_REGISTRY ?? 'runtime/deploy_audit_registry.json');
}

function baseRegistry(): DeployAuditRegistry {
  return { schema_version: 1, registry: 'deploy_audit_registry', entries: [] };
}

function readRegistry(path: string): DeployAuditRegistry {
  if (!existsSync(path)) return baseRegistry();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('deploy audit registry corrupted');
  }
  const candidate = parsed as Partial<DeployAuditRegistry>;
  if (candidate.schema_version !== 1 || candidate.registry !== 'deploy_audit_registry' || !Array.isArray(candidate.entries)) {
    throw new Error('deploy audit registry corrupted');
  }
  return candidate as DeployAuditRegistry;
}

function persistEvent(event: DeployAuditEntry): void {
  const path = getRegistryPath();
  let registry: DeployAuditRegistry;
  try {
    registry = readRegistry(path);
  } catch (error) {
    console.error(`NULL — ${(error as Error).message}`);
    process.exit(1);
  }

  const replayKey = sha256Hex(canonicalize(event));
  const duplicated = registry.entries.some((entry) => sha256Hex(canonicalize(entry)) === replayKey);
  if (duplicated) return;

  const tupleCollision = event.event_type === 'governed_deploy_success' && registry.entries.some((entry) =>
    entry.event_type === 'governed_deploy_success' &&
    entry.decision_id &&
    entry.invocation_nonce &&
    entry.validated_object_hash &&
    entry.proof_id &&
    entry.decision_id === event.decision_id &&
    entry.invocation_nonce === event.invocation_nonce &&
    entry.validated_object_hash === event.validated_object_hash &&
    entry.proof_id === event.proof_id
  );
  if (tupleCollision) {
    console.error('NULL — duplicate proof tuple rejected');
    process.exit(1);
  }

  const next: DeployAuditRegistry = {
    schema_version: 1,
    registry: 'deploy_audit_registry',
    entries: [...registry.entries, event]
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function buildEvent(type: DeployEventType, artifact: LegitimacyArtifact | null, reason: string | null): DeployAuditEntry {
  return {
    session_id: artifact?.session_id ?? null,
    decision_id: artifact?.decision_id ?? null,
    invocation_nonce: artifact?.invocation_nonce ?? null,
    timestamp: new Date().toISOString(),
    event_type: type,
    deployment_target: artifact?.deployment_target ?? null,
    validated_object_hash: artifact?.validated_object_hash ?? null,
    deployment_hash: artifact?.deployment_hash ?? null,
    rejection_reason: reason,
    execution_surface: 'github_governed_production_deploy',
    governed_context: process.env.MINDSHIFT_GOVERNED_DEPLOY_CONTEXT ?? 'unset',
    break_glass_invoked: process.env.MINDSHIFT_BREAK_GLASS_DEPLOY === 'true',
    proof_binding_hash: artifact?.proof?.binding_hash ?? null,
    proof_id: artifact?.proof?.proof_id ?? null
  };
}

function failClosed(reason: string, artifact: LegitimacyArtifact | null = null, type: DeployEventType = 'governed_deploy_rejection'): never {
  persistEvent(buildEvent(type, artifact, reason));
  console.error(`NULL — ${reason}`);
  process.exit(1);
}

export function validateArtifact(artifact: LegitimacyArtifact): { targetHash: string } {
  if (!artifact.preo || artifact.preo.status !== 'VALID') failClosed('deployment without PREO rejected', artifact, 'preo_validation_failure');
  if (!artifact.continuity || artifact.continuity.status !== 'VALID' || artifact.continuity.orphaned) failClosed('orphan continuity rejected', artifact);
  if (!artifact.validator || artifact.validator.status !== 'APPROVED' || artifact.validator.approved !== true) failClosed('invalid validator state', artifact);
  if (!artifact.replay || artifact.replay.status !== 'INVALID' || artifact.replay.reused) failClosed('replayed legitimacy artifacts rejected', artifact, 'replay_rejection');
  if (!artifact.authority || artifact.authority.status !== 'ACTIVE' || !artifact.authority.expires_at) failClosed('expired authority rejected', artifact);
  if (Date.parse(artifact.authority.expires_at) <= Date.now()) failClosed('expired authority rejected', artifact);
  if (!artifact.proof || artifact.proof.status !== 'VALID' || !artifact.proof.binding_hash || !artifact.proof.proof_id) failClosed('proof mismatch rejected', artifact);
  if (!artifact.session_id || !artifact.decision_id || !artifact.invocation_nonce) failClosed('missing canonical lineage fields', artifact);
  if (!artifact.deployment_target || !artifact.validated_object_hash || !artifact.deployment_hash) failClosed('NO_VALIDATED_OBJECT', artifact);

  const targetHash = hashTarget(artifact.deployment_target);
  if (targetHash !== artifact.validated_object_hash || targetHash !== artifact.deployment_hash) failClosed('exact deployment hash parity failed', artifact, 'deployment_parity_mismatch');
  if (artifact.proof.binding_hash !== artifact.validated_object_hash) failClosed('proof mismatch rejected', artifact);
  return { targetHash };
}

function enforceGovernedDeployCommand(deployCommand: string[], artifact: LegitimacyArtifact): void {
  if (deployCommand.length === 0) return;
  if (process.env.MINDSHIFT_GOVERNED_DEPLOY_CONTEXT !== 'github_actions_governed') {
    failClosed('workflow bypasses governed deploy wrapper', artifact, 'workflow_bypass_rejection');
  }

  const [cmd, ...args] = deployCommand;
  const normalized = [cmd, ...args].join(' ').toLowerCase();
  // Block direct wrangler deploy (cmd=wrangler) and shell-wrapped bypass patterns.
  // npx wrangler deploy is the governed path and remains permitted when context is set.
  if (
    (cmd === 'wrangler' && /\bdeploy\b/.test(normalized)) ||
    /\b(bash|sh|zsh)\b.*\bwrangler\b.*\bdeploy\b/.test(normalized)
  ) {
    failClosed('direct wrangler invocation rejected', artifact, 'direct_wrangler_invocation_rejection');
  }
}

function main(): void {
  const [, , artifactPath, ...deployCommand] = process.argv;
  if (!artifactPath) failClosed('missing legitimacy artifact path');
  let artifact: LegitimacyArtifact;
  try {
    artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as LegitimacyArtifact;
  } catch {
    failClosed('invalid legitimacy artifact');
  }

  if (process.env.MINDSHIFT_BREAK_GLASS_DEPLOY === 'true') {
    persistEvent(buildEvent('break_glass_deploy_invocation', artifact, null));
  }

  validateArtifact(artifact);
  enforceGovernedDeployCommand(deployCommand, artifact);

  if (deployCommand.length === 0) {
    persistEvent(buildEvent('governed_deploy_success', artifact, null));
    console.log('VALID — governance checks passed; no deployment command provided');
    return;
  }

  const [cmd, ...args] = deployCommand;
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  persistEvent(buildEvent('governed_deploy_success', artifact, null));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
