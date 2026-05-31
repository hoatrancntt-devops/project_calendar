---
phase: 02
title: Credential Security — AES Encrypt + Re-auth
status: todo
priority: critical
effort: 4-6h
---

# Phase 02 — Credential Security

## Overview

M365 credentials (tenantId, clientId, clientSecret) hiện lưu plain text trong localStorage — bất kỳ JS nào trên page đều đọc được. Fix bằng 2 lớp:

1. **Re-auth modal**: Admin phải nhập lại mật khẩu trước khi xem/sửa credentials
2. **AES-256-GCM encryption**: Encrypt credentials bằng derived key từ admin password trước khi lưu localStorage

## Architecture

```
Admin muốn xem credentials
    └─> Re-auth Modal (nhập admin password)
           └─> Verify password OK
                  └─> Derive AES key (PBKDF2 từ password + salt)
                         └─> Decrypt credentials in memory
                                └─> Hiển thị trong form (masked)
                                       └─> Khi Save: re-encrypt + lưu localStorage
```

## Implementation Details

### 1. Crypto Utilities (`frontend/src/utils/crypto-utils.js`)

Dùng **Web Crypto API** (built-in browser, không cần thư viện):

```js
// Derive AES-256-GCM key từ password
export async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt string
export async function encryptString(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
  );
  // Pack: salt(16) + iv(12) + ciphertext → base64
  const combined = new Uint8Array(16 + 12 + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, 16);
  combined.set(new Uint8Array(ciphertext), 28);
  return btoa(String.fromCharCode(...combined));
}

// Decrypt string — throws nếu password sai
export async function decryptString(base64, password) {
  const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);
  const key = await deriveKey(password, salt);
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return dec.decode(plaintext);
}
```

### 2. Credentials Schema Change

Mỗi company trong localStorage từ:
```json
{ "tenantId": "abc-123", "clientId": "xyz", "clientSecret": "secret" }
```
Thành:
```json
{ 
  "tenantId_enc": "base64...",
  "clientId_enc": "base64...", 
  "clientSecret_enc": "base64...",
  "credentials_salt_version": 1
}
```

Fields `tenantId`, `clientId`, `clientSecret` không còn tồn tại plain text.

### 3. Re-auth Modal (`frontend/src/components/CredentialReauthModal.jsx`)

```jsx
// Hiển thị khi admin click vào tab Companies trong Settings
// Props: onSuccess(password), onCancel
export default function CredentialReauthModal({ onSuccess, onCancel }) { ... }
```

Flow trong `Settings.jsx`:
```js
const [credAuthState, setCredAuthState] = useState('locked'); // locked | unlocked
const [credPassword, setCredPassword] = useState(null); // giữ trong memory, không lưu

// Khi user click tab 'companies':
if (credAuthState === 'locked') {
  setShowReauthModal(true); // block tab cho đến khi re-auth thành công
}

// Sau 5 phút không hoạt động → auto-lock lại
```

### 4. Settings.jsx — Credential Fields

Khi hiển thị credentials đã decrypt:
- `clientSecret` luôn masked `••••••••`, chỉ show khi click eye icon
- Sau khi edit và Save → re-encrypt ngay lập tức
- Khi unmount/tab-change → clear decrypted values khỏi state

### 5. Migration: Plain → Encrypted

Khi app load, check nếu có `tenantId` plain text trong localStorage:
```js
// App.jsx useEffect — one-time migration
companies.forEach(company => {
  if (company.tenantId && !company.tenantId_enc) {
    // Prompt admin password để encrypt existing data
    setShowMigrationModal(true);
  }
});
```

## Files To Create/Modify

| File | Action |
|------|--------|
| `frontend/src/utils/crypto-utils.js` | CREATE — AES encrypt/decrypt helpers |
| `frontend/src/components/CredentialReauthModal.jsx` | CREATE — Re-auth modal UI |
| `frontend/src/components/Settings.jsx` | MODIFY — tích hợp re-auth + encrypt/decrypt |
| `frontend/src/App.jsx` | MODIFY — migration logic + data schema |

## Security Considerations

- **Key không lưu** — AES key chỉ tồn tại in-memory, mất khi page reload
- **Password không lưu** — Admin phải re-auth mỗi session (hoặc sau timeout)
- **clientSecret masked** — Không hiển thị plain text trừ khi user yêu cầu
- **⚠️ [RED TEAM F1] Giới hạn quan trọng**: Phase 02 là hardening TẠM THỜI. Admin password verifier PHẢI dùng PBKDF2-derived verification tag (giống key derivation), KHÔNG dùng plain MD5/SHA-1 hash. Plain hash bị crack offline trong giây → AES key bypass trivially. Nếu không đủ điều kiện implement verifier mạnh, KHÔNG ship Phase 02 độc lập — deploy cùng Phase 03.
- **⚠️ [RED TEAM F2] React DevTools exposure**: `credPassword` trong React state visible qua React DevTools. Phase 02 chống accidental exposure, KHÔNG chống active attacker với physical browser access. Ghi rõ assumption này cho user.

## Admin Password Verifier (KHÔNG dùng simple hash)

```js
// Thay vì: localStorage.setItem('adminPasswordHash', sha1(password))
// Dùng: lưu PBKDF2-derived tag làm verifier
async function createPasswordVerifier(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt); // dùng lại hàm deriveKey đã có
  // Encrypt một known plaintext để verify
  const verifierTag = await encryptString('VERIFY_OK', password);
  return { verifierTag, salt: btoa(String.fromCharCode(...salt)) };
}

async function verifyAdminPassword(password, storedVerifier) {
  try {
    const result = await decryptString(storedVerifier.verifierTag, password);
    return result === 'VERIFY_OK';
  } catch {
    return false; // DOMException = wrong password
  }
}
```

## Todo

- [ ] Tạo `frontend/src/utils/crypto-utils.js` với encryptString/decryptString
- [ ] Tạo `CredentialReauthModal.jsx`
- [ ] Sửa Settings.jsx: thêm re-auth gate cho tab Companies
- [ ] Sửa Settings.jsx: encrypt khi save, decrypt khi hiển thị  
- [ ] Sửa Settings.jsx: auto-lock sau 5 phút
- [ ] Sửa App.jsx: migration từ plain text sang encrypted
- [ ] Sửa App.jsx: data schema companies không còn plain tenantId/clientId/clientSecret
- [ ] Test: encrypt → reload page → re-auth → decrypt thành công
- [ ] Test: sai password → không decrypt được (DOMException)

## Success Criteria

- localStorage không còn tenantId/clientId/clientSecret plain text
- Admin phải nhập mật khẩu trước khi thấy credentials
- clientSecret luôn masked trong UI
- Sau 5 phút → auto-lock
