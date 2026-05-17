import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  scanRuntimeSurfaces
} from "../../runtime/runtime_surface_scanner.mjs";

test("runtime surface scanner discovers routes deterministically", () => {
  const fixture = "./tests/fate/runtime_surface_fixture.tmp";

  fs.writeFileSync(
    fixture,
    `
      app.get("/runtime/checkpoint")
      app.post("/execute")
      app.post("/deploy")
    `
  );

  const surfaces = scanRuntimeSurfaces(fixture);

  assert.equal(surfaces.length, 3);

  assert.equal(
    surfaces[0].route,
    "/deploy"
  );

  fs.unlinkSync(fixture);
});

test("runtime scanner classifies execution surfaces", () => {
  const fixture = "./tests/fate/runtime_surface_fixture.tmp";

  fs.writeFileSync(
    fixture,
    `
      app.post("/execute")
    `
  );

  const surfaces = scanRuntimeSurfaces(fixture);

  assert.equal(
    surfaces[0].classification,
    "EXECUTION_CAPABLE"
  );

  fs.unlinkSync(fixture);
});

test("runtime scanner preserves replay neutrality for runtime observability", () => {
  const fixture = "./tests/fate/runtime_surface_fixture.tmp";

  fs.writeFileSync(
    fixture,
    `
      app.get("/runtime/topology")
    `
  );

  const surfaces = scanRuntimeSurfaces(fixture);

  assert.equal(
    surfaces[0].replay_neutral,
    true
  );

  fs.unlinkSync(fixture);
});
