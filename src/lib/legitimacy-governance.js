import { hashCanonical } from '../canonical.js';

export const REQUIRED_POLICY_RESULT = "VALID_AND_AUTHORIZED_AND_UNUSED_AND_POLICY_VALID";

export const WORKLOAD_CLASSES = Object.freeze([
  "training",
  "inference",
  "reinforcement_learning",
  "internal_agent",
  "customer_serving",
  "batch_processing",
  "evaluation",
]);

export function fingerprintObject(value) {
  return hashCanonical(value);
}

function isIsoDate(s) {
  return typeof s === "string" && !Number.isNaN(Date.parse(s));
}

function requireFields(object, fields) {
  for (const field of fields) {
    if (!(field in object) || object[field] === null || object[field] === undefined) {
      return `missing_${field}`;
    }
  }
  return null;
}

function nullResult(reason) {
  return { ok: false, state: "NULL", reason };
}

export function validateComputeLegitimacyObject(clo, now = new Date()) {
  const err = requireFields(clo, ["object_id", "authority_id", "aeo_id", "workload_authority_id", "policy_result", "expires_at", "issued_at", "execution_target", "replay_nonce", "unused"]);
  if (err) return nullResult(err);
  if (clo.policy_result !== REQUIRED_POLICY_RESULT) return nullResult("policy_invalid");
  if (clo.unused !== true) return nullResult("used_or_reused");
  if (!isIsoDate(clo.expires_at) || Date.parse(clo.expires_at) <= now.getTime()) return nullResult("expired_authority");
  if (!isIsoDate(clo.issued_at)) return nullResult("invalid_issued_at");
  if (typeof clo.execution_target !== "string" || clo.execution_target.length < 3) return nullResult("unbound_execution_target");
  return { ok: true, state: "VALID", fingerprint: fingerprintObject(clo) };
}

export function validateWorkloadAuthority(authority, now = new Date()) {
  const err = requireFields(authority, ["authority_id", "workload_class", "token_budget", "cost_ceiling_usd", "compute_platform", "execution_surfaces", "duration_limit_seconds", "issued_at", "expires_at", "revoked"]);
  if (err) return nullResult(err);
  if (!WORKLOAD_CLASSES.includes(authority.workload_class)) return nullResult("invalid_workload_class");
  if (authority.revoked) return nullResult("revoked_authority");
  if (!Array.isArray(authority.execution_surfaces) || authority.execution_surfaces.length === 0) return nullResult("execution_surface_restriction_missing");
  if (!(authority.token_budget > 0) || !(authority.cost_ceiling_usd >= 0) || !(authority.duration_limit_seconds > 0)) return nullResult("budget_or_duration_invalid");
  if (!isIsoDate(authority.expires_at) || Date.parse(authority.expires_at) <= now.getTime()) return nullResult("expired_authority");
  return { ok: true, state: "VALID", fingerprint: fingerprintObject(authority) };
}

export function validateAgentFleetBoundary(boundary) {
  const err = requireFields(boundary, ["boundary_id", "agents", "forbidden_actions", "authority_binding_required", "proof_required", "validator_required"]);
  if (err) return nullResult(err);
  const requiredForbidden = ["mutate_repository", "modify_infra", "change_financial_records", "deploy_systems", "invoke_external_apis", "alter_enterprise_workflows"];
  for (const action of requiredForbidden) {
    if (!boundary.forbidden_actions.includes(action)) return nullResult(`missing_forbidden_${action}`);
  }
  if (!boundary.authority_binding_required || !boundary.proof_required || !boundary.validator_required) return nullResult("boundary_controls_missing");
  return { ok: true, state: "VALID", fingerprint: fingerprintObject(boundary) };
}

export function createComputeUsageProof(proof) {
  const err = requireFields(proof, ["authority_id", "execution_id", "workload_class", "compute_platform", "tokens_used", "accelerator_hours", "timestamps", "result_reference"]);
  if (err) return nullResult(err);
  if (!WORKLOAD_CLASSES.includes(proof.workload_class)) return nullResult("invalid_workload_class");
  if (!(proof.tokens_used >= 0) || !(proof.accelerator_hours >= 0)) return nullResult("usage_invalid");
  const proof_hash = fingerprintObject(proof);
  return { ok: true, state: "VALID", proof_hash, proof: Object.freeze({ ...proof, proof_hash }) };
}

export class ReplayGuard {
  #used = new Set();

  consume(id, fingerprint) {
    const token = `${id}:${fingerprint}`;
    if (this.#used.has(token)) return nullResult("replay_detected");
    this.#used.add(token);
    return { ok: true, state: "VALID" };
  }
}

export function validateVirtualCollaboratorBoundary(boundary) {
  const err = requireFields(boundary, ["collaborator_id", "identity_continuity_id", "session_id", "memory_boundary", "revocation_epoch", "tool_authorizations"]);
  if (err) return nullResult(err);
  if (!boundary.memory_boundary || typeof boundary.memory_boundary !== "object") return nullResult("memory_boundary_missing");
  if (!Array.isArray(boundary.tool_authorizations)) return nullResult("tool_authorization_boundary_missing");
  return { ok: true, state: "VALID", fingerprint: fingerprintObject(boundary) };
}

export function validateFrontierReleaseAuthority(authority, now = new Date()) {
  const err = requireFields(authority, ["release_id", "capability_class", "phase", "rollback_required", "proof_required", "issued_at", "expires_at"]);
  if (err) return nullResult(err);
  const classes = ["cyber_capable", "bio_capable", "agentic", "infrastructure_capable"];
  const phases = ["sandbox", "limited", "expanded", "general"];
  if (!classes.includes(authority.capability_class)) return nullResult("capability_class_invalid");
  if (!phases.includes(authority.phase)) return nullResult("release_phase_invalid");
  if (!authority.rollback_required || !authority.proof_required) return nullResult("rollback_or_proof_missing");
  if (!isIsoDate(authority.expires_at) || Date.parse(authority.expires_at) <= now.getTime()) return nullResult("expired_authority");
  return { ok: true, state: "VALID", fingerprint: fingerprintObject(authority) };
}
