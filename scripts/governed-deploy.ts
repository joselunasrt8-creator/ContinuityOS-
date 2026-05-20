import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

type Status = 'VALID' | 'INVALID' | 'NULL' | 'ACTIVE' | 'APPROVED';

type LegitimacyArtifact = {
  preo?: { id?: string; status?: Status };
  continuity?: { status?: Status; orphaned?: boolean };
  validator?: { status?: Status; approved?: boolean };
  replay?: { status?: Status; reused?: boolean };
  authority?: { status?: Status; expires_at?: string };
  proof?: { status?: Status; binding_hash?: string };
  validated_object_hash?: string;
  deployment_hash?: string;
  deployment_target?: Record<string, unknown>;
};

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashTarget(target: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalize(target)).digest('hex');
}

function failClosed(reason: string): never {
  console.error(`NULL — ${reason}`);
  process.exit(1);
}

export function validateArtifact(artifact: LegitimacyArtifact): { targetHash: string } {
  if (!artifact.preo || artifact.preo.status !== 'VALID') failClosed('deployment without PREO rejected');
  if (!artifact.continuity || artifact.continuity.status !== 'VALID' || artifact.continuity.orphaned) failClosed('orphan continuity rejected');
  if (!artifact.validator || artifact.validator.status !== 'APPROVED' || artifact.validator.approved !== true) failClosed('invalid validator state');
  if (!artifact.replay || artifact.replay.status !== 'INVALID' || artifact.replay.reused) failClosed('replayed legitimacy artifacts rejected');
  if (!artifact.authority || artifact.authority.status !== 'ACTIVE' || !artifact.authority.expires_at) failClosed('expired authority rejected');
  if (Date.parse(artifact.authority.expires_at) <= Date.now()) failClosed('expired authority rejected');
  if (!artifact.proof || artifact.proof.status !== 'VALID' || !artifact.proof.binding_hash) failClosed('proof mismatch rejected');
  if (!artifact.deployment_target || !artifact.validated_object_hash || !artifact.deployment_hash) failClosed('NO_VALIDATED_OBJECT');

  const targetHash = hashTarget(artifact.deployment_target);
  if (targetHash !== artifact.validated_object_hash || targetHash !== artifact.deployment_hash) failClosed('exact deployment hash parity failed');
  if (artifact.proof.binding_hash !== artifact.validated_object_hash) failClosed('proof mismatch rejected');
  return { targetHash };
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

  validateArtifact(artifact);

  if (deployCommand.length === 0) {
    console.log('VALID — governance checks passed; no deployment command provided');
    return;
  }

  const [cmd, ...args] = deployCommand;
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
