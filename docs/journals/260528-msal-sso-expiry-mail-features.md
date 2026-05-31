# MSAL SSO + Expiry Alerts + Mail Configuration Features

**Date**: 2026-05-28 13:46
**Severity**: Medium
**Component**: Frontend (MSAL.js, Graph API integration)
**Status**: Resolved

## What Shipped

Three frontend-only features added to calendar app:

1. **Microsoft SSO (MSAL.js)** — @azure/msal-browser + @azure/msal-react installed. MsalProvider wraps App.jsx (conditional on msClientId). Login screen shows "Đăng nhập bằng Microsoft 365" button. Users declared by admin get popup auth; msAccessToken stored in sessionStorage. sctsadmin still password-protected.

2. **Expiry Alert System** — New expiryAlertEmails[] field per company. expiry-utils.js provides daysUntilExpiry() and expiryStatus(). Dashboard shows yellow banners (<30d) and red banners (<7d or expired). "Gửi cảnh báo" button sends emails via Graph Mail.Send scope (only when msAccessToken present).

3. **Mail Configuration Tab** — Settings now has "📧 Email" tab (4th tab). Fields: mailFromName, mailReplyTo, mailTestRecipient. Checklist verifies Azure ID configured, user logged in, Mail.Send scope granted. Test send button hits POST /me/sendMail via graph-client.js.

## Technical Reality

- **Bundle impact**: MSAL added ~240KB; final bundle 484KB, 0 compile errors.
- **Token scope**: sessionStorage only, not persisted to localStorage (prevents stale token reuse).
- **UI safeguard**: Buttons hidden when msClientId unconfigured—no broken "try this" UI.
- **No backend changes**: All features delegated auth using Graph API scopes.
- **Deployed**: http://100.107.189.14:4141

## Decision Log

MsalProvider instantiated conditionally on msClientId presence (KISS principle). Avoids null-ref errors when Azure config missing. Session-only token storage trades persistence for security; users re-authenticate after page refresh (acceptable for admin workflow).

## Known Gaps

- No error boundary for Graph API mail failures (silent retry on 401, user doesn't know if alert sent)
- No audit log for who sent expiry alerts when
- Email template hardcoded; no i18n for alert body

## Next

- Add error toast for failed mail.send calls
- Log expiry alert sends to audit table
- Template email text in Settings for customization
