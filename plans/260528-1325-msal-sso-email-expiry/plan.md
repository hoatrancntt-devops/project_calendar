---
title: Calendar App — MSAL SSO + Email Config + API Expiry Alerts
status: completed
priority: high
created: 2026-05-28
completedDate: 2026-05-28
blockedBy: []
blocks: []
---

# Calendar App — MSAL SSO + Email Config + API Expiry Alerts

## Overview

Bổ sung 3 tính năng vào Project_Calender:

1. **Microsoft SSO** — người dùng đã được admin khai báo đăng nhập bằng tài khoản Microsoft 365 (MSAL.js, delegated, frontend-only)
2. **Cấu hình Mail gửi đi** — admin cấu hình from-address + test gửi mail qua Microsoft Graph API
3. **Cảnh báo hết hạn API** — cảnh báo trực quan + nhiều người nhận riêng cho từng công ty + gửi email thông báo

**Kiến trúc:** Frontend-only (MSAL delegated flow). Không cần backend cho Phase 01-02. Phase 03 email gửi dùng `Mail.Send` delegated scope sau khi admin login Microsoft.

> **Dependency với plan cũ:** Phase 03 backend (`260528-1200-security-backend-m365`) sẽ enable app-permissions flow (gửi từ shared mailbox không cần admin login). Nhưng 3 tính năng này **có thể triển khai ngay** với delegated flow.

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 01 | [Microsoft SSO — MSAL.js Login](phase-01-msal-sso.md) | completed | critical | 4-6h |
| 02 | [API Expiry Alerts + Notification Recipients](phase-02-expiry-alerts.md) | completed | high | 2-3h |
| 03 | [Microsoft Mail Configuration](phase-03-mail-config.md) | completed | high | 3-4h |

## Kiến trúc Tổng quan

```
Browser (MSAL.js)
    │
    ├─ loginPopup() ──────────> Microsoft Identity Platform
    │    returns ID token              (login.microsoftonline.com)
    │    + access token
    │
    ├─ Verify: email in appUsers ──> localStorage
    │
    └─ acquireToken(Mail.Send) ──> Graph API
         POST /v1.0/me/sendMail         (graph.microsoft.com)
```

## Azure App Registration (Cần setup 1 lần)

Admin cần thực hiện trên Azure Portal:
1. Tạo App Registration (Single-tenant hoặc Multi-tenant)
2. Authentication → Add platform: SPA → Redirect URI: `http://100.107.189.14:4141`
3. API Permissions → Delegated:
   - `User.Read` (sign-in)
   - `Mail.Send` (gửi mail thay mặt user)
   - `Calendars.Read` (tùy chọn, cho phase sau)
4. Copy **Client ID** và **Tenant ID** vào Settings

## Dependencies

```
npm install @azure/msal-browser @azure/msal-react
```

Không cần backend mới. Dùng Microsoft Graph API trực tiếp từ browser.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth flow | Auth Code + PKCE (popup) | Browser-safe, không expose secret |
| Email sending | Delegated `Mail.Send` | Frontend-only, dùng account admin đã login |
| Shared mailbox | Phase sau (cần backend) | Cần client_credentials — không browser-safe |
| Expiry alert timing | Kiểm tra khi load Dashboard | Simple, không cần cron job |
| Recipient management | Per-company list | Đã có `notifyEmails`, mở rộng thêm `expiryAlertEmails` |

## File Changes

```
frontend/src/
├── App.jsx                         # Add MSAL provider + SSO login button
├── components/
│   ├── Settings.jsx                # Phase 02: expiryAlertEmails UI
│   │                               # Phase 03: mail config tab
│   └── MsalAuthButton.jsx          # NEW: Microsoft login button component
├── lib/
│   ├── msal-config.js              # NEW: MSAL PublicClientApplication config
│   └── graph-client.js             # NEW: Microsoft Graph API helper
└── hooks/
    └── use-graph-mail.js           # NEW: sendMail hook via Graph API
```

## Completion Notes

**Completed:** 2026-05-28

**Build Status:** Clean build, 484KB bundle (MSAL adds ~240KB overhead)

**Artifacts Created:**
- `src/lib/msal-config.js` — MSAL PublicClientApplication configuration
- `src/lib/graph-client.js` — Microsoft Graph API helper (acquireToken, sendMail)
- `src/lib/expiry-utils.js` — Expiry alert logic (banner timing, email payload)
- `src/hooks/use-graph-mail.js` — React hook for email sending via Graph

**Files Modified:**
- `App.jsx` — Added MSAL provider + MsalAuthButton integration
- `Settings.jsx` — Added expiryAlertEmails UI + mail config tab + send test email button

**Deployment:**
- Live at http://100.107.189.14:4141
- All 3 phases functional: MSAL login → expiry alerts → email notifications
- Token cache: sessionStorage (no persistence between sessions)

**Notes:**
- Phase 01 (MSAL SSO): User login via Microsoft popup, email validation against appUsers
- Phase 02 (Expiry Alerts): Banner on Dashboard (< 30d warning, < 7d critical), per-company recipient list
- Phase 03 (Mail Config): Admin configures from-address, sends test email via Graph API delegated scope
- Future: Backend phase (`260528-1200-security-backend-m365`) will add app-permissions flow for shared mailbox support

## Improvements (2026-05-28)

**Enhancements to completed work:**
- `msal-config.js` — Added `silentRefreshToken()` helper for seamless token refresh
- `expiry-utils.js` — Exported `EXPIRY_DEFAULTS`, made `expiryStatus()` configurable with optional thresholds
- `App.jsx` — Upgraded alerts: added `expiryWarningDays`/`expiryCriticalDays` admin settings, toast notifications (replacing `window.alert`), silent token refresh before email send, localStorage tracking for "Đã gửi hôm nay" badge
- `Settings.jsx` — Added "Ngưỡng Cảnh Báo Hết Hạn API" configuration card for admin threshold customization
- `use-graph-mail.js` — Removed (code moved inline to App.jsx, eliminated hook dependency)
- Bundle: 487.35 kB, clean build
