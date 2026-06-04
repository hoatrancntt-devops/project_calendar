# Deployment

## Platform: VPS (Self-hosted, 2-tier Docker)

## URL: http://100.107.189.14:4141

## Server
- **Host:** 100.107.189.14
- **User:** hoatv
- **Remote dir:** /home/hoatv/m365-calendar
- **Services:** 2 Docker containers + named volume + internal network
- **Port mapping:** 4141 → 80 (frontend only; backend on internal network)

## Architecture

| Component | Tech | Port | Access |
|-----------|------|------|--------|
| Frontend | React + Vite → Nginx | 4141 (host) → 80 (container) | Public (4141) |
| Backend | Express.js | 3000 | Internal Docker network only |
| Database | SQLite (WAL mode) | N/A | Volume-mounted (`calendar_data:/data`) |

**Network:** Internal Docker bridge (`calendar_net`) — backend not exposed to host. Nginx proxies `/api/*` → `http://backend:3000/api/` via Docker DNS.

## Backend Services

**Calendar Sync Pipeline:**
1. **Cron Job** (`jobs/sync-job.js`): Runs on startup + every 15 minutes
2. **Graph Auth** (`services/graph-auth.js`): Client credentials flow → Azure AD token (cached per tenant)
3. **Calendar Sync** (`services/calendar-sync.js`): Fetches `/users/{mailbox}/calendarView` → transforms → stores in SQLite

**API Endpoints:**
- `POST /api/companies` — Store company credentials (tenant_id, client_id, client_secret, mailboxes)
- `GET /api/events?companyIds=...` — List cached events from SQLite
- `POST /api/sync` — Trigger immediate sync
- `GET /api/health` — Health check (status + timestamp)
- `GET /api/manifest.webmanifest` — PWA manifest (app name "Lịch Họp - HLV", start_url `/`)
- `GET /api/app-icon-192` · `/api/app-icon-512` · `/api/apple-touch-icon` — home-screen icons (PNG)

**PWA / home-screen shortcut icon:**
- Icons are derived from the admin-uploaded **global logo** (`app_settings`), rasterized to square PNG (192/512/180) in the browser on logo upload.
- Manifest + icons are served under `/api` so nginx proxies them and injects the internal key (no nginx change needed).
- Icon routes have **no `.png` extension** on purpose — nginx's `\.(png|...)$` static-asset regex would otherwise intercept them and 404. Content-Type drives rendering.
- After deploy, admin must **re-upload the logo once** to populate icons (no auto-migration). Until then `manifest.icons` is empty and the OS uses a default icon.
- iOS caches `apple-touch-icon` at "Add to Home Screen" time — changing the logo later won't update shortcuts already added.

**Database Schema:**
- `companies`: id, company_name, tenant_id, client_id, client_secret, sync_mailboxes
- `events`: id, company_id, title, date, time, type, location, attendees, organizer, status, synced_at

## Deploy Command

```powershell
$env:VPS_USER = 'hoatv'
$env:VPS_PASSWORD = 'your_password'
$env:BACKEND_API_SECRET = 'your_secret'
python -X utf8 deploy-vps.py
```

The script uses `paramiko` (Python SSH/SFTP) via **Tailscale NC proxy** to:
1. Connect through `tailscale nc hlv-org-calendar 22` (bypasses fail2ban on direct IP)
2. Write `.env` with `BACKEND_API_SECRET` to remote dir
3. Upload project files (excludes `node_modules`, `dist`, `.env`)
4. Run `sudo docker compose up -d --build` on VPS

**Note:** Set `TAILSCALE_NC=0` to connect directly (requires fail2ban whitelist).

This triggers:
- **Backend Dockerfile**: Builds Node.js Alpine image with SQLite build tools (python3, make, g++)
- **Frontend Dockerfile**: Multi-stage build (node:22-alpine → build → nginx:alpine)
- **Docker Compose**: Starts both services, creates `calendar_data` volume, sets up `calendar_net` bridge

## Requirements
- Python + `paramiko` installed locally
- Docker & Docker Compose on VPS
- VPS user must have `sudo` access
- Backend: node:22-alpine image (pre-installed on deploy)
- Frontend: nginx:alpine image (pre-installed on deploy)

## Environment Variables

**Backend (.env or runtime):**
- `NODE_ENV=production` (set in docker-compose)
- `DB_PATH=/data/calendar.db` (set in docker-compose; persisted in `calendar_data` volume)
- `PORT=3000` (default)

**Frontend:**
- None required at deploy time (MSAL config built from Settings at runtime)

## Persistent Storage

- **Volume:** `calendar_data:/data` (Docker named volume)
- **Location on Host:** `/var/lib/docker/volumes/calendar_data/_data/` (system-managed)
- **Databases:** `calendar.db` (SQLite with WAL mode for concurrency)
- **Persists:** Company credentials, cached events, sync timestamps across container restarts

## Rollback
SSH into VPS and run a previous image or redeploy:
```bash
ssh hoatv@100.107.189.14
cd /home/hoatv/m365-calendar
sudo docker compose down
sudo docker compose up -d  # without --build to use cached image
```

## Notes
- Backend not exposed to host; only reachable via Nginx proxy inside Docker network
- SQLite WAL mode enabled for better concurrency during sync operations
- Better-sqlite3 requires native build tools; backend Dockerfile installs python3, make, g++
- Frontend serves React SPA + static assets; Nginx handles SPA routing (fallback to index.html)
- API responses proxied through Nginx with 10s connect timeout, 30s read timeout
- All Docker layers cached on first deploy; subsequent builds are fast

## Changelog

### 2026-06-04 — Per-Mailbox Reconcile + PWA Shortcut Icon

**Fix — calendar sync reconcile (`backend/services/calendar-sync.js`):**
- Sync now reconciles **per mailbox** instead of per company. Changing a company's sync mailbox now actually replaces the old calendar (previously stale events lingered because the per-company partial-response guard + delete-all-by-company kept them).
- Orphan cleanup removes events of de-configured mailboxes; partial-response guard + delete/insert scoped to `(company_id, mailbox)`; mailbox normalized lowercase; new-event email dedup + notify only for established mailboxes.
- Frontend `visibleEvents` enforces `allowedMailboxes` so a mailbox-restricted user only sees permitted mailboxes (UI render gate; backend has no per-user identity).

**Feature — PWA home-screen shortcut icon:**
- New `frontend/src/lib/app-icon.js` (canvas rasterize), `backend/routes/icon-routes.js` (manifest + icon serving), index.html manifest/apple-touch-icon/meta.
- See **PWA / home-screen shortcut icon** under Backend Services above.

**Deployment Impact:** No new env vars. Schema unchanged (uses existing `events.mailbox` + `app_settings`). First sync after deploy runs orphan cleanup. Admin should re-upload the global logo once to generate shortcut icons.

### 2026-05-28 — Microsoft SSO, API Expiry Alerts & Email Configuration
**New Features:**

1. **Microsoft SSO (MSAL.js)**
   - Users declared by admin can login with Microsoft 365 account
   - Uses `@azure/msal-browser` + `@azure/msal-react`
   - New `MsalAuthButton.jsx` component: button shown only when Azure App Client ID configured in Settings
   - `src/lib/msal-config.js`: Builds MSAL PublicClientApplication config from adminSettings (msClientId, msTenantId)
   - LOGIN_SCOPES: `['User.Read', 'Mail.Send']` for identity verification and mail permission

2. **API Expiry Alerts**
   - Per-company list of expiry alert recipients (`expiryAlertEmails[]` in company settings)
   - Dashboard warning banners: yellow (within 30 days), red (within 7 days)
   - "Gửi cảnh báo" button sends email via Graph API Mail.Send
   - `src/lib/expiry-utils.js`: Utility functions for expiry date calculations and alert thresholds
   - `src/hooks/use-graph-mail.js`: Hook for sending emails via Microsoft Graph API

3. **Microsoft Mail Configuration**
   - New "📧 Email" tab in Settings page with three configurable fields:
     - From name (displayed in sent emails)
     - Reply-to address (for recipient replies)
     - Test-send button to verify configuration
   - `src/lib/graph-client.js`: Graph API client wrapper for Mail.Send, authenticated via MSAL token

**New Files:**
- `src/lib/msal-config.js` — MSAL configuration builder
- `src/lib/graph-client.js` — Microsoft Graph API client
- `src/lib/expiry-utils.js` — Expiry date utilities
- `src/hooks/use-graph-mail.js` — Mail sending hook
- `src/components/MsalAuthButton.jsx` — Microsoft login button component

**Note:** All existing features (M365 sync, multi-company support, i18n) remain functional.

### 2026-05-28 — UI Redesign
- **Login.jsx**: Implemented split-panel layout with blue branding panel (left) and login form (right). Mobile: compact logo header with Calendar icon.
- **Dashboard.jsx**: Converted to 12-column grid layout (`grid-cols-1 lg:grid-cols-12`). Added mobile hamburger sidebar toggle (`mobileMenuOpen` state). Header now sticky with responsive breakpoints.
- **BookingModal.jsx**: Added mobile slide-up behavior (`items-end sm:items-center`). New blue header bar with white text. Event type selection via radio button selector (Teams vs Offline).
- All business logic, i18n translations, M365 sync, and multi-company features preserved.
- Build: clean, 308KB bundle size.

### 2026-05-28 — Refinements to MSAL SSO & Expiry Alerts
**Implementation Details (internal improvements, no new deployment changes):**

1. **Configurable Expiry Thresholds**
   - Added `EXPIRY_DEFAULTS` constant in `src/lib/expiry-utils.js`: warning = 30 days, critical = 7 days
   - Admin can override via Settings: `expiryWarningDays` and `expiryCriticalDays` fields
   - `expiryStatus()` function accepts optional threshold overrides for flexible alert levels

2. **Silent Token Refresh**
   - New `silentRefreshToken()` in `src/lib/msal-config.js` uses MSAL's `acquireTokenSilent()` to refresh cached tokens
   - In `App.jsx` `sendExpiryAlert()`: attempts silent refresh before sending email
   - If MSAL session expired, falls back to stored token gracefully

3. **Alert Deduplication**
   - `alertsSent` state tracks `{ companyId: 'YYYY-MM-DD' }` in localStorage
   - Prevents sending multiple alerts for same company on same day
   - Users can manually re-trigger alert from Dashboard

4. **UX Improvements**
   - Toast notifications (`setToast`) replace `window.alert()` — cleaner UI
   - Settings → "Ngưỡng Cảnh Báo" card allows admin to adjust alert day thresholds
   - Deleted dead code: `src/hooks/use-graph-mail.js` hook; mail logic inlined into `App.jsx`

**Deployment Impact:** None — all changes are refactoring and feature refinement. No new env vars or config required.

### 2026-05-28 — Backend Calendar Sync & 2-Tier Architecture
**Major Refactor: Frontend-only → Backend + Frontend**

1. **Backend Service (Express.js + SQLite)**
   - New `backend/` directory with Node.js Express server
   - Runs on port 3000 inside Docker network (not exposed to host)
   - SQLite database (`calendar.db`) stored in persistent `calendar_data` volume
   - Better-sqlite3 with WAL mode for concurrent reads during sync

2. **Calendar Sync Pipeline**
   - Cron job: startup sync + every 15 minutes via `node-cron`
   - Graph Auth service: Client credentials flow → Azure AD token per tenant (in-memory cache)
   - Calendar Sync service: Fetches `/users/{mailbox}/calendarView` → transforms → stores in SQLite
   - All synced events accessible via REST API

3. **API Endpoints (Backend)**
   - `POST /api/companies` — Store/update company credentials (tenant, client, mailboxes)
   - `GET /api/events?companyIds=...` — Query cached events from SQLite
   - `POST /api/sync` — Trigger immediate sync for all companies
   - `GET /api/health` — Health check (for monitoring)

4. **Frontend Changes**
   - Nginx reverse proxy added (`nginx.conf`): proxies `/api/*` → backend:3000 via Docker DNS
   - Frontend now uses REST API instead of direct Graph API calls
   - MSAL session persisted in localStorage (survives browser restart)

5. **Docker Compose Setup**
   - 2 services: `backend` (node:22-alpine) + `frontend` (nginx:alpine)
   - Internal bridge network `calendar_net` — backend isolated from host
   - Named volume `calendar_data` for persistent SQLite storage
   - Frontend exposed on port 4141; backend only reachable via Nginx proxy

6. **Database Schema (SQLite)**
   - `companies`: id, company_name, tenant_id, client_id, client_secret, sync_mailboxes
   - `events`: id, company_id, title, date, time, type, location, attendees, organizer, status, synced_at

**Deployment Impact:**
- Docker build now includes backend service — total image size slightly larger (node + build tools)
- `docker-compose up -d --build` now builds 2 Dockerfiles (backend + frontend)
- No new env vars required; `NODE_ENV` and `DB_PATH` auto-set in compose
- Data persists across restarts via `calendar_data` volume
- Deploy script unchanged; paramiko still handles SFTP + remote compose command
