# PWA Shortcut Icon from Uploaded Logo

**Date:** 2026-06-04 | **Branch:** main | **Status:** Done (tested 13/13, build OK)

## Goal
Khi user "Add to Home Screen"/Install → icon = logo global admin đã upload; app name = "Lịch Họp - HLV"; start_url = /.

## Decisions
- 1 icon chung, nguồn = `adminSettings.globalCompanyLogo`.
- Rasterize ở frontend (canvas) → PNG 192/512/180, nền trắng, padding 12% (maskable-safe).
- Serve manifest+icon dưới `/api` (nginx tự proxy + inject key, KHÔNG đổi nginx).
- Icon route KHÔNG đuôi `.png` (tránh nginx static regex nuốt request).
- name "Lịch Họp - HLV", short_name "Lịch Họp", display standalone, theme #0f766e.

## Files
- `frontend/src/lib/app-icon.js` (mới) — rasterizeSquarePng / generateAppIcons.
- `frontend/src/components/Settings.jsx` — generate icon khi upload logo + clear khi xóa.
- `backend/routes/icon-routes.js` (mới) — /api/manifest.webmanifest, /api/app-icon-192, /api/app-icon-512, /api/apple-touch-icon.
- `backend/app.js` — mount icon-routes.
- `frontend/index.html` — link manifest + apple-touch-icon + meta theme/title.

## Verify
- 13/13 test route (manifest fields, content-type, icon PNG magic bytes, 404 khi thiếu, manifest icons rỗng).
- frontend build OK.

## Note vận hành
- Logo ĐÃ upload trước đây chưa có appIcon → admin **upload lại logo 1 lần** sau deploy để sinh icon. (KISS, không auto-migrate on load.)
- iOS cache apple-touch-icon lúc add → đổi logo sau không cập nhật shortcut đã thêm.

## Unresolved
- Chưa có default icon khi chưa upload logo → manifest icons rỗng, shortcut dùng icon mặc định OS tới khi admin upload.
