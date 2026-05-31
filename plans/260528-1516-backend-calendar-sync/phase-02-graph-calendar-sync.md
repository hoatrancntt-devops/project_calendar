# Phase 02 — Graph API Calendar Sync

**Priority:** P1 | **Status:** COMPLETED | **Effort:** 3h
**Blocked by:** 01 | **Blocks:** 03 (real events)

## Overview
Implement app-only Graph auth + per-mailbox calendar fetch, transform to App.jsx Event shape, cache in SQLite. Wire node-cron (15 min) and replace the Phase 01 sync.js stub.

## Data flow
`syncAll() → for each company → getToken(tenant,client,secret) → for each syncMailbox → GET /users/{mailbox}/calendarView?startDateTime&endDateTime&$top=50 → transform → replaceCompanyEvents(companyId, events[])`.

## Files to create
- `backend/services/graph-auth.js`
  - `getToken(tenantId, clientId, clientSecret)` → `POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with body `grant_type=client_credentials&scope=https://graph.microsoft.com/.default&client_id&client_secret`. Cache token per tenantId in memory until `expires_in - 60s`.
- `backend/services/calendar-sync.js`
  - `transformEvent(graphEvent, companyId)` → Event shape (see contract below).
  - `syncCompany(company)` → returns event[] (token + loop mailboxes via `axios`, `Prefer: outlook.timezone="SE Asia Standard Time"`).
  - `syncAll()` → load companies from db, sync each, `replaceCompanyEvents`, return `{companyId,count,error?}[]`.
- `backend/jobs/sync-job.js` — `cron.schedule('*/15 * * * *', syncAll)`; export `startSyncJob()`.

## Files to modify
- `backend/routes/sync.js` — call `syncAll()`, return per-company results.
- `backend/app.js` — `startSyncJob()` after listen; run one `syncAll()` on boot (fire-and-forget, catch errors).

## Event transform contract (CRITICAL)
| Event field | Graph source |
|-------------|--------------|
| id | `event.id` (Graph string id) |
| companyId | passed in |
| title | `event.subject` |
| date | `event.start.dateTime` → `YYYY-MM-DD` |
| time | `start..end` → `"HH:MM - HH:MM"` (24h, local) |
| type | `event.isOnlineMeeting` ? `'teams'` : `'offline'` |
| location | `event.location.displayName` (or `'Microsoft Teams'` if teams) |
| attendees | `event.attendees[].emailAddress.name` joined `, ` |
| organizer | `event.organizer.emailAddress.address` |
| status | `event.responseStatus.response` → `'confirmed'`/`'pending'` (map `tentative`→pending) |

`calendarView` window: now → +60 days (covers month view + existing 14-day expiry lookahead).

## Implementation steps
1. graph-auth.js with in-memory token cache keyed by tenantId.
2. calendar-sync.js transform + syncCompany + syncAll; wrap each company in try/catch so one bad tenant doesn't abort others.
3. sync-job.js cron; wire into app.js boot + after listen.
4. Replace sync.js stub.
5. Manual: `POST /api/sync` with real creds → verify events table populated, shape matches contract.

## Todo
- [x] graph-auth.js + token cache
- [x] transformEvent (exact shape)
- [x] syncCompany / syncAll (per-company error isolation)
- [x] sync-job.js cron + boot sync
- [x] sync.js real impl

## Success criteria
- `POST /api/sync` populates events for companies with valid creds; returns per-company `{count}`.
- Bad/empty creds for one company → that company `{error}`, others still succeed.
- Cron fires every 15 min (log timestamp).

## Risk assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Azure app lacks `Calendars.Read` application perm + admin consent | H×H | document required perm; surface Graph 403 in sync result `error` |
| Token cache stale after secret rotation | M×M | cache TTL = expires_in−60s; invalidate on 401 retry once |
| Graph paging (>50 events) dropped | M×L | request `$top=50` + `$orderby=start/dateTime`; paging deferred (YAGNI now) |
| All-day events have date-only start | M×M | handle missing time → `"00:00 - 23:59"` |
| Empty syncMailboxes array | H×L | skip company, no error |

## Security
- clientSecret read from DB only at sync time; never logged. Log mailbox + count, not creds.
- Token kept in memory only, never persisted.

## Next steps
Phase 03 consumes the now-populated `/api/events`.
