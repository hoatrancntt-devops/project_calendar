---
phase: 03
title: Backend Node.js/Express + SQLite
status: todo
priority: high
effort: 1-2d
---

# Phase 03 — Backend Node.js/Express + SQLite

## Overview

Thay thế localStorage bằng backend thực. Credentials M365 lưu server-side — không bao giờ gửi về client. Data persist qua browser reload/clear.

## Architecture

```
frontend/            ← React/Vite (port 4141 via Nginx)
backend/             ← Express (port 3001, internal Docker network)
  ├── app.js
  ├── db/
  │   └── schema.sql
  ├── routes/
  │   ├── companies-router.js
  │   ├── users-router.js
  │   ├── events-router.js
  │   └── auth-router.js
  ├── middleware/
  │   ├── auth-middleware.js
  │   └── validate-middleware.js
  ├── services/
  │   └── m365-token-service.js   ← Phase 04
  └── package.json
```

## Database Schema (SQLite)

```sql
-- companies: M365 credentials server-side only
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  tenant_id TEXT,        -- AES-256-GCM encrypted at rest (server-side)
  client_id TEXT,        -- AES-256-GCM encrypted at rest
  client_secret TEXT,    -- AES-256-GCM encrypted at rest
  key_version TEXT DEFAULT 'v1',  -- [RED TEAM F11] for key rotation support
  api_expiration_date TEXT,
  api_warning_email TEXT,
  sync_mailboxes TEXT,   -- JSON array string
  notify_emails TEXT,    -- JSON array string
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- users: authorized app users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,           -- NULL for M365 SSO users; bcrypt hash only for 'sctsadmin'
  auth_provider TEXT DEFAULT 'm365',  -- 'local' (admin) | 'm365' (SSO users)
  allowed_company_ids TEXT,     -- JSON array string
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- [RED TEAM F10] Session store for JWT revocation
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,  -- SHA-256 of JWT
  user_id TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked INTEGER DEFAULT 0,    -- 0=active, 1=revoked
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- events: calendar events
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT,
  time TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT DEFAULT 'offline',  -- 'teams' | 'offline'
  location TEXT,
  attendees TEXT,
  organizer TEXT,
  status TEXT DEFAULT 'confirmed',
  m365_event_id TEXT,           -- Graph API event ID (Phase 04)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- admin_settings: global config
CREATE TABLE admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Rows: globalCompanyName, globalCompanyLogo, faviconUrl
-- adminPassword lưu bcrypt hash
```

## API Endpoints

### Auth
```
POST /api/auth/login          body: { username, password } → { token, user }  [admin only]
POST /api/auth/login-m365     body: { idToken } → { token, user }              [M365 SSO users]
POST /api/auth/logout         → revoke current session
POST /api/auth/admin-verify   body: { password } → { ok, adminVerifyToken }   [single-use, 5-min]
```

### Companies (admin only)
```
GET    /api/companies                    → list (credentials KHÔNG trả về — masked only)
POST   /api/companies                    → create
PUT    /api/companies/:id                → update (non-credential fields)
DELETE /api/companies/:id                → delete
⛔ REMOVED: GET /api/companies/:id/credentials  → [RED TEAM F3] NEVER send raw secrets to client
PUT    /api/companies/:id/credentials    → write-only update (yêu cầu admin-verify token)
                                           Response: { ok: true, maskedClientId: "••••{last4}" }
```

### Users (admin only)
```
GET    /api/users       → list
POST   /api/users       → create
PUT    /api/users/:id   → update permissions
DELETE /api/users/:id   → delete
```

### Events
```
GET    /api/events?companyId=&startDate=&endDate=  → list
       ⚠️ [RED TEAM F8] MUST verify req.user.allowedCompanyIds.includes(companyId) server-side
       Non-admin users CANNOT query companies outside their allowedCompanyIds
POST   /api/events       → create
PUT    /api/events/:id   → update
DELETE /api/events/:id   → delete
```

### Admin Settings
```
GET /api/settings        → get all (trừ password)
PUT /api/settings        → update
PUT /api/settings/password  → change password (yêu cầu current password)
```

## Auth Strategy

**Dual auth model (validated 2026-05-28):**

### Admin (sctsadmin)
- Login với username `sctsadmin` + bcrypt password → JWT (24h) + session in `sessions` table
- `users.password_hash` column chỉ dùng cho admin account
- Password change → revoke all sessions: `UPDATE sessions SET revoked=1 WHERE user_id=?`

### Regular Users (M365 SSO — email domain verify)
- Frontend dùng **MSAL.js** (`@azure/msal-browser`) để sign-in via Microsoft Identity Platform
- Microsoft trả ID token (JWT) → frontend gửi về backend: `POST /api/auth/login-m365 { idToken }`
- Backend verify ID token signature (Microsoft JWKS) → extract `email` claim → check email trong `users` table → check `allowedCompanyIds` not empty → issue app JWT
- **Không lưu Microsoft token** — chỉ dùng một lần để verify identity
- MSAL tenant config: `common` (multi-tenant) hoặc specific tenantId tùy setup

```js
// backend/routes/auth-router.js
// POST /api/auth/login-m365
router.post('/login-m365', async (req, res) => {
  const { idToken } = req.body;
  // 1. Verify idToken với Microsoft JWKS endpoint
  // 2. Extract email from claims
  // 3. Check email in users table (allowedCompanyIds not empty)
  // 4. Issue app JWT
});
```

**JWT (jsonwebtoken):**
- Token 24h expiry, stored in memory (React state) + httpOnly cookie
- Admin-sensitive routes require `X-Admin-Verify` header (5-min single-use token)
- **[RED TEAM F10] Revocation**: sessions table validates token on each request
- **[RED TEAM F12] appUsers deprecated**: `appUsers` frontend constant REMOVED, backend `users` table is source of truth

### New dependency
- Frontend: `@azure/msal-browser` for Microsoft login popup/redirect
- Backend: `jwks-rsa` + `jsonwebtoken` to verify Microsoft ID tokens

**Server-side credential encryption:**
```js
// [RED TEAM F14] AES-256-GCM (NOT CBC) — authenticated encryption
// Same algorithm as client-side crypto-utils.js for consistency
const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY; // 32-byte hex
// [RED TEAM F11] Key rotation: companies.key_version tracks which key version encrypted each row
// Re-encryption script: decrypt with old key → re-encrypt with new key → update key_version
```

## Frontend Changes

Thay thế tất cả `localStorage.getItem/setItem` bằng API calls:

```js
// Ví dụ: thay vì
const saved = localStorage.getItem('appCompanies');

// Dùng custom hook
const { companies, loading } = useCompanies(); // fetch /api/companies
```

Tạo API client layer: `frontend/src/api/api-client.js`

```js
// Centralized fetch wrapper với JWT token
export const apiClient = {
  get: (path) => fetch(`/api${path}`, { headers: authHeaders() }),
  post: (path, body) => fetch(`/api${path}`, { method: 'POST', body: JSON.stringify(body), headers: authHeaders() }),
  put: (path, body) => ...,
  delete: (path) => ...
};
```

## Docker Compose Update

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    # [RED TEAM F6] Use expose, NOT ports — backend only reachable within Docker network via Nginx
    expose:
      - "3001"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - CREDENTIAL_ENCRYPTION_KEY=${CREDENTIAL_ENCRYPTION_KEY}
    volumes:
      - ./data:/app/data   # SQLite DB persistent volume
    restart: always
    container_name: m365-calendar-backend

  frontend:
    build: ./frontend
    ports:
      - "4141:80"
    depends_on:
      - backend
    restart: always
    container_name: m365-calendar-app
```

Nginx trong frontend container chỉ serve HTTP (port 80). **TLS được handle bởi upstream reverse proxy trên VPS (Nginx/Caddy/HAProxy ngoài Docker)** — không cần cert trong container.

```nginx
# frontend/nginx.conf — HTTP only, TLS terminated upstream
location /api/ {
  proxy_pass http://backend:3001;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

> **Deployment note:** VPS upstream proxy phải set `X-Forwarded-Proto: https`. Express backend cần `app.set('trust proxy', 1)` để secure cookies work qua proxy.

## Files To Create

| File | Description |
|------|-------------|
| `backend/package.json` | express, better-sqlite3, jsonwebtoken, bcryptjs, helmet, cors |
| `backend/app.js` | Express entry point |
| `backend/db/schema.sql` | SQLite schema |
| `backend/db/database.js` | DB init + connection singleton |
| `backend/routes/auth-router.js` | Login + admin-verify |
| `backend/routes/companies-router.js` | CRUD + credentials endpoints |
| `backend/routes/users-router.js` | User management |
| `backend/routes/events-router.js` | Events CRUD |
| `backend/routes/settings-router.js` | Admin settings |
| `backend/middleware/auth-middleware.js` | JWT verify middleware |
| `backend/middleware/validate-middleware.js` | Input validation |
| `backend/utils/encryption-utils.js` | Server-side AES encrypt/decrypt |
| `backend/Dockerfile` | Node.js Docker image |
| `frontend/src/api/api-client.js` | Frontend API wrapper |
| `frontend/src/hooks/use-companies.js` | React hook cho companies |
| `frontend/src/hooks/use-events.js` | React hook cho events |
| `frontend/src/hooks/use-auth.js` | Auth state + JWT management |
| `frontend/nginx.conf` | MODIFY: thêm /api proxy |
| `docker-compose.yml` | MODIFY: thêm backend service |
| `.env.example` | JWT_SECRET, CREDENTIAL_ENCRYPTION_KEY |

## Migration Strategy

1. Backend khởi động → tạo DB nếu chưa có
2. **[RED TEAM F2] First-run migration endpoint: `POST /api/migrate`:**
   - Bảo vệ bằng one-time setup token (generated at server first start, printed to stdout ONLY)
   - Token truyền qua `Authorization: Bearer <setup-token>` header
   - Sau migration thành công: set `migration_complete=true` trong `admin_settings` và DISABLE endpoint
   - Nếu `migration_complete=true` → endpoint trả 410 Gone
3. **[RED TEAM F12] Migration phải include password migration:**
   - Existing users không có password → migration wizard prompt each user set new password
   - Admin account (sctsadmin) → set bcrypt hash trong DB, remove từ localStorage
4. Frontend detect fresh install qua `GET /api/settings/migration-status` → nếu `pending` → hiển thị migration wizard

## Todo

- [ ] Tạo `backend/` directory structure
- [ ] Viết schema.sql + database.js
- [ ] Viết app.js (Express setup, CORS, helmet, routes)
- [ ] Viết auth-router.js (login + admin-verify)
- [ ] Viết companies-router.js (CRUD + credentials gate)
- [ ] Viết users-router.js
- [ ] Viết events-router.js
- [ ] Viết settings-router.js
- [ ] Viết auth-middleware.js
- [ ] Viết encryption-utils.js (server-side)
- [ ] Viết backend Dockerfile
- [ ] Tạo api-client.js trong frontend
- [ ] Tạo use-auth.js, use-companies.js, use-events.js hooks
- [ ] Sửa App.jsx: thay localStorage bằng API hooks
- [ ] Sửa Settings.jsx: CRUD qua API
- [ ] Sửa nginx.conf: proxy /api
- [ ] Sửa docker-compose.yml
- [ ] Tạo .env.example
- [ ] Test end-to-end: login → xem calendar → tạo event

## Success Criteria

- Data persist sau khi clear localStorage và reload
- M365 credentials không xuất hiện trong browser (Network tab, localStorage)
- Admin login trả JWT token
- Docker compose up chạy cả frontend và backend
