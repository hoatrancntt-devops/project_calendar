# VPS Deployment + Gemini UI Redesign Complete

**Date**: 2026-05-28 12:59
**Severity**: Low
**Component**: Deployment, UI/UX
**Status**: Resolved

## What Happened

Deployed calendar app to VPS (100.107.189.14:4141) and refactored 3 UI components to match Gemini mobile-first design spec.

## Technical Summary

**Deploy Script (deploy-vps.py)**
- Paramiko SFTP/SSH for Docker build + push
- Fixed Windows path handling (backslash → forward slash)
- Handled Unicode encoding in Docker build output
- Root sudo access for Docker socket
- App live and accessible

**UI Component Refactors**
- **Login.jsx**: Split-panel (blue branding left, form right), glass-card → Tailwind, i18n + auth logic preserved
- **Dashboard.jsx**: 12-col grid, hamburger mobile sidebar, sticky header, BookingModal now wired internally (was unlinked)
- **BookingModal.jsx**: Mobile slide-up panel, blue header, event type radio (Teams/Offline), M365 payload logic intact

Build output: 308KB, 0 errors. Commit `1077a452`.

## Key Decisions

- Kept CSS vars in index.css for dark theme toggle (Settings.jsx dependency)
- BookingModal state moved from prop drill to Dashboard parent
- Paramiko chosen over plink (host key non-interactive issue) and native ssh (stdin auth failed)

## Lessons

Paramiko handles sftp+ssh auth reliably on Windows → avoid shell-based SSH for deployment scripting. Path separators must be explicit in SFTP commands.
