# BREAK_GLASS_DEPLOYMENT

## Purpose

This document formalizes production-capable root-authority surfaces that can mutate infrastructure outside canonical MindShift legitimacy enforcement.

These paths are classified as:

`BREAK_GLASS`

Meaning:
- human-invoked
- observable
- attributable
- non-default
- exceptional
- auditable

They are NOT considered canonical runtime execution paths.

---

# Canonical Deployment Path

Preferred production lifecycle:

/session
→ /continuity
→ /authority
→ /compile
→ /validate
→ /execute
→ /proof

Production deployment SHOULD eventually require PREO + validator enforcement before mutation occurs.

---

# Approved Break-Glass Surfaces

## 1. Wrangler Local Deploy

Classification:
`BREAK_GLASS`

Observed capability:
- authenticated OAuth session
- workers(write)
- pages(write)
- d1(write)

Risk:
Direct production mutation outside runtime legitimacy chain.

Required controls:
- manual invocation only
- attributable terminal session
- observable deployment history
- limited operator access

---

## 2. Cloudflare Dashboard Admin

Classification:
`BREAK_GLASS`

Risk:
Manual production mutation through dashboard UI.

Required controls:
- account-owner visibility
- limited operator access
- deployment observability

---

## 3. GitHub Admin Merge Authority

Classification:
`BREAK_GLASS`

Risk:
Production deployment coupled to merge authority on `main`.

Required controls:
- branch protection
- PR review discipline
- governed merge expectations

---

# Forbidden Assumptions

Break-glass authority does NOT imply:
- legitimacy
- proof
- validator approval
- governed execution

Root authority is infrastructure sovereignty, not runtime legitimacy.

---

# Recovery / Rollback

If unauthorized production mutation occurs:

1. identify mutation surface
2. identify deployment artifact
3. identify responsible authority surface
4. rollback deployment
5. record observability evidence
6. update sovereignty inventory if new bypass discovered

---

# Future Milestone

Target future state:

`PREO-enforced production deployment`

Meaning:
production deployment cannot execute unless legitimacy object validation succeeds first.

