/**
 * Check whether a value is a plain (non-array, non-null) object.
 */
export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate that `value` is an array of strings matching `NAME_PATTERN`,
 * with no duplicates and at least `minItems` entries.
 *
 * Pushes human-readable error strings into `errors`.
 */
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function validateNameArray(value, field, errors, { minItems = 0 } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${field}: expected array`);
    return;
  }

  if (value.length < minItems) errors.push(`${field}: requires at least ${minItems} item(s)`);
  if (new Set(value).size !== value.length) errors.push(`${field}: duplicate values are not allowed`);

  for (const item of value) {
    if (typeof item !== 'string' || !NAME_PATTERN.test(item)) {
      errors.push(`${field}: invalid name ${JSON.stringify(item)}`);
    }
  }
}
