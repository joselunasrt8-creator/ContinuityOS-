// runtime/lineage/registryLock.mjs
// Per-registry advisory lock — closes the post-gate execution RACE.
//
// THE RACE:
//   The runtime law reads the lineage head, runs the eligibility gate, EXECUTES,
//   then appends the terminal carry. Without serialization two concurrent runs on
//   the same lineage can both read the same head, both pass the gate, and both run
//   the executor (side effects happen TWICE) even though only one append can win.
//
// THE FIX:
//   Serialize the WHOLE critical section (read head -> gate -> execute -> append)
//   per registry behind an exclusive on-disk lock. A run holds the lock across its
//   executor call, so a second run cannot execute until the first releases. Fail-
//   closed: if the lock cannot be acquired, the run does not execute.
//
// Correctness properties (hardened after review):
//   - PER FILE, not per string: the key is the resolved/realpath'd registry path,
//     so `r.jsonl`, `./r.jsonl`, `a/../r.jsonl`, and a symlink all share ONE lock.
//   - Never steal a LIVE lock: a held lock is reclaimed only when its recorded
//     holder is PROVABLY dead (same host, PID no longer exists). A slow adapter is
//     never robbed by age alone.
//   - SYNCHRONOUS critical section only: the protected region must complete before
//     the lock releases, so reentrancy (admitRun nested under executeGovernedRun)
//     is tracked by simple call-stack depth. An async `fn` is refused — process-
//     wide depth cannot isolate independent concurrent async callers.

import { openSync, closeSync, existsSync, readFileSync, writeSync, unlinkSync, renameSync, realpathSync } from 'node:fs'
import { resolve, dirname, basename, join } from 'node:path'
import { hostname } from 'node:os'

const LOCK_SUFFIX = '.lock'
const DEFAULT_TIMEOUT_MS = 10_000 // give up acquiring after this (fail-closed)
const POLL_MS = 25
const HOST = hostname()

// Reentrancy depth for locks held by THIS process, keyed by canonical lock path.
// Correct because the critical section is synchronous: only same-call-stack
// nesting can occur, so a counter is sufficient (no concurrent async re-entry).
const heldDepth = new Map()

// Canonical, per-FILE lock path: resolve `..`/relative spellings and symlinks so
// every spelling of the same registry maps to a single lock file.
function canonicalLockPath(registryPath) {
  const abs = resolve(String(registryPath))
  let canonical = abs
  try {
    canonical = realpathSync(abs) // resolves symlinks when the registry exists
  } catch {
    // Registry may not exist yet (first genesis append) — canonicalize its directory.
    try {
      canonical = join(realpathSync(dirname(abs)), basename(abs))
    } catch {
      canonical = abs
    }
  }
  return canonical + LOCK_SUFFIX
}

// Synchronous sleep without a busy spin (Atomics.wait on a throwaway buffer).
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function readHolder(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'))
  } catch {
    return null
  }
}

// Only a holder we can POSITIVELY prove dead may be reclaimed. Cross-host holders,
// or any lockfile we cannot parse, are treated as ALIVE — never stolen.
function holderProvablyDead(lockPath) {
  const h = readHolder(lockPath)
  if (!h || h.host !== HOST || !Number.isInteger(h.pid)) return false
  try {
    process.kill(h.pid, 0) // signal 0 = liveness probe, sends nothing
    return false // process exists → alive
  } catch (err) {
    return err && err.code === 'ESRCH' // ESRCH = no such process; EPERM = alive
  }
}

function writeHolder(fd) {
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, host: HOST, at: new Date().toISOString() }))
  } catch {
    // best-effort identity; the lock holds by virtue of the file existing
  }
}

function acquire(lockPath, { timeoutMs }) {
  if (heldDepth.has(lockPath)) {
    heldDepth.set(lockPath, heldDepth.get(lockPath) + 1)
    return { reentrant: true }
  }
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx') // O_CREAT | O_EXCL — fails if it exists
      writeHolder(fd)
      closeSync(fd)
      heldDepth.set(lockPath, 1)
      return { reentrant: false }
    } catch (err) {
      if (err && err.code !== 'EEXIST') throw err
      // Reclaim ONLY a lock whose holder is provably dead (crashed without release),
      // and do it ATOMICALLY: rename the stale file to a private name. Only one
      // waiter can win the rename of a given inode — losers get ENOENT and re-loop.
      // The winner then removes its OWN renamed file, so it can NEVER unlink the
      // canonical path and thereby delete a fresh live lock created in the interim.
      if (holderProvablyDead(lockPath)) {
        const claimed = `${lockPath}.dead.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`
        try {
          renameSync(lockPath, claimed)
        } catch {
          continue // another waiter won the reclaim, or the path changed — re-evaluate
        }
        try {
          unlinkSync(claimed)
        } catch {
          /* our private file — best-effort cleanup */
        }
        continue
      }
      if (Date.now() >= deadline) {
        const e = new Error(`REGISTRY_LOCK_TIMEOUT: could not acquire ${lockPath} within ${timeoutMs}ms`)
        e.code = 'REGISTRY_LOCK_TIMEOUT'
        throw e
      }
      sleepSync(POLL_MS)
    }
  }
}

function release(lockPath, token) {
  if (token.reentrant) {
    heldDepth.set(lockPath, heldDepth.get(lockPath) - 1)
    return
  }
  heldDepth.delete(lockPath)
  // Remove the lockfile ONLY if it is still ours — never delete a lock another
  // holder created (e.g. after a reclaim race).
  if (existsSync(lockPath)) {
    const h = readHolder(lockPath)
    if (!h || (h.pid === process.pid && h.host === HOST)) {
      try {
        unlinkSync(lockPath)
      } catch {
        /* already removed — nothing to do */
      }
    }
  }
}

// withRegistryLock — run a SYNCHRONOUS fn() while holding the registry's exclusive
// lock. Reentrant within a call stack; fail-closed (throws) if the lock cannot be
// acquired. An async fn is refused so the protected region can never outlive the
// hold (which would also defeat the process-wide reentrancy counter).
export function withRegistryLock(registryPath, fn, options = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError('withRegistryLock requires a function')
  }
  // Reject a native async fn BEFORE acquiring/invoking it: its body would start
  // running and then CONTINUE outside the lock after we release, defeating the
  // fail-closed guarantee. (A plain fn that still returns a thenable is caught by
  // the post-call backstop below, after its synchronous body has already run under
  // the lock.)
  if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
    throw new Error('withRegistryLock requires a synchronous fn (received an async function)')
  }

  const lockPath = canonicalLockPath(registryPath)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const token = acquire(lockPath, { timeoutMs })
  let result
  try {
    result = fn()
  } catch (err) {
    release(lockPath, token)
    throw err
  }

  if (result && typeof result.then === 'function') {
    release(lockPath, token)
    throw new Error('withRegistryLock requires a synchronous fn (it returned a Promise)')
  }
  release(lockPath, token)
  return result
}

// Whether this process currently holds the lock for a registry (test/diagnostic).
export function isLockHeld(registryPath) {
  return heldDepth.has(canonicalLockPath(registryPath))
}
