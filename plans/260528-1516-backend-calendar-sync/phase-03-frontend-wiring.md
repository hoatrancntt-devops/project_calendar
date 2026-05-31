# Phase 03 — Frontend Wiring

**Priority:** P1 | **Status:** COMPLETED | **Effort:** 2h
**Blocked by:** 01 (api+proxy), 02 (real events)

## Overview
Switch MSAL to persistent session, replace mock events with `GET /api/events`, wire `handleSync()` → `POST /api/sync`, push company creds to `POST /api/companies` on save.

## Data flow
`App mount → fetch /api/events?companyId-less → setEvents`. `handleSync → POST /api/sync → re-fetch events`. `Settings save → onSaveCompanies + POST /api/companies`.

## Files to modify
- `frontend/src/lib/msal-config.js`
  - `cacheLocation: 'sessionStorage'` → `'localStorage'`; set `storeAuthStateInCookie: true` (IE/redirect safety). Session now persists across reloads; MSAL refresh-token invalidation handles password-change logout automatically.
- `frontend/src/App.jsx`
  - Add `fetchEvents()` helper: `GET /api/events`; on success `setEvents`; **on failure keep DEFAULT_EVENTS** (graceful fallback — see rollback).
  - Call `fetchEvents()` in a `useEffect` on login (when `currentUser` set).
  - `handleSync()` → `setIsSyncing(true); await fetch('/api/sync',{method:'POST'}); await fetchEvents(); setIsSyncing(false)` with try/catch + toast.
  - Keep `DEFAULT_EVENTS` as the initial/fallback value only; remove `save('appEvents', events)` localStorage write (server is source of truth) — but keep `load` fallback for offline.
- `frontend/src/components/Settings.jsx`
  - `handleSaveAll()` — after `onSaveCompanies(localCompanies)`, `POST /api/companies` with array mapped to `{id,companyName,tenantId,clientId,clientSecret,syncMailboxes}`. Show existing success/error message based on response. Only sends on explicit Save (per security notes).

## API base
Same-origin `/api/...` (nginx proxies). No env var needed; works in Docker. For `npm run dev` (vite) add proxy in `vite.config` only if local dev needed (note, not required this phase — YAGNI).

## Implementation steps
1. Edit msal-config.js (2-line change).
2. Add `fetchEvents` + login `useEffect` in App.jsx.
3. Rewire `handleSync` to call backend then refetch.
4. Add POST in Settings `handleSaveAll`.
5. `docker compose up -d --build frontend` → login → verify real events render, sync button refetches.

## Todo
- [x] msal localStorage + cookie
- [x] fetchEvents + login effect (fallback on error)
- [x] handleSync → POST /api/sync + refetch
- [x] Settings POST /api/companies on save

## Success criteria
- Reload page after MS login → still authenticated (localStorage persists).
- Calendar shows backend events (not mock) when backend reachable.
- Sync button triggers backend sync + refresh; spinner reflects real request.
- Saving company settings persists creds to backend (verify via `GET`-less DB check or re-sync).

## Risk assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Backend down → blank calendar | M×M | fetch failure keeps DEFAULT_EVENTS/localStorage cache + error toast |
| localStorage token XSS exposure | L×H | accepted tradeoff for persistent session; app is internal; no untrusted user input rendered as HTML |
| Event date filters hardcoded to 2026-05-28 in views | H×M | out of scope now; backend returns real dates, views already filter by `date` string — flag for follow-up |
| Double source of truth (localStorage vs server) | M×M | server authoritative; localStorage only offline fallback |

## Security
- Creds POSTed only on explicit admin Save (not on every keystroke).
- clientSecret travels over Docker-internal nginx→backend hop; never logged client-side.

## Next steps / follow-ups
- Hardcoded "today = 2026-05-28" in day/week/month views needs dynamic date (separate task).
- Write-back of locally-added events ("Book Lịch") to M365 — future iteration.
