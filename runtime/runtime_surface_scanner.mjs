import fs from "node:fs";

import {
  SURFACE_CLASSES
} from "./surface_inventory_reconciler.mjs";

const EXECUTION_PATTERNS = [
  "execute",
  "deploy",
  "mutation",
  "write",
  "delete",
  "update"
];

export function classifySurface(route) {
  const normalized = route.toLowerCase();

  for (const pattern of EXECUTION_PATTERNS) {
    if (normalized.includes(pattern)) {
      return SURFACE_CLASSES.EXECUTION_CAPABLE;
    }
  }

  return SURFACE_CLASSES.OBSERVABILITY;
}

export function scanRuntimeSurfaces(filePath) {
  const source = fs.readFileSync(filePath, "utf8");

  const routeMatches = [
    ...source.matchAll(/["'`]\/[a-zA-Z0-9/_-]+["'`]/g)
  ];

  const surfaces = routeMatches.map((match) => {
    const route = match[0].slice(1, -1);

    return Object.freeze({
      route,
      method: route.startsWith("/runtime/")
        ? "GET"
        : "POST",
      classification: classifySurface(route),
      replay_neutral: route.startsWith("/runtime/"),
      append_only: true,
      authority_bound: !route.startsWith("/runtime/")
    });
  });

  return Object.freeze(
    surfaces.sort((a, b) =>
      a.route.localeCompare(b.route)
    )
  );
}
