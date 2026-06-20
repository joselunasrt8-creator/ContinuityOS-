// runtime/lineage/registryLock.mjs
// Per-registry advisory lock — closes the post-gate execution RACE.
//
// THE RACE:
//   The runtime law reads the lineage head, runs the eligibility gate, EXECUTES,
//   then appends the terminal carry. Without serialization two concurrent runs on
//   the same lineage can both read the same head, both pass the gate, and both run
//   the executor (side effects happen TWICE) even though only one append can win.
//   "no valid lineage -> no valid execution" is violated the moment a second
//   execution fires against a head that is already being consumed.
//
// THE FIX:
//   Serialize the WHOLE critical section (read head -> gate -> execute -> append)
//   per registry behind an exclusive on-disk lock. A run holds the lock across its
//   executor call, so a second run cannot execute until the first has appended (or
//   bailed) and released. Fail-closed: if the lock cannot be acquired, the run does
//   not execute.
//
// Cross-process exclusion uses O_EXCL lockfile creation. In-process reentrancy is
// tracked so a holder (executeGovernedRun) can call a second locked operation
// (admitRun) without self-deadlock — the outer holder already guarantees exclusion.

import { openSync, closeSync, existsSync, statSync, unlinkSync, writeSync } from 'node:fs'

const LOCK_SUFFIX = '.lock'
const DEFAULT_TIMEOUT_MS = 10_000 // give up acquiring after this (fail-closed)
const DEFAULT_STALE_MS = 30_000 // a lockfile older than this is treated as abandoned
const POLL_MS = 25

// Locks held by THIS process, keyed by lock path -> reentrancy depth.
const heldDepth = new Map()

function lockPathFor(registryPath) {
  return String(registryPath) + LOCK_SUFFIX
}

// Synchronous sleep without a busy spin (Atomics.wait on a throwaway buffer).
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function lockAgeMs(lockPath) {
  try {
    return Date.now() - statSync(lockPath).mtimeMs
  } catch {
    return Infinity // gone between checks — treat as acquirable
  }
}

// Acquire the on-disk lock (or no-op if this process already holds it).
function acquire(lockPath, { timeoutMs, staleMs }) {
  if (heldDepth.has(lockPath)) {
    heldDepth.set(lockPath, heldDepth.get(lockPath) + 1)
    return { reentrant: true }
  }

  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx') // O_CREAT | O_EXCL — fails if it exists
      try {
        writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`)
      } catch {
        // best-effort metadata; the lock is held by virtue of the file existing
      }
      closeSync(fd)
      heldDepth.set(lockPath, 1)
      return { reentrant: false }
    } catch (err) {
      if (err && err.code !== 'EEXIST') throw err
      // Reclaim an abandoned lock (holder crashed without releasing).
      if (lockAgeMs(lockPath) > staleMs) {
        try {
          unlinkSync(lockPath)
        } catch {
          /* another worker reclaimed it first — retry */
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
  if (existsSync(lockPath)) {
    try {
      unlinkSync(lockPath)
    } catch {
      /* already removed — nothing to do */
    }
  }
}

// withRegistryLock — run fn() while holding the registry's exclusive lock.
// Reentrant within a process; fail-closed (throws) if the lock cannot be acquired.
// fn may be sync or return a promise; the lock is held until it settles.
export function withRegistryLock(registryPath, fn, options = {}) {
  const lockPath = lockPathFor(registryPath)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS

  const token = acquire(lockPath, { timeoutMs, staleMs })
  let result
  try {
    result = fn()
  } catch (err) {
    release(lockPath, token)
    throw err
  }

  if (result && typeof result.then === 'function') {
    return result.then(
      (v) => {
        release(lockPath, token)
        return v
      },
      (err) => {
        release(lockPath, token)
        throw err
      },
    )
  }
  release(lockPath, token)
  return result
}

// Whether this process currently holds the lock for a registry (test/diagnostic).
export function isLockHeld(registryPath) {
  return heldDepth.has(lockPathFor(registryPath))
}
