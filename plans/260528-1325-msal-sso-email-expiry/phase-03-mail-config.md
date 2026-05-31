---
phase: 03
title: Microsoft Mail Configuration
status: completed
priority: high
effort: 3-4h
completedDate: 2026-05-28
blockedBy: [phase-01-msal-sso]
---

# Phase 03 — Microsoft Mail Configuration (Cấu hình Mail Gửi Đi)

## Context Links
- Plan: `plan.md`
- Settings: `frontend/src/components/Settings.jsx`
- Graph client: `frontend/src/lib/graph-client.js` (tạo ở Phase 01)
- Graph mail hook: `frontend/src/hooks/use-graph-mail.js` (tạo ở Phase 02)

## Overview

Thêm tab/section "Cấu hình Email" trong Settings cho phép admin:
1. Cấu hình thông tin người gửi (from name, reply-to)
2. Test kết nối bằng cách gửi email thử
3. Xem lịch sử gửi đơn giản (in-memory, không persist)

**Cơ chế gửi email:** Microsoft Graph API `POST /me/sendMail` với delegated access token từ MSAL (admin đã login Microsoft 365). Email được gửi TỪ tài khoản Microsoft của admin đang đăng nhập.

> **Lưu ý:** Gửi từ shared mailbox/service account cần app permissions (client_credentials) → yêu cầu backend từ plan `260528-1200-security-backend-m365`. Phase này chỉ implement delegated flow.

## Data Model

Thêm vào `adminSettings`:

```js
{
  // Existing fields...
  adminPassword: '...',
  globalCompanyName: '...',
  msClientId: '...',      // từ Phase 01
  msTenantId: '...',      // từ Phase 01

  // NEW — Mail config
  mailFromName: 'Hệ thống Lịch Trình',   // Display name người gửi
  mailReplyTo: '',                          // Reply-to address (tùy chọn)
  mailTestRecipient: '',                    // Email nhận test
}
```

## UI — Tab "Email" trong Settings

### Vị trí

Settings.jsx hiện có 3 tabs: `group | companies | users`
Thêm tab thứ 4: `email`

```jsx
const TABS = ['group', 'companies', 'users', 'email'];
const TAB_LABELS = {
  group: 'Nhóm',
  companies: 'Công ty',
  users: 'Người dùng',
  email: '📧 Email',
};
```

### Tab Email Content

```
┌─────────────────────────────────────────────────────┐
│ 📧 Cấu hình Email Gửi Đi                            │
│                                                       │
│ ℹ️  Sử dụng tài khoản Microsoft 365 của admin       │
│     đang đăng nhập để gửi email.                     │
│                                                       │
│ Tên hiển thị người gửi                               │
│ [Hệ thống Lịch Trình HLV                          ]  │
│                                                       │
│ Reply-To (tùy chọn)                                  │
│ [admin@company.vn                                  ]  │
│                                                       │
│ ── Test Kết Nối ──────────────────────────────────── │
│                                                       │
│ Email nhận test                                       │
│ [it@hoanlocviet.vn                                 ]  │
│                                                       │
│ [🔌 Gửi Email Test]   Status: ✅ Gửi thành công    │
│                                                       │
│ ── Yêu cầu ────────────────────────────────────────  │
│ ✅ Azure App Client ID: đã cấu hình                  │
│ ✅ Đã đăng nhập Microsoft 365                        │
│ ✅ Scope Mail.Send: đã cấp quyền                    │
└─────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Thêm tab "email" vào Settings.jsx

```jsx
// Trong tab header:
{['group', 'companies', 'users', 'email'].map(tab => (
  <button
    key={tab}
    onClick={() => setActiveTab(tab)}
    className={activeTab === tab ? 'active-tab' : 'inactive-tab'}
  >
    {tab === 'email' ? '📧 Email' : t(`tab_${tab}`) || tab}
  </button>
))}
```

### Step 2: Tab Email content trong Settings.jsx

```jsx
{activeTab === 'email' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
    <div className="glass-card" style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>
        📧 Cấu hình Email Gửi Đi
      </h3>

      {/* Info banner */}
      <div className="badge badge-secondary" style={{ width: '100%', padding: '10px', borderRadius: '8px', marginBottom: '20px', justifyContent: 'flex-start' }}>
        Email được gửi từ tài khoản Microsoft 365 của admin đang đăng nhập.
        Yêu cầu: đã cấu hình Azure App ID và đăng nhập Microsoft.
      </div>

      {/* Requirement checklist */}
      <MailRequirements adminSettings={localGlobal} currentUser={currentUser} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>

        {/* From Name */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Tên hiển thị người gửi</label>
          <input
            type="text"
            className="form-control"
            value={localGlobal.mailFromName || ''}
            onChange={e => setLocalGlobal({ ...localGlobal, mailFromName: e.target.value })}
            placeholder="VD: Hệ thống Lịch Trình HLV"
          />
        </div>

        {/* Reply-To */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Reply-To (tùy chọn)</label>
          <input
            type="email"
            className="form-control"
            value={localGlobal.mailReplyTo || ''}
            onChange={e => setLocalGlobal({ ...localGlobal, mailReplyTo: e.target.value })}
            placeholder="admin@company.vn"
          />
        </div>
      </div>
    </div>

    {/* Test Connection */}
    <div className="glass-card" style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>
        🔌 Test Kết Nối
      </h3>

      <div className="form-group" style={{ marginBottom: '12px' }}>
        <label className="form-label">Email nhận test</label>
        <input
          type="email"
          className="form-control"
          value={localGlobal.mailTestRecipient || ''}
          onChange={e => setLocalGlobal({ ...localGlobal, mailTestRecipient: e.target.value })}
          placeholder="it@hoanlocviet.vn"
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          className="btn btn-primary"
          onClick={handleTestMail}
          disabled={testMailStatus === 'sending' || !currentUser?.msAccessToken}
        >
          {testMailStatus === 'sending' ? '⏳ Đang gửi...' : '📤 Gửi Email Test'}
        </button>

        {testMailStatus === 'success' && (
          <span className="badge badge-success">✅ Gửi thành công</span>
        )}
        {testMailStatus === 'error' && (
          <span className="badge badge-danger">❌ {testMailError}</span>
        )}
      </div>
    </div>
  </div>
)}
```

### Step 3: Component `MailRequirements` — Checklist điều kiện

```jsx
function MailRequirements({ adminSettings, currentUser }) {
  const checks = [
    {
      label: 'Azure App Client ID đã cấu hình',
      ok: !!adminSettings?.msClientId,
    },
    {
      label: 'Đã đăng nhập Microsoft 365',
      ok: currentUser?.authProvider === 'microsoft',
    },
    {
      label: 'Quyền Mail.Send đã cấp',
      ok: currentUser?.authProvider === 'microsoft', // nếu login qua MSAL với Mail.Send scope
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {checks.map(({ label, ok }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <span style={{ color: ok ? '#137333' : '#c5221f' }}>{ok ? '✅' : '❌'}</span>
          <span style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
```

### Step 4: Handler `handleTestMail` trong Settings.jsx

Settings.jsx cần nhận `currentUser` như một prop mới từ App.jsx:

```jsx
// Settings.jsx props thêm:
export default function Settings({ ..., currentUser }) { ... }

// App.jsx: truyền currentUser vào Settings
<SettingsComponent
  ...
  currentUser={currentUser}   // thêm prop này
/>

// Handler trong Settings.jsx:
const [testMailStatus, setTestMailStatus] = useState(null); // null | 'sending' | 'success' | 'error'
const [testMailError, setTestMailError] = useState('');

const handleTestMail = async () => {
  const to = localGlobal.mailTestRecipient;
  if (!to) { alert('Vui lòng nhập email nhận test.'); return; }
  if (!currentUser?.msAccessToken) {
    alert('Cần đăng nhập bằng Microsoft 365 để gửi email.');
    return;
  }

  setTestMailStatus('sending');
  try {
    const message = {
      subject: '[TEST] Email từ Hệ thống Lịch Trình',
      body: {
        contentType: 'HTML',
        content: `
          <h2>✅ Test email thành công!</h2>
          <p>Cấu hình email hoạt động bình thường.</p>
          <p>Hệ thống: <strong>${localGlobal.globalCompanyName}</strong></p>
          <p>Thời gian: ${new Date().toLocaleString('vi-VN')}</p>
        `,
      },
      toRecipients: [{ emailAddress: { address: to } }],
    };

    if (localGlobal.mailReplyTo) {
      message.replyTo = [{ emailAddress: { address: localGlobal.mailReplyTo } }];
    }

    await graphFetch(currentUser.msAccessToken, '/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    setTestMailStatus('success');
    setTimeout(() => setTestMailStatus(null), 5000);
  } catch (err) {
    setTestMailStatus('error');
    setTestMailError(err.message);
  }
};
```

### Step 5: Import `graphFetch` vào Settings.jsx

```js
import { graphFetch } from '../lib/graph-client';
```

### Step 6: Truyền `currentUser` từ App.jsx vào Settings

```jsx
// App.jsx — trong phần render Settings
<SettingsComponent
  companies={companies}
  onSaveCompanies={setCompanies}
  adminSettings={adminSettings}
  onSaveAdminSettings={setAdminSettings}
  appUsers={appUsers}
  onSaveAppUsers={setAppUsers}
  currentUser={currentUser}    // ← THÊM
  t={t}
/>
```

## Related Code Files

| File | Action |
|------|--------|
| `frontend/src/components/Settings.jsx` | Modify: add email tab, MailRequirements, handleTestMail |
| `frontend/src/App.jsx` | Modify: pass currentUser prop to Settings, add mailFromName/mailReplyTo/mailTestRecipient to DEFAULT_ADMIN_SETTINGS |
| `frontend/src/lib/graph-client.js` | Use (created in Phase 01) |

## Todo

- [ ] Thêm `mailFromName`, `mailReplyTo`, `mailTestRecipient` vào `DEFAULT_ADMIN_SETTINGS` trong App.jsx
- [ ] Thêm tab `email` vào tab navigation của Settings.jsx
- [ ] Viết tab Email content với form fields
- [ ] Tạo component `MailRequirements` (checklist điều kiện)
- [ ] Thêm `testMailStatus` state vào Settings.jsx
- [ ] Viết `handleTestMail` function
- [ ] Import `graphFetch` vào Settings.jsx
- [ ] Truyền `currentUser` prop từ App.jsx vào SettingsComponent
- [ ] Build + deploy

## Success Criteria

- [ ] Tab "📧 Email" hiển thị trong Settings
- [ ] Checklist hiển thị đúng trạng thái (Azure ID, login Microsoft, quyền)
- [ ] Test email gửi thành công khi đủ điều kiện
- [ ] Thông báo lỗi rõ ràng khi thiếu điều kiện
- [ ] mailFromName và mailReplyTo được lưu vào adminSettings

## Security Considerations

- Access token chỉ dùng trong memory (`currentUser.msAccessToken`) — không lưu persist
- `saveToSentItems: true` — email lưu trong Sent của admin's mailbox (audit trail)
- Không log nội dung email vào console
- Validate email format trước khi gửi

## Future Enhancement (backend plan)

Khi backend `260528-1200-security-backend-m365` Phase 03 hoàn thành:
- Thêm option "Gửi từ shared mailbox" với client_credentials flow
- Backend handle token, frontend chỉ gọi `POST /api/mail/send`
- Lịch sử gửi email lưu vào SQLite
