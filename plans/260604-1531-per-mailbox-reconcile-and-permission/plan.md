# Per-Mailbox Reconcile + Mailbox Permission Enforcement

**Date:** 2026-06-04 | **Branch:** main | **Status:** Done (tested 10/10, reviewed)

## Post-review hardening applied
- H1: normalize mailbox → lowercase ở loop sync (tránh orphan vĩnh viễn do lệch hoa/thường).
- M2: dedup `upcomingNew` theo id (không gửi email trùng 1 cuộc họp trong 1 lần sync).
- C1: Graph trả id scoped theo mailbox → không đụng PK (id, company_id); ghi comment, không migrate.
- App.jsx: làm rõ comment — chỉ enforce ở UI, backend chưa có identity.

## Problem
1. Đổi email lấy lịch (tienntm02→tuanpv) nhưng vẫn thấy lịch cũ.
   - Root cause: GUARD chống "partial Graph response" (`calendar-sync.js:148`) key theo `company_id`. Mailbox mới ít event hơn → bị hiểu nhầm là Graph trả thiếu → bỏ qua replace → giữ lịch cũ. `deleteByCompany` cũng không reconcile theo mailbox.
2. Lỗ hổng phân quyền: `visibleEvents` (App.jsx:522) không enforce `allowedMailboxes`; user bị giới hạn mailbox vẫn xem được mailbox khác.

## Changes
### A. backend/services/calendar-sync.js — per-mailbox reconcile
- Helper `fetchMailboxEvents()` (modularize, file >200 LOC).
- Orphan cleanup: xóa event của mailbox không còn cấu hình.
- GUARD partial-response: per-company → per-mailbox.
- Delete+insert scoped theo `(company_id, mailbox)`.
- Notify chỉ cho mailbox đã có dữ liệu trước (tránh spam lần đầu sync mailbox mới).

### B. frontend/src/App.jsx — enforce mailbox permission
- `visibleEvents`: thêm check `currentUser.allowedMailboxes[companyId]` trước UI selection.

## Out of scope (YAGNI)
- Dashboard.jsx / DirectorView.jsx: dead code (không được import).
- Backend per-user mailbox enforcement: app không có session/identity ở API layer (security model hiện là client-side). Note ở unresolved.

## Success criteria
- Đổi mailbox → lịch cũ biến mất, lịch mới hiện.
- Multi-mailbox cùng công ty sync độc lập, không xóa nhầm nhau.
- User giới hạn mailbox chỉ thấy mailbox được phép.
- Không lỗi compile/lint.

## Unresolved
- Backend không enforce per-user mailbox (data vẫn về browser); cần JWT/session nếu muốn defense-in-depth thực sự.
