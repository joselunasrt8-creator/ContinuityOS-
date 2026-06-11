throw new Error(
  'Legacy compile-decision.js helper disabled. Root helper compilation is non-authoritative and cannot create runtime objects; use the canonical runtime spine: /session -> /continuity -> /authority -> /compile -> /validate -> /execute -> /proof.'
)
