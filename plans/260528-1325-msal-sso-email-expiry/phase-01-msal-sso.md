---
phase: 01
title: Microsoft SSO — MSAL.js Login
status: completed
priority: critical
effort: 4-6h
completedDate: 2026-05-28
---

# Phase 01 — Microsoft SSO (MSAL.js)

## Context Links
- Plan: `plan.md`
- Existing auth: `frontend/src/App.jsx` — `handleLogin()`, `loginAsCEO()`
- Users list: `adminSettings.appUsers` in localStorage

## Overview

Cho phép người dùng đã được admin khai báo trong Settings > Users đăng nhập bằng tài khoản Microsoft 365. Dùng MSAL.js (Auth Code + PKCE flow, popup mode). Không cần backend.

**Logic xác thực:**
1. User click "Đăng nhập bằng Microsoft 365"
2. MSAL popup → Microsoft login
3. Lấy email từ ID token
4. Kiểm tra email có trong `appUsers` list không
5. Nếu có → login thành công với role tương ứng
6. Nếu không → hiện "Tài khoản chưa được cấp quyền"

## Requirements

### Functional
- Nút "Đăng nhập bằng Microsoft 365" trên login screen (dưới divider "Hoặc")
- Admin khai báo user trong Settings → user dùng được SSO
- Role tự động từ email pattern (như cũ: tonggiamdoc → director, v.v.)
- sctsadmin vẫn dùng password local (không dùng SSO)
- Logout Microsoft khi user logout app

### Non-functional
- MSAL token cache: `sessionStorage` (tránh token leak giữa sessions)
- Không store access token vào `appEvents` hay custom localStorage key
- Error message rõ ràng: phân biệt "chưa cấp quyền" vs "Microsoft login thất bại"

## Prerequisites — Azure App Registration

Admin cần thực hiện **1 lần** trên Azure Portal:

```
1. portal.azure.com → Azure Active Directory → App registrations → New
2. Name: "Calendar App HLV"
3. Supported account types: Chọn theo domain (single-tenant nếu 1 org)
4. Authentication → Add platform → Single-page application (SPA)
   Redirect URI: http://100.107.189.14:4141
5. API Permissions → Add delegated:
   - Microsoft Graph → User.Read
   - Microsoft Graph → Mail.Send  (dùng cho Phase 03)
6. Grant admin consent
7. Overview → copy Application (client) ID và Directory (tenant) ID
8. Nhập 2 giá trị này vào Settings > Cấu hình Microsoft (Phase 03 UI)
   hoặc tạm thời hardcode trong msal-config.js
```

## Architecture

```
Login.jsx (hoặc App.jsx)
  └─ <MsalAuthButton>
       └─ useMsal() hook
            └─ instance.loginPopup({ scopes: ['User.Read', 'Mail.Send'] })
                 └─ returns: account.username (email)
                      └─ App.jsx: verify email in appUsers → setCurrentUser()
```

## Implementation Steps

### Step 1: Install dependencies
```bash
cd frontend
npm install @azure/msal-browser @azure/msal-react
```

### Step 2: Tạo `frontend/src/lib/msal-config.js`
```js
// Reads clientId/tenantId from adminSettings (localStorage) or env fallback
export function buildMsalConfig(adminSettings) {
  const clientId = adminSettings?.msClientId || import.meta.env.VITE_MS_CLIENT_ID || '';
  const tenantId = adminSettings?.msTenantId || import.meta.env.VITE_MS_TENANT_ID || 'common';

  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  };
}

export const LOGIN_SCOPES = ['User.Read', 'Mail.Send'];
```

### Step 3: Tạo `frontend/src/lib/graph-client.js`
```js
// Helper to call Microsoft Graph API with an access token
export async function graphFetch(accessToken, path, options = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`Graph API error: ${res.status}`);
  return res.json();
}
```

### Step 4: Cập nhật `App.jsx` — Wrap với MsalProvider

```jsx
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { buildMsalConfig } from './lib/msal-config';

// Trong App component:
const msalInstance = useMemo(
  () => new PublicClientApplication(buildMsalConfig(adminSettings)),
  [adminSettings?.msClientId, adminSettings?.msTenantId]
);

return (
  <MsalProvider instance={msalInstance}>
    {/* existing JSX */}
  </MsalProvider>
);
```

### Step 5: Tạo `frontend/src/components/MsalAuthButton.jsx`
```jsx
import { useMsal } from '@azure/msal-react';
import { LOGIN_SCOPES } from '../lib/msal-config';

export default function MsalAuthButton({ onSuccess, onError }) {
  const { instance } = useMsal();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await instance.loginPopup({ scopes: LOGIN_SCOPES });
      const email = result.account.username.toLowerCase();
      onSuccess({ email, account: result.account, accessToken: result.accessToken });
    } catch (err) {
      onError(err.message || 'Microsoft login thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleLogin} disabled={loading}
      className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium py-3 rounded-lg border border-slate-300 flex items-center justify-center gap-2 transition-colors">
      {/* Microsoft logo SVG */}
      <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
        <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
        <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
      </svg>
      {loading ? 'Đang xác thực...' : 'Đăng nhập bằng Microsoft 365'}
    </button>
  );
}
```

### Step 6: Cập nhật login handler trong `App.jsx`

```jsx
const handleMsalSuccess = ({ email, account, accessToken }) => {
  const found = appUsers.find(u => u.email.toLowerCase() === email);
  if (!found || !found.allowedCompanyIds?.length) {
    setLoginError(`Tài khoản ${email} chưa được cấp quyền. Liên hệ admin.`);
    return;
  }
  const role = email.includes('tonggiamdoc') || email.includes('giamdoc') ? 'director' : 'assistant';
  const name = account.name || email.split('@')[0];
  setCurrentUser({
    email, name, role,
    allowedCompanyIds: found.allowedCompanyIds,
    msAccessToken: accessToken,  // lưu để dùng Graph API
    authProvider: 'microsoft',
  });
};
```

### Step 7: Thêm vào login screen — sau form, thay "Hoặc" section

```jsx
{/* Sau form đăng nhập hiện tại */}
{adminSettings?.msClientId && (
  <>
    <div className="relative flex items-center py-4">
      <div className="flex-grow border-t border-slate-200"></div>
      <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">Hoặc</span>
      <div className="flex-grow border-t border-slate-200"></div>
    </div>
    <MsalAuthButton
      onSuccess={handleMsalSuccess}
      onError={setLoginError}
    />
  </>
)}
```

> **Note:** Nút Microsoft SSO chỉ hiện khi đã cấu hình `msClientId` trong Settings (tránh confusion khi chưa setup Azure).

### Step 8: Cập nhật Settings > Group tab

Thêm 2 fields mới vào `adminSettings`:
- `msClientId` — Azure App Client ID
- `msTenantId` — Azure Tenant ID (hoặc "common")

Trong `Settings.jsx` > Group tab, thêm section "Cấu hình Microsoft 365":
```jsx
<div>
  <label>Azure App Client ID</label>
  <input value={localGlobal.msClientId || ''} onChange={...} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
</div>
<div>
  <label>Azure Tenant ID</label>
  <input value={localGlobal.msTenantId || ''} onChange={...} placeholder="common hoặc tenant-id" />
</div>
```

### Step 9: Logout Microsoft khi logout app

```jsx
const handleLogout = async () => {
  if (currentUser?.authProvider === 'microsoft') {
    try { await msalInstance.logoutPopup(); } catch {}
  }
  setCurrentUser(null);
  setShowSettings(false);
};
```

## Related Code Files

| File | Action |
|------|--------|
| `frontend/src/App.jsx` | Modify: MsalProvider wrap, handleMsalSuccess, logout |
| `frontend/src/lib/msal-config.js` | Create |
| `frontend/src/lib/graph-client.js` | Create |
| `frontend/src/components/MsalAuthButton.jsx` | Create |
| `frontend/src/components/Settings.jsx` | Modify: add msClientId/msTenantId fields |
| `frontend/package.json` | Modify: add @azure/msal-browser, @azure/msal-react |

## Todo

- [ ] `npm install @azure/msal-browser @azure/msal-react`
- [ ] Tạo `frontend/src/lib/msal-config.js`
- [ ] Tạo `frontend/src/lib/graph-client.js`
- [ ] Tạo `frontend/src/components/MsalAuthButton.jsx`
- [ ] Wrap App với MsalProvider (useMemo instance)
- [ ] Thêm handleMsalSuccess vào App.jsx
- [ ] Thêm MsalAuthButton vào login screen (conditional on msClientId)
- [ ] Thêm msClientId + msTenantId fields vào Settings.jsx Group tab
- [ ] Cập nhật handleLogout để logoutPopup Microsoft
- [ ] Build + test locally
- [ ] Deploy lên VPS

## Success Criteria

- [ ] Nút "Đăng nhập bằng Microsoft 365" hiện khi đã cấu hình clientId
- [ ] User có trong appUsers list: login thành công, role đúng
- [ ] User không trong appUsers: thấy lỗi rõ ràng
- [ ] sctsadmin vẫn đăng nhập password bình thường
- [ ] Logout clear cả MSAL session

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Azure App chưa được setup | Blocker | Hướng dẫn rõ ràng, nút SSO ẩn khi chưa có clientId |
| Popup bị block bởi browser | Medium | Thêm redirect fallback hoặc hướng dẫn bật popup |
| MSAL instance rebuild khi save Settings | Low | useMemo deps: [msClientId, msTenantId] |
| Token expire trong session | Low | MSAL tự refresh với acquireTokenSilent |

## Security Considerations

- Không log access token vào console
- `cacheLocation: 'sessionStorage'` — token mất khi đóng tab
- Redirect URI phải đúng khớp với Azure App Registration
- Không gửi access token về backend (chưa có backend)
