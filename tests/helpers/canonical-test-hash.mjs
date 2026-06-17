import { createHash } from 'node:crypto';

/**
 * Recursively sort object keys for deterministic serialization.
 * Arrays preserve element order; primitives pass through unchanged.
 */
export function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortCanonical(v)]),
    );
  }
  return value;
}

/**
 * SHA-256 hex digest of the canonical JSON representation of a value.
 * Appends a trailing newline to match the governance-artifact convention.
 */
export function canonicalHash(value) {
  return createHash('sha256').update(`${JSON.stringify(sortCanonical(value))}\n`).digest('hex');
}

/**
 * SHA-256 hex digest of a plain UTF-8 string.
 */
export function hashString(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
