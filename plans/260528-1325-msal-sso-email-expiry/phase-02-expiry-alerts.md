---
phase: 02
title: API Expiry Alerts + Notification Recipients
status: completed
priority: high
effort: 2-3h
completedDate: 2026-05-28
blockedBy: [phase-01-msal-sso]
---

# Phase 02 — API Expiry Alerts + Notification Recipients

## Context Links
- Plan: `plan.md`
- Settings component: `frontend/src/components/Settings.jsx`
- Company data model: `App.jsx` → `DEFAULT_COMPANIES` → `notifyEmails`, `apiExpirationDate`
- Phase 01: `phase-01-msal-sso.md` (cần MSAL access token để gửi email)

## Overview

Nâng cấp tính năng cảnh báo hết hạn MS 365 API:

1. **UI**: Thêm danh sách "Người nhận cảnh báo hết hạn" riêng biệt với nút `+` per-company (field: `expiryAlertEmails[]`)
2. **Dashboard**: Banner/badge cảnh báo khi API sắp hết hạn (< 30 ngày = warning, < 7 ngày = critical)
3. **Email**: Nút "Gửi cảnh báo ngay" — dùng Microsoft Graph API `Mail.Send` (cần user đã login MSAL)

## Data Model Changes

Thêm field `expiryAlertEmails` vào company object:

```js
// Trước (đã có):
{ notifyEmails: ['a@b.com'] }       // nhận thông báo lịch họp mới

// Sau (thêm mới):
{ 
  notifyEmails: ['a@b.com'],         // thông báo lịch họp mới (giữ nguyên)
  expiryAlertEmails: ['it@hlv.vn'], // cảnh báo hết hạn API 365 (MỚI)
}
```

Migration: khi load từ localStorage, nếu `expiryAlertEmails` undefined → khởi tạo `[]`.

## Expiry Logic

```js
// Tính số ngày còn lại
function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Phân loại
function expiryStatus(days) {
  if (days === null) return 'unknown';
  if (days < 0)  return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}
```

## Implementation Steps

### Step 1: Migration trong `App.jsx` DEFAULT_COMPANIES

```js
// Trong load('appCompanies', DEFAULT_COMPANIES)
// Sau khi load, migrate:
const migrated = loaded.map(c => ({
  ...c,
  expiryAlertEmails: c.expiryAlertEmails ?? [],
}));
```

### Step 2: Expiry Banner trong Dashboard (App.jsx)

Thêm sau header, trước main content:

```jsx
{/* API Expiry Warnings */}
{!showSettings && companies
  .filter(c => allowedCompanyIds.includes(c.id))
  .map(c => {
    const days = daysUntilExpiry(c.apiExpirationDate);
    const status = expiryStatus(days);
    if (status === 'ok' || status === 'unknown') return null;
    return (
      <div key={c.id} className={`mx-4 sm:mx-6 mt-3 px-4 py-3 rounded-lg flex items-center justify-between gap-3 text-sm
        ${status === 'expired'  ? 'bg-red-50 border border-red-200 text-red-800' :
          status === 'critical' ? 'bg-orange-50 border border-orange-200 text-orange-800' :
                                  'bg-yellow-50 border border-yellow-200 text-yellow-800'}
      `}>
        <span className="font-medium">
          ⚠️ {c.companyName}: API Microsoft 365
          {status === 'expired'
            ? ' đã hết hạn!'
            : ` sắp hết hạn trong ${days} ngày (${c.apiExpirationDate})`}
        </span>
        {currentUser?.msAccessToken && c.expiryAlertEmails?.length > 0 && (
          <button
            onClick={() => sendExpiryAlert(c)}
            className="flex-shrink-0 px-3 py-1 bg-white border border-current rounded-md hover:bg-opacity-80 transition-colors text-xs font-semibold"
          >
            Gửi cảnh báo
          </button>
        )}
      </div>
    );
  })
}
```

### Step 3: Hook `use-graph-mail.js` — sendMail via Graph API

```js
// frontend/src/hooks/use-graph-mail.js
import { graphFetch } from '../lib/graph-client';

export function useGraphMail(accessToken) {
  const sendMail = async ({ to, subject, body }) => {
    if (!accessToken) throw new Error('Chưa đăng nhập Microsoft');
    const message = {
      subject,
      body: { contentType: 'HTML', content: body },
      toRecipients: to.map(email => ({
        emailAddress: { address: email }
      })),
    };
    await graphFetch(accessToken, '/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
  };
  return { sendMail };
}
```

### Step 4: `sendExpiryAlert` function trong App.jsx

```js
const { sendMail } = useGraphMail(currentUser?.msAccessToken);

const sendExpiryAlert = async (company) => {
  const days = daysUntilExpiry(company.apiExpirationDate);
  try {
    await sendMail({
      to: company.expiryAlertEmails,
      subject: `[CẢNH BÁO] API Microsoft 365 ${company.companyName} hết hạn trong ${days} ngày`,
      body: `
        <h2>Cảnh báo hết hạn API Microsoft 365</h2>
        <p>Công ty: <strong>${company.companyName}</strong></p>
        <p>Ngày hết hạn: <strong>${company.apiExpirationDate}</strong></p>
        <p>Còn lại: <strong>${days} ngày</strong></p>
        <p>Vui lòng gia hạn hoặc cấp mới API credentials trước ngày hết hạn.</p>
      `,
    });
    alert('Đã gửi email cảnh báo thành công!');
  } catch (err) {
    alert(`Gửi email thất bại: ${err.message}`);
  }
};
```

### Step 5: UI trong Settings.jsx — Company tab

Thêm section "Cảnh báo hết hạn API" ngay sau section `apiExpirationDate`:

```jsx
{/* Expiry Alert Emails */}
<div style={{ marginTop: '20px' }}>
  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
    🔔 Người nhận cảnh báo hết hạn API
    {/* Badge hiển thị trạng thái hết hạn */}
    {activeCompany.apiExpirationDate && (() => {
      const days = daysUntilExpiry(activeCompany.apiExpirationDate);
      const status = expiryStatus(days);
      if (status === 'ok') return null;
      return (
        <span className={`badge ${status === 'expired' || status === 'critical' ? 'badge-danger' : 'badge-warning'}`}>
          {status === 'expired' ? 'Đã hết hạn' : `Còn ${days} ngày`}
        </span>
      );
    })()}
  </label>

  {/* Add recipient form */}
  <form onSubmit={handleAddExpiryEmail} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
    <input
      name="expiryEmail"
      type="email"
      className="form-control"
      placeholder="email@company.vn"
      style={{ flex: 1 }}
    />
    <button type="submit" className="btn btn-secondary">
      <Plus size={14} /> Thêm
    </button>
  </form>

  {/* Recipients list */}
  <div className="tag-list">
    {(activeCompany.expiryAlertEmails || []).map(email => (
      <div key={email} className="tag-item">
        <span>{email}</span>
        <X size={12} className="tag-remove" onClick={() => handleRemoveExpiryEmail(email)} />
      </div>
    ))}
    {!(activeCompany.expiryAlertEmails?.length) && (
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Chưa có người nhận. Thêm email để nhận cảnh báo.
      </span>
    )}
  </div>
</div>
```

### Step 6: Handlers trong Settings.jsx

```js
const handleAddExpiryEmail = (e) => {
  e.preventDefault();
  const email = e.target.elements.expiryEmail.value.trim().toLowerCase();
  if (!email) return;
  const current = activeCompany.expiryAlertEmails || [];
  if (current.includes(email)) return;
  handleUpdateCompanyField('expiryAlertEmails', [...current, email]);
  e.target.reset();
};

const handleRemoveExpiryEmail = (email) => {
  const current = activeCompany.expiryAlertEmails || [];
  handleUpdateCompanyField('expiryAlertEmails', current.filter(e => e !== email));
};
```

### Step 7: Tiện ích `daysUntilExpiry` + `expiryStatus` — tạo `frontend/src/lib/expiry-utils.js`

```js
export function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

export function expiryStatus(days) {
  if (days === null) return 'unknown';
  if (days < 0)   return 'expired';
  if (days <= 7)  return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}
```

## Related Code Files

| File | Action |
|------|--------|
| `frontend/src/App.jsx` | Modify: expiry banner, sendExpiryAlert, data migration |
| `frontend/src/components/Settings.jsx` | Modify: expiryAlertEmails UI section |
| `frontend/src/hooks/use-graph-mail.js` | Create |
| `frontend/src/lib/expiry-utils.js` | Create |

## Todo

- [ ] Tạo `frontend/src/lib/expiry-utils.js` (daysUntilExpiry, expiryStatus)
- [ ] Migrate company data: thêm `expiryAlertEmails: []` nếu thiếu
- [ ] Thêm expiry banner vào App.jsx (sau header)
- [ ] Tạo `frontend/src/hooks/use-graph-mail.js`
- [ ] Thêm `sendExpiryAlert` vào App.jsx
- [ ] Thêm UI expiryAlertEmails vào Settings.jsx > Company tab
- [ ] Thêm handlers handleAddExpiryEmail + handleRemoveExpiryEmail
- [ ] Build + deploy

## Success Criteria

- [ ] Settings: mỗi công ty có section riêng "Người nhận cảnh báo hết hạn" với nút +
- [ ] Dashboard: banner cảnh báo màu vàng/đỏ khi API < 30/7 ngày
- [ ] Nút "Gửi cảnh báo" chỉ hiện khi đã login Microsoft (có access token)
- [ ] Email gửi được qua Graph API với template đầy đủ thông tin
