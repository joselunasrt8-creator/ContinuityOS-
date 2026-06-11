// Shared in-memory harness for running the governed filesystem-write route
// (`POST /gateway/tool/filesystem-write`) outside Cloudflare.
//
// This is intentionally a demo shell around the existing Worker route, not a
// new execution surface. It bundles src/index.ts and supplies an in-memory
// D1-compatible adapter so the path can be run without Cloudflare credentials.
//
// Used by:
//   - demo/portability/filesystem-governed-execution.mjs
//   - demo/integrations/langchain/governed-agent-demo.mjs

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSync } from 'esbuild'

export const ROUTE = '/gateway/tool/filesystem-write'
export const API_KEY = 'demo-key'

export async function importWorker() {
  const entryPoint = fileURLToPath(new URL('../../src/index.ts', import.meta.url))
  const tmpDir = mkdtempSync(join(tmpdir(), 'mindshift-governed-worker-'))
  const outfile = join(tmpDir, 'worker.mjs')
  buildSync({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    outfile,
    platform: 'neutral',
  })
  try {
    return await import(pathToFileURL(outfile).href)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

export function makePost(payload) {
  return new Request(`https://demo.local${ROUTE}`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function postJson(worker, env, payload) {
  const response = await worker.fetch(makePost(payload), env)
  return response.json()
}

export function makeFilesystemGatewayEnv() {
  const decisionRegistry = new Map()
  const nonceRegistry = new Map()
  const objectRegistry = new Map()
  const proofRegistry = new Map()
  const lineageRegistry = new Map()
  const nullAuditRegistry = new Map()
  const writes = []

  const env = {
    API_KEY,
    decisionRegistry,
    nonceRegistry,
    objectRegistry,
    proofRegistry,
    lineageRegistry,
    nullAuditRegistry,
    writes,
    DB: {
      prepare(sql) {
        const statement = {
          args: [],
          bind(...args) {
            this.args = args
            return this
          },
          async run() {
            writes.push({ sql, args: this.args })

            if (/^\s*CREATE\s+/i.test(sql)) return { meta: { changes: 0 } }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_write_decision_registry')) {
              const [decision_id, authority_lineage_hash, created_at] = this.args
              if (!decisionRegistry.has(decision_id)) {
                decisionRegistry.set(decision_id, {
                  decision_id,
                  status: 'ACTIVE',
                  authority_lineage_hash,
                  scope: 'repository',
                  expires_at: null,
                  created_at,
                })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_object_registry')) {
              const [path, content, content_hash, bytes_written, updated_at] = this.args
              if (!objectRegistry.has(path)) {
                objectRegistry.set(path, { path, content, content_hash, bytes_written, updated_at })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_object_registry') && sql.includes('ON CONFLICT(path) DO UPDATE')) {
              const [path, content, content_hash, bytes_written, updated_at] = this.args
              objectRegistry.set(path, { path, content, content_hash, bytes_written, updated_at })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_nonce_registry') && sql.includes('ON CONFLICT(replay_nonce) DO UPDATE')) {
              const [replay_nonce, decision_id, created_at, consumed_at] = this.args
              const existing = nonceRegistry.get(replay_nonce)
              nonceRegistry.set(replay_nonce, {
                replay_nonce,
                decision_id,
                state: 'CONSUMED',
                created_at: existing ? existing.created_at : created_at,
                consumed_at,
              })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_proof_registry')) {
              const [
                receipt_id,
                atao_id,
                validated_object_hash,
                executed_object_hash,
                execution_evidence_hash,
                adapter_surface,
                decision_id,
                replay_nonce,
                target_path,
                execution_result,
                emitted_at,
                created_at,
              ] = this.args
              proofRegistry.set(receipt_id, {
                receipt_id,
                atao_id,
                validated_object_hash,
                executed_object_hash,
                execution_evidence_hash,
                adapter_surface,
                decision_id,
                replay_nonce,
                target_path,
                execution_result,
                creates_authority: false,
                emitted_at,
                created_at,
              })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_null_audit_registry')) {
              const [
                correlation_id,
                reason_class,
                stage,
                denial_reason,
                agent_id,
                session_id,
                atao_id,
                canonical_aeo_hash,
                decision_id,
                replay_nonce,
                validator_version,
                created_at,
              ] = this.args
              if (!nullAuditRegistry.has(correlation_id)) {
                nullAuditRegistry.set(correlation_id, {
                  correlation_id,
                  reason_class,
                  stage,
                  denial_reason,
                  agent_id,
                  session_id,
                  atao_id,
                  canonical_aeo_hash,
                  decision_id,
                  replay_nonce,
                  validator_version,
                  execution_performed: false,
                  proof_emitted: false,
                  created_at,
                })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('governed_filesystem_write_lineage_registry') && sql.includes('INSERT INTO')) {
              const [
                node_id,
                parent_id,
                canonical_aeo_hash,
                receipt_id,
                decision_id,
                replay_nonce,
                target_system,
                target_action,
                target_path,
                status,
                created_at,
              ] = this.args
              lineageRegistry.set(node_id, {
                node_id,
                parent_id,
                canonical_aeo_hash,
                receipt_id,
                decision_id,
                replay_nonce,
                target_system,
                target_action,
                target_path,
                status,
                created_at,
              })
              return { meta: { changes: 1 } }
            }

            return { meta: { changes: 1 } }
          },
          async first() {
            if (sql.includes('FROM governed_filesystem_write_decision_registry')) {
              const [decision_id] = this.args
              return decisionRegistry.get(decision_id) ?? null
            }
            if (sql.includes('FROM governed_filesystem_write_nonce_registry')) {
              const [replay_nonce] = this.args
              return nonceRegistry.get(replay_nonce) ?? null
            }
            if (sql.includes('FROM governed_filesystem_object_registry')) {
              const [path] = this.args
              return objectRegistry.get(path) ?? null
            }
            return null
          },
          async all() {
            return { results: [] }
          },
        }
        return statement
      },
    },
  }

  return env
}
