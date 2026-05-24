import { normalize } from '../src/canonical.js';

export const SURFACE_CLASSES = Object.freeze({
  OBSERVABILITY: "OBSERVABILITY",
  MUTATION_CAPABLE: "MUTATION_CAPABLE",
  EXECUTION_CAPABLE: "EXECUTION_CAPABLE",
  GOVERNANCE_ONLY: "GOVERNANCE_ONLY"
});

export const DRIFT_CLASSES = Object.freeze({
  UNDECLARED_SURFACE: "UNDECLARED_SURFACE",
  CLASSIFICATION_DRIFT: "CLASSIFICATION_DRIFT",
  EXECUTION_ESCAPE: "EXECUTION_ESCAPE",
  OBSERVABILITY_ESCALATION: "OBSERVABILITY_ESCALATION"
});

export function canonicalizeSurface(surface) {
  return normalize({
    route: surface.route,
    method: surface.method,
    classification: surface.classification,
    replay_neutral: Boolean(surface.replay_neutral),
    append_only: Boolean(surface.append_only),
    authority_bound: Boolean(surface.authority_bound)
  });
}

export function reconcileSurfaceInventory({
  declared = [],
  observed = []
}) {
  const declaredMap = new Map(
    declared.map((surface) => [
      `${surface.method}:${surface.route}`,
      canonicalizeSurface(surface)
    ])
  );

  const observedMap = new Map(
    observed.map((surface) => [
      `${surface.method}:${surface.route}`,
      canonicalizeSurface(surface)
    ])
  );

  const drift = [];

  for (const [key, observedSurface] of observedMap.entries()) {
    if (!declaredMap.has(key)) {
      drift.push({
        status: "NULL",
        drift: DRIFT_CLASSES.UNDECLARED_SURFACE,
        surface: observedSurface
      });

      continue;
    }

    const declaredSurface = declaredMap.get(key);

    if (
      declaredSurface.classification !==
      observedSurface.classification
    ) {
      drift.push({
        status: "NULL",
        drift: DRIFT_CLASSES.CLASSIFICATION_DRIFT,
        surface: observedSurface
      });
    }

    if (
      declaredSurface.classification ===
        SURFACE_CLASSES.OBSERVABILITY &&
      observedSurface.classification !==
        SURFACE_CLASSES.OBSERVABILITY
    ) {
      drift.push({
        status: "NULL",
        drift: DRIFT_CLASSES.OBSERVABILITY_ESCALATION,
        surface: observedSurface
      });
    }
  }

  return Object.freeze({
    status: drift.length === 0 ? "VALID" : "NULL",
    drift,
    replay_neutral: true,
    authority_granting: false
  });
}	
	
