import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

function readJson(path: string): any {
  return JSON.parse(fs.readFileSync(path, "utf8"))
}

test("package deploy script stays fail-closed for direct production deploy", () => {
  const pkg = readJson("package.json")
  assert.ok(typeof pkg.scripts?.deploy === "string")
  assert.ok(pkg.scripts.deploy.includes("Direct deploy disabled"))
  assert.ok(pkg.scripts.deploy.includes("governed-deploy.yml"))
})

test("governed deploy workflow remains canonical production path", () => {
  const content = fs.readFileSync(".github/workflows/governed-deploy.yml", "utf8")
  assert.ok(content.includes("DEPLOY_ENVIRONMENT: production"))
  assert.ok(content.includes("DEPLOY_WORKFLOW: governed-deploy.yml"))
  assert.ok(content.includes("/session"))
  assert.ok(content.includes("/continuity"))
  assert.ok(content.includes("/authority"))
  assert.ok(content.includes("/compile"))
  assert.ok(content.includes("/validate"))
  assert.ok(content.includes("/execute"))
  assert.ok(content.includes("/proof"))
})

test("Cloudflare Git Integration production bypass remains explicitly OPEN unless governed", () => {
  const inventory = readJson("runtime/sovereignty/root_authority_inventory.json")
  const surface = inventory.surfaces.find((item: any) => item.surface_id === "cloudflare_git_integration")

  assert.ok(surface, "cloudflare_git_integration surface must be declared")
  assert.equal(surface.production_capability, true)
  assert.equal(surface.governed_by_mindshift, false)
  assert.equal(surface.bypass_risk, "P3")
  assert.equal(surface.status, "OPEN")
  assert.equal(surface.preview_target_only, true)
  assert.equal(surface.production_mutation_allowed, false)
})

test("production-capable bypass cannot be marked safe", () => {
  const inventory = readJson("runtime/sovereignty/root_authority_inventory.json")
  const productionBypasses = inventory.surfaces.filter(
    (item: any) => item.production_capability === true && item.governed_by_mindshift === false,
  )

  for (const bypass of productionBypasses) {
    assert.notEqual(bypass.status, "SAFE")
    assert.notEqual(bypass.containment_status, "CONTAINED")
  }
})
