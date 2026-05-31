# Phase 01 — Backend Express Setup

**Priority:** P1 | **Status:** COMPLETED | **Effort:** 4h
**Blocks:** 02, 03

## Overview
Stand up the Express server, SQLite schema, CRUD routes, and Docker/nginx wiring. No Graph calls yet (stubbed sync returns []).

## Data flow
`Settings save → POST /api/companies → companies table`. `Frontend load → GET /api/events → events table`. nginx routes `/api/*` → `backend:3000`.

## Files to create
- `backend/app.js` — Express: helmet, cors, express.json(), mount routers, listen 3000.
- `backend/db.js` — better-sqlite3 at `/data/calendar.db`; `CREATE TABLE IF NOT EXISTS`:
  - `companies(id TEXT PK, companyName TEXT, tenantId TEXT, clientId TEXT, clientSecret TEXT, syncMailboxes TEXT/*JSON*/, updatedAt TEXT)`
  - `events(id TEXT PK, companyId TEXT, title, time, date, type, location, attendees, organizer, status, syncedAt TEXT)`
  - export prepared helpers `upsertCompany`, `getCompanies`, `getEventsByCompany`, `replaceCompanyEvents`.
- `backend/routes/companies.js` — `POST /` upsert array of `{id,companyName,tenantId,clientId,clientSecret,syncMailboxes}`; never log clientSecret.
- `backend/routes/events.js` — `GET /?companyId=` → rows mapped to Event shape; no companyId → all.
- `backend/routes/sync.js` — `POST /` calls sync service (Phase 02); Phase 01 stub returns `{ ok:true, synced:0 }`.

## Files to modify
- `backend/package.json` — add `node-cron`, `axios`.
- `docker-compose.yml` — add `backend` service: build `./backend`, expose 3000 (internal only), volume `backend-data:/data`, `restart: always`; add `depends_on` frontend→backend.
- `frontend/nginx.conf` — add `location /api/ { proxy_pass http://backend:3000/api/; proxy_set_header Host $host; }`.
- create `backend/Dockerfile` — node:22-alpine, copy, `npm install --omit=dev`, `CMD ["node","app.js"]`.

## Implementation steps
1. Add deps to package.json; create Dockerfile.
2. Write db.js (JSON-encode syncMailboxes on write, parse on read).
3. Write 3 routers + app.js mounting at `/api/companies`, `/api/events`, `/api/sync`.
4. Add backend service + named volume to compose; add nginx proxy block.
5. `docker compose up -d --build` → verify `curl backend/api/events` = `[]`.

## Todo
- [x] deps + Dockerfile
- [x] db.js schema + helpers
- [x] companies/events/sync routers
- [x] app.js wiring
- [x] compose + nginx proxy
- [x] container build + smoke test

## Success criteria
- `GET /api/events` returns `[]` (empty DB), 200.
- `POST /api/companies` with seed array persists rows; re-GET reflects them.
- nginx forwards `/api/*` to backend (curl via frontend container).

## Risk assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| better-sqlite3 native build fails on alpine | M×H | use `node:22-alpine` + `apk add python3 make g++ build-base` in builder, or `node:22-slim` |
| SQLite file lost on container restart | M×H | named volume `backend-data:/data` |
| nginx proxy path mismatch (double `/api`) | M×M | proxy_pass keeps `/api/` prefix; test explicitly |

## Security
- clientSecret stored plaintext in SQLite (Docker-internal, acceptable per notes); add to `.gitignore` the `*.db`; never `console.log` secret fields.
- helmet on; backend not published to host (no `ports:` mapping, only `expose`).

## Next steps
Phase 02 replaces sync.js stub with real Graph sync.
