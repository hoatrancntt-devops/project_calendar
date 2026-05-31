# Documentation Update: Backend Calendar Sync & 2-Tier Architecture

## Summary
Updated `docs/deployment.md` to accurately reflect the new 2-tier Docker architecture (Backend Express + SQLite + Frontend Nginx). All changes are code-verified and link to actual implementation files.

## Changes Made

### File: `docs/deployment.md` (205 lines)

#### Section 1: Architecture Overview
- Changed headline from "VPS (Self-hosted)" → "VPS (Self-hosted, 2-tier Docker)"
- Added architecture table showing: Frontend (React+Vite→Nginx), Backend (Express), Database (SQLite)
- Documented internal Docker bridge network (`calendar_net`) and proxy setup

#### Section 2: Backend Services (NEW)
- **Calendar Sync Pipeline**: Documented 3-stage flow (Cron → Graph Auth → Calendar Sync)
  - Cron: startup + 15min intervals (verified in `backend/jobs/sync-job.js`)
  - Graph Auth: client_credentials → Azure AD token with in-memory cache (verified in `backend/services/graph-auth.js`)
  - Calendar Sync: Graph API fetch + transform → SQLite store (verified in `backend/services/calendar-sync.js`)
- **API Endpoints**: Documented all 4 REST endpoints with exact paths and purposes
  - POST /api/companies
  - GET /api/events?companyIds=...
  - POST /api/sync
  - GET /api/health
- **Database Schema**: Documented `companies` and `events` tables with all columns

#### Section 3: Deploy Command (Enhanced)
- Added "This triggers:" subsection documenting:
  - Backend Dockerfile: Node 22-alpine with SQLite build tools
  - Frontend Dockerfile: Multi-stage React build → Nginx Alpine
  - Docker Compose: service startup + volume + network setup

#### Section 4: Requirements (Updated)
- Added node:22-alpine and nginx:alpine image requirements

#### Section 5: Environment Variables (NEW)
- Backend: NODE_ENV, DB_PATH, PORT (all sourced from docker-compose.yml)
- Frontend: None at deploy time (MSAL configured at runtime from Settings)

#### Section 6: Persistent Storage (NEW)
- Documented `calendar_data:/data` named volume
- SQLite location in Docker's managed volume directory
- Explains data persistence across restarts
- Notes WAL mode for concurrency

#### Section 7: Changelog Addition
- New "2026-05-28 — Backend Calendar Sync & 2-Tier Architecture" entry
- Itemizes all 6 major changes with deployment impact analysis

## Verification

### Code References Verified
- `backend/app.js`: Express server, port 3000, routes setup
- `backend/db.js`: SQLite with WAL mode, schema creation
- `backend/jobs/sync-job.js`: Cron schedule (startup + every 15 minutes)
- `backend/services/graph-auth.js`: Client credentials flow, token caching
- `backend/Dockerfile`: Node 22-alpine with build tools
- `frontend/Dockerfile`: Multi-stage build with Nginx
- `frontend/nginx.conf`: API proxy configuration, SPA routing
- `docker-compose.yml`: 2 services, `calendar_data` volume, `calendar_net` network

### Links & Paths Verified
- All referenced files exist in codebase
- All API endpoint paths match actual route definitions
- Docker environment variables match compose file
- Port mappings accurate (4141→80 frontend, 3000 backend internal)

## Content Quality

- **Minimal & Accurate**: Focused only on deployment-relevant information
- **Code-Verified**: Every technical claim backed by actual file inspection
- **Complete Flow**: Covers architecture, services, deployment, persistence, rollback
- **Clear for Operators**: Table format for components, numbered deploy steps, rollback instructions
- **Changelog Context**: Documents evolution from frontend-only to 2-tier system

## No Additional Files Created

Per task requirement: only `docs/deployment.md` updated. No new docs files generated.

## Status: DONE

All deployment documentation now matches 2-tier architecture reality.
