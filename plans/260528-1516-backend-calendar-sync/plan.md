---
title: "Backend Calendar Sync Service"
description: "Express + SQLite backend that syncs M365 calendars per company via Graph app-permissions; wires frontend off mock data."
status: completed
priority: P1
effort: 9h
branch: master
tags: [backend, express, sqlite, microsoft-graph, calendar-sync, docker]
created: 2026-05-28
completed: 2026-05-28
---

# Backend Calendar Sync Service

Replace 100% mock calendar data with a real backend that pulls each company's
M365 calendar via Graph API (app-only `client_credentials`), caches in SQLite,
and serves merged events to the React SPA. Adds persistent MSAL session.

## Architecture (data flow)

```
Admin saves company creds (Settings.jsx)
   → POST /api/companies → SQLite companies table
node-cron (15 min) OR POST /api/sync
   → graph-auth.getToken(tenant,client,secret)  [per company]
   → GET /users/{mailbox}/calendarView          [per syncMailbox]
   → transform → upsert SQLite events table
Frontend load / handleSync
   → GET /api/events?companyId=...  → render
```

## Phases

| # | Phase | File | Status | Effort |
|---|-------|------|--------|--------|
| 01 | Backend Express setup (server, DB, routes, docker, nginx) | [phase-01-backend-setup.md](phase-01-backend-setup.md) | COMPLETED | 4h |
| 02 | Graph API calendar sync (auth, sync service, cron) | [phase-02-graph-calendar-sync.md](phase-02-graph-calendar-sync.md) | COMPLETED | 3h |
| 03 | Frontend wiring (localStorage MSAL, real events, sync) | [phase-03-frontend-wiring.md](phase-03-frontend-wiring.md) | COMPLETED | 2h |

## Dependencies

- 02 blocked by 01 (needs DB schema + company rows).
- 03 blocked by 01 (needs `/api/events`, `/api/companies`, nginx proxy) and 02 (real events to render).

## Critical contracts (must not drift)

- **Event shape** consumed by App.jsx: `{ id, companyId, title, time:"HH:MM - HH:MM", date:"YYYY-MM-DD", type:"teams"|"offline", location, attendees, organizer, status }`.
- **Company id** is client-generated (`c-suleco`, `c-${Date.now()}`) — backend uses it as PK, never regenerates.

## Rollback

Per phase: revert files + `docker compose up -d --build frontend`. Backend is additive; removing the `backend` service + nginx `/api` block restores current mock behavior (frontend falls back to DEFAULT_EVENTS when fetch fails).

## Out of scope (YAGNI)

- Writing events back to M365 (Book Lịch stays local-only this iteration).
- Auth on backend API (relies on Docker-network isolation per security notes).
- SQLite migrations tooling (single `CREATE TABLE IF NOT EXISTS`).
