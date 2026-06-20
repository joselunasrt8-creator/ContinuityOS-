# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

MindShift is a Cloudflare Worker (with D1 database) implementing an Execution Ontology Infrastructure — a governance framework that enforces legitimacy checks before state-changing execution occurs. The canonical runtime flow is: `/session → /continuity → /authority → /compile → /validate → /execute → /proof`.

> Brand context: **ContinuityOS** is the product runtime described here; **MindShift** is the research canon it derives from; **Continufy** is the company. The deployed Cloudflare Worker/D1 keep the historical `mindshift-demo*` names (see [`IDENTITY_RESIDUE_AUDIT.md`](IDENTITY_RESIDUE_AUDIT.md)) — those are deploy identifiers, not brand surfaces, and are intentionally left unchanged.

### Running the dev server

1. Ensure `.dev.vars` exists with `API_KEY=<any-non-empty-string>` for local mutation endpoints.
2. Apply D1 migrations: `npx wrangler d1 migrations apply DB --local`
3. Start the server: `npm run dev` (runs `wrangler dev --local` on port 8787)

The `npm run d1:migrate:local` script uses an outdated binding name (`mindshift-demo-local`). Use `npx wrangler d1 migrations apply DB --local` instead.

### Testing

- **Unit/FATE tests**: `npm test` (uses `node --test`, ~946 tests, ~34 pre-existing failures on main)
- **Conformance tests**: `npm run conformance` (deterministic vector/suite verification)
- **TypeScript check**: `npx tsc --noEmit` (3 pre-existing errors on main)

### API authentication

Mutation endpoints (POST to `/session`, `/continuity`, `/authority`, `/compile`, `/validate`, `/execute`, `/proof`) require the `X-API-Key` header matching the `API_KEY` environment variable. Read-only observability endpoints (GET) do not require authentication.

### Key gotchas

- The `wrangler.toml` `compatibility_date` may exceed the installed wrangler's supported range. If `wrangler dev` fails with a compatibility date error, update wrangler: `npm install wrangler@latest`.
- The local D1 state lives in `.wrangler/state/v3/d1/`. Delete this directory to reset the local database.
- The `package.json` `d1:migrate:local` script references a nonexistent binding name. Always use `npx wrangler d1 migrations apply DB --local`.
