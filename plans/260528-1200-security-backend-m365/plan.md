---
title: Calendar App — Security, Backend & M365 Integration
status: in_progress
priority: high
created: 2026-05-28
blockedBy: []
blocks: []
---

# Calendar App — Security, Backend & M365 Integration

## Overview

Nâng cấp toàn diện Project_Calender từ pure-frontend app sang full-stack có backend thực, bảo mật M365 credentials, và kết nối Microsoft Graph API thật.

**Trigger:** Credentials lưu plain text localStorage, data mất khi clear storage, M365 sync chỉ là mock.

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 01 | [Bug Fixes](phase-01-bug-fixes.md) | todo | high | 1h |
| 02 | [Credential Security (AES + Re-auth)](phase-02-credential-security.md) | todo | critical | 4-6h |
| 03 | [Backend Node.js/Express + SQLite](phase-03-backend.md) | todo | high | 1-2d |
| 04 | [M365 Graph API Real Sync](phase-04-m365-graph.md) | todo | high | 1-2d |

## Architecture After This Plan

```
frontend (React/Vite :4141)
    └─> API calls ─> backend (Express :3001)
                          ├── SQLite (companies, users, events)
                          ├── M365 token store (encrypted)
                          └── Microsoft Graph API
```

## Key Decisions

- **AES-256-GCM** via Web Crypto API (no external library) cho client-side encryption fallback
- **Server-side credentials** là target cuối: backend giữ tenantId/clientId/clientSecret, không bao giờ gửi về client
- **SQLite** đủ dùng cho scale hiện tại (một tập đoàn, vài công ty)
- **M365 client_credentials flow** cho server-to-server, không cần user login M365

## Dependencies

- backend: Node.js 18+, Express, better-sqlite3, jsonwebtoken, bcryptjs, cors, helmet
- M365: @microsoft/microsoft-graph-client, @azure/identity, isomorphic-fetch, node-cron
- Docker: thêm service backend vào docker-compose.yml

## Validation Log

### Session 1 — 2026-05-28
**Trigger:** Post red-team validation before implementation
**Questions asked:** 6

#### Questions & Answers

1. **[Architecture]** Phase 02 vs 03 deploy strategy?
   - Options: Ship Phase 02 trước → migrate | Skip 02 deploy 03 thẳng | Deploy cùng lúc atomic
   - **Answer:** Ship Phase 02 trước, sau đó migrate lên backend
   - **Rationale:** Có bảo vệ tạm thời trong khi build backend 1-2 ngày

2. **[Assumptions]** Azure App Registration đã có sẵn chưa?
   - Options: Chưa có, cần hướng dẫn | Đã có 1 công ty | Phase 04 là future scope
   - **Answer:** Chưa có, cần hướng dẫn setup
   - **Rationale:** Phase 04 cần Azure setup guide; blocked cho đến khi admin hoàn thành Azure setup

3. **[Architecture]** Password migration strategy cho existing users?
   - Options: Force reset | Default temp password | Chỉ admin có password, user dùng SSO
   - **Answer:** Chỉ admin có password thực, user dùng SSO/M365 auth
   - **Rationale:** Thay đổi lớn: regular users xác thực qua Microsoft Identity, không phải password local

4. **[Scope]** M365 user auth scope?
   - Options: Chỉ verify email domain (MSAL) | Full delegated flow | Admin-assigned password
   - **Answer:** Chỉ verify email domain qua M365, không lấy calendar permissions
   - **Rationale:** MSAL sign-in để verify identity only; calendar data vẫn dùng service account (client_credentials)

5. **[Architecture]** SQLite đủ cho production?
   - Options: SQLite đủ | PostgreSQL ngay
   - **Answer:** SQLite đủ cho scale hiện tại
   - **Rationale:** Read-heavy, 1 instance, vài công ty — SQLite trong Docker volume là đủ

6. **[Architecture]** TLS termination?
   - Options: Upstream Nginx/reverse proxy | Nginx trong Docker
   - **Answer:** Upstream Nginx/reverse proxy trên VPS handle TLS
   - **Rationale:** Docker Nginx chỉ serve HTTP; cert management bên ngoài container

#### Confirmed Decisions
- Phase 02 ship trước → Phase 03 add migration từ encrypted localStorage → DB
- Regular users: MSAL email-domain verify, KHÔNG có password local trong DB
- Admin (sctsadmin): bcrypt password, `auth_provider = 'local'`
- Azure App Registration: cần hướng dẫn setup, Phase 04 blocked cho đến khi ready
- SQLite: giữ nguyên, không cần PostgreSQL
- TLS: upstream proxy, Docker Nginx HTTP only + `trust proxy` setting

#### Action Items
- [x] Propagated to phase-03: dual auth model (admin local + user MSAL)
- [x] Propagated to phase-03: `auth_provider` column in users table
- [x] Propagated to phase-03: TLS upstream note + nginx.conf update
- [x] Propagated to phase-04: Azure App Registration setup guide added
- [x] Propagated to phase-04: Phase 04 blocked until Azure ready

#### Impact on Phases
- Phase 03: Auth redesign — add `POST /api/auth/login-m365`, `jwks-rsa` dependency, `@azure/msal-browser` frontend
- Phase 04: Blocked by Azure setup, add setup guide to prerequisites

## Red Team Review

### Session — 2026-05-28
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 5 Critical, 7 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | Admin password hash enables AES key bypass | Critical | Accept | Phase 02 |
| F2 | POST /api/migrate unauthenticated seed endpoint | Critical | Accept | Phase 03 |
| F3 | GET /api/credentials sends raw secrets to client | Critical | Accept | Phase 03 |
| F4 | Password auth broken: length > 6 only | Critical | Accept | Phase 03 |
| F5 | Token cache lost on restart, no re-fetch fallback | Critical | Accept | Phase 04 |
| F6 | Docker port 3001 exposed to host, bypasses Nginx | High | Accept | Phase 03 |
| F7 | Token cache not invalidated on credential rotation | High | Accept | Phase 04 |
| F8 | GET /api/events no per-user authorization scoping | High | Accept | Phase 03 |
| F9 | Deleted M365 events never detected | High | Accept | Phase 04 |
| F10 | JWT no revocation path, 24h stolen token risk | High | Accept | Phase 03 |
| F11 | CREDENTIAL_ENCRYPTION_KEY no rotation strategy | High | Accept | Phase 03 |
| F12 | appUsers frontend constant vs DB: split-brain auth | High | Accept | Phase 03 |
| F13 | $top: 100 no pagination, silently loses events 101+ | High | Accept | Phase 04 |
| F14 | AES-256-CBC server-side, inconsistent with GCM client | Medium | Accept | Phase 03 |
| F15 | No default sync date range for cron execution | Medium | Accept | Phase 04 |
