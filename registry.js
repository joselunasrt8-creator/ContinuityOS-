export function validate() {
  throw new Error(
    'Legacy registry.js helper disabled. Root helper validation is non-authoritative; use the canonical runtime spine: /session -> /continuity -> /authority -> /compile -> /validate -> /execute -> /proof.'
  )
}
