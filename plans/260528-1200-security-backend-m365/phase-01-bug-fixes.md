---
phase: 01
title: Bug Fixes
status: todo
priority: high
effort: 1h
---

# Phase 01 — Bug Fixes

## Overview

Sửa 2 bug rõ ràng trước khi thêm tính năng mới. Không liên quan đến backend.

## Bug 1: isTodayDate() Hardcode

**File:** `frontend/src/components/Calendar.jsx:139`

```js
// HIỆN TẠI (sai)
const isTodayDate = (dateStr) => {
  return dateStr === '2026-05-28';
};

// SỬA THÀNH
const isTodayDate = (dateStr) => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return dateStr === `${y}-${m}-${d}`;
};
```

Tương tự fix `handleToday()` ở dòng 57:
```js
// HIỆN TẠI (sai)
const handleToday = () => {
  setCurrentDate(new Date('2026-05-28'));
};

// SỬA THÀNH
const handleToday = () => {
  setCurrentDate(new Date());
};
```

Và initial state ở dòng 17–18:
```js
// HIỆN TẠI (sai)
const [localCurrentDate, setLocalCurrentDate] = useState(new Date('2026-05-28'));
// trong Dashboard.jsx dòng 45:
const [currentDate, setCurrentDate] = useState(new Date('2026-05-28'));

// SỬA THÀNH: new Date() (không tham số)
```

## Bug 2: DirectorView Props Mismatch

**File:** `frontend/src/App.jsx:226–228` và `frontend/src/components/DirectorView.jsx:4–5`

`App.jsx` truyền `companies` và `events`, nhưng `DirectorView.jsx` destructure `settings`:

```js
// App.jsx — HIỆN TẠI (thiếu settings)
<DirectorView companies={companies} events={events} />

// DirectorView.jsx — HIỆN TẠI (nhận sai prop)
export default function DirectorView({ events, settings }) {
  const { companyName, companyLogo, syncMailboxes } = settings || {};
```

**Fix:** Truyền đúng props từ App.jsx:
```js
// App.jsx — SỬA: truyền adminSettings và companies
<DirectorView 
  companies={companies} 
  events={events}
  adminSettings={adminSettings}
/>

// DirectorView.jsx — SỬA: nhận đúng props
export default function DirectorView({ companies, events, adminSettings }) {
  // DirectorView hiển thị theo từng company, dùng state để chọn company
  const [selectedCompanyId, setSelectedCompanyId] = useState(companies?.[0]?.id);
  const currentCompany = companies?.find(c => c.id === selectedCompanyId);
  const gdEmail = currentCompany?.syncMailboxes?.[0] || 'tonggiamdoc@company.com';
  const companyName = adminSettings?.globalCompanyName || currentCompany?.companyName;
  const companyLogo = adminSettings?.globalCompanyLogo;
```

## Implementation Steps

1. Fix `Calendar.jsx`: `isTodayDate()`, `handleToday()`, `localCurrentDate` initial state
2. Fix `Dashboard.jsx`: `currentDate` initial state
3. Fix `App.jsx`: truyền `adminSettings` vào `DirectorView`
4. Fix `DirectorView.jsx`: destructure props đúng, thêm company selector

## Todo

- [ ] Fix isTodayDate() trong Calendar.jsx
- [ ] Fix handleToday() trong Calendar.jsx  
- [ ] Fix initial state new Date() trong Calendar.jsx và Dashboard.jsx
- [ ] Fix App.jsx — truyền adminSettings vào DirectorView
- [ ] Fix DirectorView.jsx — destructure props đúng + company selector

## Success Criteria

- "Hôm nay" luôn highlight đúng ngày thực tế
- DirectorView hiển thị đúng tên công ty và logo
- Không có console errors về undefined props
