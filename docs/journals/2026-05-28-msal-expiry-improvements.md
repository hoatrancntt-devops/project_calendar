# MSAL Silent Refresh & Configurable Expiry Alerts

**Date**: 2026-05-28 14:30
**Severity**: Medium
**Component**: Auth/Email, Admin Settings
**Status**: Resolved

## What Happened

Enhanced MSAL token handling and expiry alert system with silent refresh, configurable thresholds, and deduplication logic.

## The Brutal Truth

Before this, alerts were brittle: hardcoded thresholds (30/7 days), no token refresh before sending, and duplicate emails flooding inboxes on page reloads. Settings UI existed but wasn't wired to actual behavior.

## Technical Details

- **Silent refresh**: `silentRefreshToken()` in `msal-config.js` calls `acquireTokenSilent()` before each alert email send; updates `currentUser.msAccessToken`
- **Dynamic thresholds**: `EXPIRY_DEFAULTS` exported from `expiry-utils.js`; `expiryStatus()` now accepts optional `thresholds` param; values editable in Settings UI, persisted to `adminSettings`
- **Deduplication**: `alertsSent` state in localStorage (key: `YYYY-MM-DD` per company); prevents re-sends same day; UI shows "Đã gửi hôm nay" badge + "Gửi lại" button
- **Toast UI**: Replaced `window.alert()` with fixed bottom-right toast (green success, red error, 4s auto-dismiss)
- **Cleanup**: Deleted `use-graph-mail.js` hook; inlined as `sendGraphMail()` plain function in App.jsx

## What We Tried

Initial approach stored alertsSent in memory only — cleared on refresh, causing duplicates. Switched to localStorage persistence.

## Root Cause Analysis

Original design assumed single-session, single-user flow. Multi-tab scenario broke deduplication. localStorage key per company solves this.

## Lessons Learned

- localStorage is better than state for persistence across tabs
- Hardcoded business values (thresholds) must be editable; don't assume defaults fit all customers
- Plain async functions > custom hooks when logic is 10 lines; hooks add indirection without benefit

## Next Steps

- Monitor production MSAL failures during silent refresh (timeout, network, token revoked)
- A/B test alert frequency with customers (some may prefer weekly digest over daily checks)
- Add audit log for "alertsSent" changes per company for compliance

**Bundle**: 487.35 KB (clean Vite build)
